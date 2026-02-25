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
    }

    async start() {
        if (this.state === 'RUNNING') {
            throw new Error(`Extension ${this.extensionId} is already running`);
        }

        this.state = 'STARTING';
        this.emit('state-change', { state: 'STARTING' });

        try {
            await this._spawnProcess();
            this.state = 'RUNNING';
            this.lastHeartbeat = Date.now();
            this._startHeartbeatMonitoring();
            this.emit('state-change', { state: 'RUNNING' });
        } catch (error) {
            this.state = 'FAILED';
            this.emit('state-change', { state: 'FAILED', error: error.message });
            throw error;
        }
    }

    async stop() {
        if (this.state === 'STOPPED') {
            return;
        }

        this.state = 'STOPPING';
        this.emit('state-change', { state: 'STOPPING' });

        this._stopHeartbeatMonitoring();
        
        for (const [requestId, request] of this.pendingRequests) {
            clearTimeout(request.timeoutId);
            request.reject(new Error('Extension process stopped'));
        }
        this.pendingRequests.clear();

        if (this.process) {
            try {
                await this._sendRequest('shutdown', {}, 5000);
            } catch (error) {
            }

            return new Promise((resolve) => {
                const killTimeout = setTimeout(() => {
                    if (this.process && !this.process.killed) {
                        this.process.kill('SIGKILL');
                    }
                    resolve();
                }, 5000);

                if (this.process) {
                    this.process.once('exit', () => {
                        clearTimeout(killTimeout);
                        resolve();
                    });
                    this.process.kill('SIGTERM');
                } else {
                    clearTimeout(killTimeout);
                    resolve();
                }
            }).then(() => {
                this.process = null;
                this.state = 'STOPPED';
                this.emit('state-change', { state: 'STOPPED' });
            });
        }

        this.state = 'STOPPED';
        this.emit('state-change', { state: 'STOPPED' });
    }

    async restart() {
        const now = Date.now();
        this.restartHistory = this.restartHistory.filter(
            timestamp => now - timestamp < this.restartWindow
        );
        
        if (this.restartHistory.length >= this.maxRestarts) {
            const error = new Error(
                `Extension ${this.extensionId} exceeded restart limit (${this.maxRestarts} restarts in ${this.restartWindow}ms)`
            );
            this.state = 'FAILED';
            this.emit('state-change', { state: 'FAILED', error: error.message });
            throw error;
        }

        this.restartHistory.push(now);
        this.restartCount++;

        await this.stop();
        await this.start();
        
        this.emit('restarted', { count: this.restartCount });
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
            pid: this.process ? this.process.pid : null,
            restartCount: this.restartCount,
            lastHeartbeat: this.lastHeartbeat,
            pendingRequests: this.pendingRequests.size,
            uptime: this.state === 'RUNNING' && this.lastHeartbeat 
                ? Date.now() - this.lastHeartbeat 
                : 0
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
                    
                    if (this.state === 'RUNNING') {
                        this._handleUnexpectedExit(code, signal);
                    }
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
        try {
            const message = JSON.parse(line);
            
            if (message.id && this.pendingRequests.has(message.id)) {
                const request = this.pendingRequests.get(message.id);
                clearTimeout(request.timeoutId);
                this.pendingRequests.delete(message.id);

                if (message.error) {
                    request.reject(new Error(message.error.message || 'Unknown error'));
                } else {
                    request.resolve(message.result);
                }
            } else if (message.method === 'heartbeat') {
                this.lastHeartbeat = Date.now();
                this._sendResponse(message.id, { alive: true });
            } else if (message.method) {
                this.emit('notification', {
                    extensionId: this.extensionId,
                    method: message.method,
                    params: message.params
                });
            }
        } catch (error) {
            this.emit('error', {
                extensionId: this.extensionId,
                error: `Failed to parse message: ${error.message}`,
                line
            });
        }
    }

    _sendRequest(method, params = {}, timeout = null) {
        return new Promise((resolve, reject) => {
            if (!this.process || this.process.killed) {
                reject(new Error(`Extension ${this.extensionId} process is not running`));
                return;
            }

            const requestId = this.nextRequestId++;
            const requestTimeout = timeout || this.responseTimeout;

            const timeoutId = setTimeout(() => {
                this.pendingRequests.delete(requestId);
                reject(new Error(`Request timeout for method ${method} after ${requestTimeout}ms`));
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
                this.process.stdin.write(JSON.stringify(envelope) + '\n');
            } catch (error) {
                clearTimeout(timeoutId);
                this.pendingRequests.delete(requestId);
                reject(error);
            }
        });
    }

    _sendResponse(id, result) {
        if (!this.process || this.process.killed) {
            return;
        }

        const envelope = {
            jsonrpc: '2.0',
            id,
            result
        };

        try {
            this.process.stdin.write(JSON.stringify(envelope) + '\n');
        } catch (error) {
            this.emit('error', {
                extensionId: this.extensionId,
                error: `Failed to send response: ${error.message}`
            });
        }
    }

    _startHeartbeatMonitoring() {
        this.heartbeatInterval = setInterval(() => {
            const timeSinceLastHeartbeat = Date.now() - this.lastHeartbeat;
            
            if (timeSinceLastHeartbeat > this.heartbeatTimeout) {
                this.emit('unresponsive', {
                    extensionId: this.extensionId,
                    timeSinceLastHeartbeat
                });
                
                this._handleUnresponsiveExtension();
            } else {
                this._sendRequest('ping', {}, 5000).catch(() => {});
            }
        }, this.heartbeatTimeout / 2);
    }

    _stopHeartbeatMonitoring() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    }

    async _handleUnresponsiveExtension() {
        this.emit('error', {
            extensionId: this.extensionId,
            error: 'Extension is unresponsive'
        });

        try {
            await this.restart();
        } catch (error) {
            this.emit('error', {
                extensionId: this.extensionId,
                error: `Failed to restart unresponsive extension: ${error.message}`
            });
        }
    }

    async _handleUnexpectedExit(code, signal) {
        this.emit('crashed', {
            extensionId: this.extensionId,
            code,
            signal
        });

        try {
            await this.restart();
        } catch (error) {
            this.emit('error', {
                extensionId: this.extensionId,
                error: `Failed to restart after crash: ${error.message}`
            });
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

        extensionProcess.on('stderr', (info) => {
            this.emit('extension-stderr', info);
        });

        extensionProcess.on('notification', (info) => {
            this.emit('extension-notification', info);
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

        await extensionProcess.restart();
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
