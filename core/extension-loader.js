const fs = require('fs');
const path = require('path');

const MANIFEST_SCHEMA = require('./manifest-schema.json');

class ExtensionLoader {
    constructor(extensionsDir) {
        this.extensionsDir = extensionsDir;
        this.loadedExtensions = [];
    }

    async discoverAndLoad() {
        if (!fs.existsSync(this.extensionsDir)) {
            try {
                fs.mkdirSync(this.extensionsDir, { recursive: true });
            } catch (error) {
                console.warn(`[ExtensionLoader] Could not create extensions directory: ${error.message}`);
            }
            return [];
        }

        const entries = fs.readdirSync(this.extensionsDir, { withFileTypes: true });
        const extensions = [];

        for (const entry of entries) {
            if (!entry.isDirectory()) {
                continue;
            }

            const extPath = path.join(this.extensionsDir, entry.name);
            const manifestPath = path.join(extPath, 'manifest.json');

            if (!fs.existsSync(manifestPath)) {
                console.warn(`[ExtensionLoader] Skipping ${entry.name}: no manifest.json found`);
                continue;
            }

            try {
                const extension = await this.loadExtension(extPath, manifestPath);
                extensions.push(extension);
                this.loadedExtensions.push(extension);
            } catch (error) {
                console.error(`[ExtensionLoader] Failed to load ${entry.name}:`, error.message);
            }
        }

        return extensions;
    }

    async loadExtension(extPath, manifestPath) {
        const manifestContent = fs.readFileSync(manifestPath, 'utf8');
        const manifest = JSON.parse(manifestContent);

        this.validateManifest(manifest);

        const mainFile = path.join(extPath, manifest.main);
        
        if (!fs.existsSync(mainFile)) {
            throw new Error(`Main file not found: ${manifest.main}`);
        }

        let instance = null;
        try {
            const ExtensionModule = require(mainFile);
            instance = typeof ExtensionModule === 'function' ? new ExtensionModule() : ExtensionModule;
        } catch (error) {
            console.warn(`[ExtensionLoader] Could not instantiate ${manifest.id}:`, error.message);
        }

        return {
            path: extPath,
            manifest,
            instance,
            loaded: new Date().toISOString()
        };
    }

    validateManifest(manifest) {
        const errors = [];

        if (!manifest.id || typeof manifest.id !== 'string') {
            errors.push('Missing or invalid "id" field');
        } else if (!/^[a-z0-9-]+$/.test(manifest.id)) {
            errors.push('Field "id" must be lowercase alphanumeric with hyphens');
        }

        if (!manifest.name || typeof manifest.name !== 'string') {
            errors.push('Missing or invalid "name" field');
        }

        if (!manifest.version || typeof manifest.version !== 'string') {
            errors.push('Missing or invalid "version" field');
        } else if (!/^\d+\.\d+\.\d+$/.test(manifest.version)) {
            errors.push('Field "version" must follow semver format (e.g., 1.0.0)');
        }

        if (!manifest.main || typeof manifest.main !== 'string') {
            errors.push('Missing or invalid "main" field');
        }

        if (!manifest.capabilities || typeof manifest.capabilities !== 'object') {
            errors.push('Missing or invalid "capabilities" field');
        } else {
            this.validateCapabilities(manifest.capabilities, errors);
        }

        if (errors.length > 0) {
            throw new Error(`Manifest validation failed:\n  - ${errors.join('\n  - ')}`);
        }

        return true;
    }

    validateCapabilities(capabilities, errors) {
        if (capabilities.filesystem) {
            const fs = capabilities.filesystem;
            
            if (fs.read && !Array.isArray(fs.read)) {
                errors.push('capabilities.filesystem.read must be an array');
            }
            
            if (fs.write && !Array.isArray(fs.write)) {
                errors.push('capabilities.filesystem.write must be an array');
            }
        }

        if (capabilities.network) {
            const net = capabilities.network;
            
            if (net.allowlist) {
                if (!Array.isArray(net.allowlist)) {
                    errors.push('capabilities.network.allowlist must be an array');
                } else {
                    for (const url of net.allowlist) {
                        if (!/^https?:\/\/[^/]+$/.test(url)) {
                            errors.push(`Invalid allowlist URL: ${url} (must be protocol + domain only)`);
                        }
                    }
                }
            }
            
            if (net.rateLimit) {
                const rl = net.rateLimit;
                
                if (typeof rl.cir !== 'number' || rl.cir < 1) {
                    errors.push('capabilities.network.rateLimit.cir must be a positive integer');
                }
                
                if (typeof rl.bc !== 'number' || rl.bc < 1) {
                    errors.push('capabilities.network.rateLimit.bc must be a positive integer');
                }
            }
        }

        if (capabilities.git) {
            const git = capabilities.git;
            
            if (git.read !== undefined && typeof git.read !== 'boolean') {
                errors.push('capabilities.git.read must be a boolean');
            }
            
            if (git.write !== undefined && typeof git.write !== 'boolean') {
                errors.push('capabilities.git.write must be a boolean');
            }
        }

        if (capabilities.hooks) {
            if (!Array.isArray(capabilities.hooks)) {
                errors.push('capabilities.hooks must be an array');
            } else {
                const validHooks = ['pre-commit', 'post-commit', 'pre-push', 'post-checkout', 'commit-msg', 'pre-rebase'];
                for (const hook of capabilities.hooks) {
                    if (!validHooks.includes(hook)) {
                        errors.push(`Invalid hook: ${hook}`);
                    }
                }
            }
        }
    }

    getLoadedExtensions() {
        return this.loadedExtensions.map(ext => ({
            id: ext.manifest.id,
            name: ext.manifest.name,
            version: ext.manifest.version,
            loaded: ext.loaded
        }));
    }

    unload(extensionId) {
        const index = this.loadedExtensions.findIndex(ext => ext.manifest.id === extensionId);
        
        if (index === -1) {
            return false;
        }

        const ext = this.loadedExtensions[index];
        
        if (ext.instance && typeof ext.instance.cleanup === 'function') {
            try {
                ext.instance.cleanup();
            } catch (error) {
                console.error(`[ExtensionLoader] Cleanup failed for ${extensionId}:`, error.message);
            }
        }

        this.loadedExtensions.splice(index, 1);
        return true;
    }
}

module.exports = ExtensionLoader;
