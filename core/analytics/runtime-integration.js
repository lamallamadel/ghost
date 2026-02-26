const { AnalyticsPlatform } = require('./index');

class AnalyticsRuntimeIntegration {
    constructor(runtime, options = {}) {
        this.runtime = runtime;
        this.analytics = new AnalyticsPlatform(options);
        this.trackingContexts = new Map();
        this.enabled = options.enabled !== false;
    }

    async initialize() {
        if (!this.enabled) {
            return;
        }

        await this.analytics.initialize();

        this.runtime.on('extension-state-change', (event) => {
            this._handleStateChange(event);
        });

        this.runtime.on('extension-error', (event) => {
            this._handleError(event);
        });

        this.runtime.on('extension-crashed', (event) => {
            this._handleCrash(event);
        });

        this.runtime.on('extension-restarted', (event) => {
            this._handleRestart(event);
        });
    }

    wrapExtensionCall(extensionId, method, originalCall) {
        if (!this.enabled) {
            return originalCall;
        }

        return async (...args) => {
            const trackingContext = this.analytics.trackExtensionInvocation(
                extensionId,
                method,
                this._extractParams(args)
            );

            this.trackingContexts.set(trackingContext.invocationId, {
                ...trackingContext,
                extensionId,
                method
            });

            try {
                const startResources = this._captureResourceSnapshot();
                
                const result = await originalCall(...args);
                
                const endResources = this._captureResourceSnapshot();
                const resourceDelta = this._calculateResourceDelta(startResources, endResources);
                
                this.analytics.trackResourceUsage(trackingContext, resourceDelta);
                this.analytics.trackExtensionSuccess(trackingContext, result);

                this.trackingContexts.delete(trackingContext.invocationId);

                return result;
            } catch (error) {
                this.analytics.trackExtensionFailure(trackingContext, error);
                this.trackingContexts.delete(trackingContext.invocationId);
                throw error;
            }
        };
    }

    trackCrossExtensionCall(fromExtensionId, toExtensionId, operation, params = {}) {
        if (!this.enabled) {
            return null;
        }

        const fromContext = Array.from(this.trackingContexts.values())
            .find(ctx => ctx.extensionId === fromExtensionId && ctx.status !== 'completed');

        if (!fromContext) {
            return null;
        }

        return this.analytics.trackCrossExtensionCall(
            fromContext.spanId,
            toExtensionId,
            operation,
            params
        );
    }

    recordVersionMetric(extensionId, version) {
        if (!this.enabled) {
            return;
        }

        const state = this.runtime.getExtensionState(extensionId);
        if (!state) {
            return;
        }

        const metric = {
            duration: state.uptime,
            cpu: this._getCpuUsage(),
            memory: this._getMemoryUsage(),
            errorRate: state.restartCount > 0 ? (state.restartCount / (state.uptime / 1000)) : 0
        };

        this.analytics.trackVersionMetric(extensionId, version, metric);
    }

    async generateReport() {
        if (!this.enabled) {
            return null;
        }

        return await this.analytics.generateDashboard();
    }

    async getExtensionRecommendations(repoPath) {
        if (!this.enabled) {
            return [];
        }

        await this.analytics.analyzeRepository(repoPath);
        return await this.analytics.getRecommendations();
    }

    getExtensionInsights(extensionId) {
        if (!this.enabled) {
            return null;
        }

        return this.analytics.getExtensionMetrics(extensionId);
    }

    async persist() {
        if (!this.enabled) {
            return;
        }

        await this.analytics.persist();
    }

    async shutdown() {
        if (!this.enabled) {
            return;
        }

        await this.analytics.shutdown();
    }

    _handleStateChange(event) {
        if (event.newState === 'RUNNING' && event.previousState === 'STARTING') {
            const manifest = this._getExtensionManifest(event.extensionId);
            if (manifest && manifest.version) {
                this.recordVersionMetric(event.extensionId, manifest.version);
            }
        }
    }

    _handleError(event) {
        const context = Array.from(this.trackingContexts.values())
            .find(ctx => ctx.extensionId === event.extensionId);

        if (context && event.error) {
            this.analytics.tracing.addSpanLog(
                context.spanId,
                'Extension error',
                { error: event.error }
            );
        }
    }

    _handleCrash(event) {
        const context = Array.from(this.trackingContexts.values())
            .find(ctx => ctx.extensionId === event.extensionId);

        if (context) {
            this.analytics.tracing.addSpanLog(
                context.spanId,
                'Extension crashed',
                event
            );
        }
    }

    _handleRestart(event) {
        const manifest = this._getExtensionManifest(event.extensionId);
        if (manifest && manifest.version) {
            this.recordVersionMetric(event.extensionId, manifest.version);
        }
    }

    _extractParams(args) {
        if (args.length === 0) {
            return {};
        }

        if (args.length === 1 && typeof args[0] === 'object') {
            return args[0];
        }

        return { args };
    }

    _captureResourceSnapshot() {
        const usage = process.cpuUsage();
        const memory = process.memoryUsage();

        return {
            timestamp: Date.now(),
            cpu: usage.user + usage.system,
            memory: memory.heapUsed,
            io: 0,
            network: 0
        };
    }

    _calculateResourceDelta(start, end) {
        return {
            cpu: (end.cpu - start.cpu) / 1000,
            memory: (end.memory - start.memory) / (1024 * 1024),
            io: end.io - start.io,
            network: end.network - start.network,
            duration: end.timestamp - start.timestamp
        };
    }

    _getCpuUsage() {
        const usage = process.cpuUsage();
        return (usage.user + usage.system) / 1000000;
    }

    _getMemoryUsage() {
        const memory = process.memoryUsage();
        return memory.heapUsed / (1024 * 1024);
    }

    _getExtensionManifest(extensionId) {
        const extState = this.runtime.extensions.get(extensionId);
        if (!extState) {
            return null;
        }

        return extState.manifest || null;
    }
}

module.exports = AnalyticsRuntimeIntegration;
