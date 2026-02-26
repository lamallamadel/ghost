const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');

class DevMode extends EventEmitter {
    constructor(options = {}) {
        super();
        this.enabled = options.enabled || false;
        this.options = {
            disableRateLimiting: options.disableRateLimiting !== false,
            relaxedValidation: options.relaxedValidation !== false,
            hotReload: options.hotReload !== false,
            debugMode: options.debugMode || false,
            ...options
        };
    }

    isEnabled() {
        return this.enabled;
    }

    enable() {
        this.enabled = true;
        this.emit('mode-change', { enabled: true });
    }

    disable() {
        this.enabled = false;
        this.emit('mode-change', { enabled: false });
    }

    shouldBypassRateLimit() {
        return this.enabled && this.options.disableRateLimiting;
    }

    shouldRelaxValidation() {
        return this.enabled && this.options.relaxedValidation;
    }

    isHotReloadEnabled() {
        return this.enabled && this.options.hotReload;
    }

    isDebugMode() {
        return this.enabled && this.options.debugMode;
    }

    getConfig() {
        return {
            enabled: this.enabled,
            ...this.options
        };
    }
}

class HotReloadWatcher extends EventEmitter {
    constructor(extensionPath, manifest) {
        super();
        this.extensionPath = extensionPath;
        this.manifest = manifest;
        this.watchers = new Map();
        this.isWatching = false;
    }

    start() {
        if (this.isWatching) {
            return;
        }

        this.isWatching = true;

        // Watch manifest.json
        const manifestPath = path.join(this.extensionPath, 'manifest.json');
        if (fs.existsSync(manifestPath)) {
            const manifestWatcher = fs.watch(manifestPath, (eventType) => {
                if (eventType === 'change') {
                    this._handleManifestChange();
                }
            });
            this.watchers.set('manifest', manifestWatcher);
        }

        // Watch main file
        const mainPath = path.join(this.extensionPath, this.manifest.main);
        if (fs.existsSync(mainPath)) {
            const mainWatcher = fs.watch(mainPath, (eventType) => {
                if (eventType === 'change') {
                    this._handleCodeChange(mainPath);
                }
            });
            this.watchers.set('main', mainWatcher);
        }

        // Watch all .js files in extension directory
        this._watchDirectory(this.extensionPath);
    }

    _watchDirectory(dir) {
        const entries = fs.readdirSync(dir, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);

            if (entry.isDirectory()) {
                if (entry.name !== 'node_modules' && entry.name !== '.git') {
                    this._watchDirectory(fullPath);
                }
            } else if (entry.isFile() && (entry.name.endsWith('.js') || entry.name.endsWith('.json'))) {
                if (!this.watchers.has(fullPath)) {
                    const watcher = fs.watch(fullPath, (eventType) => {
                        if (eventType === 'change') {
                            this._handleCodeChange(fullPath);
                        }
                    });
                    this.watchers.set(fullPath, watcher);
                }
            }
        }
    }

    _handleManifestChange() {
        try {
            const manifestPath = path.join(this.extensionPath, 'manifest.json');
            const newManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
            
            this.emit('manifest-changed', {
                extensionId: this.manifest.id,
                oldManifest: this.manifest,
                newManifest,
                timestamp: Date.now()
            });
            
            this.manifest = newManifest;
        } catch (error) {
            this.emit('error', {
                type: 'manifest-parse-error',
                error: error.message,
                timestamp: Date.now()
            });
        }
    }

    _handleCodeChange(filePath) {
        this.emit('code-changed', {
            extensionId: this.manifest.id,
            filePath,
            timestamp: Date.now()
        });
    }

    stop() {
        for (const [key, watcher] of this.watchers) {
            try {
                watcher.close();
            } catch (error) {
                // Ignore errors during cleanup
            }
        }
        this.watchers.clear();
        this.isWatching = false;
    }
}

module.exports = { DevMode, HotReloadWatcher };
