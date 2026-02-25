#!/usr/bin/env node

const path = require('path');
const os = require('os');
const fs = require('fs');
const Gateway = require('./core/gateway');
const { ExtensionRuntime } = require('./core/runtime');
const { IOPipeline, instrumentPipeline } = require('./core/pipeline');
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

/**
 * GatewayLauncher - Pure Orchestration Layer
 * 
 * ARCHITECTURE PRINCIPLE: Zero Business Logic
 * This class serves as a pure orchestration layer that:
 * 1. Initializes infrastructure components (Gateway, Runtime, Pipeline, Audit)
 * 2. Routes commands to appropriate handlers or extensions
 * 3. Manages lifecycle and coordination between components
 * 4. Provides CLI interface and output formatting
 * 
 * VIOLATIONS AUDIT:
 * The following methods contain direct business logic operations that violate
 * the zero-business-logic principle and should be refactored to route through
 * extension instances:
 * 
 * - initialize(): Lines 44-54 - Direct fs operations for directory setup
 * - handleExtensionCommand(): Lines 220-240, 264-267, 698-856 - Direct fs operations
 *   for extension install/remove/scaffold/validate
 * - _copyDirectory(): Lines 663-677 - Direct fs.copyFileSync operations
 * - _removeDirectory(): Lines 680-692 - Direct fs.unlinkSync/rmdirSync operations
 * - _scaffoldExtension(): Lines 694-856 - Direct fs.writeFileSync for scaffolding
 * - _validateExtension(): Lines 858-1020 - Direct fs.readFileSync for validation
 * 
 * CORRECT PATTERN:
 * All domain operations (file I/O, git commands, API calls) should route through
 * forwardToExtension() to extension instances, allowing the pipeline to apply
 * intercept→auth→audit→execute layers consistently.
 * 
 * The ONLY acceptable operations in this class are:
 * - Component initialization and wiring
 * - Command parsing and routing decisions
 * - Metadata queries (listExtensions, getExtension, getHealthStatus, etc.)
 * - Output formatting and console presentation
 * - Lifecycle management (startup, shutdown, cleanup)
 */
class GatewayLauncher {
    constructor() {
        // Pure state: component references for orchestration
        this.gateway = null;
        this.runtime = null;
        this.pipeline = null;
        this.auditLogger = null;
        this.telemetryInstance = null;
        this.telemetryServer = null;
        this.telemetry = {
            requests: [],
            startTime: Date.now()
        };
    }

    /**
     * Initialize infrastructure components.
     * 
     * VIOLATION: Contains direct fs operations (lines 44-54) for directory setup.
     * These should be delegated to a system extension or abstracted into Gateway.
     * 
     * ORCHESTRATION ROLE:
     * - Instantiate Gateway, Runtime, Pipeline, and AuditLogger
     * - Wire up event handlers between components
     * - Delegate to _initializeExtensions() for extension loading
     */
    async initialize() {
        try {
            // VIOLATION: Direct file system operations
            // Should delegate to a system extension or Gateway method
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

        // Pure orchestration: component initialization
        this.gateway = new Gateway({ 
            extensionsDir: USER_EXTENSIONS_DIR,
            bundledExtensionsDir: BUNDLED_EXTENSIONS_DIR 
        });
        this.runtime = new ExtensionRuntime({
            maxRestarts: 3,
            restartWindow: 60000,
            heartbeatTimeout: 30000
        });
        
        const basePipeline = new IOPipeline({
            auditLogPath: AUDIT_LOG_PATH
        });

        const instrumented = instrumentPipeline(basePipeline, {
            enabled: true
        });
        
        this.pipeline = instrumented.pipeline;
        this.telemetryInstance = instrumented.telemetry;
        this.auditLogger = new AuditLogger(AUDIT_LOG_PATH);

        // Pure orchestration: wire up event handlers
        this._setupRuntimeEventHandlers();

        // Pure orchestration: delegate extension loading to Gateway
        await this._initializeExtensions();
    }

    /**
     * Register extensions with pipeline.
     * 
     * ORCHESTRATION ROLE:
     * - Call Gateway.initialize() to load extensions
     * - Register each extension's manifest with the pipeline
     * - No direct business logic, only metadata operations
     */
    async _initializeExtensions() {
        // Pure orchestration: delegate to Gateway
        const result = await this.gateway.initialize();
        
        // Pure orchestration: register metadata with pipeline
        for (const ext of this.gateway.listExtensions()) {
            const fullExt = this.gateway.getExtension(ext.id);
            
            if (fullExt && fullExt.manifest) {
                this.pipeline.registerExtension(ext.id, fullExt.manifest);
            }
        }
        
        return result;
    }

    /**
     * Set up event handlers for runtime state changes.
     * 
     * ORCHESTRATION ROLE:
     * - Wire up runtime event listeners for observability
     * - Format and output state change information
     * - No business logic, only logging/monitoring
     */
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

    /**
     * Parse command-line arguments into structured format.
     * 
     * ORCHESTRATION ROLE:
     * - Pure argument parsing, no I/O or external calls
     * - Returns structured data for routing decisions
     */
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

    /**
     * Route parsed command to appropriate handler.
     * 
     * ORCHESTRATION ROLE:
     * - Pure routing logic based on command type
     * - Delegates to specialized handlers or forwardToExtension()
     * - No business logic, only control flow
     */
    async route(parsedArgs) {
        this.verbose = parsedArgs.flags.verbose;

        if (parsedArgs.flags.help || !parsedArgs.command) {
            this.showHelp();
            return;
        }

        // Pure routing: delegate to appropriate handler
        if (parsedArgs.command === 'extension') {
            await this.handleExtensionCommand(parsedArgs);
        } else if (parsedArgs.command === 'gateway') {
            await this.handleGatewayCommand(parsedArgs);
        } else if (parsedArgs.command === 'audit-log') {
            await this.handleAuditLogCommand(parsedArgs);
        } else if (parsedArgs.command === 'console') {
            await this.handleConsoleCommand(parsedArgs);
        } else {
            // Pure routing: delegate domain commands to extensions
            await this.forwardToExtension(parsedArgs);
        }
    }

    /**
     * Handle extension management commands.
     * 
     * VIOLATIONS: Contains extensive direct file system operations
     * - Lines 220-240: Direct fs.readFileSync, fs.existsSync, fs.mkdirSync for install
     * - Lines 264-267: Direct fs.existsSync, _removeDirectory() for remove
     * - Lines 698-856: Direct fs operations in _scaffoldExtension()
     * - Lines 858-1020: Direct fs.readFileSync in _validateExtension()
     * 
     * ORCHESTRATION ROLE (correct behavior):
     * - Parse subcommands and route to appropriate operations
     * - Query Gateway for metadata (listExtensions, getExtension)
     * - Format and display results
     * - For operations like install/remove/init/validate, should delegate to
     *   a system extension via forwardToExtension()
     */
    async handleExtensionCommand(parsedArgs) {
        const subcommand = parsedArgs.subcommand;

        if (!subcommand || subcommand === 'help') {
            console.log(`${Colors.BOLD}Extension Management Commands:${Colors.ENDC}
  ghost extension list                    List all installed extensions
  ghost extension install <path>          Install an extension from path
  ghost extension remove <id>             Remove an extension by ID
  ghost extension info <id>               Show extension information
  ghost extension init <name>             Scaffold a new extension project
  ghost extension validate [path]         Validate extension manifest and permissions
`);
            return;
        }

        if (subcommand === 'list') {
            // Pure orchestration: query Gateway metadata and format output
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
            // VIOLATION: Direct file system operations below
            // Should delegate to system extension or Gateway method
            const extPath = parsedArgs.args[0];
            
            if (!extPath) {
                console.error(`${Colors.FAIL}Error: Extension path required${Colors.ENDC}`);
                console.log('Usage: ghost extension install <path>');
                process.exit(1);
            }

            const absolutePath = path.resolve(extPath);
            const manifestPath = path.join(absolutePath, 'manifest.json');
            
            // VIOLATION: Direct fs.existsSync
            if (!fs.existsSync(manifestPath)) {
                console.error(`${Colors.FAIL}Error: No manifest.json found at ${absolutePath}${Colors.ENDC}`);
                process.exit(1);
            }

            // VIOLATION: Direct fs.readFileSync
            const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
            const targetPath = path.join(USER_EXTENSIONS_DIR, manifest.id);

            // VIOLATION: Direct fs.existsSync
            if (fs.existsSync(targetPath)) {
                console.error(`${Colors.FAIL}Error: Extension ${manifest.id} already installed${Colors.ENDC}`);
                process.exit(1);
            }

            // VIOLATION: Direct fs.mkdirSync and _copyDirectory (which uses fs.copyFileSync)
            fs.mkdirSync(USER_EXTENSIONS_DIR, { recursive: true });
            this._copyDirectory(absolutePath, targetPath);

            console.log(`${Colors.GREEN}✓${Colors.ENDC} Extension ${Colors.BOLD}${manifest.name}${Colors.ENDC} installed successfully`);
            console.log(`${Colors.DIM}  Location: ${targetPath}${Colors.ENDC}`);
        } else if (subcommand === 'remove') {
            // Mixed: metadata queries are correct, but fs operations are violations
            const extId = parsedArgs.args[0];
            
            if (!extId) {
                console.error(`${Colors.FAIL}Error: Extension ID required${Colors.ENDC}`);
                console.log('Usage: ghost extension remove <id>');
                process.exit(1);
            }

            // Pure orchestration: query Gateway metadata
            const ext = this.gateway.getExtension(extId);
            
            if (!ext) {
                console.error(`${Colors.FAIL}Error: Extension ${extId} not found${Colors.ENDC}`);
                process.exit(1);
            }

            // Pure orchestration: call runtime management methods
            try {
                await this.runtime.stopExtension(extId);
            } catch (error) {
            }

            // Pure orchestration: call gateway management methods
            this.gateway.unloadExtension(extId);
            
            // VIOLATION: Direct fs operations
            const extPath = path.join(USER_EXTENSIONS_DIR, extId);
            if (fs.existsSync(extPath)) {
                this._removeDirectory(extPath);
            }

            console.log(`${Colors.GREEN}✓${Colors.ENDC} Extension ${Colors.BOLD}${extId}${Colors.ENDC} removed successfully`);
        } else if (subcommand === 'info') {
            // Pure orchestration: query metadata and format output
            const extId = parsedArgs.args[0];
            
            if (!extId) {
                console.error(`${Colors.FAIL}Error: Extension ID required${Colors.ENDC}`);
                console.log('Usage: ghost extension info <id>');
                process.exit(1);
            }

            // Pure orchestration: query Gateway and Runtime metadata
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
        } else if (subcommand === 'init') {
            // VIOLATION: Delegates to _scaffoldExtension which has direct fs operations
            const extName = parsedArgs.args[0];
            
            if (!extName) {
                console.error(`${Colors.FAIL}Error: Extension name required${Colors.ENDC}`);
                console.log('Usage: ghost extension init <name>');
                process.exit(1);
            }

            await this._scaffoldExtension(extName, parsedArgs.flags);
        } else if (subcommand === 'validate') {
            // VIOLATION: Delegates to _validateExtension which has direct fs operations
            const extPath = parsedArgs.args[0] || '.';
            await this._validateExtension(extPath);
        } else {
            console.error(`${Colors.FAIL}Unknown subcommand: ${subcommand}${Colors.ENDC}`);
            process.exit(1);
        }
    }

    /**
     * Handle gateway status and monitoring commands.
     * 
     * ORCHESTRATION ROLE: Correct implementation
     * - Query metadata from Gateway, Runtime, Telemetry
     * - No direct business logic operations
     * - Format and display monitoring information
     * - All operations are pure metadata queries
     */
    async handleGatewayCommand(parsedArgs) {
        const subcommand = parsedArgs.subcommand;

        if (!subcommand || subcommand === 'help') {
            console.log(`${Colors.BOLD}Gateway Commands:${Colors.ENDC}
  ghost gateway status                    Show gateway status and statistics
  ghost gateway health                    Show extension health status
  ghost gateway metrics [extension-id]    Show telemetry metrics
  ghost gateway spans [limit]             Show recent spans
`);
            return;
        }

        if (subcommand === 'status') {
            // Pure orchestration: query metadata from components
            const extensions = this.gateway.listExtensions();
            const runtimeHealth = this.runtime.getHealthStatus();
            
            const status = {
                gateway: {
                    version: require('./package.json').version,
                    extensionsLoaded: extensions.length,
                    uptime: Date.now() - this.telemetry.startTime,
                    telemetryServer: this.telemetryServer ? `http://localhost:${this.telemetryServer.port}` : 'Not running'
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
                console.log(`Telemetry Server:  ${status.gateway.telemetryServer}`);
                console.log('');
            }
        } else if (subcommand === 'metrics') {
            // Pure orchestration: query telemetry metrics and format output
            const extensionId = parsedArgs.args[0] || null;
            const metrics = this.telemetryInstance.metrics.getMetrics(extensionId);

            if (parsedArgs.flags.json) {
                console.log(JSON.stringify(metrics, null, 2));
            } else {
                console.log(`\n${Colors.BOLD}${Colors.CYAN}Telemetry Metrics${extensionId ? ` - ${extensionId}` : ''}${Colors.ENDC}`);
                console.log(`${Colors.DIM}${'─'.repeat(80)}${Colors.ENDC}\n`);

                if (Object.keys(metrics.requests).length === 0) {
                    console.log(`${Colors.DIM}No metrics available.${Colors.ENDC}\n`);
                } else {
                    for (const [extId, stages] of Object.entries(metrics.requests)) {
                        console.log(`${Colors.BOLD}${extId}${Colors.ENDC}`);
                        for (const [stage, count] of Object.entries(stages)) {
                            const latency = metrics.latencies[extId]?.[stage] || { p50: 0, p95: 0, p99: 0 };
                            console.log(`  ${stage}: ${count} requests (p50: ${latency.p50}ms, p95: ${latency.p95}ms, p99: ${latency.p99}ms)`);
                        }
                        
                        if (metrics.rateLimitViolations[extId]) {
                            console.log(`  ${Colors.WARNING}Rate Limit Violations: ${metrics.rateLimitViolations[extId]}${Colors.ENDC}`);
                        }
                        
                        if (metrics.authFailures[extId]) {
                            console.log(`  ${Colors.FAIL}Auth Failures:${Colors.ENDC}`);
                            for (const [code, count] of Object.entries(metrics.authFailures[extId])) {
                                console.log(`    ${code}: ${count}`);
                            }
                        }
                        
                        if (metrics.validationFailures[extId]) {
                            console.log(`  ${Colors.FAIL}Validation Failures:${Colors.ENDC}`);
                            for (const [reason, count] of Object.entries(metrics.validationFailures[extId])) {
                                console.log(`    ${reason}: ${count}`);
                            }
                        }
                        
                        console.log('');
                    }
                }
            }
        } else if (subcommand === 'spans') {
            // Pure orchestration: query telemetry spans and format output
            const limit = parseInt(parsedArgs.args[0]) || 50;
            const spans = this.telemetryInstance.getRecentSpans(limit);

            if (parsedArgs.flags.json) {
                console.log(JSON.stringify(spans, null, 2));
            } else {
                console.log(`\n${Colors.BOLD}${Colors.CYAN}Recent Spans (${limit})${Colors.ENDC}`);
                console.log(`${Colors.DIM}${'─'.repeat(80)}${Colors.ENDC}\n`);

                if (spans.length === 0) {
                    console.log(`${Colors.DIM}No spans recorded.${Colors.ENDC}\n`);
                } else {
                    spans.forEach(span => {
                        const statusColor = span.status.code === 'OK' ? Colors.GREEN : 
                                          span.status.code === 'ERROR' ? Colors.FAIL : Colors.DIM;
                        console.log(`${statusColor}●${Colors.ENDC} ${Colors.BOLD}${span.name}${Colors.ENDC} ${Colors.DIM}(${span.duration}ms)${Colors.ENDC}`);
                        console.log(`  Trace: ${span.traceId.substring(0, 16)}... | Span: ${span.spanId}`);
                        if (span.attributes.extensionId) {
                            console.log(`  Extension: ${span.attributes.extensionId}`);
                        }
                        if (span.attributes.requestId) {
                            console.log(`  Request: ${span.attributes.requestId}`);
                        }
                        if (span.status.code !== 'OK' && span.status.message) {
                            console.log(`  ${Colors.FAIL}Error: ${span.status.message}${Colors.ENDC}`);
                        }
                        console.log('');
                    });
                }
            }
        } else if (subcommand === 'health') {
            // Pure orchestration: query runtime health and format output
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

    /**
     * Handle telemetry console server commands.
     * 
     * ORCHESTRATION ROLE: Correct implementation
     * - Start/stop telemetry HTTP server through telemetryInstance
     * - No direct business logic, delegates to telemetryInstance methods
     */
    async handleConsoleCommand(parsedArgs) {
        const subcommand = parsedArgs.subcommand || 'start';

        if (subcommand === 'start') {
            const port = parseInt(parsedArgs.flags.port) || 9876;
            await this.startTelemetryServer(port);
            
            console.log(`\n${Colors.BOLD}${Colors.CYAN}Telemetry Console${Colors.ENDC}`);
            console.log(`${Colors.DIM}Press Ctrl+C to stop the server${Colors.ENDC}\n`);
            
            return new Promise(() => {});
        } else if (subcommand === 'stop') {
            await this.stopTelemetryServer();
        } else {
            console.error(`${Colors.FAIL}Unknown subcommand: ${subcommand}${Colors.ENDC}`);
            process.exit(1);
        }
    }

    /**
     * Handle audit log viewing commands.
     * 
     * ORCHESTRATION ROLE: Correct implementation
     * - Query audit logs through auditLogger.readLogs()
     * - Format and display results
     * - No direct file I/O, delegates to AuditLogger
     */
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

            // Pure orchestration: query audit logger and format output
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

    /**
     * Forward domain commands to appropriate extensions.
     * 
     * ORCHESTRATION ROLE: Correct implementation - THE GOLDEN EXAMPLE
     * This is how ALL domain operations should be handled:
     * 1. Find the extension that handles the command
     * 2. Validate extension instance exists and has the method
     * 3. Call extension method with parameters
     * 4. Format and display results
     * 
     * NO direct business logic - everything routes through extension instances,
     * which allows the pipeline to apply security, audit, and monitoring layers.
     */
    async forwardToExtension(parsedArgs) {
        const command = parsedArgs.command;
        
        // Pure orchestration: find appropriate extension
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
            
            // Validation: ensure extension is properly loaded
            if (!ext.instance) {
                console.error(`${Colors.FAIL}Error: Extension ${ext.manifest.id} has no instance${Colors.ENDC}`);
                process.exit(1);
            }

            if (typeof ext.instance[command] !== 'function') {
                console.error(`${Colors.FAIL}Error: Extension ${ext.manifest.id} does not implement '${command}'${Colors.ENDC}`);
                process.exit(1);
            }

            // Pure orchestration: prepare parameters and call extension method
            const params = {
                subcommand: parsedArgs.subcommand,
                args: parsedArgs.args,
                flags: parsedArgs.flags
            };

            // THE KEY OPERATION: Delegate to extension instance
            // This allows the pipeline to intercept, authenticate, audit, and execute
            const result = await ext.instance[command](params);

            if (this.verbose) {
                this._logTelemetry('SUCCESS', { command, extension: targetExtension.id });
            }

            // Pure orchestration: format and display results
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

    /**
     * Find extension that can handle a command.
     * 
     * ORCHESTRATION ROLE: Correct implementation
     * - Pure lookup logic using static command map and capability queries
     * - No business logic, only routing decisions
     */
    _findExtensionForCommand(command) {
        // Static command-to-extension mapping
        const commandMap = {
            'commit': 'ghost-git-extension',
            'audit': 'ghost-git-extension',
            'version': 'ghost-git-extension',
            'merge': 'ghost-git-extension',
            'history': 'ghost-git-extension'
        };

        const extensionId = commandMap[command];
        
        if (extensionId) {
            return this.gateway.getExtension(extensionId);
        }

        // Dynamic capability-based routing
        const extensions = this.gateway.listExtensions();
        for (const ext of extensions) {
            if (ext.capabilities && ext.capabilities[command]) {
                return this.gateway.getExtension(ext.id);
            }
        }

        return null;
    }

    /**
     * Log telemetry event for monitoring.
     * 
     * ORCHESTRATION ROLE: Correct implementation
     * - Pure in-memory telemetry logging
     * - No external I/O, just state updates
     */
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

    /**
     * Format state with appropriate color.
     * 
     * ORCHESTRATION ROLE: Correct implementation
     * - Pure formatting logic, no I/O
     */
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

    /**
     * Copy directory recursively.
     * 
     * VIOLATION: Direct file system operations
     * - fs.mkdirSync, fs.readdirSync, fs.copyFileSync
     * - Should delegate to extension instance or Gateway method
     * - Used by handleExtensionCommand for 'install' operation
     */
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

    /**
     * Remove directory recursively.
     * 
     * VIOLATION: Direct file system operations
     * - fs.existsSync, fs.readdirSync, fs.lstatSync, fs.unlinkSync, fs.rmdirSync
     * - Should delegate to extension instance or Gateway method
     * - Used by handleExtensionCommand for 'remove' operation
     */
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

    /**
     * Scaffold new extension project.
     * 
     * VIOLATION: Direct file system operations throughout
     * - fs.existsSync, fs.mkdirSync, fs.writeFileSync (lines 698-856)
     * - Creates manifest.json, index.js, package.json, README.md, .gitignore
     * - Should delegate to extension instance or Gateway method
     * - Used by handleExtensionCommand for 'init' operation
     */
    async _scaffoldExtension(name, flags) {
        const extId = name.toLowerCase().replace(/[^a-z0-9-]/g, '-');
        const targetDir = path.resolve(extId);

        // VIOLATION: Direct fs.existsSync
        if (fs.existsSync(targetDir)) {
            console.error(`${Colors.FAIL}Error: Directory ${extId} already exists${Colors.ENDC}`);
            process.exit(1);
        }

        console.log(`${Colors.CYAN}Creating extension: ${Colors.BOLD}${name}${Colors.ENDC}`);
        console.log(`${Colors.DIM}Directory: ${targetDir}${Colors.ENDC}\n`);

        // VIOLATION: Direct fs.mkdirSync
        fs.mkdirSync(targetDir, { recursive: true });

        const manifest = {
            id: extId,
            name: name,
            version: '1.0.0',
            description: `${name} extension for Ghost CLI`,
            author: flags.author || 'Your Name',
            main: 'index.js',
            capabilities: {
                filesystem: {
                    read: ['**/*'],
                    write: []
                },
                network: {
                    allowlist: [],
                    rateLimit: {
                        cir: 60,
                        bc: 100
                    }
                },
                git: {
                    read: true,
                    write: false
                }
            },
            permissions: [
                'filesystem:read',
                'git:read'
            ]
        };

        // VIOLATION: Direct fs.writeFileSync
        fs.writeFileSync(
            path.join(targetDir, 'manifest.json'),
            JSON.stringify(manifest, null, 2)
        );

        const indexTemplate = `const { ExtensionSDK } = require('@ghost/extension-sdk');

class ${name.replace(/[^a-zA-Z0-9]/g, '')}Extension {
    constructor() {
        this.sdk = new ExtensionSDK('${extId}');
    }

    async initialize() {
        console.log('${name} extension initialized');
    }

    async myCommand(params) {
        const { subcommand, args, flags } = params;

        try {
            const files = await this.sdk.requestFileRead({ path: '.' });
            console.log('Files read:', files);

            return {
                success: true,
                output: 'Command executed successfully'
            };
        } catch (error) {
            console.error('Error:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    async shutdown() {
        console.log('${name} extension shutting down');
    }
}

module.exports = ${name.replace(/[^a-zA-Z0-9]/g, '')}Extension;
`;

        // VIOLATION: Direct fs.writeFileSync
        fs.writeFileSync(path.join(targetDir, 'index.js'), indexTemplate);

        const packageJson = {
            name: extId,
            version: '1.0.0',
            description: `${name} extension for Ghost CLI`,
            main: 'index.js',
            scripts: {
                test: 'echo "Error: no test specified" && exit 1'
            },
            dependencies: {
                '@ghost/extension-sdk': '^1.0.0'
            },
            keywords: ['ghost', 'extension'],
            author: flags.author || 'Your Name',
            license: 'MIT'
        };

        // VIOLATION: Direct fs.writeFileSync
        fs.writeFileSync(
            path.join(targetDir, 'package.json'),
            JSON.stringify(packageJson, null, 2)
        );

        const readme = `# ${name}

${manifest.description}

## Installation

\`\`\`bash
npm install
ghost extension install .
\`\`\`

## Usage

\`\`\`bash
ghost myCommand
\`\`\`

## Development

1. Install dependencies: \`npm install\`
2. Validate manifest: \`ghost extension validate\`
3. Install locally: \`ghost extension install .\`
4. Test your extension: \`ghost myCommand\`

## Capabilities

This extension requests the following capabilities:
- **Filesystem Read**: Read files in the current directory
- **Git Read**: Read git repository data

## API

See [Extension API Documentation](https://github.com/lamallamadel/ghost/blob/main/docs/extension-api.md) for details.
`;

        // VIOLATION: Direct fs.writeFileSync
        fs.writeFileSync(path.join(targetDir, 'README.md'), readme);

        // VIOLATION: Direct fs.writeFileSync
        fs.writeFileSync(path.join(targetDir, '.gitignore'), `node_modules/
*.log
.DS_Store
`);

        console.log(`${Colors.GREEN}✓${Colors.ENDC} Extension scaffolded successfully!\n`);
        console.log(`${Colors.BOLD}Next steps:${Colors.ENDC}`);
        console.log(`  1. cd ${extId}`);
        console.log(`  2. npm install`);
        console.log(`  3. Edit manifest.json to add capabilities`);
        console.log(`  4. Edit index.js to implement your extension`);
        console.log(`  5. ghost extension validate`);
        console.log(`  6. ghost extension install .`);
        console.log('');
    }

    /**
     * Validate extension manifest and structure.
     * 
     * VIOLATION: Direct file system operations throughout
     * - fs.existsSync, fs.readFileSync (lines 858-1020)
     * - Reads manifest.json, validates schema, checks main file exists
     * - Should delegate to extension instance or Gateway method
     * - Used by handleExtensionCommand for 'validate' operation
     */
    async _validateExtension(extPath) {
        const absolutePath = path.resolve(extPath);
        const manifestPath = path.join(absolutePath, 'manifest.json');
        
        console.log(`${Colors.CYAN}Validating extension at: ${Colors.DIM}${absolutePath}${Colors.ENDC}\n`);

        // VIOLATION: Direct fs.existsSync
        if (!fs.existsSync(manifestPath)) {
            console.error(`${Colors.FAIL}✗ No manifest.json found${Colors.ENDC}`);
            process.exit(1);
        }

        let manifest;
        try {
            // VIOLATION: Direct fs.readFileSync
            const content = fs.readFileSync(manifestPath, 'utf8');
            manifest = JSON.parse(content);
            console.log(`${Colors.GREEN}✓${Colors.ENDC} Valid JSON syntax`);
        } catch (error) {
            console.error(`${Colors.FAIL}✗ Invalid JSON: ${error.message}${Colors.ENDC}`);
            process.exit(1);
        }

        // VIOLATION: Direct fs.readFileSync
        const schemaPath = path.join(__dirname, 'core', 'manifest-schema.json');
        const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));

        const errors = [];
        const warnings = [];

        if (!manifest.id) {
            errors.push('Missing required field: id');
        } else if (!/^[a-z0-9-]+$/.test(manifest.id)) {
            errors.push('Invalid id: must be lowercase alphanumeric with hyphens');
        } else {
            console.log(`${Colors.GREEN}✓${Colors.ENDC} Valid extension id: ${manifest.id}`);
        }

        if (!manifest.name) {
            errors.push('Missing required field: name');
        } else {
            console.log(`${Colors.GREEN}✓${Colors.ENDC} Extension name: ${manifest.name}`);
        }

        if (!manifest.version) {
            errors.push('Missing required field: version');
        } else if (!/^\d+\.\d+\.\d+$/.test(manifest.version)) {
            errors.push('Invalid version: must be semantic version (major.minor.patch)');
        } else {
            console.log(`${Colors.GREEN}✓${Colors.ENDC} Valid version: ${manifest.version}`);
        }

        if (!manifest.main) {
            errors.push('Missing required field: main');
        } else {
            // VIOLATION: Direct fs.existsSync
            const mainPath = path.join(absolutePath, manifest.main);
            if (!fs.existsSync(mainPath)) {
                errors.push(`Main file not found: ${manifest.main}`);
            } else {
                console.log(`${Colors.GREEN}✓${Colors.ENDC} Main file exists: ${manifest.main}`);
            }
        }

        if (!manifest.capabilities) {
            errors.push('Missing required field: capabilities');
        } else {
            console.log(`${Colors.GREEN}✓${Colors.ENDC} Capabilities defined`);
            
            if (manifest.capabilities.filesystem) {
                const fs_cap = manifest.capabilities.filesystem;
                if (fs_cap.read && Array.isArray(fs_cap.read)) {
                    console.log(`  ${Colors.DIM}- Filesystem read: ${fs_cap.read.length} pattern(s)${Colors.ENDC}`);
                }
                if (fs_cap.write && Array.isArray(fs_cap.write)) {
                    console.log(`  ${Colors.DIM}- Filesystem write: ${fs_cap.write.length} pattern(s)${Colors.ENDC}`);
                    if (fs_cap.write.length > 0) {
                        warnings.push('Extension requests write access to filesystem');
                    }
                }
            }

            if (manifest.capabilities.network) {
                const net_cap = manifest.capabilities.network;
                if (net_cap.allowlist && Array.isArray(net_cap.allowlist)) {
                    console.log(`  ${Colors.DIM}- Network allowlist: ${net_cap.allowlist.length} domain(s)${Colors.ENDC}`);
                    net_cap.allowlist.forEach(url => {
                        if (!/^https?:\/\/[^/]+$/.test(url)) {
                            errors.push(`Invalid network allowlist entry: ${url} (must be protocol + domain only)`);
                        }
                    });
                }
                if (net_cap.rateLimit) {
                    if (!net_cap.rateLimit.cir || !net_cap.rateLimit.bc) {
                        errors.push('Network rate limit requires both "cir" and "bc" fields');
                    }
                    if (net_cap.rateLimit.be !== undefined && typeof net_cap.rateLimit.be !== 'number') {
                        errors.push('Network rate limit "be" must be a number if specified');
                    }
                }
            }

            if (manifest.capabilities.git) {
                const git_cap = manifest.capabilities.git;
                if (git_cap.read) {
                    console.log(`  ${Colors.DIM}- Git read: enabled${Colors.ENDC}`);
                }
                if (git_cap.write) {
                    console.log(`  ${Colors.WARNING}- Git write: enabled${Colors.ENDC}`);
                    warnings.push('Extension requests write access to git repository');
                }
            }

            if (manifest.capabilities.hooks && Array.isArray(manifest.capabilities.hooks)) {
                console.log(`  ${Colors.DIM}- Git hooks: ${manifest.capabilities.hooks.join(', ')}${Colors.ENDC}`);
            }
        }

        console.log('');
        console.log(`${Colors.BOLD}Simulating permission requests:${Colors.ENDC}`);

        const testIntents = [
            {
                type: 'filesystem',
                operation: 'read',
                params: { path: './test.txt' },
                extensionId: manifest.id
            },
            {
                type: 'git',
                operation: 'status',
                params: { args: [] },
                extensionId: manifest.id
            }
        ];

        for (const intent of testIntents) {
            const { IntentSchema } = require('./core/pipeline/intercept');
            const validation = IntentSchema.validate(intent);
            
            if (validation.valid) {
                console.log(`${Colors.GREEN}✓${Colors.ENDC} ${intent.type}:${intent.operation} - valid intent`);
            } else {
                console.log(`${Colors.FAIL}✗${Colors.ENDC} ${intent.type}:${intent.operation} - invalid intent`);
                validation.errors.forEach(err => {
                    console.log(`  ${Colors.DIM}${err}${Colors.ENDC}`);
                });
            }
        }

        console.log('');

        if (warnings.length > 0) {
            console.log(`${Colors.WARNING}Warnings:${Colors.ENDC}`);
            warnings.forEach(w => console.log(`  ${Colors.WARNING}⚠${Colors.ENDC} ${w}`));
            console.log('');
        }

        if (errors.length > 0) {
            console.log(`${Colors.FAIL}Validation failed with ${errors.length} error(s):${Colors.ENDC}`);
            errors.forEach(e => console.log(`  ${Colors.FAIL}✗${Colors.ENDC} ${e}`));
            process.exit(1);
        } else {
            console.log(`${Colors.GREEN}${Colors.BOLD}✓ Extension is valid!${Colors.ENDC}\n`);
            console.log(`${Colors.DIM}Ready to install with: ghost extension install ${extPath}${Colors.ENDC}`);
        }
    }

    /**
     * Display help message.
     * 
     * ORCHESTRATION ROLE: Correct implementation
     * - Pure output formatting, no business logic
     */
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
  extension init <name>         Scaffold new extension project
  extension validate [path]     Validate extension manifest
  gateway status                Show gateway status
  gateway health                Show extension health
  gateway metrics [ext-id]      Show telemetry metrics
  gateway spans [limit]         Show recent spans
  audit-log view                View audit logs
  console [start|stop]          Start/stop telemetry HTTP/WebSocket server

${Colors.BOLD}EXTENSION COMMANDS:${Colors.ENDC}
  commit                        AI-powered commit generation (via ghost-git-extension)
  audit                         Security audit (via ghost-git-extension)
  version                       Version management (via ghost-git-extension)
  merge                         Merge conflict resolution (via ghost-git-extension)
  history                       Commit history (via ghost-git-extension)

${Colors.BOLD}OPTIONS:${Colors.ENDC}
  --verbose, -v                 Show detailed telemetry and pipeline logs
  --json                        Output in JSON format
  --port <port>                 Specify port for telemetry server (default: 9876)
  --help, -h                    Show this help message

${Colors.BOLD}EXAMPLES:${Colors.ENDC}
  ghost extension list
  ghost extension init my-extension
  ghost extension validate
  ghost gateway status --verbose
  ghost gateway metrics ghost-git-extension
  ghost gateway spans 100
  ghost commit --dry-run
  ghost audit --verbose
  ghost audit-log view --limit 100 --extension ghost-git-extension
  ghost console start --port 9876

${Colors.BOLD}TELEMETRY:${Colors.ENDC}
  Integrated OpenTelemetry observability:
  - Spans for each pipeline layer (Intercept→Auth→Audit→Execute)
  - Structured JSON logs with severity levels (INFO/WARN/ERROR/SECURITY_ALERT)
  - Metrics (request count, latency percentiles, rate limit violations)
  - HTTP/WebSocket server for real-time monitoring
  - Logs stored in ~/.ghost/telemetry/
  
  Start telemetry server:
    ghost console start
  
  HTTP endpoints:
    GET /health                  Health check
    GET /metrics                 All metrics
    GET /metrics/<extension-id>  Extension-specific metrics
    GET /spans                   Recent spans
    GET /logs?severity=<level>   Filter logs by severity
`);
    }

    /**
     * Start telemetry HTTP/WebSocket server.
     * 
     * ORCHESTRATION ROLE: Correct implementation
     * - Delegates to telemetryInstance.startServer()
     * - No direct server implementation, just coordination
     */
    async startTelemetryServer(port = 9876) {
        if (this.telemetryServer) {
            console.log(`${Colors.WARNING}Telemetry server already running${Colors.ENDC}`);
            return;
        }

        try {
            this.telemetryServer = this.telemetryInstance.startServer(port);
            console.log(`${Colors.GREEN}✓${Colors.ENDC} Telemetry server started on http://localhost:${port}`);
            console.log(`${Colors.DIM}  Available endpoints:${Colors.ENDC}`);
            console.log(`${Colors.DIM}    - GET  /health${Colors.ENDC}`);
            console.log(`${Colors.DIM}    - GET  /metrics${Colors.ENDC}`);
            console.log(`${Colors.DIM}    - GET  /metrics/<extension-id>${Colors.ENDC}`);
            console.log(`${Colors.DIM}    - GET  /spans${Colors.ENDC}`);
            console.log(`${Colors.DIM}    - GET  /logs?severity=<level>&limit=<n>${Colors.ENDC}`);
            console.log(`${Colors.DIM}    - WebSocket upgrades supported${Colors.ENDC}`);
        } catch (error) {
            console.error(`${Colors.FAIL}Failed to start telemetry server: ${error.message}${Colors.ENDC}`);
        }
    }

    /**
     * Stop telemetry HTTP/WebSocket server.
     * 
     * ORCHESTRATION ROLE: Correct implementation
     * - Delegates to telemetryInstance.stopServer()
     * - No direct server implementation, just coordination
     */
    async stopTelemetryServer() {
        if (this.telemetryServer) {
            this.telemetryInstance.stopServer();
            this.telemetryServer = null;
            console.log(`${Colors.GREEN}✓${Colors.ENDC} Telemetry server stopped`);
        }
    }

    /**
     * Clean up resources on shutdown.
     * 
     * ORCHESTRATION ROLE: Correct implementation
     * - Coordinates shutdown of all components
     * - Calls lifecycle methods on runtime, gateway, telemetry
     * - No direct business logic, only cleanup coordination
     */
    async cleanup() {
        if (this.telemetryServer) {
            await this.stopTelemetryServer();
        }
        
        if (this.runtime) {
            await this.runtime.shutdown();
        }
        
        if (this.gateway) {
            this.gateway.shutdown();
        }
    }
}

/**
 * Main entry point.
 * 
 * ORCHESTRATION ROLE: Correct implementation
 * - Initialize launcher
 * - Set up signal handlers for graceful shutdown
 * - Parse arguments and route to handlers
 * - Error handling and cleanup
 */
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
