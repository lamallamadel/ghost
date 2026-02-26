# Webhook Quick Reference

## CLI Commands

```bash
# Start webhook server
ghost webhook start [--port 3000] [--host 0.0.0.0]

# Stop webhook server
ghost webhook stop

# Check status
ghost webhook status

# View events
ghost webhook events [--limit 50] [--provider github] [--event-type issues.labeled]

# View deliveries
ghost webhook deliveries [--limit 50] [--status failed] [--extension my-ext]

# Replay event
ghost webhook replay <event-id>

# Queue statistics
ghost webhook queue-stats

# Prune old data
ghost webhook prune [30]
```

## Environment Variables

```bash
export GHOST_WEBHOOK_SECRET_GITHUB="your-secret-here"
export GHOST_WEBHOOK_SECRET_GITLAB="your-token-here"
export GHOST_WEBHOOK_SECRET_BITBUCKET="your-secret-here"
```

## Configuration File

Location: `~/.ghost/config/webhooks.json`

```json
{
  "server": { "port": 3000, "host": "0.0.0.0" },
  "routes": [
    {
      "provider": "github",
      "eventPattern": "issues.labeled",
      "extensionId": "my-extension",
      "command": "handleIssue",
      "conditions": [{ "path": "label.name", "operator": "equals", "value": "bug" }],
      "transform": "github-issue-labeled"
    }
  ]
}
```

## Webhook Endpoints

- GitHub: `POST /api/webhooks/github`
- GitLab: `POST /api/webhooks/gitlab`
- Bitbucket: `POST /api/webhooks/bitbucket`

## Provider Configuration

### GitHub

- **Signature Header**: `x-hub-signature-256`
- **Algorithm**: HMAC-SHA256
- **Event Header**: `x-github-event`
- **Payload URL**: `https://your-domain.com/api/webhooks/github`
- **Content Type**: `application/json`

### GitLab

- **Token Header**: `x-gitlab-token`
- **Algorithm**: Plain token
- **Event Header**: `x-gitlab-event`
- **Payload URL**: `https://your-domain.com/api/webhooks/gitlab`

### Bitbucket

- **Signature Header**: `x-hub-signature`
- **Algorithm**: HMAC-SHA256
- **Event Header**: `x-event-key`
- **Payload URL**: `https://your-domain.com/api/webhooks/bitbucket`

## Route Configuration

### Basic Route

```json
{
  "provider": "github",
  "eventPattern": "push",
  "extensionId": "deploy-ext",
  "command": "deploy"
}
```

### With Conditions

```json
{
  "provider": "github",
  "eventPattern": "pull_request.*",
  "extensionId": "review-ext",
  "command": "assignReviewers",
  "conditions": [
    { "path": "pull_request.base.ref", "operator": "equals", "value": "main" }
  ]
}
```

### With Transform

```json
{
  "provider": "github",
  "eventPattern": "issues.labeled",
  "extensionId": "triage-ext",
  "command": "triageIssue",
  "transform": {
    "type": "javascript",
    "options": {
      "code": "result = { number: payload.issue.number, label: payload.label.name };"
    }
  }
}
```

## Event Patterns

| Pattern | Matches |
|---------|---------|
| `push` | Exact match |
| `issues.*` | All issue events |
| `*` | All events |
| `["push", "pull_request.*"]` | Multiple patterns |

## Condition Operators

| Operator | Description |
|----------|-------------|
| `equals` | Exact match |
| `notEquals` | Not equal |
| `contains` | String contains |
| `startsWith` | String starts with |
| `endsWith` | String ends with |
| `exists` | Field exists |
| `notExists` | Field does not exist |
| `matches` | Regex match |

## Built-in Transforms

- `identity` - Pass-through
- `github-issue-labeled` - GitHub issue/label
- `github-pull-request` - GitHub PR
- `gitlab-pipeline` - GitLab pipeline
- `bitbucket-push` - Bitbucket push

## Transform Types

### JavaScript

```json
{
  "type": "javascript",
  "options": {
    "code": "result = { id: payload.issue.number };"
  }
}
```

### JSON Path

```json
{
  "type": "jsonPath",
  "options": {
    "path": "pull_request.head.ref"
  }
}
```

### Template

```json
{
  "type": "template",
  "options": {
    "template": "PR #{{pull_request.number}}: {{pull_request.title}}"
  }
}
```

### Chain

```json
{
  "type": "chain",
  "options": {
    "transforms": [
      "github-issue-labeled",
      { "type": "javascript", "options": { "code": "result.timestamp = Date.now();" } }
    ]
  }
}
```

## Extension Integration

```javascript
class MyExtension {
  async handleWebhook(params) {
    const { webhookEvent, payload, args, flags } = params;
    
    console.log('Provider:', webhookEvent.provider);
    console.log('Event:', webhookEvent.eventType);
    console.log('Payload:', payload);
    
    return { success: true, output: 'Processed' };
  }
}
```

## Retry Configuration

```json
{
  "deliveryQueue": {
    "maxConcurrent": 5,
    "maxRetryAttempts": 5,
    "initialRetryDelay": 1000,
    "maxRetryDelay": 60000,
    "backoffFactor": 2
  }
}
```

Retry delays: 1s → 2s → 4s → 8s → 16s

## Common Use Cases

### Auto-label Issues

```json
{
  "provider": "github",
  "eventPattern": "issues.opened",
  "extensionId": "triage-ext",
  "command": "autoLabel",
  "transform": "github-issue-labeled"
}
```

### Deploy on Release

```json
{
  "provider": "github",
  "eventPattern": "release.published",
  "extensionId": "deploy-ext",
  "command": "deploy",
  "conditions": [
    { "path": "release.prerelease", "operator": "equals", "value": false }
  ]
}
```

### Notify on PR

```json
{
  "provider": "github",
  "eventPattern": "pull_request.opened",
  "extensionId": "notify-ext",
  "command": "notifyTeam",
  "transform": "github-pull-request"
}
```

### CI/CD Trigger

```json
{
  "provider": "gitlab",
  "eventPattern": "Push Hook",
  "extensionId": "ci-ext",
  "command": "triggerPipeline",
  "conditions": [
    { "path": "ref", "operator": "startsWith", "value": "refs/heads/main" }
  ]
}
```

## Troubleshooting

### Check Server Status
```bash
ghost webhook status
```

### View Recent Events
```bash
ghost webhook events --limit 10
```

### Check Failed Deliveries
```bash
ghost webhook deliveries --status failed
```

### View Audit Logs
```bash
ghost audit-log view --type WEBHOOK_RECEIVED
ghost audit-log view --type WEBHOOK_DELIVERY_FAILED
```

### Replay Failed Deliveries
```bash
ghost webhook deliveries --status failed --json | \
  jq -r '.[].webhookEventId' | \
  xargs -I {} ghost webhook replay {}
```

### Test Webhook
```bash
curl -X POST http://localhost:3000/api/webhooks/github \
  -H "Content-Type: application/json" \
  -H "x-hub-signature-256: sha256=$(echo -n '{"test":true}' | openssl dgst -sha256 -hmac "your-secret" | cut -d' ' -f2)" \
  -H "x-github-event: ping" \
  -H "x-github-delivery: test-123" \
  -d '{"test":true}'
```

## Security Checklist

- [ ] Use HTTPS for webhook endpoints
- [ ] Configure webhook secrets for all providers
- [ ] Store secrets in environment variables
- [ ] Never commit secrets to version control
- [ ] Restrict webhook server access via firewall
- [ ] Review audit logs regularly
- [ ] Monitor for signature verification failures
- [ ] Test transforms in development first
- [ ] Limit concurrent processing
- [ ] Prune old events periodically

## Performance Tips

1. Use specific event patterns (avoid wildcards)
2. Keep transforms simple and fast
3. Extract only needed data in transforms
4. Set reasonable retry limits
5. Monitor queue length
6. Prune old events regularly
7. Limit concurrent deliveries based on load
8. Use conditions to filter events early
9. Batch similar operations in extensions
10. Monitor extension performance

## Monitoring Queries

```bash
# Events per provider
ghost webhook events --json | jq -r '.[].provider' | sort | uniq -c

# Events per type
ghost webhook events --json | jq -r '.[].eventType' | sort | uniq -c

# Failed deliveries by extension
ghost webhook deliveries --status failed --json | jq -r '.[].extensionId' | sort | uniq -c

# Average attempts per delivery
ghost webhook deliveries --json | jq '[.[].attempts] | add/length'

# Queue backlog
ghost webhook queue-stats --json | jq '.total'
```

## Documentation

- Full Setup Guide: [WEBHOOK_SETUP.md](WEBHOOK_SETUP.md)
- Core Module: [core/webhooks/README.md](../core/webhooks/README.md)
- Example Config: [webhook-config-example.json](webhook-config-example.json)
