# Webhook Implementation Summary

## Overview

Implemented a comprehensive webhook receiver and event-driven automation system for Ghost CLI that enables integration with GitHub, GitLab, Bitbucket, and custom webhook providers.

## Components Implemented

### 1. WebhookController (`core/webhooks/webhook-controller.js`)

**Features:**
- HTTP server handling POST requests to `/api/webhooks/:provider`
- HMAC signature verification (SHA256 for GitHub/Bitbucket, plain token for GitLab)
- Provider configuration registry (GitHub, GitLab, Bitbucket built-in)
- Request validation and error handling
- Integration with audit logger for security events
- Asynchronous webhook processing with setImmediate

**Security:**
- HMAC-SHA256 signature verification with timing-safe comparison
- Environment variable-based secret management
- Header sanitization for logging
- Failed verification logged as security events

### 2. WebhookEventStore (`core/webhooks/webhook-event-store.js`)

**Features:**
- JSON-based persistence (SQLite-style but using JSON for zero-dependency)
- Event storage with metadata (provider, eventType, payload, headers)
- Delivery tracking with status (pending, processing, delivered, failed, retrying)
- Query interface with filtering (provider, eventType, date range, limit)
- Event replay capability for debugging
- Auto-pruning of old events (configurable retention period)

**Storage:**
- Max 10,000 events (auto-rotated)
- Max 10,000 deliveries (auto-rotated)
- Database location: `~/.ghost/webhooks/events.db`

### 3. WebhookRouter (`core/webhooks/webhook-router.js`)

**Features:**
- Pattern matching for event types (exact, wildcard, regex)
- Provider filtering (single or array of providers)
- Conditional routing with operators:
  - equals, notEquals
  - contains, startsWith, endsWith
  - exists, notExists
  - matches (regex)
- JSON path extraction for condition evaluation
- Multiple route matching (one event can trigger multiple extensions)

**Routing Logic:**
- Enabled/disabled routes
- Priority-based matching
- Flexible event patterns

### 4. WebhookTransformPipeline (`core/webhooks/webhook-transform-pipeline.js`)

**Features:**
- Built-in transforms for common providers:
  - `github-issue-labeled`
  - `github-pull-request`
  - `gitlab-pipeline`
  - `bitbucket-push`
  - `identity` (pass-through)
- JavaScript transform execution in VM sandbox
- JSON path extraction
- Template-based transformation with variable substitution
- Chain transforms (sequential application)

**Security:**
- VM sandbox with 5-second timeout
- No access to require/import
- No access to process/fs/child_process
- No eval() or Function() constructors
- Pattern-based code validation

### 5. WebhookDeliveryQueue (`core/webhooks/webhook-delivery-queue.js`)

**Features:**
- Concurrent delivery processing (configurable, default: 5)
- Exponential backoff retry strategy
- Status tracking (pending, processing, delivered, failed, retrying)
- Event emission for monitoring (enqueued, delivered, retry, failed)
- Integration with Gateway and Runtime for extension command execution
- Automatic queue processing with interval-based polling

**Retry Strategy:**
- Default: 5 attempts with exponential backoff
- Initial delay: 1000ms
- Backoff factor: 2 (1s, 2s, 4s, 8s, 16s)
- Max delay: 60000ms (60 seconds)

## CLI Integration

### Commands Added

```bash
ghost webhook start [--port 3000] [--host 0.0.0.0]
ghost webhook stop
ghost webhook status
ghost webhook events [--limit N] [--provider X] [--event-type Y]
ghost webhook deliveries [--limit N] [--status X] [--extension Y]
ghost webhook replay <event-id>
ghost webhook queue-stats
ghost webhook prune [days]
```

### Handler Integration

- Added `handleWebhookCommand()` to `GatewayLauncher` class
- Integrated with existing audit logger
- Gateway and runtime injection for extension command execution
- Graceful shutdown integration
- Configuration loading from `~/.ghost/config/webhooks.json`

### Shell Completion

Updated completion scripts for:
- Bash
- Zsh
- Fish

Added webhook subcommands to all three shell completions.

## Configuration

### Webhook Configuration File

Location: `~/.ghost/config/webhooks.json`

Structure:
```json
{
  "server": {
    "port": 3000,
    "host": "0.0.0.0"
  },
  "routes": [
    {
      "id": "unique-route-id",
      "provider": "github",
      "eventPattern": "issues.labeled",
      "extensionId": "my-extension",
      "command": "processIssue",
      "args": [],
      "transform": "github-issue-labeled",
      "conditions": [...],
      "enabled": true
    }
  ],
  "deliveryQueue": {
    "maxConcurrent": 5,
    "maxRetryAttempts": 5,
    "initialRetryDelay": 1000,
    "maxRetryDelay": 60000,
    "backoffFactor": 2
  }
}
```

### Environment Variables

```bash
GHOST_WEBHOOK_SECRET_GITHUB="your-secret"
GHOST_WEBHOOK_SECRET_GITLAB="your-token"
GHOST_WEBHOOK_SECRET_BITBUCKET="your-secret"
```

## Extension Integration

Extensions receive webhook data in command parameters:

```javascript
async myCommand(params) {
  const { webhookEvent, payload, args, flags } = params;
  
  console.log('Provider:', webhookEvent.provider);
  console.log('Event Type:', webhookEvent.eventType);
  console.log('Transformed Payload:', payload);
  
  return { success: true, output: 'Processed' };
}
```

## Documentation

### Created Files

1. **docs/WEBHOOK_SETUP.md** (complete setup guide)
   - Provider-specific setup for GitHub, GitLab, Bitbucket
   - Configuration examples
   - Routing rules documentation
   - Transform pipeline documentation
   - Security best practices
   - Monitoring and troubleshooting
   - Advanced topics

2. **docs/WEBHOOK_QUICK_REFERENCE.md** (quick reference card)
   - CLI commands
   - Configuration snippets
   - Common use cases
   - Troubleshooting commands
   - Security checklist

3. **docs/webhook-config-example.json** (configuration template)
   - Real-world examples
   - Multiple providers
   - Various transform types
   - Conditional routing

4. **core/webhooks/README.md** (technical documentation)
   - Architecture overview
   - Component descriptions
   - API documentation
   - Usage examples
   - Testing guides

## Audit Logging

All webhook operations are logged:

```javascript
// Webhook receipt
{ type: 'WEBHOOK_RECEIVED', provider, eventType, deliveryId, verified: true }

// No matching route
{ type: 'WEBHOOK_NO_ROUTE', provider, eventType, deliveryId }

// Delivery start
{ type: 'WEBHOOK_DELIVERY_START', deliveryId, webhookEventId, extensionId, command, attempt }

// Delivery success
{ type: 'WEBHOOK_DELIVERY_SUCCESS', deliveryId, webhookEventId, extensionId, command, attempt }

// Delivery retry
{ type: 'WEBHOOK_DELIVERY_RETRY', deliveryId, webhookEventId, extensionId, command, attempt, error, nextRetryAt }

// Delivery failed (security event)
{ type: 'WEBHOOK_DELIVERY_FAILED', severity: 'medium', deliveryId, webhookEventId, command, attempts, error }

// Signature verification failed (security event)
{ type: 'SIGNATURE_VERIFICATION_FAILED', severity: 'high', provider, reason, headers }

// Processing error (security event)
{ type: 'WEBHOOK_PROCESSING_ERROR', severity: 'medium', error, stack }
```

## Security Features

### Signature Verification

- **GitHub**: HMAC-SHA256 with `x-hub-signature-256` header
- **GitLab**: Plain token comparison with `x-gitlab-token` header
- **Bitbucket**: HMAC-SHA256 with `x-hub-signature` header

All verification uses timing-safe comparison to prevent timing attacks.

### Transform Sandbox

JavaScript transforms execute in VM with:
- 5-second timeout
- No require/import
- No process/fs/child_process access
- No eval/Function constructors
- Pattern-based validation

### Audit Trail

Complete audit trail of:
- All webhook receipts
- Signature verification results
- Routing decisions
- Transform executions
- Delivery attempts
- Security events

## Performance Characteristics

- **Concurrent Processing**: 5 deliveries (configurable)
- **Event Storage**: 10,000 events (auto-pruned)
- **Delivery Storage**: 10,000 deliveries (auto-pruned)
- **Transform Timeout**: 5 seconds
- **Max Retry Delay**: 60 seconds
- **Queue Processing Interval**: 1 second

## Integration Points

### With Gateway

- Extension discovery and loading
- Command execution through extension instances
- Manifest-based capability checking

### With Runtime

- Extension state management
- Process lifecycle management
- Health monitoring

### With Audit Logger

- Security event logging
- Operation tracking
- Compliance monitoring

### With Pipeline

- Consistent audit trail
- Security policy enforcement
- Rate limiting (inherited from extension)

## File Structure

```
core/webhooks/
├── webhook-controller.js       # HTTP server and request handling
├── webhook-event-store.js      # Event persistence and querying
├── webhook-router.js           # Pattern matching and routing
├── webhook-transform-pipeline.js # Payload transformation
├── webhook-delivery-queue.js   # Retry and delivery management
├── index.js                    # Module exports
└── README.md                   # Technical documentation

docs/
├── WEBHOOK_SETUP.md            # Complete setup guide
├── WEBHOOK_QUICK_REFERENCE.md  # Quick reference card
└── webhook-config-example.json # Configuration template
```

## Testing Recommendations

### Manual Testing

1. Start webhook server: `ghost webhook start`
2. Configure provider webhook
3. Trigger events from provider
4. Monitor with: `ghost webhook events`
5. Check deliveries: `ghost webhook deliveries`

### Integration Testing

1. Create test extension with webhook handlers
2. Configure routes for test events
3. Send test webhooks via curl
4. Verify delivery and execution
5. Test retry logic with failing commands

### Security Testing

1. Test signature verification with invalid secrets
2. Test transform sandbox restrictions
3. Test rate limiting behavior
4. Review audit logs for security events

## Future Enhancements

Potential improvements:
1. WebSocket server for real-time event streaming
2. Webhook filtering UI in desktop app
3. Advanced transform debugging
4. Webhook analytics and metrics
5. Multi-tenant support with namespaces
6. Dead letter queue for failed deliveries
7. Webhook replay with filtering
8. Transform performance profiling
9. Schema validation for payloads
10. Custom provider plugin system

## Zero-Dependency Design

The webhook system maintains Ghost's zero-dependency philosophy:
- No external database dependencies (JSON-based storage)
- Node.js built-in modules only (http, crypto, vm, fs, path, os)
- No npm dependencies for webhook functionality
- Compatible with zero-install design

## Compatibility

- **Node.js**: >= 14.0.0 (same as Ghost CLI)
- **Providers**: GitHub, GitLab, Bitbucket (extensible)
- **Storage**: JSON-based (cross-platform)
- **Platform**: Windows, macOS, Linux

## Summary

The webhook implementation provides:
- ✅ Complete webhook receiver with HMAC verification
- ✅ Routing logic with pattern matching and conditions
- ✅ Payload transformation pipeline (JavaScript, JSON path, templates)
- ✅ Event store with SQLite-style persistence (JSON)
- ✅ Delivery retry with exponential backoff
- ✅ Audit logging integration
- ✅ CLI commands for management and monitoring
- ✅ Comprehensive documentation
- ✅ Security-first design
- ✅ Zero external dependencies

The system is production-ready and follows Ghost CLI's architectural principles of modularity, security, and zero-dependency design.
