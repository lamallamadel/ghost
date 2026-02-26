const fs = require('fs');
const path = require('path');
const os = require('os');

const FORECAST_DATA_DIR = path.join(os.homedir(), '.ghost', 'capacity');
const FORECAST_CONFIG = path.join(os.homedir(), '.ghost', 'config', 'capacity-config.json');

class TimeSeriesAnalyzer {
    constructor() {
        this.data = [];
        this.maxDataPoints = 10000;
    }

    addDataPoint(timestamp, value, metadata = {}) {
        this.data.push({ timestamp, value, metadata });
        
        if (this.data.length > this.maxDataPoints) {
            this.data.shift();
        }
    }

    calculateTrend(windowSize = 100) {
        if (this.data.length < windowSize) {
            return { slope: 0, intercept: 0, r2: 0 };
        }

        const recentData = this.data.slice(-windowSize);
        const n = recentData.length;
        
        let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
        
        for (let i = 0; i < n; i++) {
            const x = i;
            const y = recentData[i].value;
            sumX += x;
            sumY += y;
            sumXY += x * y;
            sumX2 += x * x;
        }

        const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
        const intercept = (sumY - slope * sumX) / n;

        const yMean = sumY / n;
        let ssRes = 0, ssTot = 0;
        
        for (let i = 0; i < n; i++) {
            const y = recentData[i].value;
            const yPred = slope * i + intercept;
            ssRes += Math.pow(y - yPred, 2);
            ssTot += Math.pow(y - yMean, 2);
        }

        const r2 = ssTot > 0 ? 1 - (ssRes / ssTot) : 0;

        return { slope, intercept, r2 };
    }

    forecastLinear(stepsAhead) {
        const trend = this.calculateTrend();
        const lastIndex = this.data.length - 1;
        const forecast = [];

        for (let i = 1; i <= stepsAhead; i++) {
            const predictedValue = trend.slope * (lastIndex + i) + trend.intercept;
            forecast.push({
                step: i,
                value: Math.max(0, predictedValue),
                confidence: trend.r2
            });
        }

        return forecast;
    }

    calculateMovingAverage(windowSize = 10) {
        if (this.data.length < windowSize) {
            return [];
        }

        const ma = [];
        for (let i = windowSize - 1; i < this.data.length; i++) {
            const window = this.data.slice(i - windowSize + 1, i + 1);
            const avg = window.reduce((sum, d) => sum + d.value, 0) / windowSize;
            ma.push({
                timestamp: this.data[i].timestamp,
                value: avg
            });
        }

        return ma;
    }

    detectSeasonality(period = 24) {
        if (this.data.length < period * 2) {
            return { hasSeason: false, strength: 0 };
        }

        const values = this.data.map(d => d.value);
        const n = values.length;
        let seasonalSum = 0;

        for (let i = 0; i < n - period; i++) {
            const diff = Math.abs(values[i] - values[i + period]);
            seasonalSum += diff;
        }

        const avgDiff = seasonalSum / (n - period);
        const overallVariance = this._calculateVariance(values);
        
        const strength = overallVariance > 0 ? 1 - (avgDiff / Math.sqrt(overallVariance)) : 0;
        
        return {
            hasSeason: strength > 0.3,
            strength,
            period
        };
    }

    _calculateVariance(values) {
        const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
        const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
        return squaredDiffs.reduce((sum, v) => sum + v, 0) / values.length;
    }
}

class CapacityForecasting {
    constructor(telemetry, options = {}) {
        this.telemetry = telemetry;
        this.enabled = options.enabled !== false;
        
        this.analyzers = {
            requests: new TimeSeriesAnalyzer(),
            latency: new TimeSeriesAnalyzer(),
            memory: new TimeSeriesAnalyzer(),
            cpu: new TimeSeriesAnalyzer(),
            errorRate: new TimeSeriesAnalyzer()
        };

        this.thresholds = this._loadThresholds();
        this.forecasts = new Map();
        this.alerts = [];
        
        this._ensureDirectory();
        this._startCollectionInterval();
    }

    _ensureDirectory() {
        try {
            if (!fs.existsSync(FORECAST_DATA_DIR)) {
                fs.mkdirSync(FORECAST_DATA_DIR, { recursive: true });
            }
        } catch (error) {
            console.error('[CapacityForecasting] Failed to create directory:', error.message);
        }
    }

    _loadThresholds() {
        try {
            if (fs.existsSync(FORECAST_CONFIG)) {
                const config = JSON.parse(fs.readFileSync(FORECAST_CONFIG, 'utf8'));
                return config.thresholds || this._defaultThresholds();
            }
        } catch (error) {
            console.error('[CapacityForecasting] Failed to load config:', error.message);
        }
        return this._defaultThresholds();
    }

    _defaultThresholds() {
        return {
            requests: {
                warning: 1000,
                critical: 5000,
                unit: 'requests/min'
            },
            latency: {
                warning: 200,
                critical: 500,
                unit: 'ms'
            },
            memory: {
                warning: 80,
                critical: 95,
                unit: '%'
            },
            cpu: {
                warning: 70,
                critical: 90,
                unit: '%'
            },
            errorRate: {
                warning: 1,
                critical: 5,
                unit: '%'
            }
        };
    }

    _startCollectionInterval() {
        setInterval(() => {
            this._collectMetrics();
        }, 60000);
    }

    _collectMetrics() {
        if (!this.enabled) return;

        const now = Date.now();
        const metrics = this.telemetry?.metrics?.getMetrics() || {};

        let totalRequests = 0;
        let totalLatency = 0;
        let latencyCount = 0;
        let totalErrors = 0;

        for (const extMetrics of Object.values(metrics.requests || {})) {
            totalRequests += Object.values(extMetrics).reduce((sum, count) => sum + count, 0);
        }

        for (const extLatencies of Object.values(metrics.latencies || {})) {
            for (const percentiles of Object.values(extLatencies)) {
                if (percentiles.p95) {
                    totalLatency += percentiles.p95;
                    latencyCount++;
                }
            }
        }

        for (const extFailures of Object.values(metrics.validationFailures || {})) {
            totalErrors += Object.values(extFailures).reduce((sum, count) => sum + count, 0);
        }

        const avgLatency = latencyCount > 0 ? totalLatency / latencyCount : 0;
        const errorRate = totalRequests > 0 ? (totalErrors / totalRequests) * 100 : 0;

        this.analyzers.requests.addDataPoint(now, totalRequests);
        this.analyzers.latency.addDataPoint(now, avgLatency);
        this.analyzers.errorRate.addDataPoint(now, errorRate);

        try {
            const memUsage = process.memoryUsage();
            const memPercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;
            this.analyzers.memory.addDataPoint(now, memPercent);
        } catch (error) {
        }

        this._checkThresholds();
        this._generateForecasts();
    }

    _checkThresholds() {
        const now = Date.now();
        
        for (const [metric, analyzer] of Object.entries(this.analyzers)) {
            if (analyzer.data.length === 0) continue;

            const latest = analyzer.data[analyzer.data.length - 1];
            const threshold = this.thresholds[metric];
            
            if (!threshold) continue;

            if (latest.value >= threshold.critical) {
                this._createAlert(metric, 'critical', 
                    `${metric} at ${latest.value.toFixed(2)} ${threshold.unit}, exceeds critical threshold ${threshold.critical}`,
                    { current: latest.value, threshold: threshold.critical }
                );
            } else if (latest.value >= threshold.warning) {
                this._createAlert(metric, 'warning',
                    `${metric} at ${latest.value.toFixed(2)} ${threshold.unit}, exceeds warning threshold ${threshold.warning}`,
                    { current: latest.value, threshold: threshold.warning }
                );
            }
        }
    }

    _generateForecasts() {
        const forecastHorizon = 24;
        
        for (const [metric, analyzer] of Object.entries(this.analyzers)) {
            if (analyzer.data.length < 100) continue;

            const forecast = analyzer.forecastLinear(forecastHorizon);
            const trend = analyzer.calculateTrend();
            const seasonality = analyzer.detectSeasonality();
            
            this.forecasts.set(metric, {
                metric,
                generated: Date.now(),
                horizon: forecastHorizon,
                trend,
                seasonality,
                predictions: forecast,
                exhaustionForecast: this._predictExhaustion(metric, forecast)
            });
        }
    }

    _predictExhaustion(metric, forecast) {
        const threshold = this.thresholds[metric];
        if (!threshold) return null;

        for (const pred of forecast) {
            if (pred.value >= threshold.critical) {
                const minutesUntilExhaustion = pred.step;
                return {
                    willExhaust: true,
                    minutesUntilExhaustion,
                    exhaustionTime: new Date(Date.now() + minutesUntilExhaustion * 60000).toISOString(),
                    projectedValue: pred.value,
                    confidence: pred.confidence
                };
            }
        }

        return {
            willExhaust: false,
            minutesUntilExhaustion: null,
            exhaustionTime: null
        };
    }

    _createAlert(metric, severity, message, metadata = {}) {
        const recentWindow = Date.now() - 300000;
        const hasRecent = this.alerts.some(a => 
            a.metric === metric && 
            a.severity === severity &&
            a.timestamp > recentWindow
        );

        if (hasRecent) return;

        const alert = {
            id: `${metric}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            metric,
            severity,
            message,
            metadata,
            timestamp: Date.now()
        };

        this.alerts.push(alert);
        
        if (this.alerts.length > 100) {
            this.alerts = this.alerts.slice(-100);
        }

        if (this.telemetry && this.telemetry.logger) {
            this.telemetry.logger.warn(`[Capacity Alert] ${message}`, {
                metric,
                severity,
                ...metadata
            });
        }
    }

    getForecasts() {
        return Array.from(this.forecasts.values());
    }

    getForecast(metric) {
        return this.forecasts.get(metric);
    }

    getExhaustionWarnings() {
        const warnings = [];
        
        for (const [metric, forecast] of this.forecasts.entries()) {
            if (forecast.exhaustionForecast?.willExhaust) {
                warnings.push({
                    metric,
                    ...forecast.exhaustionForecast,
                    threshold: this.thresholds[metric]?.critical,
                    currentValue: this.analyzers[metric].data.slice(-1)[0]?.value
                });
            }
        }

        return warnings.sort((a, b) => a.minutesUntilExhaustion - b.minutesUntilExhaustion);
    }

    getCapacityReport() {
        const warnings = this.getExhaustionWarnings();
        const forecasts = this.getForecasts();
        
        const report = {
            timestamp: Date.now(),
            summary: {
                totalMetrics: forecasts.length,
                exhaustionWarnings: warnings.length,
                criticalAlerts: this.alerts.filter(a => a.severity === 'critical').length,
                warningAlerts: this.alerts.filter(a => a.severity === 'warning').length
            },
            exhaustionWarnings: warnings,
            forecasts: forecasts.map(f => ({
                metric: f.metric,
                trend: {
                    direction: f.trend.slope > 0 ? 'increasing' : 'decreasing',
                    slope: f.trend.slope.toFixed(4),
                    confidence: f.trend.r2.toFixed(3)
                },
                seasonality: f.seasonality,
                exhaustion: f.exhaustionForecast,
                predictions: f.predictions.slice(0, 6)
            })),
            alerts: this.alerts.slice(-20),
            recommendations: this._generateRecommendations(warnings, forecasts)
        };

        return report;
    }

    _generateRecommendations(warnings, forecasts) {
        const recommendations = [];

        for (const warning of warnings) {
            if (warning.minutesUntilExhaustion < 60) {
                recommendations.push({
                    priority: 'critical',
                    metric: warning.metric,
                    action: `Immediate action required: ${warning.metric} will reach capacity in ${warning.minutesUntilExhaustion} minutes`,
                    suggestions: [
                        'Scale up resources immediately',
                        'Enable rate limiting',
                        'Activate circuit breakers',
                        'Alert operations team'
                    ]
                });
            } else if (warning.minutesUntilExhaustion < 1440) {
                recommendations.push({
                    priority: 'warning',
                    metric: warning.metric,
                    action: `Plan capacity increase: ${warning.metric} will reach capacity in ${(warning.minutesUntilExhaustion / 60).toFixed(1)} hours`,
                    suggestions: [
                        'Schedule resource scaling',
                        'Review rate limit policies',
                        'Optimize resource usage',
                        'Monitor closely'
                    ]
                });
            }
        }

        for (const forecast of forecasts) {
            if (forecast.trend.slope > 0 && forecast.trend.r2 > 0.7) {
                const growthRate = ((forecast.trend.slope * 1440) / 
                    (this.analyzers[forecast.metric].data.slice(-1)[0]?.value || 1)) * 100;
                
                if (growthRate > 20) {
                    recommendations.push({
                        priority: 'info',
                        metric: forecast.metric,
                        action: `High growth detected: ${forecast.metric} growing at ${growthRate.toFixed(1)}% per day`,
                        suggestions: [
                            'Plan for capacity expansion',
                            'Review architecture scalability',
                            'Implement caching strategies',
                            'Consider load distribution'
                        ]
                    });
                }
            }
        }

        return recommendations;
    }

    exportTimeSeriesData(metric, startTime, endTime) {
        const analyzer = this.analyzers[metric];
        if (!analyzer) {
            throw new Error(`Unknown metric: ${metric}`);
        }

        const data = analyzer.data.filter(d => 
            d.timestamp >= startTime && d.timestamp <= endTime
        );

        return {
            metric,
            period: {
                start: new Date(startTime).toISOString(),
                end: new Date(endTime).toISOString()
            },
            dataPoints: data.length,
            data: data.map(d => ({
                timestamp: new Date(d.timestamp).toISOString(),
                value: d.value,
                metadata: d.metadata
            }))
        };
    }

    persistForecasts() {
        try {
            const reportFile = path.join(FORECAST_DATA_DIR, `forecast-${Date.now()}.json`);
            const report = this.getCapacityReport();
            fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
        } catch (error) {
            console.error('[CapacityForecasting] Failed to persist forecasts:', error.message);
        }
    }
}

module.exports = {
    CapacityForecasting,
    TimeSeriesAnalyzer
};
