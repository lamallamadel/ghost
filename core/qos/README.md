# QoS - Token Bucket Traffic Policing

## Overview

The Token Bucket traffic policing engine implements a two-rate three-color marker (trTCM) algorithm as specified in RFC 2698. It provides per-extension rate limiting with CIR-based token replenishment and three-color classification.

## Architecture

### Two-Rate Three-Color Token Bucket

The implementation uses two token buckets:

- **Committed Bucket (Bc)**: Holds tokens for conforming traffic (green)
- **Excess Bucket (Be)**: Holds tokens for exceeding traffic (yellow)

Both buckets are replenished at the **Committed Information Rate (CIR)** measured in tokens per minute.

### Three-Color Classification

Traffic is classified into three categories:

1. **Conforming (Green)**: Traffic within the committed rate - tokens available in Bc
2. **Exceeding (Yellow)**: Traffic above committed but within excess rate - tokens available in Be
3. **Violating (Red)**: Traffic exceeding both committed and excess rates - no tokens available

## Features

### CIR-Based Token Replenishment

Tokens are added to both buckets at the CIR rate:
- Formula: `tokens_to_add = (elapsed_seconds * CIR) / 60`
- Committed tokens capped at Bc capacity
- Excess tokens capped at Be capacity

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

### TwoRateThreeColorTokenBucket

Low-level bucket implementation (typically not used directly).

```javascript
const { TwoRateThreeColorTokenBucket } = require('./core/qos/token-bucket');

const bucket = new TwoRateThreeColorTokenBucket({
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
