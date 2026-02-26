class PrometheusExporter {
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
            return '# Prometheus exporter is disabled\n';
        }

        const allMetrics = this.metricsCollector.getMetrics();
        const lines = [];

        lines.push('# HELP ghost_requests_total Total number of requests by extension and stage');
        lines.push('# TYPE ghost_requests_total counter');
        for (const [extensionId, stages] of Object.entries(allMetrics.requests || {})) {
            for (const [stage, count] of Object.entries(stages)) {
                lines.push(`ghost_requests_total{extensionId="${this._escapeLabel(extensionId)}",stage="${this._escapeLabel(stage)}"} ${count}`);
            }
        }
        lines.push('');

        lines.push('# HELP ghost_request_latency_milliseconds Request latency percentiles in milliseconds');
        lines.push('# TYPE ghost_request_latency_milliseconds gauge');
        for (const [extensionId, stages] of Object.entries(allMetrics.latencies || {})) {
            for (const [stage, percentiles] of Object.entries(stages)) {
                lines.push(`ghost_request_latency_milliseconds{extensionId="${this._escapeLabel(extensionId)}",stage="${this._escapeLabel(stage)}",quantile="0.5"} ${percentiles.p50}`);
                lines.push(`ghost_request_latency_milliseconds{extensionId="${this._escapeLabel(extensionId)}",stage="${this._escapeLabel(stage)}",quantile="0.95"} ${percentiles.p95}`);
                lines.push(`ghost_request_latency_milliseconds{extensionId="${this._escapeLabel(extensionId)}",stage="${this._escapeLabel(stage)}",quantile="0.99"} ${percentiles.p99}`);
            }
        }
        lines.push('');

        lines.push('# HELP ghost_rate_limit_violations_total Total number of rate limit violations by extension');
        lines.push('# TYPE ghost_rate_limit_violations_total counter');
        for (const [extensionId, count] of Object.entries(allMetrics.rateLimitViolations || {})) {
            lines.push(`ghost_rate_limit_violations_total{extensionId="${this._escapeLabel(extensionId)}"} ${count}`);
        }
        lines.push('');

        lines.push('# HELP ghost_validation_failures_total Total number of validation failures by extension and reason');
        lines.push('# TYPE ghost_validation_failures_total counter');
        for (const [extensionId, reasons] of Object.entries(allMetrics.validationFailures || {})) {
            for (const [reason, count] of Object.entries(reasons)) {
                lines.push(`ghost_validation_failures_total{extensionId="${this._escapeLabel(extensionId)}",reason="${this._escapeLabel(reason)}"} ${count}`);
            }
        }
        lines.push('');

        lines.push('# HELP ghost_auth_failures_total Total number of authentication failures by extension and code');
        lines.push('# TYPE ghost_auth_failures_total counter');
        for (const [extensionId, codes] of Object.entries(allMetrics.authFailures || {})) {
            for (const [code, count] of Object.entries(codes)) {
                lines.push(`ghost_auth_failures_total{extensionId="${this._escapeLabel(extensionId)}",code="${this._escapeLabel(code)}"} ${count}`);
            }
        }
        lines.push('');

        lines.push('# HELP ghost_intent_request_size_bytes Average request size in bytes by extension');
        lines.push('# TYPE ghost_intent_request_size_bytes gauge');
        for (const [extensionId, sizes] of Object.entries(allMetrics.intentSizes || {})) {
            lines.push(`ghost_intent_request_size_bytes{extensionId="${this._escapeLabel(extensionId)}"} ${sizes.avgRequestSize}`);
        }
        lines.push('');

        lines.push('# HELP ghost_intent_response_size_bytes Average response size in bytes by extension');
        lines.push('# TYPE ghost_intent_response_size_bytes gauge');
        for (const [extensionId, sizes] of Object.entries(allMetrics.intentSizes || {})) {
            lines.push(`ghost_intent_response_size_bytes{extensionId="${this._escapeLabel(extensionId)}"} ${sizes.avgResponseSize}`);
        }
        lines.push('');

        const recentSpans = this.telemetry.getRecentSpans(1000);
        const spanCount = recentSpans.length;
        lines.push('# HELP ghost_spans_collected_total Total number of spans currently collected');
        lines.push('# TYPE ghost_spans_collected_total gauge');
        lines.push(`ghost_spans_collected_total ${spanCount}`);
        lines.push('');

        lines.push('# HELP ghost_telemetry_server_info Telemetry server information');
        lines.push('# TYPE ghost_telemetry_server_info gauge');
        lines.push(`ghost_telemetry_server_info{version="1.0.0"} 1`);
        lines.push('');

        return lines.join('\n');
    }

    _escapeLabel(value) {
        if (typeof value !== 'string') {
            value = String(value);
        }
        return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
    }

    isEnabled() {
        return this.enabled;
    }
}

module.exports = PrometheusExporter;
