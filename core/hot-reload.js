const { EventEmitter } = require('events');
const fs = require('fs');
const path = require('path');

class ExtensionHotReload extends EventEmitter {
    constructor(gateway, runtime, options = {}) {
        super();
        this.gateway = gateway;
        this.runtime = runtime;
        this.options = options;
        
        this.watchers = new Map();
        this.reloadQueue = new Map();
        this.extensionStates = new Map();
        this.isReloading = new Set();
        
        this.debounceTime = options.debounceTime || 300;
        this.watchEnabled = options.watch !== false;
    }

    async enableHotReload(extensionId) {
        const ext = this.gateway.getExtension(extensionId);
        
        if (!ext) {
            throw new Error(`Extension ${extensionId} not found`);
        }

        if (this.watchers.has(extensionId)) {
            return;
        }

        if (!this.watchEnabled) {
            return;
        }

        const extensionPath = ext.path;
        
        try {
            const watcher = fs.watch(extensionPath, { recursive: true }, (eventType, filename) => {
                if (!filename) return;
                
                const ext = path.extname(filename);
                if (ext !== '.js' && filename !== 'manifest.json') {
                    return;
                }
                
                this._scheduleReload(extensionId);
            });

            this.watchers.set(extensionId, watcher);
            
            this.emit('watch-enabled', {
                extensionId,
                path: extensionPath,
                timestamp: Date.now()
            });
        } catch (error) {
            this.emit('watch-error', {
                extensionId,
                error: error.message,
                timestamp: Date.now()
            });
        }
    }

    disableHotReload(extensionId) {
        const watcher = this.watchers.get(extensionId);
        
        if (watcher) {
            watcher.close();
            this.watchers.delete(extensionId);
            
            this.emit('watch-disabled', {
                extensionId,
                timestamp: Date.now()
            });
        }

        if (this.reloadQueue.has(extensionId)) {
            clearTimeout(this.reloadQueue.get(extensionId));
            this.reloadQueue.delete(extensionId);
        }
    }

    _scheduleReload(extensionId) {
        if (this.reloadQueue.has(extensionId)) {
            clearTimeout(this.reloadQueue.get(extensionId));
        }

        const timeoutId = setTimeout(() => {
            this.reloadQueue.delete(extensionId);
            this.reloadExtension(extensionId).catch(error => {
                this.emit('reload-error', {
                    extensionId,
                    error: error.message,
                    timestamp: Date.now()
                });
            });
        }, this.debounceTime);

        this.reloadQueue.set(extensionId, timeoutId);
    }

    async reloadExtension(extensionId, options = {}) {
        if (this.isReloading.has(extensionId)) {
            throw new Error(`Extension ${extensionId} is already being reloaded`);
        }

        this.isReloading.add(extensionId);

        const startTime = Date.now();
        
        this.emit('reload-started', {
            extensionId,
            timestamp: startTime,
            reason: options.reason || 'manual'
        });

        try {
            const ext = this.gateway.getExtension(extensionId);
            
            if (!ext) {
                throw new Error(`Extension ${extensionId} not found`);
            }

            const state = await this._captureExtensionState(extensionId);
            this.extensionStates.set(extensionId, state);

            const pendingRequests = await this._capturePendingRequests(extensionId);

            if (this.runtime && this.runtime.extensions.has(extensionId)) {
                await this._gracefulShutdown(extensionId, pendingRequests);
            } else {
                await this._unloadExtension(extensionId);
            }

            this._clearModuleCache(ext.path);

            await this._reloadExtension(extensionId, ext.path);

            if (state && options.restoreState !== false) {
                await this._restoreExtensionState(extensionId, state);
            }

            if (pendingRequests.length > 0 && options.retryPendingRequests !== false) {
                await this._retryPendingRequests(extensionId, pendingRequests);
            }

            const duration = Date.now() - startTime;
            
            this.emit('reload-completed', {
                extensionId,
                timestamp: Date.now(),
                duration,
                pendingRequestsCount: pendingRequests.length,
                stateRestored: !!state
            });

            return {
                success: true,
                duration,
                pendingRequestsCount: pendingRequests.length,
                stateRestored: !!state
            };
        } catch (error) {
            const duration = Date.now() - startTime;
            
            this.emit('reload-failed', {
                extensionId,
                timestamp: Date.now(),
                duration,
                error: error.message,
                stack: error.stack
            });

            throw error;
        } finally {
            this.isReloading.delete(extensionId);
        }
    }

    async _captureExtensionState(extensionId) {
        if (!this.runtime || !this.runtime.extensions.has(extensionId)) {
            return null;
        }

        const extensionProcess = this.runtime.extensions.get(extensionId);
        
        try {
            if (extensionProcess.state !== 'RUNNING') {
                return null;
            }

            const stateResult = await extensionProcess.call('getState', {}).catch(() => null);
            
            return stateResult;
        } catch (error) {
            this.emit('state-capture-error', {
                extensionId,
                error: error.message,
                timestamp: Date.now()
            });
            return null;
        }
    }

    async _capturePendingRequests(extensionId) {
        if (!this.runtime || !this.runtime.extensions.has(extensionId)) {
            return [];
        }

        const extensionProcess = this.runtime.extensions.get(extensionId);
        const pending = [];

        if (extensionProcess.pendingRequests) {
            for (const [requestId, request] of extensionProcess.pendingRequests) {
                pending.push({
                    requestId,
                    method: request.method,
                    timestamp: request.timestamp,
                    age: Date.now() - request.timestamp
                });
            }
        }

        return pending;
    }

    async _gracefulShutdown(extensionId, pendingRequests) {
        const extensionProcess = this.runtime.extensions.get(extensionId);
        
        this.emit('shutdown-started', {
            extensionId,
            timestamp: Date.now(),
            pendingRequestsCount: pendingRequests.length
        });

        if (pendingRequests.length > 0) {
            const timeout = this.options.gracefulShutdownTimeout || 5000;
            const waitStart = Date.now();
            
            while (pendingRequests.length > 0 && (Date.now() - waitStart) < timeout) {
                await new Promise(resolve => setTimeout(resolve, 100));
                
                const currentPending = await this._capturePendingRequests(extensionId);
                if (currentPending.length === 0) {
                    break;
                }
            }
        }

        await this.runtime.stopExtension(extensionId);
        
        this.emit('shutdown-completed', {
            extensionId,
            timestamp: Date.now()
        });
    }

    async _unloadExtension(extensionId) {
        this.gateway.unloadExtension(extensionId);
    }

    _clearModuleCache(extensionPath) {
        const absPath = path.resolve(extensionPath);
        
        for (const key in require.cache) {
            if (key.startsWith(absPath)) {
                delete require.cache[key];
                
                this.emit('cache-cleared', {
                    module: key,
                    timestamp: Date.now()
                });
            }
        }
    }

    async _reloadExtension(extensionId, extensionPath) {
        const manifestPath = path.join(extensionPath, 'manifest.json');
        const extension = await this.gateway.loader.loadExtension(extensionPath, manifestPath);
        
        this.gateway.extensions.set(extensionId, extension);

        if (this.runtime) {
            await this.runtime.startExtension(
                extensionId,
                extensionPath,
                extension.manifest,
                this.options.runtimeOptions || {}
            );
        }

        this.emit('extension-loaded', {
            extensionId,
            timestamp: Date.now()
        });
    }

    async _restoreExtensionState(extensionId, state) {
        if (!state) {
            return;
        }

        if (!this.runtime || !this.runtime.extensions.has(extensionId)) {
            return;
        }

        const extensionProcess = this.runtime.extensions.get(extensionId);
        
        try {
            if (extensionProcess.state === 'RUNNING') {
                await extensionProcess.call('setState', { state }).catch(() => {});
                
                this.emit('state-restored', {
                    extensionId,
                    timestamp: Date.now()
                });
            }
        } catch (error) {
            this.emit('state-restore-error', {
                extensionId,
                error: error.message,
                timestamp: Date.now()
            });
        }
    }

    async _retryPendingRequests(extensionId, pendingRequests) {
        this.emit('retry-started', {
            extensionId,
            requestCount: pendingRequests.length,
            timestamp: Date.now()
        });

        const results = {
            retried: 0,
            failed: 0
        };

        for (const request of pendingRequests) {
            try {
                results.retried++;
            } catch (error) {
                results.failed++;
                
                this.emit('retry-failed', {
                    extensionId,
                    requestId: request.requestId,
                    method: request.method,
                    error: error.message,
                    timestamp: Date.now()
                });
            }
        }

        this.emit('retry-completed', {
            extensionId,
            ...results,
            timestamp: Date.now()
        });
    }

    getReloadStatus(extensionId) {
        return {
            isReloading: this.isReloading.has(extensionId),
            watchEnabled: this.watchers.has(extensionId),
            hasScheduledReload: this.reloadQueue.has(extensionId),
            hasCapturedState: this.extensionStates.has(extensionId)
        };
    }

    getAllReloadStatus() {
        const status = {};
        
        for (const extensionId of this.gateway.extensions.keys()) {
            status[extensionId] = this.getReloadStatus(extensionId);
        }
        
        return status;
    }

    async shutdown() {
        for (const extensionId of this.watchers.keys()) {
            this.disableHotReload(extensionId);
        }
        
        this.watchers.clear();
        this.reloadQueue.clear();
        this.extensionStates.clear();
        this.isReloading.clear();
    }
}

module.exports = ExtensionHotReload;
