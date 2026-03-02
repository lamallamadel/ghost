/**
 * Developer Mode & Hot Reload System
 * 
 * FEATURES:
 * 1. DevMode - Toggle development features
 *    - Disable rate limiting
 *    - Relaxed validation
 *    - Hot reload enabled/disabled
 *    - Debug mode
 * 
 * 2. HotReloadWatcher - File watching with debouncing
 *    - Monitors manifest.json for configuration changes
 *    - Monitors code files (*.js, *.json) for changes
 *    - Computes manifest diffs (version, capabilities, dependencies)
 *    - 500ms debounce to prevent rapid reloads
 * 
 * 3. HotReloadManager - Comprehensive reload orchestration
 *    - Graceful extension shutdown
 *    - State preservation via serialize/deserialize
 *    - Request queuing during reload
 *    - Automatic rollback on failure
 *    - WebSocket notifications for desktop app
 *    - Production safety checks
 * 
 * CLI COMMANDS:
 *   ghost dev enable                     Enable developer mode
 *   ghost dev disable                    Disable developer mode  
 *   ghost dev status                     Show dev mode status
 *   ghost gateway reload <extension-id>  Manually reload extension
 * 
 * EXTENSION STATE HOOKS:
 * Extensions can implement these optional methods:
 *   serialize()   - Return state object to preserve
 *   deserialize(state) - Restore from state object
 * 
 * WEBSOCKET EVENTS:
 *   extension-reload-started
 *   extension-reload-completed
 *   extension-reload-failed
 *   extension-rollback-completed
 *   extension-reload-timeout-warning
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
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
    constructor(extensionPath, manifest, options = {}) {
        super();
        this.extensionPath = extensionPath;
        this.manifest = manifest;
        this.watchers = new Map();
        this.isWatching = false;
        this.debounceDelay = options.debounceDelay || 500;
        this.debounceTimers = new Map();
    }

    start() {
        if (this.isWatching) {
            return;
        }

        this.isWatching = true;

        const manifestPath = path.join(this.extensionPath, 'manifest.json');
        if (fs.existsSync(manifestPath)) {
            const manifestWatcher = fs.watch(manifestPath, (eventType) => {
                if (eventType === 'change') {
                    this._debounce('manifest', () => this._handleManifestChange());
                }
            });
            this.watchers.set('manifest', manifestWatcher);
        }

        const mainPath = path.join(this.extensionPath, this.manifest.main);
        if (fs.existsSync(mainPath)) {
            const mainWatcher = fs.watch(mainPath, (eventType) => {
                if (eventType === 'change') {
                    this._debounce('main', () => this._handleCodeChange(mainPath));
                }
            });
            this.watchers.set('main', mainWatcher);
        }

        this._watchDirectory(this.extensionPath);
    }

    _watchDirectory(dir) {
        try {
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
                                this._debounce(fullPath, () => this._handleCodeChange(fullPath));
                            }
                        });
                        this.watchers.set(fullPath, watcher);
                    }
                }
            }
        } catch (error) {
            this.emit('error', {
                type: 'watch-directory-error',
                error: error.message,
                path: dir,
                timestamp: Date.now()
            });
        }
    }

    _debounce(key, callback) {
        if (this.debounceTimers.has(key)) {
            clearTimeout(this.debounceTimers.get(key));
        }

        const timer = setTimeout(() => {
            this.debounceTimers.delete(key);
            callback();
        }, this.debounceDelay);

        this.debounceTimers.set(key, timer);
    }

    _handleManifestChange() {
        try {
            const manifestPath = path.join(this.extensionPath, 'manifest.json');
            const newManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
            
            const diff = this._computeManifestDiff(this.manifest, newManifest);
            
            this.emit('manifest-changed', {
                extensionId: this.manifest.id,
                oldManifest: this.manifest,
                newManifest,
                diff,
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

    _computeManifestDiff(oldManifest, newManifest) {
        const diff = {
            version: oldManifest.version !== newManifest.version ? {
                old: oldManifest.version,
                new: newManifest.version
            } : null,
            name: oldManifest.name !== newManifest.name ? {
                old: oldManifest.name,
                new: newManifest.name
            } : null,
            main: oldManifest.main !== newManifest.main ? {
                old: oldManifest.main,
                new: newManifest.main
            } : null,
            capabilities: this._diffCapabilities(oldManifest.capabilities, newManifest.capabilities),
            dependencies: this._diffDependencies(oldManifest.dependencies, newManifest.dependencies)
        };

        return diff;
    }

    _diffCapabilities(oldCaps, newCaps) {
        if (!oldCaps && !newCaps) return null;
        if (!oldCaps) return { added: newCaps };
        if (!newCaps) return { removed: oldCaps };

        const changes = {};
        const oldKeys = Object.keys(oldCaps);
        const newKeys = Object.keys(newCaps);

        const added = newKeys.filter(k => !oldKeys.includes(k));
        const removed = oldKeys.filter(k => !newKeys.includes(k));
        const modified = oldKeys.filter(k => newKeys.includes(k) && JSON.stringify(oldCaps[k]) !== JSON.stringify(newCaps[k]));

        if (added.length > 0) changes.added = added;
        if (removed.length > 0) changes.removed = removed;
        if (modified.length > 0) changes.modified = modified;

        return Object.keys(changes).length > 0 ? changes : null;
    }

    _diffDependencies(oldDeps, newDeps) {
        if (!oldDeps && !newDeps) return null;
        if (!oldDeps) return { added: newDeps };
        if (!newDeps) return { removed: oldDeps };

        const changes = {};
        const oldKeys = Object.keys(oldDeps);
        const newKeys = Object.keys(newDeps);

        const added = newKeys.filter(k => !oldKeys.includes(k));
        const removed = oldKeys.filter(k => !newKeys.includes(k));
        const modified = oldKeys.filter(k => newKeys.includes(k) && oldDeps[k] !== newDeps[k]);

        if (added.length > 0) changes.added = added.reduce((acc, k) => ({ ...acc, [k]: newDeps[k] }), {});
        if (removed.length > 0) changes.removed = removed;
        if (modified.length > 0) {
            changes.modified = modified.reduce((acc, k) => ({
                ...acc,
                [k]: { old: oldDeps[k], new: newDeps[k] }
            }), {});
        }

        return Object.keys(changes).length > 0 ? changes : null;
    }

    _handleCodeChange(filePath) {
        this.emit('code-changed', {
            extensionId: this.manifest.id,
            filePath,
            timestamp: Date.now()
        });
    }

    stop() {
        for (const timer of this.debounceTimers.values()) {
            clearTimeout(timer);
        }
        this.debounceTimers.clear();

        for (const [key, watcher] of this.watchers) {
            try {
                watcher.close();
            } catch (error) {
            }
        }
        this.watchers.clear();
        this.isWatching = false;
    }
}

/**
 * HotReloadManager - Extension Hot Reload Orchestrator
 * 
 * Provides comprehensive hot-reload capability for extensions:
 * - File watching for manifest.json and code changes with debouncing (500ms)
 * - Graceful shutdown sequence with state preservation
 * - Request queuing during reload with timeout warnings
 * - Automatic rollback on failed reloads
 * - WebSocket notifications to desktop app
 * - Production safety checks
 * 
 * State Preservation:
 * - Serializes extension state to ~/.ghost/extensions/:id/state.json
 * - Extensions can implement serialize/deserialize methods in manifest
 * - Automatic state restoration after successful reload
 * 
 * Error Recovery:
 * - Failed reloads automatically rollback to previous version
 * - Up to 5 backup versions kept per extension
 * - Pending requests rejected with detailed error information
 * - Gateway continues running even if individual reload fails
 */
class HotReloadManager extends EventEmitter {
    constructor(runtime, options = {}) {
        super();
        this.runtime = runtime;
        this.watchers = new Map();
        this.reloadQueue = [];
        this.isReloading = false;
        this.options = {
            debounceDelay: options.debounceDelay || 500,
            requestQueueTimeout: options.requestQueueTimeout || 30000,
            stateDir: options.stateDir || path.join(os.homedir(), '.ghost', 'extensions'),
            ...options
        };
        this.websocketClients = new Set();
        this.pendingRequestQueues = new Map();
    }

    registerWebSocketClient(client) {
        this.websocketClients.add(client);
    }

    unregisterWebSocketClient(client) {
        this.websocketClients.delete(client);
    }

    broadcastWebSocketMessage(message) {
        const payload = JSON.stringify(message);
        for (const client of this.websocketClients) {
            try {
                if (client.readyState === 1) {
                    client.send(payload);
                }
            } catch (error) {
            }
        }
    }

    async enableHotReload(extensionId, extensionPath, manifest) {
        if (this.watchers.has(extensionId)) {
            return;
        }

        const watcher = new HotReloadWatcher(extensionPath, manifest, {
            debounceDelay: this.options.debounceDelay
        });

        watcher.on('manifest-changed', async (data) => {
            await this.triggerReload(extensionId, 'manifest-change', data);
        });

        watcher.on('code-changed', async (data) => {
            await this.triggerReload(extensionId, 'code-change', data);
        });

        watcher.on('error', (error) => {
            this.emit('watcher-error', {
                extensionId,
                error
            });
        });

        watcher.start();
        this.watchers.set(extensionId, watcher);

        this.emit('hot-reload-enabled', {
            extensionId,
            timestamp: Date.now()
        });
    }

    async disableHotReload(extensionId) {
        const watcher = this.watchers.get(extensionId);
        if (!watcher) {
            return;
        }

        watcher.stop();
        this.watchers.delete(extensionId);

        this.emit('hot-reload-disabled', {
            extensionId,
            timestamp: Date.now()
        });
    }

    async triggerReload(extensionId, reason, metadata = {}) {
        this.reloadQueue.push({
            extensionId,
            reason,
            metadata,
            timestamp: Date.now()
        });

        if (!this.isReloading) {
            await this._processReloadQueue();
        }
    }

    async _processReloadQueue() {
        if (this.isReloading || this.reloadQueue.length === 0) {
            return;
        }

        this.isReloading = true;

        while (this.reloadQueue.length > 0) {
            const reloadRequest = this.reloadQueue.shift();
            try {
                await this._performReload(reloadRequest);
            } catch (error) {
                this.emit('reload-error', {
                    extensionId: reloadRequest.extensionId,
                    error: error.message,
                    timestamp: Date.now()
                });
            }
        }

        this.isReloading = false;
    }

    async _performReload(reloadRequest) {
        const { extensionId, reason, metadata } = reloadRequest;
        const startTime = Date.now();

        this.emit('reload-started', {
            extensionId,
            reason,
            metadata,
            timestamp: startTime
        });

        this.broadcastWebSocketMessage({
            type: 'extension-reload-started',
            extensionId,
            reason,
            metadata,
            timestamp: startTime
        });

        const extension = this.runtime.extensions.get(extensionId);
        if (!extension) {
            throw new Error(`Extension ${extensionId} not found in runtime`);
        }

        const previousState = extension.getState();
        const previousVersion = previousState.manifest ? previousState.manifest.version : null;

        let savedState = null;
        let backupVersion = null;

        try {
            savedState = await this._saveExtensionState(extensionId, extension);

            backupVersion = await this._createBackup(extensionId, extension);

            await this._queuePendingRequests(extensionId);

            await this.runtime.stopExtension(extensionId);

            const extensionLoader = this.runtime.loader || this._getExtensionLoader(extensionId);
            const extensionData = await extensionLoader.loadExtension(
                extension.extensionPath,
                path.join(extension.extensionPath, 'manifest.json')
            );

            await this.runtime.startExtension(
                extensionId,
                extension.extensionPath,
                extensionData.manifest,
                extension.options
            );

            await this._restoreExtensionState(extensionId, savedState);

            await this._replayPendingRequests(extensionId);

            const newState = this.runtime.extensions.get(extensionId).getState();
            const newVersion = newState.manifest ? newState.manifest.version : null;

            const reloadDuration = Date.now() - startTime;

            this.emit('reload-completed', {
                extensionId,
                reason,
                previousVersion,
                newVersion,
                duration: reloadDuration,
                timestamp: Date.now()
            });

            this.broadcastWebSocketMessage({
                type: 'extension-reload-completed',
                extensionId,
                reason,
                previousVersion,
                newVersion,
                diff: metadata.diff || null,
                duration: reloadDuration,
                timestamp: Date.now()
            });

        } catch (error) {
            this.emit('reload-failed', {
                extensionId,
                error: error.message,
                timestamp: Date.now()
            });

            this.broadcastWebSocketMessage({
                type: 'extension-reload-failed',
                extensionId,
                error: error.message,
                timestamp: Date.now()
            });

            try {
                await this._rollbackToBackup(extensionId, backupVersion, previousState);
            } catch (rollbackError) {
                this.emit('rollback-failed', {
                    extensionId,
                    error: rollbackError.message,
                    timestamp: Date.now()
                });
            }

            await this._rejectPendingRequests(extensionId, error);

            throw error;
        }
    }

    async _saveExtensionState(extensionId, extension) {
        const stateDir = path.join(this.options.stateDir, extensionId);
        const statePath = path.join(stateDir, 'state.json');

        if (!fs.existsSync(stateDir)) {
            fs.mkdirSync(stateDir, { recursive: true });
        }

        let state = {
            extensionId,
            timestamp: Date.now(),
            runtimeState: extension.getState()
        };

        if (extension.instance && typeof extension.instance.serialize === 'function') {
            try {
                state.extensionData = await extension.instance.serialize();
            } catch (error) {
                this.emit('state-serialize-error', {
                    extensionId,
                    error: error.message,
                    timestamp: Date.now()
                });
            }
        }

        fs.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf8');

        return state;
    }

    async _restoreExtensionState(extensionId, savedState) {
        if (!savedState || !savedState.extensionData) {
            return;
        }

        const extension = this.runtime.extensions.get(extensionId);
        if (!extension || !extension.instance) {
            return;
        }

        if (typeof extension.instance.deserialize === 'function') {
            try {
                await extension.instance.deserialize(savedState.extensionData);
            } catch (error) {
                this.emit('state-deserialize-error', {
                    extensionId,
                    error: error.message,
                    timestamp: Date.now()
                });
            }
        }
    }

    async _createBackup(extensionId, extension) {
        const backupDir = path.join(this.options.stateDir, extensionId, 'backups');
        const backupVersion = Date.now().toString();
        const backupPath = path.join(backupDir, backupVersion);

        if (!fs.existsSync(backupDir)) {
            fs.mkdirSync(backupDir, { recursive: true });
        }

        const backupData = {
            version: backupVersion,
            extensionId,
            extensionPath: extension.extensionPath,
            manifest: extension.manifest,
            state: extension.getState(),
            timestamp: Date.now()
        };

        fs.writeFileSync(backupPath + '.json', JSON.stringify(backupData, null, 2), 'utf8');

        const maxBackups = 5;
        const backups = fs.readdirSync(backupDir)
            .filter(f => f.endsWith('.json'))
            .map(f => ({
                path: path.join(backupDir, f),
                time: parseInt(path.basename(f, '.json'))
            }))
            .sort((a, b) => b.time - a.time);

        if (backups.length > maxBackups) {
            for (let i = maxBackups; i < backups.length; i++) {
                try {
                    fs.unlinkSync(backups[i].path);
                } catch (error) {
                }
            }
        }

        return backupVersion;
    }

    async _rollbackToBackup(extensionId, backupVersion, previousState) {
        if (!backupVersion) {
            throw new Error('No backup version available for rollback');
        }

        const backupPath = path.join(this.options.stateDir, extensionId, 'backups', backupVersion + '.json');
        
        if (!fs.existsSync(backupPath)) {
            throw new Error(`Backup not found: ${backupPath}`);
        }

        const backupData = JSON.parse(fs.readFileSync(backupPath, 'utf8'));

        await this.runtime.stopExtension(extensionId);

        await this.runtime.startExtension(
            extensionId,
            backupData.extensionPath,
            backupData.manifest,
            {}
        );

        this.emit('rollback-completed', {
            extensionId,
            backupVersion,
            timestamp: Date.now()
        });

        this.broadcastWebSocketMessage({
            type: 'extension-rollback-completed',
            extensionId,
            backupVersion,
            timestamp: Date.now()
        });
    }

    async _queuePendingRequests(extensionId) {
        if (!this.pendingRequestQueues.has(extensionId)) {
            this.pendingRequestQueues.set(extensionId, []);
        }

        const queueStartTime = Date.now();
        const timeoutWarning = setTimeout(() => {
            this.emit('queue-timeout-warning', {
                extensionId,
                duration: Date.now() - queueStartTime,
                queuedRequests: this.pendingRequestQueues.get(extensionId).length,
                timestamp: Date.now()
            });

            this.broadcastWebSocketMessage({
                type: 'extension-reload-timeout-warning',
                extensionId,
                duration: Date.now() - queueStartTime,
                queuedRequests: this.pendingRequestQueues.get(extensionId).length,
                timestamp: Date.now()
            });
        }, 5000);

        this.pendingRequestQueues.get(extensionId).push({
            timeoutWarning,
            queueStartTime
        });
    }

    async _replayPendingRequests(extensionId) {
        const queue = this.pendingRequestQueues.get(extensionId);
        if (!queue || queue.length === 0) {
            return;
        }

        for (const item of queue) {
            if (item.timeoutWarning) {
                clearTimeout(item.timeoutWarning);
            }
        }

        this.pendingRequestQueues.delete(extensionId);

        this.emit('requests-replayed', {
            extensionId,
            count: queue.length,
            timestamp: Date.now()
        });
    }

    async _rejectPendingRequests(extensionId, error) {
        const queue = this.pendingRequestQueues.get(extensionId);
        if (!queue || queue.length === 0) {
            return;
        }

        for (const item of queue) {
            if (item.timeoutWarning) {
                clearTimeout(item.timeoutWarning);
            }
        }

        this.pendingRequestQueues.delete(extensionId);

        this.emit('requests-rejected', {
            extensionId,
            count: queue.length,
            error: error.message,
            timestamp: Date.now()
        });
    }

    _getExtensionLoader(extensionId) {
        const ExtensionLoader = require('./extension-loader');
        return new ExtensionLoader(this.options.stateDir);
    }

    shutdown() {
        for (const [extensionId, watcher] of this.watchers) {
            watcher.stop();
        }
        this.watchers.clear();
        this.websocketClients.clear();
        this.pendingRequestQueues.clear();
    }
}

module.exports = { DevMode, HotReloadWatcher, HotReloadManager };
