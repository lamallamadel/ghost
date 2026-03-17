#!/usr/bin/env node

/**
 * Ghost CLI Extension — Interactive Shell
 * The Beautiful Monster: a full-featured terminal UX for the Ghost gateway.
 *
 * IO-to-Boundary compliant: all filesystem ops go through the SDK.
 * Terminal interaction (readline, process.stdout) is the UI layer — exempt.
 */

const readline = require('readline');
const os = require('os');
const path = require('path');

function loadExtensionSdk() {
    try {
        return require('@ghost/extension-sdk');
    } catch (error) {
        return require('../../packages/extension-sdk');
    }
}

const { ExtensionSDK, ExtensionRunner } = loadExtensionSdk();

// ─── Paths (string ops only — no fs) ─────────────────────────────────────────
const HISTORY_PATH = path.join(os.homedir(), '.ghost', 'cli-history.json');
const CONFIG_PATH  = path.join(os.homedir(), '.ghost', 'config', 'ghostrc.json');
const MODELS_DIR   = path.join(os.homedir(), '.ghost', 'models');
const MAX_HISTORY  = 200;

// ─── ANSI Color Palette ───────────────────────────────────────────────────────
const C = {
    GHOST:      '\x1b[38;5;141m',
    GREEN:      '\x1b[38;5;120m',
    BLUE:       '\x1b[38;5;117m',
    YELLOW:     '\x1b[38;5;220m',
    RED:        '\x1b[38;5;203m',
    CYAN:       '\x1b[38;5;87m',
    MAGENTA:    '\x1b[38;5;213m',
    DIM:        '\x1b[2m',
    BOLD:       '\x1b[1m',
    UNDERLINE:  '\x1b[4m',
    RESET:      '\x1b[0m',
    BG_DARK:    '\x1b[48;5;236m',
};

// ─── Spinner ──────────────────────────────────────────────────────────────────
class Spinner {
    constructor() {
        this._frames = ['⠋','⠙','⠹','⠸','⠼','⠴','⠦','⠧','⠇','⠏'];
        this._timer  = null;
        this._i      = 0;
    }

    start(msg = '') {
        if (!process.stdout.isTTY) return;
        this._i = 0;
        this._timer = setInterval(() => {
            process.stdout.write(`\r${C.GHOST}${this._frames[this._i++ % this._frames.length]}${C.RESET} ${C.DIM}${msg}${C.RESET}  `);
        }, 80);
    }

    stop(finalMsg = '') {
        if (this._timer) {
            clearInterval(this._timer);
            this._timer = null;
            process.stdout.write(`\r${' '.repeat(finalMsg.length + 4)}\r`);
            if (finalMsg) process.stdout.write(`${finalMsg}\n`);
        }
    }
}

// ─── Output Formatter ─────────────────────────────────────────────────────────
const Fmt = {
    width() { return process.stdout.columns || 80; },

    banner(title, subtitle = '') {
        const w = this.width();
        const line = '─'.repeat(w);
        let out = `\n${C.GHOST}${line}${C.RESET}\n`;
        out += `${C.GHOST}${C.BOLD}  👻  ${title}${C.RESET}\n`;
        if (subtitle) out += `${C.DIM}     ${subtitle}${C.RESET}\n`;
        out += `${C.GHOST}${line}${C.RESET}\n`;
        return out;
    },

    box(title, lines, color = C.BLUE) {
        const w = Math.min(this.width() - 2, 78);
        const inner = w - 4;
        const top    = `${color}┌─ ${C.BOLD}${title}${C.RESET}${color} ${'─'.repeat(Math.max(0, inner - title.length - 1))}┐${C.RESET}`;
        const bottom = `${color}└${'─'.repeat(w - 2)}┘${C.RESET}`;
        const body = lines.map(l => {
            const visible = l.replace(/\x1b\[[0-9;]*m/g, '');
            const pad = Math.max(0, inner - visible.length);
            return `${color}│${C.RESET}  ${l}${' '.repeat(pad)} ${color}│${C.RESET}`;
        });
        return [top, ...body, bottom].join('\n');
    },

    table(headers, rows, colors = []) {
        const cols = headers.map((h, i) => {
            const maxData = Math.max(...rows.map(r => String(r[i] ?? '').replace(/\x1b\[[0-9;]*m/g, '').length));
            return Math.max(h.length, maxData);
        });
        const sep = `${C.DIM}${'─'.repeat(cols.reduce((a, c) => a + c + 3, 1))}${C.RESET}`;
        const hdr = headers.map((h, i) => `${C.BOLD}${h.padEnd(cols[i])}${C.RESET}`).join(`  ${C.DIM}│${C.RESET}  `);
        const body = rows.map((r, ri) => {
            const rowC = colors[ri] || C.RESET;
            return r.map((cell, i) => {
                const visible = String(cell ?? '').replace(/\x1b\[[0-9;]*m/g, '');
                const pad = cols[i] - visible.length;
                return `${rowC}${cell}${C.RESET}${' '.repeat(Math.max(0, pad))}`;
            }).join(`  ${C.DIM}│${C.RESET}  `);
        });
        return [`  ${hdr}`, `  ${sep}`, ...body.map(r => `  ${r}`)].join('\n');
    },

    section(title, content) {
        return `\n${C.CYAN}${C.BOLD}▸ ${title}${C.RESET}\n${content}\n`;
    },

    success(msg) { return `${C.GREEN}✓${C.RESET}  ${msg}`; },
    error(msg)   { return `${C.RED}✗${C.RESET}  ${msg}`; },
    warn(msg)    { return `${C.YELLOW}⚠${C.RESET}  ${msg}`; },
    info(msg)    { return `${C.BLUE}ℹ${C.RESET}  ${msg}`; },
};

// ─── History Manager (SDK-backed) ─────────────────────────────────────────────
class HistoryManager {
    constructor(sdk) {
        this.sdk = sdk;
        this.entries = [];
        this.loaded  = false;
    }

    async load() {
        if (this.loaded) return;
        try {
            const exists = await this.sdk.requestFileExists(HISTORY_PATH);
            if (exists) {
                const data = await this.sdk.requestFileReadJSON(HISTORY_PATH);
                this.entries = Array.isArray(data.entries) ? data.entries : [];
            }
        } catch (_) {}
        this.loaded = true;
    }

    async push(line) {
        if (!line || line === this.entries[this.entries.length - 1]) return;
        this.entries.push(line);
        if (this.entries.length > MAX_HISTORY) this.entries = this.entries.slice(-MAX_HISTORY);
        try {
            await this.sdk.requestFileWriteJSON(HISTORY_PATH, {
                version: 1,
                updated: new Date().toISOString(),
                entries: this.entries
            });
        } catch (_) {}
    }

    last(n = 20) { return this.entries.slice(-n); }
    all()        { return [...this.entries]; }
}

// ─── Context Provider (SDK-backed git) ────────────────────────────────────────
class ContextProvider {
    constructor(sdk) {
        this.sdk    = sdk;
        this.branch = null;
        this.extCount = 0;
    }

    async refresh() {
        try {
            this.branch = (await this.sdk.requestGitCurrentBranch()).trim();
        } catch (_) { this.branch = null; }
    }

    setExtCount(n) { this.extCount = n; }

    prompt() {
        const parts = [];
        if (this.branch) parts.push(`${C.DIM}[${C.GREEN}${this.branch}${C.RESET}${C.DIM}]${C.RESET}`);
        const count = this.extCount > 0 ? `${C.DIM}(${this.extCount})${C.RESET}` : '';
        return `${parts.join(' ')}${parts.length ? ' ' : ''}${C.GHOST}${C.BOLD}👻 ghost${C.RESET}${count}${C.GHOST}>${C.RESET} `;
    }
}

// ─── Command Catalog ──────────────────────────────────────────────────────────
const CATALOG = {
    git: {
        icon: '🌿', description: 'AI-powered Git workflow assistant',
        extId: 'ghost-git-extension',
        sub: {
            commit:  { d: 'AI commit message + security audit', hint: '[--provider <groq|openai|anthropic>] [--skip-audit]' },
            add:     { d: 'Stage files for commit',             hint: '[files...]' },
            audit:   { d: 'Audit staged changes for issues',    hint: '' },
            merge:   { d: 'Intelligent conflict resolution',    hint: '[status|--accept-ours|--accept-theirs]' },
            history: { d: 'AI analysis of commit history',      hint: '' },
            version: { d: 'Semantic version management',        hint: '' },
        }
    },
    security: {
        icon: '🔒', description: 'Security scanning & NIST compliance',
        extId: 'ghost-security-extension',
        sub: {
            scan:       { d: 'Scan for secrets, API keys, vulnerabilities', hint: '[path]' },
            audit:      { d: 'AI-validated deep security audit',            hint: '[--ai] [--provider <name>]' },
            status:     { d: 'Current security posture summary',            hint: '' },
            compliance: { d: 'NIST SP 800-53 compliance report',            hint: '' },
        }
    },
    policy: {
        icon: '📋', description: 'Governance and compatibility matrix',
        extId: 'ghost-policy-extension',
        sub: {
            list:         { d: 'List active governance policies',      hint: '' },
            set:          { d: 'Update a policy rule',                 hint: '<rule> <value>' },
            verify:       { d: 'Verify environment compliance',        hint: '' },
            compatStatus: { d: 'Extension compatibility matrix',       hint: '' },
            compatExport: { d: 'Export matrix to docs/',               hint: '' },
            compatCheck:  { d: 'CI compatibility enforcement check',   hint: '' },
        }
    },
    process: {
        icon: '⚙️ ', description: 'Background service supervisor',
        extId: 'ghost-process-extension',
        sub: {
            list:    { d: 'List all managed services',    hint: '' },
            status:  { d: 'Status of a specific service', hint: '<service>' },
            start:   { d: 'Start a background service',   hint: '<service>' },
            stop:    { d: 'Stop a running service',       hint: '<service>' },
            restart: { d: 'Restart a service',            hint: '<service>' },
        }
    },
    sys: {
        icon: '🖥️ ', description: 'System diagnostics and maintenance',
        extId: 'ghost-system-extension',
        sub: {
            status:   { d: 'System health overview',         hint: '' },
            logs:     { d: 'View audit log entries',         hint: '[info|warn|error]' },
            sanitize: { d: 'Clean up temp files',            hint: '' },
            doctor:   { d: 'Full health check',              hint: '' },
        }
    },
    docs: {
        icon: '📚', description: 'AI documentation generation',
        extId: 'ghost-docs-extension',
        sub: {
            initialize: { d: 'Bootstrap project documentation', hint: '' },
            generate:   { d: 'AI-generate README and API docs', hint: '' },
            diagram:    { d: 'Generate architecture diagrams',  hint: '' },
            chat:       { d: 'Chat with your codebase',        hint: '' },
        }
    },
    agent: {
        icon: '🤖', description: 'Autonomous AI agent with cognitive loop',
        extId: 'ghost-agent-extension',
        sub: {
            solve: { d: 'Solve a complex engineering goal', hint: '<goal description>' },
            think: { d: 'Analyze current mission state',   hint: '' },
            plan:  { d: 'Decompose goal into task plan',   hint: '' },
        }
    },
    ai: {
        icon: '🧠', description: 'AI provider management',
        extId: 'ghost-ai-extension',
        sub: {
            status:  { d: 'Current provider and model',    hint: '' },
            models:  { d: 'List all available models',     hint: '' },
            switch:  { d: 'Switch AI provider',            hint: '<groq|anthropic|openai|gemini> [--model <name>]' },
            usage:   { d: 'Token usage analytics',         hint: '' },
        }
    },
    desktop: {
        icon: '🖥️ ', description: 'Ghost telemetry monitoring console',
        extId: 'ghost-desktop-extension',
        sub: {
            console: { d: 'Launch the telemetry web console', hint: '[--port <9876>] [--no-ui]' },
        }
    },
};

// ─── Flag & Argument Parser ───────────────────────────────────────────────────
function parseArgs(tokens) {
    const flags = {};
    const args  = [];
    let i = 0;
    while (i < tokens.length) {
        if (tokens[i].startsWith('--')) {
            const key = tokens[i].slice(2);
            if (i + 1 < tokens.length && !tokens[i + 1].startsWith('--')) {
                flags[key] = tokens[i + 1];
                i += 2;
            } else {
                flags[key] = true;
                i++;
            }
        } else {
            args.push(tokens[i]);
            i++;
        }
    }
    return { args, flags };
}

// ─── Command Palette (fuzzy dropdown) ────────────────────────────────────────
class CommandPalette {
    constructor() {
        this.items      = [];
        this.filtered   = [];
        this.selected   = 0;
        this.lines      = 0;
        this._buildItems();
    }

    _buildItems() {
        // Built-ins first
        this.items = [
            { slash: 'help',    desc: 'Show all commands',                  hint: '[filter]',  builtin: true },
            { slash: 'status',  desc: 'Extension health grid',              hint: '',          builtin: true },
            { slash: 'history', desc: 'Show command history',               hint: '[n]',       builtin: true },
            { slash: 'clear',   desc: 'Clear terminal',                     hint: '',          builtin: true },
            { slash: 'exit',    desc: 'Exit Ghost Shell',                   hint: '',          builtin: true },
        ];
        for (const [cmd, def] of Object.entries(CATALOG)) {
            this.items.push({ slash: cmd, desc: def.description, icon: def.icon, catalog: def });
            for (const [sub, sdef] of Object.entries(def.sub)) {
                this.items.push({ slash: `${cmd} ${sub}`, desc: sdef.d, hint: sdef.hint, parent: cmd });
            }
        }
    }

    _fuzzy(query, str) {
        if (!query) return true;
        let qi = 0;
        for (let i = 0; i < str.length && qi < query.length; i++) {
            if (str[i].toLowerCase() === query[qi].toLowerCase()) qi++;
        }
        return qi === query.length;
    }

    update(input) {
        // input is after the leading '/'
        const parts  = input.split(' ');
        const query  = parts[0].toLowerCase();
        const hasArg = parts.length > 1;

        if (hasArg) {
            // Showing argument hints for a selected top-level command
            const topCmd  = CATALOG[query];
            if (topCmd) {
                const subQuery = parts[1].toLowerCase();
                this.filtered = Object.entries(topCmd.sub)
                    .filter(([sub]) => sub.toLowerCase().includes(subQuery))
                    .map(([sub, sdef]) => ({
                        slash: `${query} ${sub}`,
                        desc:  sdef.d,
                        hint:  sdef.hint
                    }));
                if (this.selected >= this.filtered.length)
                    this.selected = Math.max(0, this.filtered.length - 1);
                this._render(input);
                return;
            }
            this.clear();
            return;
        }

        this.filtered = this.items.filter(item =>
            !item.parent && this._fuzzy(query, item.slash)
        );
        if (this.selected >= this.filtered.length)
            this.selected = Math.max(0, this.filtered.length - 1);
        this._render(input);
    }

    _render(input) {
        if (!process.stdout.isTTY) return;
        const LIMIT = 7;
        const start = Math.max(0, this.selected - Math.floor(LIMIT / 2));
        const end   = Math.min(this.filtered.length, start + LIMIT);
        let out     = '\n';

        if (this.filtered.length === 0) {
            out += `  ${C.DIM}No commands match — try natural language${C.RESET}\n`;
            this.lines = 2;
        } else {
            for (let i = start; i < end; i++) {
                const item = this.filtered[i];
                const icon = item.icon ? `${item.icon} ` : '   ';
                const hint = item.hint ? `${C.DIM} ${item.hint}${C.RESET}` : '';
                if (i === this.selected) {
                    out += `  ${C.GREEN}❯${C.RESET} ${C.BOLD}/${item.slash}${C.RESET}${hint}`;
                    out += `\n    ${C.DIM}${icon}${item.desc}${C.RESET}\n`;
                } else {
                    out += `    ${C.DIM}/${item.slash}${C.RESET}${C.DIM} — ${item.desc}${C.RESET}\n`;
                }
            }
            if (end < this.filtered.length) {
                out += `    ${C.DIM}… ${this.filtered.length - end} more${C.RESET}\n`;
            }
            this.lines = (end - start) * 2 + 2;
        }

        process.stdout.write(`\x1b7\x1b[J${out}\x1b8`);
    }

    clear() {
        if (this.lines > 0 && process.stdout.isTTY) {
            process.stdout.write('\x1b7\x1b[J\x1b8');
            this.lines = 0;
        }
        this.selected = 0;
    }

    moveUp()   { this.selected = Math.max(0, this.selected - 1); }
    moveDown() { this.selected = Math.min(Math.max(0, this.filtered.length - 1), this.selected + 1); }

    complete() {
        if (this.filtered.length === 0) return null;
        return '/' + this.filtered[this.selected].slash + ' ';
    }
}

// ─── Semantic Router ──────────────────────────────────────────────────────────
class SemanticRouter {
    constructor() {
        this.embedder       = null;
        this.catalogVecs    = null;
        this.catalogEntries = null;
        this.dim            = 384;
    }

    async init(catalog) {
        try {
            const { pipeline } = await import('@xenova/transformers');
            this.embedder = await pipeline(
                'feature-extraction', 'Xenova/all-MiniLM-L6-v2',
                { cache_dir: MODELS_DIR, quantized: true }
            );
            this.catalogEntries = [];
            for (const [cmd, def] of Object.entries(catalog)) {
                for (const [sub, sdef] of Object.entries(def.sub)) {
                    this.catalogEntries.push({ cmd, sub, text: `${cmd} ${sub}: ${sdef.d}` });
                }
            }
            const out = await this.embedder(
                this.catalogEntries.map(e => e.text),
                { pooling: 'mean', normalize: true }
            );
            this.catalogVecs = out.data;   // Float32Array [N × dim]
            this.dim         = out.dims[1];
            return true;
        } catch { return false; }
    }

    async classify(input, branch = null) {
        if (!this.embedder) return null;
        try {
            const query = branch ? `[branch: ${branch}] ${input}` : input;
            const out   = await this.embedder([query], { pooling: 'mean', normalize: true });
            const q     = out.data;
            const N     = this.catalogEntries.length;
            let best = -1, idx = 0;
            for (let i = 0; i < N; i++) {
                let dot = 0;
                for (let j = 0; j < this.dim; j++) dot += q[j] * this.catalogVecs[i * this.dim + j];
                if (dot > best) { best = dot; idx = i; }
            }
            return best >= 0.5 ? { ...this.catalogEntries[idx], confidence: best } : null;
        } catch { return null; }
    }
}

// ─── Ghost Shell ──────────────────────────────────────────────────────────────
class GhostShell {
    constructor(sdk) {
        this.sdk      = sdk;
        this.history  = new HistoryManager(sdk);
        this.context  = new ContextProvider(sdk);
        this.palette  = new CommandPalette();
        this.spinner  = new Spinner();
        this.rl       = null;
        this._registry = [];
        this.semanticRouter = null;
    }

    async init() {
        await this.history.load();
        await this.context.refresh().catch(() => {});
        try {
            const rc = await this.sdk.requestFileReadJSON(CONFIG_PATH);
            if (rc?.nlRouter?.mode === 'semantic') await this._initSemanticRouter();
        } catch {}
        return { success: true };
    }

    async _initSemanticRouter() {
        this.spinner.start('Loading semantic router…');
        const router = new SemanticRouter();
        const ok     = await router.init(CATALOG);
        this.spinner.stop();
        if (ok) {
            this.semanticRouter = router;
        } else {
            console.log(Fmt.warn('Semantic router unavailable — using keyword routing'));
        }
    }

    // ── Registry ──
    async _fetchRegistry() {
        try {
            this._registry = await this.sdk.emitIntent({ type: 'system', operation: 'registry', params: {} }) || [];
            this.context.setExtCount(this._registry.length);
        } catch (_) { this._registry = []; }
        return this._registry;
    }

    // ── Startup banner ──
    _printBanner() {
        const w = process.stdout.columns || 80;
        console.log(`\n${C.GHOST}${'═'.repeat(w)}${C.RESET}`);
        console.log(`${C.GHOST}${C.BOLD}   👻  Ghost Sovereign CLI  ${C.DIM}v2.0.0 — Interactive Shell${C.RESET}`);
        console.log(`${C.DIM}   Zero-Trust Gateway  •  IO-to-Boundary Enforced  •  AI-Powered${C.RESET}`);
        console.log(`${C.GHOST}${'═'.repeat(w)}${C.RESET}`);
        console.log(`\n${C.DIM}  Type ${C.RESET}${C.BOLD}/${C.RESET}${C.DIM} to open the command palette`);
        console.log(`  Type ${C.RESET}${C.BOLD}/help${C.RESET}${C.DIM} for all commands  •  ${C.RESET}${C.BOLD}Ctrl+C${C.RESET}${C.DIM} to exit${C.RESET}\n`);
    }

    // ── Start interactive loop ──
    async start() {
        this._printBanner();
        this._fetchRegistry().catch(() => {});

        if (process.stdin.isTTY) {
            readline.emitKeypressEvents(process.stdin);
            process.stdin.setRawMode(true);
        }

        this.rl = readline.createInterface({
            input:     process.stdin,
            output:    process.stdout,
            prompt:    this.context.prompt(),
            completer: () => [[], this.rl ? this.rl.line : ''],
        });

        this._installKeypressHandler();
        this.rl.prompt();

        this.rl.on('line', async (line) => {
            const input = line.trim();
            this.palette.clear();
            await this.history.push(input);

            if (!input) { this.rl.prompt(); return; }

            if (input === '/clear' || input === '/c') {
                process.stdout.write('\x1b[2J\x1b[H');
                this._printBanner();
                this.rl.prompt();
                return;
            }
            if (input === '/exit' || input === '/quit') {
                this.rl.close();
                return;
            }

            if (input.startsWith('/')) {
                await this._handleSlash(input.slice(1));
            } else {
                await this._handleNL(input);
            }

            // Refresh prompt context after each command
            await this.context.refresh().catch(() => {});
            this.rl.setPrompt(this.context.prompt());
            this.rl.prompt();
        });

        return new Promise(resolve => {
            this.rl.on('close', () => {
                this.palette.clear();
                console.log(`\n${C.DIM}Ghost Shell closed. Until next time! 👻${C.RESET}\n`);
                resolve({ success: true, output: '' });
                setTimeout(() => process.exit(0), 80);
            });
        });
    }

    _installKeypressHandler() {
        // Intercept readline's key processing directly so we can suppress keys
        // without leaking raw escape sequences into the line buffer.
        // (prependListener + key.name='null' doesn't stop readline from calling
        // _insertString(key.sequence), which pollutes the buffer with \x1b[A etc.)
        if (typeof this.rl._ttyWrite !== 'function') return;

        const origTtyWrite = this.rl._ttyWrite.bind(this.rl);

        this.rl._ttyWrite = (s, key) => {
            key = key || {};

            // Ctrl+L — clear screen
            if (key.ctrl && key.name === 'l') {
                process.stdout.write('\x1b[2J\x1b[H');
                this._printBanner();
                this.rl.prompt(true);
                return;
            }

            const line = this.rl.line || '';

            if (line.startsWith('/')) {
                if (key.name === 'up') {
                    this.palette.moveUp();
                    this.palette.update(line.slice(1));
                    return; // suppress — no history navigation
                }
                if (key.name === 'down') {
                    this.palette.moveDown();
                    this.palette.update(line.slice(1));
                    return; // suppress
                }
                if ((key.name === 'tab' || key.name === 'right') && !line.includes(' ')) {
                    const completion = this.palette.complete();
                    if (completion) {
                        this.rl.write(null, { ctrl: true, name: 'u' });
                        this.rl.write(completion);
                        this.palette.clear();
                    }
                    return; // suppress readline tab-completion
                }
                if (key.name === 'return' || key.name === 'enter') {
                    this.palette.clear();
                    origTtyWrite(s, key);
                    return;
                }
            }

            origTtyWrite(s, key);

            // After readline updates the line buffer, sync the palette
            setImmediate(() => {
                const current = this.rl.line || '';
                if (current.startsWith('/')) {
                    this.palette.update(current.slice(1));
                } else {
                    this.palette.clear();
                }
            });
        };
    }

    // ── Slash command routing ──
    async _handleSlash(raw) {
        const tokens  = raw.trim().split(/\s+/);
        const cmd     = tokens[0].toLowerCase();
        const rest    = tokens.slice(1);
        const { args, flags } = parseArgs(rest);
        const subcmd  = args[0] || null;
        const subArgs = args.slice(1);

        // Built-ins
        if (cmd === 'help' || cmd === '?') { await this._showHelp(subcmd); return; }
        if (cmd === 'status')              { await this._showStatus(); return; }
        if (cmd === 'history')             { this._showHistory(parseInt(subcmd) || 20); return; }

        // Catalog-routed extension commands
        const def = CATALOG[cmd];
        if (def) {
            const extId   = def.extId;
            const method  = subcmd ? `${cmd}.${subcmd}` : `${cmd}.list`;
            const params  = { subcommand: subcmd, args: subArgs, flags };

            this.spinner.start(`${def.icon || ''}  ${cmd}${subcmd ? ' ' + subcmd : ''}…`);
            try {
                const result = await this.sdk.emitIntent({
                    type: 'extension', operation: 'call',
                    params: { extensionId: extId, method, params }
                });
                this.spinner.stop();
                this._printResult(result);
            } catch (e) {
                this.spinner.stop();
                console.log(Fmt.error(`${cmd}: ${e.message}`));
            }
            return;
        }

        // Fallback: try registry lookup by short name
        await this._fetchRegistry();
        const ext = this._registry.find(e => {
            const short = e.id.replace('ghost-', '').replace('-extension', '');
            return short === cmd || e.id === cmd;
        });

        if (ext) {
            const method = subcmd ? `${cmd}.${subcmd}` : cmd;
            const params = { subcommand: subcmd, args: subArgs, flags };
            this.spinner.start(`${cmd}…`);
            try {
                const result = await this.sdk.emitIntent({
                    type: 'extension', operation: 'call',
                    params: { extensionId: ext.id, method, params }
                });
                this.spinner.stop();
                this._printResult(result);
            } catch (e) {
                this.spinner.stop();
                console.log(Fmt.error(`${e.message}`));
            }
            return;
        }

        console.log(Fmt.warn(`Unknown command: /${cmd}  — type /help to see all commands`));
    }

    // ── Natural language routing ──
    async _handleNL(input) {
        // Layer 1: Semantic router (if enabled and loaded)
        if (this.semanticRouter) {
            const match = await this.semanticRouter.classify(input, this.context.branch);
            if (match) {
                const pct = Math.round(match.confidence * 100);
                console.log(Fmt.info(`Routing to ${C.BOLD}/${match.cmd} ${match.sub}${C.RESET}${C.DIM} (confidence: ${pct}%) — or use /help for full control${C.RESET}`));
                await this._handleSlash(`${match.cmd} ${match.sub}`);
                return;
            }
        }

        // Layer 2: Keyword shortcuts
        const lower = input.toLowerCase();
        const shortcuts = [
            [['commit', 'push', 'git'], 'git', 'commit'],
            [['scan', 'secret', 'vuln', 'leak'], 'security', 'scan'],
            [['security', 'audit', 'owasp'], 'security', 'audit'],
            [['doc', 'readme', 'generate doc'], 'docs', 'generate'],
            [['policy', 'govern', 'compliance'], 'policy', 'list'],
            [['service', 'process', 'start', 'stop'], 'process', 'list'],
            [['system', 'health', 'doctor'], 'sys', 'doctor'],
            [['ai ', 'model', 'provider'], 'ai', 'status'],
        ];

        for (const [keywords, cmd, sub] of shortcuts) {
            if (keywords.some(kw => lower.includes(kw))) {
                console.log(Fmt.info(`Routing to ${C.BOLD}/${cmd} ${sub}${C.RESET}${C.DIM} — or use /help for full control${C.RESET}`));
                await this._handleSlash(`${cmd} ${sub}`);
                return;
            }
        }

        // Layer 3: Delegate to AI agent
        this.spinner.start('Thinking…');
        try {
            const result = await this.sdk.emitIntent({
                type: 'extension', operation: 'call',
                params: {
                    extensionId: 'ghost-agent-extension',
                    method: 'agent.solve',
                    params: { prompt: input }
                }
            });
            this.spinner.stop();
            this._printResult(result);
        } catch (err) {
            this.spinner.stop();
            const detail = err?.message ? `: ${err.message}` : '';
            console.log(Fmt.warn(`AI agent unavailable${detail} — type /help to browse commands`));
        }
    }

    // ── Output renderer ──
    _printResult(result) {
        if (!result) return;
        if (typeof result === 'string') { console.log(result); return; }
        if (result.output) { console.log(result.output); return; }
        if (result.result && typeof result.result === 'string') { console.log(result.result); return; }
        if (result.error || result.success === false) {
            console.log(Fmt.error(result.error?.message || result.output || 'Command failed'));
            return;
        }
        if (Object.keys(result).length > 0) console.log(JSON.stringify(result, null, 2));
    }

    // ── Built-in: /help ──
    async _showHelp(filter) {
        const flt = filter ? filter.toLowerCase() : null;
        let out = Fmt.banner('Ghost CLI Command Reference', 'Zero-Trust Orchestration Shell');
        out += `${C.DIM}Slash syntax:  ${C.RESET}${C.BOLD}/<command> [subcommand] [args] [--flags]${C.RESET}\n`;
        out += `${C.DIM}Natural lang:  ${C.RESET}Just type your goal in plain English\n`;
        out += `${C.DIM}Keyboard:      ${C.RESET}${C.BOLD}↑↓${C.RESET} navigate  ${C.BOLD}Tab${C.RESET} complete  ${C.BOLD}Ctrl+L${C.RESET} clear  ${C.BOLD}Ctrl+C${C.RESET} exit\n\n`;

        out += Fmt.section('Built-in Commands',
            [
                `  ${C.BOLD}/help${C.RESET} ${C.DIM}[filter]${C.RESET}       — This help screen`,
                `  ${C.BOLD}/status${C.RESET}               — Extension health grid`,
                `  ${C.BOLD}/history${C.RESET} ${C.DIM}[n]${C.RESET}         — Last n commands`,
                `  ${C.BOLD}/clear${C.RESET}  ${C.DIM}(Ctrl+L)${C.RESET}     — Clear terminal`,
                `  ${C.BOLD}/exit${C.RESET}                 — Exit shell`,
            ].join('\n')
        );

        for (const [cmd, def] of Object.entries(CATALOG)) {
            if (flt && !cmd.includes(flt) && !def.description.toLowerCase().includes(flt)) continue;
            const rows = Object.entries(def.sub).map(([sub, s]) => [
                `  ${C.BOLD}/${cmd} ${sub}${C.RESET}`,
                s.hint ? `${C.DIM}${s.hint}${C.RESET}` : '',
                `${C.DIM}${s.d}${C.RESET}`
            ]);
            out += Fmt.section(
                `${def.icon || ''} ${cmd}  ${C.DIM}— ${def.description}${C.RESET}`,
                Fmt.table(['Command', 'Arguments', 'Description'], rows)
            );
        }

        console.log(out);
    }

    // ── Built-in: /status ──
    async _showStatus() {
        this.spinner.start('Checking extension health…');
        const registry = await this._fetchRegistry();
        this.spinner.stop();

        if (registry.length === 0) {
            console.log(Fmt.warn('No extensions registered — is the gateway running?'));
            return;
        }

        const rows   = [];
        const colors = [];
        for (const ext of registry) {
            const short = ext.id.replace('ghost-', '').replace('-extension', '');
            const known = CATALOG[short];
            const online = true; // In-registry means loaded and live
            rows.push([
                online ? `${C.GREEN}●${C.RESET}` : `${C.RED}●${C.RESET}`,
                `${C.BOLD}${ext.id}${C.RESET}`,
                ext.version || '?',
                ext.description || (known ? known.description : ''),
            ]);
            colors.push(online ? C.RESET : C.DIM);
        }

        console.log('\n' + Fmt.box(
            `Extension Health  (${registry.length} active)`,
            [''],
            C.GHOST
        ));
        console.log(Fmt.table(['', 'Extension', 'Version', 'Description'], rows, colors));
        console.log('');
    }

    // ── Built-in: /history ──
    _showHistory(n) {
        const entries = this.history.last(n);
        if (entries.length === 0) {
            console.log(Fmt.info('No history yet.'));
            return;
        }
        console.log(Fmt.section(`Last ${entries.length} Commands`, ''));
        entries.forEach((e, i) => {
            const idx = String(entries.length - i).padStart(3, ' ');
            console.log(`  ${C.DIM}${idx}${C.RESET}  ${e}`);
        });
        console.log('');
    }
}

// ─── Extension Wrapper (gateway-compatible) ───────────────────────────────────
class ExtensionWrapper {
    constructor() {
        this.sdk   = new ExtensionSDK('ghost-cli-extension');
        this.shell = new GhostShell(this.sdk);
    }

    async init(options = {}) {
        if (options.coreHandler) this.sdk.setCoreHandler(options.coreHandler);
        return await this.shell.init();
    }

    async start(params = {}) {
        return await this.shell.start();
    }

    async handleRPCRequest(request) {
        const { method, params = {} } = request;
        if (method === 'invoke' || method === 'cli.start') {
            // Start the shell asynchronously and return immediately to acknowledge invoke
            this.shell.start().catch(err => {
                console.error('[Shell] failed to start:', err && err.message ? err.message : err);
            });
            return { success: true, output: 'Shell starting' };
        }
        return { error: { code: -32601, message: `Method not found: ${method}` } };
    }
}

if (require.main === module) {
    new ExtensionRunner(new ExtensionWrapper()).start();
}

module.exports = ExtensionWrapper;

// Expose internals for unit testing (not part of the public API)
module.exports._internals = { HistoryManager, CommandPalette, parseArgs, CATALOG, HISTORY_PATH, SemanticRouter };
