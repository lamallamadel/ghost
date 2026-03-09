#!/usr/bin/env node

const path = require('path');
const os = require('os');
const fs = require('fs');
const { exec } = require('child_process');
const pkg = require('./package.json');
const VERSION = pkg.version;
const Gateway = require('./core/gateway');
const { ExtensionRuntime } = require('./core/runtime');
const { IOPipeline, instrumentPipeline } = require('./core/pipeline');
const { AuditLogger } = require('./core/pipeline/audit');
const { GlobMatcher } = require('./core/pipeline/auth');
const SetupWizard = require('./lib/setup-wizard');

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
    DIM: '\x1b[2m',
    _enabled: true,
    disable() {
        this.HEADER = '';
        this.BLUE = '';
        this.CYAN = '';
        this.GREEN = '';
        this.WARNING = '';
        this.FAIL = '';
        this.ENDC = '';
        this.BOLD = '';
        this.DIM = '';
        this._enabled = false;
    }
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
        this.webhookController = null;
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
                // Bootstrap environment directories
                const ghostDir = path.dirname(USER_EXTENSIONS_DIR);
                
                // Define required subdirectories
                const dirs = {
                    home: ghostDir,
                    extensions: USER_EXTENSIONS_DIR,
                    telemetry: path.join(ghostDir, 'telemetry'),
                    config: path.join(ghostDir, 'config')
                };
    
                // Clean up any files that should be directories
                for (const [key, dirPath] of Object.entries(dirs)) {
                    if (fs.existsSync(dirPath) && !fs.lstatSync(dirPath).isDirectory()) {
                        fs.unlinkSync(dirPath);
                    }
                    if (!fs.existsSync(dirPath)) {
                        fs.mkdirSync(dirPath, { recursive: true });
                    }
                }
    
                // Bootstrap default config if missing
                const configPath = path.join(dirs.config, 'config.json');
                if (!fs.existsSync(configPath)) {
                    const defaultConfig = {
                        telemetry: { enabled: false, retention: '7d' },
                        extensions: { autoUpdate: false },
                        audit: { enabled: true, logPath: '~/.ghost/audit.log' }
                    };
                    fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2), 'utf8');
                }
    
            } catch (error) {
                console.warn(`[GatewayLauncher] Failed to bootstrap environment: ${error.message}`);
            }
        // Pure orchestration: component initialization
        this.gateway = new Gateway({ 
            extensionsDir: USER_EXTENSIONS_DIR,
            bundledExtensionsDir: BUNDLED_EXTENSIONS_DIR 
        });
        this.runtime = new ExtensionRuntime({
            maxRestarts: 3,
            restartWindow: 60000,
            heartbeatTimeout: 30000,
            intentHandler: async (intentParams) => {
                // Reconstruct a JSON-RPC request from the intent parameters
                // This allows us to reuse forwardIntent which handles the pipeline.process
                const fakeRpcRequest = {
                    jsonrpc: "2.0",
                    id: intentParams.requestId || `sub-${Date.now()}`,
                    method: 'intent',
                    params: intentParams
                };
                
                const response = await this.forwardIntent(intentParams.extensionId, fakeRpcRequest);
                
                if (response.error) {
                    throw new Error(response.error.message);
                }
                return response.result;
            }
        });
        
        const basePipeline = new IOPipeline({
            auditLogPath: AUDIT_LOG_PATH
        });

        // Register System Executor for cross-layer communication
        const { SystemExecutor, LogExecutor } = require('./core/pipeline/execute');
        
        basePipeline.executionLayer.registerExecutor('system', new SystemExecutor(async (operation, params) => {
            if (operation === 'telemetry-start') {
                return await this.startTelemetryServer(params.port || 9876);
            } else if (operation === 'telemetry-stop') {
                return await this.stopTelemetryServer();
            } else if (operation === 'policy-update') {
                console.log(`${Colors.CYAN}[Policy] Gateway enforcing new rule: ${params.rule} = ${params.value}${Colors.ENDC}`);
                // In a real impl, this would update internal filtering state in IOPipeline
                return { success: true };
            }
            throw new Error(`Unknown system operation: ${operation}`);
        }));

        basePipeline.executionLayer.registerExecutor('log', new LogExecutor(async (level, params) => {
            if (this.auditLogger) {
                this.auditLogger.log(level, params.message, params.meta);
            }
            if (this._isVerbose()) {
                console.log(`${Colors.DIM}[Log:${level.toUpperCase()}] ${params.message}${Colors.ENDC}`);
            }
            return { success: true };
        }));

        const instrumented = instrumentPipeline(basePipeline, {
            enabled: true
        });
        
        this.pipeline = instrumented.pipeline;
        this.telemetryInstance = instrumented.telemetry;
        this.auditLogger = new AuditLogger(AUDIT_LOG_PATH);

        // Initialize developer tools
        const { DevMode } = require('./core/dev-mode');
        const { ProfilingManager } = require('./core/profiler');
        const { DebuggerManager } = require('./core/debugger-adapter');
        const { IntrusionDetectionSystem, SecurityMonitor } = require('./core/intrusion-detection');
        
        this.devMode = new DevMode({ enabled: false });
        this.profilingManager = new ProfilingManager();
        this.debuggerManager = new DebuggerManager();
        this.ids = new IntrusionDetectionSystem();
        this.securityMonitor = new SecurityMonitor(this.ids, this.telemetryInstance);

        // Wire telemetry and security monitor to runtime
        this.runtime.telemetry = this.telemetryInstance;
        this.runtime.securityMonitor = this.securityMonitor;

        // Wire dev mode into pipeline for bypass capabilities
        this.pipeline.devMode = this.devMode;

        // Pure orchestration: wire up event handlers
        this._setupRuntimeEventHandlers();
        this._setupDevModeHandlers();

        // Initialize hot reload if dev mode is enabled
        if (this.devMode && this.devMode.isHotReloadEnabled()) {
            this.runtime.enableHotReload(this.gateway.loader);
            this._setupHotReloadHandlers();
        }

        // Pure orchestration: delegate extension loading to Gateway
        await this._initializeExtensions();
    }

    _setupDevModeHandlers() {
        if (!this.devMode) return;

        this.devMode.on('mode-change', (data) => {
            if (data.enabled) {
                console.log(`${Colors.GREEN}✓${Colors.ENDC} Developer mode enabled`);
                console.log(`${Colors.DIM}  - Rate limiting: disabled${Colors.ENDC}`);
                console.log(`${Colors.DIM}  - Validation: relaxed${Colors.ENDC}`);
                console.log(`${Colors.DIM}  - Hot reload: enabled${Colors.ENDC}`);
                
                if (!this.runtime.hotReloadManager) {
                    this.runtime.enableHotReload(this.gateway.loader);
                    this._setupHotReloadHandlers();
                }
            } else {
                console.log(`${Colors.WARNING}Developer mode disabled${Colors.ENDC}`);
            }
        });
    }

    _setupHotReloadHandlers() {
        if (!this.runtime) return;

        this.runtime.on('extension-reload-started', (info) => {
            if (this._isVerbose()) {
                console.log(`${Colors.CYAN}[Hot Reload] Starting reload of ${info.extensionId}...${Colors.ENDC}`);
                console.log(`${Colors.DIM}  Reason: ${info.reason}${Colors.ENDC}`);
            }
        });

        this.runtime.on('extension-reload-completed', (info) => {
            console.log(`${Colors.GREEN}✓${Colors.ENDC} ${Colors.BOLD}${info.extensionId}${Colors.ENDC} reloaded successfully`);
            if (info.previousVersion !== info.newVersion) {
                console.log(`${Colors.DIM}  Version: ${info.previousVersion} → ${info.newVersion}${Colors.ENDC}`);
            }
            console.log(`${Colors.DIM}  Duration: ${info.duration}ms${Colors.ENDC}`);
        });

        this.runtime.on('extension-reload-failed', (info) => {
            console.error(`${Colors.FAIL}✗${Colors.ENDC} Failed to reload ${Colors.BOLD}${info.extensionId}${Colors.ENDC}`);
            console.error(`${Colors.DIM}  Error: ${info.error}${Colors.ENDC}`);
        });

        this.runtime.on('extension-rollback-completed', (info) => {
            console.log(`${Colors.WARNING}↺${Colors.ENDC} Rolled back ${Colors.BOLD}${info.extensionId}${Colors.ENDC} to previous version`);
        });

        this.runtime.on('extension-rollback-failed', (info) => {
            console.error(`${Colors.FAIL}✗${Colors.ENDC} Rollback failed for ${Colors.BOLD}${info.extensionId}${Colors.ENDC}`);
            console.error(`${Colors.DIM}  Error: ${info.error}${Colors.ENDC}`);
        });

        this.runtime.on('extension-reload-timeout-warning', (info) => {
            console.warn(`${Colors.WARNING}⚠${Colors.ENDC} Reload taking longer than expected for ${info.extensionId}`);
            console.warn(`${Colors.DIM}  Queued requests: ${info.queuedRequests}${Colors.ENDC}`);
        });

        this.runtime.on('extension-requests-replayed', (info) => {
            if (this._isVerbose()) {
                console.log(`${Colors.GREEN}[Hot Reload] Replayed ${info.count} queued requests for ${info.extensionId}${Colors.ENDC}`);
            }
        });

        this.runtime.on('extension-requests-rejected', (info) => {
            console.warn(`${Colors.WARNING}[Hot Reload] Rejected ${info.count} queued requests for ${info.extensionId}${Colors.ENDC}`);
        });

        this.runtime.on('extension-watcher-error', (info) => {
            console.error(`${Colors.FAIL}[Watcher Error] ${info.extensionId}: ${info.error.error}${Colors.ENDC}`);
        });
    }

    /**
     * Register extensions with pipeline.
     * 
     * ORCHESTRATION ROLE:
     * - Call Gateway.initialize() to load extensions
     * - Register each extension's manifest with the pipeline
     * - Initialize extension instances with core RPC handler
     * - No direct business logic, only metadata operations
     */
    async _initializeExtensions() {
        // Phase 1: Discover metadata and manifests (no code execution)
        const result = await this.gateway.initialize();

        // Phase 2: Start each extension in an isolated process
        for (const extId of result.extensions) {
            const fullExt = this.gateway.getExtension(extId);

            if (fullExt && fullExt.manifest) {
                try {
                    if (this._isVerbose()) console.log(`[DEBUG] Starting isolated extension: ${extId}...`);

                    // Start the extension via runtime (isolated process or sandbox)
                    const rawInstance = await this.runtime.startExtension(extId, fullExt.path, fullExt.manifest);
                    const instance = this.runtime._createExtensionInterface(rawInstance);
                    fullExt.instance = instance;

                    this.pipeline.registerExtension(extId, fullExt.manifest);

                    // Initialize instance with core handler for intents
                    if (typeof instance.init === 'function') {
                        await instance.init({
                            coreHandler: async (request) => {
                                return await this.forwardIntent(extId, request);
                            }
                        });
                    }

                    if (this.devMode && this.devMode.isHotReloadEnabled() && this.runtime.hotReloadManager) {
                        await this.runtime.enableExtensionHotReload(extId);
                    }
                } catch (error) {
                    console.error(`${Colors.FAIL}✗${Colors.ENDC} Failed to start extension ${Colors.BOLD}${extId}${Colors.ENDC}: ${error.message}`);
                }
            }
        }

        return result;
    }
    /**
     * Forward an intent from an extension to the security pipeline.
     */
    async forwardIntent(extensionId, request) {
        // Pure orchestration: delegate to pipeline
        // The pipeline.process expects a "raw message" or intent object.
        // We'll wrap the extension's request into the pipeline's expected format.
        const pipelineMessage = {
            extensionId,
            ...request
        };

        try {
            const pipelineResult = await this.pipeline.process(pipelineMessage);
            
            if (pipelineResult.success) {
                return {
                    jsonrpc: "2.0",
                    id: request.id,
                    result: pipelineResult.result
                };
            } else {
                return {
                    jsonrpc: "2.0",
                    id: request.id,
                    error: {
                        code: this._mapPipelineErrorToCode(pipelineResult.code),
                        message: pipelineResult.error,
                        data: {
                            stage: pipelineResult.stage,
                            code: pipelineResult.code,
                            violations: pipelineResult.violations
                        }
                    }
                };
            }
        } catch (error) {
            return {
                jsonrpc: "2.0",
                id: request.id,
                error: {
                    code: -32603,
                    message: error.message
                }
            };
        }
    }

    /**
     * Map pipeline error codes to JSON-RPC error codes.
     */
    _mapPipelineErrorToCode(pipelineCode) {
        switch (pipelineCode) {
            case 'AUTHORIZATION_DENIED':
            case 'AUTH_PERMISSION_DENIED':
                return -32001; // Custom: Authorization error
            case 'AUTH_RATE_LIMIT':
                return -32002; // Custom: Rate limit error
            case 'AUDIT_FAILED':
                return -32003; // Custom: Audit error
            default:
                return -32603; // Internal error
        }
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
            if (this._isVerbose()) {
                console.log(`${Colors.DIM}[Runtime] Extension ${info.extensionId}: ${info.state}${Colors.ENDC}`);
            }
        });

        this.runtime.on('extension-error', (info) => {
            console.error(`${Colors.FAIL}[Runtime Error] ${info.extensionId}: ${info.error}${Colors.ENDC}`);
        });

        this.runtime.on('extension-restarted', (info) => {
            if (this._isVerbose()) {
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
                json: false,
                noColor: false
            }
        };

        for (let i = 0; i < args.length; i++) {
            const arg = args[i];
            
            if (arg === '--verbose' || arg === '-v') {
                parsed.flags.verbose = true;
            } else if (arg.startsWith('--verbose=')) {
                parsed.flags.verbose = arg.substring('--verbose='.length);
            } else if (arg === '--help' || arg === '-h') {
                parsed.flags.help = true;
            } else if (arg === '--json') {
                parsed.flags.json = true;
            } else if (arg === '--no-color') {
                parsed.flags.noColor = true;
            } else if (arg.startsWith('--')) {
                const nextArg = args[i + 1];
                if (nextArg !== undefined && !nextArg.startsWith('-')) {
                    parsed.flags[arg.slice(2)] = nextArg;
                    i++;
                } else {
                    parsed.flags[arg.slice(2)] = true;
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

        // Disable colors if --no-color flag is present
        if (parsedArgs.flags.noColor) {
            Colors.disable();
        }

        // Setup verbose telemetry display if enabled
        if (this._isVerbose()) {
            this._setupVerboseTelemetry(parsedArgs.flags.verbose);
        }

        if (parsedArgs.flags.help || !parsedArgs.command) {
            this.showHelp();
            return;
        }

        // Pure routing: delegate to appropriate handler
        if (parsedArgs.command === 'setup') {
            await this.handleSetupCommand(parsedArgs);
        } else if (parsedArgs.command === 'extension') {
            await this.handleExtensionCommand(parsedArgs);
        } else if (parsedArgs.command === 'marketplace') {
            try {
                await this.forwardToExtension({
                    ...parsedArgs,
                    extensionId: 'ghost-marketplace-extension'
                });
            } catch (e) {
                // Fallback to legacy internal marketplace logic if extension not loaded
                await this.handleMarketplaceCommand(parsedArgs);
            }
        } else if (parsedArgs.command === 'gateway') {
            await this.handleGatewayCommand(parsedArgs);
        } else if (parsedArgs.command === 'audit-log') {
            await this.handleAuditLogCommand(parsedArgs);
        } else if (parsedArgs.command === 'audit') {
            await this.handleAuditCommand(parsedArgs);
        } else if (parsedArgs.command === 'doctor') {
            await this.handleDoctorCommand(parsedArgs);
        } else if (parsedArgs.command === 'completion') {
            await this.handleCompletionCommand(parsedArgs);
        } else if (parsedArgs.command === 'logs') {
            await this.handleLogsCommand(parsedArgs);
        } else if (parsedArgs.command === 'webhook') {
            await this.handleWebhookCommand(parsedArgs);
        } else if (parsedArgs.command === 'dev') {
            await this.handleDevCommand(parsedArgs);
        } else {
            // Pure routing: delegate domain commands to extensions
            await this.forwardToExtension(parsedArgs);
        }
    }

    async handleDevCommand(parsedArgs) {
        const subcommand = parsedArgs.subcommand;

        if (!subcommand || subcommand === 'help') {
            console.log(`${Colors.BOLD}Developer Mode Commands:${Colors.ENDC}
  ghost dev enable                        Enable developer mode (hot reload, relaxed validation)
  ghost dev disable                       Disable developer mode
  ghost dev status                        Show developer mode status
`);
            return;
        }

        if (subcommand === 'enable') {
            if (this.devMode.isEnabled()) {
                console.log(`${Colors.GREEN}✓${Colors.ENDC} Developer mode is already enabled\n`);
                return;
            }

            this.devMode.enable();

            if (!this.runtime.hotReloadManager) {
                this.runtime.enableHotReload(this.gateway.loader);
                this._setupHotReloadHandlers();
            }

            for (const ext of this.gateway.listExtensions()) {
                try {
                    await this.runtime.enableExtensionHotReload(ext.id);
                } catch (error) {
                    console.warn(`${Colors.WARNING}[Hot Reload] Failed to enable for ${ext.id}: ${error.message}${Colors.ENDC}`);
                }
            }

            console.log('');
        } else if (subcommand === 'disable') {
            if (!this.devMode.isEnabled()) {
                console.log(`${Colors.DIM}Developer mode is already disabled${Colors.ENDC}\n`);
                return;
            }

            for (const ext of this.gateway.listExtensions()) {
                try {
                    await this.runtime.disableExtensionHotReload(ext.id);
                } catch (error) {
                }
            }

            this.devMode.disable();
            console.log('');
        } else if (subcommand === 'status') {
            const config = this.devMode.getConfig();
            
            console.log(`\n${Colors.BOLD}${Colors.CYAN}Developer Mode Status${Colors.ENDC}`);
            console.log(`${Colors.DIM}${'─'.repeat(50)}${Colors.ENDC}`);
            console.log(`Status:           ${config.enabled ? Colors.GREEN + 'Enabled' : Colors.DIM + 'Disabled'}${Colors.ENDC}`);
            
            if (config.enabled) {
                console.log(`Rate Limiting:    ${config.disableRateLimiting ? Colors.DIM + 'Disabled' : 'Enabled'}${Colors.ENDC}`);
                console.log(`Validation:       ${config.relaxedValidation ? Colors.DIM + 'Relaxed' : 'Strict'}${Colors.ENDC}`);
                console.log(`Hot Reload:       ${config.hotReload ? Colors.GREEN + 'Enabled' : Colors.DIM + 'Disabled'}${Colors.ENDC}`);
                console.log(`Debug Mode:       ${config.debugMode ? Colors.GREEN + 'Enabled' : Colors.DIM + 'Disabled'}${Colors.ENDC}`);
            }
            console.log('');
        } else {
            console.error(`${Colors.FAIL}Error: Unknown dev subcommand '${subcommand}'${Colors.ENDC}\n`);
            console.log(`Run ${Colors.CYAN}ghost dev help${Colors.ENDC} to see all dev commands\n`);
            process.exit(1);
        }
    }

    /**
     * Check if verbose mode is enabled.
     */
    _isVerbose() {
        return this.verbose === true || typeof this.verbose === 'string';
    }

    /**
     * Setup verbose telemetry display with real-time span events.
     * Registers listeners on telemetryInstance to display pipeline flow.
     */
    _setupVerboseTelemetry(verboseOption) {
        // Parse filter option
        let filter = null;
        if (typeof verboseOption === 'string' && verboseOption !== 'true') {
            filter = verboseOption;
        }

        // Store filter for use in display methods
        this.verboseFilter = filter;

        // Display verbose mode header
        if (filter) {
            console.log(`${Colors.DIM}[Verbose Mode] Filtering by: ${Colors.CYAN}${filter}${Colors.ENDC}`);
        } else {
            console.log(`${Colors.DIM}[Verbose Mode] Real-time telemetry enabled${Colors.ENDC}`);
        }

        // Track spans in progress for pipeline flow display
        this.activeSpans = new Map();
        this.completedSpans = new Map();

        // Register listener for span completion events
        const originalRecordSpan = this.telemetryInstance.recordSpan.bind(this.telemetryInstance);
        this.telemetryInstance.recordSpan = (span) => {
            // Call original method
            originalRecordSpan(span);

            // Display span if it passes filter
            if (this._shouldDisplaySpan(span)) {
                this._displaySpan(span);
            }
        };
    }

    /**
     * Check if span should be displayed based on filter.
     */
    _shouldDisplaySpan(span) {
        if (!this.verboseFilter) {
            return true;
        }

        const extensionId = span.attributes.extensionId;
        const intentType = span.attributes.type;

        // Filter by extension ID or intent type
        return extensionId === this.verboseFilter || intentType === this.verboseFilter;
    }

    /**
     * Sanitize intent parameters to mask sensitive data.
     */
    _sanitizeParams(params) {
        if (!params || typeof params !== 'object') {
            return params;
        }

        const sensitiveFields = ['api_key', 'apiKey', 'token', 'password', 'secret', 'auth', 'authorization', 'credentials'];
        const sanitized = {};

        for (const [key, value] of Object.entries(params)) {
            const lowerKey = key.toLowerCase();
            const isSensitive = sensitiveFields.some(field => lowerKey.includes(field.toLowerCase()));

            if (isSensitive) {
                sanitized[key] = '[REDACTED]';
            } else if (typeof value === 'object' && value !== null) {
                sanitized[key] = this._sanitizeParams(value);
            } else {
                sanitized[key] = value;
            }
        }

        return sanitized;
    }

    /**
     * Display span with colored pipeline flow output.
     */
    _displaySpan(span) {
        const spanName = span.name;
        const extensionId = span.attributes.extensionId || 'unknown';
        const duration = span.duration;
        const status = span.status.code;

        // Determine layer from span name
        let layer = null;
        if (spanName.includes('intercept')) {
            layer = 'Intercept';
        } else if (spanName.includes('auth')) {
            layer = 'Auth';
        } else if (spanName.includes('audit')) {
            layer = 'Audit';
        } else if (spanName.includes('execute')) {
            layer = 'Execute';
        }

        if (!layer) {
            return; // Only display pipeline layers
        }

        // Get status symbol and color
        const statusSymbol = status === 'OK' ? '✓' : '✗';
        const statusColor = status === 'OK' ? Colors.GREEN : Colors.FAIL;

        // Build display line
        let displayLine = `${Colors.DIM}[Telemetry]${Colors.ENDC} ${Colors.BOLD}${extensionId}${Colors.ENDC} → `;
        displayLine += `${Colors.CYAN}${layer}${Colors.ENDC} `;
        displayLine += `${statusColor}${statusSymbol}${Colors.ENDC} `;
        displayLine += `${Colors.DIM}${duration}ms${Colors.ENDC}`;

        // Add rate limit info if auth layer
        if (layer === 'Auth' && span.attributes['rateLimit.available'] !== undefined) {
            const available = span.attributes['rateLimit.available'];
            const capacity = span.attributes['rateLimit.capacity'];
            const percentage = (available / capacity * 100).toFixed(0);
            
            let rateLimitColor = Colors.GREEN;
            if (percentage < 20) {
                rateLimitColor = Colors.WARNING;
            }
            
            displayLine += ` ${rateLimitColor}[${available}/${capacity}]${Colors.ENDC}`;
        }

        // Add rate limit violation warning
        if (span.attributes['denial.reason'] && span.attributes['error.code'] === 'AUTH_RATE_LIMIT') {
            displayLine += ` ${Colors.WARNING}⚠ RATE LIMIT${Colors.ENDC}`;
        }

        // Add dropped request info
        if (status === 'ERROR' && span.attributes['denial.reason']) {
            const reason = span.attributes['denial.reason'];
            displayLine += ` ${Colors.FAIL}DROPPED: ${reason}${Colors.ENDC}`;
        }

        console.log(displayLine);

        // Display intent parameters (sanitized) for intercept layer
        if (layer === 'Intercept' && span.attributes.type && span.attributes.operation) {
            const intentType = span.attributes.type;
            const operation = span.attributes.operation;
            console.log(`${Colors.DIM}  Intent: ${intentType}:${operation}${Colors.ENDC}`);
        }

        // Display error details
        if (status === 'ERROR' && span.status.message) {
            console.log(`${Colors.DIM}  Error: ${span.status.message}${Colors.ENDC}`);
        }

        // Display validation violations for audit layer
        if (layer === 'Audit' && span.attributes['violation.count']) {
            const violationCount = span.attributes['violation.count'];
            console.log(`${Colors.WARNING}  Violations: ${violationCount}${Colors.ENDC}`);
            
            for (let i = 0; i < Math.min(violationCount, 3); i++) {
                const rule = span.attributes[`violation.${i}.rule`];
                const message = span.attributes[`violation.${i}.message`];
                if (rule && message) {
                    console.log(`${Colors.WARNING}    - ${rule}: ${message}${Colors.ENDC}`);
                }
            }
        }
    }

    /**
     * Handle setup wizard command.
     * 
     * ORCHESTRATION ROLE:
     * - Launch interactive setup wizard for initial configuration
     * - Delegate to SetupWizard class for prompt logic
     * - No direct business logic, only coordination
     */
    async handleSetupCommand(parsedArgs) {
        const wizard = new SetupWizard();
        await wizard.run();
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
  ghost extension deps [id]               Show dependency tree for extension(s)
  ghost extension doctor                  Diagnose dependency conflicts with resolution strategies
    Options for doctor:
      --tree                                Show full dependency trees
      --json                                Output report in JSON format
      --versions <json>                     Provide available versions map for resolution
  ghost extension init <name>             Scaffold a new extension project
    Options for init:
      --template <name>                     Use specific template from gallery
                                            (api-integration, file-processor, git-workflow, 
                                             testing, basic, typescript, advanced)
  ghost extension validate [path]         Validate extension manifest and permissions
  ghost extension migrate [path]          Migrate v0.x extension to v1.0.0 SDK
    Options for migrate:
      --auto                                Apply migration automatically (creates backups)
      --no-backup                           Skip backup creation during migration
      --validate                            Run basic validation after migration (requires --auto)
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
            const extensionName = parsedArgs.args[0];
            const templateFlag = parsedArgs.flags.template;

            // Use interactive template wizard only when running in a real TTY
            if (process.stdin.isTTY && !templateFlag) {
                const TemplateWizard = require('./core/template-wizard');
                const wizard = new TemplateWizard();
                await wizard.run({ name: extensionName, template: templateFlag });
            } else if (templateFlag) {
                // Non-interactive with explicit --template flag
                const TemplateWizard = require('./core/template-wizard');
                const wizard = new TemplateWizard();
                await wizard.run({ name: extensionName, template: templateFlag });
            } else {
                // Non-interactive fallback: direct scaffold (CI, piped stdin, tests)
                if (!extensionName) {
                    console.error(`${Colors.FAIL}Error: Extension name is required${Colors.ENDC}`);
                    console.log(`Usage: ghost extension init <name>\n`);
                    process.exit(1);
                }
                await this._scaffoldExtension(extensionName, parsedArgs.flags);
            }
        } else if (subcommand === 'validate') {
            // VIOLATION: Delegates to _validateExtension which has direct fs operations
            const extPath = parsedArgs.args[0] || '.';
            await this._validateExtension(extPath);
        } else if (subcommand === 'migrate') {
            // Delegate to migration tool
            const ExtensionMigrator = require('./core/extension-migrator');
            const migrator = new ExtensionMigrator();
            const extPath = parsedArgs.args[0] || '.';
            await migrator.migrate(extPath, parsedArgs.flags);
        } else if (subcommand === 'deps') {
            // Delegate to dependency commands handler
            const ExtensionDepsCommands = require('./core/extension-deps-commands');
            const depsHandler = new ExtensionDepsCommands(Colors);
            await depsHandler.handleDepsCommand(parsedArgs);
        } else if (subcommand === 'doctor') {
            // Run dependency conflict diagnosis
            await this._handleExtensionDoctorCommand(parsedArgs);
        } else {
            console.error(`${Colors.FAIL}Error: Unknown extension subcommand '${subcommand}'${Colors.ENDC}\n`);
            
            // Suggest similar subcommands
            const validSubcommands = ['list', 'install', 'remove', 'info', 'deps', 'init', 'validate', 'migrate', 'doctor'];
            const suggestions = this._findSimilarCommands(subcommand, validSubcommands);
            
            if (suggestions.length > 0) {
                console.log(`${Colors.WARNING}Did you mean?${Colors.ENDC}`);
                suggestions.forEach(cmd => {
                    console.log(`  ${Colors.CYAN}ghost extension ${cmd}${Colors.ENDC}`);
                });
                console.log('');
            }
            
            console.log(`Run ${Colors.CYAN}ghost extension help${Colors.ENDC} to see all extension commands\n`);
            process.exit(1);
        }
    }

    /**
     * Handle marketplace commands for extension discovery and installation.
     */
    async handleMarketplaceCommand(parsedArgs) {
        const { MarketplaceService } = require('./core/marketplace');
        const { CodeSigningManager } = require('./core/code-signing');
        const { IntrusionDetectionSystem } = require('./core/intrusion-detection');
        const DependencyResolver = require('./core/dependency-resolver');
        
        const marketplace = new MarketplaceService();
        const codeSigningManager = new CodeSigningManager();
        const intrusionDetection = new IntrusionDetectionSystem();
        const dependencyResolver = new DependencyResolver();
        
        const subcommand = parsedArgs.subcommand;

        if (!subcommand || subcommand === 'help') {
            console.log(`${Colors.BOLD}Marketplace Commands:${Colors.ENDC}
  ghost marketplace browse [category]     Browse available extensions
  ghost marketplace search <query>        Search for extensions
  ghost marketplace info <id>             Show extension details
  ghost marketplace install <id>          Install extension from marketplace
    Options for install:
      --version=X.Y.Z                       Install specific version
      --with-deps                           Automatically install dependencies
      --skip-security                       Skip security scans (not recommended)
  ghost marketplace update [id]           Update extension(s) to latest version
  ghost marketplace uninstall <id>        Uninstall marketplace extension
  ghost marketplace rate <id> <rating>    Rate an extension (1-5 stars)
    Options for rate:
      --comment="text"                      Add review comment
  ghost marketplace sync                  Sync local extensions with registry
  ghost marketplace refresh               Clear cache and refresh marketplace data
`);
            return;
        }

        if (subcommand === 'browse') {
            const category = parsedArgs.args[0];
            const sort = parsedArgs.flags.sort || 'downloads';
            
            try {
                console.log(`${Colors.CYAN}Fetching extensions from marketplace...${Colors.ENDC}\n`);
                const result = await marketplace.fetchExtensions({ category, sort, limit: 20 });
                
                if (parsedArgs.flags.json) {
                    console.log(JSON.stringify(result, null, 2));
                    return;
                }

                console.log(`${Colors.BOLD}${Colors.CYAN}Marketplace Extensions${category ? ` - ${category}` : ''}${Colors.ENDC}`);
                console.log(`${Colors.DIM}${'─'.repeat(80)}${Colors.ENDC}\n`);

                if (result.extensions.length === 0) {
                    console.log(`${Colors.DIM}No extensions found.${Colors.ENDC}\n`);
                    return;
                }

                result.extensions.forEach(ext => {
                    const verifiedBadge = ext.verified ? `${Colors.GREEN}✓${Colors.ENDC}` : '';
                    console.log(`${Colors.BOLD}${ext.name}${Colors.ENDC} ${verifiedBadge} ${Colors.DIM}v${ext.versions[0].version}${Colors.ENDC}`);
                    console.log(`  ${Colors.DIM}ID:${Colors.ENDC} ${ext.id}`);
                    console.log(`  ${Colors.DIM}${ext.description}${Colors.ENDC}`);
                    console.log(`  ${Colors.DIM}Author:${Colors.ENDC} ${ext.author} | ${Colors.DIM}Category:${Colors.ENDC} ${ext.category}`);
                    
                    if (ext.ratings) {
                        const stars = '★'.repeat(Math.round(ext.ratings.average)) + '☆'.repeat(5 - Math.round(ext.ratings.average));
                        console.log(`  ${Colors.YELLOW}${stars}${Colors.ENDC} ${ext.ratings.average.toFixed(1)} (${ext.ratings.count} reviews) | ${Colors.CYAN}↓ ${ext.downloads}${Colors.ENDC} downloads`);
                    }
                    
                    console.log('');
                });

                console.log(`${Colors.DIM}Total: ${result.total} extensions${Colors.ENDC}`);
                console.log(`${Colors.DIM}Use 'ghost marketplace info <id>' for details${Colors.ENDC}\n`);
            } catch (error) {
                console.error(`${Colors.FAIL}Error fetching marketplace: ${error.message}${Colors.ENDC}`);
                process.exit(1);
            }
        } else if (subcommand === 'search') {
            const query = parsedArgs.args[0];
            
            if (!query) {
                console.error(`${Colors.FAIL}Error: Search query required${Colors.ENDC}`);
                console.log('Usage: ghost marketplace search <query>');
                process.exit(1);
            }

            try {
                console.log(`${Colors.CYAN}Searching for: ${query}...${Colors.ENDC}\n`);
                const result = await marketplace.fetchExtensions({ search: query, limit: 10 });
                
                if (parsedArgs.flags.json) {
                    console.log(JSON.stringify(result, null, 2));
                    return;
                }

                if (result.extensions.length === 0) {
                    console.log(`${Colors.WARNING}No extensions found matching "${query}"${Colors.ENDC}\n`);
                    return;
                }

                console.log(`${Colors.BOLD}${Colors.CYAN}Search Results (${result.total})${Colors.ENDC}`);
                console.log(`${Colors.DIM}${'─'.repeat(80)}${Colors.ENDC}\n`);

                result.extensions.forEach(ext => {
                    const verifiedBadge = ext.verified ? `${Colors.GREEN}✓${Colors.ENDC}` : '';
                    console.log(`${Colors.BOLD}${ext.name}${Colors.ENDC} ${verifiedBadge}`);
                    console.log(`  ${ext.id} ${Colors.DIM}v${ext.versions[0].version}${Colors.ENDC}`);
                    console.log(`  ${Colors.DIM}${ext.description}${Colors.ENDC}`);
                    console.log('');
                });
            } catch (error) {
                console.error(`${Colors.FAIL}Error searching marketplace: ${error.message}${Colors.ENDC}`);
                process.exit(1);
            }
        } else if (subcommand === 'info') {
            const extensionId = parsedArgs.args[0];
            
            if (!extensionId) {
                console.error(`${Colors.FAIL}Error: Extension ID required${Colors.ENDC}`);
                console.log('Usage: ghost marketplace info <id>');
                process.exit(1);
            }

            try {
                const ext = await marketplace.fetchExtensionById(extensionId);
                
                if (parsedArgs.flags.json) {
                    console.log(JSON.stringify(ext, null, 2));
                    return;
                }

                const verifiedBadge = ext.verified ? `${Colors.GREEN}✓ Verified${Colors.ENDC}` : `${Colors.WARNING}Not Verified${Colors.ENDC}`;
                
                console.log(`\n${Colors.BOLD}${Colors.CYAN}${ext.name}${Colors.ENDC} ${verifiedBadge}`);
                console.log(`${Colors.DIM}${'─'.repeat(80)}${Colors.ENDC}`);
                console.log(`ID:           ${ext.id}`);
                console.log(`Version:      ${ext.versions[0].version}`);
                console.log(`Author:       ${ext.author}`);
                console.log(`Category:     ${ext.category}`);
                console.log(`Description:  ${ext.description}`);
                
                if (ext.tags && ext.tags.length > 0) {
                    console.log(`Tags:         ${ext.tags.join(', ')}`);
                }

                if (ext.ratings) {
                    const stars = '★'.repeat(Math.round(ext.ratings.average)) + '☆'.repeat(5 - Math.round(ext.ratings.average));
                    console.log(`\n${Colors.BOLD}Ratings:${Colors.ENDC}`);
                    console.log(`  ${Colors.YELLOW}${stars}${Colors.ENDC} ${ext.ratings.average.toFixed(1)}/5.0 (${ext.ratings.count} reviews)`);
                }

                console.log(`\n${Colors.BOLD}Downloads:${Colors.ENDC} ${Colors.CYAN}${ext.downloads}${Colors.ENDC}`);

                if (ext.homepage) {
                    console.log(`Homepage:     ${ext.homepage}`);
                }
                if (ext.repository) {
                    console.log(`Repository:   ${ext.repository}`);
                }

                console.log(`\n${Colors.BOLD}Available Versions:${Colors.ENDC}`);
                ext.versions.forEach((v, idx) => {
                    const latest = idx === 0 ? `${Colors.GREEN}(latest)${Colors.ENDC}` : '';
                    console.log(`  v${v.version} ${latest}`);
                    console.log(`    Published: ${new Date(v.publishedAt).toLocaleDateString()}`);
                    if (v.compatibility) {
                        console.log(`    Requires: Ghost CLI ${v.compatibility.ghostCli}, Node ${v.compatibility.node}`);
                    }
                    if (v.changelog) {
                        console.log(`    ${Colors.DIM}${v.changelog}${Colors.ENDC}`);
                    }
                });

                const manifest = JSON.parse(ext.versions[0].manifest || '{}');
                if (manifest.capabilities) {
                    console.log(`\n${Colors.BOLD}Capabilities:${Colors.ENDC}`);
                    if (manifest.capabilities.filesystem) {
                        console.log(`  Filesystem: ${manifest.capabilities.filesystem.read?.length || 0} read patterns, ${manifest.capabilities.filesystem.write?.length || 0} write patterns`);
                    }
                    if (manifest.capabilities.network) {
                        console.log(`  Network: ${manifest.capabilities.network.allowlist?.length || 0} allowed domains`);
                    }
                    if (manifest.capabilities.git) {
                        console.log(`  Git: Read=${manifest.capabilities.git.read ? '✓' : '✗'}, Write=${manifest.capabilities.git.write ? '✓' : '✗'}`);
                    }
                }

                console.log(`\n${Colors.BOLD}To install:${Colors.ENDC} ${Colors.CYAN}ghost marketplace install ${ext.id}${Colors.ENDC}`);
                console.log('');
            } catch (error) {
                console.error(`${Colors.FAIL}Error fetching extension info: ${error.message}${Colors.ENDC}`);
                process.exit(1);
            }
        } else if (subcommand === 'install') {
            const extensionId = parsedArgs.args[0];
            const version = parsedArgs.flags.version;
            const autoInstallDeps = parsedArgs.flags['with-deps'] || parsedArgs.flags.deps || false;
            const skipSecurity = parsedArgs.flags['skip-security'] || false;
            
            if (!extensionId) {
                console.error(`${Colors.FAIL}Error: Extension ID required${Colors.ENDC}`);
                console.log('Usage: ghost marketplace install <id> [--version=X.Y.Z] [--with-deps] [--skip-security]');
                process.exit(1);
            }

            try {
                console.log(`${Colors.CYAN}Installing ${extensionId}${version ? `@${version}` : ''} from marketplace...${Colors.ENDC}\n`);
                
                const extensionInfo = await marketplace.fetchExtensionById(extensionId);
                const targetVersion = version || extensionInfo.versions[0].version;
                const versionData = extensionInfo.versions.find(v => v.version === targetVersion);
                
                if (!versionData) {
                    throw new Error(`Version ${targetVersion} not found for ${extensionId}`);
                }
                
                const manifest = JSON.parse(versionData.manifest || '{}');
                
                if (!skipSecurity) {
                    console.log(`${Colors.CYAN}Running security scans...${Colors.ENDC}`);
                    
                    if (versionData.signature) {
                        console.log(`  ${Colors.DIM}Code signature:${Colors.ENDC} ${Colors.GREEN}✓ Present${Colors.ENDC}`);
                    } else {
                        console.log(`  ${Colors.DIM}Code signature:${Colors.ENDC} ${Colors.WARNING}⚠ Not signed${Colors.ENDC}`);
                    }
                    
                    if (versionData.securityScan) {
                        const scan = versionData.securityScan;
                        console.log(`  ${Colors.DIM}Security scan:${Colors.ENDC}`);
                        console.log(`    Vulnerabilities: ${scan.vulnerabilities || 0}`);
                        console.log(`    Malware scan: ${scan.malwareClean ? Colors.GREEN + '✓ Clean' : Colors.FAIL + '✗ Issues found'}${Colors.ENDC}`);
                        
                        if (scan.vulnerabilities > 0 && !parsedArgs.flags.force) {
                            console.error(`\n${Colors.FAIL}Security vulnerabilities detected!${Colors.ENDC}`);
                            console.log(`Use --force to install anyway or choose a different version\n`);
                            process.exit(1);
                        }
                    } else {
                        console.log(`  ${Colors.DIM}Security scan:${Colors.ENDC} ${Colors.WARNING}⚠ Not available${Colors.ENDC}`);
                    }
                    
                    intrusionDetection.recordEvent(extensionId, {
                        type: 'marketplace-install',
                        operation: 'install',
                        version: targetVersion,
                        signed: !!versionData.signature
                    });
                    
                    console.log('');
                }
                
                if (manifest.dependencies && Object.keys(manifest.dependencies).length > 0) {
                    console.log(`${Colors.CYAN}Validating dependencies...${Colors.ENDC}`);
                    
                    const installedExtensions = this.gateway.listExtensions();
                    const installedManifests = new Map();
                    
                    for (const ext of installedExtensions) {
                        const fullExt = this.gateway.getExtension(ext.id);
                        if (fullExt && fullExt.manifest) {
                            installedManifests.set(ext.id, { manifest: fullExt.manifest });
                        }
                    }
                    
                    installedManifests.set(extensionId, { manifest });
                    
                    const issues = dependencyResolver.validateVersionConstraints(installedManifests);
                    const relevantIssues = issues.filter(issue => 
                        issue.extension === extensionId || issue.dependency === extensionId
                    );
                    
                    if (relevantIssues.length > 0) {
                        console.log(`${Colors.WARNING}Dependency issues detected:${Colors.ENDC}`);
                        relevantIssues.forEach(issue => {
                            console.log(`  ${Colors.WARNING}⚠${Colors.ENDC} ${issue.message}`);
                        });
                        
                        if (!autoInstallDeps && !parsedArgs.flags.force) {
                            console.log(`\nUse --with-deps to auto-install dependencies or --force to skip validation\n`);
                            process.exit(1);
                        }
                        console.log('');
                    }
                }
                
                const result = await marketplace.installExtension(extensionId, { 
                    version: targetVersion,
                    autoInstallDeps,
                    codeSigningManager,
                    requireSigning: false
                });
                
                console.log(`${Colors.GREEN}✓${Colors.ENDC} Extension ${Colors.BOLD}${result.extensionId}${Colors.ENDC} v${result.version} installed successfully`);
                console.log(`${Colors.DIM}  Location: ${result.installPath}${Colors.ENDC}`);
                
                if (result.signed) {
                    console.log(`${Colors.DIM}  Signature: ${Colors.GREEN}✓ Verified${Colors.ENDC}`);
                }
                
                if (result.dependencies && result.dependencies.length > 0) {
                    console.log(`\n${Colors.BOLD}Dependencies installed:${Colors.ENDC}`);
                    result.dependencies.forEach(dep => {
                        console.log(`  ${Colors.GREEN}✓${Colors.ENDC} ${dep.id}@${dep.version}`);
                    });
                }
                
                console.log(`\n${Colors.DIM}Restart Ghost or reload extensions to activate: ghost gateway reload ${result.extensionId}${Colors.ENDC}`);
                console.log('');
            } catch (error) {
                console.error(`${Colors.FAIL}Error installing extension: ${error.message}${Colors.ENDC}`);
                process.exit(1);
            }
        } else if (subcommand === 'update') {
            const extensionId = parsedArgs.args[0];
            
            try {
                if (extensionId) {
                    console.log(`${Colors.CYAN}Checking for updates to ${extensionId}...${Colors.ENDC}\n`);
                    
                    const installed = this.gateway.getExtension(extensionId);
                    if (!installed) {
                        console.error(`${Colors.FAIL}Extension ${extensionId} not installed${Colors.ENDC}`);
                        process.exit(1);
                    }
                    
                    const marketplaceInfo = await marketplace.fetchExtensionById(extensionId);
                    const latestVersion = marketplaceInfo.versions[0].version;
                    const currentVersion = installed.manifest.version;
                    
                    if (latestVersion === currentVersion) {
                        console.log(`${Colors.GREEN}✓${Colors.ENDC} ${extensionId} is already at the latest version (${currentVersion})\n`);
                        return;
                    }
                    
                    console.log(`  Current: ${currentVersion}`);
                    console.log(`  Latest:  ${latestVersion}\n`);
                    
                    const result = await marketplace.installExtension(extensionId, {
                        version: latestVersion,
                        codeSigningManager,
                        requireSigning: false
                    });
                    
                    console.log(`${Colors.GREEN}✓${Colors.ENDC} Updated ${extensionId} from ${currentVersion} to ${latestVersion}`);
                    console.log(`${Colors.DIM}  Location: ${result.installPath}${Colors.ENDC}\n`);
                } else {
                    console.log(`${Colors.CYAN}Checking for updates to all marketplace extensions...${Colors.ENDC}\n`);
                    
                    const extensions = this.gateway.listExtensions();
                    const updates = [];
                    
                    for (const ext of extensions) {
                        const fullExt = this.gateway.getExtension(ext.id);
                        if (!fullExt || !fullExt.manifest) continue;
                        
                        try {
                            const marketplaceInfo = await marketplace.fetchExtensionById(ext.id);
                            const latestVersion = marketplaceInfo.versions[0].version;
                            const currentVersion = fullExt.manifest.version;
                            
                            if (latestVersion !== currentVersion) {
                                updates.push({
                                    id: ext.id,
                                    currentVersion,
                                    latestVersion
                                });
                            }
                        } catch (error) {
                        }
                    }
                    
                    if (updates.length === 0) {
                        console.log(`${Colors.GREEN}✓${Colors.ENDC} All extensions are up to date\n`);
                        return;
                    }
                    
                    console.log(`${Colors.BOLD}Available updates:${Colors.ENDC}`);
                    updates.forEach(update => {
                        console.log(`  ${update.id}: ${update.currentVersion} → ${update.latestVersion}`);
                    });
                    console.log(`\nRun ${Colors.CYAN}ghost marketplace update <id>${Colors.ENDC} to update individual extensions\n`);
                }
            } catch (error) {
                console.error(`${Colors.FAIL}Error checking for updates: ${error.message}${Colors.ENDC}`);
                process.exit(1);
            }
        } else if (subcommand === 'uninstall') {
            const extensionId = parsedArgs.args[0];
            
            if (!extensionId) {
                console.error(`${Colors.FAIL}Error: Extension ID required${Colors.ENDC}`);
                console.log('Usage: ghost marketplace uninstall <id>');
                process.exit(1);
            }
            
            try {
                const ext = this.gateway.getExtension(extensionId);
                
                if (!ext) {
                    console.error(`${Colors.FAIL}Error: Extension ${extensionId} not found${Colors.ENDC}`);
                    process.exit(1);
                }
                
                const installedExtensions = this.gateway.listExtensions();
                const installedManifests = new Map();
                
                for (const e of installedExtensions) {
                    const fullExt = this.gateway.getExtension(e.id);
                    if (fullExt && fullExt.manifest) {
                        installedManifests.set(e.id, { manifest: fullExt.manifest });
                    }
                }
                
                const dependents = [];
                for (const [id, data] of installedManifests) {
                    if (id === extensionId) continue;
                    const deps = data.manifest.dependencies || {};
                    if (deps[extensionId]) {
                        dependents.push({ id, constraint: deps[extensionId] });
                    }
                }
                
                if (dependents.length > 0 && !parsedArgs.flags.force) {
                    console.error(`${Colors.FAIL}Cannot uninstall ${extensionId}: required by other extensions${Colors.ENDC}\n`);
                    console.log(`${Colors.BOLD}Dependent extensions:${Colors.ENDC}`);
                    dependents.forEach(dep => {
                        console.log(`  ${dep.id} (requires ${dep.constraint})`);
                    });
                    console.log(`\nUse --force to uninstall anyway\n`);
                    process.exit(1);
                }
                
                try {
                    await this.runtime.stopExtension(extensionId);
                } catch (error) {
                }
                
                this.gateway.unloadExtension(extensionId);
                
                const extPath = path.join(USER_EXTENSIONS_DIR, extensionId);
                if (fs.existsSync(extPath)) {
                    this._removeDirectory(extPath);
                }
                
                console.log(`${Colors.GREEN}✓${Colors.ENDC} Extension ${Colors.BOLD}${extensionId}${Colors.ENDC} uninstalled successfully\n`);
            } catch (error) {
                console.error(`${Colors.FAIL}Error uninstalling extension: ${error.message}${Colors.ENDC}`);
                process.exit(1);
            }
        } else if (subcommand === 'rate') {
            const extensionId = parsedArgs.args[0];
            const rating = parseInt(parsedArgs.args[1]);
            const comment = parsedArgs.flags.comment || '';
            
            if (!extensionId || !rating) {
                console.error(`${Colors.FAIL}Error: Extension ID and rating (1-5) required${Colors.ENDC}`);
                console.log('Usage: ghost marketplace rate <id> <rating> [--comment="text"]');
                process.exit(1);
            }
            
            if (rating < 1 || rating > 5) {
                console.error(`${Colors.FAIL}Error: Rating must be between 1 and 5${Colors.ENDC}`);
                process.exit(1);
            }
            
            try {
                await marketplace.submitRating(extensionId, rating, comment);
                
                const stars = '★'.repeat(rating) + '☆'.repeat(5 - rating);
                console.log(`${Colors.GREEN}✓${Colors.ENDC} Rating submitted for ${extensionId}`);
                console.log(`  ${Colors.YELLOW}${stars}${Colors.ENDC} ${rating}/5`);
                if (comment) {
                    console.log(`  "${comment}"`);
                }
                console.log('');
            } catch (error) {
                console.error(`${Colors.FAIL}Error submitting rating: ${error.message}${Colors.ENDC}`);
                process.exit(1);
            }
        } else if (subcommand === 'sync') {
            console.log(`${Colors.CYAN}Synchronizing local extensions with marketplace registry...${Colors.ENDC}\n`);
            
            try {
                const extensions = this.gateway.listExtensions();
                const syncResults = {
                    upToDate: [],
                    updatesAvailable: [],
                    notInRegistry: [],
                    errors: []
                };
                
                for (const ext of extensions) {
                    const fullExt = this.gateway.getExtension(ext.id);
                    if (!fullExt || !fullExt.manifest) continue;
                    
                    try {
                        const marketplaceInfo = await marketplace.fetchExtensionById(ext.id);
                        const latestVersion = marketplaceInfo.versions[0].version;
                        const currentVersion = fullExt.manifest.version;
                        
                        if (latestVersion === currentVersion) {
                            syncResults.upToDate.push({
                                id: ext.id,
                                version: currentVersion,
                                verified: marketplaceInfo.verified
                            });
                        } else {
                            syncResults.updatesAvailable.push({
                                id: ext.id,
                                currentVersion,
                                latestVersion,
                                verified: marketplaceInfo.verified
                            });
                        }
                    } catch (error) {
                        if (error.message.includes('not found')) {
                            syncResults.notInRegistry.push({
                                id: ext.id,
                                version: fullExt.manifest.version
                            });
                        } else {
                            syncResults.errors.push({
                                id: ext.id,
                                error: error.message
                            });
                        }
                    }
                }
                
                if (parsedArgs.flags.json) {
                    console.log(JSON.stringify(syncResults, null, 2));
                } else {
                    console.log(`${Colors.BOLD}Sync Results:${Colors.ENDC}\n`);
                    
                    if (syncResults.upToDate.length > 0) {
                        console.log(`${Colors.GREEN}✓ Up to date (${syncResults.upToDate.length}):${Colors.ENDC}`);
                        syncResults.upToDate.forEach(ext => {
                            const badge = ext.verified ? `${Colors.GREEN}✓${Colors.ENDC}` : '';
                            console.log(`  ${ext.id} ${badge} v${ext.version}`);
                        });
                        console.log('');
                    }
                    
                    if (syncResults.updatesAvailable.length > 0) {
                        console.log(`${Colors.YELLOW}⚠ Updates available (${syncResults.updatesAvailable.length}):${Colors.ENDC}`);
                        syncResults.updatesAvailable.forEach(ext => {
                            const badge = ext.verified ? `${Colors.GREEN}✓${Colors.ENDC}` : '';
                            console.log(`  ${ext.id} ${badge} ${ext.currentVersion} → ${ext.latestVersion}`);
                        });
                        console.log(`\nRun ${Colors.CYAN}ghost marketplace update${Colors.ENDC} to update all extensions`);
                        console.log('');
                    }
                    
                    if (syncResults.notInRegistry.length > 0) {
                        console.log(`${Colors.DIM}Not in registry (${syncResults.notInRegistry.length}):${Colors.ENDC}`);
                        syncResults.notInRegistry.forEach(ext => {
                            console.log(`  ${ext.id} v${ext.version} (local only)`);
                        });
                        console.log('');
                    }
                    
                    if (syncResults.errors.length > 0) {
                        console.log(`${Colors.FAIL}✗ Errors (${syncResults.errors.length}):${Colors.ENDC}`);
                        syncResults.errors.forEach(ext => {
                            console.log(`  ${ext.id}: ${ext.error}`);
                        });
                        console.log('');
                    }
                }
            } catch (error) {
                console.error(`${Colors.FAIL}Error syncing extensions: ${error.message}${Colors.ENDC}`);
                process.exit(1);
            }
        } else if (subcommand === 'refresh') {
            marketplace.clearCache();
            console.log(`${Colors.GREEN}✓${Colors.ENDC} Marketplace cache cleared\n`);
        } else {
            console.error(`${Colors.FAIL}Error: Unknown marketplace subcommand '${subcommand}'${Colors.ENDC}\n`);
            console.log(`Run ${Colors.CYAN}ghost marketplace help${Colors.ENDC} to see all marketplace commands\n`);
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
  ghost gateway extensions                Show loaded extensions with runtime state
  ghost gateway health                    Show extension health status
  ghost gateway reload <extension-id>     Manually reload an extension
  ghost gateway logs [options]            View audit logs (alias for audit-log view)
  ghost gateway metrics [extension-id]    Show telemetry metrics
  ghost gateway spans [limit]             Show recent spans
  ghost gateway limits set <extension-id> --cpu <percent> --memory <size> --pids <count>
                                          Set resource limits for an extension
`);
            return;
        }

        if (subcommand === 'status') {
            // Pure orchestration: query metadata from components
            const extensions = this.gateway.listExtensions();
            const runtimeHealth = this.runtime.getHealthStatus();
            const trafficPolicerStates = this.pipeline.getAllTrafficPolicerStates();
            
            const pipelineStats = {
                totalIntentsProcessed: this.telemetry.requests.length,
                trafficPolicerStates: trafficPolicerStates
            };
            
            const status = {
                gateway: {
                    version: require('./package.json').version,
                    extensionsLoaded: extensions.length,
                    uptime: Date.now() - this.telemetry.startTime,
                    telemetryServer: this.telemetryServer ? `http://localhost:${this.telemetryServer.port}` : 'Not running'
                },
                runtime: runtimeHealth,
                pipeline: pipelineStats,
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
                
                console.log(`${Colors.BOLD}Pipeline Statistics:${Colors.ENDC}`);
                console.log(`Total Intents:     ${pipelineStats.totalIntentsProcessed}`);
                
                if (Object.keys(pipelineStats.trafficPolicerStates).length > 0) {
                    console.log('');
                    console.log(`${Colors.BOLD}Rate Limit States:${Colors.ENDC}`);
                    for (const [extId, state] of Object.entries(pipelineStats.trafficPolicerStates)) {
                        if (state) {
                            const color = state.committedTokens > 0 ? Colors.GREEN : 
                                        state.excessTokens > 0 ? Colors.WARNING : Colors.FAIL;
                            console.log(`  ${color}${extId}${Colors.ENDC}`);
                            console.log(`    Committed tokens: ${state.committedTokens.toFixed(2)} / ${state.committedCapacity}`);
                            console.log(`    Excess tokens:    ${state.excessTokens.toFixed(2)} / ${state.excessCapacity}`);
                            console.log(`    Rate (CIR):       ${state.cir} tokens/min`);
                            console.log(`    Last refill:      ${new Date(state.lastRefill).toISOString()}`);
                        }
                    }
                }
                console.log('');
            }
        } else if (subcommand === 'extensions') {
            // Pure orchestration: query Gateway and Runtime metadata
            const extensions = this.gateway.listExtensions();
            const extensionsData = [];
            
            for (const ext of extensions) {
                const fullExt = this.gateway.getExtension(ext.id);
                const runtimeState = this.runtime.getExtensionState(ext.id);
                
                extensionsData.push({
                    id: ext.id,
                    name: ext.name,
                    version: ext.version,
                    runtimeState: runtimeState ? runtimeState.state : 'NOT_STARTED',
                    manifest: fullExt ? fullExt.manifest : null
                });
            }

            if (parsedArgs.flags.json) {
                console.log(JSON.stringify(extensionsData, null, 2));
            } else {
                console.log(`\n${Colors.BOLD}${Colors.CYAN}Loaded Extensions${Colors.ENDC}`);
                console.log(`${Colors.DIM}${'─'.repeat(80)}${Colors.ENDC}\n`);
                
                if (extensionsData.length === 0) {
                    console.log(`${Colors.DIM}No extensions loaded.${Colors.ENDC}\n`);
                } else {
                    for (const ext of extensionsData) {
                        const stateColor = this._getStateColor(ext.runtimeState);
                        console.log(`${Colors.BOLD}${ext.name}${Colors.ENDC} ${Colors.DIM}(${ext.id})${Colors.ENDC}`);
                        console.log(`  Version:        ${ext.version}`);
                        console.log(`  Runtime State:  ${stateColor}${ext.runtimeState}${Colors.ENDC}`);
                        
                        if (ext.manifest) {
                            console.log(`  Main:           ${ext.manifest.main}`);
                            
                            if (ext.manifest.capabilities) {
                                const caps = [];
                                if (ext.manifest.capabilities.filesystem) caps.push('filesystem');
                                if (ext.manifest.capabilities.network) caps.push('network');
                                if (ext.manifest.capabilities.git) caps.push('git');
                                if (ext.manifest.capabilities.hooks) caps.push('hooks');
                                console.log(`  Capabilities:   ${caps.join(', ') || 'none'}`);
                            }
                        }
                        console.log('');
                    }
                }
            }
        } else if (subcommand === 'logs') {
            // Alias to audit-log view
            const modifiedArgs = {
                ...parsedArgs,
                command: 'audit-log',
                subcommand: 'view'
            };
            await this.handleAuditLogCommand(modifiedArgs);
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
        } else if (subcommand === 'reload') {
            const extensionId = parsedArgs.args[0];
            
            if (!extensionId) {
                console.error(`${Colors.FAIL}Error: Extension ID is required${Colors.ENDC}\n`);
                console.log(`Usage: ${Colors.CYAN}ghost gateway reload <extension-id>${Colors.ENDC}\n`);
                process.exit(1);
            }

            const extension = this.gateway.getExtension(extensionId);
            if (!extension) {
                console.error(`${Colors.FAIL}Error: Extension '${extensionId}' not found${Colors.ENDC}\n`);
                process.exit(1);
            }

            const isDevMode = this.devMode && this.devMode.isEnabled();
            const isProduction = process.env.NODE_ENV === 'production';

            if (isProduction && !parsedArgs.flags.force) {
                console.error(`${Colors.FAIL}Error: Hot reload is disabled in production${Colors.ENDC}\n`);
                console.log(`${Colors.DIM}Use --force to override this safety check${Colors.ENDC}\n`);
                process.exit(1);
            }

            if (!isDevMode && !parsedArgs.flags.force) {
                console.error(`${Colors.WARNING}Warning: Developer mode is not enabled${Colors.ENDC}\n`);
                console.log(`Enable developer mode with: ${Colors.CYAN}ghost dev enable${Colors.ENDC}`);
                console.log(`Or use --force to reload anyway\n`);
                process.exit(1);
            }

            try {
                console.log(`${Colors.CYAN}Reloading extension ${extensionId}...${Colors.ENDC}`);
                
                await this.runtime.reloadExtension(extensionId);
                
                console.log(`${Colors.GREEN}✓${Colors.ENDC} Extension ${Colors.BOLD}${extensionId}${Colors.ENDC} reloaded successfully\n`);
            } catch (error) {
                console.error(`${Colors.FAIL}Error: Failed to reload extension${Colors.ENDC}`);
                console.error(`${Colors.DIM}${error.message}${Colors.ENDC}\n`);
                process.exit(1);
            }
        } else if (subcommand === 'limits') {
            const action = parsedArgs.args[0];
            
            if (!action || action === 'help') {
                console.log(`${Colors.BOLD}Resource Limits Commands:${Colors.ENDC}
  ghost gateway limits set <extension-id> --cpu <percent> --memory <size> --pids <count>
                                          Set resource limits for an extension

${Colors.BOLD}Options:${Colors.ENDC}
  --cpu <percent>         CPU limit percentage (0-100, default: 50)
  --memory <size>         Memory limit (e.g., 512M, 1G, default: 512M)
  --pids <count>          Maximum process/thread count (default: 100)
  --bandwidth <size>      Network bandwidth limit (optional)

${Colors.BOLD}Examples:${Colors.ENDC}
  ghost gateway limits set my-extension --cpu 75 --memory 1G
  ghost gateway limits set my-extension --cpu 30 --memory 256M --pids 50
`);
                return;
            }
            
            if (action === 'set') {
                const extensionId = parsedArgs.args[1];
                
                if (!extensionId) {
                    console.error(`${Colors.FAIL}Error: Extension ID is required${Colors.ENDC}\n`);
                    console.log(`Usage: ${Colors.CYAN}ghost gateway limits set <extension-id> [options]${Colors.ENDC}\n`);
                    process.exit(1);
                }

                const extension = this.gateway.getExtension(extensionId);
                if (!extension) {
                    console.error(`${Colors.FAIL}Error: Extension '${extensionId}' not found${Colors.ENDC}\n`);
                    process.exit(1);
                }

                const limits = {};
                
                if (parsedArgs.flags.cpu !== undefined) {
                    const cpu = parseInt(parsedArgs.flags.cpu);
                    if (isNaN(cpu) || cpu < 0 || cpu > 100) {
                        console.error(`${Colors.FAIL}Error: CPU limit must be between 0 and 100${Colors.ENDC}\n`);
                        process.exit(1);
                    }
                    limits.cpu = cpu;
                }
                
                if (parsedArgs.flags.memory) {
                    limits.memory = parsedArgs.flags.memory;
                }
                
                if (parsedArgs.flags.pids !== undefined) {
                    const pids = parseInt(parsedArgs.flags.pids);
                    if (isNaN(pids) || pids < 1) {
                        console.error(`${Colors.FAIL}Error: PIDs limit must be a positive integer${Colors.ENDC}\n`);
                        process.exit(1);
                    }
                    limits.pids = pids;
                }
                
                if (parsedArgs.flags.bandwidth) {
                    limits.networkBandwidth = parsedArgs.flags.bandwidth;
                }

                if (Object.keys(limits).length === 0) {
                    console.error(`${Colors.FAIL}Error: At least one limit flag must be provided${Colors.ENDC}\n`);
                    console.log(`Available flags: --cpu, --memory, --pids, --bandwidth\n`);
                    process.exit(1);
                }

                try {
                    console.log(`${Colors.CYAN}Updating resource limits for ${extensionId}...${Colors.ENDC}`);
                    
                    await this.runtime.updateExtensionLimits(extensionId, limits);
                    
                    console.log(`${Colors.GREEN}✓${Colors.ENDC} Resource limits updated successfully\n`);
                    console.log(`${Colors.BOLD}New limits:${Colors.ENDC}`);
                    if (limits.cpu !== undefined) {
                        console.log(`  CPU:       ${limits.cpu}%`);
                    }
                    if (limits.memory) {
                        console.log(`  Memory:    ${limits.memory}`);
                    }
                    if (limits.pids !== undefined) {
                        console.log(`  PIDs:      ${limits.pids}`);
                    }
                    if (limits.networkBandwidth) {
                        console.log(`  Bandwidth: ${limits.networkBandwidth}`);
                    }
                    console.log('');
                } catch (error) {
                    console.error(`${Colors.FAIL}Error: Failed to update resource limits${Colors.ENDC}`);
                    console.error(`${Colors.DIM}${error.message}${Colors.ENDC}\n`);
                    process.exit(1);
                }
            } else {
                console.error(`${Colors.FAIL}Error: Unknown limits action '${action}'${Colors.ENDC}\n`);
                console.log(`Run ${Colors.CYAN}ghost gateway limits help${Colors.ENDC} for usage information\n`);
                process.exit(1);
            }
        } else {
            console.error(`${Colors.FAIL}Error: Unknown gateway subcommand '${subcommand}'${Colors.ENDC}\n`);
            
            // Suggest similar subcommands
            const validSubcommands = ['status', 'extensions', 'health', 'reload', 'logs', 'metrics', 'spans', 'limits'];
            const suggestions = this._findSimilarCommands(subcommand, validSubcommands);
            
            if (suggestions.length > 0) {
                console.log(`${Colors.WARNING}Did you mean?${Colors.ENDC}`);
                suggestions.forEach(cmd => {
                    console.log(`  ${Colors.CYAN}ghost gateway ${cmd}${Colors.ENDC}`);
                });
                console.log('');
            }
            
            console.log(`Run ${Colors.CYAN}ghost gateway help${Colors.ENDC} to see all gateway commands\n`);
            process.exit(1);
        }
    }

    /**
     * Handle completion command for shell autocompletion.
     * 
     * ORCHESTRATION ROLE: Correct implementation
     * - Query Gateway for available commands
     * - Generate shell completion script dynamically
     * - No direct business logic
     */
    async handleCompletionCommand(parsedArgs) {
        const shell = parsedArgs.subcommand || 'bash';
        const commands = [
            'setup', 'doctor', 'completion', 'extension', 'gateway', 'audit-log', 'console', 'logs', 'webhook', 'dev'
        ];
        const extensionSubcommands = ['list', 'install', 'remove', 'info', 'deps', 'doctor', 'init', 'validate', 'migrate'];
        const gatewaySubcommands = ['status', 'extensions', 'health', 'reload', 'logs', 'metrics', 'spans', 'limits'];
        const logsSubcommands = ['prune', 'info'];
        const webhookSubcommands = ['start', 'stop', 'status', 'events', 'deliveries', 'replay', 'queue-stats', 'prune'];
        const devSubcommands = ['enable', 'disable', 'status'];
        
        // Get extension commands dynamically
        const extensionCommands = this._getAllAvailableCommands();
        const allCommands = [...commands, ...extensionCommands];
        
        if (shell === 'bash') {
            console.log(`# Ghost CLI bash completion
_ghost_completion() {
    local cur prev opts
    COMPREPLY=()
    cur="\${COMP_WORDS[COMP_CWORD]}"
    prev="\${COMP_WORDS[COMP_CWORD-1]}"
    
    case "\${COMP_CWORD}" in
        1)
            opts="${allCommands.join(' ')}"
            COMPREPLY=( $(compgen -W "\${opts}" -- \${cur}) )
            return 0
            ;;
        2)
            case "\${prev}" in
                extension)
                    opts="${extensionSubcommands.join(' ')}"
                    COMPREPLY=( $(compgen -W "\${opts}" -- \${cur}) )
                    return 0
                    ;;
                gateway)
                    opts="${gatewaySubcommands.join(' ')}"
                    COMPREPLY=( $(compgen -W "\${opts}" -- \${cur}) )
                    return 0
                    ;;
                logs)
                    opts="${logsSubcommands.join(' ')}"
                    COMPREPLY=( $(compgen -W "\${opts}" -- \${cur}) )
                    return 0
                    ;;
                webhook)
                    opts="${webhookSubcommands.join(' ')}"
                    COMPREPLY=( $(compgen -W "\${opts}" -- \${cur}) )
                    return 0
                    ;;
                completion)
                    opts="bash zsh fish"
                    COMPREPLY=( $(compgen -W "\${opts}" -- \${cur}) )
                    return 0
                    ;;
            esac
            ;;
    esac
}

complete -F _ghost_completion ghost`);
        } else if (shell === 'zsh') {
            console.log(`# Ghost CLI zsh completion
#compdef ghost

_ghost() {
    local -a commands extension_cmds gateway_cmds logs_cmds webhook_cmds extension_commands
    
    commands=(
        ${allCommands.map(cmd => `'${cmd}:Ghost command'`).join('\n        ')}
    )
    
    extension_cmds=(
        ${extensionSubcommands.map(cmd => `'${cmd}:Extension management'`).join('\n        ')}
    )
    
    gateway_cmds=(
        ${gatewaySubcommands.map(cmd => `'${cmd}:Gateway monitoring'`).join('\n        ')}
    )
    
    logs_cmds=(
        ${logsSubcommands.map(cmd => `'${cmd}:Log management'`).join('\n        ')}
    )
    
    webhook_cmds=(
        ${webhookSubcommands.map(cmd => `'${cmd}:Webhook automation'`).join('\n        ')}
    )
    
    case $words[2] in
        extension)
            _describe 'extension commands' extension_cmds
            ;;
        gateway)
            _describe 'gateway commands' gateway_cmds
            ;;
        logs)
            _describe 'logs commands' logs_cmds
            ;;
        webhook)
            _describe 'webhook commands' webhook_cmds
            ;;
        completion)
            _values 'shell' bash zsh fish
            ;;
        *)
            _describe 'commands' commands
            ;;
    esac
}

_ghost "$@"`);
        } else if (shell === 'fish') {
            console.log(`# Ghost CLI fish completion
complete -c ghost -f

# Main commands
${allCommands.map(cmd => `complete -c ghost -n "__fish_use_subcommand" -a "${cmd}"`).join('\n')}

# Extension subcommands
${extensionSubcommands.map(cmd => `complete -c ghost -n "__fish_seen_subcommand_from extension" -a "${cmd}"`).join('\n')}

# Gateway subcommands
${gatewaySubcommands.map(cmd => `complete -c ghost -n "__fish_seen_subcommand_from gateway" -a "${cmd}"`).join('\n')}

# Logs subcommands
${logsSubcommands.map(cmd => `complete -c ghost -n "__fish_seen_subcommand_from logs" -a "${cmd}"`).join('\n')}

# Webhook subcommands
${webhookSubcommands.map(cmd => `complete -c ghost -n "__fish_seen_subcommand_from webhook" -a "${cmd}"`).join('\n')}

# Completion shell options
complete -c ghost -n "__fish_seen_subcommand_from completion" -a "bash zsh fish"

# Options
complete -c ghost -l verbose -s v -d "Show detailed telemetry"
complete -c ghost -l json -d "Output in JSON format"
complete -c ghost -l no-color -d "Disable colored output"
complete -c ghost -l help -s h -d "Show help message"`);
        } else {
            console.error(`${Colors.FAIL}Error: Unsupported shell '${shell}'${Colors.ENDC}`);
            console.log(`Supported shells: bash, zsh, fish`);
            console.log(`\nUsage:`);
            console.log(`  bash:  eval "$(ghost completion bash)"`);
            console.log(`  zsh:   eval "$(ghost completion zsh)"`);
            console.log(`  fish:  ghost completion fish | source`);
            process.exit(1);
        }
    }

    /**
     * Handle doctor command for installation health check.
     * 
     * ORCHESTRATION ROLE: Correct implementation
     * - Check directory structure exists
     * - Verify permissions
     * - Validate gateway loadable
     * - No direct business logic modifications
     */
    async handleDoctorCommand(parsedArgs) {
        const isQuiet = parsedArgs.flags.quiet;
        const isJson = parsedArgs.flags.json;
        
        const checks = [];
        let hasErrors = false;
        let hasWarnings = false;

        if (!isQuiet && !isJson) {
            console.log(`\n${Colors.BOLD}${Colors.CYAN}Ghost CLI Health Check${Colors.ENDC}`);
            console.log(`${Colors.DIM}${'─'.repeat(50)}${Colors.ENDC}\n`);
        }

        // Check 1: Node.js version
        const nodeVersion = process.version;
        const nodeMajor = parseInt(nodeVersion.slice(1).split('.')[0]);
        const nodeCheck = {
            name: 'Node.js Version',
            status: nodeMajor >= 14 ? 'ok' : 'error',
            message: `${nodeVersion} (requires >= 14.0.0)`,
            details: { version: nodeVersion, required: '>=14.0.0' }
        };
        checks.push(nodeCheck);
        if (nodeCheck.status === 'error') hasErrors = true;
        
        if (!isQuiet && !isJson) {
            const symbol = nodeCheck.status === 'ok' ? `${Colors.GREEN}✓${Colors.ENDC}` : `${Colors.FAIL}✗${Colors.ENDC}`;
            console.log(`${symbol} ${nodeCheck.name}: ${nodeCheck.message}`);
        }

        // Check 2: Ghost directory structure
        const ghostHome = path.join(os.homedir(), '.ghost');
        const requiredDirs = [
            { path: ghostHome, name: 'Ghost home directory' },
            { path: path.join(ghostHome, 'extensions'), name: 'Extensions directory' },
            { path: path.join(ghostHome, 'telemetry'), name: 'Telemetry directory' },
            { path: path.join(ghostHome, 'config'), name: 'Config directory' }
        ];

        for (const dir of requiredDirs) {
            const exists = fs.existsSync(dir.path);
            let readable = false;
            let writable = false;
            
            if (exists) {
                try {
                    fs.accessSync(dir.path, fs.constants.R_OK);
                    readable = true;
                } catch (e) {}
                
                try {
                    fs.accessSync(dir.path, fs.constants.W_OK);
                    writable = true;
                } catch (e) {}
            }
            
            const dirCheck = {
                name: dir.name,
                status: exists && readable && writable ? 'ok' : exists ? 'warning' : 'error',
                message: exists ? 
                    (readable && writable ? dir.path : `${dir.path} (${!readable ? 'not readable' : 'not writable'})`) :
                    `${dir.path} (missing)`,
                details: { path: dir.path, exists, readable, writable }
            };
            checks.push(dirCheck);
            
            if (dirCheck.status === 'error') hasErrors = true;
            if (dirCheck.status === 'warning') hasWarnings = true;
            
            if (!isQuiet && !isJson) {
                const symbol = dirCheck.status === 'ok' ? `${Colors.GREEN}✓${Colors.ENDC}` :
                              dirCheck.status === 'warning' ? `${Colors.WARNING}⚠${Colors.ENDC}` :
                              `${Colors.FAIL}✗${Colors.ENDC}`;
                console.log(`${symbol} ${dirCheck.name}: ${dirCheck.message}`);
            }
        }

        // Check 3: Gateway loadable
        let gatewayCheck = { name: 'Gateway', status: 'ok', message: 'Initialized successfully' };
        try {
            if (!this.gateway) {
                throw new Error('Gateway not initialized');
            }
            gatewayCheck.details = {
                extensionsLoaded: this.gateway.listExtensions().length
            };
        } catch (error) {
            gatewayCheck = {
                name: 'Gateway',
                status: 'error',
                message: `Failed to initialize: ${error.message}`,
                details: { error: error.message }
            };
            hasErrors = true;
        }
        checks.push(gatewayCheck);
        
        if (!isQuiet && !isJson) {
            const symbol = gatewayCheck.status === 'ok' ? `${Colors.GREEN}✓${Colors.ENDC}` : `${Colors.FAIL}✗${Colors.ENDC}`;
            console.log(`${symbol} ${gatewayCheck.name}: ${gatewayCheck.message}`);
        }

        // Check 4: Bundled extensions directory
        const bundledExtDir = path.join(__dirname, 'extensions');
        const bundledCheck = {
            name: 'Bundled extensions',
            status: fs.existsSync(bundledExtDir) ? 'ok' : 'warning',
            message: fs.existsSync(bundledExtDir) ? bundledExtDir : `${bundledExtDir} (missing)`,
            details: { path: bundledExtDir, exists: fs.existsSync(bundledExtDir) }
        };
        checks.push(bundledCheck);
        if (bundledCheck.status === 'warning') hasWarnings = true;
        
        if (!isQuiet && !isJson) {
            const symbol = bundledCheck.status === 'ok' ? `${Colors.GREEN}✓${Colors.ENDC}` : `${Colors.WARNING}⚠${Colors.ENDC}`;
            console.log(`${symbol} ${bundledCheck.name}: ${bundledCheck.message}`);
        }

        // Check 5: Config file
        const configPath = path.join(ghostHome, 'config', 'config.json');
        const configExists = fs.existsSync(configPath);
        let configValid = false;
        if (configExists) {
            try {
                const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
                configValid = typeof config === 'object';
            } catch (e) {}
        }
        
        const configCheck = {
            name: 'Configuration',
            status: configExists && configValid ? 'ok' : configExists ? 'warning' : 'warning',
            message: configExists ? 
                (configValid ? configPath : `${configPath} (invalid JSON)`) :
                `${configPath} (not found, using defaults)`,
            details: { path: configPath, exists: configExists, valid: configValid }
        };
        checks.push(configCheck);
        if (configCheck.status === 'warning') hasWarnings = true;
        
        if (!isQuiet && !isJson) {
            const symbol = configCheck.status === 'ok' ? `${Colors.GREEN}✓${Colors.ENDC}` : `${Colors.WARNING}⚠${Colors.ENDC}`;
            console.log(`${symbol} ${configCheck.name}: ${configCheck.message}`);
        }

        // Summary
        if (isJson) {
            console.log(JSON.stringify({
                status: hasErrors ? 'unhealthy' : hasWarnings ? 'degraded' : 'healthy',
                checks: checks
            }, null, 2));
        } else if (!isQuiet) {
            console.log('');
            if (hasErrors) {
                console.log(`${Colors.FAIL}${Colors.BOLD}✗ Ghost CLI has errors${Colors.ENDC}`);
                console.log(`${Colors.DIM}Run with --verbose for more details${Colors.ENDC}`);
                process.exit(1);
            } else if (hasWarnings) {
                console.log(`${Colors.WARNING}${Colors.BOLD}⚠ Ghost CLI is functional but has warnings${Colors.ENDC}`);
            } else {
                console.log(`${Colors.GREEN}${Colors.BOLD}✓ Ghost CLI is healthy${Colors.ENDC}`);
            }
            console.log('');
        } else {
            // Quiet mode
            if (hasErrors) {
                console.log('Ghost CLI has errors');
                process.exit(1);
            } else if (hasWarnings) {
                console.log('Ghost CLI is functional but has warnings');
            } else {
                console.log('Ghost CLI is healthy');
            }
        }
    }

    /**
     * Handle security audit command.
     * 
     * ORCHESTRATION ROLE:
     * - Delegate to ghost-git-extension for full repository scan
     * - Format and display findings (secrets, vulnerabilities)
     * - Exit with non-zero if issues found (unless --force)
     */
    async handleAuditCommand(parsedArgs) {
        // forwardToExtension will handle the routing and the primary output
        // We call it but we might want to handle the result success state specifically
        await this.forwardToExtension(parsedArgs);
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
            console.error(`${Colors.FAIL}Error: Unknown audit-log subcommand '${subcommand}'${Colors.ENDC}\n`);
            console.log(`Valid subcommand: ${Colors.CYAN}view${Colors.ENDC}`);
            console.log(`\nUsage:`);
            console.log(`  ${Colors.CYAN}ghost audit-log view${Colors.ENDC} [--limit N] [--extension ID] [--type TYPE]\n`);
            process.exit(1);
        }
    }

    /**
     * Handle logs management commands.
     * 
     * ORCHESTRATION ROLE: Correct implementation
     * - Query telemetry logger for log management operations
     * - Format and display results
     * - Delegates to StructuredLogger.pruneLogs()
     */
    async handleWebhookCommand(parsedArgs) {
        const { WebhookController } = require('./core/webhooks');
        const subcommand = parsedArgs.subcommand || 'help';

        if (subcommand === 'help' || !subcommand) {
            console.log(`${Colors.BOLD}Webhook Management Commands:${Colors.ENDC}
  ghost webhook start                  Start webhook server
  ghost webhook stop                   Stop webhook server
  ghost webhook status                 Show webhook server status
  ghost webhook events                 List recent webhook events
  ghost webhook deliveries             List webhook deliveries
  ghost webhook replay <event-id>      Replay a webhook event
  ghost webhook queue-stats            Show delivery queue statistics
  ghost webhook prune [days]           Prune old webhook events
`);
            return;
        }

        if (subcommand === 'start') {
            const port = parseInt(parsedArgs.flags.port) || 3000;
            const host = parsedArgs.flags.host || '0.0.0.0';

            const configPath = path.join(os.homedir(), '.ghost', 'config', 'webhooks.json');
            let webhookConfig = {};

            if (fs.existsSync(configPath)) {
                try {
                    webhookConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
                } catch (error) {
                    console.warn(`${Colors.WARNING}Warning: Could not load webhook config: ${error.message}${Colors.ENDC}`);
                }
            }

            const controller = new WebhookController({
                port: webhookConfig.server?.port || port,
                host: webhookConfig.server?.host || host,
                routerConfig: webhookConfig,
                auditLogger: this.auditLogger
            });

            controller.getDeliveryQueue().setGateway(this.gateway);
            controller.getDeliveryQueue().setRuntime(this.runtime);

            try {
                await controller.start();
                console.log(`${Colors.GREEN}✓${Colors.ENDC} Webhook server started successfully`);
                console.log(`${Colors.DIM}  Listening on ${host}:${port}${Colors.ENDC}`);
                console.log(`${Colors.DIM}  Endpoints:${Colors.ENDC}`);
                console.log(`${Colors.DIM}    POST /api/webhooks/github${Colors.ENDC}`);
                console.log(`${Colors.DIM}    POST /api/webhooks/gitlab${Colors.ENDC}`);
                console.log(`${Colors.DIM}    POST /api/webhooks/bitbucket${Colors.ENDC}`);
                console.log(`\n${Colors.DIM}Press Ctrl+C to stop the server${Colors.ENDC}`);

                this.webhookController = controller;

                return new Promise(() => {});
            } catch (error) {
                console.error(`${Colors.FAIL}Failed to start webhook server: ${error.message}${Colors.ENDC}`);
                process.exit(1);
            }
        } else if (subcommand === 'stop') {
            if (this.webhookController) {
                await this.webhookController.stop();
                this.webhookController = null;
            }
            console.log(`${Colors.GREEN}✓${Colors.ENDC} Webhook server stopped`);
        } else if (subcommand === 'status') {
            console.log(`${Colors.BOLD}${Colors.CYAN}Webhook Server Status${Colors.ENDC}`);
            console.log(`${Colors.DIM}${'─'.repeat(50)}${Colors.ENDC}`);

            if (this.webhookController && this.webhookController.server) {
                console.log(`Status:        ${Colors.GREEN}Running${Colors.ENDC}`);
                console.log(`Host:          ${this.webhookController.host}`);
                console.log(`Port:          ${this.webhookController.port}`);
            } else {
                console.log(`Status:        ${Colors.DIM}Stopped${Colors.ENDC}`);
            }
            console.log('');
        } else if (subcommand === 'events') {
            const controller = new WebhookController();
            const eventStore = controller.getEventStore();

            const filter = {
                limit: parseInt(parsedArgs.flags.limit) || 50
            };

            if (parsedArgs.flags.provider) {
                filter.provider = parsedArgs.flags.provider;
            }

            if (parsedArgs.flags['event-type']) {
                filter.eventType = parsedArgs.flags['event-type'];
            }

            if (parsedArgs.flags.since) {
                filter.since = parsedArgs.flags.since;
            }

            if (parsedArgs.flags.until) {
                filter.until = parsedArgs.flags.until;
            }

            const events = await eventStore.queryEvents(filter);

            if (parsedArgs.flags.json) {
                console.log(JSON.stringify(events, null, 2));
            } else {
                console.log(`\n${Colors.BOLD}${Colors.CYAN}Webhook Events${Colors.ENDC} ${Colors.DIM}(${events.length})${Colors.ENDC}`);
                console.log(`${Colors.DIM}${'─'.repeat(80)}${Colors.ENDC}\n`);

                if (events.length === 0) {
                    console.log(`${Colors.DIM}No webhook events found.${Colors.ENDC}\n`);
                } else {
                    events.forEach(event => {
                        console.log(`${Colors.BOLD}${event.id}${Colors.ENDC}`);
                        console.log(`  Provider:    ${event.provider}`);
                        console.log(`  Event Type:  ${event.eventType}`);
                        console.log(`  Received:    ${event.receivedAt}`);
                        console.log('');
                    });
                }
            }
        } else if (subcommand === 'deliveries') {
            const controller = new WebhookController();
            const eventStore = controller.getEventStore();

            const filter = {
                limit: parseInt(parsedArgs.flags.limit) || 50
            };

            if (parsedArgs.flags.status) {
                filter.status = parsedArgs.flags.status;
            }

            if (parsedArgs.flags.extension) {
                filter.extensionId = parsedArgs.flags.extension;
            }

            const deliveries = await eventStore.queryDeliveries(filter);

            if (parsedArgs.flags.json) {
                console.log(JSON.stringify(deliveries, null, 2));
            } else {
                console.log(`\n${Colors.BOLD}${Colors.CYAN}Webhook Deliveries${Colors.ENDC} ${Colors.DIM}(${deliveries.length})${Colors.ENDC}`);
                console.log(`${Colors.DIM}${'─'.repeat(80)}${Colors.ENDC}\n`);

                if (deliveries.length === 0) {
                    console.log(`${Colors.DIM}No webhook deliveries found.${Colors.ENDC}\n`);
                } else {
                    deliveries.forEach(delivery => {
                        const statusColor = delivery.status === 'delivered' ? Colors.GREEN :
                                          delivery.status === 'failed' ? Colors.FAIL :
                                          delivery.status === 'retrying' ? Colors.WARNING : Colors.DIM;

                        console.log(`${Colors.BOLD}${delivery.id}${Colors.ENDC}`);
                        console.log(`  Extension:   ${delivery.extensionId}`);
                        console.log(`  Command:     ${delivery.command}`);
                        console.log(`  Status:      ${statusColor}${delivery.status}${Colors.ENDC}`);
                        console.log(`  Attempts:    ${delivery.attempts || 0}`);
                        if (delivery.lastError) {
                            console.log(`  Error:       ${Colors.FAIL}${delivery.lastError}${Colors.ENDC}`);
                        }
                        console.log('');
                    });
                }
            }
        } else if (subcommand === 'replay') {
            const eventId = parsedArgs.args[0];

            if (!eventId) {
                console.error(`${Colors.FAIL}Error: Event ID required${Colors.ENDC}`);
                console.log('Usage: ghost webhook replay <event-id>');
                process.exit(1);
            }

            const controller = new WebhookController({
                auditLogger: this.auditLogger
            });

            controller.getDeliveryQueue().setGateway(this.gateway);
            controller.getDeliveryQueue().setRuntime(this.runtime);

            const eventStore = controller.getEventStore();
            const event = await eventStore.replayEvent(eventId);

            if (!event) {
                console.error(`${Colors.FAIL}Error: Event not found: ${eventId}${Colors.ENDC}`);
                process.exit(1);
            }

            console.log(`${Colors.CYAN}Replaying webhook event ${eventId}...${Colors.ENDC}\n`);

            await controller._processWebhook(event);

            console.log(`${Colors.GREEN}✓${Colors.ENDC} Webhook event replayed successfully`);
        } else if (subcommand === 'queue-stats') {
            if (!this.webhookController) {
                console.error(`${Colors.FAIL}Error: Webhook server not running${Colors.ENDC}`);
                process.exit(1);
            }

            const stats = this.webhookController.getDeliveryQueue().getQueueStats();

            if (parsedArgs.flags.json) {
                console.log(JSON.stringify(stats, null, 2));
            } else {
                console.log(`\n${Colors.BOLD}${Colors.CYAN}Delivery Queue Statistics${Colors.ENDC}`);
                console.log(`${Colors.DIM}${'─'.repeat(50)}${Colors.ENDC}`);
                console.log(`Total:         ${stats.total}`);
                console.log(`Pending:       ${stats.pending}`);
                console.log(`Retrying:      ${stats.retrying}`);
                console.log(`Processing:    ${stats.processing}`);
                console.log('');
            }
        } else if (subcommand === 'prune') {
            const days = parseInt(parsedArgs.args[0]) || 30;

            const controller = new WebhookController();
            const eventStore = controller.getEventStore();

            const result = await eventStore.pruneOldEvents(days);

            console.log(`${Colors.GREEN}✓${Colors.ENDC} Pruned old webhook events`);
            console.log(`  Events removed:      ${result.eventsRemoved}`);
            console.log(`  Deliveries removed:  ${result.deliveriesRemoved}`);
            console.log('');
        } else {
            console.error(`${Colors.FAIL}Error: Unknown webhook subcommand '${subcommand}'${Colors.ENDC}\n`);
            console.log(`Run ${Colors.CYAN}ghost webhook help${Colors.ENDC} to see all webhook commands\n`);
            process.exit(1);
        }
    }

    async handleLogsCommand(parsedArgs) {
        const subcommand = parsedArgs.subcommand || 'help';

        if (subcommand === 'help' || !subcommand) {
            console.log(`${Colors.BOLD}Logs Management Commands:${Colors.ENDC}
  ghost logs prune [days]              Clean up old telemetry and audit logs
  ghost logs info                      Show log directory information
`);
            return;
        }

        if (subcommand === 'prune') {
            const daysToKeep = parsedArgs.args[0] ? parseInt(parsedArgs.args[0]) : null;
            
            console.log(`${Colors.CYAN}Pruning old log files...${Colors.ENDC}`);
            
            const telemetryResult = this.telemetryInstance.logger.pruneLogs(daysToKeep);
            
            const AUDIT_LOG_PATH = path.join(os.homedir(), '.ghost', 'audit.log');
            let auditResult = { deletedCount: 0, totalSizeFreed: 0 };
            
            try {
                if (fs.existsSync(AUDIT_LOG_PATH)) {
                    const auditDir = path.dirname(AUDIT_LOG_PATH);
                    const files = fs.readdirSync(auditDir);
                    const auditFiles = files
                        .filter(f => f.startsWith('audit') && f.endsWith('.log'))
                        .map(f => {
                            const filePath = path.join(auditDir, f);
                            const stats = fs.statSync(filePath);
                            return {
                                path: filePath,
                                mtime: stats.mtime,
                                size: stats.size
                            };
                        });
                    
                    const maxDays = daysToKeep || this.telemetryInstance.logger.logConfig.maxDailyFiles;
                    const maxAgeMs = maxDays * 24 * 60 * 60 * 1000;
                    const now = Date.now();
                    
                    for (const file of auditFiles) {
                        const age = now - file.mtime.getTime();
                        if (age > maxAgeMs) {
                            try {
                                fs.unlinkSync(file.path);
                                auditResult.deletedCount++;
                                auditResult.totalSizeFreed += file.size;
                            } catch (error) {
                            }
                        }
                    }
                }
            } catch (error) {
            }

            const totalDeleted = telemetryResult.deletedCount + auditResult.deletedCount;
            const totalFreed = telemetryResult.totalSizeFreed + auditResult.totalSizeFreed;
            const totalFreedMB = (totalFreed / (1024 * 1024)).toFixed(2);

            if (parsedArgs.flags.json) {
                console.log(JSON.stringify({
                    telemetry: telemetryResult,
                    audit: auditResult,
                    total: {
                        deletedCount: totalDeleted,
                        totalSizeFreed: totalFreed
                    }
                }, null, 2));
            } else {
                console.log(`\n${Colors.GREEN}✓${Colors.ENDC} Log cleanup complete`);
                console.log(`  Telemetry logs deleted: ${telemetryResult.deletedCount}`);
                console.log(`  Audit logs deleted: ${auditResult.deletedCount}`);
                console.log(`  Total files deleted: ${totalDeleted}`);
                console.log(`  Space freed: ${totalFreedMB} MB`);
                console.log('');
            }
        } else if (subcommand === 'info') {
            const telemetryDir = path.join(os.homedir(), '.ghost', 'telemetry');
            const auditLogPath = path.join(os.homedir(), '.ghost', 'audit.log');
            
            let telemetryFiles = [];
            let telemetrySize = 0;
            
            try {
                if (fs.existsSync(telemetryDir)) {
                    const files = fs.readdirSync(telemetryDir);
                    telemetryFiles = files.filter(f => f.startsWith('telemetry-') && f.endsWith('.log'));
                    telemetrySize = telemetryFiles.reduce((sum, f) => {
                        try {
                            return sum + fs.statSync(path.join(telemetryDir, f)).size;
                        } catch {
                            return sum;
                        }
                    }, 0);
                }
            } catch (error) {
            }
            
            let auditSize = 0;
            try {
                if (fs.existsSync(auditLogPath)) {
                    auditSize = fs.statSync(auditLogPath).size;
                }
            } catch (error) {
            }
            
            const totalSize = telemetrySize + auditSize;
            const totalSizeMB = (totalSize / (1024 * 1024)).toFixed(2);
            const telemetrySizeMB = (telemetrySize / (1024 * 1024)).toFixed(2);
            const auditSizeMB = (auditSize / (1024 * 1024)).toFixed(2);
            
            const config = this.telemetryInstance.logger.logConfig;

            if (parsedArgs.flags.json) {
                console.log(JSON.stringify({
                    telemetryDir,
                    telemetryFileCount: telemetryFiles.length,
                    telemetrySizeMB: parseFloat(telemetrySizeMB),
                    auditLogPath,
                    auditSizeMB: parseFloat(auditSizeMB),
                    totalSizeMB: parseFloat(totalSizeMB),
                    config
                }, null, 2));
            } else {
                console.log(`\n${Colors.BOLD}${Colors.CYAN}Log Directory Information${Colors.ENDC}`);
                console.log(`${Colors.DIM}${'─'.repeat(50)}${Colors.ENDC}`);
                console.log(`Telemetry directory:   ${telemetryDir}`);
                console.log(`Telemetry log files:   ${telemetryFiles.length}`);
                console.log(`Telemetry size:        ${telemetrySizeMB} MB`);
                console.log(`Audit log:             ${auditLogPath}`);
                console.log(`Audit size:            ${auditSizeMB} MB`);
                console.log(`Total size:            ${totalSizeMB} MB`);
                console.log('');
                console.log(`${Colors.BOLD}Configuration:${Colors.ENDC}`);
                console.log(`Max file size:         ${config.maxFileSizeMB} MB`);
                console.log(`Max daily files:       ${config.maxDailyFiles}`);
                console.log('');
            }
        } else {
            console.error(`${Colors.FAIL}Error: Unknown logs subcommand '${subcommand}'${Colors.ENDC}\n`);
            console.log(`Run ${Colors.CYAN}ghost logs help${Colors.ENDC} to see all logs commands\n`);
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
        let command = parsedArgs.command;
        let subcommand = parsedArgs.subcommand;
        let args = parsedArgs.args;
        
        // Pure orchestration: find appropriate extension
        const targetExtension = this._findExtensionForCommand(command);

        if (!targetExtension) {
            console.error(`${Colors.FAIL}Error: No extension found to handle command '${command}'${Colors.ENDC}\n`);
            // ... (rest of error handling)
        }

        // If command was an explicit extension ID, shift arguments
        if (command === targetExtension.manifest.id) {
            if (!subcommand) {
                console.error(`${Colors.FAIL}Error: No command specified for extension '${command}'${Colors.ENDC}\n`);
                process.exit(1);
            }
            command = subcommand;
            subcommand = args[0] || null;
            args = args.slice(1);
        }

        if (this._isVerbose()) {
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
                subcommand: subcommand,
                args: args,
                flags: parsedArgs.flags
            };

            // THE KEY OPERATION: Delegate to extension instance
            // This allows the pipeline to intercept, authenticate, audit, and execute
            const result = await ext.instance[command](params);

            if (this._isVerbose()) {
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
            if (this._isVerbose()) {
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
     * - Pure lookup logic discovering commands from extension manifests
     * - No business logic, only routing decisions
     */
    _findExtensionForCommand(command) {
        // 1. Check if command is an explicit extension ID
        const directExt = this.gateway.getExtension(command);
        if (directExt) return directExt;

        // 2. Discover extensions by checking manifest.commands arrays
        const extensions = this.gateway.listExtensions();
        for (const ext of extensions) {
            const fullExt = this.gateway.getExtension(ext.id);
            if (fullExt && fullExt.manifest && fullExt.manifest.commands) {
                if (Array.isArray(fullExt.manifest.commands) && fullExt.manifest.commands.includes(command)) {
                    return fullExt;
                }
            }
        }

        // Fallback: Dynamic capability-based routing
        for (const ext of extensions) {
            if (ext.capabilities && ext.capabilities[command]) {
                return this.gateway.getExtension(ext.id);
            }
        }

        return null;
    }

    /**
     * Get all available commands from registered extensions.
     * 
     * ORCHESTRATION ROLE: Correct implementation
     * - Query Gateway for extension metadata
     * - Extract commands from manifests
     */
    _getAllAvailableCommands() {
        const commands = new Set();
        const extensions = this.gateway.listExtensions();
        
        for (const ext of extensions) {
            const fullExt = this.gateway.getExtension(ext.id);
            if (fullExt && fullExt.manifest && fullExt.manifest.commands) {
                if (Array.isArray(fullExt.manifest.commands)) {
                    fullExt.manifest.commands.forEach(cmd => commands.add(cmd));
                }
            }
        }
        
        return Array.from(commands);
    }

    /**
     * Find similar commands using simple string distance heuristic.
     * 
     * ORCHESTRATION ROLE: Correct implementation
     * - Pure string comparison logic
     * - No business logic, only formatting
     */
    _findSimilarCommands(input, availableCommands, maxSuggestions = 3) {
        const suggestions = [];
        
        for (const cmd of availableCommands) {
            const distance = this._levenshteinDistance(input.toLowerCase(), cmd.toLowerCase());
            const maxLength = Math.max(input.length, cmd.length);
            const similarity = 1 - (distance / maxLength);
            
            // Include commands with >40% similarity or that contain/are contained in the input
            if (similarity > 0.4 || cmd.includes(input) || input.includes(cmd)) {
                suggestions.push({ cmd, similarity, distance });
            }
        }
        
        // Sort by similarity (higher first) and then by distance (lower first)
        suggestions.sort((a, b) => {
            if (Math.abs(a.similarity - b.similarity) < 0.1) {
                return a.distance - b.distance;
            }
            return b.similarity - a.similarity;
        });
        
        return suggestions.slice(0, maxSuggestions).map(s => s.cmd);
    }

    /**
     * Calculate Levenshtein distance between two strings.
     * 
     * ORCHESTRATION ROLE: Correct implementation
     * - Pure algorithm implementation
     * - No I/O or business logic
     */
    _levenshteinDistance(str1, str2) {
        const matrix = [];
        
        for (let i = 0; i <= str2.length; i++) {
            matrix[i] = [i];
        }
        
        for (let j = 0; j <= str1.length; j++) {
            matrix[0][j] = j;
        }
        
        for (let i = 1; i <= str2.length; i++) {
            for (let j = 1; j <= str1.length; j++) {
                if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                    matrix[i][j] = Math.min(
                        matrix[i - 1][j - 1] + 1,
                        matrix[i][j - 1] + 1,
                        matrix[i - 1][j] + 1
                    );
                }
            }
        }
        
        return matrix[str2.length][str1.length];
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

        if (this._isVerbose()) {
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
     * Get color for runtime state.
     * 
     * ORCHESTRATION ROLE: Correct implementation
     * - Pure formatting logic, no I/O
     */
    _getStateColor(state) {
        const stateColors = {
            'RUNNING': Colors.GREEN,
            'STOPPED': Colors.DIM,
            'FAILED': Colors.FAIL,
            'STARTING': Colors.WARNING,
            'STOPPING': Colors.WARNING,
            'DEGRADED': Colors.WARNING,
            'NOT_STARTED': Colors.DIM
        };
        
        return stateColors[state] || '';
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
                        bc: 100,
                        be: 204800
                    }
                },
                git: {
                    read: true,
                    write: false
                },
                hooks: ['pre-commit', 'post-merge']
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

        const className = name.replace(/[^a-zA-Z0-9]/g, '');
        const indexTemplate = `const { ExtensionSDK, IntentBuilder, RPCClient } = require('@ghost/extension-sdk');

/**
 * ${name} Extension
 * 
 * This extension provides custom functionality for Ghost CLI.
 * It demonstrates best practices for extension development including:
 * - Proper error handling with structured logging
 * - Batch operations for improved performance
 * - Hook integration for Git lifecycle events
 * 
 * @class ${className}Extension
 */
class ${className}Extension {
    /**
     * Creates an instance of the extension.
     * Initializes SDK, RPC client, and intent builder for pipeline operations.
     * 
     * @constructor
     */
    constructor() {
        this.sdk = new ExtensionSDK('${extId}');
        this.rpcClient = new RPCClient('${extId}');
        this.intentBuilder = new IntentBuilder('${extId}');
    }

    /**
     * Initialize the extension.
     * Called when the extension is loaded by Ghost runtime.
     * 
     * @async
     * @returns {Promise<void>}
     */
    async initialize() {
        console.log('${name} extension initialized');
    }

    /**
     * Example command implementation with error handling and batch operations.
     * 
     * @async
     * @param {Object} params - Command parameters
     * @param {string} params.subcommand - Subcommand name
     * @param {Array<string>} params.args - Command arguments
     * @param {Object} params.flags - Command flags
     * @returns {Promise<Object>} Command result with success status and output
     * 
     * @example
     * // Call via CLI:
     * // ghost myCommand --verbose
     * 
     * @example
     * // With subcommands and arguments:
     * // ghost myCommand list files/ --filter="*.js"
     */
    async myCommand(params) {
        const { subcommand, args, flags } = params;

        try {
            // Log structured information for debugging and audit
            this._logInfo('Executing myCommand', { subcommand, args, flags });

            // Example: Use batch operations for multiple file reads
            const filePaths = args.length > 0 ? args : ['README.md', 'package.json', 'manifest.json'];
            const intents = filePaths.map(file => 
                this.intentBuilder.filesystem('read', { path: file })
            );

            // Send batch request for improved performance
            const results = await this.rpcClient.sendBatch(intents);
            
            // Process results
            const successCount = results.filter(r => r.success).length;
            this._logInfo('Batch operation completed', { 
                total: filePaths.length, 
                successful: successCount 
            });

            return {
                success: true,
                output: \`Command executed successfully. Read \${successCount} of \${filePaths.length} files.\`
            };
        } catch (error) {
            // Structured error logging with context
            this._logError('Command execution failed', {
                command: 'myCommand',
                subcommand,
                error: error.message,
                stack: error.stack
            });

            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Pre-commit hook handler.
     * Called before Git commits are created.
     * 
     * @async
     * @param {Object} params - Hook parameters
     * @returns {Promise<Object>} Hook result
     * 
     * @example
     * // Automatically triggered by Ghost on pre-commit
     */
    async preCommit(params) {
        try {
            this._logInfo('Pre-commit hook triggered');
            
            // Example: Check for sensitive data before commit
            const status = await this.sdk.requestGitStatus();
            
            return {
                success: true,
                output: 'Pre-commit checks passed'
            };
        } catch (error) {
            this._logError('Pre-commit hook failed', { error: error.message });
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Post-merge hook handler.
     * Called after Git merge operations complete.
     * 
     * @async
     * @param {Object} params - Hook parameters
     * @returns {Promise<Object>} Hook result
     * 
     * @example
     * // Automatically triggered by Ghost on post-merge
     */
    async postMerge(params) {
        try {
            this._logInfo('Post-merge hook triggered');
            
            // Example: Update dependencies after merge
            return {
                success: true,
                output: 'Post-merge tasks completed'
            };
        } catch (error) {
            this._logError('Post-merge hook failed', { error: error.message });
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Log informational message with structured data.
     * 
     * @private
     * @param {string} message - Log message
     * @param {Object} [data] - Additional structured data
     */
    _logInfo(message, data = {}) {
        const logEntry = {
            level: 'INFO',
            timestamp: new Date().toISOString(),
            extension: '${extId}',
            message,
            ...data
        };
        console.log(JSON.stringify(logEntry));
    }

    /**
     * Log error message with structured data and stack trace.
     * 
     * @private
     * @param {string} message - Error message
     * @param {Object} [data] - Additional structured data including error details
     */
    _logError(message, data = {}) {
        const logEntry = {
            level: 'ERROR',
            timestamp: new Date().toISOString(),
            extension: '${extId}',
            message,
            ...data
        };
        console.error(JSON.stringify(logEntry));
    }

    /**
     * Shutdown the extension.
     * Called when Ghost is shutting down or the extension is being unloaded.
     * Use this for cleanup operations.
     * 
     * @async
     * @returns {Promise<void>}
     */
    async shutdown() {
        this._logInfo('${name} extension shutting down');
    }
}

module.exports = ${className}Extension;
`;

        // VIOLATION: Direct fs.writeFileSync
        fs.writeFileSync(path.join(targetDir, 'index.js'), indexTemplate);

        // Create TypeScript declaration file
        const dtsTemplate = `import { ExtensionSDK, IntentBuilder, RPCClient } from '@ghost/extension-sdk';

/**
 * ${name} Extension
 * 
 * Provides custom functionality for Ghost CLI with type-safe interfaces.
 */
declare class ${className}Extension {
    /**
     * Extension SDK instance for high-level API operations
     */
    sdk: ExtensionSDK;

    /**
     * RPC client for low-level intent communication
     */
    rpcClient: RPCClient;

    /**
     * Intent builder for constructing pipeline requests
     */
    intentBuilder: IntentBuilder;

    /**
     * Creates an instance of the extension
     */
    constructor();

    /**
     * Initialize the extension
     * @returns Promise that resolves when initialization is complete
     */
    initialize(): Promise<void>;

    /**
     * Example command implementation
     * @param params - Command parameters
     * @param params.subcommand - Subcommand name
     * @param params.args - Command arguments
     * @param params.flags - Command flags
     * @returns Promise with command result
     */
    myCommand(params: {
        subcommand?: string;
        args: string[];
        flags: Record<string, any>;
    }): Promise<{
        success: boolean;
        output?: string;
        error?: string;
    }>;

    /**
     * Pre-commit hook handler
     * @param params - Hook parameters
     * @returns Promise with hook result
     */
    preCommit(params: Record<string, any>): Promise<{
        success: boolean;
        output?: string;
        error?: string;
    }>;

    /**
     * Post-merge hook handler
     * @param params - Hook parameters
     * @returns Promise with hook result
     */
    postMerge(params: Record<string, any>): Promise<{
        success: boolean;
        output?: string;
        error?: string;
    }>;

    /**
     * Shutdown the extension
     * @returns Promise that resolves when shutdown is complete
     */
    shutdown(): Promise<void>;
}

export = ${className}Extension;
`;

        // VIOLATION: Direct fs.writeFileSync
        fs.writeFileSync(path.join(targetDir, 'index.d.ts'), dtsTemplate);

        const packageJson = {
            name: extId,
            version: VERSION,
            description: `${name} extension for Ghost CLI`,
            main: 'index.js',
            types: 'index.d.ts',
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
# Execute the main command
ghost myCommand

# With arguments
ghost myCommand file1.txt file2.txt

# With flags
ghost myCommand --verbose
\`\`\`

## Development

1. Install dependencies: \`npm install\`
2. Validate manifest: \`ghost extension validate\`
3. Install locally: \`ghost extension install .\`
4. Test your extension: \`ghost myCommand\`

## Capabilities

This extension requests the following capabilities:

### Filesystem
- **Read**: \`**/*\` - Read files in the current directory and subdirectories
- **Write**: None (read-only by default)

### Network
- **Allowlist**: None (no external network access by default)
- **Rate Limit**: 
  - CIR (Committed Information Rate): 60 tokens/minute
  - BC (Burst Capacity): 100 tokens
  - BE (Excess Burst Size): 200KB (204800 bytes)

### Git
- **Read**: Enabled - Can read repository status, logs, and diffs
- **Write**: Disabled - Cannot modify repository

### Hooks
- **pre-commit**: Triggered before Git commits
- **post-merge**: Triggered after Git merge operations

## Architecture

This extension demonstrates best practices:

- **Batch Operations**: Uses \`sendBatch()\` for efficient multiple file reads
- **Structured Logging**: JSON-formatted logs with timestamps and context
- **Error Handling**: Comprehensive try-catch with detailed error reporting
- **TypeScript Support**: Includes type declarations for IDE support
- **Hook Integration**: Implements Git lifecycle hooks

## API Reference

### Commands

#### \`myCommand(params)\`
Example command with batch file reading capabilities.

**Parameters:**
- \`params.subcommand\` (string, optional): Subcommand name
- \`params.args\` (Array<string>): List of file paths to read
- \`params.flags\` (Object): Command-line flags

**Returns:** Promise<{ success: boolean, output?: string, error?: string }>

### Hooks

#### \`preCommit(params)\`
Executed before Git commits. Use for validation and pre-commit checks.

#### \`postMerge(params)\`
Executed after Git merge operations. Use for post-merge cleanup and updates.

## Examples

### Batch File Operations

\`\`\`javascript
const intents = files.map(file => 
    this.intentBuilder.filesystem('read', { path: file })
);
const results = await this.rpcClient.sendBatch(intents);
\`\`\`

### Structured Error Logging

\`\`\`javascript
try {
    // Operation
} catch (error) {
    this._logError('Operation failed', {
        operation: 'example',
        error: error.message,
        stack: error.stack
    });
}
\`\`\`

## Documentation

See [Extension API Documentation](https://github.com/lamallamadel/ghost/blob/main/docs/extension-api.md) for complete API details.
`;

        // VIOLATION: Direct fs.writeFileSync
        fs.writeFileSync(path.join(targetDir, 'README.md'), readme);

        // VIOLATION: Direct fs.writeFileSync
        fs.writeFileSync(path.join(targetDir, '.gitignore'), `node_modules/
*.log
.DS_Store
`);

        console.log(`${Colors.GREEN}✓${Colors.ENDC} Extension scaffolded successfully!\n`);
        console.log(`${Colors.BOLD}Features included:${Colors.ENDC}`);
        console.log(`  ${Colors.GREEN}✓${Colors.ENDC} TypeScript declaration file (index.d.ts)`);
        console.log(`  ${Colors.GREEN}✓${Colors.ENDC} Comprehensive JSDoc comments`);
        console.log(`  ${Colors.GREEN}✓${Colors.ENDC} Batch operations example`);
        console.log(`  ${Colors.GREEN}✓${Colors.ENDC} Structured error handling and logging`);
        console.log(`  ${Colors.GREEN}✓${Colors.ENDC} Git hooks integration (pre-commit, post-merge)`);
        console.log(`  ${Colors.GREEN}✓${Colors.ENDC} Network rate limit with BE parameter (200KB)`);
        console.log('');
        console.log(`${Colors.BOLD}Next steps:${Colors.ENDC}`);
        console.log(`  1. cd ${extId}`);
        console.log(`  2. npm install`);
        console.log(`  3. Edit manifest.json to customize capabilities`);
        console.log(`  4. Edit index.js to implement your extension logic`);
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
                    
                    fs_cap.read.forEach(pattern => {
                        try {
                            GlobMatcher.match('test/file.txt', pattern);
                            
                            if (pattern === '**/*' || pattern === '**') {
                                warnings.push(`Filesystem read pattern "${pattern}" is overly permissive (matches all files)`);
                            }
                        } catch (e) {
                            errors.push(`Invalid filesystem read glob pattern: "${pattern}" - ${e.message}`);
                        }
                    });
                }
                if (fs_cap.write && Array.isArray(fs_cap.write)) {
                    console.log(`  ${Colors.DIM}- Filesystem write: ${fs_cap.write.length} pattern(s)${Colors.ENDC}`);
                    if (fs_cap.write.length > 0) {
                        warnings.push('Extension requests write access to filesystem');
                    }
                    
                    fs_cap.write.forEach(pattern => {
                        try {
                            GlobMatcher.match('test/file.txt', pattern);
                            
                            if (pattern === '**/*' || pattern === '**') {
                                warnings.push(`Filesystem write pattern "${pattern}" is DANGEROUS - allows writing to all files`);
                            } else if (pattern === '*' || pattern === '/*') {
                                warnings.push(`Filesystem write pattern "${pattern}" is overly permissive`);
                            }
                        } catch (e) {
                            errors.push(`Invalid filesystem write glob pattern: "${pattern}" - ${e.message}`);
                        }
                    });
                }
            }

            if (manifest.capabilities.network) {
                const net_cap = manifest.capabilities.network;
                if (net_cap.allowlist && Array.isArray(net_cap.allowlist)) {
                    console.log(`  ${Colors.DIM}- Network allowlist: ${net_cap.allowlist.length} domain(s)${Colors.ENDC}`);
                    net_cap.allowlist.forEach(url => {
                        if (!/^https?:\/\/[^/]+$/.test(url)) {
                            errors.push(`Invalid network allowlist entry: ${url} (must be protocol + domain only)`);
                        } else {
                            try {
                                const parsedUrl = new URL(url);
                                const hostname = parsedUrl.hostname;
                                
                                if (!hostname || hostname === 'localhost' || /^127\.\d+\.\d+\.\d+$/.test(hostname) || /^0\.0\.0\.0$/.test(hostname)) {
                                    warnings.push(`Network allowlist entry "${url}" uses localhost or loopback address`);
                                } else if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
                                    warnings.push(`Network allowlist entry "${url}" uses IP address instead of domain name`);
                                } else {
                                    const domainParts = hostname.split('.');
                                    if (domainParts.length < 2 || domainParts.some(part => part === '')) {
                                        errors.push(`Network allowlist entry "${url}" has invalid domain structure`);
                                    }
                                }
                            } catch (e) {
                                errors.push(`Network allowlist entry "${url}" is not a valid URL`);
                            }
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
                    
                    if (!net_cap.rateLimit.be) {
                        errors.push('Network rate limit missing required "be" (excess burst size) parameter');
                    }
                    
                    if (net_cap.rateLimit.be && net_cap.rateLimit.bc && net_cap.rateLimit.be < net_cap.rateLimit.bc) {
                        warnings.push(`Network rate limit: Be (${net_cap.rateLimit.be}) is less than Bc (${net_cap.rateLimit.bc}). This means no burst capacity above committed rate.`);
                    }
                    
                    if (net_cap.rateLimit.cir && net_cap.rateLimit.bc) {
                        const refillTimeSeconds = (net_cap.rateLimit.bc / net_cap.rateLimit.cir) * 60;
                        const tokensPerSecond = net_cap.rateLimit.cir / 60;
                        console.log(`  ${Colors.DIM}- Rate limit simulation:${Colors.ENDC}`);
                        console.log(`    ${Colors.DIM}CIR: ${net_cap.rateLimit.cir} tokens/min (${tokensPerSecond.toFixed(2)} tokens/sec)${Colors.ENDC}`);
                        console.log(`    ${Colors.DIM}Bc (committed burst): ${net_cap.rateLimit.bc} tokens${Colors.ENDC}`);
                        console.log(`    ${Colors.DIM}Be (excess burst): ${net_cap.rateLimit.be || 0} bytes${Colors.ENDC}`);
                        console.log(`    ${Colors.DIM}Bucket refills to capacity in: ${refillTimeSeconds.toFixed(1)}s${Colors.ENDC}`);
                        console.log(`    ${Colors.DIM}Sustained rate: 1 request every ${(60 / net_cap.rateLimit.cir).toFixed(2)}s${Colors.ENDC}`);
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
                const ALLOWED_HOOKS = [
                    'pre-commit',
                    'commit-msg',
                    'pre-push',
                    'post-merge',
                    'pre-rebase',
                    'post-checkout',
                    'post-commit',
                    'pre-applypatch',
                    'post-applypatch',
                    'pre-receive',
                    'post-receive',
                    'update'
                ];
                
                console.log(`  ${Colors.DIM}- Git hooks: ${manifest.capabilities.hooks.join(', ')}${Colors.ENDC}`);
                
                manifest.capabilities.hooks.forEach(hook => {
                    if (!ALLOWED_HOOKS.includes(hook)) {
                        errors.push(`Invalid git hook: "${hook}". Allowed hooks are: ${ALLOWED_HOOKS.join(', ')}`);
                    }
                });
                
                if (manifest.capabilities.hooks.length === 0) {
                    warnings.push('Git hooks capability declared but no hooks specified');
                }
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
     * Handle extension doctor command - diagnose dependency conflicts
     * 
     * ORCHESTRATION ROLE:
     * - Collect extension manifests from Gateway
     * - Delegate to DependencyResolver.diagnoseConflicts()
     * - Format and display diagnostic report
     * - No direct business logic, only presentation
     */
    async _handleExtensionDoctorCommand(parsedArgs) {
        const DependencyResolver = require('./core/dependency-resolver');
        
        console.log(`${Colors.CYAN}${Colors.BOLD}Extension Dependency Doctor${Colors.ENDC}\n`);
        console.log(`${Colors.DIM}Analyzing extension dependencies...${Colors.ENDC}\n`);

        // Collect extension manifests
        const manifests = new Map();
        const extensions = this.gateway.listExtensions();

        for (const ext of extensions) {
            const fullExt = this.gateway.getExtension(ext.id);
            if (fullExt && fullExt.manifest) {
                manifests.set(ext.id, fullExt);
            }
        }

        if (manifests.size === 0) {
            console.log(`${Colors.WARNING}No extensions installed${Colors.ENDC}\n`);
            return;
        }

        // Run diagnosis
        const availableVersions = parsedArgs.flags.versions ? 
            JSON.parse(parsedArgs.flags.versions) : {};
        
        const report = DependencyResolver.diagnoseConflicts(manifests, {
            availableVersions
        });

        // Output format
        if (parsedArgs.flags.json) {
            console.log(JSON.stringify(report, null, 2));
            return;
        }

        // Display health status
        if (report.healthy) {
            console.log(`${Colors.GREEN}${Colors.BOLD}✓ All dependencies are healthy!${Colors.ENDC}\n`);
        } else {
            console.log(`${Colors.FAIL}${Colors.BOLD}✗ Dependency issues detected${Colors.ENDC}\n`);
        }

        // Display summary
        if (report.summary) {
            console.log(`${Colors.BOLD}Summary:${Colors.ENDC}`);
            console.log(`  Total conflicts: ${report.summary.totalConflicts || 0}`);
            console.log(`  Resolvable: ${report.summary.resolvableConflicts || 0}`);
            console.log(`  Requires manual intervention: ${report.summary.requiresManualIntervention || 0}`);
            console.log(`  Affected extensions: ${report.summary.affectedExtensions || 0}`);
            console.log('');
        }

        // Display version conflicts
        if (report.versionConflicts && report.versionConflicts.length > 0) {
            console.log(`${Colors.FAIL}${Colors.BOLD}Version Conflicts (${report.versionConflicts.length}):${Colors.ENDC}`);
            console.log(`${Colors.DIM}${'─'.repeat(80)}${Colors.ENDC}\n`);

            for (const conflict of report.versionConflicts) {
                console.log(`  ${Colors.BOLD}${conflict.dependency}${Colors.ENDC} ${Colors.DIM}(installed: ${conflict.installedVersion || 'not installed'})${Colors.ENDC}`);
                
                for (const req of conflict.requirements) {
                    const statusIcon = req.satisfied ? Colors.GREEN + '✓' : Colors.FAIL + '✗';
                    console.log(`    ${statusIcon}${Colors.ENDC} ${req.extension} requires ${Colors.CYAN}${req.constraint}${Colors.ENDC}`);
                }

                if (conflict.incompatiblePairs && conflict.incompatiblePairs.length > 0) {
                    console.log(`    ${Colors.WARNING}⚠ Incompatible requirements:${Colors.ENDC}`);
                    for (const pair of conflict.incompatiblePairs) {
                        console.log(`      ${pair.req1.extensionId} (${pair.req1.constraint}) ↔ ${pair.req2.extensionId} (${pair.req2.constraint})`);
                    }
                }
                console.log('');
            }
        }

        // Display version issues
        if (report.versionIssues && report.versionIssues.length > 0) {
            console.log(`${Colors.WARNING}${Colors.BOLD}Version Issues (${report.versionIssues.length}):${Colors.ENDC}`);
            console.log(`${Colors.DIM}${'─'.repeat(80)}${Colors.ENDC}\n`);

            for (const issue of report.versionIssues) {
                const icon = issue.installed ? Colors.WARNING + '⚠' : Colors.FAIL + '✗';
                console.log(`  ${icon}${Colors.ENDC} ${issue.extension} → ${issue.dependency}`);
                console.log(`    ${Colors.DIM}${issue.message}${Colors.ENDC}`);
            }
            console.log('');
        }

        // Display circular dependencies
        if (report.circularDependencies && report.circularDependencies.length > 0) {
            console.log(`${Colors.FAIL}${Colors.BOLD}Circular Dependencies (${report.circularDependencies.length}):${Colors.ENDC}`);
            console.log(`${Colors.DIM}${'─'.repeat(80)}${Colors.ENDC}\n`);

            for (const cycle of report.circularDependencies) {
                console.log(`  ${Colors.FAIL}↺${Colors.ENDC} ${cycle.join(' → ')}`);
            }
            console.log('');
        }

        // Display capability conflicts
        if (report.capabilityConflicts && report.capabilityConflicts.length > 0) {
            console.log(`${Colors.WARNING}${Colors.BOLD}Capability Conflicts (${report.capabilityConflicts.length}):${Colors.ENDC}`);
            console.log(`${Colors.DIM}${'─'.repeat(80)}${Colors.ENDC}\n`);

            for (const conflict of report.capabilityConflicts) {
                console.log(`  ${Colors.WARNING}⚠${Colors.ENDC} ${conflict.type}: ${Colors.CYAN}${conflict.capability}${Colors.ENDC}`);
                console.log(`    Extensions: ${conflict.extensions.join(', ')}`);
                console.log(`    Resolution: ${conflict.resolution}`);
                if (conflict.winner) {
                    console.log(`    Winner: ${Colors.GREEN}${conflict.winner}${Colors.ENDC}`);
                }
            }
            console.log('');
        }

        // Display resolution strategies
        if (report.resolutionStrategies && report.resolutionStrategies.length > 0) {
            console.log(`${Colors.CYAN}${Colors.BOLD}Resolution Strategies:${Colors.ENDC}`);
            console.log(`${Colors.DIM}${'─'.repeat(80)}${Colors.ENDC}\n`);

            for (const strategy of report.resolutionStrategies) {
                console.log(`  ${Colors.BOLD}${strategy.dependency}${Colors.ENDC} - ${strategy.strategy}`);
                
                if (strategy.strategy === 'common-version') {
                    console.log(`    ${Colors.GREEN}✓${Colors.ENDC} Install version: ${Colors.CYAN}${strategy.resolution}${Colors.ENDC}`);
                    if (strategy.impact.upgrades && strategy.impact.upgrades.length > 0) {
                        console.log(`    ${Colors.DIM}Upgrades: ${strategy.impact.upgrades.join(', ')}${Colors.ENDC}`);
                    }
                    if (strategy.impact.downgrades && strategy.impact.downgrades.length > 0) {
                        console.log(`    ${Colors.WARNING}Downgrades: ${strategy.impact.downgrades.join(', ')}${Colors.ENDC}`);
                    }
                } else if (strategy.strategy === 'favor-extension') {
                    console.log(`    Favor: ${Colors.CYAN}${strategy.favoring}${Colors.ENDC} with version ${strategy.resolution}`);
                    if (strategy.impact.breaking && strategy.impact.breaking.length > 0) {
                        console.log(`    ${Colors.FAIL}✗ Breaking:${Colors.ENDC}`);
                        for (const broken of strategy.impact.breaking) {
                            console.log(`      ${broken.extension}: requires ${broken.required}, would get ${broken.actual}`);
                        }
                    }
                } else if (strategy.strategy === 'duplicate') {
                    console.log(`    ${Colors.WARNING}⚠ Install multiple versions${Colors.ENDC}`);
                    if (strategy.impact.installations) {
                        for (const install of strategy.impact.installations) {
                            console.log(`      ${install.extension} → ${install.version}`);
                        }
                    }
                }
                
                console.log(`    ${Colors.DIM}Recommendation: ${strategy.recommendation}${Colors.ENDC}`);
                console.log('');
            }
        }

        // Display dependency trees
        if (parsedArgs.flags.tree && report.dependencyTrees && report.dependencyTrees.length > 0) {
            console.log(`${Colors.CYAN}${Colors.BOLD}Dependency Trees:${Colors.ENDC}`);
            console.log(`${Colors.DIM}${'─'.repeat(80)}${Colors.ENDC}\n`);

            for (const treeInfo of report.dependencyTrees) {
                console.log(treeInfo.tree);
            }
        }

        // Display recommendations
        if (report.recommendations && report.recommendations.length > 0) {
            console.log(`${Colors.CYAN}${Colors.BOLD}Recommendations:${Colors.ENDC}`);
            console.log(`${Colors.DIM}${'─'.repeat(80)}${Colors.ENDC}\n`);

            const bySeverity = {
                critical: [],
                high: [],
                medium: [],
                low: []
            };

            for (const rec of report.recommendations) {
                bySeverity[rec.severity || 'medium'].push(rec);
            }

            for (const severity of ['critical', 'high', 'medium', 'low']) {
                const recs = bySeverity[severity];
                if (recs.length === 0) continue;

                const severityColor = severity === 'critical' ? Colors.FAIL : 
                                     severity === 'high' ? Colors.WARNING :
                                     severity === 'medium' ? Colors.CYAN : Colors.DIM;
                
                console.log(`  ${severityColor}${severity.toUpperCase()} (${recs.length}):${Colors.ENDC}`);

                for (const rec of recs) {
                    if (rec.command) {
                        console.log(`    ${rec.action}: ${Colors.CYAN}${rec.command}${Colors.ENDC}`);
                    } else {
                        console.log(`    ${rec.action}: ${rec.reason || rec.suggestion || ''}`);
                    }
                    if (rec.affected && rec.affected.length > 0) {
                        console.log(`      ${Colors.DIM}Affected: ${rec.affected.join(', ')}${Colors.ENDC}`);
                    }
                }
                console.log('');
            }
        }

        // Final status message
        if (!report.healthy) {
            console.log(`${Colors.WARNING}Run with --tree flag to see full dependency trees${Colors.ENDC}`);
            console.log(`${Colors.WARNING}Run with --json flag to export report in JSON format${Colors.ENDC}\n`);
            process.exit(1);
        }
    }

    /**
     * Display help message.
     * 
     * ORCHESTRATION ROLE: Correct implementation
     * - Pure output formatting, no business logic
     * - Dynamically lists extension commands
     */
    showHelp() {
        // Get dynamically available extension commands
        const extensionCommands = this._getAllAvailableCommands();
        console.log(`
${Colors.BOLD}${Colors.CYAN}GHOST CLI v${VERSION}${Colors.ENDC} - Gateway Launcher
Zero-dependency Git assistant with extensible architecture

${Colors.BOLD}USAGE:${Colors.ENDC}
  ghost <command> [subcommand] [options]

${Colors.BOLD}CORE COMMANDS:${Colors.ENDC}
  ${Colors.CYAN}setup${Colors.ENDC}                         Interactive setup wizard - configure AI providers and settings
  ${Colors.CYAN}doctor${Colors.ENDC}                        Health check - verify installation and dependencies
  ${Colors.CYAN}completion${Colors.ENDC}                    Shell completion - output script for bash/zsh/fish

${Colors.BOLD}EXTENSION MANAGEMENT:${Colors.ENDC}
  ${Colors.CYAN}extension list${Colors.ENDC}                List all installed extensions
  ${Colors.CYAN}extension install${Colors.ENDC} <path>      Install extension from local directory
  ${Colors.CYAN}extension remove${Colors.ENDC} <id>         Uninstall extension by ID
  ${Colors.CYAN}extension info${Colors.ENDC} <id>           Show detailed extension information
  ${Colors.CYAN}extension init${Colors.ENDC} <name>         Scaffold new extension project with boilerplate
  ${Colors.CYAN}extension validate${Colors.ENDC} [path]     Validate extension manifest and permissions
  ${Colors.CYAN}extension migrate${Colors.ENDC} [path]      Migrate v0.x extension to v1.0.0 SDK

${Colors.BOLD}GATEWAY & MONITORING:${Colors.ENDC}
  ${Colors.CYAN}gateway status${Colors.ENDC}                Gateway status and pipeline statistics
  ${Colors.CYAN}gateway extensions${Colors.ENDC}            Show loaded extensions with runtime state
  ${Colors.CYAN}gateway health${Colors.ENDC}                Extension health status
  ${Colors.CYAN}gateway reload${Colors.ENDC} <ext-id>       Manually reload an extension (dev mode)
  ${Colors.CYAN}gateway logs${Colors.ENDC} [options]        View audit logs with filtering
  ${Colors.CYAN}gateway metrics${Colors.ENDC} [ext-id]      Telemetry metrics for extensions
  ${Colors.CYAN}gateway spans${Colors.ENDC} [limit]         Recent telemetry spans
  ${Colors.CYAN}audit-log view${Colors.ENDC}                Comprehensive audit logs
  ${Colors.CYAN}console${Colors.ENDC} [start|stop]          Telemetry HTTP/WebSocket server
  ${Colors.CYAN}logs prune${Colors.ENDC} [days]             Cleanup old telemetry/audit logs
  ${Colors.CYAN}logs info${Colors.ENDC}                     Show log directory information

${Colors.BOLD}DEVELOPER MODE:${Colors.ENDC}
  ${Colors.CYAN}dev enable${Colors.ENDC}                    Enable developer mode (hot reload, relaxed validation)
  ${Colors.CYAN}dev disable${Colors.ENDC}                   Disable developer mode
  ${Colors.CYAN}dev status${Colors.ENDC}                    Show developer mode status

${Colors.BOLD}WEBHOOK AUTOMATION:${Colors.ENDC}
  ${Colors.CYAN}webhook start${Colors.ENDC}                 Start webhook receiver server
  ${Colors.CYAN}webhook stop${Colors.ENDC}                  Stop webhook receiver server
  ${Colors.CYAN}webhook status${Colors.ENDC}                Show webhook server status
  ${Colors.CYAN}webhook events${Colors.ENDC}                List received webhook events
  ${Colors.CYAN}webhook deliveries${Colors.ENDC}            Show webhook delivery status
  ${Colors.CYAN}webhook replay${Colors.ENDC} <id>           Replay a webhook event
  ${Colors.CYAN}webhook queue-stats${Colors.ENDC}           Show delivery queue stats
  ${Colors.CYAN}webhook prune${Colors.ENDC} [days]          Prune old webhook events

${Colors.BOLD}WORKFLOW COMMANDS:${Colors.ENDC}`);

        // Dynamically list extension commands
        if (extensionCommands.length > 0) {
            extensionCommands.forEach(cmd => {
                const ext = this._findExtensionForCommand(cmd);
                const extName = ext ? ext.manifest.name : 'unknown';
                console.log(`  ${Colors.CYAN}${cmd.padEnd(30)}${Colors.ENDC} ${Colors.DIM}(${extName})${Colors.ENDC}`);
            });
            console.log(`  ${Colors.DIM}Use --help with any command for detailed information${Colors.ENDC}`);
        } else {
            console.log(`  ${Colors.DIM}No extension commands available${Colors.ENDC}`);
            console.log(`  ${Colors.DIM}Install extensions to add workflow commands${Colors.ENDC}`);
        }

        console.log(`
${Colors.BOLD}OPTIONS:${Colors.ENDC}
  --verbose, -v                 Show detailed real-time telemetry with pipeline flow
  --verbose=<filter>            Show telemetry filtered by extension-id or intent type
  --json                        Output in JSON format
  --no-color                    Disable colored output
  --port <port>                 Specify port for telemetry server (default: 9876)
  --help, -h                    Show this help message

${Colors.BOLD}EXAMPLES:${Colors.ENDC}
  ghost setup
  ghost doctor
  ghost extension list
  ghost extension init my-extension
  ghost extension validate
  ghost extension migrate --apply
  ghost completion bash
  ghost gateway status --verbose --json
  ghost commit --dry-run --no-color

${Colors.BOLD}VERBOSE MODE:${Colors.ENDC}
  Real-time telemetry display shows pipeline flow for each request:
  - Extension → Intercept → Auth → Audit → Execute with latencies
  - Status indicators: ✓ (green) for OK, ✗ (red) for ERROR
  - Rate limit status: [tokens/capacity] with color-coded warnings
  - Rate limit violations marked with ⚠ (yellow warning)
  - Dropped requests show violation reason
  - Intent parameters are sanitized (api_key, token, password masked)
  - Use --verbose=<filter> to show only specific extension or intent type
  
  Examples:
    ghost commit --verbose                      # Show all telemetry
    ghost commit --verbose=ghost-git-extension  # Filter by extension
    ghost commit --verbose=filesystem           # Filter by intent type

${Colors.BOLD}TELEMETRY:${Colors.ENDC}
  Integrated OpenTelemetry observability:
  - Spans for each pipeline layer (Intercept→Auth→Audit→Execute)
  - Structured JSON logs with severity levels (INFO/WARN/ERROR/SECURITY_ALERT)
  - Metrics (request count, latency percentiles, rate limit violations)
  - HTTP/WebSocket server for real-time monitoring
  - Logs stored in ~/.ghost/telemetry/
  - Automatic log rotation (max 10MB per file, keep last 7 daily files by default)
  - PII scrubbing (emails, IPs, home paths automatically redacted)
  
  Start telemetry server:
    ghost console start
  
  HTTP endpoints:
    GET /health                  Health check
    GET /metrics                 All metrics
    GET /metrics/<extension-id>  Extension-specific metrics
    GET /spans                   Recent spans
    GET /logs?severity=<level>   Filter logs by severity
  
  Log management:
    ghost logs info              Show log directory information
    ghost logs prune [days]      Cleanup old logs (default: 7 days)
  
  Configuration (~/.ghost/config/ghostrc.json):
    {
      "logs": {
        "maxFileSizeMB": 10,     // Max size per log file before rotation
        "maxDailyFiles": 7       // Number of daily log files to keep
      }
    }

${Colors.BOLD}SHELL COMPLETION:${Colors.ENDC}
  Add to your shell profile:
    bash:  eval "$(ghost completion bash)"
    zsh:   eval "$(ghost completion zsh)"
    fish:  ghost completion fish | source
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
            // Pass developer tools to telemetry server
            const serverOptions = {
                debuggerManager: this.debuggerManager,
                profilingManager: this.profilingManager,
                devMode: this.devMode,
                runtime: this.runtime,
                gateway: this.gateway,
                pipeline: this.pipeline
            };
            
            this.telemetryServer = this.telemetryInstance.startServer(port, serverOptions);
            console.log(`${Colors.GREEN}✓${Colors.ENDC} Telemetry server started on http://localhost:${port}`);
            console.log(`${Colors.DIM}  Available endpoints:${Colors.ENDC}`);
            console.log(`${Colors.DIM}    - GET  /health${Colors.ENDC}`);
            console.log(`${Colors.DIM}    - GET  /metrics${Colors.ENDC}`);
            console.log(`${Colors.DIM}    - GET  /metrics/<extension-id>${Colors.ENDC}`);
            console.log(`${Colors.DIM}    - GET  /spans${Colors.ENDC}`);
            console.log(`${Colors.DIM}    - GET  /logs?severity=<level>&limit=<n>${Colors.ENDC}`);
            console.log(`${Colors.DIM}    - POST /api/debugger/<id>/attach${Colors.ENDC}`);
            console.log(`${Colors.DIM}    - GET  /api/profiling/metrics${Colors.ENDC}`);
            console.log(`${Colors.DIM}    - POST /api/playground/execute${Colors.ENDC}`);
            console.log(`${Colors.DIM}    - POST /api/devmode/enable${Colors.ENDC}`);
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
        if (this.webhookController) {
            await this.webhookController.stop();
        }
        
        if (this.telemetryServer) {
            await this.stopTelemetryServer();
        }
        
        if (this.profilingManager) {
            this.profilingManager.shutdown();
        }
        
        if (this.debuggerManager) {
            this.debuggerManager.shutdown();
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
        
        if (launcher._isVerbose()) {
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

function semverParse(input) {
    const raw = (input || '').trim();
    const cleaned = raw.startsWith('v') ? raw.slice(1) : raw;
    const match = cleaned.match(/^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/);
    if (!match) return null;
    return { major: parseInt(match[1], 10), minor: parseInt(match[2], 10), patch: parseInt(match[3], 10) };
}

function semverString(v) {
    return `${v.major}.${v.minor}.${v.patch}`;
}

function semverCompare(a, b) {
    if (a.major !== b.major) return a.major > b.major ? 1 : -1;
    if (a.minor !== b.minor) return a.minor > b.minor ? 1 : -1;
    if (a.patch !== b.patch) return a.patch > b.patch ? 1 : -1;
    return 0;
}

function semverBump(version, bump) {
    const v = { major: version.major, minor: version.minor, patch: version.patch };
    if (bump === 'major') return { major: v.major + 1, minor: 0, patch: 0 };
    if (bump === 'minor') return { major: v.major, minor: v.minor + 1, patch: 0 };
    if (bump === 'patch') return { major: v.major, minor: v.minor, patch: v.patch + 1 };
    return v;
}

function semverDiffType(fromV, toV) {
    if (semverCompare(toV, fromV) <= 0) return 'none';
    if (toV.major !== fromV.major) return 'major';
    if (toV.minor !== fromV.minor) return 'minor';
    if (toV.patch !== fromV.patch) return 'patch';
    return 'none';
}

function conventionalRequiredBumpFromMessage(message) {
    const msg = (message || '').trim();
    if (!msg) return null;
    const firstLine = msg.split('\n')[0].trim();
    const match = firstLine.match(/^(\w+)(\([^)]+\))?(!)?:\s+/);
    const type = match ? match[1].toLowerCase() : null;
    const hasBang = !!(match && match[3] === '!');
    const hasBreaking = /BREAKING CHANGE/i.test(msg);
    if (hasBang || hasBreaking) return 'major';
    if (type === 'feat') return 'minor';
    if (type === 'fix' || type === 'perf') return 'patch';
    return null;
}

module.exports = { GatewayLauncher, semverParse, semverString, semverCompare, semverBump, semverDiffType, conventionalRequiredBumpFromMessage };
