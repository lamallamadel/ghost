const http = require('http');
const https = require('https');
const { URL } = require('url');

class OTLPExporter {
    constructor(config, metricsCollector, telemetry) {
        this.config = {
            endpoint: config.endpoint || 'http://localhost:4318',
            interval: config.interval || 30000,
            headers: config.headers || {},
            timeout: config.timeout || 10000
        };
        this.metricsCollector = metricsCollector;
        this.telemetry = telemetry;
        this.exportTimer = null;
        this.isRunning = false;
        this.lastExportTime = null;
        this.exportCount = 0;
        this.errorCount = 0;
    }

    start() {
        if (this.isRunning) {
            console.warn('[OTLPExporter] Exporter already running');
            return;
        }

        this.isRunning = true;
        console.log(`[OTLPExporter] Starting OTLP exporter, endpoint: ${this.config.endpoint}, interval: ${this.config.interval}ms`);
        
        this._scheduleExport();
    }

    stop() {
        if (!this.isRunning) {
            return;
        }

        this.isRunning = false;
        
        if (this.exportTimer) {
            clearTimeout(this.exportTimer);
            this.exportTimer = null;
        }

        console.log('[OTLPExporter] Stopped OTLP exporter');
    }

    _scheduleExport() {
        if (!this.isRunning) {
            return;
        }

        this.exportTimer = setTimeout(async () => {
            try {
                await this._export();
            } catch (error) {
                console.error('[OTLPExporter] Export failed:', error.message);
                this.errorCount++;
            }
            
            this._scheduleExport();
        }, this.config.interval);
    }

    async _export() {
        const now = Date.now();
        const spans = this._collectSpans();
        const metrics = this._collectMetrics();

        if (spans.length === 0 && metrics.length === 0) {
            return;
        }

        const traces = spans.length > 0 ? this._buildTracesPayload(spans) : null;
        const metricsPayload = metrics.length > 0 ? this._buildMetricsPayload(metrics) : null;

        if (traces) {
            await this._sendToOTLP('/v1/traces', traces);
        }

        if (metricsPayload) {
            await this._sendToOTLP('/v1/metrics', metricsPayload);
        }

        this.lastExportTime = now;
        this.exportCount++;
    }

    _collectSpans() {
        const recentSpans = this.telemetry.getRecentSpans(1000);
        return recentSpans.filter(span => {
            if (!this.lastExportTime) return true;
            return span.startTime > this.lastExportTime;
        });
    }

    _collectMetrics() {
        const allMetrics = this.metricsCollector.getMetrics();
        const metricsList = [];

        for (const [extensionId, stages] of Object.entries(allMetrics.requests || {})) {
            for (const [stage, count] of Object.entries(stages)) {
                metricsList.push({
                    name: 'ghost.requests.count',
                    type: 'counter',
                    value: count,
                    labels: { extensionId, stage }
                });
            }
        }

        for (const [extensionId, stages] of Object.entries(allMetrics.latencies || {})) {
            for (const [stage, percentiles] of Object.entries(stages)) {
                metricsList.push({
                    name: 'ghost.requests.latency.p50',
                    type: 'gauge',
                    value: percentiles.p50,
                    labels: { extensionId, stage }
                });
                metricsList.push({
                    name: 'ghost.requests.latency.p95',
                    type: 'gauge',
                    value: percentiles.p95,
                    labels: { extensionId, stage }
                });
                metricsList.push({
                    name: 'ghost.requests.latency.p99',
                    type: 'gauge',
                    value: percentiles.p99,
                    labels: { extensionId, stage }
                });
            }
        }

        for (const [extensionId, count] of Object.entries(allMetrics.rateLimitViolations || {})) {
            metricsList.push({
                name: 'ghost.rate_limit_violations.count',
                type: 'counter',
                value: count,
                labels: { extensionId }
            });
        }

        for (const [extensionId, reasons] of Object.entries(allMetrics.validationFailures || {})) {
            for (const [reason, count] of Object.entries(reasons)) {
                metricsList.push({
                    name: 'ghost.validation_failures.count',
                    type: 'counter',
                    value: count,
                    labels: { extensionId, reason }
                });
            }
        }

        for (const [extensionId, codes] of Object.entries(allMetrics.authFailures || {})) {
            for (const [code, count] of Object.entries(codes)) {
                metricsList.push({
                    name: 'ghost.auth_failures.count',
                    type: 'counter',
                    value: count,
                    labels: { extensionId, code }
                });
            }
        }

        for (const [extensionId, sizes] of Object.entries(allMetrics.intentSizes || {})) {
            metricsList.push({
                name: 'ghost.intent.request_size.avg',
                type: 'gauge',
                value: sizes.avgRequestSize,
                labels: { extensionId }
            });
            metricsList.push({
                name: 'ghost.intent.response_size.avg',
                type: 'gauge',
                value: sizes.avgResponseSize,
                labels: { extensionId }
            });
        }

        return metricsList;
    }

    _buildTracesPayload(spans) {
        const scopeSpans = spans.map(span => ({
            traceId: this._hexToBase64(span.traceId),
            spanId: this._hexToBase64(span.spanId),
            parentSpanId: span.parentSpanId ? this._hexToBase64(span.parentSpanId) : undefined,
            name: span.name,
            kind: 1,
            startTimeUnixNano: String(span.startTime * 1000000),
            endTimeUnixNano: span.endTime ? String(span.endTime * 1000000) : String(Date.now() * 1000000),
            attributes: this._buildAttributes(span.attributes),
            status: {
                code: span.status.code === 'OK' ? 1 : span.status.code === 'ERROR' ? 2 : 0,
                message: span.status.message || ''
            },
            events: (span.events || []).map(event => ({
                timeUnixNano: String(event.timestamp * 1000000),
                name: event.name,
                attributes: this._buildAttributes(event.attributes || {})
            }))
        }));

        return {
            resourceSpans: [{
                resource: {
                    attributes: [
                        { key: 'service.name', value: { stringValue: 'ghost-cli' } },
                        { key: 'service.version', value: { stringValue: '1.0.0' } }
                    ]
                },
                scopeSpans: [{
                    scope: {
                        name: 'ghost-telemetry',
                        version: '1.0.0'
                    },
                    spans: scopeSpans
                }]
            }]
        };
    }

    _buildMetricsPayload(metrics) {
        const metricsByName = {};
        
        for (const metric of metrics) {
            if (!metricsByName[metric.name]) {
                metricsByName[metric.name] = [];
            }
            metricsByName[metric.name].push(metric);
        }

        const otlpMetrics = [];
        const timeUnixNano = String(Date.now() * 1000000);

        for (const [name, metricList] of Object.entries(metricsByName)) {
            const firstMetric = metricList[0];
            const dataPoints = metricList.map(m => ({
                attributes: this._buildAttributes(m.labels || {}),
                timeUnixNano,
                asDouble: m.value
            }));

            const metricData = {
                name,
                unit: '',
                [firstMetric.type === 'counter' ? 'sum' : 'gauge']: {
                    dataPoints,
                    aggregationTemporality: firstMetric.type === 'counter' ? 2 : undefined,
                    isMonotonic: firstMetric.type === 'counter' ? true : undefined
                }
            };

            otlpMetrics.push(metricData);
        }

        return {
            resourceMetrics: [{
                resource: {
                    attributes: [
                        { key: 'service.name', value: { stringValue: 'ghost-cli' } },
                        { key: 'service.version', value: { stringValue: '1.0.0' } }
                    ]
                },
                scopeMetrics: [{
                    scope: {
                        name: 'ghost-telemetry',
                        version: '1.0.0'
                    },
                    metrics: otlpMetrics
                }]
            }]
        };
    }

    _buildAttributes(attrs) {
        return Object.entries(attrs).map(([key, value]) => {
            const attr = { key };
            
            if (typeof value === 'string') {
                attr.value = { stringValue: value };
            } else if (typeof value === 'number') {
                if (Number.isInteger(value)) {
                    attr.value = { intValue: String(value) };
                } else {
                    attr.value = { doubleValue: value };
                }
            } else if (typeof value === 'boolean') {
                attr.value = { boolValue: value };
            } else {
                attr.value = { stringValue: JSON.stringify(value) };
            }
            
            return attr;
        });
    }

    _hexToBase64(hex) {
        if (!hex) return '';
        const buffer = Buffer.from(hex.padStart(32, '0').substring(0, 32), 'hex');
        return buffer.toString('base64');
    }

    async _sendToOTLP(path, payload) {
        const endpoint = new URL(this.config.endpoint);
        const fullPath = endpoint.pathname.replace(/\/$/, '') + path;
        
        const postData = JSON.stringify(payload);
        
        const options = {
            hostname: endpoint.hostname,
            port: endpoint.port || (endpoint.protocol === 'https:' ? 443 : 80),
            path: fullPath,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData),
                ...this.config.headers
            },
            timeout: this.config.timeout
        };

        return new Promise((resolve, reject) => {
            const client = endpoint.protocol === 'https:' ? https : http;
            
            const req = client.request(options, (res) => {
                let data = '';
                
                res.on('data', (chunk) => {
                    data += chunk;
                });
                
                res.on('end', () => {
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        resolve({ statusCode: res.statusCode, body: data });
                    } else {
                        reject(new Error(`OTLP export failed with status ${res.statusCode}: ${data}`));
                    }
                });
            });

            req.on('error', (error) => {
                reject(error);
            });

            req.on('timeout', () => {
                req.destroy();
                reject(new Error('OTLP export request timeout'));
            });

            req.write(postData);
            req.end();
        });
    }

    getStats() {
        return {
            isRunning: this.isRunning,
            endpoint: this.config.endpoint,
            interval: this.config.interval,
            lastExportTime: this.lastExportTime,
            exportCount: this.exportCount,
            errorCount: this.errorCount
        };
    }
}

module.exports = OTLPExporter;
