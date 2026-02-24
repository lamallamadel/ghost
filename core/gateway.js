#!/usr/bin/env node

const path = require('path');
const ExtensionLoader = require('./extension-loader');

class Gateway {
    constructor(options = {}) {
        this.options = {
            extensionsDir: options.extensionsDir || path.join(require('os').homedir(), '.ghost', 'extensions'),
            ...options
        };
        this.loader = new ExtensionLoader(this.options.extensionsDir);
        this.extensions = new Map();
    }

    async initialize() {
        const loadedExtensions = await this.loader.discoverAndLoad();
        
        for (const ext of loadedExtensions) {
            this.extensions.set(ext.manifest.id, ext);
        }
        
        return {
            success: true,
            loaded: loadedExtensions.length,
            extensions: Array.from(this.extensions.keys())
        };
    }

    getExtension(id) {
        return this.extensions.get(id);
    }

    listExtensions() {
        return Array.from(this.extensions.values()).map(ext => ({
            id: ext.manifest.id,
            name: ext.manifest.name,
            version: ext.manifest.version,
            capabilities: ext.manifest.capabilities
        }));
    }

    async executeExtension(id, method, ...args) {
        const ext = this.extensions.get(id);
        
        if (!ext) {
            throw new Error(`Extension not found: ${id}`);
        }

        if (!ext.instance || typeof ext.instance[method] !== 'function') {
            throw new Error(`Method ${method} not found in extension ${id}`);
        }

        return await ext.instance[method](...args);
    }

    unloadExtension(id) {
        const ext = this.extensions.get(id);
        
        if (!ext) {
            return false;
        }

        if (ext.instance && typeof ext.instance.cleanup === 'function') {
            ext.instance.cleanup();
        }

        this.extensions.delete(id);
        return true;
    }

    shutdown() {
        for (const [id, ext] of this.extensions) {
            if (ext.instance && typeof ext.instance.cleanup === 'function') {
                ext.instance.cleanup();
            }
        }
        this.extensions.clear();
    }
}

module.exports = Gateway;
