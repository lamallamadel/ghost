# Analytics Dashboard Implementation

## Overview

The Analytics Dashboard is a comprehensive real-time monitoring and analysis system for Ghost CLI extensions. It integrates with the AnalyticsPlatform from `core/analytics` to provide deep insights into extension performance, costs, behavior patterns, and recommendations.

## Features Implemented

### 1. **Real-Time Extension Metrics**
- **Success Rate Tracking**: Live success/failure rates for each extension
- **Latency Percentiles**: P50, P95, and P99 duration metrics
- **Invocation Counting**: Total invocations with success/failure breakdown
- **Resource Consumption**: CPU, Memory, I/O, and Network usage tracking

### 2. **Performance Charts**
- **Historical Performance Timeline**: Time-series visualization of P50/P95/P99 latencies
- **Real-Time Metrics Chart**: Live WebSocket-powered chart showing invocation latency as it happens
- **Success/Failure Visualization**: Clear breakdown of successful vs failed invocations

### 3. **Cost Attribution**
- **Resource Cost Breakdown**: Pie chart showing CPU, Memory, I/O, Network, and Storage costs
- **Per-Extension Billing**: Total cost tracking for each extension
- **Cost Projections**: Estimated future costs based on usage patterns
- **Billing Period Tracking**: Current period cost summaries

### 4. **Performance Regression Alerts**
- **Version Comparison**: Automatic detection of performance degradation between versions
- **Multiple Severity Levels**: Critical, High, Medium, and Low severity alerts
- **Threshold Monitoring**: Configurable thresholds for duration, CPU, memory, and error rates
- **Alert History**: Complete history of all regression alerts with detailed metrics

### 5. **Distributed Tracing Call Graph**
- **Interactive D3.js Visualization**: Force-directed graph showing extension dependencies
- **Cross-Extension Calls**: Visual representation of how extensions interact
- **Call Frequency**: Edge thickness represents call volume
- **Performance Indicators**: Node colors indicate average duration performance

### 6. **Behavior Analytics**
- **Most Used Commands**: Ranked list of most frequently executed commands
- **Most Used Extensions**: Extensions sorted by invocation count
- **Workflow Sequences**: Common command patterns and sequences
- **Session Analytics**: Active session statistics and durations

### 7. **Recommendation Engine**
- **Context-Aware Suggestions**: Recommendations based on usage patterns
- **Category-Based Organization**: Code quality, testing, documentation, collaboration, etc.
- **Confidence Scoring**: Each recommendation includes a confidence score
- **Repository Analysis**: Automatic detection of languages, frameworks, and patterns

### 8. **Live Updates via WebSocket**
- **Real-Time Telemetry**: WebSocket connection to telemetry server (ws://localhost:9877)
- **Extension Subscriptions**: Subscribe to specific extension metrics
- **Automatic Reconnection**: Resilient connection with auto-reconnect on disconnect
- **Live/Pause Toggle**: User can enable/disable live updates

## Architecture

### Component Structure

```
desktop/src/
├── tabs/
│   └── AnalyticsTab.tsx              # Main dashboard container
├── components/
│   ├── PerformanceChart.tsx          # P50/P95/P99 timeline chart
│   ├── CostAttributionChart.tsx      # Cost breakdown visualization
│   ├── DistributedTracingGraph.tsx   # Call graph with D3.js
│   ├── RegressionAlerts.tsx          # Performance alerts panel
│   ├── BehaviorAnalyticsPanel.tsx    # Behavior metrics display
│   ├── RecommendationEnginePanel.tsx # Extension recommendations
│   └── RealTimeMetricsChart.tsx      # Live WebSocket metrics
```

### IPC Handlers (desktop/electron/main.mjs)

```javascript
ipcMain.handle('analytics.getMetrics', async (_, { timeRange }) => { ... })
ipcMain.handle('analytics.getDashboard', async (_, { timeRange }) => { ... })
ipcMain.handle('analytics.getExtensionCallGraph', async (_, { extensionId }) => { ... })
ipcMain.handle('analytics.getRecommendations', async () => { ... })
```

### Core Analytics Platform (core/analytics/)

- **AnalyticsPlatform**: Main analytics orchestration class
- **AnalyticsCollector**: Metrics collection and aggregation
- **BehaviorAnalytics**: Command and workflow pattern tracking
- **CostAttribution**: Resource cost calculation and projection
- **PerformanceRegression**: Version comparison and alert generation
- **DistributedTracing**: Cross-extension call tracking
- **RecommendationEngine**: Context-aware extension suggestions
- **TelemetryWebSocketServer**: Real-time telemetry streaming

## Data Flow

1. **Extension Invocation** → AnalyticsPlatform.trackExtensionInvocation()
2. **Success/Failure** → trackExtensionSuccess() or trackExtensionFailure()
3. **WebSocket Broadcast** → Real-time update to connected dashboard clients
4. **Metrics Aggregation** → Collector computes P50/P95/P99, success rates
5. **Cost Calculation** → CostAttribution computes resource costs
6. **Regression Detection** → PerformanceRegression compares versions
7. **Dashboard Generation** → generateDashboard() assembles all data
8. **IPC Response** → Electron main process returns data to renderer

## WebSocket Protocol

### Connection
```
ws://localhost:9877/telemetry
```

### Subscribe to Extension
```json
{
  "type": "subscribe",
  "extensionId": "ghost-git-extension"
}
```

### Invocation Event
```json
{
  "type": "invocation-completed",
  "extensionId": "ghost-git-extension",
  "invocationId": "inv-123456789-abc",
  "status": "success",
  "duration": 42.5,
  "timestamp": 1234567890000
}
```

## Usage

### Starting the Telemetry Server

```bash
# For development
node core/analytics/start-telemetry-server.js

# Or via the Analytics API Server
node core/analytics/start-api-server.js
```

### Accessing the Dashboard

1. Launch Ghost Desktop app: `cd desktop && npm run desktop:dev`
2. Navigate to the Analytics tab
3. Select an extension from the extension selector
4. Enable "Live Updates" toggle for real-time metrics
5. Adjust time range (1h, 6h, 24h, 7d) to view historical data

### Integration with Extensions

Extensions automatically report metrics when invoked through the Ghost pipeline:

```javascript
// In core/runtime.js or extension execution code
const trackingContext = analytics.trackExtensionInvocation(
  extensionId,
  method,
  params
);

try {
  const result = await executeExtension(extensionId, method, params);
  analytics.trackExtensionSuccess(trackingContext, result);
  return result;
} catch (error) {
  analytics.trackExtensionFailure(trackingContext, error);
  throw error;
}
```

## Configuration

### Analytics Platform Options

```javascript
const analytics = new AnalyticsPlatform({
  persistenceDir: path.join(os.homedir(), '.ghost', 'analytics'),
  enableWebSocket: true,
  wsPort: 9877,
  wsHost: 'localhost',
  flushInterval: 60000,
  retentionDays: 30,
  billingRates: {
    cpu: 0.000001,
    memory: 0.0000001,
    io: 0.00001,
    network: 0.00001,
    storage: 0.0001
  }
});
```

### Performance Regression Thresholds

```javascript
const thresholds = {
  duration: 0.20,   // 20% increase triggers alert
  cpu: 0.30,        // 30% increase triggers alert
  memory: 0.30,     // 30% increase triggers alert
  errorRate: 0.10   // 10% increase triggers alert
};
```

## Performance Considerations

- **Metrics Buffer**: Last 60 data points kept in memory for real-time chart
- **Historical Data**: Aggregated by buckets for efficient storage and rendering
- **WebSocket Efficiency**: Only subscribed extensions send updates
- **Lazy Loading**: Charts load data on-demand as user navigates
- **Throttled Updates**: 5-second refresh interval for dashboard data

## Future Enhancements

- [ ] Export analytics data to CSV/JSON
- [ ] Custom alert thresholds per extension
- [ ] Historical trend comparison (week-over-week, month-over-month)
- [ ] Machine learning-based anomaly detection
- [ ] Integration with external monitoring tools (Prometheus, Grafana)
- [ ] Cost optimization recommendations
- [ ] Performance profiling flame graphs
- [ ] A/B testing framework for extension versions

## Troubleshooting

### WebSocket Connection Fails
- Ensure telemetry server is running on port 9877
- Check firewall settings
- Verify localhost access permissions

### No Metrics Displayed
- Confirm extensions are being invoked
- Check analytics persistence directory has write permissions
- Review Electron main process logs

### Performance Issues
- Reduce time range to minimize data points
- Disable live updates when not actively monitoring
- Clear old analytics data: `rm -rf ~/.ghost/analytics/*`

## License

This implementation is part of the Ghost CLI project and follows the same license terms.
