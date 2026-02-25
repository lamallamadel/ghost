const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');

const TELEMETRY_DIR = path.join(os.homedir(), '.ghost', 'telemetry');
const SEVERITY_LEVELS = {
    INFO: 'INFO',
    WARN: 'WARN',
    ERROR: 'ERROR',
    SECURITY_ALERT: 'SECURITY_ALERT'
};

const SECRET_FIELDS = ['api_key', 'apiKey', 'token', 'password', 'secret', 'auth', 'authorization', 'credentials'];

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
        this._ensureDirectory();
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

    log(severity, message, metadata = {}) {
        const sanitized = this._sanitizeMetadata(metadata);
        
        const entry = {
            timestamp: new Date().toISOString(),
            severity,
            message,
            extensionId: sanitized.extensionId || null,
            requestId: sanitized.requestId || null,
            layer: sanitized.layer || null,
            errorCode: sanitized.errorCode || sanitized.code || null,
            ...sanitized
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
}

class MetricsCollector {
    constructor() {
        this.metrics = {
            requestCount: new Map(),
            latencies: new Map(),
            rateLimitViolations: new Map(),
            validationFailures: new Map(),
            authFailures: new Map()
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

    getLatencyPercentiles(extensionId, stage) {
        const key = `${extensionId}:${stage}`;
        const latencies = this.metrics.latencies.get(key) || [];
        
        if (latencies.length === 0) {
            return { p50: 0, p95: 0, p99: 0 };
        }

        const sorted = [...latencies].sort((a, b) => a - b);
        return {
            p50: sorted[Math.floor(sorted.length * 0.5)],
            p95: sorted[Math.floor(sorted.length * 0.95)],
            p99: sorted[Math.floor(sorted.length * 0.99)]
        };
    }

    getMetrics(extensionId = null) {
        const result = {
            requests: {},
            latencies: {},
            rateLimitViolations: {},
            validationFailures: {},
            authFailures: {}
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
        } else {
            this.metrics.requestCount.clear();
            this.metrics.latencies.clear();
            this.metrics.rateLimitViolations.clear();
            this.metrics.validationFailures.clear();
            this.metrics.authFailures.clear();
        }
    }
}

class TelemetryServer {
    constructor(telemetry, port = 9876) {
        this.telemetry = telemetry;
        this.port = port;
        this.server = null;
        this.wsClients = new Set();
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

        return this.server;
    }

    stop() {
        if (this.server) {
            for (const client of this.wsClients) {
                client.close();
            }
            this.wsClients.clear();
            
            this.server.close(() => {
                console.log('[TelemetryServer] Server stopped');
            });
        }
    }

    _handleHttpRequest(req, res) {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Access-Control-Allow-Origin', '*');

        if (req.method === 'OPTIONS') {
            res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
            res.writeHead(204);
            res.end();
            return;
        }

        if (req.url === '/health') {
            res.writeHead(200);
            res.end(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }));
            return;
        }

        if (req.url === '/metrics' || req.url.startsWith('/metrics/')) {
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

        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Not found' }));
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
            close: () => socket.end()
        };
        
        this.wsClients.add(client);

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

        const message = JSON.stringify({ event, data, timestamp: Date.now() });
        const frame = this._encodeWebSocketFrame(message);

        for (const client of this.wsClients) {
            try {
                client.socket.write(frame);
            } catch (error) {
                this.wsClients.delete(client);
            }
        }
    }

    _encodeWebSocketFrame(message) {
        const buffer = Buffer.from(message);
        const length = buffer.length;
        let frame;

        if (length < 126) {
            frame = Buffer.allocUnsafe(2 + length);
            frame[0] = 0x81;
            frame[1] = length;
            buffer.copy(frame, 2);
        } else if (length < 65536) {
            frame = Buffer.allocUnsafe(4 + length);
            frame[0] = 0x81;
            frame[1] = 126;
            frame.writeUInt16BE(length, 2);
            buffer.copy(frame, 4);
        } else {
            frame = Buffer.allocUnsafe(10 + length);
            frame[0] = 0x81;
            frame[1] = 127;
            frame.writeUInt32BE(0, 2);
            frame.writeUInt32BE(length, 6);
            buffer.copy(frame, 10);
        }

        return frame;
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

    startServer(port = 9876) {
        if (this.server) {
            console.warn('[Telemetry] Server already running');
            return this.server;
        }

        this.server = new TelemetryServer(this, port);
        return this.server.start();
    }

    stopServer() {
        if (this.server) {
            this.server.stop();
            this.server = null;
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

        const interceptSpan = this.telemetry.startSpan('pipeline.intercept', rootSpan);
        try {
            intent = this.pipeline.interceptor.intercept(rawMessage);
            extensionId = intent.extensionId;
            
            interceptSpan.setAttributes({
                extensionId,
                requestId: intent.requestId,
                type: intent.type,
                operation: intent.operation
            });

            this._addIntentSpecificMetadata(interceptSpan, intent);

            interceptSpan.setStatus('OK');
            interceptSpan.end();
            this.telemetry.recordSpan(interceptSpan);
        } catch (error) {
            interceptSpan.setStatus('ERROR', error.message);
            interceptSpan.setAttribute('error.type', error.name || 'Error');
            interceptSpan.setAttribute('error.code', error.code || 'UNKNOWN');
            interceptSpan.end();
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
        this.telemetry.recordSpan(authSpan);

        const auditSpan = this.telemetry.startSpan('pipeline.audit', rootSpan);
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
        this.telemetry.recordSpan(auditSpan);

        const executeSpan = this.telemetry.startSpan('pipeline.execute', rootSpan);
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
