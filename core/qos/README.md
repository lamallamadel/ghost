# QoS - Quality of Service & Rate Limiting

## Overview

The QoS module provides comprehensive rate limiting and traffic management capabilities for the Ghost CLI. It includes both basic token bucket rate limiting (RFC 2697) and advanced strategies for adaptive, fair, and intelligent rate limiting.

## Modules

### Basic Rate Limiting
- **token-bucket.js** - Single Rate Three-Color Marker (srTCM) RFC 2697 implementation

### Advanced Rate Limiting Strategies
- **adaptive-rate-limiter.js** - Dynamic CIR adjustment using PID controller
- **fair-queuing.js** - Weighted Fair Queuing (WFQ) for priority-based scheduling
- **enhanced-circuit-breaker.js** - Circuit breaker with half-open state canary testing
- **warmup-limiter.js** - Gradual rate limit ramp-up after restart
- **global-rate-limiter.js** - System-wide rate limiting with quota sharing
- **rate-limit-analytics.js** - Consumption patterns and exhaustion prediction
- **advanced-rate-limiting.js** - Integrated manager for all strategies

## Documentation

- **README.md** - This file (overview and basic usage)
- **ADVANCED_RATE_LIMITING.md** - Complete guide to advanced features
- **advanced-usage-example.js** - Runnable example demonstrating all features

## Quick Start

### Basic Token Bucket

```javascript
const { TrafficPolicer } = require('./core/qos/token-bucket');

const policer = new TrafficPolicer();
policer.registerExtension('my-ext', { cir: 60, bc: 100, be: 200 });

const result = policer.police('my-ext', 1);
if (result.allowed) {
    console.log(`Allowed - ${result.color} classification`);
}
```

### Advanced Rate Limiting

```javascript
const { AdvancedRateLimitingManager } = require('./core/qos/advanced-rate-limiting');

const manager = new AdvancedRateLimitingManager({
    adaptive: true,
    fairQueuing: true,
    warmup: true,
    globalLimiting: true,
    analytics: true
});

manager.registerExtension('my-ext', {
    cir: 100,
    bc: 200,
    adaptive: true,
    warmup: true,
    priority: 2,
    globalQuota: 150
});

const result = await manager.executeWithRateLimiting(
    'my-ext',
    async () => await someOperation(),
    {},
    1
);
```

See **ADVANCED_RATE_LIMITING.md** for complete documentation and examples.

## Architecture

### Single Rate Three-Color Token Bucket (RFC 2697)

The basic implementation uses two token buckets replenished at a single rate:

- **Committed Bucket (Bc)**: Holds tokens for conforming traffic (green)
- **Excess Bucket (Be)**: Holds tokens for exceeding traffic (yellow)

Both buckets are replenished at the **Committed Information Rate (CIR)** measured in tokens per minute.

### Token Replenishment with Bc-First Overflow

RFC 2697 srTCM specifies that tokens are added to the committed bucket first, with overflow going to the excess bucket:

1. Calculate tokens to add based on elapsed time: `tokens_to_add = (elapsed_seconds * CIR) / 60`
2. Fill Bc up to its capacity
3. Remaining tokens overflow to Be, capped at Be capacity

This behavior ensures committed traffic always has priority, while allowing burst capacity for temporary spikes.

### Three-Color Classification

Traffic is classified into three categories based on token consumption:

1. **Conforming (Green)**: Tokens consumed from Bc - traffic within committed rate
2. **Exceeding (Yellow)**: Tokens consumed from Be when Bc exhausted - traffic above committed but within excess rate
3. **Violating (Red)**: Both Bc and Be exhausted - traffic exceeding all rate limits

## Advanced Features

### 1. Adaptive Rate Limiting

Dynamically adjusts CIR based on system load using PID control algorithm:

- Monitors CPU usage, memory usage, request rate, and error rate
- Automatically increases CIR when system load is low
- Automatically decreases CIR when system load is high
- Configurable PID gains and target load setpoint

### 2. Fair Queuing (WFQ)

Ensures fair resource allocation with priority support:

- Per-extension queues with configurable weights
- Virtual finish time calculation for fairness
- Priority-based scheduling
- Queue size limits and statistics

### 3. Enhanced Circuit Breaker

Extends basic circuit breaker with intelligent recovery:

- CLOSED, OPEN, and HALF_OPEN states
- Canary request testing in half-open state
- Configurable success thresholds for recovery
- State transition history tracking

### 4. Warmup Rate Limiting

Prevents thundering herd after extension restart:

- Gradual CIR ramp-up from low start rate to target
- Multiple warmup curves: linear, exponential, logarithmic, sigmoid
- Configurable warmup duration
- Progress tracking

### 5. Global Rate Limiting

System-wide rate limiting with quota sharing:

- Global token bucket for all extensions
- Per-extension quota allocation
- Cross-extension quota borrowing
- Minimum reserved quotas to prevent starvation

### 6. Rate Limit Analytics

Comprehensive analytics and prediction:

- Per-extension consumption tracking
- 24-hour consumption patterns
- Anomaly detection (spikes/drops)
- Quota exhaustion prediction with confidence levels
- Performance metrics

## Integration with Pipeline

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
            this.advancedRateLimiting.registerExtension(extensionId, networkCap.rateLimit);
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

## Telemetry Endpoints

The advanced rate limiting system exposes the following HTTP endpoints:

- `GET /rate-limiting/dashboard` - Complete dashboard data
- `GET /rate-limiting/extension/:extensionId` - Extension-specific state
- `GET /rate-limiting/global` - Global rate limiting state
- `GET /rate-limiting/analytics` - Analytics data for all extensions
- `POST /rate-limiting/reset/:extensionId` - Reset extension rate limiter

## Desktop UI Dashboard

A React-based dashboard component is available at `desktop/src/components/RateLimitDashboard.tsx` that provides:

- Real-time extension monitoring
- Global overview statistics
- Per-extension details (limiter, circuit breaker, queue, quota, analytics)
- 24-hour consumption pattern visualization
- Quota exhaustion predictions
- Anomaly detection display
- Auto-refresh capability

## Performance

- **Token Bucket**: <0.5ms overhead per request (optimized with object pooling)
- **Adaptive Rate Limiting**: ~5ms overhead for PID calculation and system monitoring
- **Fair Queuing**: ~2ms overhead per enqueue/dequeue operation
- **Enhanced Circuit Breaker**: Minimal overhead, canary testing in background
- **Warmup**: Negligible overhead, only during warmup period
- **Global Limiting**: ~1ms overhead for quota checking and borrowing
- **Analytics**: ~1ms overhead for recording, async persistence

## Best Practices

1. **Enable adaptive rate limiting** for extensions with variable load patterns
2. **Use warmup** for all extensions to prevent thundering herd on restart
3. **Configure priorities** in fair queuing based on business importance
4. **Enable quota sharing** for better resource utilization in global limiting
5. **Monitor analytics** to detect anomalies and predict exhaustion
6. **Tune PID gains** based on system characteristics (default: Kp=0.5, Ki=0.1, Kd=0.2)
7. **Set appropriate warmup curves** (exponential for gradual, linear for predictable)
8. **Reserve minimum quotas** to prevent starvation in global limiting

## Configuration in Manifest

Extensions can configure advanced rate limiting in their manifest:

```json
{
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
        "warmupCurve": "exponential",
        "priority": 2,
        "globalQuota": 150,
        "canShareQuota": true,
        "pidKp": 0.5,
        "pidKi": 0.1,
        "pidKd": 0.2,
        "targetLoad": 0.80
      }
    }
  }
}
```

## Running the Example

```bash
node core/qos/advanced-usage-example.js
```

This will demonstrate all advanced rate limiting features with simulated traffic.

## Security Notes

- Violating traffic is dropped **before** the audit layer logs it
- State persistence ensures rate limits survive process restarts
- Token replenishment is time-based, not request-based (prevents gaming)
- Separate buckets prevent burst abuse while allowing legitimate spikes
- RFC 2697 compliant implementation ensures predictable traffic shaping behavior
- Circuit breakers prevent cascading failures
- Fair queuing prevents resource starvation
- Global limiting prevents system-wide resource exhaustion
