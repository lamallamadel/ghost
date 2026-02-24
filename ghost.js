#!/usr/bin/env node

const path = require('path');
const os = require('os');
const fs = require('fs');
const Gateway = require('./core/gateway');
const { ExtensionRuntime } = require('./core/runtime');
const { IOPipeline } = require('./core/pipeline');
const { AuditLogger } = require('./core/pipeline/audit');

const USER_EXTENSIONS_DIR = path.join(os.homedir(), '.ghost', 'extensions');
const BUNDLED_EXTENSIONS_DIR = path.join(__dirname, 'extensions');
const AUDIT_LOG_PATH = path.join(os.homedir(), '.ghost', 'audit.log');

const Colors = {
    HEADER: '\x1b[95m',
    BLUE: '\x1b[94m',
    CYAN: '\x1b[96m',
    GREEN: '\x1b[92m',
    WARNING: '\x1b[93m',
    FAIL: '\x1b[91m',
    ENDC: '\x1b[0m',
    BOLD: '\x1b[1m',
    DIM: '\x1b[2m'
};

class GatewayLauncher {
    constructor() {
        this.gateway = null;
        this.runtime = null;
        this.pipeline = null;
        this.auditLogger = null;
        this.telemetry = {
            requests: [],
            startTime: Date.now()
        };
    }

    async initialize() {
        try {
            const ghostDir = path.dirname(USER_EXTENSIONS_DIR);
            if (!fs.existsSync(ghostDir)) {
                fs.mkdirSync(ghostDir, { recursive: true });
            }
            
            if (fs.existsSync(USER_EXTENSIONS_DIR) && !fs.lstatSync(USER_EXTENSIONS_DIR).isDirectory()) {
                fs.unlinkSync(USER_EXTENSIONS_DIR);
            }
            
            if (!fs.existsSync(USER_EXTENSIONS_DIR)) {
                fs.mkdirSync(USER_EXTENSIONS_DIR, { recursive: true });
            }
        } catch (error) {
        }

        this.gateway = new Gateway({ 
            extensionsDir: USER_EXTENSIONS_DIR,
            bundledExtensionsDir: BUNDLED_EXTENSIONS_DIR 
        });
        this.runtime = new ExtensionRuntime({
            maxRestarts: 3,
            restartWindow: 60000,
            heartbeatTimeout: 30000
        });
        
        this.pipeline = new IOPipeline({
            auditLogPath: AUDIT_LOG_PATH
        });

        this.auditLogger = new AuditLogger(AUDIT_LOG_PATH);

        this._setupRuntimeEventHandlers();

        await this._initializeExtensions();
    }

    async _initializeExtensions() {
        const result = await this.gateway.initialize();
        
        for (const ext of this.gateway.listExtensions()) {
            const fullExt = this.gateway.getExtension(ext.id);
            
            if (fullExt && fullExt.manifest) {
                this.pipeline.registerExtension(ext.id, fullExt.manifest);
            }
        }
        
        return result;
    }

    _setupRuntimeEventHandlers() {
        this.runtime.on('extension-state-change', (info) => {
            if (this.verbose) {
                console.log(`${Colors.DIM}[Runtime] Extension ${info.extensionId}: ${info.state}${Colors.ENDC}`);
            }
        });

        this.runtime.on('extension-error', (info) => {
            console.error(`${Colors.FAIL}[Runtime Error] ${info.extensionId}: ${info.error}${Colors.ENDC}`);
        });

        this.runtime.on('extension-restarted', (info) => {
            if (this.verbose) {
                console.log(`${Colors.WARNING}[Runtime] Extension ${info.extensionId} restarted (count: ${info.count})${Colors.ENDC}`);
            }
        });
    }

    parseArgs() {
        const args = process.argv.slice(2);
        const parsed = {
            command: null,
            subcommand: null,
            args: [],
            flags: {
                verbose: false,
                help: false,
                json: false
            }
        };

        for (let i = 0; i < args.length; i++) {
            const arg = args[i];
            
            if (arg === '--verbose' || arg === '-v') {
                parsed.flags.verbose = true;
            } else if (arg === '--help' || arg === '-h') {
                parsed.flags.help = true;
            } else if (arg === '--json') {
                parsed.flags.json = true;
            } else if (arg.startsWith('--')) {
                parsed.flags[arg.slice(2)] = args[i + 1] || true;
                if (args[i + 1] && !args[i + 1].startsWith('--')) {
                    i++;
                }
            } else if (!parsed.command) {
                parsed.command = arg;
            } else if (!parsed.subcommand) {
                parsed.subcommand = arg;
            } else {
                parsed.args.push(arg);
            }
        }

        return parsed;
    }

    async route(parsedArgs) {
        this.verbose = parsedArgs.flags.verbose;

        if (parsedArgs.flags.help || !parsedArgs.command) {
            this.showHelp();
            return;
        }

        if (parsedArgs.command === 'extension') {
            await this.handleExtensionCommand(parsedArgs);
        } else if (parsedArgs.command === 'gateway') {
            await this.handleGatewayCommand(parsedArgs);
        } else if (parsedArgs.command === 'audit-log') {
            await this.handleAuditLogCommand(parsedArgs);
        } else {
            await this.forwardToExtension(parsedArgs);
        }
    }

    async handleExtensionCommand(parsedArgs) {
        const subcommand = parsedArgs.subcommand;

        if (!subcommand || subcommand === 'help') {
            console.log(`${Colors.BOLD}Extension Management Commands:${Colors.ENDC}
  ghost extension list                    List all installed extensions
  ghost extension install <path>          Install an extension from path
  ghost extension remove <id>             Remove an extension by ID
  ghost extension info <id>               Show extension information
`);
            return;
        }

        if (subcommand === 'list') {
            const extensions = this.gateway.listExtensions();
            
            if (parsedArgs.flags.json) {
                console.log(JSON.stringify(extensions, null, 2));
            } else {
                console.log(`\n${Colors.BOLD}${Colors.CYAN}Installed Extensions:${Colors.ENDC}\n`);
                
                if (extensions.length === 0) {
                    console.log(`${Colors.DIM}No extensions installed.${Colors.ENDC}\n`);
                } else {
                    extensions.forEach(ext => {
                        console.log(`${Colors.GREEN}●${Colors.ENDC} ${Colors.BOLD}${ext.name}${Colors.ENDC} ${Colors.DIM}(${ext.id})${Colors.ENDC}`);
                        console.log(`  Version: ${ext.version}`);
                        console.log(`  Capabilities: ${Object.keys(ext.capabilities || {}).join(', ')}`);
                        console.log('');
                    });
                }
            }
        } else if (subcommand === 'install') {
            const extPath = parsedArgs.args[0];
            
            if (!extPath) {
                console.error(`${Colors.FAIL}Error: Extension path required${Colors.ENDC}`);
                console.log('Usage: ghost extension install <path>');
                process.exit(1);
            }

            const absolutePath = path.resolve(extPath);
            const manifestPath = path.join(absolutePath, 'manifest.json');
            
            if (!fs.existsSync(manifestPath)) {
                console.error(`${Colors.FAIL}Error: No manifest.json found at ${absolutePath}${Colors.ENDC}`);
                process.exit(1);
            }

            const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
            const targetPath = path.join(USER_EXTENSIONS_DIR, manifest.id);

            if (fs.existsSync(targetPath)) {
                console.error(`${Colors.FAIL}Error: Extension ${manifest.id} already installed${Colors.ENDC}`);
                process.exit(1);
            }

            fs.mkdirSync(USER_EXTENSIONS_DIR, { recursive: true });
            this._copyDirectory(absolutePath, targetPath);

            console.log(`${Colors.GREEN}✓${Colors.ENDC} Extension ${Colors.BOLD}${manifest.name}${Colors.ENDC} installed successfully`);
            console.log(`${Colors.DIM}  Location: ${targetPath}${Colors.ENDC}`);
        } else if (subcommand === 'remove') {
            const extId = parsedArgs.args[0];
            
            if (!extId) {
                console.error(`${Colors.FAIL}Error: Extension ID required${Colors.ENDC}`);
                console.log('Usage: ghost extension remove <id>');
                process.exit(1);
            }

            const ext = this.gateway.getExtension(extId);
            
            if (!ext) {
                console.error(`${Colors.FAIL}Error: Extension ${extId} not found${Colors.ENDC}`);
                process.exit(1);
            }

            try {
                await this.runtime.stopExtension(extId);
            } catch (error) {
            }

            this.gateway.unloadExtension(extId);
            
            const extPath = path.join(USER_EXTENSIONS_DIR, extId);
            if (fs.existsSync(extPath)) {
                this._removeDirectory(extPath);
            }

            console.log(`${Colors.GREEN}✓${Colors.ENDC} Extension ${Colors.BOLD}${extId}${Colors.ENDC} removed successfully`);
        } else if (subcommand === 'info') {
            const extId = parsedArgs.args[0];
            
            if (!extId) {
                console.error(`${Colors.FAIL}Error: Extension ID required${Colors.ENDC}`);
                console.log('Usage: ghost extension info <id>');
                process.exit(1);
            }

            const ext = this.gateway.getExtension(extId);
            
            if (!ext) {
                console.error(`${Colors.FAIL}Error: Extension ${extId} not found${Colors.ENDC}`);
                process.exit(1);
            }

            const runtimeState = this.runtime.getExtensionState(extId);

            if (parsedArgs.flags.json) {
                console.log(JSON.stringify({ manifest: ext.manifest, runtime: runtimeState }, null, 2));
            } else {
                console.log(`\n${Colors.BOLD}${Colors.CYAN}${ext.manifest.name}${Colors.ENDC}`);
                console.log(`${Colors.DIM}${'─'.repeat(50)}${Colors.ENDC}`);
                console.log(`ID:           ${ext.manifest.id}`);
                console.log(`Version:      ${ext.manifest.version}`);
                console.log(`Main:         ${ext.manifest.main}`);
                
                if (runtimeState) {
                    console.log(`\n${Colors.BOLD}Runtime Status:${Colors.ENDC}`);
                    console.log(`State:        ${this._colorizeState(runtimeState.state)}`);
                    console.log(`PID:          ${runtimeState.pid || 'N/A'}`);
                    console.log(`Restarts:     ${runtimeState.restartCount}`);
                    console.log(`Last HB:      ${runtimeState.lastHeartbeat ? new Date(runtimeState.lastHeartbeat).toISOString() : 'N/A'}`);
                }
                
                console.log('');
            }
        } else {
            console.error(`${Colors.FAIL}Unknown subcommand: ${subcommand}${Colors.ENDC}`);
            process.exit(1);
        }
    }

    async handleGatewayCommand(parsedArgs) {
        const subcommand = parsedArgs.subcommand;

        if (!subcommand || subcommand === 'help') {
            console.log(`${Colors.BOLD}Gateway Commands:${Colors.ENDC}
  ghost gateway status                    Show gateway status and statistics
  ghost gateway health                    Show extension health status
`);
            return;
        }

        if (subcommand === 'status') {
            const extensions = this.gateway.listExtensions();
            const runtimeHealth = this.runtime.getHealthStatus();
            
            const status = {
                gateway: {
                    version: require('./package.json').version,
                    extensionsLoaded: extensions.length,
                    uptime: Date.now() - this.telemetry.startTime
                },
                runtime: runtimeHealth,
                telemetry: {
                    totalRequests: this.telemetry.requests.length,
                    recentRequests: this.telemetry.requests.slice(-10)
                }
            };

            if (parsedArgs.flags.json) {
                console.log(JSON.stringify(status, null, 2));
            } else {
                console.log(`\n${Colors.BOLD}${Colors.CYAN}Gateway Status${Colors.ENDC}`);
                console.log(`${Colors.DIM}${'─'.repeat(50)}${Colors.ENDC}`);
                console.log(`Version:           ${status.gateway.version}`);
                console.log(`Extensions Loaded: ${status.gateway.extensionsLoaded}`);
                console.log(`Uptime:            ${Math.floor(status.gateway.uptime / 1000)}s`);
                console.log(`Total Requests:    ${status.telemetry.totalRequests}`);
                console.log('');
            }
        } else if (subcommand === 'health') {
            const health = this.runtime.getHealthStatus();

            if (parsedArgs.flags.json) {
                console.log(JSON.stringify(health, null, 2));
            } else {
                console.log(`\n${Colors.BOLD}${Colors.CYAN}Extension Health${Colors.ENDC}`);
                console.log(`${Colors.DIM}${'─'.repeat(50)}${Colors.ENDC}`);
                console.log(`Total:     ${health.totalExtensions}`);
                console.log(`Running:   ${Colors.GREEN}${health.running}${Colors.ENDC}`);
                console.log(`Stopped:   ${Colors.DIM}${health.stopped}${Colors.ENDC}`);
                console.log(`Failed:    ${Colors.FAIL}${health.failed}${Colors.ENDC}`);
                console.log(`Starting:  ${Colors.WARNING}${health.starting}${Colors.ENDC}`);
                console.log('');

                if (Object.keys(health.extensions).length > 0) {
                    console.log(`${Colors.BOLD}Extension Details:${Colors.ENDC}`);
                    for (const [id, state] of Object.entries(health.extensions)) {
                        console.log(`  ${this._colorizeState(state.state)} ${id}`);
                    }
                    console.log('');
                }
            }
        } else {
            console.error(`${Colors.FAIL}Unknown subcommand: ${subcommand}${Colors.ENDC}`);
            process.exit(1);
        }
    }

    async handleAuditLogCommand(parsedArgs) {
        const subcommand = parsedArgs.subcommand || 'view';

        if (subcommand === 'view') {
            const limit = parseInt(parsedArgs.flags.limit) || 50;
            const filter = {};
            
            if (parsedArgs.flags.extension) {
                filter.extensionId = parsedArgs.flags.extension;
            }
            
            if (parsedArgs.flags.type) {
                filter.type = parsedArgs.flags.type;
            }
            
            if (parsedArgs.flags.since) {
                filter.since = parsedArgs.flags.since;
            }

            const logs = this.auditLogger.readLogs({ limit, filter });

            if (parsedArgs.flags.json) {
                console.log(JSON.stringify(logs, null, 2));
            } else {
                console.log(`\n${Colors.BOLD}${Colors.CYAN}Audit Log${Colors.ENDC} ${Colors.DIM}(last ${limit})${Colors.ENDC}`);
                console.log(`${Colors.DIM}${'─'.repeat(80)}${Colors.ENDC}\n`);
                
                if (logs.length === 0) {
                    console.log(`${Colors.DIM}No audit entries found.${Colors.ENDC}\n`);
                } else {
                    logs.forEach(log => {
                        const timestamp = new Date(log.timestamp).toISOString();
                        const typeColor = log.type === 'SECURITY_EVENT' ? Colors.FAIL : Colors.CYAN;
                        console.log(`${Colors.DIM}${timestamp}${Colors.ENDC} ${typeColor}${log.type}${Colors.ENDC}`);
                        
                        if (log.extensionId) {
                            console.log(`  Extension: ${log.extensionId}`);
                        }
                        
                        if (log.message) {
                            console.log(`  ${log.message}`);
                        }
                        
                        if (log.violations && log.violations.length > 0) {
                            console.log(`  ${Colors.FAIL}Violations: ${log.violations.length}${Colors.ENDC}`);
                        }
                        
                        console.log('');
                    });
                }
            }
        } else {
            console.error(`${Colors.FAIL}Unknown subcommand: ${subcommand}${Colors.ENDC}`);
            process.exit(1);
        }
    }

    async forwardToExtension(parsedArgs) {
        const command = parsedArgs.command;
        const targetExtension = this._findExtensionForCommand(command);

        if (!targetExtension) {
            console.error(`${Colors.FAIL}Error: No extension found to handle command '${command}'${Colors.ENDC}`);
            console.log(`\nAvailable extensions:`);
            this.gateway.listExtensions().forEach(ext => {
                console.log(`  - ${ext.id} (${ext.name})`);
            });
            process.exit(1);
        }

        if (this.verbose) {
            console.log(`${Colors.DIM}[Gateway] Routing '${command}' to extension '${targetExtension.id}'${Colors.ENDC}`);
            this._logTelemetry('ROUTE', { command, extension: targetExtension.id });
        }

        try {
            const ext = targetExtension;
            
            if (!ext.instance) {
                console.error(`${Colors.FAIL}Error: Extension ${ext.manifest.id} has no instance${Colors.ENDC}`);
                process.exit(1);
            }

            if (typeof ext.instance[command] !== 'function') {
                console.error(`${Colors.FAIL}Error: Extension ${ext.manifest.id} does not implement '${command}'${Colors.ENDC}`);
                process.exit(1);
            }

            const params = {
                subcommand: parsedArgs.subcommand,
                args: parsedArgs.args,
                flags: parsedArgs.flags
            };

            const result = await ext.instance[command](params);

            if (this.verbose) {
                this._logTelemetry('SUCCESS', { command, extension: targetExtension.id });
            }

            if (parsedArgs.flags.json) {
                console.log(JSON.stringify(result, null, 2));
            } else if (result && result.output) {
                console.log(result.output);
            } else if (result) {
                console.log(JSON.stringify(result, null, 2));
            }
        } catch (error) {
            if (this.verbose) {
                this._logTelemetry('ERROR', { command, extension: targetExtension.id, error: error.message });
            }

            console.error(`${Colors.FAIL}Error executing command '${command}': ${error.message}${Colors.ENDC}`);
            process.exit(1);
        }
    }

    _findExtensionForCommand(command) {
        const commandMap = {
            'commit': 'ghost-git-extension',
            'audit': 'ghost-git-extension',
            'version': 'ghost-git-extension',
            'merge': 'ghost-git-extension',
            'console': 'ghost-git-extension',
            'history': 'ghost-git-extension'
        };

        const extensionId = commandMap[command];
        
        if (extensionId) {
            return this.gateway.getExtension(extensionId);
        }

        const extensions = this.gateway.listExtensions();
        for (const ext of extensions) {
            if (ext.capabilities && ext.capabilities[command]) {
                return this.gateway.getExtension(ext.id);
            }
        }

        return null;
    }

    _logTelemetry(event, data) {
        const entry = {
            timestamp: Date.now(),
            event,
            ...data
        };
        
        this.telemetry.requests.push(entry);
        
        if (this.telemetry.requests.length > 1000) {
            this.telemetry.requests.shift();
        }

        if (this.verbose) {
            console.log(`${Colors.DIM}[Telemetry] ${event}: ${JSON.stringify(data)}${Colors.ENDC}`);
        }
    }

    _colorizeState(state) {
        const stateColors = {
            'RUNNING': Colors.GREEN,
            'STOPPED': Colors.DIM,
            'FAILED': Colors.FAIL,
            'STARTING': Colors.WARNING,
            'STOPPING': Colors.WARNING
        };
        
        const color = stateColors[state] || '';
        return `${color}${state}${Colors.ENDC}`;
    }

    _copyDirectory(src, dest) {
        fs.mkdirSync(dest, { recursive: true });
        
        const entries = fs.readdirSync(src, { withFileTypes: true });
        
        for (const entry of entries) {
            const srcPath = path.join(src, entry.name);
            const destPath = path.join(dest, entry.name);
            
            if (entry.isDirectory()) {
                this._copyDirectory(srcPath, destPath);
            } else {
                fs.copyFileSync(srcPath, destPath);
            }
        }
    }

    _removeDirectory(dir) {
        if (fs.existsSync(dir)) {
            fs.readdirSync(dir).forEach(file => {
                const curPath = path.join(dir, file);
                if (fs.lstatSync(curPath).isDirectory()) {
                    this._removeDirectory(curPath);
                } else {
                    fs.unlinkSync(curPath);
                }
            });
            fs.rmdirSync(dir);
        }
    }

    showHelp() {
        console.log(`
${Colors.BOLD}${Colors.CYAN}GHOST CLI v0.4.0${Colors.ENDC} - Gateway Launcher
Zero-dependency Git assistant with extensible architecture

${Colors.BOLD}USAGE:${Colors.ENDC}
  ghost <command> [subcommand] [options]

${Colors.BOLD}GATEWAY COMMANDS:${Colors.ENDC}
  extension list                List installed extensions
  extension install <path>      Install extension from path
  extension remove <id>         Remove extension
  extension info <id>           Show extension details
  gateway status                Show gateway status
  gateway health                Show extension health
  audit-log view                View audit logs

${Colors.BOLD}EXTENSION COMMANDS:${Colors.ENDC}
  commit                        AI-powered commit generation (via ghost-git-extension)
  audit                         Security audit (via ghost-git-extension)
  version                       Version management (via ghost-git-extension)
  merge                         Merge conflict resolution (via ghost-git-extension)
  console                       Monitoring console (via ghost-git-extension)
  history                       Commit history (via ghost-git-extension)

${Colors.BOLD}OPTIONS:${Colors.ENDC}
  --verbose, -v                 Show detailed telemetry and pipeline logs
  --json                        Output in JSON format
  --help, -h                    Show this help message

${Colors.BOLD}EXAMPLES:${Colors.ENDC}
  ghost extension list
  ghost gateway status --verbose
  ghost commit --dry-run
  ghost audit --verbose
  ghost audit-log view --limit 100 --extension ghost-git-extension

${Colors.BOLD}TELEMETRY:${Colors.ENDC}
  Use --verbose flag to see real-time pipeline telemetry:
  - Extension discovery and routing
  - JSON-RPC request/response flows
  - Pipeline stage execution times
  - Authorization and audit results
`);
    }

    async cleanup() {
        if (this.runtime) {
            await this.runtime.shutdown();
        }
        
        if (this.gateway) {
            this.gateway.shutdown();
        }
    }
}

async function main() {
    const launcher = new GatewayLauncher();

    process.on('SIGINT', async () => {
        console.log(`\n${Colors.WARNING}Shutting down...${Colors.ENDC}`);
        await launcher.cleanup();
        process.exit(0);
    });

    process.on('SIGTERM', async () => {
        await launcher.cleanup();
        process.exit(0);
    });

    try {
        await launcher.initialize();
        const parsedArgs = launcher.parseArgs();
        await launcher.route(parsedArgs);
    } catch (error) {
        console.error(`${Colors.FAIL}Fatal error: ${error.message}${Colors.ENDC}`);
        
        if (launcher.verbose) {
            console.error(error.stack);
        }
        
        await launcher.cleanup();
        process.exit(1);
    }

    await launcher.cleanup();
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = { GatewayLauncher };
