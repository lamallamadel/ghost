const http = require('http');
const { AnalyticsPlatform } = require('./index');

class AnalyticsAPIServer {
    constructor(options = {}) {
        this.options = {
            port: options.port || 9876,
            host: options.host || 'localhost',
            ...options
        };

        this.analytics = new AnalyticsPlatform(options.analytics || {});
        this.server = null;
    }

    async start() {
        await this.analytics.initialize();

        this.server = http.createServer((req, res) => {
            this._handleRequest(req, res);
        });

        return new Promise((resolve, reject) => {
            this.server.listen(this.options.port, this.options.host, (err) => {
                if (err) {
                    reject(err);
                } else {
                    console.log(`[AnalyticsAPI] Server listening on http://${this.options.host}:${this.options.port}`);
                    resolve();
                }
            });
        });
    }

    async stop() {
        await this.analytics.shutdown();
        
        if (this.server) {
            return new Promise((resolve) => {
                this.server.close(() => {
                    console.log('[AnalyticsAPI] Server stopped');
                    resolve();
                });
            });
        }
    }

    async _handleRequest(req, res) {
        const url = new URL(req.url, `http://${req.headers.host}`);
        
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        res.setHeader('Content-Type', 'application/json');

        if (req.method === 'OPTIONS') {
            res.writeHead(200);
            res.end();
            return;
        }

        try {
            if (url.pathname === '/api/analytics/dashboard') {
                await this._handleDashboard(req, res, url);
            } else if (url.pathname.startsWith('/api/analytics/performance/')) {
                await this._handlePerformanceHistory(req, res, url);
            } else if (url.pathname === '/api/analytics/extensions') {
                await this._handleExtensionsList(req, res);
            } else if (url.pathname === '/api/analytics/metrics') {
                await this._handleMetrics(req, res);
            } else if (url.pathname === '/api/analytics/recommendations') {
                await this._handleRecommendations(req, res);
            } else if (url.pathname === '/api/analytics/recommendations/analyze') {
                await this._handleRecommendationsAnalyze(req, res);
            } else if (url.pathname === '/api/analytics/recommendations/feedback') {
                await this._handleRecommendationsFeedback(req, res);
            } else if (url.pathname === '/api/analytics/recommendations/conversion-rates') {
                await this._handleRecommendationsConversionRates(req, res);
            } else if (url.pathname.startsWith('/api/analytics/extension/') && url.pathname.endsWith('/callgraph')) {
                await this._handleExtensionCallGraph(req, res, url);
            } else if (url.pathname.startsWith('/api/analytics/extension/')) {
                await this._handleExtensionDetail(req, res, url);
            } else {
                res.writeHead(404);
                res.end(JSON.stringify({ error: 'Not found' }));
            }
        } catch (error) {
            console.error('[AnalyticsAPI] Error handling request:', error);
            res.writeHead(500);
            res.end(JSON.stringify({ error: error.message }));
        }
    }

    async _handleDashboard(req, res, url) {
        const timeRange = url.searchParams.get('timeRange') || '6h';
        
        const allMetrics = this.analytics.collector.getAllMetrics();
        const costs = [];
        const alerts = this.analytics.performance.getAlerts();
        
        for (const [extensionId, metrics] of Object.entries(allMetrics)) {
            const costData = this.analytics.cost.getCostsByExtension(extensionId);
            if (costData) {
                costs.push({
                    extensionId,
                    totalCost: costData.total || 0,
                    resources: costData.breakdown || {
                        cpu: 0,
                        memory: 0,
                        io: 0,
                        network: 0,
                        storage: 0
                    },
                    billingPeriod: costData.period || 'current'
                });
            }
        }

        const crossExtensionCalls = this.analytics.tracing.getCrossExtensionCalls();
        const extensionInteractions = this.analytics.tracing.getExtensionInteractions();
        
        const callGraph = {
            nodes: [],
            edges: []
        };

        if (crossExtensionCalls && crossExtensionCalls.length > 0) {
            const nodeMap = new Map();
            
            crossExtensionCalls.forEach(call => {
                const fromKey = `${call.from.extensionId}:${call.from.operation}`;
                const toKey = `${call.to.extensionId}:${call.to.operation}`;
                
                if (!nodeMap.has(fromKey)) {
                    nodeMap.set(fromKey, {
                        extensionId: call.from.extensionId,
                        operation: call.from.operation,
                        callCount: 0,
                        totalDuration: 0,
                        avgDuration: 0
                    });
                }
                
                if (!nodeMap.has(toKey)) {
                    nodeMap.set(toKey, {
                        extensionId: call.to.extensionId,
                        operation: call.to.operation,
                        callCount: 0,
                        totalDuration: 0,
                        avgDuration: 0
                    });
                }
                
                const fromNode = nodeMap.get(fromKey);
                const toNode = nodeMap.get(toKey);
                
                fromNode.callCount += call.count;
                toNode.callCount += call.count;
                fromNode.totalDuration += call.totalDuration || 0;
                toNode.totalDuration += call.totalDuration || 0;
                
                callGraph.edges.push({
                    from: fromKey,
                    to: toKey,
                    callCount: call.count
                });
            });
            
            nodeMap.forEach((node, key) => {
                node.avgDuration = node.callCount > 0 ? node.totalDuration / node.callCount : 0;
                callGraph.nodes.push(node);
            });
        }

        const formattedAlerts = alerts.map(alert => ({
            id: alert.id || `alert-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            extensionId: alert.extensionId,
            version: alert.version || '1.0.0',
            severity: alert.severity || 'medium',
            metric: alert.metric,
            baselineValue: alert.baselineValue,
            currentValue: alert.currentValue,
            percentChange: alert.percentChange,
            threshold: alert.threshold,
            timestamp: alert.timestamp || Date.now()
        }));

        const dashboardData = {
            metrics: allMetrics,
            costs,
            alerts: formattedAlerts,
            callGraph,
            timestamp: Date.now()
        };

        res.writeHead(200);
        res.end(JSON.stringify(dashboardData));
    }

    async _handlePerformanceHistory(req, res, url) {
        const extensionId = url.pathname.split('/').pop();
        const timeRange = url.searchParams.get('timeRange') || '6h';
        
        const history = [];
        const now = Date.now();
        const timeRangeMs = this._parseTimeRange(timeRange);
        
        const invocations = Array.from(this.analytics.collector.metrics.values())
            .filter(m => m.extensionId === extensionId && m.timestamp > (now - timeRangeMs))
            .sort((a, b) => a.timestamp - b.timestamp);

        const bucketSize = Math.max(1, Math.floor(invocations.length / 50));
        
        for (let i = 0; i < invocations.length; i += bucketSize) {
            const bucket = invocations.slice(i, i + bucketSize);
            const durations = bucket
                .filter(inv => inv.duration !== undefined)
                .map(inv => inv.duration)
                .sort((a, b) => a - b);
            
            if (durations.length > 0) {
                history.push({
                    timestamp: bucket[0].timestamp,
                    p50: durations[Math.floor(durations.length * 0.5)] || 0,
                    p95: durations[Math.floor(durations.length * 0.95)] || 0,
                    p99: durations[Math.floor(durations.length * 0.99)] || 0
                });
            }
        }

        res.writeHead(200);
        res.end(JSON.stringify({ history }));
    }

    async _handleExtensionsList(req, res) {
        const allMetrics = this.analytics.collector.getAllMetrics();
        const extensions = Object.keys(allMetrics).map(extensionId => ({
            id: extensionId,
            metrics: allMetrics[extensionId]
        }));

        res.writeHead(200);
        res.end(JSON.stringify({ extensions }));
    }

    async _handleExtensionDetail(req, res, url) {
        const extensionId = url.pathname.split('/').pop();
        const metrics = this.analytics.getExtensionMetrics(extensionId);

        res.writeHead(200);
        res.end(JSON.stringify(metrics));
    }

    async _handleMetrics(req, res) {
        const metrics = this.analytics.collector.getAllMetrics();
        res.writeHead(200);
        res.end(JSON.stringify({ metrics, timestamp: Date.now() }));
    }

    async _handleExtensionCallGraph(req, res, url) {
        const parts = url.pathname.split('/');
        const extensionId = parts[parts.length - 2];
        const callGraph = this.analytics.getExtensionCallGraph(extensionId);
        res.writeHead(200);
        res.end(JSON.stringify({ extensionId, callGraph, timestamp: Date.now() }));
    }

    async _handleRecommendations(req, res) {
        const recommendations = await this.analytics.getRecommendations();
        res.writeHead(200);
        res.end(JSON.stringify({ recommendations, timestamp: Date.now() }));
    }

    async _handleRecommendationsAnalyze(req, res) {
        if (req.method !== 'POST') {
            res.writeHead(405);
            res.end(JSON.stringify({ error: 'Method not allowed' }));
            return;
        }
        const body = await this._readBody(req);
        const { repoPath } = JSON.parse(body);
        const profile = await this.analytics.analyzeRepository(repoPath);
        const recommendations = await this.analytics.getRecommendations();
        res.writeHead(200);
        res.end(JSON.stringify({ profile, recommendations: recommendations.slice(0, 5), timestamp: Date.now() }));
    }

    async _handleRecommendationsFeedback(req, res) {
        if (req.method !== 'POST') {
            res.writeHead(405);
            res.end(JSON.stringify({ error: 'Method not allowed' }));
            return;
        }
        const body = await this._readBody(req);
        const { extensionId, feedback } = JSON.parse(body);
        this.analytics.recommendations.recordUserFeedback(extensionId, feedback);
        await this.analytics.recommendations.persist();
        res.writeHead(200);
        res.end(JSON.stringify({ success: true, timestamp: Date.now() }));
    }

    async _handleRecommendationsConversionRates(req, res) {
        const rates = this.analytics.recommendations.getAllConversionRates();
        res.writeHead(200);
        res.end(JSON.stringify({ rates, timestamp: Date.now() }));
    }

    _readBody(req) {
        return new Promise((resolve, reject) => {
            let data = '';
            req.on('data', (chunk) => { data += chunk; });
            req.on('end', () => resolve(data));
            req.on('error', reject);
        });
    }

    _parseTimeRange(timeRange) {
        const ranges = {
            '1h': 60 * 60 * 1000,
            '6h': 6 * 60 * 60 * 1000,
            '24h': 24 * 60 * 60 * 1000,
            '7d': 7 * 24 * 60 * 60 * 1000
        };
        return ranges[timeRange] || ranges['6h'];
    }
}

module.exports = AnalyticsAPIServer;
