const { EventEmitter } = require('events');

class DistributedTelemetryCollector extends EventEmitter {
    constructor(options = {}) {
        super();
        this.agentId = options.agentId;
        this.meshNetwork = options.meshNetwork;
        
        this.localMetrics = new Map();
        this.remoteMetrics = new Map();
        this.aggregatedMetrics = new Map();
        
        this.collectionInterval = options.collectionInterval || 10000;
        this.retentionPeriod = options.retentionPeriod || 3600000;
        this.maxMetricPoints = options.maxMetricPoints || 1000;
        
        this.collectors = new Map();
        this.collectionTimer = null;
        this.cleanupTimer = null;
        
        this.state = 'STOPPED';
    }

    start() {
        if (this.state === 'RUNNING') {
            return;
        }

        this.state = 'RUNNING';
        
        if (this.meshNetwork) {
            this.meshNetwork.on('request', (event) => {
                if (event.method === 'get_metrics') {
                    this._handleMetricsRequest(event);
                } else if (event.method === 'publish_metrics') {
                    this._handleMetricsPublish(event);
                }
            });
        }

        this._startCollection();
        this._startCleanup();
        
        this.emit('started');
    }

    stop() {
        if (this.state === 'STOPPED') {
            return;
        }

        this.state = 'STOPPING';

        if (this.collectionTimer) {
            clearInterval(this.collectionTimer);
            this.collectionTimer = null;
        }

        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
            this.cleanupTimer = null;
        }

        this.state = 'STOPPED';
        this.emit('stopped');
    }

    registerCollector(name, collector) {
        if (typeof collector !== 'function') {
            throw new Error('Collector must be a function');
        }

        this.collectors.set(name, collector);
        this.emit('collector-registered', { name });
    }

    unregisterCollector(name) {
        const removed = this.collectors.delete(name);
        if (removed) {
            this.emit('collector-unregistered', { name });
        }
        return removed;
    }

    recordMetric(name, value, labels = {}) {
        const timestamp = Date.now();
        const metricKey = this._getMetricKey(name, labels);

        if (!this.localMetrics.has(metricKey)) {
            this.localMetrics.set(metricKey, {
                name,
                labels,
                points: []
            });
        }

        const metric = this.localMetrics.get(metricKey);
        metric.points.push({ timestamp, value });

        if (metric.points.length > this.maxMetricPoints) {
            metric.points.shift();
        }

        this.emit('metric-recorded', { name, value, labels, timestamp });
    }

    incrementCounter(name, labels = {}) {
        const metricKey = this._getMetricKey(name, labels);
        const metric = this.localMetrics.get(metricKey);
        
        const currentValue = metric?.points[metric.points.length - 1]?.value || 0;
        this.recordMetric(name, currentValue + 1, labels);
    }

    recordHistogram(name, value, labels = {}) {
        const metricKey = this._getMetricKey(name, labels);

        if (!this.localMetrics.has(metricKey)) {
            this.localMetrics.set(metricKey, {
                name,
                labels,
                type: 'histogram',
                points: []
            });
        }

        const metric = this.localMetrics.get(metricKey);
        const timestamp = Date.now();
        metric.points.push({ timestamp, value });

        if (metric.points.length > this.maxMetricPoints) {
            metric.points.shift();
        }

        this.emit('histogram-recorded', { name, value, labels, timestamp });
    }

    getMetric(name, labels = {}) {
        const metricKey = this._getMetricKey(name, labels);
        return this.localMetrics.get(metricKey);
    }

    getAggregatedMetric(name, labels = {}) {
        const metricKey = this._getMetricKey(name, labels);
        return this.aggregatedMetrics.get(metricKey);
    }

    getAllMetrics() {
        const metrics = {};
        
        for (const [key, metric] of this.localMetrics) {
            metrics[key] = {
                name: metric.name,
                labels: metric.labels,
                points: metric.points
            };
        }

        return metrics;
    }

    getAllAggregatedMetrics() {
        const metrics = {};
        
        for (const [key, metric] of this.aggregatedMetrics) {
            metrics[key] = {
                name: metric.name,
                labels: metric.labels,
                aggregation: metric.aggregation
            };
        }

        return metrics;
    }

    async collectFromPeers() {
        if (!this.meshNetwork) {
            return;
        }

        const peers = this.meshNetwork.getPeers();
        const collections = [];

        for (const peer of peers) {
            collections.push(
                this.meshNetwork.sendRequest(peer.id, 'get_metrics', {})
                    .then((response) => {
                        this._storeRemoteMetrics(peer.id, response.metrics);
                    })
                    .catch((error) => {
                        this.emit('collection-error', {
                            peerId: peer.id,
                            error: error.message
                        });
                    })
            );
        }

        await Promise.allSettled(collections);
        this._aggregateMetrics();
    }

    _storeRemoteMetrics(peerId, metrics) {
        this.remoteMetrics.set(peerId, {
            agentId: peerId,
            metrics,
            timestamp: Date.now()
        });

        this.emit('remote-metrics-received', {
            peerId,
            metricCount: Object.keys(metrics).length
        });
    }

    _aggregateMetrics() {
        const allMetrics = new Map();

        for (const [key, metric] of this.localMetrics) {
            allMetrics.set(key, [{ agentId: this.agentId, metric }]);
        }

        for (const [peerId, data] of this.remoteMetrics) {
            for (const [key, metric] of Object.entries(data.metrics)) {
                if (!allMetrics.has(key)) {
                    allMetrics.set(key, []);
                }
                allMetrics.get(key).push({ agentId: peerId, metric });
            }
        }

        for (const [key, metricList] of allMetrics) {
            const aggregation = this._performAggregation(metricList);
            this.aggregatedMetrics.set(key, aggregation);
        }

        this.emit('metrics-aggregated', {
            timestamp: Date.now(),
            metricCount: this.aggregatedMetrics.size
        });
    }

    _performAggregation(metricList) {
        if (metricList.length === 0) {
            return null;
        }

        const firstMetric = metricList[0].metric;
        const aggregation = {
            name: firstMetric.name,
            labels: firstMetric.labels,
            type: firstMetric.type || 'gauge',
            sources: metricList.length,
            timestamp: Date.now()
        };

        if (aggregation.type === 'histogram') {
            const allValues = [];
            for (const { metric } of metricList) {
                if (metric.points) {
                    allValues.push(...metric.points.map(p => p.value));
                }
            }

            allValues.sort((a, b) => a - b);
            
            aggregation.aggregation = {
                count: allValues.length,
                sum: allValues.reduce((a, b) => a + b, 0),
                mean: allValues.length > 0 ? allValues.reduce((a, b) => a + b, 0) / allValues.length : 0,
                median: allValues.length > 0 ? allValues[Math.floor(allValues.length / 2)] : 0,
                min: allValues.length > 0 ? Math.min(...allValues) : 0,
                max: allValues.length > 0 ? Math.max(...allValues) : 0,
                p50: this._percentile(allValues, 0.5),
                p95: this._percentile(allValues, 0.95),
                p99: this._percentile(allValues, 0.99)
            };
        } else {
            const latestValues = metricList.map(({ metric }) => {
                if (metric.points && metric.points.length > 0) {
                    return metric.points[metric.points.length - 1].value;
                }
                return 0;
            });

            aggregation.aggregation = {
                sum: latestValues.reduce((a, b) => a + b, 0),
                mean: latestValues.length > 0 ? latestValues.reduce((a, b) => a + b, 0) / latestValues.length : 0,
                min: Math.min(...latestValues),
                max: Math.max(...latestValues),
                count: latestValues.length
            };
        }

        return aggregation;
    }

    _percentile(sortedValues, percentile) {
        if (sortedValues.length === 0) return 0;
        const index = Math.ceil(sortedValues.length * percentile) - 1;
        return sortedValues[Math.max(0, index)];
    }

    async _collectLocalMetrics() {
        for (const [name, collector] of this.collectors) {
            try {
                const result = await Promise.resolve(collector());
                
                if (typeof result === 'object' && result !== null) {
                    for (const [metricName, value] of Object.entries(result)) {
                        this.recordMetric(metricName, value, { collector: name });
                    }
                } else if (typeof result === 'number') {
                    this.recordMetric(name, result);
                }
            } catch (error) {
                this.emit('collector-error', {
                    collector: name,
                    error: error.message
                });
            }
        }
    }

    _startCollection() {
        this.collectionTimer = setInterval(async () => {
            await this._collectLocalMetrics();
            await this.collectFromPeers();
        }, this.collectionInterval);
    }

    _startCleanup() {
        this.cleanupTimer = setInterval(() => {
            this._cleanupOldMetrics();
        }, 60000);
    }

    _cleanupOldMetrics() {
        const now = Date.now();
        const cutoff = now - this.retentionPeriod;

        for (const [key, metric] of this.localMetrics) {
            metric.points = metric.points.filter(p => p.timestamp > cutoff);
            
            if (metric.points.length === 0) {
                this.localMetrics.delete(key);
            }
        }

        for (const [peerId, data] of this.remoteMetrics) {
            if (data.timestamp < cutoff) {
                this.remoteMetrics.delete(peerId);
            }
        }

        this.emit('cleanup-completed', {
            timestamp: now,
            localMetrics: this.localMetrics.size,
            remoteMetrics: this.remoteMetrics.size
        });
    }

    _handleMetricsRequest(event) {
        const metrics = this.getAllMetrics();
        event.reply({ metrics });
    }

    _handleMetricsPublish(event) {
        const { metrics } = event.params;
        this._storeRemoteMetrics(event.peerId, metrics);
        event.reply({ received: true });
    }

    _getMetricKey(name, labels) {
        const sortedLabels = Object.keys(labels)
            .sort()
            .map(key => `${key}=${labels[key]}`)
            .join(',');
        return sortedLabels ? `${name}{${sortedLabels}}` : name;
    }

    getStats() {
        return {
            state: this.state,
            localMetricCount: this.localMetrics.size,
            remoteMetricCount: this.remoteMetrics.size,
            aggregatedMetricCount: this.aggregatedMetrics.size,
            collectorCount: this.collectors.size
        };
    }
}

module.exports = { DistributedTelemetryCollector };
