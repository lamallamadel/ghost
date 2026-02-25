const { spawn } = require('child_process');
const { EventEmitter } = require('events');
const readline = require('readline');

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
        this.startupTimeout = options.startupTimeout || 10000;
        
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
        
        this.validStateTransitions = {
            'STOPPED': ['STARTING'],
            'STARTING': ['RUNNING', 'FAILED', 'STOPPED'],
            'RUNNING': ['STOPPING', 'FAILED', 'DEGRADED'],
            'DEGRADED': ['RUNNING', 'STOPPING', 'FAILED'],
            'STOPPING': ['STOPPED', 'FAILED'],
            'FAILED': ['STARTING', 'STOPPED']
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
        if (this.state !== 'RUNNING') {
            throw new Error(`Extension ${this.extensionId} is not running (state: ${this.state})`);
        }

        try {
            const result = await this._sendRequest(method, params);
            return result;
        } catch (error) {
            this.emit('error', { method, error: error.message });
            throw error;
        }
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
        const fs = require('fs');
        const path = require('path');

        try {
            this._validateManifest();
            
            const mainFile = path.join(this.extensionPath, this.manifest.main);
            if (!fs.existsSync(mainFile)) {
                throw new Error(
                    `Main file does not exist: ${mainFile} (extension: ${this.extensionId})`
                );
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
                
                if (this.process && !this.process.killed) {
                    try {
                        this.process.kill('SIGKILL');
                    } catch (e) {
                    }
                    this.process = null;
                }
                
                stderrBuffer = [];
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
                    if (startupTimeoutId) {
                        clearTimeout(startupTimeoutId);
                        startupTimeoutId = null;
                    }
                    resolve();
                }
            };

            startupTimeoutId = setTimeout(() => {
                const stderrContext = stderrBuffer.length > 0 
                    ? ` stderr: ${stderrBuffer.join(' | ')}` 
                    : '';
                
                this._logStructuredError('startup_timeout', {
                    timeout: this.startupTimeout,
                    stderrLines: stderrBuffer.length,
                    stderr: stderrBuffer
                });
                
                rejectOnce(
                    new Error(
                        `Extension ${this.extensionId} failed to start within ${this.startupTimeout}ms.${stderrContext}`
                    )
                );
            }, this.startupTimeout);

            try {
                const mainFile = path.join(this.extensionPath, this.manifest.main);
                
                this.process = spawn('node', [mainFile], {
                    stdio: ['pipe', 'pipe', 'pipe'],
                    cwd: this.extensionPath,
                    env: {
                        ...process.env,
                        GHOST_EXTENSION_ID: this.extensionId,
                        GHOST_EXTENSION_MODE: 'subprocess'
                    }
                });

                const rlStdout = readline.createInterface({
                    input: this.process.stdout,
                    crlfDelay: Infinity
                });

                const rlStderr = readline.createInterface({
                    input: this.process.stderr,
                    crlfDelay: Infinity
                });

                rlStdout.on('line', (line) => {
                    this._handleMessage(line);
                });

                rlStderr.on('line', (line) => {
                    stderrBuffer.push(line);
                    if (stderrBuffer.length > maxStderrLines) {
                        stderrBuffer.shift();
                    }
                    
                    this._logStructuredError('stderr', {
                        line,
                        timestamp: new Date().toISOString()
                    });
                    
                    this.emit('stderr', { 
                        extensionId: this.extensionId, 
                        line,
                        timestamp: new Date().toISOString()
                    });
                });

                this.process.on('error', (error) => {
                    this._logStructuredError('process_error', {
                        error: error.message,
                        code: error.code,
                        errno: error.errno,
                        stderr: stderrBuffer
                    });
                    
                    this.emit('error', { 
                        extensionId: this.extensionId, 
                        error: error.message,
                        code: error.code 
                    });
                    
                    rejectOnce(error);
                });

                this.process.on('exit', (code, signal) => {
                    const exitInfo = { 
                        extensionId: this.extensionId, 
                        code, 
                        signal,
                        stderr: stderrBuffer.length > 0 ? stderrBuffer : undefined
                    };
                    
                    if (!isResolved) {
                        this._logStructuredError('premature_exit', {
                            code,
                            signal,
                            stderr: stderrBuffer
                        });
                        
                        const stderrContext = stderrBuffer.length > 0 
                            ? ` stderr: ${stderrBuffer.join(' | ')}` 
                            : '';
                        
                        rejectOnce(
                            new Error(
                                `Extension ${this.extensionId} exited prematurely (code: ${code}, signal: ${signal}).${stderrContext}`
                            )
                        );
                    }
                    
                    this.emit('exit', exitInfo);
                    
                    if (this.state === 'RUNNING' || this.state === 'DEGRADED') {
                        this._handleUnexpectedExit(code, signal);
                    }
                });
                
                this.process.on('disconnect', () => {
                    this._logStructuredError('process_disconnect', {
                        pid: this.process ? this.process.pid : null,
                        state: this.state
                    });
                    
                    this.emit('disconnected', {
                        extensionId: this.extensionId,
                        timestamp: Date.now(),
                        pid: this.process ? this.process.pid : null
                    });
                });

                this._sendRequest('init', { config: this.manifest.config || {} }, this.startupTimeout)
                    .then(() => {
                        resolveOnce();
                    })
                    .catch((error) => {
                        this._logStructuredError('init_failed', {
                            error: error.message,
                            stderr: stderrBuffer
                        });
                        
                        rejectOnce(error);
                    });

            } catch (error) {
                this._logStructuredError('spawn_exception', {
                    error: error.message,
                    stack: error.stack
                });
                
                rejectOnce(error);
            }
        });
    }

    _validateManifest() {
        const requiredFields = ['id', 'name', 'version', 'main'];
        const missingFields = [];

        for (const field of requiredFields) {
            if (!this.manifest[field]) {
                missingFields.push(field);
            }
        }

        if (missingFields.length > 0) {
            throw new Error(
                `Invalid manifest for extension ${this.extensionId}: missing required fields: ${missingFields.join(', ')}`
            );
        }

        if (typeof this.manifest.id !== 'string' || this.manifest.id.trim().length === 0) {
            throw new Error(
                `Invalid manifest for extension ${this.extensionId}: 'id' must be a non-empty string`
            );
        }

        if (typeof this.manifest.name !== 'string' || this.manifest.name.trim().length === 0) {
            throw new Error(
                `Invalid manifest for extension ${this.extensionId}: 'name' must be a non-empty string`
            );
        }

        if (typeof this.manifest.version !== 'string' || this.manifest.version.trim().length === 0) {
            throw new Error(
                `Invalid manifest for extension ${this.extensionId}: 'version' must be a non-empty string`
            );
        }

        if (typeof this.manifest.main !== 'string' || this.manifest.main.trim().length === 0) {
            throw new Error(
                `Invalid manifest for extension ${this.extensionId}: 'main' must be a non-empty string`
            );
        }

        const versionRegex = /^\d+\.\d+\.\d+/;
        if (!versionRegex.test(this.manifest.version)) {
            throw new Error(
                `Invalid manifest for extension ${this.extensionId}: 'version' must follow semver format (e.g., 1.0.0)`
            );
        }
    }

    _logStructuredError(errorType, details) {
        const logEntry = {
            timestamp: new Date().toISOString(),
            extensionId: this.extensionId,
            errorType,
            details,
            state: this.state
        };

        this.emit('structured-error', logEntry);

        if (this.options.enableErrorLogging !== false) {
            console.error(`[Ghost Runtime Error] ${JSON.stringify(logEntry)}`);
        }
    }

    _handleMessage(line) {
        let message;
        
        try {
            message = JSON.parse(line);
        } catch (error) {
            this._sendErrorResponse(null, -32700, 'Parse error', { 
                originalMessage: line.substring(0, 100),
                parseError: error.message 
            });
            this.emit('error', {
                extensionId: this.extensionId,
                error: `JSON-RPC Parse error: ${error.message}`,
                line: line.substring(0, 100)
            });
            return;
        }

        const validationError = this._validateJsonRpcMessage(message);
        if (validationError) {
            this._sendErrorResponse(
                typeof message.id !== 'undefined' ? message.id : null,
                validationError.code,
                validationError.message,
                validationError.data
            );
            this.emit('error', {
                extensionId: this.extensionId,
                error: `JSON-RPC validation error: ${validationError.message}`,
                message
            });
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
        if (typeof message !== 'object' || message === null) {
            return {
                code: -32600,
                message: 'Invalid Request',
                data: { reason: 'Message must be an object' }
            };
        }

        if (message.jsonrpc !== '2.0') {
            return {
                code: -32600,
                message: 'Invalid Request',
                data: { reason: 'Missing or invalid "jsonrpc" field (must be "2.0")' }
            };
        }

        const hasMethod = 'method' in message;
        const hasResult = 'result' in message;
        const hasError = 'error' in message;
        const hasId = 'id' in message;

        if (hasMethod) {
            if (typeof message.method !== 'string') {
                return {
                    code: -32600,
                    message: 'Invalid Request',
                    data: { reason: '"method" must be a string' }
                };
            }
            if (message.method.startsWith('rpc.')) {
                return {
                    code: -32600,
                    message: 'Invalid Request',
                    data: { reason: 'Method names starting with "rpc." are reserved' }
                };
            }
            if (hasId && message.id !== null && typeof message.id !== 'string' && typeof message.id !== 'number') {
                return {
                    code: -32600,
                    message: 'Invalid Request',
                    data: { reason: '"id" must be a string, number, or null' }
                };
            }
        } else if (hasResult || hasError) {
            if (!hasId) {
                return {
                    code: -32600,
                    message: 'Invalid Request',
                    data: { reason: 'Response must have "id" field' }
                };
            }
            if (hasResult && hasError) {
                return {
                    code: -32600,
                    message: 'Invalid Request',
                    data: { reason: 'Response cannot have both "result" and "error"' }
                };
            }
            if (!hasResult && !hasError) {
                return {
                    code: -32600,
                    message: 'Invalid Request',
                    data: { reason: 'Response must have either "result" or "error"' }
                };
            }
            if (hasError) {
                if (typeof message.error !== 'object' || message.error === null) {
                    return {
                        code: -32600,
                        message: 'Invalid Request',
                        data: { reason: '"error" must be an object' }
                    };
                }
                if (typeof message.error.code !== 'number') {
                    return {
                        code: -32600,
                        message: 'Invalid Request',
                        data: { reason: '"error.code" must be a number' }
                    };
                }
                if (typeof message.error.message !== 'string') {
                    return {
                        code: -32600,
                        message: 'Invalid Request',
                        data: { reason: '"error.message" must be a string' }
                    };
                }
            }
        } else {
            return {
                code: -32600,
                message: 'Invalid Request',
                data: { reason: 'Message must have "method" (request/notification) or "result"/"error" (response)' }
            };
        }

        return null;
    }

    _isResponse(message) {
        return ('result' in message || 'error' in message) && 'id' in message;
    }

    _isRequest(message) {
        return 'method' in message && 'id' in message;
    }

    _isNotification(message) {
        return 'method' in message && !('id' in message);
    }

    _handleResponse(message) {
        if (!this.pendingRequests.has(message.id)) {
            this.emit('error', {
                extensionId: this.extensionId,
                error: 'Received response for unknown request ID',
                responseId: message.id
            });
            return;
        }

        const request = this.pendingRequests.get(message.id);
        clearTimeout(request.timeoutId);
        this.pendingRequests.delete(message.id);

        if (message.error) {
            const error = new Error(message.error.message || 'Unknown error');
            error.code = message.error.code;
            error.data = message.error.data;
            request.reject(error);
        } else {
            request.resolve(message.result);
        }
    }

    _handleRequest(message) {
        if (message.method === 'heartbeat') {
            this.lastHeartbeat = Date.now();
            this._sendResponse(message.id, { alive: true });
        } else if (message.method === 'pong') {
            this._handlePongResponse(message);
        } else {
            this._sendErrorResponse(message.id, -32601, 'Method not found', {
                method: message.method
            });
        }
    }

    _handlePongResponse(message) {
        const now = Date.now();
        
        if (this.lastPingTime) {
            const responseTime = now - this.lastPingTime;
            
            this.heartbeatMetrics.lastResponseTime = responseTime;
            this.heartbeatMetrics.totalPongs++;
            this.heartbeatMetrics.responseTimes.push(responseTime);
            
            if (this.heartbeatMetrics.responseTimes.length > 100) {
                this.heartbeatMetrics.responseTimes.shift();
            }
            
            if (this.heartbeatMetrics.minResponseTime === null || responseTime < this.heartbeatMetrics.minResponseTime) {
                this.heartbeatMetrics.minResponseTime = responseTime;
            }
            
            if (this.heartbeatMetrics.maxResponseTime === null || responseTime > this.heartbeatMetrics.maxResponseTime) {
                this.heartbeatMetrics.maxResponseTime = responseTime;
            }
            
            const sum = this.heartbeatMetrics.responseTimes.reduce((a, b) => a + b, 0);
            this.heartbeatMetrics.avgResponseTime = Math.round(sum / this.heartbeatMetrics.responseTimes.length);
            
            const totalAttempts = this.heartbeatMetrics.totalPings;
            const totalSuccesses = this.heartbeatMetrics.totalPongs;
            this.heartbeatMetrics.successRate = totalAttempts > 0 
                ? Math.round((totalSuccesses / totalAttempts) * 100) / 100 
                : null;
            
            if (responseTime > this.degradedThreshold) {
                if (this.healthState !== 'DEGRADED') {
                    this.healthState = 'DEGRADED';
                    this.emit('degraded', {
                        extensionId: this.extensionId,
                        timestamp: now,
                        responseTime,
                        threshold: this.degradedThreshold
                    });
                }
            } else {
                if (this.healthState === 'DEGRADED') {
                    this.healthState = 'HEALTHY';
                    this.emit('recovered', {
                        extensionId: this.extensionId,
                        timestamp: now,
                        responseTime
                    });
                }
            }
            
            this.consecutiveHeartbeatFailures = 0;
        }
        
        this.lastHeartbeat = now;
        this._sendResponse(message.id, { timestamp: now });
    }

    _handleNotification(message) {
        this.emit('notification', {
            extensionId: this.extensionId,
            method: message.method,
            params: message.params
        });
    }

    _sendRequest(method, params = {}, timeout = null) {
        return new Promise((resolve, reject) => {
            if (!this.process || this.process.killed) {
                reject(new Error(`Extension ${this.extensionId} process is not running`));
                return;
            }

            if (typeof method !== 'string' || method.length === 0) {
                reject(new Error('Method must be a non-empty string'));
                return;
            }

            if (method.startsWith('rpc.')) {
                reject(new Error('Method names starting with "rpc." are reserved'));
                return;
            }

            const requestId = this.nextRequestId++;
            const requestTimeout = timeout || this.responseTimeout;

            const timeoutId = setTimeout(() => {
                if (this.pendingRequests.has(requestId)) {
                    this.pendingRequests.delete(requestId);
                    const error = new Error(`Request timeout for method ${method} after ${requestTimeout}ms`);
                    error.code = -32603;
                    error.data = { 
                        method, 
                        timeout: requestTimeout,
                        requestId 
                    };
                    reject(error);
                }
            }, requestTimeout);

            this.pendingRequests.set(requestId, {
                method,
                resolve,
                reject,
                timeoutId,
                timestamp: Date.now()
            });

            const envelope = {
                jsonrpc: '2.0',
                id: requestId,
                method,
                params
            };

            try {
                const messageStr = JSON.stringify(envelope);
                this.process.stdin.write(messageStr + '\n');
            } catch (error) {
                clearTimeout(timeoutId);
                this.pendingRequests.delete(requestId);
                const wrappedError = new Error(`Failed to send request: ${error.message}`);
                wrappedError.code = -32603;
                wrappedError.data = { method, originalError: error.message };
                reject(wrappedError);
            }
        });
    }

    _sendResponse(id, result) {
        if (!this.process || this.process.killed) {
            return;
        }

        if (id === null || id === undefined) {
            return;
        }

        const envelope = {
            jsonrpc: '2.0',
            id,
            result
        };

        try {
            const messageStr = JSON.stringify(envelope);
            this.process.stdin.write(messageStr + '\n');
        } catch (error) {
            this.emit('error', {
                extensionId: this.extensionId,
                error: `Failed to send response: ${error.message}`,
                id
            });
        }
    }

    _sendErrorResponse(id, code, message, data = undefined) {
        if (!this.process || this.process.killed) {
            return;
        }

        const envelope = {
            jsonrpc: '2.0',
            id: id !== undefined ? id : null,
            error: {
                code,
                message
            }
        };

        if (data !== undefined) {
            envelope.error.data = data;
        }

        try {
            const messageStr = JSON.stringify(envelope);
            this.process.stdin.write(messageStr + '\n');
        } catch (error) {
            this.emit('error', {
                extensionId: this.extensionId,
                error: `Failed to send error response: ${error.message}`,
                id,
                errorCode: code
            });
        }
    }

    _startHeartbeatMonitoring() {
        this._clearPendingPing();
        
        this.heartbeatInterval = setInterval(() => {
            this._performHeartbeatCheck();
        }, this.heartbeatPingInterval);
    }

    _performHeartbeatCheck() {
        const now = Date.now();
        
        if (this.pendingPing) {
            const pendingDuration = now - this.lastPingTime;
            
            if (pendingDuration > this.heartbeatPongTimeout) {
                this.heartbeatMetrics.totalTimeouts++;
                this.heartbeatMetrics.totalFailures++;
                this.consecutiveHeartbeatFailures++;
                
                const totalAttempts = this.heartbeatMetrics.totalPings;
                const totalSuccesses = this.heartbeatMetrics.totalPongs;
                this.heartbeatMetrics.successRate = totalAttempts > 0 
                    ? Math.round((totalSuccesses / totalAttempts) * 100) / 100 
                    : null;
                
                this.emit('heartbeat-timeout', {
                    extensionId: this.extensionId,
                    timestamp: now,
                    consecutiveFailures: this.consecutiveHeartbeatFailures,
                    timeout: this.heartbeatPongTimeout
                });
                
                this._clearPendingPing();
                
                if (this.consecutiveHeartbeatFailures >= this.consecutiveFailureLimit) {
                    this.emit('heartbeat-failure-limit', {
                        extensionId: this.extensionId,
                        timestamp: now,
                        consecutiveFailures: this.consecutiveHeartbeatFailures,
                        limit: this.consecutiveFailureLimit
                    });
                    
                    this._handleHeartbeatFailure();
                    return;
                }
            }
        }
        
        this._sendPing();
    }

    _sendPing() {
        if (this.state !== 'RUNNING' && this.state !== 'DEGRADED') {
            return;
        }
        
        this._clearPendingPing();
        
        this.lastPingTime = Date.now();
        this.heartbeatMetrics.totalPings++;
        
        const pingTimeout = setTimeout(() => {
            if (this.pendingPing === pingTimeout) {
                this.pendingPing = null;
            }
        }, this.heartbeatPongTimeout);
        
        this.pendingPing = pingTimeout;
        
        this._sendRequest('pong', { timestamp: this.lastPingTime }, this.heartbeatPongTimeout)
            .then(() => {
                this._clearPendingPing();
            })
            .catch((error) => {
                this.heartbeatMetrics.totalFailures++;
                this.consecutiveHeartbeatFailures++;
                
                const totalAttempts = this.heartbeatMetrics.totalPings;
                const totalSuccesses = this.heartbeatMetrics.totalPongs;
                this.heartbeatMetrics.successRate = totalAttempts > 0 
                    ? Math.round((totalSuccesses / totalAttempts) * 100) / 100 
                    : null;
                
                this.emit('heartbeat-failure', {
                    extensionId: this.extensionId,
                    timestamp: Date.now(),
                    consecutiveFailures: this.consecutiveHeartbeatFailures,
                    error: error.message
                });
                
                this._clearPendingPing();
                
                if (this.consecutiveHeartbeatFailures >= this.consecutiveFailureLimit) {
                    this.emit('heartbeat-failure-limit', {
                        extensionId: this.extensionId,
                        timestamp: Date.now(),
                        consecutiveFailures: this.consecutiveHeartbeatFailures,
                        limit: this.consecutiveFailureLimit
                    });
                    
                    this._handleHeartbeatFailure();
                }
            });
    }

    _clearPendingPing() {
        if (this.pendingPing) {
            clearTimeout(this.pendingPing);
            this.pendingPing = null;
        }
    }

    async _handleHeartbeatFailure() {
        this.emit('error', {
            extensionId: this.extensionId,
            error: `Extension failed ${this.consecutiveHeartbeatFailures} consecutive heartbeat checks`
        });

        try {
            await this.restart('heartbeat_failure');
        } catch (error) {
            this.emit('error', {
                extensionId: this.extensionId,
                error: `Failed to restart after heartbeat failures: ${error.message}`
            });
        }
    }

    _stopHeartbeatMonitoring() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
        this._clearPendingPing();
    }

    async _handleUnresponsiveExtension() {
        this.emit('error', {
            extensionId: this.extensionId,
            error: 'Extension is unresponsive'
        });

        try {
            await this.restart('unresponsive');
        } catch (error) {
            this.emit('error', {
                extensionId: this.extensionId,
                error: `Failed to restart unresponsive extension: ${error.message}`
            });
        }
    }

    async _handleUnexpectedExit(code, signal) {
        const crashTimestamp = Date.now();
        const uptime = this.lastHeartbeat ? crashTimestamp - this.lastHeartbeat : 0;
        const pid = this.process ? this.process.pid : null;
        
        const isCrash = code !== 0 || signal !== null;
        
        const crashDetails = {
            extensionId: this.extensionId,
            timestamp: crashTimestamp,
            timestampISO: new Date(crashTimestamp).toISOString(),
            pid,
            exitCode: code,
            signal,
            uptime,
            uptimeFormatted: this._formatUptime(uptime),
            crashType: this._determineCrashType(code, signal),
            pendingRequestCount: this.pendingRequests.size,
            restartCount: this.restartCount,
            consecutiveRestarts: this.consecutiveRestarts,
            state: this.state
        };
        
        this._logCrashTelemetry(crashDetails);
        
        const pendingRequestsSnapshot = Array.from(this.pendingRequests.entries());
        this._rejectAllPendingRequests(code, signal, crashDetails);
        
        this.emit('crashed', crashDetails);
        
        if (isCrash) {
            const backoffDelay = this._calculateBackoffDelay();
            
            this.emit('crash-restart-scheduled', {
                extensionId: this.extensionId,
                timestamp: Date.now(),
                crashDetails,
                backoffDelay,
                restartAttempt: this.restartCount + 1,
                consecutiveRestarts: this.consecutiveRestarts + 1
            });
            
            try {
                await this.restart('unexpected_exit');
                
                this.emit('crash-recovery-success', {
                    extensionId: this.extensionId,
                    timestamp: Date.now(),
                    originalCrash: crashDetails,
                    recoveryDuration: Date.now() - crashTimestamp,
                    restartCount: this.restartCount
                });
            } catch (error) {
                const restartFailureDetails = {
                    extensionId: this.extensionId,
                    timestamp: Date.now(),
                    timestampISO: new Date().toISOString(),
                    error: error.message,
                    errorStack: error.stack,
                    originalCrash: crashDetails,
                    restartAttempt: this.restartCount,
                    backoffDelay
                };
                
                this._logCrashTelemetry({
                    ...restartFailureDetails,
                    crashType: 'restart_failure'
                });
                
                this.emit('error', {
                    extensionId: this.extensionId,
                    error: `Failed to restart after crash: ${error.message}`,
                    details: restartFailureDetails
                });
            }
        }
    }
    
    _determineCrashType(code, signal) {
        if (signal) {
            const signalTypes = {
                'SIGTERM': 'terminated',
                'SIGKILL': 'force_killed',
                'SIGINT': 'interrupted',
                'SIGSEGV': 'segmentation_fault',
                'SIGABRT': 'aborted',
                'SIGBUS': 'bus_error',
                'SIGFPE': 'floating_point_exception',
                'SIGILL': 'illegal_instruction'
            };
            return signalTypes[signal] || `signal_${signal}`;
        }
        
        if (code !== null && code !== undefined) {
            if (code === 0) {
                return 'clean_exit';
            } else if (code === 1) {
                return 'general_error';
            } else if (code === 2) {
                return 'misuse_of_shell';
            } else if (code > 128) {
                return `signal_exit_${code - 128}`;
            } else {
                return `exit_code_${code}`;
            }
        }
        
        return 'unknown';
    }
    
    _formatUptime(uptimeMs) {
        if (uptimeMs === 0) {
            return '0s';
        }
        
        const seconds = Math.floor(uptimeMs / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);
        
        if (days > 0) {
            return `${days}d ${hours % 24}h ${minutes % 60}m ${seconds % 60}s`;
        } else if (hours > 0) {
            return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
        } else if (minutes > 0) {
            return `${minutes}m ${seconds % 60}s`;
        } else {
            return `${seconds}s`;
        }
    }
    
    _rejectAllPendingRequests(exitCode, signal, crashDetails) {
        if (this.pendingRequests.size === 0) {
            return;
        }
        
        const rejectedRequests = [];
        
        for (const [requestId, request] of this.pendingRequests) {
            clearTimeout(request.timeoutId);
            
            const errorMessage = signal 
                ? `Extension process terminated by signal ${signal} (PID: ${crashDetails.pid})`
                : `Extension process exited with code ${exitCode} (PID: ${crashDetails.pid})`;
            
            const error = new Error(errorMessage);
            error.code = -32603;
            error.data = {
                reason: 'Extension process crashed',
                extensionId: this.extensionId,
                exitCode,
                signal,
                pid: crashDetails.pid,
                uptime: crashDetails.uptime,
                crashType: crashDetails.crashType,
                timestamp: crashDetails.timestamp,
                requestId,
                requestMethod: request.method,
                requestAge: Date.now() - request.timestamp
            };
            
            request.reject(error);
            
            rejectedRequests.push({
                requestId,
                method: request.method,
                requestAge: error.data.requestAge
            });
        }
        
        this.pendingRequests.clear();
        
        this.emit('pending-requests-rejected', {
            extensionId: this.extensionId,
            timestamp: Date.now(),
            rejectedCount: rejectedRequests.length,
            requests: rejectedRequests,
            crashDetails
        });
    }
    
    _logCrashTelemetry(crashDetails) {
        const telemetryEntry = {
            eventType: 'extension_crash',
            timestamp: crashDetails.timestamp,
            timestampISO: crashDetails.timestampISO,
            extensionId: crashDetails.extensionId,
            crash: {
                pid: crashDetails.pid,
                exitCode: crashDetails.exitCode,
                signal: crashDetails.signal,
                uptime: crashDetails.uptime,
                uptimeFormatted: crashDetails.uptimeFormatted,
                crashType: crashDetails.crashType
            },
            state: {
                previousState: crashDetails.state,
                pendingRequestCount: crashDetails.pendingRequestCount,
                restartCount: crashDetails.restartCount,
                consecutiveRestarts: crashDetails.consecutiveRestarts
            },
            metrics: {
                heartbeat: {
                    consecutiveFailures: this.consecutiveHeartbeatFailures,
                    totalPings: this.heartbeatMetrics.totalPings,
                    totalPongs: this.heartbeatMetrics.totalPongs,
                    totalFailures: this.heartbeatMetrics.totalFailures,
                    successRate: this.heartbeatMetrics.successRate
                },
                healthState: this.healthState
            }
        };
        
        this.emit('crash-telemetry', telemetryEntry);
        
        if (this.options.enableCrashLogging !== false) {
            console.error(`[Ghost Crash Telemetry] ${JSON.stringify(telemetryEntry, null, 2)}`);
        }
    }
}

class ExtensionRuntime extends EventEmitter {
    constructor(options = {}) {
        super();
        this.options = options;
        this.extensions = new Map();
        this.healthCheckInterval = null;
        this.healthCheckFrequency = options.healthCheckFrequency || 60000;
    }

    async startExtension(extensionId, extensionPath, manifest, processOptions = {}) {
        if (this.extensions.has(extensionId)) {
            throw new Error(`Extension ${extensionId} is already registered`);
        }

        const extensionProcess = new ExtensionProcess(
            extensionId,
            extensionPath,
            manifest,
            { ...this.options, ...processOptions }
        );

        extensionProcess.on('state-change', (info) => {
            this.emit('extension-state-change', {
                extensionId,
                ...info
            });
        });

        extensionProcess.on('error', (info) => {
            this.emit('extension-error', {
                extensionId,
                ...info
            });
        });

        extensionProcess.on('exit', (info) => {
            this.emit('extension-exit', info);
        });

        extensionProcess.on('crashed', (info) => {
            this.emit('extension-crashed', info);
        });

        extensionProcess.on('unresponsive', (info) => {
            this.emit('extension-unresponsive', info);
        });

        extensionProcess.on('restarted', (info) => {
            this.emit('extension-restarted', {
                extensionId,
                ...info
            });
        });

        extensionProcess.on('restart-initiated', (info) => {
            this.emit('extension-restart-initiated', info);
        });

        extensionProcess.on('shutdown-complete', (info) => {
            this.emit('extension-shutdown-complete', info);
        });

        extensionProcess.on('stderr', (info) => {
            this.emit('extension-stderr', info);
        });

        extensionProcess.on('notification', (info) => {
            this.emit('extension-notification', info);
        });
        
        extensionProcess.on('crash-telemetry', (info) => {
            this.emit('extension-crash-telemetry', info);
        });
        
        extensionProcess.on('pending-requests-rejected', (info) => {
            this.emit('extension-pending-requests-rejected', info);
        });
        
        extensionProcess.on('disconnected', (info) => {
            this.emit('extension-disconnected', info);
        });
        
        extensionProcess.on('crash-restart-scheduled', (info) => {
            this.emit('extension-crash-restart-scheduled', info);
        });
        
        extensionProcess.on('crash-recovery-success', (info) => {
            this.emit('extension-crash-recovery-success', info);
        });

        this.extensions.set(extensionId, extensionProcess);

        try {
            await extensionProcess.start();
            this._ensureHealthMonitoring();
            return extensionProcess;
        } catch (error) {
            this.extensions.delete(extensionId);
            throw error;
        }
    }

    async stopExtension(extensionId) {
        const extensionProcess = this.extensions.get(extensionId);
        
        if (!extensionProcess) {
            throw new Error(`Extension ${extensionId} is not registered`);
        }

        await extensionProcess.stop();
        this.extensions.delete(extensionId);

        if (this.extensions.size === 0) {
            this._stopHealthMonitoring();
        }
    }

    async restartExtension(extensionId) {
        const extensionProcess = this.extensions.get(extensionId);
        
        if (!extensionProcess) {
            throw new Error(`Extension ${extensionId} is not registered`);
        }

        await extensionProcess.restart('user_requested');
    }

    async callExtension(extensionId, method, params = {}) {
        const extensionProcess = this.extensions.get(extensionId);
        
        if (!extensionProcess) {
            throw new Error(`Extension ${extensionId} is not registered`);
        }

        return await extensionProcess.call(method, params);
    }

    getExtensionState(extensionId) {
        const extensionProcess = this.extensions.get(extensionId);
        
        if (!extensionProcess) {
            return null;
        }

        return extensionProcess.getState();
    }

    getAllExtensionStates() {
        const states = {};
        
        for (const [extensionId, extensionProcess] of this.extensions) {
            states[extensionId] = extensionProcess.getState();
        }

        return states;
    }

    getHealthStatus() {
        const status = {
            totalExtensions: this.extensions.size,
            running: 0,
            stopped: 0,
            failed: 0,
            starting: 0,
            stopping: 0,
            extensions: {}
        };

        for (const [extensionId, extensionProcess] of this.extensions) {
            const state = extensionProcess.getState();
            status.extensions[extensionId] = state;

            switch (state.state) {
                case 'RUNNING':
                    status.running++;
                    break;
                case 'STOPPED':
                    status.stopped++;
                    break;
                case 'FAILED':
                    status.failed++;
                    break;
                case 'STARTING':
                    status.starting++;
                    break;
                case 'STOPPING':
                    status.stopping++;
                    break;
            }
        }

        return status;
    }

    async shutdown() {
        this._stopHealthMonitoring();

        const stopPromises = [];
        
        for (const [extensionId, extensionProcess] of this.extensions) {
            stopPromises.push(
                extensionProcess.stop().catch((error) => {
                    this.emit('extension-error', {
                        extensionId,
                        error: `Failed to stop extension during shutdown: ${error.message}`
                    });
                })
            );
        }

        await Promise.all(stopPromises);
        this.extensions.clear();
    }

    _ensureHealthMonitoring() {
        if (!this.healthCheckInterval && this.extensions.size > 0) {
            this.healthCheckInterval = setInterval(() => {
                this._performHealthCheck();
            }, this.healthCheckFrequency);
        }
    }

    _stopHealthMonitoring() {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
            this.healthCheckInterval = null;
        }
    }

    _performHealthCheck() {
        const now = Date.now();
        
        for (const [extensionId, extensionProcess] of this.extensions) {
            const state = extensionProcess.getState();
            
            if (state.state === 'RUNNING') {
                const timeSinceHeartbeat = now - state.lastHeartbeat;
                
                if (timeSinceHeartbeat > extensionProcess.heartbeatTimeout * 2) {
                    this.emit('health-check-failed', {
                        extensionId,
                        reason: 'No heartbeat',
                        timeSinceHeartbeat
                    });
                }
            } else if (state.state === 'FAILED') {
                this.emit('health-check-failed', {
                    extensionId,
                    reason: 'Extension in FAILED state'
                });
            }
        }
    }
}

module.exports = {
    ExtensionRuntime,
    ExtensionProcess
};
