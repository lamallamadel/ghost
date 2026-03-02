# Analytics Dashboard

Comprehensive analytics dashboard for Ghost CLI extension monitoring and performance analysis.

## Components

### Main Dashboard (`AnalyticsDashboard.tsx`)
The primary analytics dashboard that integrates all analytics features:
- Real-time extension metrics (invocation counts, success rates)
- Performance percentiles (P50, P95, P99 duration tracking)
- Cost attribution and resource consumption
- Performance regression alerts
- Distributed tracing call graphs

### Sub-Components

#### `PerformanceChart.tsx`
Real-time line charts displaying performance metrics over time:
- P50, P95, P99 latency percentiles
- Time-series visualization with configurable time ranges
- Color-coded performance indicators

#### `CostAttributionChart.tsx`
Cost breakdown visualization by resource type:
- CPU, Memory, I/O, Network, Storage costs
- Percentage-based visualization
- Total cost summary with billing period

#### `RegressionAlerts.tsx`
Performance regression alert system:
- Severity-based alert categorization (Critical, High, Medium, Low)
- Baseline vs current metric comparison
- Threshold violation detection
- Version-based regression tracking

#### `DistributedTracingGraph.tsx`
Interactive call graph visualization:
- Node-based extension interaction graph
- Edge weights representing call frequency
- Node colors indicating performance (duration-based)
- Interactive node selection with details
- Expandable/collapsible view

## Features

### Real-Time Metrics
- Auto-refresh every 5 seconds
- Configurable time ranges (1h, 6h, 24h, 7d)
- Extension-specific metric filtering

### Key Performance Indicators
- **Invocation Count**: Total extension calls
- **Success Rate**: Percentage of successful operations
- **Duration Percentiles**: P50, P95, P99 latency tracking
- **Resource Usage**: CPU, Memory, I/O, Network consumption
- **Cost Attribution**: Breakdown by resource type

### Performance Monitoring
- **Regression Detection**: Automatic detection of performance degradation
- **Baseline Comparison**: Version-to-version performance comparison
- **Alert Severity Levels**: Critical, High, Medium, Low classifications
- **Threshold Monitoring**: Configurable performance thresholds

### Distributed Tracing
- **Call Graph Visualization**: Visual representation of extension interactions
- **Cross-Extension Calls**: Track dependencies between extensions
- **Performance Hot Spots**: Identify slow operations in call chains
- **Call Frequency Analysis**: Understand usage patterns

## Usage

### In Console
Navigate to the "Analytics" tab in the Ghost Console to access the full dashboard.

### In Developer Tab
Access analytics via the Developer tab → Analytics view for developer-focused metrics.

## API Integration

The dashboard connects to the Analytics API Server running on `http://localhost:9876`.

### Endpoints Used
- `GET /api/analytics/dashboard?timeRange={range}` - Main dashboard data
- `GET /api/analytics/performance/{extensionId}?timeRange={range}` - Performance history
- `GET /api/analytics/extensions` - Extensions list
- `GET /api/analytics/extension/{extensionId}` - Extension details

## Backend Setup

### Starting the Analytics API Server
```bash
node core/analytics/start-api-server.js
```

### Generating Sample Data (for testing)
```bash
node core/analytics/examples/populate-sample-data.js
```

## Data Structure

### Extension Metrics
```typescript
{
  invocationCount: number
  successCount: number
  failureCount: number
  successRate: number
  duration: {
    avg: number
    p50: number
    p95: number
    p99: number
    min: number
    max: number
  }
  resources: {
    cpu: { avg: number, total: number }
    memory: { avg: number, total: number }
    io: { avg: number, total: number }
    network: { avg: number, total: number }
  }
}
```

### Regression Alert
```typescript
{
  id: string
  extensionId: string
  version: string
  severity: 'critical' | 'high' | 'medium' | 'low'
  metric: string
  baselineValue: number
  currentValue: number
  percentChange: number
  threshold: number
  timestamp: number
}
```

### Call Graph
```typescript
{
  nodes: Array<{
    extensionId: string
    operation: string
    callCount: number
    totalDuration: number
    avgDuration: number
  }>
  edges: Array<{
    from: string
    to: string
    callCount: number
  }>
}
```

## Styling

The dashboard uses Tailwind CSS with the Ghost Console dark theme:
- **Primary Color**: Cyan (#06b6d4)
- **Background**: Gray-800 (#1f2937)
- **Borders**: Gray-700 (#374151)
- **Text**: White/Gray variations

## Performance Considerations

- **Auto-refresh**: 5-second intervals for dashboard, 10-second for performance history
- **Data Aggregation**: Backend aggregates metrics to reduce payload size
- **Lazy Loading**: Charts only fetch data when visible
- **Caching**: Component-level caching for static data

## Future Enhancements

- Historical trend analysis
- Anomaly detection visualization
- Cost optimization recommendations
- Export to CSV/JSON functionality
- Customizable alert thresholds
- Real-time WebSocket updates
- Multi-repository aggregation
