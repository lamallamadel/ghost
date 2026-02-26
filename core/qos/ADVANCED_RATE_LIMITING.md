# Advanced Rate Limiting Strategies

This document describes the advanced rate limiting features beyond the basic token bucket implementation.

## Overview

The advanced rate limiting system provides:

1. **Adaptive Rate Limiting** - Dynamic CIR adjustment based on system load using PID controller
2. **Fair Queuing** - Weighted Fair Queuing (WFQ) for priority-based request scheduling
3. **Enhanced Circuit Breaker** - Half-open state with canary request testing
4. **Warmup Rate Limiting** - Gradual ramp-up after extension restart
5. **Global Rate Limiting** - Cross-extension quota sharing
6. **Rate Limit Analytics** - Per-extension consumption patterns and quota exhaustion prediction

## Architecture

### Adaptive Rate Limiting

Uses a PID (Proportional-Integral-Derivative) controller to dynamically adjust the Committed Information Rate (CIR) based on system load and error rates.

**Components:**
- `PIDController` - Implements PID control algorithm
- `SystemLoadMonitor` - Tracks CPU, memory, request rate, and error rate
- `AdaptiveRateLimiter` - Combines PID controller with token bucket

**Features:**
- Automatic CIR adjustment based on system load
- Configurable PID gains (Kp, Ki, Kd)
- Target load setpoint
- Adjustment history tracking
- Min/max CIR multipliers

**Usage:**
```javascript
const { AdaptiveRateLimiter } = require('./qos/adaptive-rate-limiter');

const limiter = new AdaptiveRateLimiter({
    cir: 100,           // Base CIR (tokens/min)
    bc: 200,            // Committed burst
    be: 300,            // Excess burst
    pidKp: 0.5,         // Proportional gain
    pidKi: 0.1,         // Integral gain
    pidKd: 0.2,         // Derivative gain
    targetLoad: 0.80,   // Target system load (80%)
    minCirMultiplier: 0.1,  // Min CIR adjustment (10% of base)
    maxCirMultiplier: 2.0,  // Max CIR adjustment (200% of base)
    adaptationInterval: 5000 // Adaptation period (ms)
});

const result = limiter.classify(1);
console.log(result);
// { allowed: true, color: 'green', classification: 'Conforming', state: {...} }

const state = limiter.getState();
console.log(state);
// { currentCIR: 120, baseCIR: 100, adjustment: 1.2, systemLoad: 0.75, ... }
```

### Fair Queuing (WFQ)

Implements Weighted Fair Queuing to ensure fair resource allocation across extensions with priority support.

**Components:**
- `WeightedRequest` - Request wrapper with priority and virtual finish time
- `ExtensionQueue` - Per-extension queue with weight
- `WeightedFairQueuing` - WFQ scheduler

**Features:**
- Per-extension queues with weights
- Virtual finish time calculation
- Fair bandwidth allocation
- Queue size limits
- Per-extension statistics
- Estimated wait time

**Usage:**
```javascript
const { WeightedFairQueuing } = require('./qos/fair-queuing');

const wfq = new WeightedFairQueuing({
    defaultWeight: 1,
    maxQueueSize: 1000
});

wfq.registerExtension('ext1', { priority: 2 }); // Higher priority
wfq.registerExtension('ext2', { priority: 1 });

const enqueueResult = wfq.enqueue(request, 'ext1');
if (enqueueResult.enqueued) {
    console.log(`Queued at position ${enqueueResult.queuePosition}`);
}

const dequeued = wfq.dequeue();
if (dequeued) {
    console.log(`Serving request from ${dequeued.extensionId}`);
    console.log(`Wait time: ${dequeued.waitTime}ms`);
}

const state = wfq.getQueueState('ext1');
console.log(state);
// { extensionId: 'ext1', weight: 2, queueSize: 5, ... }
```

### Enhanced Circuit Breaker

Extends basic circuit breaker with half-open state canary testing to gradually recover from failures.

**Components:**
- `CanaryRequest` - Test request executed during half-open state
- `EnhancedCircuitBreaker` - Circuit breaker with canary testing

**Features:**
- Three states: CLOSED, OPEN, HALF_OPEN
- Configurable half-open attempts
- Canary request queue
- Automatic canary testing
- State transition history
- Detailed statistics

**Usage:**
```javascript
const { EnhancedCircuitBreaker } = require('./qos/enhanced-circuit-breaker');

const breaker = new EnhancedCircuitBreaker({
    failureThreshold: 5,          // Failures before opening
    resetTimeout: 60000,          // Time before half-open (ms)
    halfOpenMaxAttempts: 3,       // Max half-open attempts
    halfOpenSuccessThreshold: 2,  // Successes to close
    canaryTestInterval: 5000      // Canary test interval (ms)
});

try {
    const result = await breaker.execute(async () => {
        return await someAsyncOperation();
    });
    console.log('Success:', result);
} catch (error) {
    console.log('Circuit breaker:', error.code); // CIRCUIT_OPEN or CIRCUIT_HALF_OPEN
}

const state = breaker.getState();
console.log(state);
// { state: 'HALF_OPEN', failures: 3, halfOpenAttempts: 1, ... }
```

### Warmup Rate Limiting

Provides gradual rate limit ramp-up after extension restart to prevent thundering herd problems.

**Features:**
- Configurable warmup duration
- Multiple warmup curves: linear, exponential, logarithmic, sigmoid
- Gradual CIR increase from start to target
- Restart counting
- Progress tracking

**Usage:**
```javascript
const { WarmupRateLimiter } = require('./qos/warmup-limiter');

const limiter = new WarmupRateLimiter({
    cir: 100,               // Target CIR
    bc: 200,                // Burst capacity
    warmupDuration: 30000,  // 30 seconds warmup
    warmupStartCIR: 10,     // Start at 10 tokens/min (10%)
    warmupCurve: 'exponential' // linear, exponential, logarithmic, sigmoid
});

limiter.startWarmup();

const result = limiter.tryConsume(1);
console.log(result);
// { allowed: true, currentCIR: 25, isWarming: true, warmupProgress: 0.3, ... }

const state = limiter.getState();
console.log(state);
// { currentCIR: 50, targetCIR: 100, isWarming: true, warmupProgress: 0.5, ... }
```

### Global Rate Limiting

Implements system-wide rate limiting with cross-extension quota sharing.

**Features:**
- Global token bucket for all extensions
- Per-extension quotas
- Quota borrowing between extensions
- Minimum reserved quotas
- Weighted quota allocation
- Usage tracking and statistics

**Usage:**
```javascript
const { GlobalRateLimiter } = require('./qos/global-rate-limiter');

const global = new GlobalRateLimiter({
    globalCIR: 1000,      // System-wide CIR
    globalBC: 2000,       // System-wide burst capacity
    sharingEnabled: true, // Enable quota sharing
    minReservedQuota: 0.1 // Reserve 10% of each quota
});

global.registerExtension('ext1', {
    quota: 100,          // Allocated quota
    weight: 2,           // Weight for borrowing
    canShareQuota: true  // Can lend/borrow
});

global.registerExtension('ext2', {
    quota: 50,
    weight: 1,
    canShareQuota: true
});

const result = global.tryConsume('ext1', 1);
if (result.allowed) {
    if (result.source === 'borrowed') {
        console.log(`Borrowed ${result.borrowed} tokens from:`, result.lenders);
    }
}

const globalState = global.getGlobalState();
console.log(globalState);
// { globalTokens: 1500, globalCIR: 1000, stats: {...} }

const extState = global.getExtensionState('ext1');
console.log(extState);
// { quota: 100, used: 50, borrowed: 10, lent: 5, ... }
```

### Rate Limit Analytics

Provides comprehensive analytics, consumption pattern analysis, and quota exhaustion prediction.

**Features:**
- Per-extension consumption tracking
- Time-windowed aggregation
- Hourly consumption patterns (24h)
- Performance metrics calculation
- Anomaly detection (spikes/drops)
- Quota exhaustion prediction
- Dashboard data generation

**Usage:**
```javascript
const { RateLimitAnalytics } = require('./qos/rate-limit-analytics');

const analytics = new RateLimitAnalytics({
    windowSize: 300000,    // 5 minute windows
    maxDataPoints: 1000    // Keep 1000 data points
});

analytics.recordConsumption('ext1', 5, true, {
    classification: 'green',
    latency: 150
});

const pattern = analytics.getConsumptionPattern('ext1');
console.log(pattern);
// { hourlyDistribution: [...], peakHour: 14, quietHour: 3, ... }

const metrics = analytics.getPerformanceMetrics('ext1');
console.log(metrics);
// { avgRequestRate: 10.5, avgAllowRate: 0.95, avgTokensPerRequest: 2.3, ... }

const prediction = analytics.predictQuotaExhaustion('ext1', 1000, 500);
console.log(prediction);
// { prediction: 1699123456789, timeToExhaustion: 3600000, confidence: 0.85, ... }

const anomalies = analytics.getAnomalies('ext1', 2.0);
console.log(anomalies);
// [{ timestamp: ..., type: 'spike', requestRate: 50, expectedRate: 10, deviation: 2.5 }]

const dashboard = analytics.generateDashboardData();
console.log(dashboard);
// { global: {...}, extensions: { ext1: {...}, ext2: {...} } }
```

## Integrated Manager

The `AdvancedRateLimitingManager` integrates all advanced strategies into a single cohesive system.

**Usage:**
```javascript
const { AdvancedRateLimitingManager } = require('./qos/advanced-rate-limiting');

const manager = new AdvancedRateLimitingManager({
    adaptive: true,         // Enable adaptive rate limiting
    fairQueuing: true,      // Enable fair queuing
    warmup: true,           // Enable warmup on restart
    globalLimiting: true,   // Enable global rate limiting
    analytics: true,        // Enable analytics
    global: {
        globalCIR: 1000,
        globalBC: 2000,
        sharingEnabled: true
    },
    fairQueuing: {
        maxQueueSize: 1000
    },
    analytics: {
        windowSize: 300000
    }
});

manager.registerExtension('ext1', {
    cir: 100,
    bc: 200,
    be: 300,
    adaptive: true,         // Use adaptive rate limiting
    warmup: true,           // Enable warmup on restart
    warmupDuration: 30000,
    priority: 2,            // WFQ priority
    globalQuota: 150,       // Global quota
    canShareQuota: true,
    failureThreshold: 5,
    resetTimeout: 60000
});

const result = await manager.executeWithRateLimiting(
    'ext1',
    async () => {
        return await someOperation();
    },
    { /* request metadata */ },
    1 // tokens
);

if (result.success) {
    console.log('Result:', result.result);
    console.log('Classification:', result.classification);
} else {
    console.log('Failed:', result.reason, result.code);
}

const extState = manager.getExtensionState('ext1');
console.log(extState);
// {
//   extensionId: 'ext1',
//   limiter: { currentCIR: 120, baseCIR: 100, ... },
//   circuitBreaker: { state: 'CLOSED', failures: 0, ... },
//   queue: { queueSize: 3, weight: 2, ... },
//   global: { quota: 150, used: 50, borrowed: 10, ... },
//   analytics: {
//     metrics: {...},
//     pattern: {...},
//     anomalies: [...],
//     prediction: {...}
//   }
// }

const dashboard = manager.getDashboard();
console.log(dashboard);
// Complete dashboard with all extensions and global stats
```

## Integration with Pipeline

To integrate with the existing pipeline:

```javascript
const { IOPipeline } = require('./core/pipeline');
const { AdvancedRateLimitingManager } = require('./core/qos/advanced-rate-limiting');

const advancedRateLimiting = new AdvancedRateLimitingManager({
    adaptive: true,
    fairQueuing: true,
    warmup: true,
    globalLimiting: true,
    analytics: true
});

class EnhancedIOPipeline extends IOPipeline {
    constructor(options = {}) {
        super(options);
        this.advancedRateLimiting = advancedRateLimiting;
    }

    registerExtension(extensionId, manifest) {
        super.registerExtension(extensionId, manifest);
        
        const networkCap = manifest.capabilities?.network;
        if (networkCap?.rateLimit) {
            this.advancedRateLimiting.registerExtension(extensionId, {
                cir: networkCap.rateLimit.cir,
                bc: networkCap.rateLimit.bc,
                be: networkCap.rateLimit.be,
                adaptive: networkCap.rateLimit.adaptive,
                warmup: networkCap.rateLimit.warmup,
                priority: networkCap.rateLimit.priority || 1,
                globalQuota: networkCap.rateLimit.globalQuota,
                canShareQuota: networkCap.rateLimit.canShareQuota
            });
        }
    }

    async process(rawMessage) {
        const intent = this.interceptor.intercept(rawMessage);
        
        if (intent.type === 'network') {
            return await this.advancedRateLimiting.executeWithRateLimiting(
                intent.extensionId,
                async () => await super.process(rawMessage),
                rawMessage,
                1
            );
        }
        
        return await super.process(rawMessage);
    }
}
```

## Configuration in Manifest

Extensions can configure advanced rate limiting in their manifest:

```json
{
  "id": "my-extension",
  "name": "My Extension",
  "capabilities": {
    "network": {
      "allowlist": ["https://api.example.com"],
      "rateLimit": {
        "cir": 100,
        "bc": 200,
        "be": 300,
        "adaptive": true,
        "warmup": true,
        "warmupDuration": 30000,
        "warmupStartCIR": 10,
        "warmupCurve": "exponential",
        "priority": 2,
        "weight": 2,
        "globalQuota": 150,
        "canShareQuota": true,
        "failureThreshold": 5,
        "resetTimeout": 60000,
        "pidKp": 0.5,
        "pidKi": 0.1,
        "pidKd": 0.2,
        "targetLoad": 0.80
      }
    }
  }
}
```

## Monitoring and Observability

### Dashboard Endpoints

Expose advanced rate limiting metrics via telemetry server:

```javascript
// In telemetry.js
if (req.url === '/rate-limiting/dashboard') {
    const dashboard = advancedRateLimiting.getDashboard();
    res.writeHead(200);
    res.end(JSON.stringify(dashboard, null, 2));
    return;
}

if (req.url.startsWith('/rate-limiting/extension/')) {
    const extensionId = req.url.split('/')[3];
    const state = advancedRateLimiting.getExtensionState(extensionId);
    res.writeHead(200);
    res.end(JSON.stringify(state, null, 2));
    return;
}

if (req.url === '/rate-limiting/analytics') {
    const analytics = advancedRateLimiting.analytics.generateDashboardData();
    res.writeHead(200);
    res.end(JSON.stringify(analytics, null, 2));
    return;
}
```

### WebSocket Events

Broadcast rate limiting events:

```javascript
telemetryServer.broadcast('rate_limit_violation', {
    extensionId: 'ext1',
    reason: 'Rate limit exceeded',
    classification: 'red'
});

telemetryServer.broadcast('quota_exhaustion_predicted', {
    extensionId: 'ext1',
    timeToExhaustion: 3600000,
    confidence: 0.85
});

telemetryServer.broadcast('circuit_breaker_opened', {
    extensionId: 'ext1',
    failures: 5
});
```

## Performance Considerations

1. **Adaptive Rate Limiting**: Adds ~5ms overhead for PID calculation and system monitoring
2. **Fair Queuing**: Adds ~2ms overhead per enqueue/dequeue operation
3. **Analytics**: Minimal overhead (~1ms) for recording, async persistence
4. **Global Limiting**: ~1ms overhead for quota checking and borrowing
5. **Warmup**: Negligible overhead, only during warmup period

## Best Practices

1. **Enable adaptive rate limiting** for extensions with variable load patterns
2. **Use warmup** for all extensions to prevent thundering herd on restart
3. **Configure priorities** in fair queuing based on business importance
4. **Enable quota sharing** for better resource utilization
5. **Monitor analytics** to detect anomalies and predict exhaustion
6. **Tune PID gains** based on system characteristics
7. **Set appropriate warmup curves** (exponential for gradual, linear for predictable)
8. **Reserve minimum quotas** to prevent starvation in global limiting

## Troubleshooting

### High Error Rates
- Check adaptive rate limiting adjustment history
- Verify PID gains are appropriate
- Consider increasing base CIR

### Queue Buildup
- Check fair queuing statistics
- Verify weights are balanced
- Consider increasing max queue size or CIR

### Circuit Breaker Stuck Open
- Check half-open configuration
- Verify canary requests are succeeding
- Consider increasing reset timeout

### Quota Exhaustion
- Check analytics prediction
- Review consumption patterns
- Consider increasing quota or enabling sharing

### Warmup Too Slow/Fast
- Adjust warmup duration
- Change warmup curve (exponential vs linear)
- Modify start CIR percentage
