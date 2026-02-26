# Observability Export

Ghost CLI provides built-in support for exporting telemetry data to external observability platforms through OTLP and Prometheus exporters.

## Features

### OTLP Exporter
- Exports spans and metrics to OTLP-compatible backends (Jaeger, Tempo, etc.)
- Configurable export interval (default: 30s)
- HTTP/JSON protocol support
- Automatic batching and retry logic
- Support for custom headers (authentication, etc.)

### Prometheus Exporter
- Exposes metrics in Prometheus text exposition format
- Available at `/metrics` endpoint on TelemetryServer
- Auto-discovery compatible with Prometheus scraping
- Standard metric types: counters and gauges

## Configuration

Exporters are configured in `~/.ghost/config/ghostrc.json`:

```json
{
  "exporters": {
    "otlp": {
      "endpoint": "http://localhost:4318",
      "interval": 30000,
      "headers": {
        "Authorization": "Bearer your-token-here"
      },
      "timeout": 10000
    },
    "prometheus": {
      "enabled": true
    }
  }
}
```

### OTLP Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `endpoint` | string | `http://localhost:4318` | OTLP collector endpoint URL |
| `interval` | number | `30000` | Export interval in milliseconds |
| `headers` | object | `{}` | Custom HTTP headers for authentication |
| `timeout` | number | `10000` | HTTP request timeout in milliseconds |

### Prometheus Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | boolean | `false` | Enable Prometheus metrics endpoint |

## OTLP Metrics Exported

The following metrics are exported via OTLP:

### Request Metrics
- `ghost.requests.count` - Total request count by extension and stage
- `ghost.requests.latency.p50` - 50th percentile latency
- `ghost.requests.latency.p95` - 95th percentile latency
- `ghost.requests.latency.p99` - 99th percentile latency

### Error Metrics
- `ghost.rate_limit_violations.count` - Rate limit violations by extension
- `ghost.validation_failures.count` - Validation failures by extension and reason
- `ghost.auth_failures.count` - Auth failures by extension and code

### Size Metrics
- `ghost.intent.request_size.avg` - Average request size by extension
- `ghost.intent.response_size.avg` - Average response size by extension

### Trace Data
- Complete span data with attributes, events, and status
- Distributed tracing support with trace/span IDs
- Parent-child span relationships

## Prometheus Metrics

When Prometheus exporter is enabled, the `/metrics` endpoint returns:

```
# HELP ghost_requests_total Total number of requests by extension and stage
# TYPE ghost_requests_total counter
ghost_requests_total{extensionId="ghost-git-extension",stage="intercept"} 42

# HELP ghost_request_latency_milliseconds Request latency percentiles in milliseconds
# TYPE ghost_request_latency_milliseconds gauge
ghost_request_latency_milliseconds{extensionId="ghost-git-extension",stage="intercept",quantile="0.5"} 15
ghost_request_latency_milliseconds{extensionId="ghost-git-extension",stage="intercept",quantile="0.95"} 45
ghost_request_latency_milliseconds{extensionId="ghost-git-extension",stage="intercept",quantile="0.99"} 78

# HELP ghost_rate_limit_violations_total Total number of rate limit violations by extension
# TYPE ghost_rate_limit_violations_total counter
ghost_rate_limit_violations_total{extensionId="ghost-git-extension"} 3

# HELP ghost_validation_failures_total Total number of validation failures by extension and reason
# TYPE ghost_validation_failures_total counter
ghost_validation_failures_total{extensionId="ghost-git-extension",reason="INVALID_INTENT"} 2

# HELP ghost_auth_failures_total Total number of authentication failures by extension and code
# TYPE ghost_auth_failures_total counter
ghost_auth_failures_total{extensionId="ghost-git-extension",code="AUTH_DENIED"} 1

# HELP ghost_intent_request_size_bytes Average request size in bytes by extension
# TYPE ghost_intent_request_size_bytes gauge
ghost_intent_request_size_bytes{extensionId="ghost-git-extension"} 1024

# HELP ghost_intent_response_size_bytes Average response size in bytes by extension
# TYPE ghost_intent_response_size_bytes gauge
ghost_intent_response_size_bytes{extensionId="ghost-git-extension"} 2048

# HELP ghost_spans_collected_total Total number of spans currently collected
# TYPE ghost_spans_collected_total gauge
ghost_spans_collected_total 150

# HELP ghost_telemetry_server_info Telemetry server information
# TYPE ghost_telemetry_server_info gauge
ghost_telemetry_server_info{version="1.0.0"} 1
```

## Usage Examples

### With Jaeger (via OTLP)

1. Start Jaeger with OTLP support:
```bash
docker run -d --name jaeger \
  -p 16686:16686 \
  -p 4318:4318 \
  jaegertracing/all-in-one:latest
```

2. Configure Ghost CLI:
```json
{
  "exporters": {
    "otlp": {
      "endpoint": "http://localhost:4318",
      "interval": 30000
    }
  }
}
```

3. Start Ghost Gateway with telemetry enabled
4. View traces at http://localhost:16686

### With Prometheus

1. Start Ghost Gateway with telemetry enabled

2. Configure Prometheus scraping (`prometheus.yml`):
```yaml
scrape_configs:
  - job_name: 'ghost-cli'
    static_configs:
      - targets: ['localhost:9876']
    metrics_path: '/metrics'
    scrape_interval: 15s
```

3. Start Prometheus:
```bash
docker run -d --name prometheus \
  -p 9090:9090 \
  -v $(pwd)/prometheus.yml:/etc/prometheus/prometheus.yml \
  prom/prometheus
```

4. Configure Ghost CLI to enable Prometheus:
```json
{
  "exporters": {
    "prometheus": {
      "enabled": true
    }
  }
}
```

5. View metrics at http://localhost:9090

### With Grafana + Prometheus

1. Set up Prometheus as described above

2. Start Grafana:
```bash
docker run -d --name grafana \
  -p 3000:3000 \
  grafana/grafana
```

3. Add Prometheus as a data source in Grafana
4. Import the Ghost CLI dashboard (coming soon) or create custom dashboards

## Architecture

### OTLP Export Flow
```
MetricsCollector/Spans → OTLPExporter → HTTP POST → OTLP Collector
                              ↓
                    Periodic Export (30s default)
                              ↓
                     JSON Payload with traces/metrics
```

### Prometheus Scrape Flow
```
MetricsCollector/Spans → PrometheusExporter → /metrics Endpoint
                              ↓
                  Prometheus Scraper (pull-based)
                              ↓
                      Text Exposition Format
```

## Performance Considerations

### OTLP Exporter
- Exports are batched and sent periodically
- Failed exports are logged but don't block operation
- Consider increasing `interval` for high-volume deployments
- Network latency affects export timing but not runtime performance

### Prometheus Exporter
- Metrics are calculated on-demand during scrapes
- Scraping is synchronous but fast
- No impact on runtime when not being scraped
- Memory overhead is minimal (in-memory aggregation only)

## Troubleshooting

### OTLP Export Failures
```
[OTLPExporter] Export failed: ECONNREFUSED
```
**Solution**: Ensure OTLP collector is running and accessible at the configured endpoint.

### Prometheus Scrape Errors
```
http://localhost:9876/metrics: connection refused
```
**Solution**: Ensure TelemetryServer is running (`ghost gateway start --telemetry`)

### Missing Metrics
**Solution**: 
1. Verify exporter is configured in ghostrc.json
2. Check that telemetry is enabled globally
3. Ensure requests are being made through the gateway

## Security Considerations

- OTLP endpoint authentication via custom headers
- Never commit API keys or tokens to version control
- Use environment variables for sensitive configuration
- Consider using HTTPS for production OTLP endpoints
- Restrict Prometheus metrics endpoint access via firewall/proxy

## API Reference

### OTLPExporter

```javascript
const OTLPExporter = require('./core/exporters/otlp-exporter');

const exporter = new OTLPExporter(config, metricsCollector, telemetry);
exporter.start();
exporter.getStats(); // { isRunning, endpoint, interval, exportCount, errorCount }
exporter.stop();
```

### PrometheusExporter

```javascript
const PrometheusExporter = require('./core/exporters/prometheus-exporter');

const exporter = new PrometheusExporter(metricsCollector, telemetry);
exporter.enable();
exporter.getMetricsText(); // Returns Prometheus format text
exporter.isEnabled(); // Returns boolean
exporter.disable();
```

## Future Enhancements

- Support for OTLP gRPC protocol
- Additional exporters (StatsD, DataDog, etc.)
- Metric aggregation configuration
- Custom metric definitions
- Export filtering and sampling
- Grafana dashboard templates
