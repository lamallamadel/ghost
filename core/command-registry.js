/**
 * CommandRegistry (v1)
 *
 * Goal: remove CLI "if/else matrix" and route via a deterministic registry built from extension manifests.
 *
 * Supported invocation forms:
 *  - Namespaced (recommended):   ghost policy:list
 *  - Two-word namespace sugar:  ghost policy list        -> policy:list
 *  - Legacy flat alias:         ghost list               -> resolved only if unambiguous (otherwise error)
 *
 * Manifest formats supported:
 *  - manifest.commands as Array<string>   (legacy): ["commit","add","list",...]
 *  - manifest.commands as Array<object>   (v1): [{ id, method, aliases, priority, help }, ...]
 *
 * Determinism / tie-break:
 *  1) Optional repo lock file: extensions.lock.json (or config/extensions.lock.json) can pin owners via commandOwners.
 *  2) Higher command.priority wins (default 0).
 *  3) Stable fallback: lexicographic by extensionId.
 */

const fs = require('fs');
const path = require('path');

class CommandRegistryError extends Error {
  constructor(code, message, data) {
    super(message);
    this.name = 'CommandRegistryError';
    this.code = code;
    this.data = data || {};
  }
}

class CommandRegistry {
  /**
   * @param {object} opts
   * @param {object} opts.gateway - instance of core/gateway
   * @param {string} [opts.repoRoot] - repo root path (default: process.cwd())
   */
  constructor({ gateway, repoRoot }) {
    if (!gateway) throw new Error('CommandRegistry requires { gateway }');
    this.gateway = gateway;
    this.repoRoot = repoRoot || process.cwd();

    /** canonicalId -> entry */
    this.byId = new Map();
    /** token/alias -> entries[] */
    this.byAlias = new Map();

    this.lock = this._loadLock();
  }

  _loadLock() {
    const candidates = [
      path.join(this.repoRoot, 'extensions.lock.json'),
      path.join(this.repoRoot, 'config', 'extensions.lock.json'),
    ];
    for (const p of candidates) {
      try {
        if (!fs.existsSync(p)) continue;
        const raw = fs.readFileSync(p, 'utf8');
        const obj = JSON.parse(raw);
        if (obj && typeof obj === 'object') return obj;
      } catch {
        // ignore invalid lock
      }
    }
    return null;
  }

  /**
   * Build registry from gateway manifests (metadata-only; no extension execution).
   */
  build() {
    this.byId.clear();
    this.byAlias.clear();

    const exts = this.gateway.listExtensions();
    for (const ext of exts) {
      const full = this.gateway.getExtension(ext.id);
      if (!full || !full.manifest) continue;
      this._ingestManifest(full.manifest, ext.id);
    }
    return this;
  }

  _ingestManifest(manifest, extensionId) {
    const cmds = manifest.commands;
    if (!cmds) return;
    const namespace = this._deriveNamespace(extensionId);

    // Legacy: commands: ["commit","add",...]
    if (Array.isArray(cmds) && cmds.length > 0 && typeof cmds[0] === 'string') {
      for (const c of cmds) {
        if (!c || typeof c !== 'string') continue;
        this._register({
          id: namespace ? `${namespace}:${c}` : c,
          method: c,
          aliases: [],
          priority: 0,
          help: null,
          extensionId,
          source: 'legacy',
        });
      }
      return;
    }

    // v1: commands: [{ id, method, aliases, priority, help }]
    if (Array.isArray(cmds) && cmds.length > 0 && typeof cmds[0] === 'object') {
      for (const c of cmds) {
        if (!c || typeof c !== 'object') continue;
        const id = String(c.id || '').trim();
        const method = String(c.method || c.id || '').trim();
        if (!id || !method) continue;

        const aliases = Array.isArray(c.aliases) ? c.aliases.map(String) : [];
        const priority = Number.isFinite(c.priority) ? c.priority : 0;
        const help = c.help ? String(c.help) : null;

        this._register({
          id,
          method,
          aliases,
          priority,
          help,
          extensionId,
          source: 'v1',
        });
      }
    }
  }

  _deriveNamespace(extensionId) {
    const raw = String(extensionId || '').trim();
    if (!raw) return null;

    return raw
      .replace(/^ghost-/, '')
      .replace(/-extension$/, '');
  }

  _register(entry) {
    const canonical = entry.id;
    const existing = this.byId.get(canonical);

    if (!existing) {
      this.byId.set(canonical, entry);
    } else {
      const winner = this._pickWinner([existing, entry]);
      const loser = winner === existing ? entry : existing;
      this.byId.set(canonical, winner);
      // Keep loser discoverable for ambiguity reporting
      this._addAlias(canonical, loser);
    }

    // Add canonical and aliases
    this._addAlias(canonical, entry);

    // If namespaced, allow "ns cmd" and tokens
    if (canonical.includes(':')) {
      const [ns, cmd] = canonical.split(':', 2);
      this._addAlias(`${ns} ${cmd}`, entry);
      this._addAlias(ns, entry);
      this._addAlias(cmd, entry);
    }

    if (entry.aliases && entry.aliases.length) {
      for (const a of entry.aliases) {
        const tok = String(a || '').trim();
        if (!tok) continue;
        this._addAlias(tok, entry);
      }
    }
  }

  _addAlias(token, entry) {
    const key = String(token).trim();
    if (!key) return;
    const list = this.byAlias.get(key) || [];
    list.push(entry);
    this.byAlias.set(key, list);
  }

  _pickWinner(entries) {
    const commandOwners =
      this.lock && this.lock.commandOwners && typeof this.lock.commandOwners === 'object'
        ? this.lock.commandOwners
        : null;

    if (commandOwners) {
      const canonical = entries[0].id;
      const pinned = commandOwners[canonical];
      if (pinned) {
        const hit = entries.find((e) => e.extensionId === pinned);
        if (hit) return hit;
      }
    }

    // Highest priority wins, then stable by extensionId
    const sorted = [...entries].sort((a, b) => {
      if ((b.priority || 0) !== (a.priority || 0)) return (b.priority || 0) - (a.priority || 0);
      return String(a.extensionId).localeCompare(String(b.extensionId));
    });
    return sorted[0];
  }

  /**
   * Resolve parsed args into { extensionId, method, params, canonicalCommandId }
   * @param {object} parsedArgs - from GatewayLauncher.parseArgs()
   */
  resolve(parsedArgs) {
    const cmd = parsedArgs.command ? String(parsedArgs.command) : '';
    const sub = parsedArgs.subcommand ? String(parsedArgs.subcommand) : '';

    // 1) Namespaced: "policy:list"
    if (cmd.includes(':')) {
      return this._resolveByToken(cmd, parsedArgs, cmd);
    }

    // 2) Two-word namespace sugar: "policy list" -> "policy:list"
    if (cmd && sub) {
      const compound = `${cmd} ${sub}`.trim();
      const entries = this.byAlias.get(compound) || [];
      if (entries.length > 0) {
        const chosen = this._chooseUnambiguous(entries, compound, null);
        return this._finalize(chosen, parsedArgs, chosen.id);
      }

      const canonical = `${cmd}:${sub}`;
      if (this.byId.has(canonical) || (this.byAlias.get(canonical) || []).length > 0) {
        return this._resolveByToken(canonical, parsedArgs, canonical);
      }
      // else continue to flat token
    }

    // 3) Flat: "list"
    if (cmd) {
      return this._resolveByToken(cmd, parsedArgs, null);
    }

    throw new CommandRegistryError('NO_COMMAND', 'No command provided', {});
  }

  _resolveByToken(token, parsedArgs, canonicalHint) {
    const entries = this.byAlias.get(token) || [];
    if (entries.length === 0) {
      throw new CommandRegistryError('UNKNOWN_COMMAND', `Unknown command: ${token}`, {
        token,
        known: this.listCommandIds().slice(0, 50),
      });
    }
    const chosen = this._chooseUnambiguous(entries, token, canonicalHint);
    return this._finalize(chosen, parsedArgs, chosen.id);
  }

  _chooseUnambiguous(entries, token, canonicalHint) {
    if (canonicalHint && this.byId.has(canonicalHint)) {
      return this.byId.get(canonicalHint);
    }

    // de-dup by (id, extensionId)
    const uniq = [];
    const seen = new Set();
    for (const e of entries) {
      const k = `${e.id}@@${e.extensionId}`;
      if (seen.has(k)) continue;
      seen.add(k);
      uniq.push(e);
    }

    const uniqueExts = new Set(uniq.map((e) => e.extensionId));
    if (uniqueExts.size === 1) return uniq[0];

    if (this.byId.has(token)) return this.byId.get(token);

    const candidates = uniq
      .sort((a, b) => String(a.extensionId).localeCompare(String(b.extensionId)))
      .map((e) => ({
        id: e.id,
        extensionId: e.extensionId,
        method: e.method,
        priority: e.priority || 0,
      }));

    throw new CommandRegistryError(
      'AMBIGUOUS_COMMAND',
      `Ambiguous command '${token}'. Use '<namespace>:<command>' or '<namespace> <command>'.`,
      { token, candidates }
    );
  }

  _finalize(entry, parsedArgs, canonicalCommandId) {
    const params = {
      subcommand: parsedArgs.subcommand || null,
      args: parsedArgs.args || [],
      flags: parsedArgs.flags || {},
      canonicalCommandId,
    };
    return {
      canonicalCommandId,
      extensionId: entry.extensionId,
      method: entry.method,
      params,
      help: entry.help || null,
      priority: entry.priority || 0,
      source: entry.source,
    };
  }

  listCommandIds() {
    return Array.from(this.byId.keys()).sort();
  }
}

module.exports = { CommandRegistry, CommandRegistryError };
