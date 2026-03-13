const { spawn } = require('child_process');
const { EventEmitter } = require('events');
const readline = require('readline');
const { PluginSandbox, ResourceLimiter } = require('./sandbox');
const path = require('path');
const fs = require('fs');

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
            'STARTING': ['RUNNING', 'FAILED', 'STOPPED', 'STOPPING'],
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
        if (this.options.verbose || process.env.GHOST_DEBUG) console.log(`[DEBUG]   --> START ExtensionProcess.start(${this.extensionId})`);
        if (this.state === 'RUNNING') {
            if (this.options.verbose || process.env.GHOST_DEBUG) console.log(`[DEBUG]   <-- END ExtensionProcess.start(${this.extensionId}) - ALREADY RUNNING`);
            throw new Error(`Extension ${this.extensionId} is already running`);
        }

        if (this.state === 'STARTING') {
            if (this.options.verbose || process.env.GHOST_DEBUG) console.log(`[DEBUG]   <-- END ExtensionProcess.start(${this.extensionId}) - ALREADY STARTING`);
            throw new Error(`Extension ${this.extensionId} is already starting`);
        }

        this._transitionState('STARTING', 'start_requested');

        try {
            if (this.options.verbose || process.env.GHOST_DEBUG) console.log(`[DEBUG]   ExtensionProcess.start(${this.extensionId}) - Calling _spawnProcess()...`);
            await this._spawnProcess();
            if (this.options.verbose || process.env.GHOST_DEBUG) console.log(`[DEBUG]   ExtensionProcess.start(${this.extensionId}) - _spawnProcess() returned`);
            this.lastHeartbeat = Date.now();
            this.healthState = 'HEALTHY';
            this.consecutiveHeartbeatFailures = 0;
            this._startHeartbeatMonitoring();
            this.consecutiveRestarts = 0;

            if (this.enableResourceLimits && this.process && this.process.pid) {
                await this._applyResourceLimits();
                this._startResourceMonitoring();
            }

            if (this.state !== 'STARTING') {
                return;
            }

            this._transitionState('RUNNING', 'startup_success', {
                startupDuration: Date.now() - this.lastHeartbeat
            });
            if (this.options.verbose || process.env.GHOST_DEBUG) console.log(`[DEBUG]   <-- END ExtensionProcess.start(${this.extensionId}) - SUCCESS`);
        } catch (error) {
            if (this.options.verbose || process.env.GHOST_DEBUG) console.log(`[DEBUG]   <-- END ExtensionProcess.start(${this.extensionId}) - ERROR: ${error.message}`);
            if (this.state === 'STOPPING' || this.state === 'STOPPED') {
                return;
            }
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
            if (['init', 'shutdown', 'cleanup'].includes(request.method)) {
                request.resolve({ success: true, stopped: true });
                continue;
            }

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

    async call(method, params = {}, timeout = null) {
        const isLifecycle = ['cleanup', 'shutdown', 'init'].includes(method);
        
        if (this.state !== 'RUNNING' && !isLifecycle) {
            throw new Error(`Extension ${this.extensionId} is not running (state: ${this.state})`);
        }

        try {
            const result = await this._sendRequest(method, params, timeout);
            return result;
        } catch (error) {
            if (isLifecycle && this.state === 'STOPPED') {
                return { success: true };
            }
            this.emit('error', { method, error: error.message });
            throw error;
        }
    }

    async executeExtension(method, params, timeout = null) {
        return await this.call(method, params, timeout);
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
                    env: { ...process.env, GHOST_EXTENSION_ID: this.extensionId, GHOST_EXTENSION_MODE: 'subprocess', GHOST_USER_CWD: process.cwd() }
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
        const missingFields = requiredFields.filter(field => !this.manifest[field]);

        if (missingFields.length > 0) {
            throw new Error(
                `Invalid manifest for extension ${this.extensionId}: missing required fields: ${missingFields.join(', ')}`
            );
        }

        if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(this.manifest.version)) {
            throw new Error(
                `Invalid manifest for extension ${this.extensionId}: version must follow semver format`
            );
        }
    }

    _handleMessage(line) {
        let message;
        try {
            message = typeof line === 'string' ? JSON.parse(line) : line;
        } catch (error) {
            this._emitProtocolError('Parse error: invalid JSON from extension', {
                raw: line
            });
            return;
        }

        const validationError = this._validateJsonRpcMessage(message);
        if (validationError) {
            this._emitProtocolError(validationError, { message });
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

    _validateJsonRpcMessage(message) {
        if (!message || typeof message !== 'object' || Array.isArray(message)) {
            return 'Invalid Request: JSON-RPC payload must be an object';
        }

        if (message.jsonrpc !== '2.0') {
            return 'Invalid Request: jsonrpc must be "2.0"';
        }

        if ('method' in message) {
            if (typeof message.method !== 'string' || message.method.length === 0) {
                return 'Invalid Request: method must be a non-empty string';
            }
            return null;
        }

        const hasResult = Object.prototype.hasOwnProperty.call(message, 'result');
        const hasError = Object.prototype.hasOwnProperty.call(message, 'error');
        const hasId = Object.prototype.hasOwnProperty.call(message, 'id');

        if (!hasId || (!hasResult && !hasError)) {
            return 'Invalid Request: response messages require id and either result or error';
        }

        if (hasResult && hasError) {
            return 'Response validation error: response cannot contain both result and error';
        }

        if (hasError) {
            if (!message.error || typeof message.error !== 'object' || Array.isArray(message.error)) {
                return 'Response validation error: error must be an object';
            }

            if (typeof message.error.code !== 'number') {
                return 'Response validation error: error.code must be a number';
            }

            if (typeof message.error.message !== 'string') {
                return 'Response validation error: error.message must be a string';
            }
        }

        return null;
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
        if (!this.pendingRequests.has(message.id)) {
            this._emitProtocolError('Response validation error: unknown request id', {
                message
            });
            return;
        }
        const request = this.pendingRequests.get(message.id);
        clearTimeout(request.timeoutId);
        this.pendingRequests.delete(message.id);
        if (message.error) {
            if (request.method === 'heartbeat') {
                this.heartbeatMetrics.totalFailures++;
                this._updateHeartbeatSuccessRate();
            }
            const error = new Error(message.error.message || 'Unknown error');
            error.code = message.error.code;
            if (message.error.data !== undefined) {
                error.data = message.error.data;
            }
            request.reject(error);
        } else {
            if (request.method === 'heartbeat') {
                const responseTime = Date.now() - request.timestamp;
                this.lastHeartbeat = Date.now();
                this.consecutiveHeartbeatFailures = 0;
                this.heartbeatMetrics.totalPongs++;
                this.heartbeatMetrics.lastResponseTime = responseTime;
                this.heartbeatMetrics.minResponseTime = this.heartbeatMetrics.minResponseTime === null
                    ? responseTime
                    : Math.min(this.heartbeatMetrics.minResponseTime, responseTime);
                this.heartbeatMetrics.maxResponseTime = this.heartbeatMetrics.maxResponseTime === null
                    ? responseTime
                    : Math.max(this.heartbeatMetrics.maxResponseTime, responseTime);
                this.heartbeatMetrics.responseTimes.push(responseTime);
                if (this.heartbeatMetrics.responseTimes.length > 100) {
                    this.heartbeatMetrics.responseTimes.shift();
                }
                const totalResponseTime = this.heartbeatMetrics.responseTimes.reduce((sum, value) => sum + value, 0);
                this.heartbeatMetrics.avgResponseTime = totalResponseTime / this.heartbeatMetrics.responseTimes.length;
                this._updateHeartbeatSuccessRate();
            }
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
        const info = { extensionId: this.extensionId, method: message.method, params: message.params };
        this.emit('notification', info);
        this.emit('extension-notification', info);
    }

    _sendRequest(method, params = {}, timeout = null) {
        return new Promise((resolve, reject) => {
            if (!this.process || this.process.killed) return reject(new Error('Process not running'));
            const requestId = this.nextRequestId++;
            const requestTimeout = timeout !== null ? timeout : this.responseTimeout;
            
            let timeoutId = null;
            if (requestTimeout > 0) {
                timeoutId = setTimeout(() => {
                    if (this.pendingRequests.has(requestId)) {
                        this.pendingRequests.delete(requestId);
                        const error = new Error(`Request timeout for ${method}`);
                        error.code = -32603;
                        error.data = { reason: 'timeout', method };
                        reject(error);
                    }
                }, requestTimeout);
            }

            this.pendingRequests.set(requestId, { method, resolve, reject, timeoutId, timestamp: Date.now() });
            const envelope = { jsonrpc: '2.0', id: requestId, method, params };

            this._writeEnvelope(envelope);
        });
    }

    _sendResponse(id, result) {
        if (!this.process || this.process.killed || id == null) return;
        const envelope = { jsonrpc: '2.0', id, result };
        this._writeEnvelope(envelope);
    }

    _sendErrorResponse(id, code, message) {
        if (!this.process || this.process.killed) return;
        const envelope = { jsonrpc: '2.0', id: id !== undefined ? id : null, error: { code, message } };
        this._writeEnvelope(envelope);
    }

    _writeEnvelope(envelope) {
        if (!this.process || this.process.killed) return;

        if (this.process.send) {
            this.process.send(envelope);
        }

        if (this.process.stdin && !this.process.stdin.destroyed && this.process.stdin.writable) {
            this.process.stdin.write(JSON.stringify(envelope) + '\n');
        }
    }

    _emitProtocolError(error, metadata = {}) {
        this.emit('error', {
            extensionId: this.extensionId,
            error,
            ...metadata
        });
    }

    _startHeartbeatMonitoring() {
        this.heartbeatInterval = setInterval(() => this._sendPing(), this.heartbeatPingInterval);
    }

    _sendPing() {
        if (this.state !== 'RUNNING') return;
        this.lastPingTime = Date.now();
        this.heartbeatMetrics.totalPings++;
        this._updateHeartbeatSuccessRate();
        this._sendRequest('heartbeat', {}, this.heartbeatPongTimeout).catch(() => {
            this.consecutiveHeartbeatFailures++;
            this.heartbeatMetrics.totalFailures++;
            this.heartbeatMetrics.totalTimeouts++;
            this._updateHeartbeatSuccessRate();
            if (this.consecutiveHeartbeatFailures >= this.consecutiveFailureLimit) this.restart('heartbeat_failure');
        });
    }

    _updateHeartbeatSuccessRate() {
        if (this.heartbeatMetrics.totalPings === 0) {
            this.heartbeatMetrics.successRate = null;
            return;
        }

        this.heartbeatMetrics.successRate = this.heartbeatMetrics.totalPongs / this.heartbeatMetrics.totalPings;
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
        this.sandbox = null;
    }

    async start() {
        const mainFile = path.join(this.extensionPath, this.manifest.main);
        if (!fs.existsSync(mainFile)) {
            throw new Error(`Main file does not exist: ${mainFile}`);
        }

        this.sandbox = new PluginSandbox(this.extensionId, this.manifest, this.options);
        this.sandbox.initialize(this.options.api || {});

        const source = fs.readFileSync(mainFile, 'utf8');
        await this.sandbox.executeCode(source);
        await this.sandbox.executeCode(`
            const __ghostExport = module.exports && module.exports.default ? module.exports.default : module.exports;
            if (typeof __ghostExport !== 'function') {
                throw new Error('Sandbox extension must export a constructor');
            }
            var __ghostExtensionInstance = new __ghostExport();
            async function __ghostCall(method, params) {
                if (!__ghostExtensionInstance || typeof __ghostExtensionInstance[method] !== 'function') {
                    throw new Error('Method not found: ' + method);
                }
                return await __ghostExtensionInstance[method](params);
            }
            async function __ghostInit(config) {
                if (__ghostExtensionInstance && typeof __ghostExtensionInstance.init === 'function') {
                    return await __ghostExtensionInstance.init(config);
                }
                return { success: true };
            }
            async function __ghostCleanup() {
                if (__ghostExtensionInstance && typeof __ghostExtensionInstance.cleanup === 'function') {
                    return await __ghostExtensionInstance.cleanup();
                }
                return { success: true };
            }
        `);

        await this.sandbox.call('__ghostInit', [this.manifest.config || {}], this.options.startupTimeout);
        this.state = 'RUNNING';
        this.emit('started', { extensionId: this.extensionId });
    }

    async stop() {
        if (this.sandbox && this.state === 'RUNNING') {
            try {
                await this.sandbox.call('__ghostCleanup', [], this.options.shutdownTimeout);
            } catch (error) {
                // Ignore cleanup errors during shutdown
            }
            this.sandbox.terminate();
        }
        this.state = 'STOPPED';
    }

    async call(method, params = {}) {
        if (!this.sandbox || this.state !== 'RUNNING') {
            throw new Error(`Extension ${this.extensionId} is not running`);
        }

        return await this.sandbox.call('__ghostCall', [method, params], this.options.responseTimeout);
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
        if (this.options.verbose || process.env.GHOST_DEBUG) console.log(`[DEBUG] --> START startExtension(${extensionId})`);
        const runtimeOptions = { ...this.options, ...processOptions };
        const extension = runtimeOptions.executionMode === 'sandbox'
            ? new SandboxedExtension(extensionId, extensionPath, manifest, runtimeOptions)
            : new ExtensionProcess(extensionId, extensionPath, manifest, runtimeOptions);

        // Forward critical events from the individual process to the runtime manager
        extension.on('state-change', (info) => {
            this.emit('extension-state-change', info);
        });

        extension.on('interactive-exit', (info) => {
            this.emit('interactive-exit', info);
        });

        extension.on('error', (info) => {
            this.emit('extension-error', info);
            if (this.listenerCount('error') > 0) {
                this.emit('error', info);
            }
        });

        extension.on('notification', (info) => {
            this.emit('extension-notification', info);
            this.emit('notification', info);
        });

        extension.on('exit', (info) => {
            if (info.code !== 0 || info.signal) {
                this.emit('extension-crashed', {
                    extensionId,
                    code: info.code,
                    signal: info.signal,
                    pendingRequestCount: extension.pendingRequests.size,
                    crashType: info.signal ? 'signal' : 'exit'
                });
            }
        });

        this.extensions.set(extensionId, extension);
        this.extensionPaths.set(extensionId, extensionPath);
        this.extensionManifests.set(extensionId, manifest);
        if (this.options.verbose || process.env.GHOST_DEBUG) console.log(`[DEBUG] startExtension(${extensionId}) - Calling extension.start()...`);
        await extension.start();
        if (this.options.verbose || process.env.GHOST_DEBUG) console.log(`[DEBUG] <-- END startExtension(${extensionId}) - SUCCESS`);
        return extension;
    }
    async stopExtension(extensionId) {
        const ext = this.extensions.get(extensionId);
        if (ext) await ext.stop();
    }

    async callExtension(extensionId, method, params = {}, timeout = null) {
        const ext = this.extensions.get(extensionId);
        if (!ext) {
            throw new Error(`Extension ${extensionId} is not running`);
        }
        return await ext.call(method, params, timeout);
    }

    _createExtensionInterface(extension) {
        return new Proxy(extension, {
            get: (target, prop) => {
                if (prop === 'then' || prop === 'catch' || prop === 'finally') return undefined;
                if (prop in target) return typeof target[prop] === 'function' ? target[prop].bind(target) : target[prop];
                return async (params) => await target.executeExtension(prop, params);
            }
        });
    }

    getHealthStatus() {
        const stats = {
            total: this.extensions.size,
            totalExtensions: this.extensions.size,
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

    getExtensionState(extensionId) {
        const ext = this.extensions.get(extensionId);
        return ext ? ext.getState() : null;
    }

    getAllExtensionStates() {
        const states = {};
        for (const [id, ext] of this.extensions) {
            states[id] = ext.getState();
        }
        return states;
    }

    async shutdown() {
        for (const ext of this.extensions.values()) await ext.stop();
        this.extensions.clear();
        this.extensionPaths.clear();
        this.extensionManifests.clear();
    }
}

module.exports = { ExtensionRuntime, ExtensionProcess, SandboxedExtension };
