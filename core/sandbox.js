const vm = require('vm');
const { EventEmitter } = require('events');

class SandboxError extends Error {
    constructor(message, code, details = {}) {
        super(message);
        this.name = 'SandboxError';
        this.code = code;
        this.details = details;
    }
}

class ResourceMonitor {
    constructor(quotas) {
        this.quotas = quotas;
        this.metrics = {
            operationCount: 0,
            startTime: Date.now(),
            lastOperationTime: Date.now(),
            memoryPeakUsage: 0,
            cpuTime: 0
        };
    }

    checkOperationTimeout(startTime, timeout) {
        if (timeout && (Date.now() - startTime) > timeout) {
            throw new SandboxError(
                `Operation exceeded timeout of ${timeout}ms`,
                'SANDBOX_TIMEOUT'
            );
        }
    }

    checkOperationLimit() {
        this.metrics.operationCount++;
        if (this.quotas.maxOperations && this.metrics.operationCount > this.quotas.maxOperations) {
            throw new SandboxError(
                `Exceeded maximum operations limit: ${this.quotas.maxOperations}`,
                'SANDBOX_QUOTA_EXCEEDED',
                { quota: 'maxOperations', current: this.metrics.operationCount }
            );
        }
    }

    updateMetrics() {
        this.metrics.lastOperationTime = Date.now();
        const memUsage = process.memoryUsage();
        this.metrics.memoryPeakUsage = Math.max(
            this.metrics.memoryPeakUsage,
            memUsage.heapUsed
        );
    }

    getMetrics() {
        return {
            ...this.metrics,
            uptime: Date.now() - this.metrics.startTime
        };
    }
}

class SandboxEscapeDetector extends EventEmitter {
    constructor(extensionId) {
        super();
        this.extensionId = extensionId;
        this.violations = [];
    }

    checkPrototypePollution(context) {
        const dangerous = [
            '__proto__',
            'constructor',
            'prototype'
        ];

        const violations = [];
        
        try {
            for (const prop of dangerous) {
                if (context.global && context.global[prop] !== Object.prototype[prop]) {
                    violations.push({
                        type: 'PROTOTYPE_POLLUTION',
                        property: prop,
                        timestamp: Date.now()
                    });
                }
            }
        } catch (error) {
            violations.push({
                type: 'DETECTION_ERROR',
                error: error.message,
                timestamp: Date.now()
            });
        }

        if (violations.length > 0) {
            this.violations.push(...violations);
            this.emit('violation', {
                extensionId: this.extensionId,
                violations
            });
            return false;
        }

        return true;
    }

    checkContextBreakout(context) {
        const violations = [];

        try {
            const globalKeys = Object.keys(context);
            const suspiciousKeys = ['require', 'process', 'module', 'exports', '__filename', '__dirname'];
            
            for (const key of suspiciousKeys) {
                if (context[key] !== undefined && !context._allowedGlobals.includes(key)) {
                    violations.push({
                        type: 'CONTEXT_BREAKOUT',
                        property: key,
                        timestamp: Date.now()
                    });
                }
            }

            if (context.global && context.global.process && !context._allowedGlobals.includes('process')) {
                violations.push({
                    type: 'PROCESS_ACCESS',
                    timestamp: Date.now()
                });
            }
        } catch (error) {
            violations.push({
                type: 'DETECTION_ERROR',
                error: error.message,
                timestamp: Date.now()
            });
        }

        if (violations.length > 0) {
            this.violations.push(...violations);
            this.emit('violation', {
                extensionId: this.extensionId,
                violations
            });
            return false;
        }

        return true;
    }

    getViolations() {
        return this.violations;
    }

    hasViolations() {
        return this.violations.length > 0;
    }
}

class PluginSandbox extends EventEmitter {
    constructor(extensionId, manifest, options = {}) {
        super();
        this.extensionId = extensionId;
        this.manifest = manifest;
        this.options = {
            timeout: options.timeout || 30000,
            maxOperations: options.maxOperations || 10000,
            memoryLimit: options.memoryLimit || 128 * 1024 * 1024,
            enableMonitoring: options.enableMonitoring !== false,
            enableEscapeDetection: options.enableEscapeDetection !== false,
            ...options
        };

        this.context = null;
        this.state = 'UNINITIALIZED';
        this.resourceMonitor = new ResourceMonitor({
            maxOperations: this.options.maxOperations,
            timeout: this.options.timeout,
            memoryLimit: this.options.memoryLimit
        });
        this.escapeDetector = new SandboxEscapeDetector(extensionId);
        
        this.escapeDetector.on('violation', (info) => {
            this.emit('security-violation', info);
        });
    }

    initialize(api = {}) {
        if (this.state !== 'UNINITIALIZED' && this.state !== 'TERMINATED') {
            throw new SandboxError(
                `Cannot initialize sandbox in state: ${this.state}`,
                'SANDBOX_INVALID_STATE'
            );
        }

        const sandboxGlobals = this._createSandboxGlobals(api);
        
        this.context = vm.createContext(sandboxGlobals);
        
        this.context._allowedGlobals = Object.keys(sandboxGlobals);
        
        this.state = 'INITIALIZED';
        
        this.emit('initialized', {
            extensionId: this.extensionId,
            timestamp: Date.now()
        });

        return this.context;
    }

    _createSandboxGlobals(api) {
        const permissions = this.manifest.capabilities || {};
        
        const sandboxModule = {
            exports: {}
        };
        
        const globals = {
            console: this._createRestrictedConsole(),
            setTimeout: this._createTimeoutWrapper(),
            setInterval: this._createIntervalWrapper(),
            clearTimeout: clearTimeout,
            clearInterval: clearInterval,
            Promise: Promise,
            Date: Date,
            Math: Math,
            JSON: JSON,
            Object: Object,
            Array: Array,
            String: String,
            Number: Number,
            Boolean: Boolean,
            RegExp: RegExp,
            Error: Error,
            TypeError: TypeError,
            RangeError: RangeError,
            SyntaxError: SyntaxError,
            Buffer: Buffer,
            module: sandboxModule,
            exports: sandboxModule.exports,
            global: undefined,
            require: undefined,
            process: undefined,
            __filename: undefined,
            __dirname: undefined
        };

        if (permissions.filesystem) {
            globals.fs = this._createFilesystemAPI(api.filesystem, permissions.filesystem);
        }

        if (permissions.network) {
            globals.http = this._createNetworkAPI(api.network, permissions.network);
        }

        if (permissions.git) {
            globals.git = this._createGitAPI(api.git, permissions.git);
        }

        globals.extensionAPI = {
            id: this.extensionId,
            name: this.manifest.name,
            version: this.manifest.version,
            config: this.manifest.config || {}
        };

        return globals;
    }

    _createRestrictedConsole() {
        const extensionId = this.extensionId;
        return {
            log: (...args) => {
                this.emit('log', { extensionId, level: 'log', args });
            },
            error: (...args) => {
                this.emit('log', { extensionId, level: 'error', args });
            },
            warn: (...args) => {
                this.emit('log', { extensionId, level: 'warn', args });
            },
            info: (...args) => {
                this.emit('log', { extensionId, level: 'info', args });
            },
            debug: (...args) => {
                this.emit('log', { extensionId, level: 'debug', args });
            }
        };
    }

    _createTimeoutWrapper() {
        return (callback, delay, ...args) => {
            if (delay > this.options.timeout) {
                throw new SandboxError(
                    `setTimeout delay ${delay}ms exceeds maximum allowed timeout ${this.options.timeout}ms`,
                    'SANDBOX_TIMEOUT_EXCEEDED'
                );
            }
            return setTimeout(callback, delay, ...args);
        };
    }

    _createIntervalWrapper() {
        return (callback, delay, ...args) => {
            if (delay > this.options.timeout) {
                throw new SandboxError(
                    `setInterval delay ${delay}ms exceeds maximum allowed timeout ${this.options.timeout}ms`,
                    'SANDBOX_TIMEOUT_EXCEEDED'
                );
            }
            return setInterval(callback, delay, ...args);
        };
    }

    _createFilesystemAPI(hostAPI, permissions) {
        if (!hostAPI) return undefined;

        const api = {};

        if (permissions.read) {
            api.readFile = async (path, options) => {
                this.resourceMonitor.checkOperationLimit();
                return await hostAPI.readFile(path, options);
            };

            api.readdir = async (path, options) => {
                this.resourceMonitor.checkOperationLimit();
                return await hostAPI.readdir(path, options);
            };

            api.stat = async (path) => {
                this.resourceMonitor.checkOperationLimit();
                return await hostAPI.stat(path);
            };
        }

        if (permissions.write) {
            api.writeFile = async (path, content, options) => {
                this.resourceMonitor.checkOperationLimit();
                return await hostAPI.writeFile(path, content, options);
            };

            api.mkdir = async (path, options) => {
                this.resourceMonitor.checkOperationLimit();
                return await hostAPI.mkdir(path, options);
            };

            api.unlink = async (path) => {
                this.resourceMonitor.checkOperationLimit();
                return await hostAPI.unlink(path);
            };

            api.rmdir = async (path, options) => {
                this.resourceMonitor.checkOperationLimit();
                return await hostAPI.rmdir(path, options);
            };
        }

        return api;
    }

    _createNetworkAPI(hostAPI, permissions) {
        if (!hostAPI || !permissions.allowlist || permissions.allowlist.length === 0) {
            return undefined;
        }

        return {
            request: async (url, options) => {
                this.resourceMonitor.checkOperationLimit();
                return await hostAPI.request(url, options);
            },
            get: async (url, options) => {
                this.resourceMonitor.checkOperationLimit();
                return await hostAPI.get(url, options);
            },
            post: async (url, data, options) => {
                this.resourceMonitor.checkOperationLimit();
                return await hostAPI.post(url, data, options);
            }
        };
    }

    _createGitAPI(hostAPI, permissions) {
        if (!hostAPI) return undefined;

        const api = {};

        if (permissions.read) {
            api.status = async (options) => {
                this.resourceMonitor.checkOperationLimit();
                return await hostAPI.status(options);
            };

            api.log = async (options) => {
                this.resourceMonitor.checkOperationLimit();
                return await hostAPI.log(options);
            };

            api.diff = async (options) => {
                this.resourceMonitor.checkOperationLimit();
                return await hostAPI.diff(options);
            };

            api.show = async (ref, options) => {
                this.resourceMonitor.checkOperationLimit();
                return await hostAPI.show(ref, options);
            };
        }

        if (permissions.write) {
            api.commit = async (message, options) => {
                this.resourceMonitor.checkOperationLimit();
                return await hostAPI.commit(message, options);
            };

            api.add = async (paths, options) => {
                this.resourceMonitor.checkOperationLimit();
                return await hostAPI.add(paths, options);
            };

            api.push = async (remote, branch, options) => {
                this.resourceMonitor.checkOperationLimit();
                return await hostAPI.push(remote, branch, options);
            };

            api.checkout = async (ref, options) => {
                this.resourceMonitor.checkOperationLimit();
                return await hostAPI.checkout(ref, options);
            };
        }

        return api;
    }

    async executeCode(code, timeout = null) {
        if (this.state !== 'INITIALIZED') {
            throw new SandboxError(
                `Cannot execute code in state: ${this.state}`,
                'SANDBOX_INVALID_STATE'
            );
        }

        const operationTimeout = timeout || this.options.timeout;
        const startTime = Date.now();

        try {
            this.state = 'EXECUTING';

            if (this.options.enableEscapeDetection) {
                this.escapeDetector.checkPrototypePollution(this.context);
                this.escapeDetector.checkContextBreakout(this.context);
            }

            const script = new vm.Script(code, {
                filename: `sandbox-${this.extensionId}.js`,
                timeout: operationTimeout,
                displayErrors: true
            });

            const resultPromise = Promise.resolve(script.runInContext(this.context, {
                timeout: operationTimeout,
                breakOnSigint: true
            }));

            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => {
                    reject(new SandboxError(
                        `Code execution timed out after ${operationTimeout}ms`,
                        'SANDBOX_TIMEOUT'
                    ));
                }, operationTimeout);
            });

            const result = await Promise.race([resultPromise, timeoutPromise]);

            this.resourceMonitor.updateMetrics();

            if (this.options.enableEscapeDetection) {
                this.escapeDetector.checkPrototypePollution(this.context);
                this.escapeDetector.checkContextBreakout(this.context);
            }

            this.state = 'INITIALIZED';

            return result;

        } catch (error) {
            this.state = 'ERROR';
            
            if (error instanceof SandboxError) {
                throw error;
            }

            throw new SandboxError(
                `Code execution failed: ${error.message}`,
                'SANDBOX_EXECUTION_ERROR',
                { originalError: error.message, stack: error.stack }
            );
        } finally {
            const executionTime = Date.now() - startTime;
            this.emit('execution-complete', {
                extensionId: this.extensionId,
                executionTime,
                timestamp: Date.now()
            });
        }
    }

    async call(functionName, args = [], timeout = null) {
        if (this.state !== 'INITIALIZED') {
            throw new SandboxError(
                `Cannot call function in state: ${this.state}`,
                'SANDBOX_INVALID_STATE'
            );
        }

        const operationTimeout = timeout || this.options.timeout;
        const startTime = Date.now();

        try {
            this.state = 'EXECUTING';

            if (this.options.enableEscapeDetection) {
                this.escapeDetector.checkPrototypePollution(this.context);
                this.escapeDetector.checkContextBreakout(this.context);
            }

            if (typeof this.context[functionName] !== 'function') {
                throw new SandboxError(
                    `Function ${functionName} not found in sandbox context`,
                    'SANDBOX_FUNCTION_NOT_FOUND'
                );
            }

            const callCode = `(async () => { return await ${functionName}(...args); })()`;
            
            const script = new vm.Script(callCode, {
                filename: `sandbox-${this.extensionId}-call.js`,
                timeout: operationTimeout,
                displayErrors: true
            });

            this.context.args = args;

            const resultPromise = Promise.resolve(script.runInContext(this.context, {
                timeout: operationTimeout,
                breakOnSigint: true
            }));

            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => {
                    reject(new SandboxError(
                        `Function call timed out after ${operationTimeout}ms`,
                        'SANDBOX_TIMEOUT'
                    ));
                }, operationTimeout);
            });

            const result = await Promise.race([resultPromise, timeoutPromise]);

            delete this.context.args;

            this.resourceMonitor.updateMetrics();

            if (this.options.enableEscapeDetection) {
                this.escapeDetector.checkPrototypePollution(this.context);
                this.escapeDetector.checkContextBreakout(this.context);
            }

            this.state = 'INITIALIZED';

            return result;

        } catch (error) {
            this.state = 'ERROR';
            
            if (error instanceof SandboxError) {
                throw error;
            }

            throw new SandboxError(
                `Function call failed: ${error.message}`,
                'SANDBOX_EXECUTION_ERROR',
                { originalError: error.message, stack: error.stack }
            );
        } finally {
            const executionTime = Date.now() - startTime;
            this.emit('execution-complete', {
                extensionId: this.extensionId,
                functionName,
                executionTime,
                timestamp: Date.now()
            });
        }
    }

    getMetrics() {
        return {
            extensionId: this.extensionId,
            state: this.state,
            resourceMetrics: this.resourceMonitor.getMetrics(),
            securityViolations: this.escapeDetector.getViolations(),
            hasViolations: this.escapeDetector.hasViolations()
        };
    }

    getState() {
        return {
            extensionId: this.extensionId,
            state: this.state,
            initialized: this.state !== 'UNINITIALIZED',
            executing: this.state === 'EXECUTING',
            hasErrors: this.state === 'ERROR',
            hasViolations: this.escapeDetector.hasViolations()
        };
    }

    terminate() {
        if (this.state === 'TERMINATED') {
            return;
        }

        this.state = 'TERMINATED';
        this.context = null;

        this.emit('terminated', {
            extensionId: this.extensionId,
            timestamp: Date.now(),
            metrics: this.resourceMonitor.getMetrics()
        });
    }

    reset() {
        if (this.state === 'EXECUTING') {
            throw new SandboxError(
                'Cannot reset sandbox while executing',
                'SANDBOX_INVALID_STATE'
            );
        }

        this.terminate();
        this.state = 'UNINITIALIZED';
        this.resourceMonitor = new ResourceMonitor({
            maxOperations: this.options.maxOperations,
            timeout: this.options.timeout,
            memoryLimit: this.options.memoryLimit
        });
        this.escapeDetector = new SandboxEscapeDetector(this.extensionId);

        this.emit('reset', {
            extensionId: this.extensionId,
            timestamp: Date.now()
        });
    }
}

module.exports = {
    PluginSandbox,
    SandboxError,
    ResourceMonitor,
    SandboxEscapeDetector
};
