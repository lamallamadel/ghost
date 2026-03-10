const { spawn } = require('child_process');
const { EventEmitter } = require('events');
const readline = require('readline');
const { PluginSandbox, ResourceLimiter } = require('./sandbox');
const path = require('path');

class ExtensionProcess extends EventEmitter {
    constructor(extensionId, extensionPath, manifest, options = {}) {
        super();
        this.extensionId = extensionId;
        this.extensionPath = extensionPath;
        this.manifest = manifest;
        this.options = options;
        
        this.process = null;
        this.state = 'STOPPED';
        this.pendingRequests = new Map();
        this.nextRequestId = 1;
        this.lastHeartbeat = null;
        this.restartCount = 0;
        this.maxRestarts = options.maxRestarts || 3;
        this.restartWindow = options.restartWindow || 60000;
        this.restartHistory = [];
        this.heartbeatInterval = null;
        this.heartbeatTimeout = options.heartbeatTimeout || 30000;
        this.responseTimeout = options.responseTimeout || 30000;
        this.startupTimeout = options.startupTimeout || 30000;
        
        this.backoffDelay = 1000;
        this.backoffMaxDelay = 30000;
        this.backoffFactor = 2;
        this.consecutiveRestarts = 0;
        
        this.shutdownTimeout = options.shutdownTimeout || 5000;
        this.killTimeout = options.killTimeout || 10000;
        this.shutdownTimer = null;
        this.killTimer = null;
        
        this.heartbeatPingInterval = options.heartbeatPingInterval || 15000;
        this.heartbeatPongTimeout = options.heartbeatPongTimeout || 30000;
        this.degradedThreshold = options.degradedThreshold || 2000;
        this.consecutiveFailureLimit = options.consecutiveFailureLimit || 3;
        
        this.consecutiveHeartbeatFailures = 0;
        this.heartbeatMetrics = {
            totalPings: 0,
            totalPongs: 0,
            totalFailures: 0,
            totalTimeouts: 0,
            responseTimes: [],
            lastResponseTime: null,
            minResponseTime: null,
            maxResponseTime: null,
            avgResponseTime: null,
            successRate: null
        };
        this.healthState = 'HEALTHY';
        this.lastPingTime = null;
        this.pendingPing = null;
        this.intentHandler = options.intentHandler || null;
        
        this.validStateTransitions = {
            'STOPPED': ['STARTING'],
            'STARTING': ['RUNNING', 'FAILED', 'STOPPED'],
            'RUNNING': ['STOPPING', 'STOPPED', 'FAILED', 'DEGRADED'],
            'DEGRADED': ['RUNNING', 'STOPPING', 'FAILED'],
            'STOPPING': ['STOPPED', 'FAILED', 'STARTING'],
            'FAILED': ['STARTING', 'STOPPED', 'STOPPING']
        };

        this.resourceLimiter = null;
        this.resourceMonitorInterval = null;
        this.resourceMonitorFrequency = options.resourceMonitorFrequency || 5000;
        this.enableResourceLimits = options.enableResourceLimits !== false;
        this.resourceLimits = {
            cpu: options.cpu || 50,
            memory: options.memory || '512M',
            pids: options.pids || 100,
            networkBandwidth: options.networkBandwidth || null
        };
    }

    _validateStateTransition(fromState, toState, reason = '') {
        const allowedTransitions = this.validStateTransitions[fromState] || [];
        if (!allowedTransitions.includes(toState)) {
            throw new Error(
                `Invalid state transition: ${fromState} -> ${toState}${reason ? ` (reason: ${reason})` : ''}`
            );
        }
    }

    _transitionState(newState, reason = '', metadata = {}) {
        const oldState = this.state;
        this._validateStateTransition(oldState, newState, reason);
        
        this.state = newState;
        
        const stateChangeEvent = {
            extensionId: this.extensionId,
            timestamp: Date.now(),
            timestampISO: new Date().toISOString(),
            previousState: oldState,
            newState: newState,
            reason: reason,
            reasonCode: this._getReasonCode(reason),
            metadata: {
                pid: this.process ? this.process.pid : null,
                restartCount: this.restartCount,
                consecutiveRestarts: this.consecutiveRestarts,
                ...metadata
            }
        };
        
        this.emit('state-change', stateChangeEvent);
    }

    _getReasonCode(reason) {
        const reasonMap = {
            'user_requested': 'USER_REQUESTED',
            'start_requested': 'START_REQUESTED',
            'stop_requested': 'STOP_REQUESTED',
            'restart_requested': 'RESTART_REQUESTED',
            'startup_success': 'STARTUP_SUCCESS',
            'startup_failed': 'STARTUP_FAILED',
            'shutdown_complete': 'SHUTDOWN_COMPLETE',
            'shutdown_timeout': 'SHUTDOWN_TIMEOUT',
            'unexpected_exit': 'UNEXPECTED_EXIT',
            'unresponsive': 'UNRESPONSIVE',
            'heartbeat_failure': 'HEARTBEAT_FAILURE',
            'restart_limit_exceeded': 'RESTART_LIMIT_EXCEEDED',
            'validation_error': 'VALIDATION_ERROR',
            'spawn_error': 'SPAWN_ERROR'
        };
        
        return reasonMap[reason] || 'UNKNOWN';
    }

    async start() {
        if (this.state === 'RUNNING') {
            throw new Error(`Extension ${this.extensionId} is already running`);
        }
        
        if (this.state === 'STARTING') {
            throw new Error(`Extension ${this.extensionId} is already starting`);
        }

        this._transitionState('STARTING', 'start_requested');

        try {
            await this._spawnProcess();
            this.lastHeartbeat = Date.now();
            this.healthState = 'HEALTHY';
            this.consecutiveHeartbeatFailures = 0;
            this._startHeartbeatMonitoring();
            this.consecutiveRestarts = 0;
            
            if (this.enableResourceLimits && this.process && this.process.pid) {
                await this._applyResourceLimits();
                this._startResourceMonitoring();
            }
            
            this._transitionState('RUNNING', 'startup_success', {
                startupDuration: Date.now() - this.lastHeartbeat
            });
        } catch (error) {
            this._transitionState('FAILED', 'startup_failed', {
                error: error.message
            });
            throw error;
        }
    }

    async stop() {
        if (this.state === 'STOPPED') {
            return;
        }
        
        if (this.state === 'STOPPING') {
            return;
        }

        this._transitionState('STOPPING', 'stop_requested');

        this._stopHeartbeatMonitoring();
        this._stopResourceMonitoring();
        
        for (const [requestId, request] of this.pendingRequests) {
            clearTimeout(request.timeoutId);
            const error = new Error('Extension process stopped');
            error.code = -32603;
            error.data = { reason: 'Extension shutdown' };
            request.reject(error);
        }
        this.pendingRequests.clear();

        if (this.process) {
            await this._gracefulShutdown();
        }

        if (this.resourceLimiter) {
            await this.resourceLimiter.cleanup();
            this.resourceLimiter = null;
        }

        this._transitionState('STOPPED', 'shutdown_complete');
    }

    async _gracefulShutdown() {
        const shutdownStartTime = Date.now();
        let shutdownMethod = 'shutdown_request';
        
        if (!this.process || this.process.killed || this.process.exitCode !== null) {
            return;
        }
        
        return new Promise((resolve) => {
            let resolved = false;
            
            const resolveOnce = () => {
                if (!resolved) {
                    resolved = true;
                    this._clearShutdownTimers();
                    const shutdownDuration = Date.now() - shutdownStartTime;
                    this.emit('shutdown-complete', {
                        extensionId: this.extensionId,
                        timestamp: Date.now(),
                        shutdownMethod,
                        shutdownDuration
                    });
                    this.process = null;
                    resolve();
                }
            };
            
            this.process.once('exit', () => {
                resolveOnce();
            });
            
            this._sendRequest('shutdown', {}, this.shutdownTimeout)
                .catch(() => {
                    if (!resolved && this.process && !this.process.killed) {
                        shutdownMethod = 'SIGTERM';
                        this.process.kill('SIGTERM');
                    }
                });
            
            this.shutdownTimer = setTimeout(() => {
                if (!resolved && this.process && !this.process.killed) {
                    shutdownMethod = 'SIGTERM';
                    this.process.kill('SIGTERM');
                    
                    this.killTimer = setTimeout(() => {
                        if (!resolved && this.process && !this.process.killed) {
                            shutdownMethod = 'SIGKILL';
                            this.process.kill('SIGKILL');
                        }
                    }, this.killTimeout - this.shutdownTimeout);
                }
            }, this.shutdownTimeout);
        });
    }

    _clearShutdownTimers() {
        if (this.shutdownTimer) {
            clearTimeout(this.shutdownTimer);
            this.shutdownTimer = null;
        }
        if (this.killTimer) {
            clearTimeout(this.killTimer);
            this.killTimer = null;
        }
    }

    async restart(reason = 'restart_requested') {
        const now = Date.now();
        this.restartHistory = this.restartHistory.filter(
            timestamp => now - timestamp < this.restartWindow
        );
        
        if (this.restartHistory.length >= this.maxRestarts) {
            const error = new Error(
                `Extension ${this.extensionId} exceeded restart limit (${this.maxRestarts} restarts in ${this.restartWindow}ms)`
            );
            this._transitionState('FAILED', 'restart_limit_exceeded', {
                restartsInWindow: this.restartHistory.length
            });
            throw error;
        }

        this.restartHistory.push(now);
        this.restartCount++;
        this.consecutiveRestarts++;
        
        const delay = this._calculateBackoffDelay();
        
        this.emit('restart-initiated', {
            extensionId: this.extensionId,
            timestamp: now,
            restartCount: this.restartCount,
            consecutiveRestarts: this.consecutiveRestarts,
            backoffDelay: delay,
            reason
        });

        await this.stop();
        
        if (delay > 0) {
            await new Promise(resolve => setTimeout(resolve, delay));
        }
        
        await this.start();
        
        this.emit('restarted', {
            extensionId: this.extensionId,
            timestamp: Date.now(),
            restartCount: this.restartCount,
            consecutiveRestarts: this.consecutiveRestarts
        });
    }

    _calculateBackoffDelay() {
        if (this.consecutiveRestarts === 0) {
            return 0;
        }
        
        const delay = this.backoffDelay * Math.pow(this.backoffFactor, this.consecutiveRestarts - 1);
        return Math.min(delay, this.backoffMaxDelay);
    }

    async call(method, params = {}) {
        const isLifecycle = ['cleanup', 'shutdown', 'init'].includes(method);
        
        if (this.state !== 'RUNNING' && !isLifecycle) {
            throw new Error(`Extension ${this.extensionId} is not running (state: ${this.state})`);
        }

        try {
            const result = await this._sendRequest(method, params);
            return result;
        } catch (error) {
            if (isLifecycle && this.state === 'STOPPED') {
                return { success: true };
            }
            this.emit('error', { method, error: error.message });
            throw error;
        }
    }

    async executeExtension(method, params) {
        return await this.call(method, params);
    }

    getState() {
        return {
            extensionId: this.extensionId,
            state: this.state,
            healthState: this.healthState,
            pid: this.process ? this.process.pid : null,
            restartCount: this.restartCount,
            consecutiveRestarts: this.consecutiveRestarts,
            lastHeartbeat: this.lastHeartbeat,
            pendingRequests: this.pendingRequests.size,
            uptime: this.state === 'RUNNING' && this.lastHeartbeat 
                ? Date.now() - this.lastHeartbeat 
                : 0,
            heartbeat: {
                consecutiveFailures: this.consecutiveHeartbeatFailures,
                metrics: {
                    totalPings: this.heartbeatMetrics.totalPings,
                    totalPongs: this.heartbeatMetrics.totalPongs,
                    totalFailures: this.heartbeatMetrics.totalFailures,
                    totalTimeouts: this.heartbeatMetrics.totalTimeouts,
                    lastResponseTime: this.heartbeatMetrics.lastResponseTime,
                    minResponseTime: this.heartbeatMetrics.minResponseTime,
                    maxResponseTime: this.heartbeatMetrics.maxResponseTime,
                    avgResponseTime: this.heartbeatMetrics.avgResponseTime,
                    successRate: this.heartbeatMetrics.successRate
                }
            }
        };
    }

    async _spawnProcess() {
        try {
            this._validateManifest();
            const mainFile = path.join(this.extensionPath, this.manifest.main);
            const fs = require('fs');
            if (!fs.existsSync(mainFile)) {
                throw new Error(`Main file does not exist: ${mainFile}`);
            }
        } catch (error) {
            throw error;
        }

        return new Promise((resolve, reject) => {
            let startupTimeoutId = null;
            let isResolved = false;
            let stderrBuffer = [];
            const maxStderrLines = 100;

            const cleanup = () => {
                if (startupTimeoutId) {
                    clearTimeout(startupTimeoutId);
                    startupTimeoutId = null;
                }
            };

            const rejectOnce = (error) => {
                if (!isResolved) {
                    isResolved = true;
                    cleanup();
                    reject(error);
                }
            };

            const resolveOnce = () => {
                if (!isResolved) {
                    isResolved = true;
                    cleanup();
                    resolve();
                }
            };

            startupTimeoutId = setTimeout(() => {
                const stderrContext = stderrBuffer.length > 0 ? ` stderr: ${stderrBuffer.join(' | ')}` : '';
                rejectOnce(new Error(`Extension ${this.extensionId} failed to start within ${this.startupTimeout}ms.${stderrContext}`));
            }, this.startupTimeout);

            try {
                const mainFile = path.join(this.extensionPath, this.manifest.main);
                const stdio = this.options.interactive ? ['inherit', 'inherit', 'inherit', 'ipc'] : ['pipe', 'pipe', 'pipe', 'ipc'];

                this.process = spawn('node', [mainFile], {
                    stdio,
                    cwd: this.extensionPath,
                    env: { ...process.env, GHOST_EXTENSION_ID: this.extensionId, GHOST_EXTENSION_MODE: 'subprocess' }
                });

                this.process.on('message', (message) => this._handleMessage(message));

                if (!this.options.interactive && this.process.stdout) {
                    const rlStdout = readline.createInterface({ input: this.process.stdout, crlfDelay: Infinity });
                    rlStdout.on('line', (line) => this._handleMessage(line));
                }

                if (!this.options.interactive && this.process.stderr) {
                    const rlStderr = readline.createInterface({ input: this.process.stderr, crlfDelay: Infinity });
                    rlStderr.on('line', (line) => {
                        stderrBuffer.push(line);
                        if (stderrBuffer.length > maxStderrLines) stderrBuffer.shift();
                        this.emit('stderr', { extensionId: this.extensionId, line, timestamp: new Date().toISOString() });
                    });
                }

                this.process.on('error', (error) => {
                    this.emit('error', { extensionId: this.extensionId, error: error.message, code: error.code });
                    rejectOnce(error);
                });

                this.process.on('exit', (code, signal) => {
                    if (!isResolved) {
                        const stderrContext = stderrBuffer.length > 0 ? ` stderr: ${stderrBuffer.join(' | ')}` : '';
                        rejectOnce(new Error(`Extension ${this.extensionId} exited prematurely (code: ${code}, signal: ${signal}).${stderrContext}`));
                    }
                    this.emit('exit', { extensionId: this.extensionId, code, signal });
                    if (this.state === 'RUNNING' || this.state === 'DEGRADED') this._handleUnexpectedExit(code, signal);
                });

                this._applyResourceLimits();

                this._sendRequest('init', { config: this.manifest.config || {} }, this.startupTimeout)
                    .then(() => resolveOnce())
                    .catch((error) => rejectOnce(error));

            } catch (error) {
                rejectOnce(error);
            }
        });
    }

    _validateManifest() {
        const requiredFields = ['id', 'name', 'version', 'main'];
        for (const field of requiredFields) {
            if (!this.manifest[field]) throw new Error(`Invalid manifest for extension ${this.extensionId}: missing ${field}`);
        }
    }

    _handleMessage(line) {
        let message;
        try {
            message = typeof line === 'string' ? JSON.parse(line) : line;
        } catch (error) {
            return;
        }

        if (this._isResponse(message)) {
            this._handleResponse(message);
        } else if (this._isRequest(message)) {
            this._handleRequest(message);
        } else if (this._isNotification(message)) {
            this._handleNotification(message);
        }
    }

    _isResponse(message) {
        return !message.method && ('result' in message || 'error' in message) && 'id' in message;
    }

    _isRequest(message) {
        return 'method' in message && 'id' in message;
    }

    _isNotification(message) {
        return 'method' in message && !('id' in message);
    }

    _handleResponse(message) {
        if (!this.pendingRequests.has(message.id)) return;
        const request = this.pendingRequests.get(message.id);
        clearTimeout(request.timeoutId);
        this.pendingRequests.delete(message.id);
        if (message.error) {
            const error = new Error(message.error.message || 'Unknown error');
            error.code = message.error.code;
            request.reject(error);
        } else {
            request.resolve(message.result);
        }
    }

    _handleRequest(message) {
        if (message.method === 'heartbeat') {
            this.lastHeartbeat = Date.now();
            this._sendResponse(message.id, { alive: true });
        } else if (message.method === 'intent' && this.intentHandler) {
            this.intentHandler(message.params)
                .then(result => this._sendResponse(message.id, result))
                .catch(error => this._sendErrorResponse(message.id, -32603, error.message));
        } else {
            this._sendErrorResponse(message.id, -32601, 'Method not found');
        }
    }

    _handleNotification(message) {
        this.emit('notification', { extensionId: this.extensionId, method: message.method, params: message.params });
    }

    _sendRequest(method, params = {}, timeout = null) {
        return new Promise((resolve, reject) => {
            if (!this.process || this.process.killed) return reject(new Error('Process not running'));
            const requestId = this.nextRequestId++;
            const requestTimeout = timeout || this.responseTimeout;
            const timeoutId = setTimeout(() => {
                if (this.pendingRequests.has(requestId)) {
                    this.pendingRequests.delete(requestId);
                    reject(new Error(`Request timeout for ${method}`));
                }
            }, requestTimeout);

            this.pendingRequests.set(requestId, { method, resolve, reject, timeoutId, timestamp: Date.now() });
            const envelope = { jsonrpc: '2.0', id: requestId, method, params };
            
            if (this.process.send) {
                this.process.send(envelope);
            } else {
                this.process.stdin.write(JSON.stringify(envelope) + '\n');
            }
        });
    }

    _sendResponse(id, result) {
        if (!this.process || this.process.killed || id == null) return;
        const envelope = { jsonrpc: '2.0', id, result };
        if (this.process.send) {
            this.process.send(envelope);
        } else {
            this.process.stdin.write(JSON.stringify(envelope) + '\n');
        }
    }

    _sendErrorResponse(id, code, message) {
        if (!this.process || this.process.killed) return;
        const envelope = { jsonrpc: '2.0', id: id !== undefined ? id : null, error: { code, message } };
        if (this.process.send) {
            this.process.send(envelope);
        } else {
            this.process.stdin.write(JSON.stringify(envelope) + '\n');
        }
    }

    _startHeartbeatMonitoring() {
        this.heartbeatInterval = setInterval(() => this._sendPing(), this.heartbeatPingInterval);
    }

    _sendPing() {
        if (this.state !== 'RUNNING') return;
        this._sendRequest('heartbeat', {}, this.heartbeatPongTimeout).catch(() => {
            this.consecutiveHeartbeatFailures++;
            if (this.consecutiveHeartbeatFailures >= this.consecutiveFailureLimit) this.restart('heartbeat_failure');
        });
    }

    _stopHeartbeatMonitoring() {
        if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    }

    async _applyResourceLimits() {
        try {
            if (!this.process || !this.process.pid) return;
            this.resourceLimiter = new ResourceLimiter(this.extensionId, this.resourceLimits);
        } catch (error) {}
    }

    _startResourceMonitoring() {
        if (!this.enableResourceLimits || !this.resourceLimiter) return;
        this.resourceMonitorInterval = setInterval(async () => {
            if (this.state !== 'RUNNING') return;
            try {
                const usage = await this.resourceLimiter.getUsage();
                this.emit('resource-usage', {
                    extensionId: this.extensionId,
                    usage
                });
            } catch (error) {
                // Ignore monitor errors silently
            }
        }, this.resourceMonitorFrequency);
    }

    _stopResourceMonitoring() {
        if (this.resourceMonitorInterval) clearInterval(this.resourceMonitorInterval);
    }

    async _handleUnexpectedExit(code, signal) {
        // If an interactive shell exits cleanly, it's a user action, not a crash.
        if (this.options.interactive && code === 0) {
            this._transitionState('STOPPED', 'user_requested');
            this.emit('interactive-exit', { extensionId: this.extensionId });
            return;
        }

        if (this.restartCount < this.maxRestarts) {
            await this.restart('unexpected_exit');
        } else {
            this._transitionState('FAILED', 'restart_limit_exceeded');
        }
    }
}

class SandboxedExtension extends EventEmitter {
    constructor(extensionId, extensionPath, manifest, options = {}) {
        super();
        this.extensionId = extensionId;
        this.extensionPath = extensionPath;
        this.manifest = manifest;
        this.options = options;
        this.state = 'STOPPED';
    }

    async start() {
        this.state = 'RUNNING';
        this.emit('started', { extensionId: this.extensionId });
    }

    async stop() {
        this.state = 'STOPPED';
    }

    async call(method, params = {}) {
        return { success: true };
    }

    async executeExtension(method, params) {
        return await this.call(method, params);
    }

    getState() {
        return { extensionId: this.extensionId, state: this.state };
    }
}

class ExtensionRuntime extends EventEmitter {
    constructor(options = {}) {
        super();
        this.options = options;
        this.extensions = new Map();
        this.extensionPaths = new Map();
        this.extensionManifests = new Map();
    }

    async startExtension(extensionId, extensionPath, manifest, processOptions = {}) {
        const extension = new ExtensionProcess(extensionId, extensionPath, manifest, { ...this.options, ...processOptions });
        
        // Forward critical events from the individual process to the runtime manager
        extension.on('interactive-exit', (info) => {
            this.emit('interactive-exit', info);
        });

        extension.on('error', (info) => {
            this.emit('error', info);
        });

        this.extensions.set(extensionId, extension);
        this.extensionPaths.set(extensionId, extensionPath);
        this.extensionManifests.set(extensionId, manifest);
        await extension.start();
        return extension;
    }

    async stopExtension(extensionId) {
        const ext = this.extensions.get(extensionId);
        if (ext) await ext.stop();
    }

    _createExtensionInterface(extension) {
        return new Proxy(extension, {
            get: (target, prop) => {
                if (prop in target) return typeof target[prop] === 'function' ? target[prop].bind(target) : target[prop];
                return async (params) => await target.executeExtension(prop, params);
            }
        });
    }

    getHealthStatus() {
        const stats = {
            total: this.extensions.size,
            running: 0,
            degraded: 0,
            failed: 0,
            stopped: 0,
            extensions: {}
        };

        for (const [id, ext] of this.extensions) {
            const state = ext.getState();
            stats.extensions[id] = {
                state: state.state,
                health: state.healthState,
                uptime: state.uptime,
                restarts: state.restartCount
            };

            if (state.state === 'RUNNING') stats.running++;
            else if (state.state === 'DEGRADED') stats.degraded++;
            else if (state.state === 'FAILED') stats.failed++;
            else if (state.state === 'STOPPED') stats.stopped++;
        }

        return stats;
    }

    async shutdown() {
        for (const ext of this.extensions.values()) await ext.stop();
    }
}

module.exports = { ExtensionRuntime, ExtensionProcess, SandboxedExtension };
