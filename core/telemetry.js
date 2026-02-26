const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');

const TELEMETRY_DIR = path.join(os.homedir(), '.ghost', 'telemetry');
const CONFIG_FILE = path.join(os.homedir(), '.ghost', 'config', 'ghostrc.json');

const SEVERITY_LEVELS = {
    INFO: 'INFO',
    WARN: 'WARN',
    ERROR: 'ERROR',
    SECURITY_ALERT: 'SECURITY_ALERT'
};

function _ensureExportersDirectory() {
    const exportersDir = path.join(__dirname, 'exporters');
    if (!fs.existsSync(exportersDir)) {
        fs.mkdirSync(exportersDir, { recursive: true });
    }
    return exportersDir;
}

function _createExporterFiles() {
    const exportersDir = _ensureExportersDirectory();
    
    const otlpPath = path.join(exportersDir, 'otlp-exporter.js');
    const prometheusPath = path.join(exportersDir, 'prometheus-exporter.js');
    
    if (!fs.existsSync(otlpPath)) {
        const otlpContent = `const http = require('http');
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
        console.log(\`[OTLPExporter] Starting OTLP exporter, endpoint: \${this.config.endpoint}, interval: \${this.config.interval}ms\`);
        
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
        const fullPath = endpoint.pathname.replace(/\\/$/, '') + path;
        
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
                        reject(new Error(\`OTLP export failed with status \${res.statusCode}: \${data}\`));
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
`;
        fs.writeFileSync(otlpPath, otlpContent);
    }
    
    if (!fs.existsSync(prometheusPath)) {
        const prometheusContent = `class PrometheusExporter {
    constructor(metricsCollector, telemetry) {
        this.metricsCollector = metricsCollector;
        this.telemetry = telemetry;
        this.enabled = false;
    }

    enable() {
        this.enabled = true;
        console.log('[PrometheusExporter] Prometheus metrics endpoint enabled at /metrics');
    }

    disable() {
        this.enabled = false;
    }

    getMetricsText() {
        if (!this.enabled) {
            return '# Prometheus exporter is disabled\\n';
        }

        const allMetrics = this.metricsCollector.getMetrics();
        const lines = [];

        lines.push('# HELP ghost_requests_total Total number of requests by extension and stage');
        lines.push('# TYPE ghost_requests_total counter');
        for (const [extensionId, stages] of Object.entries(allMetrics.requests || {})) {
            for (const [stage, count] of Object.entries(stages)) {
                lines.push(\`ghost_requests_total{extensionId="\${this._escapeLabel(extensionId)}",stage="\${this._escapeLabel(stage)}"} \${count}\`);
            }
        }
        lines.push('');

        lines.push('# HELP ghost_request_latency_milliseconds Request latency percentiles in milliseconds');
        lines.push('# TYPE ghost_request_latency_milliseconds gauge');
        for (const [extensionId, stages] of Object.entries(allMetrics.latencies || {})) {
            for (const [stage, percentiles] of Object.entries(stages)) {
                lines.push(\`ghost_request_latency_milliseconds{extensionId="\${this._escapeLabel(extensionId)}",stage="\${this._escapeLabel(stage)}",quantile="0.5"} \${percentiles.p50}\`);
                lines.push(\`ghost_request_latency_milliseconds{extensionId="\${this._escapeLabel(extensionId)}",stage="\${this._escapeLabel(stage)}",quantile="0.95"} \${percentiles.p95}\`);
                lines.push(\`ghost_request_latency_milliseconds{extensionId="\${this._escapeLabel(extensionId)}",stage="\${this._escapeLabel(stage)}",quantile="0.99"} \${percentiles.p99}\`);
            }
        }
        lines.push('');

        lines.push('# HELP ghost_rate_limit_violations_total Total number of rate limit violations by extension');
        lines.push('# TYPE ghost_rate_limit_violations_total counter');
        for (const [extensionId, count] of Object.entries(allMetrics.rateLimitViolations || {})) {
            lines.push(\`ghost_rate_limit_violations_total{extensionId="\${this._escapeLabel(extensionId)}"} \${count}\`);
        }
        lines.push('');

        lines.push('# HELP ghost_validation_failures_total Total number of validation failures by extension and reason');
        lines.push('# TYPE ghost_validation_failures_total counter');
        for (const [extensionId, reasons] of Object.entries(allMetrics.validationFailures || {})) {
            for (const [reason, count] of Object.entries(reasons)) {
                lines.push(\`ghost_validation_failures_total{extensionId="\${this._escapeLabel(extensionId)}",reason="\${this._escapeLabel(reason)}"} \${count}\`);
            }
        }
        lines.push('');

        lines.push('# HELP ghost_auth_failures_total Total number of authentication failures by extension and code');
        lines.push('# TYPE ghost_auth_failures_total counter');
        for (const [extensionId, codes] of Object.entries(allMetrics.authFailures || {})) {
            for (const [code, count] of Object.entries(codes)) {
                lines.push(\`ghost_auth_failures_total{extensionId="\${this._escapeLabel(extensionId)}",code="\${this._escapeLabel(code)}"} \${count}\`);
            }
        }
        lines.push('');

        lines.push('# HELP ghost_intent_request_size_bytes Average request size in bytes by extension');
        lines.push('# TYPE ghost_intent_request_size_bytes gauge');
        for (const [extensionId, sizes] of Object.entries(allMetrics.intentSizes || {})) {
            lines.push(\`ghost_intent_request_size_bytes{extensionId="\${this._escapeLabel(extensionId)}"} \${sizes.avgRequestSize}\`);
        }
        lines.push('');

        lines.push('# HELP ghost_intent_response_size_bytes Average response size in bytes by extension');
        lines.push('# TYPE ghost_intent_response_size_bytes gauge');
        for (const [extensionId, sizes] of Object.entries(allMetrics.intentSizes || {})) {
            lines.push(\`ghost_intent_response_size_bytes{extensionId="\${this._escapeLabel(extensionId)}"} \${sizes.avgResponseSize}\`);
        }
        lines.push('');

        const recentSpans = this.telemetry.getRecentSpans(1000);
        const spanCount = recentSpans.length;
        lines.push('# HELP ghost_spans_collected_total Total number of spans currently collected');
        lines.push('# TYPE ghost_spans_collected_total gauge');
        lines.push(\`ghost_spans_collected_total \${spanCount}\`);
        lines.push('');

        lines.push('# HELP ghost_telemetry_server_info Telemetry server information');
        lines.push('# TYPE ghost_telemetry_server_info gauge');
        lines.push(\`ghost_telemetry_server_info{version="1.0.0"} 1\`);
        lines.push('');

        return lines.join('\\n');
    }

    _escapeLabel(value) {
        if (typeof value !== 'string') {
            value = String(value);
        }
        return value.replace(/\\\\/g, '\\\\\\\\').replace(/"/g, '\\\\"').replace(/\\n/g, '\\\\n');
    }

    isEnabled() {
        return this.enabled;
    }
}

module.exports = PrometheusExporter;
`;
        fs.writeFileSync(prometheusPath, prometheusContent);
    }
}

_createExporterFiles();

const SECRET_FIELDS = ['api_key', 'apiKey', 'token', 'password', 'secret', 'auth', 'authorization', 'credentials'];

const DEFAULT_LOG_CONFIG = {
    maxFileSizeMB: 10,
    maxDailyFiles: 7
};

class Span {
    constructor(name, parentSpan = null) {
        this.spanId = this._generateSpanId();
        this.traceId = parentSpan ? parentSpan.traceId : this._generateTraceId();
        this.parentSpanId = parentSpan ? parentSpan.spanId : null;
        this.name = name;
        this.startTime = Date.now();
        this.endTime = null;
        this.attributes = {};
        this.events = [];
        this.status = { code: 'UNSET' };
    }

    _generateSpanId() {
        return Math.random().toString(36).substring(2, 18);
    }

    _generateTraceId() {
        return Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2);
    }

    setAttribute(key, value) {
        this.attributes[key] = value;
        return this;
    }

    setAttributes(attributes) {
        Object.assign(this.attributes, attributes);
        return this;
    }

    addEvent(name, attributes = {}) {
        this.events.push({
            name,
            timestamp: Date.now(),
            attributes
        });
        return this;
    }

    setStatus(code, message = '') {
        this.status = { code, message };
        return this;
    }

    end() {
        this.endTime = Date.now();
        return this;
    }

    get duration() {
        return this.endTime ? this.endTime - this.startTime : Date.now() - this.startTime;
    }

    toJSON() {
        return {
            spanId: this.spanId,
            traceId: this.traceId,
            parentSpanId: this.parentSpanId,
            name: this.name,
            startTime: this.startTime,
            endTime: this.endTime,
            duration: this.duration,
            attributes: this.attributes,
            events: this.events,
            status: this.status
        };
    }
}

class StructuredLogger {
    constructor(baseDir = TELEMETRY_DIR) {
        this.baseDir = baseDir;
        this.logConfig = this._loadLogConfig();
        this._ensureDirectory();
    }

    _loadLogConfig() {
        try {
            if (fs.existsSync(CONFIG_FILE)) {
                const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
                return {
                    maxFileSizeMB: config.logs?.maxFileSizeMB || DEFAULT_LOG_CONFIG.maxFileSizeMB,
                    maxDailyFiles: config.logs?.maxDailyFiles || DEFAULT_LOG_CONFIG.maxDailyFiles
                };
            }
        } catch (error) {
        }
        return DEFAULT_LOG_CONFIG;
    }

    _ensureDirectory() {
        try {
            const parentDir = path.dirname(this.baseDir);
            
            if (fs.existsSync(parentDir)) {
                const parentStats = fs.statSync(parentDir);
                if (!parentStats.isDirectory()) {
                    return;
                }
            }
            
            if (fs.existsSync(this.baseDir)) {
                const stats = fs.statSync(this.baseDir);
                if (!stats.isDirectory()) {
                    fs.unlinkSync(this.baseDir);
                    fs.mkdirSync(this.baseDir, { recursive: true });
                }
            } else {
                fs.mkdirSync(this.baseDir, { recursive: true });
            }
        } catch (error) {
        }
    }

    _getLogPath(date = null) {
        const dateStr = date || new Date().toISOString().split('T')[0];
        return path.join(this.baseDir, `telemetry-${dateStr}.log`);
    }

    _scrubPII(text) {
        if (typeof text !== 'string') {
            return text;
        }

        let scrubbed = text;

        // Email pattern
        scrubbed = scrubbed.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[EMAIL]');

        // IPv4 addresses
        scrubbed = scrubbed.replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, '[IP]');

        // IPv6 addresses (simplified pattern)
        scrubbed = scrubbed.replace(/\b([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}\b/g, '[IP]');

        // Unix home paths: /home/<user>/
        scrubbed = scrubbed.replace(/\/home\/[^\/\s]+/g, '/home/[USER]');

        // Windows home paths: C:\Users\<user>\
        scrubbed = scrubbed.replace(/[A-Za-z]:\\Users\\[^\\\/\s]+/gi, 'C:\\Users\\[USER]');

        return scrubbed;
    }

    _scrubPIIFromValue(value) {
        if (value === null || value === undefined) {
            return value;
        }

        if (typeof value === 'string') {
            return this._scrubPII(value);
        }

        if (Array.isArray(value)) {
            return value.map(item => this._scrubPIIFromValue(item));
        }

        if (typeof value === 'object') {
            const scrubbed = {};
            for (const [key, val] of Object.entries(value)) {
                scrubbed[key] = this._scrubPIIFromValue(val);
            }
            return scrubbed;
        }

        return value;
    }

    _sanitizeValue(value) {
        if (value === null || value === undefined) {
            return value;
        }

        if (typeof value === 'string') {
            return value;
        }

        if (Array.isArray(value)) {
            return value.map(item => this._sanitizeValue(item));
        }

        if (typeof value === 'object') {
            const sanitized = {};
            for (const [key, val] of Object.entries(value)) {
                const lowerKey = key.toLowerCase();
                const isSecret = SECRET_FIELDS.some(field => lowerKey.includes(field.toLowerCase()));
                
                if (isSecret) {
                    sanitized[key] = '[REDACTED]';
                } else {
                    sanitized[key] = this._sanitizeValue(val);
                }
            }
            return sanitized;
        }

        return value;
    }

    _sanitizeMetadata(metadata) {
        if (!metadata || typeof metadata !== 'object') {
            return metadata;
        }

        const sanitized = {};
        for (const [key, value] of Object.entries(metadata)) {
            const lowerKey = key.toLowerCase();
            const isSecret = SECRET_FIELDS.some(field => lowerKey.includes(field.toLowerCase()));
            
            if (isSecret) {
                sanitized[key] = '[REDACTED]';
            } else if (key === 'params' && typeof value === 'object') {
                sanitized[key] = this._sanitizeValue(value);
            } else if (typeof value === 'object' && !Array.isArray(value)) {
                sanitized[key] = this._sanitizeValue(value);
            } else {
                sanitized[key] = value;
            }
        }
        return sanitized;
    }

    _rotateIfNeeded() {
        try {
            const logPath = this._getLogPath();
            
            if (!fs.existsSync(logPath)) {
                return;
            }

            const stats = fs.statSync(logPath);
            const maxSizeBytes = this.logConfig.maxFileSizeMB * 1024 * 1024;

            if (stats.size >= maxSizeBytes) {
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                const dateStr = new Date().toISOString().split('T')[0];
                const rotatedPath = path.join(this.baseDir, `telemetry-${dateStr}-${timestamp}.log`);
                
                fs.renameSync(logPath, rotatedPath);
                
                this._cleanupOldLogs();
            }
        } catch (error) {
        }
    }

    _cleanupOldLogs() {
        try {
            const files = fs.readdirSync(this.baseDir);
            const logFiles = files
                .filter(f => f.startsWith('telemetry-') && f.endsWith('.log'))
                .map(f => ({
                    name: f,
                    path: path.join(this.baseDir, f),
                    mtime: fs.statSync(path.join(this.baseDir, f)).mtime
                }))
                .sort((a, b) => b.mtime - a.mtime);

            const maxFiles = this.logConfig.maxDailyFiles;
            if (logFiles.length > maxFiles) {
                const filesToDelete = logFiles.slice(maxFiles);
                for (const file of filesToDelete) {
                    try {
                        fs.unlinkSync(file.path);
                    } catch (error) {
                    }
                }
            }
        } catch (error) {
        }
    }

    log(severity, message, metadata = {}) {
        this._rotateIfNeeded();

        const sanitized = this._sanitizeMetadata(metadata);
        
        const entry = {
            timestamp: new Date().toISOString(),
            severity,
            message: this._scrubPII(message),
            extensionId: sanitized.extensionId || null,
            requestId: sanitized.requestId || null,
            layer: sanitized.layer || null,
            errorCode: sanitized.errorCode || sanitized.code || null,
            ...this._scrubPIIFromValue(sanitized)
        };

        const logLine = JSON.stringify(entry) + '\n';

        try {
            fs.appendFileSync(this._getLogPath(), logLine, { encoding: 'utf8', flag: 'a' });
        } catch (error) {
        }

        return entry;
    }

    info(message, metadata = {}) {
        return this.log(SEVERITY_LEVELS.INFO, message, metadata);
    }

    warn(message, metadata = {}) {
        return this.log(SEVERITY_LEVELS.WARN, metadata);
    }

    error(message, metadata = {}) {
        return this.log(SEVERITY_LEVELS.ERROR, message, metadata);
    }

    securityAlert(message, metadata = {}) {
        return this.log(SEVERITY_LEVELS.SECURITY_ALERT, message, metadata);
    }

    readLogs(options = {}) {
        const { date, severity, limit = 1000, extensionId, requestId, layer, errorCode } = options;
        const targetDate = date || new Date().toISOString().split('T')[0];
        const logPath = this._getLogPath(targetDate);

        if (!fs.existsSync(logPath)) {
            return [];
        }

        try {
            const content = fs.readFileSync(logPath, 'utf8');
            let logs = content.trim().split('\n')
                .filter(line => line)
                .map(line => {
                    try {
                        return JSON.parse(line);
                    } catch {
                        return null;
                    }
                })
                .filter(log => log !== null);

            if (severity) {
                logs = logs.filter(log => log.severity === severity);
            }

            if (extensionId) {
                logs = logs.filter(log => log.extensionId === extensionId);
            }

            if (requestId) {
                logs = logs.filter(log => log.requestId === requestId);
            }

            if (layer) {
                logs = logs.filter(log => log.layer === layer);
            }

            if (errorCode) {
                logs = logs.filter(log => log.errorCode === errorCode);
            }

            return logs.slice(-limit);
        } catch (error) {
            console.error('[StructuredLogger] Failed to read logs:', error.message);
            return [];
        }
    }

    pruneLogs(daysToKeep = null) {
        const maxDays = daysToKeep || this.logConfig.maxDailyFiles;
        const now = Date.now();
        const maxAgeMs = maxDays * 24 * 60 * 60 * 1000;
        let deletedCount = 0;
        let totalSizeFreed = 0;

        try {
            if (!fs.existsSync(this.baseDir)) {
                return { deletedCount, totalSizeFreed };
            }

            const files = fs.readdirSync(this.baseDir);
            const logFiles = files
                .filter(f => f.startsWith('telemetry-') && f.endsWith('.log'))
                .map(f => {
                    const filePath = path.join(this.baseDir, f);
                    const stats = fs.statSync(filePath);
                    return {
                        name: f,
                        path: filePath,
                        mtime: stats.mtime,
                        size: stats.size
                    };
                });

            for (const file of logFiles) {
                const age = now - file.mtime.getTime();
                if (age > maxAgeMs) {
                    try {
                        fs.unlinkSync(file.path);
                        deletedCount++;
                        totalSizeFreed += file.size;
                    } catch (error) {
                    }
                }
            }
        } catch (error) {
        }

        return { deletedCount, totalSizeFreed };
    }
}

class MetricsCollector {
    constructor() {
        this.metrics = {
            requestCount: new Map(),
            latencies: new Map(),
            rateLimitViolations: new Map(),
            validationFailures: new Map(),
            authFailures: new Map(),
            intentSizes: new Map()
        };
    }

    recordRequest(extensionId, stage, latency) {
        const key = `${extensionId}:${stage}`;
        
        if (!this.metrics.requestCount.has(key)) {
            this.metrics.requestCount.set(key, 0);
        }
        this.metrics.requestCount.set(key, this.metrics.requestCount.get(key) + 1);

        if (!this.metrics.latencies.has(key)) {
            this.metrics.latencies.set(key, []);
        }
        const latencies = this.metrics.latencies.get(key);
        latencies.push(latency);
        
        if (latencies.length > 1000) {
            latencies.shift();
        }
    }

    recordRateLimitViolation(extensionId) {
        if (!this.metrics.rateLimitViolations.has(extensionId)) {
            this.metrics.rateLimitViolations.set(extensionId, 0);
        }
        this.metrics.rateLimitViolations.set(extensionId, 
            this.metrics.rateLimitViolations.get(extensionId) + 1);
    }

    recordValidationFailure(extensionId, reason) {
        const key = `${extensionId}:${reason}`;
        if (!this.metrics.validationFailures.has(key)) {
            this.metrics.validationFailures.set(key, 0);
        }
        this.metrics.validationFailures.set(key, 
            this.metrics.validationFailures.get(key) + 1);
    }

    recordAuthFailure(extensionId, code) {
        const key = `${extensionId}:${code}`;
        if (!this.metrics.authFailures.has(key)) {
            this.metrics.authFailures.set(key, 0);
        }
        this.metrics.authFailures.set(key, 
            this.metrics.authFailures.get(key) + 1);
    }

    recordIntentSize(extensionId, requestSize, responseSize) {
        if (!this.metrics.intentSizes.has(extensionId)) {
            this.metrics.intentSizes.set(extensionId, {
                requests: [],
                responses: []
            });
        }
        
        const sizes = this.metrics.intentSizes.get(extensionId);
        sizes.requests.push(requestSize);
        sizes.responses.push(responseSize);
        
        if (sizes.requests.length > 1000) {
            sizes.requests.shift();
        }
        if (sizes.responses.length > 1000) {
            sizes.responses.shift();
        }
    }

    getLatencyPercentiles(extensionId, stage) {
        const key = `${extensionId}:${stage}`;
        const latencies = this.metrics.latencies.get(key) || [];
        
        if (latencies.length === 0) {
            return { p50: 0, p95: 0, p99: 0 };
        }

        const sorted = [...latencies].sort((a, b) => a - b);
        const p50Index = Math.ceil(sorted.length * 0.5) - 1;
        const p95Index = Math.ceil(sorted.length * 0.95) - 1;
        const p99Index = Math.ceil(sorted.length * 0.99) - 1;
        
        return {
            p50: sorted[Math.max(0, p50Index)],
            p95: sorted[Math.max(0, p95Index)],
            p99: sorted[Math.max(0, p99Index)]
        };
    }

    getMetrics(extensionId = null) {
        const result = {
            requests: {},
            latencies: {},
            rateLimitViolations: {},
            validationFailures: {},
            authFailures: {},
            intentSizes: {}
        };

        for (const [key, count] of this.metrics.requestCount.entries()) {
            const [extId, stage] = key.split(':');
            if (!extensionId || extId === extensionId) {
                if (!result.requests[extId]) {
                    result.requests[extId] = {};
                }
                result.requests[extId][stage] = count;
            }
        }

        for (const [key] of this.metrics.latencies.entries()) {
            const [extId, stage] = key.split(':');
            if (!extensionId || extId === extensionId) {
                if (!result.latencies[extId]) {
                    result.latencies[extId] = {};
                }
                result.latencies[extId][stage] = this.getLatencyPercentiles(extId, stage);
            }
        }

        for (const [extId, count] of this.metrics.rateLimitViolations.entries()) {
            if (!extensionId || extId === extensionId) {
                result.rateLimitViolations[extId] = count;
            }
        }

        for (const [key, count] of this.metrics.validationFailures.entries()) {
            const [extId, reason] = key.split(':');
            if (!extensionId || extId === extensionId) {
                if (!result.validationFailures[extId]) {
                    result.validationFailures[extId] = {};
                }
                result.validationFailures[extId][reason] = count;
            }
        }

        for (const [key, count] of this.metrics.authFailures.entries()) {
            const [extId, code] = key.split(':');
            if (!extensionId || extId === extensionId) {
                if (!result.authFailures[extId]) {
                    result.authFailures[extId] = {};
                }
                result.authFailures[extId][code] = count;
            }
        }

        for (const [extId, sizes] of this.metrics.intentSizes.entries()) {
            if (!extensionId || extId === extensionId) {
                const avgRequest = sizes.requests.length > 0
                    ? sizes.requests.reduce((a, b) => a + b, 0) / sizes.requests.length
                    : 0;
                const avgResponse = sizes.responses.length > 0
                    ? sizes.responses.reduce((a, b) => a + b, 0) / sizes.responses.length
                    : 0;
                
                result.intentSizes[extId] = {
                    avgRequestSize: Math.round(avgRequest),
                    avgResponseSize: Math.round(avgResponse),
                    totalRequests: sizes.requests.length,
                    totalResponses: sizes.responses.length
                };
            }
        }

        return result;
    }

    reset(extensionId = null) {
        if (extensionId) {
            for (const [key] of this.metrics.requestCount.entries()) {
                if (key.startsWith(extensionId + ':')) {
                    this.metrics.requestCount.delete(key);
                }
            }
            for (const [key] of this.metrics.latencies.entries()) {
                if (key.startsWith(extensionId + ':')) {
                    this.metrics.latencies.delete(key);
                }
            }
            this.metrics.rateLimitViolations.delete(extensionId);
            for (const [key] of this.metrics.validationFailures.entries()) {
                if (key.startsWith(extensionId + ':')) {
                    this.metrics.validationFailures.delete(key);
                }
            }
            for (const [key] of this.metrics.authFailures.entries()) {
                if (key.startsWith(extensionId + ':')) {
                    this.metrics.authFailures.delete(key);
                }
            }
            this.metrics.intentSizes.delete(extensionId);
        } else {
            this.metrics.requestCount.clear();
            this.metrics.latencies.clear();
            this.metrics.rateLimitViolations.clear();
            this.metrics.validationFailures.clear();
            this.metrics.authFailures.clear();
            this.metrics.intentSizes.clear();
        }
    }
}

class TelemetryServer {
    constructor(telemetry, port = 9876, options = {}) {
        this.telemetry = telemetry;
        this.port = port;
        this.server = null;
        this.wsClients = new Set();
        this.startTime = Date.now();
        this.gateway = null;
        this.spanBuffer = [];
        this.spanDebounceTimer = null;
        this.spanDebounceDelay = 100;
        this.heartbeatInterval = null;
        this.heartbeatDelay = 30000;
        this.exporters = {
            otlp: null,
            prometheus: null
        };
        
        this.debuggerManager = options.debuggerManager || null;
        this.profilingManager = options.profilingManager || null;
        this.devMode = options.devMode || null;
        this.runtime = options.runtime || null;
        this.pipeline = options.pipeline || null;
        this.advancedRateLimiting = options.advancedRateLimiting || null;
        
        this.authManager = options.authManager || null;
        this.requireAuth = options.requireAuth !== false;
        this.publicEndpoints = new Set(['/health', '/metrics']);
        
        this._loadExporterConfig();
    }

    _loadExporterConfig() {
        try {
            if (fs.existsSync(CONFIG_FILE)) {
                const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
                this.exporterConfig = config.exporters || {};
            } else {
                this.exporterConfig = {};
            }
        } catch (error) {
            this.exporterConfig = {};
        }
    }

    setGateway(gateway) {
        this.gateway = gateway;
    }

    start() {
        this.server = http.createServer((req, res) => {
            this._handleHttpRequest(req, res);
        });

        this.server.on('upgrade', (req, socket, head) => {
            this._handleWebSocketUpgrade(req, socket, head);
        });

        this.server.listen(this.port, () => {
            console.log(`[TelemetryServer] HTTP/WebSocket server listening on port ${this.port}`);
        });

        this._startHeartbeat();
        this._initializeExporters();

        return this.server;
    }

    _initializeExporters() {
        try {
            const OTLPExporter = require('./exporters/otlp-exporter');
            const PrometheusExporter = require('./exporters/prometheus-exporter');

            if (this.exporterConfig.otlp && this.exporterConfig.otlp.endpoint) {
                this.exporters.otlp = new OTLPExporter(
                    this.exporterConfig.otlp,
                    this.telemetry.metrics,
                    this.telemetry
                );
                this.exporters.otlp.start();
            }

            if (this.exporterConfig.prometheus && this.exporterConfig.prometheus.enabled) {
                this.exporters.prometheus = new PrometheusExporter(
                    this.telemetry.metrics,
                    this.telemetry
                );
                this.exporters.prometheus.enable();
            }
        } catch (error) {
            console.error('[TelemetryServer] Failed to initialize exporters:', error.message);
        }
    }

    stop() {
        if (this.server) {
            this._stopHeartbeat();
            this._stopExporters();
            
            if (this.spanDebounceTimer) {
                clearTimeout(this.spanDebounceTimer);
                this.spanDebounceTimer = null;
            }
            
            for (const client of this.wsClients) {
                client.close();
            }
            this.wsClients.clear();
            
            this.server.close(() => {
                console.log('[TelemetryServer] Server stopped');
            });
        }
    }

    _stopExporters() {
        if (this.exporters.otlp) {
            this.exporters.otlp.stop();
        }
        if (this.exporters.prometheus) {
            this.exporters.prometheus.disable();
        }
    }

    _handleHttpRequest(req, res) {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Access-Control-Allow-Origin', '*');

        if (req.method === 'OPTIONS') {
            res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
            res.writeHead(204);
            res.end();
            return;
        }

        if (this.requireAuth && this.authManager && !this.publicEndpoints.has(req.url)) {
            const authResult = this.authManager.authenticateRequest(req);
            if (!authResult.authenticated) {
                res.writeHead(401);
                res.end(JSON.stringify({ 
                    error: 'Unauthorized', 
                    message: authResult.error 
                }));
                return;
            }
            req.authUser = authResult.user || authResult.name;
            req.authType = authResult.type;
        }

        if (req.url === '/health') {
            res.writeHead(200);
            res.end(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }));
            return;
        }

        if (req.url === '/extensions') {
            const extensions = this._getExtensionsWithState();
            res.writeHead(200);
            res.end(JSON.stringify(extensions, null, 2));
            return;
        }

        if (req.url === '/gateway/status') {
            const status = this._getGatewayStatus();
            res.writeHead(200);
            res.end(JSON.stringify(status, null, 2));
            return;
        }

        if (req.url === '/metrics' || req.url.startsWith('/metrics/')) {
            if (req.url === '/metrics' && this.exporters.prometheus && this.exporters.prometheus.isEnabled()) {
                res.setHeader('Content-Type', 'text/plain; version=0.0.4');
                res.writeHead(200);
                res.end(this.exporters.prometheus.getMetricsText());
                return;
            }
            const extensionId = req.url.split('/')[2] || null;
            const metrics = this.telemetry.metrics.getMetrics(extensionId);
            res.writeHead(200);
            res.end(JSON.stringify(metrics, null, 2));
            return;
        }

        if (req.url === '/spans') {
            const spans = this.telemetry.getRecentSpans(100);
            res.writeHead(200);
            res.end(JSON.stringify(spans, null, 2));
            return;
        }

        if (req.url.startsWith('/logs')) {
            const url = new URL(req.url, `http://localhost:${this.port}`);
            const severity = url.searchParams.get('severity');
            const date = url.searchParams.get('date');
            const extensionId = url.searchParams.get('extensionId');
            const requestId = url.searchParams.get('requestId');
            const layer = url.searchParams.get('layer');
            const errorCode = url.searchParams.get('errorCode');
            const limit = parseInt(url.searchParams.get('limit') || '100');
            const logs = this.telemetry.logger.readLogs({ 
                severity, 
                date, 
                extensionId, 
                requestId, 
                layer, 
                errorCode, 
                limit 
            });
            res.writeHead(200);
            res.end(JSON.stringify(logs, null, 2));
            return;
        }

        // Developer tools endpoints
        if (req.url.startsWith('/api/')) {
            this._handleAPIRequest(req, res);
            return;
        }

        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Not found' }));
    }

    _handleAPIRequest(req, res) {
        let body = '';
        
        req.on('data', chunk => {
            body += chunk.toString();
        });

        req.on('end', async () => {
            try {
                const parsedBody = body ? JSON.parse(body) : {};
                await this._routeAPIRequest(req, res, parsedBody);
            } catch (error) {
                res.writeHead(400);
                res.end(JSON.stringify({ error: 'Invalid JSON' }));
            }
        });
    }

    async _routeAPIRequest(req, res, body) {
        const [, , resource, ...pathParts] = req.url.split('/');

        // Debugger endpoints
        if (resource === 'debugger') {
            if (!this.debuggerManager) {
                res.writeHead(503);
                res.end(JSON.stringify({ error: 'Debugger not available' }));
                return;
            }

            const extensionId = pathParts[0];
            const action = pathParts[1];

            if (req.method === 'GET' && !action) {
                const dbg = this.debuggerManager.getDebugger(extensionId);
                if (!dbg) {
                    res.writeHead(200);
                    res.end(JSON.stringify({ isAttached: false, inspectorUrl: null, debugPort: null, breakpoints: [], pid: null }));
                    return;
                }
                res.writeHead(200);
                res.end(JSON.stringify(dbg.getDebugInfo()));
                return;
            }

            if (req.method === 'POST' && action === 'attach') {
                try {
                    const extensionProcess = this.runtime ? this.runtime.extensions.get(extensionId) : null;
                    if (!extensionProcess) {
                        res.writeHead(404);
                        res.end(JSON.stringify({ error: 'Extension not found' }));
                        return;
                    }
                    const result = await this.debuggerManager.attachDebugger(extensionId, extensionProcess);
                    res.writeHead(200);
                    res.end(JSON.stringify(result));
                } catch (error) {
                    res.writeHead(500);
                    res.end(JSON.stringify({ error: error.message }));
                }
                return;
            }

            if (req.method === 'POST' && action === 'detach') {
                this.debuggerManager.detachDebugger(extensionId);
                res.writeHead(200);
                res.end(JSON.stringify({ success: true }));
                return;
            }

            if (req.method === 'POST' && action === 'breakpoint') {
                const dbg = this.debuggerManager.getDebugger(extensionId);
                if (!dbg) {
                    res.writeHead(404);
                    res.end(JSON.stringify({ error: 'Debugger not attached' }));
                    return;
                }
                const { scriptPath, line, condition } = body;
                const breakpoint = dbg.addBreakpoint(scriptPath, line, condition);
                res.writeHead(200);
                res.end(JSON.stringify(breakpoint));
                return;
            }

            if (req.method === 'DELETE' && action === 'breakpoint') {
                const dbg = this.debuggerManager.getDebugger(extensionId);
                const breakpointId = pathParts[2];
                if (!dbg) {
                    res.writeHead(404);
                    res.end(JSON.stringify({ error: 'Debugger not attached' }));
                    return;
                }
                const removed = dbg.removeBreakpoint(breakpointId);
                res.writeHead(200);
                res.end(JSON.stringify({ success: removed }));
                return;
            }
        }

        // Profiling endpoints
        if (resource === 'profiling') {
            if (!this.profilingManager) {
                res.writeHead(503);
                res.end(JSON.stringify({ error: 'Profiling not available' }));
                return;
            }

            if (pathParts[0] === 'metrics') {
                const metrics = this.profilingManager.getAllMetrics();
                res.writeHead(200);
                res.end(JSON.stringify(metrics));
                return;
            }

            if (pathParts[0] === 'flamegraph') {
                const extensionId = pathParts[1];
                const profiler = this.profilingManager.getProfiler(extensionId);
                if (!profiler) {
                    res.writeHead(404);
                    res.end(JSON.stringify({ error: 'Profiler not found' }));
                    return;
                }
                const flamegraph = profiler.generateFlamegraph();
                res.writeHead(200);
                res.end(JSON.stringify(flamegraph));
                return;
            }

            if (req.method === 'POST' && pathParts[0] === 'reset') {
                const extensionId = pathParts[1];
                this.profilingManager.reset(extensionId);
                res.writeHead(200);
                res.end(JSON.stringify({ success: true }));
                return;
            }
        }

        // Playground endpoints
        if (resource === 'playground') {
            if (req.method === 'POST' && pathParts[0] === 'validate') {
                const { extensionId, intent } = body;
                
                const errors = [];
                if (!intent.type) errors.push({ field: 'type', message: 'Intent type is required' });
                if (!intent.operation) errors.push({ field: 'operation', message: 'Operation is required' });
                if (!intent.params) errors.push({ field: 'params', message: 'Parameters are required' });

                if (errors.length > 0) {
                    res.writeHead(200);
                    res.end(JSON.stringify({ success: false, validationErrors: errors }));
                    return;
                }

                res.writeHead(200);
                res.end(JSON.stringify({ success: true, message: 'Intent is valid' }));
                return;
            }

            if (req.method === 'POST' && pathParts[0] === 'execute') {
                if (!this.pipeline) {
                    res.writeHead(503);
                    res.end(JSON.stringify({ error: 'Pipeline not available' }));
                    return;
                }

                try {
                    const { extensionId, intent } = body;
                    const result = await this.pipeline.process(intent, { extensionId });
                    res.writeHead(200);
                    res.end(JSON.stringify({ success: true, result }));
                } catch (error) {
                    res.writeHead(500);
                    res.end(JSON.stringify({ success: false, error: error.message }));
                }
                return;
            }
        }

        // Dev mode endpoints
        if (resource === 'devmode') {
            if (!this.devMode) {
                res.writeHead(503);
                res.end(JSON.stringify({ error: 'Dev mode not available' }));
                return;
            }

            if (req.method === 'GET' && pathParts[0] === 'status') {
                res.writeHead(200);
                res.end(JSON.stringify(this.devMode.getConfig()));
                return;
            }

            if (req.method === 'POST' && pathParts[0] === 'enable') {
                this.devMode.enable();
                res.writeHead(200);
                res.end(JSON.stringify({ success: true, enabled: true }));
                return;
            }

            if (req.method === 'POST' && pathParts[0] === 'disable') {
                this.devMode.disable();
                res.writeHead(200);
                res.end(JSON.stringify({ success: true, enabled: false }));
                return;
            }
        }

        // Rate limiting endpoints
        if (resource === 'rate-limiting') {
            if (!this.advancedRateLimiting) {
                res.writeHead(503);
                res.end(JSON.stringify({ error: 'Advanced rate limiting not available' }));
                return;
            }

            if (req.method === 'GET' && pathParts[0] === 'dashboard') {
                const dashboard = this.advancedRateLimiting.getDashboard();
                res.writeHead(200);
                res.end(JSON.stringify(dashboard));
                return;
            }

            if (req.method === 'GET' && pathParts[0] === 'extension' && pathParts[1]) {
                const extensionId = pathParts[1];
                const state = this.advancedRateLimiting.getExtensionState(extensionId);
                res.writeHead(200);
                res.end(JSON.stringify(state));
                return;
            }

            if (req.method === 'GET' && pathParts[0] === 'global') {
                const state = this.advancedRateLimiting.getGlobalState();
                res.writeHead(200);
                res.end(JSON.stringify(state));
                return;
            }

            if (req.method === 'GET' && pathParts[0] === 'analytics') {
                const analytics = this.advancedRateLimiting.analytics ? 
                    this.advancedRateLimiting.analytics.generateDashboardData() : null;
                res.writeHead(200);
                res.end(JSON.stringify(analytics));
                return;
            }

            if (req.method === 'POST' && pathParts[0] === 'reset' && pathParts[1]) {
                const extensionId = pathParts[1];
                this.advancedRateLimiting.reset(extensionId);
                res.writeHead(200);
                res.end(JSON.stringify({ success: true }));
                return;
            }
        }

        res.writeHead(404);
        res.end(JSON.stringify({ error: 'API endpoint not found' }));
    }

    _handleWebSocketUpgrade(req, socket, head) {
        const key = req.headers['sec-websocket-key'];
        if (!key) {
            socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
            return;
        }

        const accept = this._generateWebSocketAccept(key);
        const responseHeaders = [
            'HTTP/1.1 101 Switching Protocols',
            'Upgrade: websocket',
            'Connection: Upgrade',
            `Sec-WebSocket-Accept: ${accept}`,
            '',
            ''
        ].join('\r\n');

        socket.write(responseHeaders);
        
        const client = {
            socket,
            subscriptions: new Set(),
            lastPing: Date.now(),
            alive: true,
            close: () => socket.end()
        };
        
        this.wsClients.add(client);

        socket.on('data', (data) => {
            this._handleWebSocketMessage(client, data);
        });

        socket.on('close', () => {
            this.wsClients.delete(client);
        });

        socket.on('error', (error) => {
            console.error('[TelemetryServer] WebSocket error:', error.message);
            this.wsClients.delete(client);
        });
    }

    _generateWebSocketAccept(key) {
        const crypto = require('crypto');
        const MAGIC_STRING = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
        const hash = crypto.createHash('sha1');
        hash.update(key + MAGIC_STRING);
        return hash.digest('base64');
    }

    broadcast(event, data) {
        if (this.wsClients.size === 0) return;

        if (event === 'span') {
            this._bufferSpan(data);
            return;
        }

        const message = JSON.stringify({ event, data, timestamp: Date.now() });
        const frame = this._encodeWebSocketFrame(message);

        for (const client of this.wsClients) {
            if (client.subscriptions.size === 0 || client.subscriptions.has(event)) {
                try {
                    client.socket.write(frame);
                } catch (error) {
                    this.wsClients.delete(client);
                }
            }
        }
    }

    _bufferSpan(spanData) {
        this.spanBuffer.push(spanData);

        if (this.spanDebounceTimer) {
            clearTimeout(this.spanDebounceTimer);
        }

        this.spanDebounceTimer = setTimeout(() => {
            this._flushSpanBuffer();
        }, this.spanDebounceDelay);
    }

    _flushSpanBuffer() {
        if (this.spanBuffer.length === 0) return;

        const spans = [...this.spanBuffer];
        this.spanBuffer = [];
        this.spanDebounceTimer = null;

        const message = JSON.stringify({ 
            event: 'span', 
            data: spans.length === 1 ? spans[0] : spans, 
            batch: spans.length > 1,
            count: spans.length,
            timestamp: Date.now() 
        });
        const frame = this._encodeWebSocketFrame(message);

        for (const client of this.wsClients) {
            if (client.subscriptions.size === 0 || client.subscriptions.has('span')) {
                try {
                    client.socket.write(frame);
                } catch (error) {
                    this.wsClients.delete(client);
                }
            }
        }
    }

    _encodeWebSocketFrame(message, opcode = 0x81) {
        const buffer = Buffer.from(message);
        const length = buffer.length;
        let frame;

        if (length < 126) {
            frame = Buffer.allocUnsafe(2 + length);
            frame[0] = opcode;
            frame[1] = length;
            buffer.copy(frame, 2);
        } else if (length < 65536) {
            frame = Buffer.allocUnsafe(4 + length);
            frame[0] = opcode;
            frame[1] = 126;
            frame.writeUInt16BE(length, 2);
            buffer.copy(frame, 4);
        } else {
            frame = Buffer.allocUnsafe(10 + length);
            frame[0] = opcode;
            frame[1] = 127;
            frame.writeUInt32BE(0, 2);
            frame.writeUInt32BE(length, 6);
            buffer.copy(frame, 10);
        }

        return frame;
    }

    _handleWebSocketMessage(client, data) {
        try {
            const firstByte = data[0];
            const opcode = firstByte & 0x0F;

            if (opcode === 0x09) {
                this._handlePing(client, data);
                return;
            }

            if (opcode === 0x0A) {
                this._handlePong(client);
                return;
            }

            if (opcode === 0x01 || opcode === 0x02) {
                const isMasked = (data[1] & 0x80) !== 0;
                if (!isMasked) return;

                let payloadLength = data[1] & 0x7F;
                let maskStart = 2;

                if (payloadLength === 126) {
                    payloadLength = data.readUInt16BE(2);
                    maskStart = 4;
                } else if (payloadLength === 127) {
                    payloadLength = data.readUInt32BE(6);
                    maskStart = 10;
                }

                const mask = data.slice(maskStart, maskStart + 4);
                const payload = data.slice(maskStart + 4, maskStart + 4 + payloadLength);

                for (let i = 0; i < payload.length; i++) {
                    payload[i] ^= mask[i % 4];
                }

                const message = JSON.parse(payload.toString('utf8'));
                this._handleClientMessage(client, message);
            }
        } catch (error) {
        }
    }

    _handleClientMessage(client, message) {
        if (message.type === 'subscribe' && Array.isArray(message.events)) {
            for (const event of message.events) {
                client.subscriptions.add(event);
            }
        } else if (message.type === 'unsubscribe' && Array.isArray(message.events)) {
            for (const event of message.events) {
                client.subscriptions.delete(event);
            }
        } else if (message.type === 'clear_subscriptions') {
            client.subscriptions.clear();
        }
    }

    _handlePing(client, data) {
        const pongFrame = Buffer.from(data);
        pongFrame[0] = (pongFrame[0] & 0xF0) | 0x0A;
        try {
            client.socket.write(pongFrame);
        } catch (error) {
            this.wsClients.delete(client);
        }
    }

    _handlePong(client) {
        client.alive = true;
        client.lastPing = Date.now();
    }

    _startHeartbeat() {
        this.heartbeatInterval = setInterval(() => {
            this._sendHeartbeats();
        }, this.heartbeatDelay);
    }

    _stopHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    }

    _sendHeartbeats() {
        const pingFrame = Buffer.allocUnsafe(2);
        pingFrame[0] = 0x89;
        pingFrame[1] = 0x00;

        for (const client of this.wsClients) {
            if (client.alive === false) {
                client.close();
                this.wsClients.delete(client);
                continue;
            }

            client.alive = false;
            try {
                client.socket.write(pingFrame);
            } catch (error) {
                this.wsClients.delete(client);
            }
        }
    }

    _getExtensionsWithState() {
        if (!this.gateway) {
            return [];
        }

        const extensions = [];
        for (const [id, ext] of this.gateway.extensions) {
            const extensionData = {
                id: ext.manifest.id,
                name: ext.manifest.name,
                version: ext.manifest.version,
                capabilities: ext.manifest.capabilities,
                runtime: {
                    loaded: !!ext.instance,
                    hasCleanup: ext.instance && typeof ext.instance.cleanup === 'function'
                }
            };
            extensions.push(extensionData);
        }

        return extensions;
    }

    _getGatewayStatus() {
        const uptime = Date.now() - this.startTime;
        const extensionsLoaded = this.gateway ? this.gateway.extensions.size : 0;
        
        const metrics = this.telemetry.metrics.getMetrics();
        
        const totalRequests = Object.values(metrics.requests || {}).reduce((sum, extMetrics) => {
            return sum + Object.values(extMetrics).reduce((s, count) => s + count, 0);
        }, 0);
        
        const totalRateLimitViolations = Object.values(metrics.rateLimitViolations || {})
            .reduce((sum, count) => sum + count, 0);
        
        const totalValidationFailures = Object.values(metrics.validationFailures || {}).reduce((sum, extMetrics) => {
            return sum + Object.values(extMetrics).reduce((s, count) => s + count, 0);
        }, 0);
        
        const totalAuthFailures = Object.values(metrics.authFailures || {}).reduce((sum, extMetrics) => {
            return sum + Object.values(extMetrics).reduce((s, count) => s + count, 0);
        }, 0);

        const packageJson = require('../package.json');

        return {
            version: packageJson.version,
            uptime: uptime,
            uptimeFormatted: this._formatUptime(uptime),
            extensionsLoaded: extensionsLoaded,
            pipeline: {
                totalRequests: totalRequests,
                totalRateLimitViolations: totalRateLimitViolations,
                totalValidationFailures: totalValidationFailures,
                totalAuthFailures: totalAuthFailures
            },
            telemetry: {
                spansCollected: this.telemetry.spans.length,
                maxSpans: this.telemetry.maxSpans,
                wsConnections: this.wsClients.size
            }
        };
    }

    _formatUptime(uptimeMs) {
        const seconds = Math.floor(uptimeMs / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);
        
        if (days > 0) {
            return `${days}d ${hours % 24}h ${minutes % 60}m`;
        } else if (hours > 0) {
            return `${hours}h ${minutes % 60}m`;
        } else if (minutes > 0) {
            return `${minutes}m ${seconds % 60}s`;
        } else {
            return `${seconds}s`;
        }
    }
}

class Telemetry {
    constructor(options = {}) {
        this.logger = new StructuredLogger(options.logDir);
        this.metrics = new MetricsCollector();
        this.spans = [];
        this.maxSpans = options.maxSpans || 1000;
        this.server = null;
        this.enabled = options.enabled !== false;
    }

    startSpan(name, parentSpan = null) {
        if (!this.enabled) {
            return new Span(name, parentSpan);
        }

        const span = new Span(name, parentSpan);
        this.spans.push(span);
        
        if (this.spans.length > this.maxSpans) {
            this.spans.shift();
        }

        return span;
    }

    recordSpan(span) {
        if (!this.enabled) return;

        if (span.endTime === null) {
            span.end();
        }

        const extensionId = span.attributes.extensionId;
        const stage = span.name;
        const latency = span.duration;

        if (extensionId && stage) {
            this.metrics.recordRequest(extensionId, stage, latency);
        }

        const layerName = this._extractLayerFromSpanName(span.name);

        this.logger.info('Span completed', {
            spanId: span.spanId,
            traceId: span.traceId,
            name: span.name,
            duration: span.duration,
            attributes: span.attributes,
            status: span.status,
            extensionId: extensionId,
            requestId: span.attributes.requestId,
            layer: layerName,
            errorCode: span.attributes['error.code']
        });

        if (this.server) {
            this.server.broadcast('span', span.toJSON());
        }
    }

    _extractLayerFromSpanName(spanName) {
        if (!spanName) return null;
        
        if (spanName.includes('intercept')) return 'Intercept';
        if (spanName.includes('auth')) return 'Auth';
        if (spanName.includes('audit')) return 'Audit';
        if (spanName.includes('execute')) return 'Execute';
        
        return null;
    }

    getRecentSpans(limit = 100) {
        return this.spans.slice(-limit).map(span => span.toJSON());
    }

    startServer(port = 9876, options = {}) {
        if (this.server) {
            console.warn('[Telemetry] Server already running');
            return this.server;
        }

        this.server = new TelemetryServer(this, port, options);
        return this.server.start();
    }

    stopServer() {
        if (this.server) {
            this.server.stop();
            this.server = null;
        }
    }

    setGateway(gateway) {
        if (this.server) {
            this.server.setGateway(gateway);
        }
    }
}

class InstrumentedPipeline {
    constructor(pipeline, telemetry) {
        this.pipeline = pipeline;
        this.telemetry = telemetry;
    }

    async process(rawMessage) {
        const rootSpan = this.telemetry.startSpan('pipeline.process');
        const rawMessagePreview = typeof rawMessage === 'string' 
            ? rawMessage.substring(0, 200) 
            : JSON.stringify(rawMessage).substring(0, 200);
        rootSpan.setAttribute('rawMessage', rawMessagePreview);

        let intent;
        let extensionId;
        let requestSize = 0;

        const interceptSpan = this.telemetry.startSpan('pipeline.intercept', rootSpan);
        const interceptStartTime = Date.now();
        try {
            intent = this.pipeline.interceptor.intercept(rawMessage);
            extensionId = intent.extensionId;
            requestSize = JSON.stringify(intent).length;
            
            interceptSpan.setAttributes({
                extensionId,
                requestId: intent.requestId,
                type: intent.type,
                operation: intent.operation
            });

            this._addIntentSpecificMetadata(interceptSpan, intent);

            interceptSpan.setStatus('OK');
            interceptSpan.end();
            const interceptLatency = Date.now() - interceptStartTime;
            this.telemetry.metrics.recordRequest(extensionId, 'intercept', interceptLatency);
            this.telemetry.recordSpan(interceptSpan);
        } catch (error) {
            interceptSpan.setStatus('ERROR', error.message);
            interceptSpan.setAttribute('error.type', error.name || 'Error');
            interceptSpan.setAttribute('error.code', error.code || 'UNKNOWN');
            interceptSpan.end();
            const interceptLatency = Date.now() - interceptStartTime;
            if (extensionId) {
                this.telemetry.metrics.recordRequest(extensionId, 'intercept', interceptLatency);
            }
            this.telemetry.recordSpan(interceptSpan);
            this.telemetry.logger.error('Intercept failed', { 
                error: error.message,
                layer: 'Intercept',
                errorCode: error.code || 'PIPELINE_INTERCEPT_ERROR'
            });
            
            rootSpan.setStatus('ERROR', 'Intercept failed');
            rootSpan.end();
            this.telemetry.recordSpan(rootSpan);

            return {
                success: false,
                stage: 'INTERCEPT',
                error: error.message,
                code: 'PIPELINE_INTERCEPT_ERROR'
            };
        }

        rootSpan.setAttributes({
            extensionId,
            requestId: intent.requestId,
            type: intent.type,
            operation: intent.operation
        });

        const authSpan = this.telemetry.startSpan('pipeline.auth', rootSpan);
        const authStartTime = Date.now();
        authSpan.setAttributes({
            extensionId,
            requestId: intent.requestId,
            type: intent.type,
            operation: intent.operation
        });

        this._addIntentSpecificMetadata(authSpan, intent);

        const authResult = this.pipeline.authLayer.authorize(intent);
        authSpan.setAttribute('authorized', authResult.authorized);

        if (!authResult.authorized) {
            authSpan.setStatus('ERROR', authResult.reason);
            authSpan.setAttribute('error.code', authResult.code);
            authSpan.setAttribute('denial.reason', authResult.reason);
            authSpan.end();
            const authLatency = Date.now() - authStartTime;
            this.telemetry.metrics.recordRequest(extensionId, 'auth', authLatency);
            this.telemetry.recordSpan(authSpan);

            this.telemetry.metrics.recordAuthFailure(extensionId, authResult.code);
            
            if (authResult.code === 'AUTH_RATE_LIMIT') {
                this.telemetry.metrics.recordRateLimitViolation(extensionId);
                authSpan.addEvent('rate_limit_exceeded', {
                    extensionId,
                    requestId: intent.requestId
                });
                this.telemetry.logger.warn('Rate limit exceeded', {
                    extensionId,
                    requestId: intent.requestId,
                    layer: 'Auth',
                    errorCode: authResult.code
                });
            } else {
                this.telemetry.logger.securityAlert('Authorization denied', {
                    extensionId,
                    requestId: intent.requestId,
                    reason: authResult.reason,
                    code: authResult.code,
                    layer: 'Auth',
                    errorCode: authResult.code
                });
            }

            const rateLimitState = this.pipeline.getRateLimitState(extensionId);
            if (rateLimitState) {
                authSpan.setAttribute('rateLimit.available', rateLimitState.available);
                authSpan.setAttribute('rateLimit.capacity', rateLimitState.capacity);
                
                if (rateLimitState.available < rateLimitState.capacity * 0.1) {
                    authSpan.addEvent('rate_limit_warning', {
                        message: 'Rate limit tokens below 10% of capacity',
                        available: rateLimitState.available,
                        capacity: rateLimitState.capacity
                    });
                }
            }

            this.pipeline.auditLayer.logSecurityEvent(
                intent.extensionId,
                'AUTHORIZATION_DENIED',
                { reason: authResult.reason, code: authResult.code }
            );

            rootSpan.setStatus('ERROR', 'Authorization failed');
            rootSpan.end();
            this.telemetry.recordSpan(rootSpan);

            return {
                success: false,
                stage: 'AUTHORIZATION',
                error: authResult.reason,
                code: authResult.code,
                requestId: intent.requestId
            };
        }

        const rateLimitState = this.pipeline.getRateLimitState(extensionId);
        if (rateLimitState) {
            authSpan.setAttribute('rateLimit.available', rateLimitState.available);
            authSpan.setAttribute('rateLimit.capacity', rateLimitState.capacity);
            
            if (rateLimitState.available < rateLimitState.capacity * 0.1) {
                authSpan.addEvent('rate_limit_warning', {
                    message: 'Rate limit tokens below 10% of capacity',
                    available: rateLimitState.available,
                    capacity: rateLimitState.capacity
                });
            }
        }

        authSpan.setStatus('OK');
        authSpan.end();
        const authLatency = Date.now() - authStartTime;
        this.telemetry.metrics.recordRequest(extensionId, 'auth', authLatency);
        this.telemetry.recordSpan(authSpan);

        const auditSpan = this.telemetry.startSpan('pipeline.audit', rootSpan);
        const auditStartTime = Date.now();
        auditSpan.setAttributes({
            extensionId,
            requestId: intent.requestId,
            type: intent.type,
            operation: intent.operation
        });

        this._addIntentSpecificMetadata(auditSpan, intent);

        const manifest = this.pipeline.extensionManifests.get(intent.extensionId);
        const manifestCapabilities = manifest ? manifest.capabilities : null;
        
        const auditLayerWithCapabilities = new (require('./pipeline/audit').AuditLayer)(
            this.pipeline.auditLayer.logger.logPath, 
            manifestCapabilities
        );
        const auditResult = auditLayerWithCapabilities.audit(intent, authResult);
        auditSpan.setAttribute('passed', auditResult.passed);

        if (!auditResult.passed) {
            auditSpan.setStatus('ERROR', auditResult.reason);
            auditSpan.setAttribute('error.code', auditResult.code);
            auditSpan.setAttribute('violations', JSON.stringify(auditResult.violations));
            auditSpan.setAttribute('violation.count', auditResult.violations ? auditResult.violations.length : 0);
            
            if (auditResult.violations && auditResult.violations.length > 0) {
                for (let i = 0; i < Math.min(auditResult.violations.length, 5); i++) {
                    const violation = auditResult.violations[i];
                    auditSpan.setAttribute(`violation.${i}.rule`, violation.rule || 'unknown');
                    auditSpan.setAttribute(`violation.${i}.severity`, violation.severity || 'unknown');
                    auditSpan.setAttribute(`violation.${i}.message`, violation.message || 'unknown');
                }
            }

            auditSpan.end();
            const auditLatency = Date.now() - auditStartTime;
            this.telemetry.metrics.recordRequest(extensionId, 'audit', auditLatency);
            this.telemetry.recordSpan(auditSpan);

            this.telemetry.metrics.recordValidationFailure(extensionId, auditResult.code);
            this.telemetry.logger.securityAlert('Audit validation failed', {
                extensionId,
                requestId: intent.requestId,
                reason: auditResult.reason,
                violations: auditResult.violations,
                layer: 'Audit',
                errorCode: auditResult.code
            });

            rootSpan.setStatus('ERROR', 'Audit failed');
            rootSpan.end();
            this.telemetry.recordSpan(rootSpan);

            return {
                success: false,
                stage: 'AUDIT',
                error: auditResult.reason,
                code: auditResult.code,
                violations: auditResult.violations,
                requestId: intent.requestId
            };
        }

        if (auditResult.warnings && auditResult.warnings.length > 0) {
            auditSpan.addEvent('validation_warnings', { 
                warnings: JSON.stringify(auditResult.warnings),
                count: auditResult.warnings.length
            });
            auditSpan.setAttribute('warnings.count', auditResult.warnings.length);
            
            for (let i = 0; i < Math.min(auditResult.warnings.length, 3); i++) {
                const warning = auditResult.warnings[i];
                auditSpan.setAttribute(`warning.${i}`, typeof warning === 'string' ? warning : JSON.stringify(warning));
            }

            this.telemetry.logger.warn('Audit warnings', {
                extensionId,
                requestId: intent.requestId,
                warnings: auditResult.warnings,
                layer: 'Audit'
            });
        }

        auditSpan.setStatus('OK');
        auditSpan.end();
        const auditLatency = Date.now() - auditStartTime;
        this.telemetry.metrics.recordRequest(extensionId, 'audit', auditLatency);
        this.telemetry.recordSpan(auditSpan);

        const executeSpan = this.telemetry.startSpan('pipeline.execute', rootSpan);
        const executeStartTime = Date.now();
        executeSpan.setAttributes({
            extensionId,
            requestId: intent.requestId,
            type: intent.type,
            operation: intent.operation
        });

        this._addIntentSpecificMetadata(executeSpan, intent);

        const circuitBreakerState = this.pipeline.getCircuitBreakerState(intent.type);
        if (circuitBreakerState) {
            executeSpan.setAttribute('circuitBreaker.state', circuitBreakerState.state);
            executeSpan.setAttribute('circuitBreaker.failures', circuitBreakerState.failures);
            
            if (circuitBreakerState.state === 'OPEN') {
                executeSpan.addEvent('circuit_breaker_open', {
                    message: 'Circuit breaker is in OPEN state',
                    state: circuitBreakerState.state,
                    failures: circuitBreakerState.failures,
                    nextAttempt: circuitBreakerState.nextAttempt
                });
            } else if (circuitBreakerState.state === 'HALF_OPEN') {
                executeSpan.addEvent('circuit_breaker_half_open', {
                    message: 'Circuit breaker is in HALF_OPEN state',
                    state: circuitBreakerState.state
                });
            }
        }

        try {
            const result = await this.pipeline.executionLayer.execute(intent);
            
            const resultSize = JSON.stringify(result).length;
            executeSpan.setStatus('OK');
            executeSpan.setAttribute('resultSize', resultSize);
            executeSpan.setAttribute('success', true);
            
            const circuitBreakerAfter = this.pipeline.getCircuitBreakerState(intent.type);
            if (circuitBreakerAfter && circuitBreakerAfter.state === 'CLOSED' && 
                circuitBreakerState && circuitBreakerState.state !== 'CLOSED') {
                executeSpan.addEvent('circuit_breaker_closed', {
                    message: 'Circuit breaker transitioned to CLOSED state',
                    state: 'CLOSED'
                });
            }

            executeSpan.end();
            const executeLatency = Date.now() - executeStartTime;
            this.telemetry.metrics.recordRequest(extensionId, 'execute', executeLatency);
            this.telemetry.metrics.recordIntentSize(extensionId, requestSize, resultSize);
            this.telemetry.recordSpan(executeSpan);

            auditLayerWithCapabilities.logExecution(intent, result);
            this.telemetry.logger.info('Execution completed', {
                extensionId,
                requestId: intent.requestId,
                resultSize,
                layer: 'Execute'
            });

            rootSpan.setStatus('OK');
            rootSpan.setAttribute('resultSize', resultSize);
            rootSpan.end();
            this.telemetry.recordSpan(rootSpan);

            return {
                success: true,
                result,
                requestId: intent.requestId,
                warnings: auditResult.warnings
            };
        } catch (error) {
            executeSpan.setStatus('ERROR', error.message);
            executeSpan.setAttribute('error.type', error.name || 'Error');
            executeSpan.setAttribute('error.code', error.code || 'UNKNOWN');
            executeSpan.setAttribute('success', false);
            
            if (error.details) {
                executeSpan.setAttribute('error.details', JSON.stringify(error.details));
            }

            const circuitBreakerAfter = this.pipeline.getCircuitBreakerState(intent.type);
            if (circuitBreakerAfter) {
                executeSpan.setAttribute('circuitBreaker.state.after', circuitBreakerAfter.state);
                executeSpan.setAttribute('circuitBreaker.failures.after', circuitBreakerAfter.failures);
                
                if (circuitBreakerAfter.state === 'OPEN' && 
                    (!circuitBreakerState || circuitBreakerState.state !== 'OPEN')) {
                    executeSpan.addEvent('circuit_breaker_opened', {
                        message: 'Circuit breaker transitioned to OPEN state due to failures',
                        state: 'OPEN',
                        failures: circuitBreakerAfter.failures,
                        nextAttempt: circuitBreakerAfter.nextAttempt
                    });
                }
            }

            executeSpan.end();
            const executeLatency = Date.now() - executeStartTime;
            this.telemetry.metrics.recordRequest(extensionId, 'execute', executeLatency);
            this.telemetry.metrics.recordIntentSize(extensionId, requestSize, 0);
            this.telemetry.recordSpan(executeSpan);

            auditLayerWithCapabilities.logExecution(intent, null, error);
            this.telemetry.logger.error('Execution failed', {
                extensionId,
                requestId: intent.requestId,
                error: error.message,
                code: error.code,
                layer: 'Execute',
                errorCode: error.code || 'PIPELINE_EXECUTION_ERROR'
            });

            rootSpan.setStatus('ERROR', 'Execution failed');
            rootSpan.end();
            this.telemetry.recordSpan(rootSpan);

            return {
                success: false,
                stage: 'EXECUTION',
                error: error.message,
                code: error.code || 'PIPELINE_EXECUTION_ERROR',
                details: error.details,
                requestId: intent.requestId
            };
        }
    }

    _addIntentSpecificMetadata(span, intent) {
        if (!intent || !intent.params) return;

        if (intent.type === 'filesystem' && intent.params.path) {
            span.setAttribute('intent.target.path', intent.params.path);
            
            if (intent.params.content) {
                const contentSize = typeof intent.params.content === 'string' 
                    ? intent.params.content.length 
                    : JSON.stringify(intent.params.content).length;
                span.setAttribute('intent.request.size', contentSize);
            }
        }

        if (intent.type === 'network' && intent.params.url) {
            span.setAttribute('intent.target.url', intent.params.url);
            
            if (intent.params.data) {
                const dataSize = typeof intent.params.data === 'string'
                    ? intent.params.data.length
                    : JSON.stringify(intent.params.data).length;
                span.setAttribute('intent.request.size', dataSize);
            }
            
            if (intent.params.method) {
                span.setAttribute('intent.http.method', intent.params.method);
            }
        }

        if (intent.type === 'process' && intent.params.command) {
            span.setAttribute('intent.target.command', intent.params.command);
            
            if (intent.params.args) {
                const argsSize = Array.isArray(intent.params.args)
                    ? intent.params.args.join(' ').length
                    : String(intent.params.args).length;
                span.setAttribute('intent.request.size', argsSize);
            }
        }

        if (intent.type === 'git' && intent.params.command) {
            span.setAttribute('intent.target.command', intent.params.command);
        }
    }

    registerExtension(extensionId, manifest) {
        this.telemetry.logger.info('Extension registered', { extensionId, manifest });
        return this.pipeline.registerExtension(extensionId, manifest);
    }

    unregisterExtension(extensionId) {
        this.telemetry.logger.info('Extension unregistered', { extensionId });
        return this.pipeline.unregisterExtension(extensionId);
    }

    getAuditLogs(options) {
        return this.pipeline.getAuditLogs(options);
    }

    getRateLimitState(extensionId) {
        return this.pipeline.getRateLimitState(extensionId);
    }

    resetRateLimit(extensionId) {
        this.telemetry.logger.info('Rate limit reset', { extensionId });
        return this.pipeline.resetRateLimit(extensionId);
    }

    getCircuitBreakerState(type) {
        return this.pipeline.getCircuitBreakerState(type);
    }

    resetCircuitBreaker(type) {
        this.telemetry.logger.info('Circuit breaker reset', { type });
        return this.pipeline.resetCircuitBreaker(type);
    }

    getTrafficPolicerState(extensionId) {
        return this.pipeline.getTrafficPolicerState(extensionId);
    }

    getAllTrafficPolicerStates() {
        return this.pipeline.getAllTrafficPolicerStates();
    }

    resetTrafficPolicer(extensionId) {
        this.telemetry.logger.info('Traffic policer reset', { extensionId });
        return this.pipeline.resetTrafficPolicer(extensionId);
    }
}

function instrumentPipeline(pipeline, options = {}) {
    const telemetry = new Telemetry(options);
    const instrumentedPipeline = new InstrumentedPipeline(pipeline, telemetry);
    
    return {
        pipeline: instrumentedPipeline,
        telemetry
    };
}

module.exports = {
    Telemetry,
    Span,
    StructuredLogger,
    MetricsCollector,
    TelemetryServer,
    InstrumentedPipeline,
    instrumentPipeline,
    SEVERITY_LEVELS,
    TELEMETRY_DIR
};
