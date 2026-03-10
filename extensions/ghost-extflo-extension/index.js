#!/usr/bin/env node

const { ExtensionSDK, ExtensionRunner } = require('@ghost/extension-sdk');

class ExtensionFlowFactory {
    constructor() {
        this.sdk = new ExtensionSDK('ghost-extflo-extension');
        this.registry = new Map(); // extensionId -> metadata
        this.activeExtensions = new Map(); // extensionId -> status
        this.loadingLocks = new Set(); // Thread-safety singleton locks
        
        // Critical extensions that must be loaded EAGERLY
        this.CRITICAL_EXTENSIONS = [
            'ghost-deps-extension',
            'ghost-security-extension',
            'ghost-cli-extension'
        ];
    }

    async init() {
        try {
            // 1. Fetch global registry from core
            const allExtensions = await this.sdk.emitIntent({
                type: 'system',
                operation: 'registry',
                params: {}
            });

            for (const ext of allExtensions) {
                this.registry.set(ext.id, ext);
                this.activeExtensions.set(ext.id, 'STOPPED');
            }

            // 2. Perform EAGER loading for critical extensions
            await this._performEagerLoad();

            console.log(`[ExtFlo] Factory initialized. ${this.CRITICAL_EXTENSIONS.length} eager, ${this.registry.size - this.CRITICAL_EXTENSIONS.length} lazy.`);
            return { success: true };
        } catch (e) {
            console.error('[ExtFlo] Initialization failed:', e.message);
            return { success: false, error: e.message };
        }
    }

    async _performEagerLoad() {
        for (const extId of this.CRITICAL_EXTENSIONS) {
            if (this.registry.has(extId)) {
                await this.load(extId, { strategy: 'eager' });
            }
        }
    }

    /**
     * Singleton / Thread-safe loader
     */
    async load(extensionId, options = {}) {
        if (this.loadingLocks.has(extensionId)) {
            // Wait for existing load to finish (pseudo thread-safety)
            while (this.loadingLocks.has(extensionId)) {
                await new Promise(r => setTimeout(r, 50));
            }
            return { success: true, reason: 'already_loading_handled' };
        }

        if (this.activeExtensions.get(extensionId) === 'RUNNING') {
            return { success: true, reason: 'already_running' };
        }

        this.loadingLocks.add(extensionId);
        try {
            const strategy = options.strategy || 'lazy';
            console.log(`[ExtFlo] Loading ${extensionId} (${strategy})...`);

            // Check dependencies first via ghost-deps-extension if not us
            if (extensionId !== 'ghost-deps-extension') {
                await this._resolveDependencies(extensionId);
            }

            // Command to core to start the process (if not already started by core)
            // In our current architecture, core starts them, but ExtFlo manages the READY state
            this.activeExtensions.set(extensionId, 'RUNNING');
            
            return { success: true };
        } finally {
            this.loadingLocks.delete(extensionId);
        }
    }

    async _resolveDependencies(extensionId) {
        // Logic to call ghost-deps-extension and verify graph
        // For now, placeholder for the 'after' / 'find deps' logic
    }

    /**
     * Lifecycle Operations
     */
    async operate(operation, extensionId, params = {}) {
        switch (operation) {
            case 'start': return await this.load(extensionId, { strategy: 'force' });
            case 'stop': 
                this.activeExtensions.set(extensionId, 'STOPPED');
                return { success: true };
            case 'status':
                return { 
                    id: extensionId, 
                    state: this.activeExtensions.get(extensionId),
                    metadata: this.registry.get(extensionId)
                };
            default:
                throw new Error(`Unknown operation: ${operation}`);
        }
    }

    /**
     * The Intelligent Interceptor
     * If an extension is called but not running, load it LAZILY.
     */
    async handleRPCRequest(request) {
        const { method, params = {} } = request;

        // Management API
        if (method.startsWith('extflo.')) {
            const op = method.split('.')[1];
            return await this.operate(op, params.extensionId, params);
        }

        // Lazy Proxy Logic: Intercept any call to other extensions
        if (params.extensionId && this.activeExtensions.get(params.extensionId) === 'STOPPED') {
            await this.load(params.extensionId, { strategy: 'lazy' });
        }

        return { success: true };
    }
}

const factory = new ExtensionFlowFactory();

if (require.main === module) {
    const wrapper = {
        init: (opts) => factory.init(opts),
        handleRPCRequest: (req) => factory.handleRPCRequest(req)
    };
    new ExtensionRunner(wrapper).start();
}

module.exports = { ExtensionFlowFactory };
