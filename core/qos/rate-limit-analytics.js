const fs = require('fs');
const path = require('path');
const os = require('os');

class RateLimitAnalytics {
    constructor(options = {}) {
        this.dataPath = options.dataPath || 
            path.join(os.homedir(), '.ghost', 'rate-limit-analytics.json');
        
        this.windowSize = options.windowSize || 300000;
        this.maxDataPoints = options.maxDataPoints || 1000;
        
        this.extensionData = new Map();
        
        this._ensureDataDirectory();
        this._loadData();
    }

    recordConsumption(extensionId, tokens, allowed, metadata = {}) {
        if (!this.extensionData.has(extensionId)) {
            this.extensionData.set(extensionId, {
                dataPoints: [],
                totals: {
                    requests: 0,
                    allowed: 0,
                    denied: 0,
                    tokensConsumed: 0
                },
                windows: []
            });
        }

        const extData = this.extensionData.get(extensionId);
        const now = Date.now();

        extData.dataPoints.push({
            timestamp: now,
            tokens: tokens,
            allowed: allowed,
            metadata: metadata
        });

        if (extData.dataPoints.length > this.maxDataPoints) {
            extData.dataPoints.shift();
        }

        extData.totals.requests++;
        if (allowed) {
            extData.totals.allowed++;
            extData.totals.tokensConsumed += tokens;
        } else {
            extData.totals.denied++;
        }

        this._aggregateWindows(extensionId);
        this._persistData();
    }

    _aggregateWindows(extensionId) {
        const extData = this.extensionData.get(extensionId);
        if (!extData) return;

        const now = Date.now();
        const windowStart = now - this.windowSize;
        
        const recentPoints = extData.dataPoints.filter(dp => dp.timestamp >= windowStart);
        
        if (recentPoints.length === 0) return;

        const windowData = {
            start: windowStart,
            end: now,
            requests: recentPoints.length,
            allowed: recentPoints.filter(dp => dp.allowed).length,
            denied: recentPoints.filter(dp => !dp.allowed).length,
            tokensConsumed: recentPoints
                .filter(dp => dp.allowed)
                .reduce((sum, dp) => sum + dp.tokens, 0),
            avgTokensPerRequest: 0,
            requestRate: 0
        };

        windowData.avgTokensPerRequest = windowData.allowed > 0 ? 
            windowData.tokensConsumed / windowData.allowed : 0;
        windowData.requestRate = windowData.requests / (this.windowSize / 1000);

        extData.windows.push(windowData);
        
        if (extData.windows.length > 100) {
            extData.windows.shift();
        }
    }

    predictQuotaExhaustion(extensionId, currentQuota, currentUsage) {
        const extData = this.extensionData.get(extensionId);
        if (!extData || extData.windows.length < 2) {
            return {
                prediction: null,
                confidence: 0,
                reason: 'Insufficient data'
            };
        }

        const recentWindows = extData.windows.slice(-10);
        const avgConsumptionRate = recentWindows.reduce((sum, w) => 
            sum + (w.tokensConsumed / (this.windowSize / 1000)), 0) / recentWindows.length;

        const remaining = currentQuota - currentUsage;
        
        if (avgConsumptionRate <= 0) {
            return {
                prediction: null,
                confidence: 0.9,
                reason: 'No consumption detected',
                avgConsumptionRate: avgConsumptionRate
            };
        }

        const timeToExhaustion = (remaining / avgConsumptionRate) * 1000;
        const exhaustionTime = Date.now() + timeToExhaustion;

        const variance = this._calculateVariance(recentWindows.map(w => 
            w.tokensConsumed / (this.windowSize / 1000)));
        const confidence = Math.max(0, Math.min(1, 1 - (variance / avgConsumptionRate)));

        return {
            prediction: exhaustionTime,
            timeToExhaustion: timeToExhaustion,
            exhaustionTimeFormatted: new Date(exhaustionTime).toISOString(),
            confidence: confidence,
            avgConsumptionRate: avgConsumptionRate,
            remaining: remaining,
            currentUsage: currentUsage,
            currentQuota: currentQuota
        };
    }

    _calculateVariance(values) {
        if (values.length === 0) return 0;
        
        const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
        const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
        const variance = squaredDiffs.reduce((sum, v) => sum + v, 0) / values.length;
        
        return Math.sqrt(variance);
    }

    getConsumptionPattern(extensionId) {
        const extData = this.extensionData.get(extensionId);
        if (!extData || extData.dataPoints.length === 0) {
            return null;
        }

        const now = Date.now();
        const last24h = now - (24 * 60 * 60 * 1000);
        const recentPoints = extData.dataPoints.filter(dp => dp.timestamp >= last24h);

        if (recentPoints.length === 0) {
            return null;
        }

        const hourlyBuckets = new Array(24).fill(0).map(() => ({
            requests: 0,
            allowed: 0,
            denied: 0,
            tokens: 0
        }));

        for (const point of recentPoints) {
            const date = new Date(point.timestamp);
            const hour = date.getHours();
            
            hourlyBuckets[hour].requests++;
            if (point.allowed) {
                hourlyBuckets[hour].allowed++;
                hourlyBuckets[hour].tokens += point.tokens;
            } else {
                hourlyBuckets[hour].denied++;
            }
        }

        const peakHour = hourlyBuckets.reduce((peak, bucket, hour) => 
            bucket.requests > hourlyBuckets[peak].requests ? hour : peak, 0);
        
        const quietHour = hourlyBuckets.reduce((quiet, bucket, hour) => 
            bucket.requests < hourlyBuckets[quiet].requests ? hour : quiet, 0);

        return {
            extensionId: extensionId,
            period: '24h',
            hourlyDistribution: hourlyBuckets,
            peakHour: peakHour,
            peakRequests: hourlyBuckets[peakHour].requests,
            quietHour: quietHour,
            quietRequests: hourlyBuckets[quietHour].requests,
            totalRequests: recentPoints.length,
            avgRequestsPerHour: recentPoints.length / 24
        };
    }

    getPerformanceMetrics(extensionId) {
        const extData = this.extensionData.get(extensionId);
        if (!extData || extData.windows.length === 0) {
            return null;
        }

        const recentWindows = extData.windows.slice(-10);
        
        const avgRequestRate = recentWindows.reduce((sum, w) => 
            sum + w.requestRate, 0) / recentWindows.length;
        
        const avgAllowRate = recentWindows.reduce((sum, w) => 
            sum + (w.allowed / Math.max(1, w.requests)), 0) / recentWindows.length;
        
        const avgTokensPerRequest = recentWindows.reduce((sum, w) => 
            sum + w.avgTokensPerRequest, 0) / recentWindows.length;

        return {
            extensionId: extensionId,
            avgRequestRate: avgRequestRate,
            avgAllowRate: avgAllowRate,
            avgDenyRate: 1 - avgAllowRate,
            avgTokensPerRequest: avgTokensPerRequest,
            totalRequests: extData.totals.requests,
            totalAllowed: extData.totals.allowed,
            totalDenied: extData.totals.denied,
            totalTokensConsumed: extData.totals.tokensConsumed,
            dataPointCount: extData.dataPoints.length,
            windowCount: extData.windows.length
        };
    }

    getAnomalies(extensionId, threshold = 2.0) {
        const extData = this.extensionData.get(extensionId);
        if (!extData || extData.windows.length < 10) {
            return [];
        }

        const windows = extData.windows.slice(-20);
        const requestRates = windows.map(w => w.requestRate);
        const mean = requestRates.reduce((sum, r) => sum + r, 0) / requestRates.length;
        const stdDev = this._calculateVariance(requestRates);

        const anomalies = [];
        
        for (const window of windows) {
            const zScore = Math.abs((window.requestRate - mean) / Math.max(0.01, stdDev));
            
            if (zScore > threshold) {
                anomalies.push({
                    timestamp: window.end,
                    type: window.requestRate > mean ? 'spike' : 'drop',
                    requestRate: window.requestRate,
                    expectedRate: mean,
                    deviation: zScore,
                    requests: window.requests,
                    allowed: window.allowed,
                    denied: window.denied
                });
            }
        }

        return anomalies;
    }

    generateDashboardData(extensionId = null) {
        if (extensionId) {
            return this._generateExtensionDashboard(extensionId);
        }

        const dashboards = {};
        for (const [extId] of this.extensionData) {
            dashboards[extId] = this._generateExtensionDashboard(extId);
        }
        
        return {
            global: this._generateGlobalDashboard(),
            extensions: dashboards
        };
    }

    _generateExtensionDashboard(extensionId) {
        const pattern = this.getConsumptionPattern(extensionId);
        const metrics = this.getPerformanceMetrics(extensionId);
        const anomalies = this.getAnomalies(extensionId);

        return {
            extensionId: extensionId,
            pattern: pattern,
            metrics: metrics,
            anomalies: anomalies,
            lastUpdated: Date.now()
        };
    }

    _generateGlobalDashboard() {
        let totalRequests = 0;
        let totalAllowed = 0;
        let totalDenied = 0;
        let totalTokens = 0;

        for (const [extId, extData] of this.extensionData) {
            totalRequests += extData.totals.requests;
            totalAllowed += extData.totals.allowed;
            totalDenied += extData.totals.denied;
            totalTokens += extData.totals.tokensConsumed;
        }

        const extensions = Array.from(this.extensionData.entries()).map(([extId, extData]) => ({
            extensionId: extId,
            requests: extData.totals.requests,
            allowed: extData.totals.allowed,
            denied: extData.totals.denied,
            tokensConsumed: extData.totals.tokensConsumed,
            allowRate: extData.totals.requests > 0 ? 
                extData.totals.allowed / extData.totals.requests : 0
        }));

        extensions.sort((a, b) => b.requests - a.requests);

        return {
            totalRequests: totalRequests,
            totalAllowed: totalAllowed,
            totalDenied: totalDenied,
            totalTokensConsumed: totalTokens,
            globalAllowRate: totalRequests > 0 ? totalAllowed / totalRequests : 0,
            extensionCount: this.extensionData.size,
            topExtensions: extensions.slice(0, 10),
            lastUpdated: Date.now()
        };
    }

    reset(extensionId) {
        if (extensionId) {
            this.extensionData.delete(extensionId);
        } else {
            this.extensionData.clear();
        }
        this._persistData();
    }

    _ensureDataDirectory() {
        const dir = path.dirname(this.dataPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    }

    _loadData() {
        try {
            if (fs.existsSync(this.dataPath)) {
                const data = fs.readFileSync(this.dataPath, 'utf8');
                const parsed = JSON.parse(data);
                
                for (const [extId, extData] of Object.entries(parsed)) {
                    this.extensionData.set(extId, extData);
                }
            }
        } catch (error) {
            console.error('[RateLimitAnalytics] Failed to load data:', error.message);
        }
    }

    _persistData() {
        try {
            const data = {};
            for (const [extId, extData] of this.extensionData.entries()) {
                data[extId] = extData;
            }
            
            fs.writeFileSync(this.dataPath, JSON.stringify(data, null, 2), 'utf8');
        } catch (error) {
            console.error('[RateLimitAnalytics] Failed to persist data:', error.message);
        }
    }
}

module.exports = {
    RateLimitAnalytics
};
