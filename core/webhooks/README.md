# Ghost Webhook System

Event-driven automation system for Ghost CLI that enables webhook receivers for GitHub, GitLab, Bitbucket, and custom providers.

## Architecture

```
WebhookController
├── WebhookEventStore (SQLite-based persistence)
├── WebhookRouter (pattern matching and routing)
├── WebhookTransformPipeline (payload transformation)
└── WebhookDeliveryQueue (retry with exponential backoff)
```

## Components

### WebhookController

Main HTTP server that:
- Receives POST requests at `/api/webhooks/:provider`
- Verifies HMAC signatures for security
- Routes events to appropriate extensions
- Integrates with Ghost audit logger

### WebhookEventStore

Persistence layer that:
- Stores webhook events and deliveries in JSON database
- Supports querying with filters (provider, event type, date range)
- Enables event replay for debugging
- Prunes old events to manage storage

### WebhookRouter

Pattern matching engine that:
- Matches provider and event type patterns
- Evaluates conditional expressions
- Supports wildcards and regex patterns
- Routes to multiple extensions if needed

### WebhookTransformPipeline

Payload transformation system that:
- Applies built-in transforms (GitHub, GitLab, Bitbucket)
- Executes custom JavaScript transforms in sandboxed VM
- Supports JSON path extraction
- Enables template-based transformations
- Chains multiple transforms

### WebhookDeliveryQueue

Reliable delivery system that:
- Queues webhook deliveries for processing
- Executes extension commands with transformed payloads
- Retries failed deliveries with exponential backoff
- Tracks delivery status and attempts
- Limits concurrent processing

## Security

### Signature Verification

- **GitHub**: HMAC-SHA256 with `x-hub-signature-256` header
- **GitLab**: Plain token comparison with `x-gitlab-token` header
- **Bitbucket**: HMAC-SHA256 with `x-hub-signature` header

All signature verification failures are logged as security events.

### Transform Sandbox

JavaScript transforms run in a VM sandbox with:
- No access to `require()` or `import`
- No access to `process`, `fs`, `child_process`
- No `eval()` or `Function()` constructors
- 5-second execution timeout

### Audit Logging

All operations are logged:
- Webhook receipts with verification status
- Routing decisions
- Transform executions
- Delivery attempts and results
- Security events

## Usage

See [WEBHOOK_SETUP.md](../../docs/WEBHOOK_SETUP.md) for complete setup guide.

### Quick Start

```bash
# Start webhook server
ghost webhook start

# Configure secrets
export GHOST_WEBHOOK_SECRET_GITHUB="your-secret"

# View events
ghost webhook events --limit 50

# View deliveries
ghost webhook deliveries --status failed
```

### Configuration

Place configuration in `~/.ghost/config/webhooks.json`:

```json
{
  "server": {
    "port": 3000,
    "host": "0.0.0.0"
  },
  "routes": [
    {
      "provider": "github",
      "eventPattern": "issues.labeled",
      "extensionId": "my-extension",
      "command": "processIssue",
      "transform": "github-issue-labeled"
    }
  ]
}
```

## Extension Integration

Extensions receive webhook data in their command handlers:

```javascript
async processIssue(params) {
  const { webhookEvent, payload, args, flags } = params;
  
  console.log('Event:', webhookEvent.eventType);
  console.log('Issue:', payload.issueNumber);
  
  return { success: true };
}
```

## Built-in Transforms

- `identity` - Pass-through (no transformation)
- `github-issue-labeled` - Extract GitHub issue and label info
- `github-pull-request` - Extract GitHub PR details
- `gitlab-pipeline` - Extract GitLab pipeline status
- `bitbucket-push` - Extract Bitbucket push and commit info

## Custom Transforms

### JavaScript Transform

```json
{
  "transform": {
    "type": "javascript",
    "options": {
      "code": "result = { id: payload.issue.number, title: payload.issue.title };"
    }
  }
}
```

### JSON Path Transform

```json
{
  "transform": {
    "type": "jsonPath",
    "options": {
      "path": "pull_request.head.ref"
    }
  }
}
```

### Template Transform

```json
{
  "transform": {
    "type": "template",
    "options": {
      "template": "Issue #{{issue.number}}: {{issue.title}}"
    }
  }
}
```

## Retry Strategy

Exponential backoff with configurable parameters:

- `maxAttempts`: Maximum retry attempts (default: 5)
- `initialDelay`: Initial retry delay in ms (default: 1000)
- `maxDelay`: Maximum retry delay in ms (default: 60000)
- `backoffFactor`: Exponential backoff factor (default: 2)

Retry delays: 1s, 2s, 4s, 8s, 16s (with maxDelay cap)

## Database Format

Events and deliveries are stored as JSON:

```json
{
  "events": [
    {
      "id": "delivery-id",
      "provider": "github",
      "eventType": "issues.labeled",
      "payload": { ... },
      "receivedAt": "2024-01-01T00:00:00.000Z"
    }
  ],
  "deliveries": [
    {
      "id": "delivery-id",
      "webhookEventId": "event-id",
      "extensionId": "my-extension",
      "command": "processIssue",
      "status": "delivered",
      "attempts": 1,
      "createdAt": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

## API

### WebhookController

```javascript
const controller = new WebhookController({
  port: 3000,
  host: '0.0.0.0',
  routerConfig: { routes: [...] },
  auditLogger: auditLogger
});

await controller.start();
await controller.stop();

controller.addRoute({ ... });
controller.addTransform('name', transformFn);
controller.registerProvider('custom', { ... });
```

### WebhookEventStore

```javascript
const eventStore = new WebhookEventStore(dbPath);

await eventStore.saveEvent(event);
await eventStore.getEvent(eventId);
await eventStore.queryEvents({ provider, eventType, limit });

await eventStore.saveDelivery(delivery);
await eventStore.updateDelivery(deliveryId, updates);
await eventStore.queryDeliveries({ status, extensionId });

await eventStore.pruneOldEvents(30);
```

### WebhookRouter

```javascript
const router = new WebhookRouter({ routes: [...] });

router.addRoute({ provider, eventPattern, extensionId, command });
router.removeRoute(routeId);

const matchingRoutes = router.route(webhookEvent);
```

### WebhookTransformPipeline

```javascript
const pipeline = new WebhookTransformPipeline();

pipeline.addTransform('custom', (event) => { ... });
const result = await pipeline.transform(event, transformConfig);
```

### WebhookDeliveryQueue

```javascript
const queue = new WebhookDeliveryQueue({
  auditLogger: auditLogger,
  eventStore: eventStore,
  maxConcurrent: 5
});

queue.setGateway(gateway);
queue.setRuntime(runtime);

await queue.enqueue(delivery);
const stats = queue.getQueueStats();
```

## Events

The delivery queue emits events:

```javascript
queue.on('enqueued', (delivery) => { ... });
queue.on('delivered', (delivery, result) => { ... });
queue.on('retry', (delivery, error) => { ... });
queue.on('failed', (delivery, error) => { ... });
```

## Testing

### Manual Testing

```bash
# Send test webhook
curl -X POST http://localhost:3000/api/webhooks/github \
  -H "Content-Type: application/json" \
  -H "x-hub-signature-256: sha256=..." \
  -H "x-github-event: issues" \
  -d '{"action":"labeled","issue":{"number":123}}'
```

### Replay Events

```bash
# Replay specific event
ghost webhook replay <event-id>

# Replay failed deliveries
ghost webhook deliveries --status failed | jq -r '.[].webhookEventId' | \
  xargs -I {} ghost webhook replay {}
```

## Monitoring

```bash
# View recent events
ghost webhook events --limit 50

# Filter by provider
ghost webhook events --provider github

# View delivery status
ghost webhook deliveries --status delivered

# Queue statistics
ghost webhook queue-stats
```

## Troubleshooting

### Webhook Not Received

1. Check server is running: `ghost webhook status`
2. Verify port is accessible
3. Check provider webhook configuration
4. Review audit logs: `ghost audit-log view --type WEBHOOK_RECEIVED`

### Signature Verification Failed

1. Verify secret environment variable is set
2. Check secret matches provider configuration
3. Review security event logs

### Delivery Failures

1. Check extension is loaded: `ghost extension list`
2. Verify command exists on extension
3. Review delivery errors: `ghost webhook deliveries --status failed`

## Performance

- Concurrent processing: 5 deliveries (configurable)
- Event storage: 10,000 max events (auto-pruned)
- Delivery storage: 10,000 max deliveries (auto-pruned)
- Transform timeout: 5 seconds
- Retry delays: Exponential backoff up to 60 seconds

## Best Practices

1. **Use specific event patterns** - Avoid wildcards when possible
2. **Transform payloads** - Extract only needed data
3. **Set reasonable retry limits** - Avoid infinite retries
4. **Monitor queue length** - Check for delivery backlog
5. **Prune old events** - Clean up database regularly
6. **Use HTTPS in production** - Secure webhook endpoints
7. **Rotate secrets** - Update webhook secrets periodically
8. **Test transforms** - Validate JavaScript transforms
9. **Limit concurrent processing** - Avoid overloading extensions
10. **Review audit logs** - Monitor for security events
