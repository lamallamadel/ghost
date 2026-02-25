# QoS - Token Bucket Traffic Policing

## Overview

The Token Bucket traffic policing engine implements a Single Rate Three-Color Marker (srTCM) algorithm as specified in RFC 2697. It provides per-extension rate limiting with CIR-based token replenishment and three-color classification.

## Architecture

### Single Rate Three-Color Token Bucket (RFC 2697)

The implementation uses two token buckets replenished at a single rate:

- **Committed Bucket (Bc)**: Holds tokens for conforming traffic (green)
- **Excess Bucket (Be)**: Holds tokens for exceeding traffic (yellow)

Both buckets are replenished at the **Committed Information Rate (CIR)** measured in tokens per minute. This differs from RFC 2698's trTCM which uses two separate rates (CIR and PIR).

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

The `classify()` method implements strict srTCM semantics:
- First attempts to consume from Bc (green classification)
- If Bc insufficient, attempts to consume from Be (yellow classification)
- If both insufficient, marks as red (violating)

## Features

### CIR-Based Token Replenishment

Tokens are added to both buckets at the CIR rate:
- Formula: `tokens_to_add = (elapsed_seconds * CIR) / 60`
- Committed tokens capped at Bc capacity
- Excess tokens capped at Be capacity
- Bc is filled first, then overflow goes to Be (RFC 2697 compliance)

### Per-Extension State Persistence

Token bucket state is persisted to `~/.ghost/rate-limits.json` containing:
- `committedTokens`: Current tokens in committed bucket
- `excessTokens`: Current tokens in excess bucket
- `cir`: Committed information rate (tokens/min)
- `bc`: Committed burst size
- `be`: Excess burst size
- `lastRefill`: Timestamp of last token replenishment

State is automatically saved on:
- Token consumption (police operation)
- Bucket reset
- Extension cleanup

### Integration with Authorization Layer

The traffic policer is integrated into `auth.js` and executes **before** the audit layer:

1. Request arrives at authorization layer
2. Permission checks are performed
3. **Traffic policing occurs (Violating requests are dropped)**
4. Legacy rate limiting (if configured)
5. Request proceeds to audit layer

Violating requests are immediately dropped with:
- `authorized: false`
- `code: 'QOS_VIOLATING'`
- Classification metadata in response

## API

### TrafficPolicer

```javascript
const { TrafficPolicer } = require('./core/qos/token-bucket');

const policer = new TrafficPolicer({
    persistencePath: '~/.ghost/rate-limits.json',  // Optional
    dropViolating: true                             // Optional, default: true
});
```

#### Methods

**`registerExtension(extensionId, config)`**
- Registers an extension with traffic policing
- `config`: `{ cir, bc, be }` (be defaults to bc if not provided)
- Creates and persists token buckets

**`police(extensionId, tokens = 1)`**
- Classifies and potentially consumes tokens
- Returns: `{ allowed, classification, color, [reason], [code], [state] }`
- If `dropViolating: true`, red traffic is rejected

**`getState(extensionId)`**
- Returns current bucket state for an extension

**`getAllStates()`**
- Returns all bucket states

**`reset(extensionId)`**
- Refills both buckets to capacity

**`cleanup(extensionId)`**
- Removes extension state and persists

### SingleRateThreeColorTokenBucket

Low-level bucket implementation (typically not used directly).

```javascript
const { SingleRateThreeColorTokenBucket } = require('./core/qos/token-bucket');

const bucket = new SingleRateThreeColorTokenBucket({
    cir: 60,      // 60 tokens/min
    bc: 100,      // Committed burst
    be: 200       // Excess burst
});
```

## Configuration

Extensions declare rate limits in their manifest:

```json
{
  "capabilities": {
    "network": {
      "rateLimit": {
        "cir": 60,
        "bc": 100,
        "be": 200
      }
    }
  }
}
```

## Integration Example

```javascript
const { IOPipeline } = require('./core/pipeline');

const pipeline = new IOPipeline({
    persistencePath: '/custom/path/rate-limits.json',
    dropViolating: true
});

pipeline.registerExtension('my-extension', manifest);

// Request will be policed before reaching audit layer
const result = await pipeline.process({
    extensionId: 'my-extension',
    type: 'network',
    operation: 'fetch',
    params: { url: 'https://api.example.com' }
});

// Check traffic policer state
const state = pipeline.getTrafficPolicerState('my-extension');
console.log(`Green tokens: ${state.committedTokens}/${state.committedCapacity}`);
console.log(`Yellow tokens: ${state.excessTokens}/${state.excessCapacity}`);

// Reset if needed
pipeline.resetTrafficPolicer('my-extension');
```

## Security Notes

- Violating traffic is dropped **before** the audit layer logs it
- State persistence ensures rate limits survive process restarts
- Token replenishment is time-based, not request-based (prevents gaming)
- Separate buckets prevent burst abuse while allowing legitimate spikes
- RFC 2697 compliant implementation ensures predictable traffic shaping behavior
