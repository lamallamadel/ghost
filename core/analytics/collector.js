const { EventEmitter } = require('events');
const fs = require('fs');
const path = require('path');

class AnalyticsCollector extends EventEmitter {
    constructor(options = {}) {
        super();
        this.options = {
            persistenceDir: options.persistenceDir || path.join(require('os').homedir(), '.ghost', 'analytics'),
            flushInterval: options.flushInterval || 60000,
            retentionDays: options.retentionDays || 30,
            ...options
        };

        this.metrics = new Map();
        this.sessionId = this._generateSessionId();
        this.sessionStartTime = Date.now();
        this.flushTimer = null;
        
        this._ensurePersistenceDir();
        this._startPeriodicFlush();
    }

    recordInvocation(extensionId, method, params = {}) {
        const timestamp = Date.now();
        const invocationId = this._generateInvocationId();

        const metric = {
            invocationId,
            extensionId,
            method,
            timestamp,
            timestampISO: new Date(timestamp).toISOString(),
            sessionId: this.sessionId,
            status: 'started',
            params: this._sanitizeParams(params)
        };

        this.metrics.set(invocationId, metric);
        this.emit('invocation-started', metric);

        return invocationId;
    }

    recordSuccess(invocationId, result, duration) {
        const metric = this.metrics.get(invocationId);
        if (!metric) {
            console.warn(`[Analytics] Unknown invocation ID: ${invocationId}`);
            return;
        }

        metric.status = 'success';
        metric.duration = duration;
        metric.completedAt = Date.now();
        metric.resultSize = this._calculateSize(result);

        this._updateExtensionMetrics(metric.extensionId, 'success', duration);
        this.emit('invocation-completed', metric);
    }

    recordFailure(invocationId, error, duration) {
        const metric = this.metrics.get(invocationId);
        if (!metric) {
            console.warn(`[Analytics] Unknown invocation ID: ${invocationId}`);
            return;
        }

        metric.status = 'failure';
        metric.duration = duration;
        metric.completedAt = Date.now();
        metric.error = {
            message: error.message,
            code: error.code,
            stack: error.stack
        };

        this._updateExtensionMetrics(metric.extensionId, 'failure', duration);
        this.emit('invocation-failed', metric);
    }

    recordResourceUsage(invocationId, resourceMetrics) {
        const metric = this.metrics.get(invocationId);
        if (!metric) {
            return;
        }

        metric.resources = {
            cpu: resourceMetrics.cpu,
            memory: resourceMetrics.memory,
            io: resourceMetrics.io,
            network: resourceMetrics.network
        };

        this._updateExtensionResources(metric.extensionId, resourceMetrics);
    }

    getMetrics(extensionId) {
        const extensionMetrics = this._getAggregatedMetrics(extensionId);
        return extensionMetrics;
    }

    getAllMetrics() {
        const allMetrics = {};
        const extensionIds = new Set(
            Array.from(this.metrics.values()).map(m => m.extensionId)
        );

        for (const extensionId of extensionIds) {
            allMetrics[extensionId] = this.getMetrics(extensionId);
        }

        return allMetrics;
    }

    getInvocationHistory(extensionId, options = {}) {
        const limit = options.limit || 100;
        const offset = options.offset || 0;

        const invocations = Array.from(this.metrics.values())
            .filter(m => m.extensionId === extensionId)
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice(offset, offset + limit);

        return {
            total: invocations.length,
            offset,
            limit,
            data: invocations
        };
    }

    async flush() {
        const timestamp = Date.now();
        const filename = `metrics-${timestamp}.json`;
        const filepath = path.join(this.options.persistenceDir, filename);

        const data = {
            sessionId: this.sessionId,
            timestamp,
            timestampISO: new Date(timestamp).toISOString(),
            metrics: Array.from(this.metrics.values()),
            aggregated: this.getAllMetrics()
        };

        try {
            fs.writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf8');
            this.emit('metrics-flushed', { filepath, count: this.metrics.size });
            
            this._cleanupOldMetrics();
        } catch (error) {
            this.emit('flush-error', { error: error.message });
            console.error(`[Analytics] Failed to flush metrics: ${error.message}`);
        }
    }

    async loadHistoricalMetrics(days = 7) {
        const cutoffTime = Date.now() - (days * 24 * 60 * 60 * 1000);
        const files = fs.readdirSync(this.options.persistenceDir)
            .filter(f => f.startsWith('metrics-') && f.endsWith('.json'))
            .map(f => {
                const timestamp = parseInt(f.replace('metrics-', '').replace('.json', ''));
                return { filename: f, timestamp };
            })
            .filter(f => f.timestamp >= cutoffTime)
            .sort((a, b) => b.timestamp - a.timestamp);

        const historicalData = [];
        for (const file of files) {
            try {
                const filepath = path.join(this.options.persistenceDir, file.filename);
                const content = fs.readFileSync(filepath, 'utf8');
                const data = JSON.parse(content);
                historicalData.push(data);
            } catch (error) {
                console.error(`[Analytics] Failed to load ${file.filename}: ${error.message}`);
            }
        }

        return historicalData;
    }

    shutdown() {
        if (this.flushTimer) {
            clearInterval(this.flushTimer);
            this.flushTimer = null;
        }
        this.flush();
    }

    _updateExtensionMetrics(extensionId, status, duration) {
        const key = `ext:${extensionId}`;
        if (!this.metrics.has(key)) {
            this.metrics.set(key, {
                extensionId,
                invocationCount: 0,
                successCount: 0,
                failureCount: 0,
                totalDuration: 0,
                durations: []
            });
        }

        const extMetrics = this.metrics.get(key);
        extMetrics.invocationCount++;
        if (status === 'success') {
            extMetrics.successCount++;
        } else {
            extMetrics.failureCount++;
        }
        extMetrics.totalDuration += duration;
        extMetrics.durations.push(duration);

        if (extMetrics.durations.length > 1000) {
            extMetrics.durations.shift();
        }
    }

    _updateExtensionResources(extensionId, resourceMetrics) {
        const key = `res:${extensionId}`;
        if (!this.metrics.has(key)) {
            this.metrics.set(key, {
                extensionId,
                cpu: [],
                memory: [],
                io: [],
                network: []
            });
        }

        const resMetrics = this.metrics.get(key);
        if (resourceMetrics.cpu !== undefined) resMetrics.cpu.push(resourceMetrics.cpu);
        if (resourceMetrics.memory !== undefined) resMetrics.memory.push(resourceMetrics.memory);
        if (resourceMetrics.io !== undefined) resMetrics.io.push(resourceMetrics.io);
        if (resourceMetrics.network !== undefined) resMetrics.network.push(resourceMetrics.network);

        for (const key of ['cpu', 'memory', 'io', 'network']) {
            if (resMetrics[key].length > 1000) {
                resMetrics[key].shift();
            }
        }
    }

    _getAggregatedMetrics(extensionId) {
        const extKey = `ext:${extensionId}`;
        const resKey = `res:${extensionId}`;
        
        const extMetrics = this.metrics.get(extKey) || {
            invocationCount: 0,
            successCount: 0,
            failureCount: 0,
            totalDuration: 0,
            durations: []
        };

        const resMetrics = this.metrics.get(resKey) || {
            cpu: [],
            memory: [],
            io: [],
            network: []
        };

        const successRate = extMetrics.invocationCount > 0
            ? (extMetrics.successCount / extMetrics.invocationCount) * 100
            : 0;

        const avgDuration = extMetrics.durations.length > 0
            ? extMetrics.durations.reduce((a, b) => a + b, 0) / extMetrics.durations.length
            : 0;

        const p50Duration = this._calculatePercentile(extMetrics.durations, 50);
        const p95Duration = this._calculatePercentile(extMetrics.durations, 95);
        const p99Duration = this._calculatePercentile(extMetrics.durations, 99);

        return {
            extensionId,
            invocationCount: extMetrics.invocationCount,
            successCount: extMetrics.successCount,
            failureCount: extMetrics.failureCount,
            successRate: Math.round(successRate * 100) / 100,
            duration: {
                total: extMetrics.totalDuration,
                average: Math.round(avgDuration * 100) / 100,
                p50: p50Duration,
                p95: p95Duration,
                p99: p99Duration
            },
            resources: {
                cpu: this._calculateResourceStats(resMetrics.cpu),
                memory: this._calculateResourceStats(resMetrics.memory),
                io: this._calculateResourceStats(resMetrics.io),
                network: this._calculateResourceStats(resMetrics.network)
            }
        };
    }

    _calculatePercentile(values, percentile) {
        if (values.length === 0) return 0;
        const sorted = [...values].sort((a, b) => a - b);
        const index = Math.ceil((percentile / 100) * sorted.length) - 1;
        return sorted[index] || 0;
    }

    _calculateResourceStats(values) {
        if (values.length === 0) {
            return { avg: 0, min: 0, max: 0, p95: 0 };
        }

        const avg = values.reduce((a, b) => a + b, 0) / values.length;
        const min = Math.min(...values);
        const max = Math.max(...values);
        const p95 = this._calculatePercentile(values, 95);

        return {
            avg: Math.round(avg * 100) / 100,
            min: Math.round(min * 100) / 100,
            max: Math.round(max * 100) / 100,
            p95: Math.round(p95 * 100) / 100
        };
    }

    _sanitizeParams(params) {
        const sanitized = { ...params };
        const sensitiveKeys = ['password', 'token', 'secret', 'apiKey', 'key'];
        
        for (const key of Object.keys(sanitized)) {
            if (sensitiveKeys.some(sk => key.toLowerCase().includes(sk))) {
                sanitized[key] = '[REDACTED]';
            }
        }
        
        return sanitized;
    }

    _calculateSize(obj) {
        try {
            return JSON.stringify(obj).length;
        } catch (error) {
            return 0;
        }
    }

    _generateSessionId() {
        return `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    _generateInvocationId() {
        return `inv-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    _ensurePersistenceDir() {
        if (!fs.existsSync(this.options.persistenceDir)) {
            fs.mkdirSync(this.options.persistenceDir, { recursive: true });
        }
    }

    _startPeriodicFlush() {
        this.flushTimer = setInterval(() => {
            this.flush();
        }, this.options.flushInterval);
    }

    _cleanupOldMetrics() {
        const cutoffTime = Date.now() - (this.options.retentionDays * 24 * 60 * 60 * 1000);
        
        try {
            const files = fs.readdirSync(this.options.persistenceDir)
                .filter(f => f.startsWith('metrics-') && f.endsWith('.json'));

            for (const file of files) {
                const timestamp = parseInt(file.replace('metrics-', '').replace('.json', ''));
                if (timestamp < cutoffTime) {
                    const filepath = path.join(this.options.persistenceDir, file);
                    fs.unlinkSync(filepath);
                    this.emit('metrics-cleaned', { file });
                }
            }
        } catch (error) {
            console.error(`[Analytics] Cleanup failed: ${error.message}`);
        }
    }
}

module.exports = AnalyticsCollector;
