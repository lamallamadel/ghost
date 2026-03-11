# Ghost Sovereign CLI — Interactive Shell

> **The Beautiful Monster** — A full-featured, zero-trust interactive shell for the Ghost gateway.

Ghost CLI Extension v2.0.0 provides a rich terminal UX built on the IO-to-Boundary principle: all filesystem operations go through the SDK pipeline; terminal interaction (readline, stdout) is pure UI and is exempt.

---

## Quick Start

```bash
node ghost.js          # Starts Ghost gateway + CLI shell
```

or via the extension runner:

```bash
ghost extension start ghost-cli-extension
```

---

## The Prompt

```
[main] 👻 ghost(3)>
  │         │   └── number of live extensions
  │         └────── Ghost logo
  └──────────────── current git branch (omitted outside git repos)
```

The prompt refreshes automatically after every command.

---

## Keyboard Shortcuts

| Key          | Action                                      |
|--------------|---------------------------------------------|
| `/`          | Opens the command palette                   |
| `Tab`        | Autocomplete selected palette item          |
| `↑` / `↓`   | Navigate palette or history                 |
| `Ctrl+L`     | Clear terminal (same as `/clear`)           |
| `Ctrl+C`     | Exit shell                                  |

---

## Command Palette

Type `/` followed by any text to open the fuzzy command palette. The palette uses character-subsequence fuzzy matching — typing `sec` matches `security`, `sc` matches `security scan`, etc.

After selecting a top-level command (e.g. `/git`), pressing Space or continuing to type switches the palette to show subcommand hints for that extension with their argument signatures.

Press `Tab` or `→` to accept the highlighted completion.

---

## Built-in Commands

| Command             | Description                          |
|---------------------|--------------------------------------|
| `/help [filter]`    | Full command reference, optionally filtered by keyword |
| `/status`           | Live extension health grid (queries registry) |
| `/history [n]`      | Show last _n_ commands (default 20)  |
| `/clear` / `Ctrl+L` | Clear terminal and reprint banner    |
| `/exit` / `/quit`   | Exit the shell                       |

---

## Extension Commands

### 🌿 `/git` — AI-Powered Git Workflow

| Command | Arguments | Description |
|---------|-----------|-------------|
| `/git commit` | `[--provider <groq\|openai\|anthropic>] [--skip-audit]` | AI-generated commit message + security pre-audit |
| `/git add` | `[files...]` | Stage files for commit |
| `/git audit` | | Audit staged changes for secrets and issues |
| `/git merge` | `[status\|--accept-ours\|--accept-theirs]` | Intelligent merge conflict resolution |
| `/git history` | | AI analysis of recent commit history |
| `/git version` | | Semantic version bump management |

### 🔒 `/security` — Security Scanning & NIST Compliance

| Command | Arguments | Description |
|---------|-----------|-------------|
| `/security scan` | `[path]` | Scan for secrets, API keys, vulnerabilities |
| `/security audit` | `[--ai] [--provider <name>]` | AI-validated deep security audit |
| `/security status` | | Current security posture summary |
| `/security compliance` | | NIST SP 800-53 compliance report |

### 📋 `/policy` — Governance & Compatibility Matrix

| Command | Arguments | Description |
|---------|-----------|-------------|
| `/policy list` | | List all active governance policies |
| `/policy set` | `<rule> <value>` | Update a policy rule |
| `/policy verify` | | Verify environment compliance against policy |
| `/policy compatStatus` | | Show extension compatibility matrix |
| `/policy compatExport` | | Export matrix to `docs/` |
| `/policy compatCheck` | | Run CI compatibility enforcement check |

### ⚙️ `/process` — Background Service Supervisor

| Command | Arguments | Description |
|---------|-----------|-------------|
| `/process list` | | List all managed background services |
| `/process status` | `<service>` | Status of a specific service |
| `/process start` | `<service>` | Start a background service (detached) |
| `/process stop` | `<service>` | Stop a running service |
| `/process restart` | `<service>` | Restart a service |

### 🖥️ `/sys` — System Diagnostics

| Command | Arguments | Description |
|---------|-----------|-------------|
| `/sys status` | | System health overview |
| `/sys logs` | `[info\|warn\|error]` | View audit log entries |
| `/sys sanitize` | | Clean up temp files |
| `/sys doctor` | | Full health check and diagnostics |

### 📚 `/docs` — AI Documentation Generation

| Command | Arguments | Description |
|---------|-----------|-------------|
| `/docs initialize` | | Bootstrap project documentation |
| `/docs generate` | | AI-generate README and API docs |
| `/docs diagram` | | Generate architecture diagrams |
| `/docs chat` | | Chat with your codebase |

### 🤖 `/agent` — Autonomous AI Agent

| Command | Arguments | Description |
|---------|-----------|-------------|
| `/agent solve` | `<goal description>` | Solve a complex engineering goal autonomously |
| `/agent think` | | Analyze current mission state |
| `/agent plan` | | Decompose a goal into an extension task plan |

### 🧠 `/ai` — AI Provider Management

| Command | Arguments | Description |
|---------|-----------|-------------|
| `/ai status` | | Show current provider and model |
| `/ai models` | | List all available models per provider |
| `/ai switch` | `<groq\|anthropic\|openai\|gemini> [--model <name>]` | Switch AI provider |
| `/ai usage` | | Token usage analytics |

### 🖥️ `/desktop` — Telemetry Console

| Command | Arguments | Description |
|---------|-----------|-------------|
| `/desktop console` | `[--port <9876>] [--no-ui]` | Launch the real-time telemetry web console |

---

## Natural Language Routing

You can skip slash commands entirely and type plain English. Ghost will:

1. **Smart-route** common phrases to the right extension (no AI call required):
   - _"commit my changes"_ → `/git commit`
   - _"scan for secrets"_ → `/security scan`
   - _"generate documentation"_ → `/docs generate`
   - _"check policy compliance"_ → `/policy list`
   - _"list services"_ → `/process list`
   - _"check system health"_ → `/sys doctor`

2. **Delegate** to `ghost-agent-extension` for anything else, which uses the AI provider to decompose and solve the goal using the full extension toolkit.

---

## Command History

History is persisted to `~/.ghost/cli-history.json` via the SDK (IO-to-Boundary compliant — no direct fs access). Up to **200 entries** are kept. Consecutive duplicate entries are deduplicated.

Access history:
- Press `↑` / `↓` to navigate inline
- Type `/history 50` to see the last 50 commands

---

## Flag Syntax

All extension commands support a consistent flag syntax:

```
/git commit --provider groq --skip-audit
/security scan /src --ai --provider anthropic
/ai switch anthropic --model claude-3-5-sonnet-20241022
```

- `--flag value` — value flag (next token is the value)
- `--flag` alone — boolean flag set to `true`
- Positional args come before or between flags

---

## IO-to-Boundary Compliance

The CLI shell is fully IO-to-Boundary compliant:

| Operation | Implementation |
|-----------|----------------|
| History read/write | `sdk.requestFileRead/Write` via pipeline |
| Config read | `sdk.requestFileRead` via pipeline |
| Git branch lookup | `sdk.requestGitCurrentBranch()` via pipeline |
| Extension calls | `sdk.emitIntent({ type: 'extension', operation: 'call' })` |
| Registry query | `sdk.emitIntent({ type: 'system', operation: 'registry' })` |
| Terminal I/O | `readline` + `process.stdout` (pure UI — no violation) |

`require('fs')` and `require('child_process')` are **absent** from the extension source. This is enforced by a static regression gate in `test/extensions/cli-extension.test.js` (Test 1) and `test/e2e/io-boundary.e2e.test.js`.

---

## Manifest Permissions

```json
{
  "permissions": [
    "filesystem:read",
    "filesystem:write",
    "git:read",
    "system:registry",
    "extension:call"
  ],
  "capabilities": {
    "filesystem": {
      "read":  ["~/.ghost/cli-history.json", "~/.ghost/config/ghostrc.json"],
      "write": ["~/.ghost/cli-history.json"]
    }
  }
}
```

---

## Architecture

```
ExtensionWrapper (gateway entry point)
└── GhostShell (interactive loop orchestrator)
    ├── HistoryManager  — load/persist history via SDK
    ├── ContextProvider — git branch + ext count via SDK
    ├── CommandPalette  — fuzzy dropdown, subcommand hints
    ├── Spinner         — animated loading indicator
    ├── OutputFormatter — box, table, banner, section
    ├── _handleSlash()  — slash command routing via CATALOG
    └── _handleNL()     — smart keyword routing + agent fallback
```

All internal state is private. The only public contract is:
- `init(options)` → `{ success: true }`
- `start(params)` → starts interactive loop (blocking)
- `handleRPCRequest(request)` → JSON-RPC dispatch
