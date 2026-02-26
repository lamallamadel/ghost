# Extension Analytics and Observability Platform

Comprehensive analytics and observability system for Ghost CLI extensions, providing deep insights into extension usage, performance, costs, and user behavior.

## Overview

The analytics platform consists of six integrated components:

1. **Analytics Collector** - Tracks extension invocation metrics
2. **Behavior Analytics** - Analyzes user behavior and workflow patterns
3. **Cost Attribution** - Calculates resource consumption and billing
4. **Performance Regression** - Detects performance degradation across versions
5. **Distributed Tracing** - Visualizes cross-extension call graphs
6. **Recommendation Engine** - Suggests relevant extensions based on repository analysis

## Components

### Analytics Collector

Tracks extension usage metrics in real-time:

```javascript
const { AnalyticsCollector } = require('./analytics');

const collector = new AnalyticsCollector({
    persistenceDir: '/path/to/analytics',
    flushInterval: 60000,  // Flush every 60 seconds
    retentionDays: 30      // Keep metrics for 30 days
});

// Record invocation
const invocationId = collector.recordInvocation('my-extension', 'processFile', { file: 'test.js' });

// Record success
collector.recordSuccess(invocationId, result, duration);

// Record failure
collector.recordFailure(invocationId, error, duration);

// Record resource usage
collector.recordResourceUsage(invocationId, {
    cpu: 0.5,      // CPU seconds
    memory: 128,   // MB
    io: 1024,      // KB
    network: 512   // KB
});

// Get metrics
const metrics = collector.getMetrics('my-extension');
console.log(metrics);
// {
//   extensionId: 'my-extension',
//   invocationCount: 150,
//   successCount: 145,
//   failureCount: 5,
//   successRate: 96.67,
//   duration: {
//     average: 125.5,
//     p50: 120,
//     p95: 250,
//     p99: 350
//   },
//   resources: { ... }
// }
```

### Behavior Analytics

Analyzes user behavior patterns:

```javascript
const { BehaviorAnalytics } = require('./analytics');

const behavior = new BehaviorAnalytics();

// Record command
behavior.recordCommand('git commit', 'git-extension', { staged: 5 });

// Get most used commands
const topCommands = behavior.getMostUsedCommands(10);

// Get common workflows
const workflows = behavior.getCommonWorkflows(2, 10);

// Predict next commands
const predictions = behavior.getPredictedNextCommands('git add', 3);
console.log(predictions);
// [
//   { command: 'git commit', probability: 75.5 },
//   { command: 'git status', probability: 15.2 },
//   { command: 'git push', probability: 9.3 }
// ]
```

### Cost Attribution

Tracks resource consumption and calculates costs:

```javascript
const { CostAttribution } = require('./analytics');

const cost = new CostAttribution({
    billingRates: {
        cpu: 0.000001,     // Per CPU millisecond
        memory: 0.0000001, // Per MB-second
        io: 0.00001,       // Per KB
        network: 0.00001,  // Per KB
        storage: 0.0001    // Per MB
    }
});

// Record resource consumption
cost.recordResourceConsumption('my-extension', {
    cpu: 500,
    memory: 128,
    io: 1024,
    network: 512,
    storage: 10
});

// Get costs by extension
const costs = cost.getCostsByExtension('my-extension');

// Get billing report
const report = cost.getBillingReport();

// Get cost projection
const projection = cost.getCostProjection('my-extension', 30);
console.log(projection);
// {
//   extensionId: 'my-extension',
//   projectionDays: 30,
//   projectedInvocations: 4500,
//   projectedCost: 0.45,
//   confidence: 'high'
// }

// Calculate marketplace billing
const billing = cost.calculateMarketplaceBilling('my-extension', {
    type: 'per-invocation',
    pricePerInvocation: 0.001
});
```

### Performance Regression Detection

Detects performance degradation across versions:

```javascript
const { PerformanceRegression } = require('./analytics');

const performance = new PerformanceRegression({
    thresholds: {
        duration: 0.20,   // 20% increase triggers alert
        cpu: 0.30,        // 30% increase
        memory: 0.30,     // 30% increase
        errorRate: 0.10   // 10% increase
    }
});

// Record version metric
performance.recordVersionMetric('my-extension', '1.0.0', {
    duration: 125,
    cpu: 0.5,
    memory: 128,
    error: false
});

// Set baseline
performance.setBaseline('my-extension', '1.0.0');

// Compare versions
const comparison = performance.compareVersions('my-extension', '1.0.0', '1.1.0');
console.log(comparison);
// {
//   extensionId: 'my-extension',
//   version1: '1.0.0',
//   version2: '1.1.0',
//   metrics: {
//     duration: {
//       version1: 125,
//       version2: 180,
//       difference: 55,
//       percentChange: 44.0,
//       regression: true
//     }
//   }
// }

// Get alerts
const alerts = performance.getAlerts('my-extension');
```

### Distributed Tracing

Visualizes cross-extension call graphs:

```javascript
const { DistributedTracing } = require('./analytics');

const tracing = new DistributedTracing();

// Start trace
const { traceId, spanId } = tracing.startTrace(
    'trace-123',
    'extension-a',
    'processData',
    { input: 'data' }
);

// Start child span (cross-extension call)
const childSpan = tracing.startSpan(
    traceId,
    spanId,
    'extension-b',
    'validateData',
    { input: 'data' }
);

// Add logs and tags
tracing.addSpanLog(childSpan.spanId, 'Validation started');
tracing.addSpanTag(childSpan.spanId, 'validator', 'schema-v2');

// End spans
tracing.endSpan(childSpan.spanId, 'success');
tracing.endSpan(spanId, 'success');

// Visualize call graph
const visualization = tracing.visualizeCallGraph(traceId);
console.log(visualization.mermaid);
// graph TD
//     extension-a["extension-a"]
//     extension-b["extension-b"]
//     extension-a -->|validateData| extension-b

// Get cross-extension interactions
const interactions = tracing.getExtensionInteractions();
console.log(interactions);
// [
//   {
//     from: 'extension-a',
//     to: 'extension-b',
//     callCount: 50,
//     avgDuration: 125,
//     operations: [
//       { operation: 'validateData', count: 50 }
//     ]
//   }
// ]
```

### Recommendation Engine

Suggests relevant extensions based on repository analysis:

```javascript
const { RecommendationEngine } = require('./analytics');

const recommendations = new RecommendationEngine();

// Analyze repository
const profile = await recommendations.analyzeRepository('/path/to/repo');
console.log(profile);
// {
//   languages: [
//     { language: 'JavaScript', count: 150 },
//     { language: 'TypeScript', count: 75 }
//   ],
//   frameworks: ['React', 'Express'],
//   commitPatterns: {
//     totalCommits: 500,
//     commitsByType: { fix: 150, feature: 200, ... }
//   },
//   teamSize: 5,
//   activityLevel: 'high'
// }

// Generate recommendations
const recs = await recommendations.generateRecommendations();
console.log(recs);
// [
//   {
//     extensionId: 'eslint-integration',
//     reason: 'High JavaScript usage detected',
//     category: 'code-quality',
//     confidence: 0.9,
//     score: 90
//   },
//   {
//     extensionId: 'react-hooks-linter',
//     reason: 'React hooks best practices',
//     category: 'framework',
//     confidence: 0.9,
//     score: 90
//   }
// ]

// Get top recommendations
const topRecs = recommendations.getTopRecommendations(5);
```

## Integrated Analytics Platform

Use the integrated platform for simplified access:

```javascript
const { AnalyticsPlatform } = require('./analytics');

const analytics = new AnalyticsPlatform({
    persistenceDir: '/path/to/analytics',
    flushInterval: 60000,
    retentionDays: 30
});

await analytics.initialize();

// Track invocation
const context = analytics.trackExtensionInvocation(
    'my-extension',
    'processFile',
    { file: 'test.js' }
);

// Track success
analytics.trackExtensionSuccess(context, result);

// Track resource usage
analytics.trackResourceUsage(context, {
    cpu: 0.5,
    memory: 128,
    io: 1024,
    network: 512
});

// Generate dashboard
const dashboard = await analytics.generateDashboard();

// Get extension metrics
const metrics = analytics.getExtensionMetrics('my-extension');

// Get recommendations
await analytics.analyzeRepository('/path/to/repo');
const recommendations = await analytics.getRecommendations();

// Persist data
await analytics.persist();
```

## Runtime Integration

Integrate analytics with the extension runtime:

```javascript
const { ExtensionRuntime } = require('../runtime');
const AnalyticsRuntimeIntegration = require('./runtime-integration');

const runtime = new ExtensionRuntime();
const analytics = new AnalyticsRuntimeIntegration(runtime, {
    enabled: true,
    persistenceDir: '/path/to/analytics'
});

await analytics.initialize();

// Wrap extension calls
const originalCall = async (...args) => {
    return await runtime.callExtension('my-extension', 'processFile', ...args);
};

const wrappedCall = analytics.wrapExtensionCall('my-extension', 'processFile', originalCall);

// Use wrapped call
const result = await wrappedCall({ file: 'test.js' });

// Generate report
const report = await analytics.generateReport();

// Get recommendations
const recommendations = await analytics.getExtensionRecommendations('/path/to/repo');

// Shutdown
await analytics.shutdown();
```

## Data Persistence

All analytics data is automatically persisted to disk:

- **Metrics**: `~/.ghost/analytics/metrics-{timestamp}.json`
- **Behavior**: `~/.ghost/analytics/behavior-analytics.json`
- **Costs**: `~/.ghost/analytics/cost-attribution.json`
- **Performance**: `~/.ghost/analytics/performance-regression.json`
- **Tracing**: `~/.ghost/analytics/distributed-tracing.json`
- **Recommendations**: `~/.ghost/analytics/recommendations.json`

Data is automatically cleaned up based on retention settings (default: 30 days).

## Events

The analytics platform emits events for monitoring:

```javascript
analytics.on('invocation-started', (event) => {
    console.log('Invocation started:', event);
});

analytics.on('invocation-completed', (event) => {
    console.log('Invocation completed:', event);
});

analytics.on('regression-detected', (alert) => {
    console.log('Performance regression detected:', alert);
});

analytics.on('trace-completed', (event) => {
    console.log('Trace completed:', event);
});

analytics.on('recommendations-generated', (event) => {
    console.log('Recommendations generated:', event);
});
```

## Best Practices

1. **Enable in Production**: Analytics overhead is minimal and provides valuable insights
2. **Set Baselines**: Set performance baselines after stable releases
3. **Monitor Alerts**: Act on regression alerts promptly
4. **Review Recommendations**: Regularly review extension recommendations
5. **Analyze Workflows**: Use behavior analytics to optimize user experience
6. **Track Costs**: Monitor resource consumption for marketplace extensions
7. **Persist Regularly**: Call `persist()` periodically to avoid data loss

## Performance Impact

The analytics platform is designed for minimal overhead:

- **CPU**: <1% overhead per invocation
- **Memory**: ~10MB base + ~1KB per tracked invocation
- **Disk I/O**: Batched writes every 60 seconds (configurable)
- **Network**: No network calls (local only)
