const vm = require('vm');
const { EventEmitter } = require('events');
const fs = require('fs');
const path = require('path');
const os = require('os');

class SandboxError extends Error {
    constructor(message, code, details = {}) {
        super(message);
        this.name = 'SandboxError';
        this.code = code;
        this.details = details;
    }
}

class ResourceLimiter extends EventEmitter {
    constructor(extensionId, options = {}) {
        super();
        this.extensionId = extensionId;
        this.platform = os.platform();
        this.pid = null;
        this.limits = {
            cpu: options.cpu || 50,
            memory: this._parseMemoryLimit(options.memory || '512M'),
            pids: options.pids || 100,
            networkBandwidth: options.networkBandwidth || null
        };
        this.cgroupPath = null;
        this.jobHandle = null;
        this.isWindows = this.platform === 'win32';
        this.isLinux = this.platform === 'linux';
        this.violations = [];
        this.metricsHistory = {
            cpu: [],
            memory: [],
            io: [],
            network: []
        };
    }

    _parseMemoryLimit(memStr) {
        if (typeof memStr === 'number') return memStr;
        const match = memStr.match(/^(\d+)(K|M|G)?$/i);
        if (!match) return 512 * 1024 * 1024;
        const value = parseInt(match[1]);
        const unit = (match[2] || 'M').toUpperCase();
        const multipliers = { K: 1024, M: 1024 * 1024, G: 1024 * 1024 * 1024 };
        return value * multipliers[unit];
    }

    async apply(pid) {
        this.pid = pid;
        
        if (this.isLinux) {
            await this._applyLinuxCgroups();
        } else if (this.isWindows) {
            await this._applyWindowsJobObject();
        }
        
        this.emit('limits-applied', {
            extensionId: this.extensionId,
            pid,
            limits: this.limits
        });
    }

    async _applyLinuxCgroups() {
        try {
            const cgroupBase = '/sys/fs/cgroup';
            if (!fs.existsSync(cgroupBase)) {
                throw new Error('cgroup v2 not available on this system');
            }

            this.cgroupPath = path.join(cgroupBase, 'ghost', `ext-${this.extensionId}-${this.pid}`);
            
            if (!fs.existsSync(path.join(cgroupBase, 'ghost'))) {
                fs.mkdirSync(path.join(cgroupBase, 'ghost'), { recursive: true });
            }
            
            if (!fs.existsSync(this.cgroupPath)) {
                fs.mkdirSync(this.cgroupPath, { recursive: true });
            }

            fs.writeFileSync(
                path.join(this.cgroupPath, 'cgroup.procs'),
                String(this.pid)
            );

            const cpuMaxValue = `${this.limits.cpu * 1000} 100000`;
            fs.writeFileSync(
                path.join(this.cgroupPath, 'cpu.max'),
                cpuMaxValue
            );

            fs.writeFileSync(
                path.join(this.cgroupPath, 'memory.max'),
                String(this.limits.memory)
            );

            fs.writeFileSync(
                path.join(this.cgroupPath, 'pids.max'),
                String(this.limits.pids)
            );

            if (this.limits.networkBandwidth) {
                const ioMaxValue = `${this.limits.networkBandwidth}\n`;
                try {
                    fs.writeFileSync(
                        path.join(this.cgroupPath, 'io.max'),
                        ioMaxValue
                    );
                } catch (error) {
                }
            }

        } catch (error) {
            this.emit('limits-error', {
                extensionId: this.extensionId,
                error: error.message
            });
            throw error;
        }
    }

    async _applyWindowsJobObject() {
        if (!this.isWindows) return;
        
        try {
            const ffi = require('ffi-napi');
            const ref = require('ref-napi');
            
            const kernel32 = ffi.Library('kernel32', {
                'CreateJobObjectW': ['pointer', ['pointer', 'pointer']],
                'AssignProcessToJobObject': ['bool', ['pointer', 'pointer']],
                'SetInformationJobObject': ['bool', ['pointer', 'int', 'pointer', 'uint32']],
                'OpenProcess': ['pointer', ['uint32', 'bool', 'uint32']],
                'CloseHandle': ['bool', ['pointer']]
            });

            this.jobHandle = kernel32.CreateJobObjectW(null, null);
            if (this.jobHandle.isNull()) {
                throw new Error('Failed to create job object');
            }

            const processHandle = kernel32.OpenProcess(0x1F0FFF, false, this.pid);
            if (processHandle.isNull()) {
                throw new Error('Failed to open process');
            }

            const assigned = kernel32.AssignProcessToJobObject(this.jobHandle, processHandle);
            if (!assigned) {
                kernel32.CloseHandle(processHandle);
                throw new Error('Failed to assign process to job object');
            }

            const JOBOBJECT_EXTENDED_LIMIT_INFORMATION = 9;
            const limitInfo = Buffer.alloc(144);
            
            limitInfo.writeUInt32LE(0x00000100, 0);
            limitInfo.writeBigUInt64LE(BigInt(this.limits.memory), 32);
            limitInfo.writeUInt32LE(this.limits.cpu * 100, 48);

            kernel32.SetInformationJobObject(
                this.jobHandle,
                JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
                limitInfo,
                144
            );

            kernel32.CloseHandle(processHandle);

        } catch (error) {
            this.emit('limits-error', {
                extensionId: this.extensionId,
                error: `Windows Job Object setup failed: ${error.message}`
            });
        }
    }

    async updateLimits(newLimits) {
        if (newLimits.cpu !== undefined) {
            this.limits.cpu = newLimits.cpu;
        }
        if (newLimits.memory !== undefined) {
            this.limits.memory = this._parseMemoryLimit(newLimits.memory);
        }
        if (newLimits.pids !== undefined) {
            this.limits.pids = newLimits.pids;
        }
        if (newLimits.networkBandwidth !== undefined) {
            this.limits.networkBandwidth = newLimits.networkBandwidth;
        }

        if (this.pid) {
            if (this.isLinux && this.cgroupPath) {
                await this._updateLinuxLimits();
            } else if (this.isWindows && this.jobHandle) {
                await this._updateWindowsLimits();
            }
        }

        this.emit('limits-updated', {
            extensionId: this.extensionId,
            limits: this.limits
        });
    }

    async _updateLinuxLimits() {
        try {
            if (!this.cgroupPath || !fs.existsSync(this.cgroupPath)) {
                return;
            }

            const cpuMaxValue = `${this.limits.cpu * 1000} 100000`;
            fs.writeFileSync(
                path.join(this.cgroupPath, 'cpu.max'),
                cpuMaxValue
            );

            fs.writeFileSync(
                path.join(this.cgroupPath, 'memory.max'),
                String(this.limits.memory)
            );

            fs.writeFileSync(
                path.join(this.cgroupPath, 'pids.max'),
                String(this.limits.pids)
            );

        } catch (error) {
            this.emit('limits-error', {
                extensionId: this.extensionId,
                error: error.message
            });
        }
    }

    async _updateWindowsLimits() {
        if (!this.jobHandle) return;
        
        try {
            const ffi = require('ffi-napi');
            const kernel32 = ffi.Library('kernel32', {
                'SetInformationJobObject': ['bool', ['pointer', 'int', 'pointer', 'uint32']]
            });

            const JOBOBJECT_EXTENDED_LIMIT_INFORMATION = 9;
            const limitInfo = Buffer.alloc(144);
            
            limitInfo.writeUInt32LE(0x00000100, 0);
            limitInfo.writeBigUInt64LE(BigInt(this.limits.memory), 32);
            limitInfo.writeUInt32LE(this.limits.cpu * 100, 48);

            kernel32.SetInformationJobObject(
                this.jobHandle,
                JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
                limitInfo,
                144
            );

        } catch (error) {
            this.emit('limits-error', {
                extensionId: this.extensionId,
                error: error.message
            });
        }
    }

    async getUsage() {
        if (this.isLinux && this.cgroupPath) {
            return await this._getLinuxUsage();
        } else if (this.isWindows) {
            return await this._getWindowsUsage();
        }
        return this._getDefaultUsage();
    }

    async _getLinuxUsage() {
        try {
            if (!this.cgroupPath || !fs.existsSync(this.cgroupPath)) {
                return this._getDefaultUsage();
            }

            const cpuStatPath = path.join(this.cgroupPath, 'cpu.stat');
            const memCurrentPath = path.join(this.cgroupPath, 'memory.current');
            const ioStatPath = path.join(this.cgroupPath, 'io.stat');

            const usage = {
                cpu_percent: 0,
                memory_bytes: 0,
                io_bytes: 0,
                network_bytes: 0,
                timestamp: Date.now()
            };

            if (fs.existsSync(cpuStatPath)) {
                const cpuStat = fs.readFileSync(cpuStatPath, 'utf8');
                const usageMatch = cpuStat.match(/usage_usec (\d+)/);
                if (usageMatch) {
                    const usageUsec = parseInt(usageMatch[1]);
                    const prevUsage = this.metricsHistory.cpu.length > 0 
                        ? this.metricsHistory.cpu[this.metricsHistory.cpu.length - 1]
                        : null;
                    
                    if (prevUsage) {
                        const deltaTime = usage.timestamp - prevUsage.timestamp;
                        const deltaUsage = usageUsec - prevUsage.value;
                        usage.cpu_percent = Math.min(100, (deltaUsage / (deltaTime * 10)));
                    }
                    
                    this.metricsHistory.cpu.push({
                        value: usageUsec,
                        timestamp: usage.timestamp
                    });
                    if (this.metricsHistory.cpu.length > 100) {
                        this.metricsHistory.cpu.shift();
                    }
                }
            }

            if (fs.existsSync(memCurrentPath)) {
                const memCurrent = fs.readFileSync(memCurrentPath, 'utf8').trim();
                usage.memory_bytes = parseInt(memCurrent) || 0;
            }

            if (fs.existsSync(ioStatPath)) {
                const ioStat = fs.readFileSync(ioStatPath, 'utf8');
                const lines = ioStat.split('\n');
                let totalBytes = 0;
                for (const line of lines) {
                    const rbytesMatch = line.match(/rbytes=(\d+)/);
                    const wbytesMatch = line.match(/wbytes=(\d+)/);
                    if (rbytesMatch) totalBytes += parseInt(rbytesMatch[1]);
                    if (wbytesMatch) totalBytes += parseInt(wbytesMatch[1]);
                }
                usage.io_bytes = totalBytes;
            }

            this._checkViolations(usage);
            return usage;

        } catch (error) {
            return this._getDefaultUsage();
        }
    }

    async _getWindowsUsage() {
        return this._getDefaultUsage();
    }

    _getDefaultUsage() {
        return {
            cpu_percent: 0,
            memory_bytes: 0,
            io_bytes: 0,
            network_bytes: 0,
            timestamp: Date.now()
        };
    }

    _checkViolations(usage) {
        const now = Date.now();
        
        if (usage.cpu_percent > (this.limits.cpu * 0.95)) {
            this.violations.push({
                type: 'cpu',
                timestamp: now,
                value: usage.cpu_percent,
                limit: this.limits.cpu
            });
            this.emit('violation', {
                extensionId: this.extensionId,
                type: 'cpu',
                usage: usage.cpu_percent,
                limit: this.limits.cpu
            });
        }

        if (usage.memory_bytes > (this.limits.memory * 0.95)) {
            this.violations.push({
                type: 'memory',
                timestamp: now,
                value: usage.memory_bytes,
                limit: this.limits.memory
            });
            this.emit('violation', {
                extensionId: this.extensionId,
                type: 'memory',
                usage: usage.memory_bytes,
                limit: this.limits.memory
            });
        }

        if (this.violations.length > 1000) {
            this.violations = this.violations.slice(-1000);
        }
    }

    getViolations(since = null) {
        if (since) {
            return this.violations.filter(v => v.timestamp > since);
        }
        return this.violations;
    }

    async cleanup() {
        if (this.isLinux && this.cgroupPath) {
            try {
                if (fs.existsSync(this.cgroupPath)) {
                    fs.rmdirSync(this.cgroupPath);
                }
            } catch (error) {
            }
        } else if (this.isWindows && this.jobHandle) {
            try {
                const ffi = require('ffi-napi');
                const kernel32 = ffi.Library('kernel32', {
                    'CloseHandle': ['bool', ['pointer']]
                });
                kernel32.CloseHandle(this.jobHandle);
            } catch (error) {
            }
        }

        this.emit('cleanup', {
            extensionId: this.extensionId
        });
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
    SandboxEscapeDetector,
    ResourceLimiter
};
