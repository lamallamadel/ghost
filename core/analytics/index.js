const AnalyticsCollector = require('./collector');
const BehaviorAnalytics = require('./behavior-analytics');
const CostAttribution = require('./cost-attribution');
const PerformanceRegression = require('./performance-regression');
const DistributedTracing = require('./distributed-tracing');
const RecommendationEngine = require('./recommendation-engine');
const { EventEmitter } = require('events');

class AnalyticsPlatform extends EventEmitter {
    constructor(options = {}) {
        super();
        this.options = options;

        this.collector = new AnalyticsCollector(options);
        this.behavior = new BehaviorAnalytics(options);
        this.cost = new CostAttribution(options);
        this.performance = new PerformanceRegression(options);
        this.tracing = new DistributedTracing(options);
        this.recommendations = new RecommendationEngine(options);

        this._setupEventForwarding();
    }

    async initialize() {
        await this.behavior.load();
        await this.cost.load();
        await this.performance.load();
        await this.tracing.load();
        await this.recommendations.load();

        this.emit('initialized');
    }

    trackExtensionInvocation(extensionId, method, params = {}) {
        const invocationId = this.collector.recordInvocation(extensionId, method, params);
        this.behavior.recordCommand(method, extensionId, params);

        const traceId = `trace-${invocationId}`;
        const { spanId } = this.tracing.startTrace(traceId, extensionId, method, params);

        return {
            invocationId,
            traceId,
            spanId,
            startTime: Date.now()
        };
    }

    trackExtensionSuccess(trackingContext, result) {
        const duration = Date.now() - trackingContext.startTime;
        
        this.collector.recordSuccess(trackingContext.invocationId, result, duration);
        this.tracing.endSpan(trackingContext.spanId, 'success', { resultSize: JSON.stringify(result).length });
    }

    trackExtensionFailure(trackingContext, error) {
        const duration = Date.now() - trackingContext.startTime;
        
        this.collector.recordFailure(trackingContext.invocationId, error, duration);
        this.tracing.endSpan(trackingContext.spanId, 'error', { error: error.message });
    }

    trackResourceUsage(trackingContext, resources) {
        this.collector.recordResourceUsage(trackingContext.invocationId, resources);
        this.cost.recordResourceConsumption(
            trackingContext.extensionId || this._getExtensionIdFromInvocation(trackingContext.invocationId),
            resources
        );
    }

    trackCrossExtensionCall(parentSpanId, extensionId, operation, params = {}) {
        const parentSpan = this.tracing.spans.get(parentSpanId);
        if (!parentSpan) {
            throw new Error(`Parent span not found: ${parentSpanId}`);
        }

        const span = this.tracing.startSpan(parentSpan.traceId, parentSpanId, extensionId, operation, params);
        return span.spanId;
    }

    trackVersionMetric(extensionId, version, metric) {
        this.performance.recordVersionMetric(extensionId, version, metric);
    }

    async generateDashboard() {
        const allMetrics = this.collector.getAllMetrics();
        const mostUsedCommands = this.behavior.getMostUsedCommands(10);
        const mostUsedExtensions = this.behavior.getMostUsedExtensions(10);
        const commonWorkflows = this.behavior.getCommonWorkflows(2, 10);
        const billingReport = this.cost.getBillingReport();
        const crossExtensionCalls = this.tracing.getCrossExtensionCalls();
        const extensionInteractions = this.tracing.getExtensionInteractions();

        return {
            timestamp: Date.now(),
            timestampISO: new Date().toISOString(),
            metrics: allMetrics,
            behavior: {
                mostUsedCommands,
                mostUsedExtensions,
                commonWorkflows,
                session: this.behavior.getSessionAnalytics()
            },
            cost: billingReport,
            performance: {
                alerts: this.performance.getAlerts()
            },
            tracing: {
                crossExtensionCalls,
                extensionInteractions
            }
        };
    }

    async analyzeRepository(repoPath) {
        const profile = await this.recommendations.analyzeRepository(repoPath);
        return profile;
    }

    async getRecommendations(context = {}) {
        context.behaviorAnalytics = this.behavior;
        const recommendations = await this.recommendations.generateRecommendations(context);
        return recommendations;
    }

    getExtensionMetrics(extensionId) {
        return {
            usage: this.collector.getMetrics(extensionId),
            costs: this.cost.getCostsByExtension(extensionId),
            versions: this.performance.getAllVersionMetrics(extensionId),
            traces: this.tracing.getTracesByExtension(extensionId, 10)
        };
    }

    getExtensionCallGraph(extensionId) {
        const traces = this.tracing.getTracesByExtension(extensionId, 1);
        if (traces.length === 0) {
            return null;
        }

        return this.tracing.visualizeCallGraph(traces[0].traceId);
    }

    compareExtensionVersions(extensionId, version1, version2) {
        return this.performance.compareVersions(extensionId, version1, version2);
    }

    getCostProjection(extensionId, days = 30) {
        return this.cost.getCostProjection(extensionId, days);
    }

    getPredictedNextCommands(currentCommand, limit = 3) {
        return this.behavior.getPredictedNextCommands(currentCommand, limit);
    }

    async persist() {
        await Promise.all([
            this.collector.flush(),
            this.behavior.persist(),
            this.cost.persist(),
            this.performance.persist(),
            this.tracing.persist(),
            this.recommendations.persist()
        ]);

        this.emit('persisted');
    }

    async shutdown() {
        await this.persist();
        this.collector.shutdown();
        this.emit('shutdown');
    }

    _setupEventForwarding() {
        this.collector.on('invocation-started', (event) => {
            this.emit('invocation-started', event);
        });

        this.collector.on('invocation-completed', (event) => {
            this.emit('invocation-completed', event);
        });

        this.collector.on('invocation-failed', (event) => {
            this.emit('invocation-failed', event);
        });

        this.performance.on('regression-detected', (alert) => {
            this.emit('regression-detected', alert);
        });

        this.tracing.on('trace-completed', (event) => {
            this.emit('trace-completed', event);
        });

        this.recommendations.on('recommendations-generated', (event) => {
            this.emit('recommendations-generated', event);
        });
    }

    _getExtensionIdFromInvocation(invocationId) {
        const metric = this.collector.metrics.get(invocationId);
        return metric ? metric.extensionId : null;
    }
}

module.exports = {
    AnalyticsPlatform,
    AnalyticsCollector,
    BehaviorAnalytics,
    CostAttribution,
    PerformanceRegression,
    DistributedTracing,
    RecommendationEngine
};
