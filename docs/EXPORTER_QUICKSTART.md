# Observability Export - Quick Start Guide

Get Ghost CLI telemetry data into your observability stack in minutes.

## Prerequisites

- Ghost CLI installed
- Gateway with telemetry enabled
- An observability backend (Jaeger, Prometheus, or both)

## Option 1: OTLP with Jaeger (Recommended)

### 1. Start Jaeger
```bash
docker run -d --name jaeger \
  -p 16686:16686 \
  -p 4318:4318 \
  jaegertracing/all-in-one:latest
```

### 2. Configure Ghost CLI
Edit or create `~/.ghost/config/ghostrc.json`:
```json
{
  "exporters": {
    "otlp": {
      "endpoint": "http://localhost:4318"
    }
  }
}
```

### 3. Start Ghost Gateway
```bash
ghost gateway start --telemetry
```

### 4. View Traces
Open http://localhost:16686 in your browser.

### 5. Generate Traffic
```bash
ghost status  # or any ghost command
```

Traces will appear in Jaeger within 30 seconds.

## Option 2: Prometheus

### 1. Start Ghost Gateway
```bash
ghost gateway start --telemetry
```

### 2. Configure Ghost CLI
Edit `~/.ghost/config/ghostrc.json`:
```json
{
  "exporters": {
    "prometheus": {
      "enabled": true
    }
  }
}
```

### 3. Restart Gateway
```bash
ghost gateway stop
ghost gateway start --telemetry
```

### 4. Create Prometheus Config
```bash
cat > prometheus.yml <<EOF
scrape_configs:
  - job_name: 'ghost-cli'
    static_configs:
      - targets: ['localhost:9876']
    scrape_interval: 15s
EOF
```

### 5. Start Prometheus
```bash
docker run -d --name prometheus \
  -p 9090:9090 \
  -v $(pwd)/prometheus.yml:/etc/prometheus/prometheus.yml \
  prom/prometheus
```

### 6. View Metrics
- Raw metrics: http://localhost:9876/metrics
- Prometheus UI: http://localhost:9090

### 7. Query Metrics
In Prometheus, try:
```promql
ghost_requests_total
ghost_request_latency_milliseconds{quantile="0.95"}
rate(ghost_requests_total[5m])
```

## Option 3: Both (Jaeger + Prometheus)

Combine both configurations:

```json
{
  "exporters": {
    "otlp": {
      "endpoint": "http://localhost:4318"
    },
    "prometheus": {
      "enabled": true
    }
  }
}
```

Start both backends as described above, then start Ghost Gateway.

## Configuration Options

### OTLP (Advanced)
```json
{
  "exporters": {
    "otlp": {
      "endpoint": "http://localhost:4318",
      "interval": 30000,
      "headers": {
        "Authorization": "Bearer your-token"
      },
      "timeout": 10000
    }
  }
}
```

- `endpoint`: OTLP collector URL
- `interval`: Export frequency in milliseconds (default: 30000)
- `headers`: Custom HTTP headers for authentication
- `timeout`: Request timeout in milliseconds (default: 10000)

### Prometheus (Simple)
```json
{
  "exporters": {
    "prometheus": {
      "enabled": true
    }
  }
}
```

## Metrics Available

### Request Metrics
- `ghost_requests_total` - Total requests
- `ghost_request_latency_milliseconds` - Latency (p50, p95, p99)

### Error Metrics
- `ghost_rate_limit_violations_total` - Rate limit hits
- `ghost_validation_failures_total` - Validation errors
- `ghost_auth_failures_total` - Auth failures

### Size Metrics
- `ghost_intent_request_size_bytes` - Request sizes
- `ghost_intent_response_size_bytes` - Response sizes

### System Metrics
- `ghost_spans_collected_total` - Active spans
- `ghost_telemetry_server_info` - Server info

## Troubleshooting

### "No traces appearing in Jaeger"
1. Check endpoint: `curl http://localhost:4318/v1/traces`
2. Verify config file exists and is valid JSON
3. Wait 30 seconds (default export interval)
4. Check Ghost logs for errors

### "Prometheus showing no data"
1. Check endpoint: `curl http://localhost:9876/metrics`
2. Should see `Content-Type: text/plain`
3. Verify `enabled: true` in config
4. Restart Ghost Gateway after config changes

### "Connection refused"
Ensure all services are running:
```bash
# Check Ghost
ghost gateway status

# Check Jaeger (if using)
curl http://localhost:4318/v1/traces

# Check Prometheus (if using)
curl http://localhost:9090
```

## Next Steps

- **Alerting**: Configure Prometheus alerts based on Ghost metrics
- **Dashboards**: Create Grafana dashboards with Ghost data
- **Production**: Use authenticated OTLP endpoints with HTTPS
- **Custom Metrics**: Extend Ghost to export custom application metrics

## Complete Example

Full working setup with Docker Compose:

```yaml
version: '3'
services:
  jaeger:
    image: jaegertracing/all-in-one:latest
    ports:
      - "16686:16686"
      - "4318:4318"
  
  prometheus:
    image: prom/prometheus
    ports:
      - "9090:9090"
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
  
  grafana:
    image: grafana/grafana
    ports:
      - "3000:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin
```

Ghost config (`~/.ghost/config/ghostrc.json`):
```json
{
  "telemetry": {
    "enabled": true
  },
  "exporters": {
    "otlp": {
      "endpoint": "http://localhost:4318"
    },
    "prometheus": {
      "enabled": true
    }
  }
}
```

Start everything:
```bash
docker-compose up -d
ghost gateway start --telemetry
```

Access:
- Jaeger: http://localhost:16686
- Prometheus: http://localhost:9090
- Grafana: http://localhost:3000 (admin/admin)

## See Also

- [OBSERVABILITY_EXPORT.md](./OBSERVABILITY_EXPORT.md) - Complete documentation
- [exporter-config-example.json](./exporter-config-example.json) - Full config example
- [TELEMETRY.md](../core/TELEMETRY.md) - Telemetry system overview
