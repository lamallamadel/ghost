const { EventEmitter } = require('events');
const fs = require('fs');
const path = require('path');

class PerformanceRegression extends EventEmitter {
    constructor(options = {}) {
        super();
        this.options = {
            persistenceDir: options.persistenceDir || path.join(require('os').homedir(), '.ghost', 'analytics'),
            thresholds: options.thresholds || this._getDefaultThresholds(),
            comparisonWindow: options.comparisonWindow || 100,
            ...options
        };

        this.versionMetrics = new Map();
        this.alerts = [];
        this.baseline = new Map();
    }

    recordVersionMetric(extensionId, version, metric) {
        const versionKey = `${extensionId}@${version}`;
        
        if (!this.versionMetrics.has(versionKey)) {
            this.versionMetrics.set(versionKey, {
                extensionId,
                version,
                metrics: [],
                aggregated: null
            });
        }

        const versionData = this.versionMetrics.get(versionKey);
        versionData.metrics.push({
            timestamp: Date.now(),
            ...metric
        });

        if (versionData.metrics.length > this.options.comparisonWindow) {
            versionData.metrics.shift();
        }

        versionData.aggregated = this._aggregateMetrics(versionData.metrics);

        this._detectRegression(extensionId, version);
        this.emit('metric-recorded', { extensionId, version, metric });
    }

    compareVersions(extensionId, version1, version2) {
        const v1Key = `${extensionId}@${version1}`;
        const v2Key = `${extensionId}@${version2}`;

        const v1Data = this.versionMetrics.get(v1Key);
        const v2Data = this.versionMetrics.get(v2Key);

        if (!v1Data || !v2Data) {
            return null;
        }

        const comparison = {
            extensionId,
            version1,
            version2,
            metrics: {}
        };

        const metricKeys = ['duration', 'cpu', 'memory', 'errorRate'];

        for (const key of metricKeys) {
            const v1Value = v1Data.aggregated[key];
            const v2Value = v2Data.aggregated[key];

            if (v1Value !== undefined && v2Value !== undefined) {
                const diff = v2Value - v1Value;
                const percentChange = v1Value > 0 ? (diff / v1Value) * 100 : 0;

                comparison.metrics[key] = {
                    version1: v1Value,
                    version2: v2Value,
                    difference: diff,
                    percentChange: Math.round(percentChange * 100) / 100,
                    regression: this._isRegression(key, percentChange)
                };
            }
        }

        return comparison;
    }

    getLatestVersionMetrics(extensionId) {
        const versions = Array.from(this.versionMetrics.entries())
            .filter(([key]) => key.startsWith(`${extensionId}@`))
            .map(([key, data]) => ({
                version: data.version,
                ...data.aggregated
            }))
            .sort((a, b) => this._compareVersions(b.version, a.version));

        return versions[0] || null;
    }

    getAllVersionMetrics(extensionId) {
        const versions = Array.from(this.versionMetrics.entries())
            .filter(([key]) => key.startsWith(`${extensionId}@`))
            .map(([key, data]) => ({
                version: data.version,
                sampleSize: data.metrics.length,
                ...data.aggregated
            }))
            .sort((a, b) => this._compareVersions(b.version, a.version));

        return versions;
    }

    setBaseline(extensionId, version) {
        const versionKey = `${extensionId}@${version}`;
        const versionData = this.versionMetrics.get(versionKey);

        if (!versionData || !versionData.aggregated) {
            throw new Error(`No metrics found for ${extensionId}@${version}`);
        }

        this.baseline.set(extensionId, {
            version,
            metrics: versionData.aggregated,
            setAt: Date.now()
        });

        this.emit('baseline-set', { extensionId, version });
    }

    getBaseline(extensionId) {
        return this.baseline.get(extensionId) || null;
    }

    getAlerts(extensionId = null) {
        if (extensionId) {
            return this.alerts.filter(a => a.extensionId === extensionId);
        }
        return this.alerts;
    }

    clearAlerts(extensionId = null) {
        if (extensionId) {
            this.alerts = this.alerts.filter(a => a.extensionId !== extensionId);
        } else {
            this.alerts = [];
        }
    }

    getTrend(extensionId, metric, versions = 5) {
        const allVersions = this.getAllVersionMetrics(extensionId);
        const recentVersions = allVersions.slice(0, versions);

        if (recentVersions.length < 2) {
            return null;
        }

        const values = recentVersions.map(v => v[metric]).filter(v => v !== undefined);
        
        if (values.length < 2) {
            return null;
        }

        const trend = this._calculateTrend(values);

        return {
            extensionId,
            metric,
            versions: recentVersions.map(v => v.version),
            values,
            trend: trend.direction,
            slope: trend.slope,
            confidence: trend.confidence
        };
    }

    async persist() {
        const filepath = path.join(this.options.persistenceDir, 'performance-regression.json');
        
        const data = {
            timestamp: Date.now(),
            versionMetrics: Array.from(this.versionMetrics.entries()),
            baseline: Array.from(this.baseline.entries()),
            alerts: this.alerts
        };

        try {
            fs.writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf8');
            this.emit('persisted', { filepath });
        } catch (error) {
            this.emit('persist-error', { error: error.message });
            console.error(`[PerformanceRegression] Failed to persist: ${error.message}`);
        }
    }

    async load() {
        const filepath = path.join(this.options.persistenceDir, 'performance-regression.json');
        
        if (!fs.existsSync(filepath)) {
            return;
        }

        try {
            const content = fs.readFileSync(filepath, 'utf8');
            const data = JSON.parse(content);

            this.versionMetrics = new Map(data.versionMetrics);
            this.baseline = new Map(data.baseline);
            this.alerts = data.alerts || [];

            this.emit('loaded', { filepath });
        } catch (error) {
            this.emit('load-error', { error: error.message });
            console.error(`[PerformanceRegression] Failed to load: ${error.message}`);
        }
    }

    _detectRegression(extensionId, version) {
        const baseline = this.baseline.get(extensionId);
        if (!baseline) {
            return;
        }

        const currentVersion = this.getLatestVersionMetrics(extensionId);
        if (!currentVersion) {
            return;
        }

        const regressions = [];
        const thresholds = this.options.thresholds;

        if (currentVersion.duration > baseline.metrics.duration * (1 + thresholds.duration)) {
            regressions.push({
                metric: 'duration',
                baseline: baseline.metrics.duration,
                current: currentVersion.duration,
                threshold: thresholds.duration,
                exceeded: ((currentVersion.duration / baseline.metrics.duration) - 1) * 100
            });
        }

        if (currentVersion.cpu > baseline.metrics.cpu * (1 + thresholds.cpu)) {
            regressions.push({
                metric: 'cpu',
                baseline: baseline.metrics.cpu,
                current: currentVersion.cpu,
                threshold: thresholds.cpu,
                exceeded: ((currentVersion.cpu / baseline.metrics.cpu) - 1) * 100
            });
        }

        if (currentVersion.memory > baseline.metrics.memory * (1 + thresholds.memory)) {
            regressions.push({
                metric: 'memory',
                baseline: baseline.metrics.memory,
                current: currentVersion.memory,
                threshold: thresholds.memory,
                exceeded: ((currentVersion.memory / baseline.metrics.memory) - 1) * 100
            });
        }

        if (currentVersion.errorRate > baseline.metrics.errorRate * (1 + thresholds.errorRate)) {
            regressions.push({
                metric: 'errorRate',
                baseline: baseline.metrics.errorRate,
                current: currentVersion.errorRate,
                threshold: thresholds.errorRate,
                exceeded: ((currentVersion.errorRate / baseline.metrics.errorRate) - 1) * 100
            });
        }

        if (regressions.length > 0) {
            const alert = {
                alertId: this._generateAlertId(),
                timestamp: Date.now(),
                timestampISO: new Date().toISOString(),
                extensionId,
                version,
                baselineVersion: baseline.version,
                severity: this._calculateSeverity(regressions),
                regressions
            };

            this.alerts.push(alert);

            if (this.alerts.length > 1000) {
                this.alerts.shift();
            }

            this.emit('regression-detected', alert);
        }
    }

    _aggregateMetrics(metrics) {
        if (metrics.length === 0) {
            return {
                sampleSize: 0,
                duration: 0,
                cpu: 0,
                memory: 0,
                errorRate: 0
            };
        }

        const durations = metrics.map(m => m.duration || 0).filter(d => d > 0);
        const cpuValues = metrics.map(m => m.cpu || 0).filter(c => c > 0);
        const memoryValues = metrics.map(m => m.memory || 0).filter(m => m > 0);
        const errors = metrics.filter(m => m.error).length;

        return {
            sampleSize: metrics.length,
            duration: this._calculateP95(durations),
            cpu: this._calculateAverage(cpuValues),
            memory: this._calculateP95(memoryValues),
            errorRate: (errors / metrics.length) * 100
        };
    }

    _calculateP95(values) {
        if (values.length === 0) return 0;
        const sorted = [...values].sort((a, b) => a - b);
        const index = Math.ceil(0.95 * sorted.length) - 1;
        return sorted[index] || 0;
    }

    _calculateAverage(values) {
        if (values.length === 0) return 0;
        return values.reduce((sum, v) => sum + v, 0) / values.length;
    }

    _isRegression(metric, percentChange) {
        const threshold = this.options.thresholds[metric];
        if (!threshold) return false;

        if (metric === 'errorRate') {
            return percentChange > threshold * 100;
        }

        return percentChange > threshold * 100;
    }

    _calculateSeverity(regressions) {
        const maxExceeded = Math.max(...regressions.map(r => r.exceeded));
        
        if (maxExceeded > 100) return 'critical';
        if (maxExceeded > 50) return 'high';
        if (maxExceeded > 20) return 'medium';
        return 'low';
    }

    _calculateTrend(values) {
        const n = values.length;
        const x = Array.from({ length: n }, (_, i) => i);
        const xMean = x.reduce((sum, val) => sum + val, 0) / n;
        const yMean = values.reduce((sum, val) => sum + val, 0) / n;

        let numerator = 0;
        let denominator = 0;

        for (let i = 0; i < n; i++) {
            numerator += (x[i] - xMean) * (values[i] - yMean);
            denominator += Math.pow(x[i] - xMean, 2);
        }

        const slope = denominator !== 0 ? numerator / denominator : 0;
        
        let direction = 'stable';
        if (Math.abs(slope) > 0.1) {
            direction = slope > 0 ? 'increasing' : 'decreasing';
        }

        const confidence = n >= 5 ? 'high' : n >= 3 ? 'medium' : 'low';

        return { direction, slope, confidence };
    }

    _compareVersions(v1, v2) {
        const parts1 = v1.split('.').map(Number);
        const parts2 = v2.split('.').map(Number);

        for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
            const p1 = parts1[i] || 0;
            const p2 = parts2[i] || 0;
            if (p1 !== p2) return p1 - p2;
        }

        return 0;
    }

    _generateAlertId() {
        return `alert-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    _getDefaultThresholds() {
        return {
            duration: 0.20,
            cpu: 0.30,
            memory: 0.30,
            errorRate: 0.10
        };
    }
}

module.exports = PerformanceRegression;
