# Webhook Setup Guide

Ghost CLI includes a comprehensive webhook receiver and event-driven automation system. This guide covers setup for common Git hosting providers and configuration of automated workflows.

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Quick Start](#quick-start)
- [Provider Setup](#provider-setup)
  - [GitHub](#github)
  - [GitLab](#gitlab)
  - [Bitbucket](#bitbucket)
- [Configuration](#configuration)
- [Routing Rules](#routing-rules)
- [Transform Pipeline](#transform-pipeline)
- [Security](#security)
- [Monitoring](#monitoring)
- [Advanced Topics](#advanced-topics)

## Overview

The Ghost webhook system enables event-driven automation by:

- **Receiving webhooks** from GitHub, GitLab, Bitbucket, and custom providers
- **Verifying signatures** using HMAC-SHA256 for security
- **Routing events** to extension commands based on configurable rules
- **Transforming payloads** with JavaScript transforms or built-in templates
- **Persisting events** in SQLite for replay and auditing
- **Retrying deliveries** with exponential backoff
- **Auditing operations** through the integrated audit logger

## Architecture

```
┌─────────────┐
│  Provider   │ (GitHub, GitLab, Bitbucket)
└──────┬──────┘
       │ POST /api/webhooks/:provider
       ▼
┌─────────────────────────────────┐
│   Webhook Controller            │
│   - HMAC signature verification │
│   - Request validation          │
└──────┬──────────────────────────┘
       │
       ▼
┌─────────────────────────────────┐
│   Event Store (SQLite)          │
│   - Persist webhook payload     │
│   - Enable replay & auditing    │
└──────┬──────────────────────────┘
       │
       ▼
┌─────────────────────────────────┐
│   Router                        │
│   - Match provider & event type │
│   - Evaluate conditions         │
│   - Select target extension     │
└──────┬──────────────────────────┘
       │
       ▼
┌─────────────────────────────────┐
│   Transform Pipeline            │
│   - Apply JavaScript transforms │
│   - Extract relevant data       │
└──────┬──────────────────────────┘
       │
       ▼
┌─────────────────────────────────┐
│   Delivery Queue                │
│   - Execute extension commands  │
│   - Retry with backoff          │
│   - Track delivery status       │
└─────────────────────────────────┘
```

## Quick Start

### 1. Start the Webhook Server

```bash
# Start webhook server on default port 3000
ghost webhook start

# Start on custom port
ghost webhook start --port 8080

# Start with specific host binding
ghost webhook start --host 0.0.0.0 --port 3000
```

### 2. Configure Webhook Secret

Set environment variables for each provider:

```bash
export GHOST_WEBHOOK_SECRET_GITHUB="your-github-secret"
export GHOST_WEBHOOK_SECRET_GITLAB="your-gitlab-token"
export GHOST_WEBHOOK_SECRET_BITBUCKET="your-bitbucket-secret"
```

### 3. Add Routing Rules

Create a webhook configuration file `~/.ghost/config/webhooks.json`:

```json
{
  "routes": [
    {
      "provider": "github",
      "eventPattern": "issues.labeled",
      "extensionId": "my-extension",
      "command": "processIssueLabel",
      "conditions": [
        {
          "path": "label.name",
          "operator": "equals",
          "value": "bug"
        }
      ],
      "transform": "github-issue-labeled"
    }
  ]
}
```

### 4. Configure Provider Webhook

Follow provider-specific instructions below to configure the webhook in your Git hosting platform.

## Provider Setup

### GitHub

#### 1. Navigate to Repository Settings

Go to your GitHub repository → **Settings** → **Webhooks** → **Add webhook**

#### 2. Configure Webhook

- **Payload URL**: `https://your-domain.com/api/webhooks/github`
- **Content type**: `application/json`
- **Secret**: Enter the same secret you configured in `GHOST_WEBHOOK_SECRET_GITHUB`

#### 3. Select Events

Choose specific events or select **Send me everything** for all events:

- Issues
- Pull requests
- Push
- Release
- Workflow runs
- And more...

#### 4. Activate Webhook

Click **Add webhook** to save and activate.

#### 5. Test Delivery

GitHub will send a ping event. Check webhook delivery status in GitHub UI and Ghost audit logs:

```bash
ghost audit-log view --type WEBHOOK_RECEIVED --limit 10
```

### Common GitHub Events

| Event Type | Description | Example Use Case |
|------------|-------------|------------------|
| `issues.opened` | New issue created | Auto-label, assign, or triage |
| `issues.labeled` | Label added to issue | Trigger workflows based on label |
| `pull_request.opened` | New PR created | Run checks, request reviews |
| `pull_request.synchronize` | PR commits updated | Re-run CI/CD |
| `push` | Code pushed to branch | Deploy, build, notify |
| `release.published` | Release created | Deploy to production |
| `workflow_run.completed` | GitHub Action completed | Notify team, update status |

### GitLab

#### 1. Navigate to Project Settings

Go to your GitLab project → **Settings** → **Webhooks**

#### 2. Configure Webhook

- **URL**: `https://your-domain.com/api/webhooks/gitlab`
- **Secret token**: Enter the same token you configured in `GHOST_WEBHOOK_SECRET_GITLAB`

#### 3. Select Trigger Events

Choose events to trigger webhooks:

- Push events
- Tag push events
- Comments
- Merge request events
- Pipeline events
- And more...

#### 4. Add Webhook

Click **Add webhook** to save.

#### 5. Test Webhook

Use GitLab's **Test** button to send a test event. Verify in Ghost logs:

```bash
ghost gateway logs --extension webhook-controller
```

### Common GitLab Events

| Event Type | Description | Example Use Case |
|------------|-------------|------------------|
| `Push Hook` | Code pushed | Build, test, deploy |
| `Merge Request Hook` | MR created/updated | Review automation |
| `Pipeline Hook` | CI/CD pipeline event | Notify on success/failure |
| `Issue Hook` | Issue created/updated | Issue triage |
| `Wiki Page Hook` | Wiki updated | Documentation sync |

### Bitbucket

#### 1. Navigate to Repository Settings

Go to your Bitbucket repository → **Repository settings** → **Webhooks** → **Add webhook**

#### 2. Configure Webhook

- **Title**: Ghost Webhook Handler
- **URL**: `https://your-domain.com/api/webhooks/bitbucket`
- **Status**: Active
- **Secret**: Enter the same secret you configured in `GHOST_WEBHOOK_SECRET_BITBUCKET`

#### 3. Select Triggers

Choose triggers:

- Repository: Push, Fork, Updated
- Pull request: Created, Updated, Merged, Declined
- Build status: Created, Updated
- And more...

#### 4. Save Webhook

Click **Save** to activate the webhook.

### Common Bitbucket Events

| Event Type | Description | Example Use Case |
|------------|-------------|------------------|
| `repo:push` | Code pushed | CI/CD trigger |
| `pullrequest:created` | PR created | Review assignment |
| `pullrequest:fulfilled` | PR merged | Deploy to staging |
| `build:status_updated` | Build status changed | Notify team |

## Configuration

### Webhook Configuration File

Location: `~/.ghost/config/webhooks.json`

```json
{
  "server": {
    "port": 3000,
    "host": "0.0.0.0"
  },
  "routes": [
    {
      "id": "auto-deploy-on-tag",
      "provider": "github",
      "eventPattern": "release.published",
      "extensionId": "deployment-extension",
      "command": "deploy",
      "args": ["production"],
      "transform": {
        "type": "javascript",
        "options": {
          "code": "result = { version: payload.release.tag_name, environment: 'production' };"
        }
      },
      "conditions": [
        {
          "path": "release.prerelease",
          "operator": "equals",
          "value": false
        }
      ],
      "enabled": true
    }
  ],
  "retryStrategy": {
    "maxAttempts": 5,
    "initialDelay": 1000,
    "maxDelay": 60000,
    "backoffFactor": 2
  }
}
```

### Extension Manifest Configuration

Extensions can declare webhook transforms in their manifest:

```json
{
  "id": "my-extension",
  "name": "My Extension",
  "version": "1.0.0",
  "webhookTransforms": {
    "custom-transform": {
      "type": "javascript",
      "code": "result = { issueId: payload.issue.number, title: payload.issue.title };"
    }
  }
}
```

## Routing Rules

### Route Configuration

Each route consists of:

- **provider**: Provider name (github, gitlab, bitbucket) or array of providers
- **eventPattern**: Event type pattern (supports wildcards)
- **extensionId**: Target extension ID
- **command**: Extension command to execute
- **args**: Command arguments (optional)
- **transform**: Transform to apply (optional)
- **conditions**: Array of conditions to match (optional)
- **enabled**: Enable/disable route (default: true)

### Event Pattern Matching

```json
{
  "eventPattern": "issues.*"          
}

{
  "eventPattern": ["push", "pull_request.*"]  
}

{
  "eventPattern": "*"  
}
```

### Condition Operators

| Operator | Description | Example |
|----------|-------------|---------|
| `equals` | Exact match | `"value": "bug"` |
| `notEquals` | Not equal | `"value": "duplicate"` |
| `contains` | String contains | `"value": "hotfix"` |
| `startsWith` | String starts with | `"value": "feature/"` |
| `endsWith` | String ends with | `"value": ".md"` |
| `exists` | Field exists | - |
| `notExists` | Field does not exist | - |
| `matches` | Regex match | `"value": "^v\\d+\\.\\d+\\.\\d+$"` |

### Condition Examples

```json
{
  "conditions": [
    {
      "path": "pull_request.base.ref",
      "operator": "equals",
      "value": "main"
    },
    {
      "path": "pull_request.labels",
      "operator": "exists"
    },
    {
      "path": "action",
      "operator": "notEquals",
      "value": "closed"
    }
  ]
}
```

## Transform Pipeline

### Built-in Transforms

Ghost provides built-in transforms for common use cases:

| Transform | Provider | Description |
|-----------|----------|-------------|
| `identity` | All | Pass-through (no transformation) |
| `github-issue-labeled` | GitHub | Extract issue and label info |
| `github-pull-request` | GitHub | Extract PR details |
| `gitlab-pipeline` | GitLab | Extract pipeline status |
| `bitbucket-push` | Bitbucket | Extract push and commit info |

### JavaScript Transforms

Write custom transforms using JavaScript:

```json
{
  "transform": {
    "type": "javascript",
    "options": {
      "code": "result = { id: payload.issue.number, title: payload.issue.title, labels: payload.issue.labels.map(l => l.name) };"
    }
  }
}
```

**Available variables in transform context:**

- `event`: Full webhook event object
- `payload`: Webhook payload
- `result`: Set this to your transformed output
- `console`: Console for logging
- `JSON`: JSON object for parsing

**Security restrictions:**

- No `require()` or `import`
- No `process`, `fs`, `child_process`
- No `eval()` or `Function()`
- 5-second execution timeout

### JSON Path Transforms

Extract specific fields using JSON path notation:

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

### Template Transforms

Use templates with variable substitution:

```json
{
  "transform": {
    "type": "template",
    "options": {
      "template": "Issue #{{issue.number}}: {{issue.title}} labeled as {{label.name}}"
    }
  }
}
```

### Chain Transforms

Apply multiple transforms in sequence:

```json
{
  "transform": {
    "type": "chain",
    "options": {
      "transforms": [
        "github-issue-labeled",
        {
          "type": "javascript",
          "options": {
            "code": "result.timestamp = new Date().toISOString();"
          }
        }
      ]
    }
  }
}
```

## Security

### Signature Verification

Ghost verifies webhook signatures using provider-specific methods:

**GitHub**: HMAC-SHA256 with `x-hub-signature-256` header
**GitLab**: Plain token comparison with `x-gitlab-token` header
**Bitbucket**: HMAC-SHA256 with `x-hub-signature` header

Failed verification is logged as a security event and returns 401 Unauthorized.

### Environment Variables

Store secrets in environment variables:

```bash
export GHOST_WEBHOOK_SECRET_GITHUB="ghp_your_secret_here"
export GHOST_WEBHOOK_SECRET_GITLAB="glpat-your_token_here"
export GHOST_WEBHOOK_SECRET_BITBUCKET="your_secret_here"
```

**Never commit secrets to version control.**

### Network Security

- **Use HTTPS**: Always use HTTPS for webhook endpoints in production
- **Firewall**: Restrict webhook server access to provider IP ranges
- **Rate limiting**: Configure rate limits for webhook endpoints
- **Authentication**: Use webhook secrets for all providers

### Audit Logging

All webhook events and deliveries are logged:

```bash
# View webhook receipts
ghost audit-log view --type WEBHOOK_RECEIVED

# View delivery attempts
ghost audit-log view --type WEBHOOK_DELIVERY_START

# View failures
ghost audit-log view --type WEBHOOK_DELIVERY_FAILED
```

## Monitoring

### View Webhook Events

```bash
# List recent webhook events
ghost webhook events --limit 50

# Filter by provider
ghost webhook events --provider github --limit 20

# Filter by event type
ghost webhook events --event-type issues.labeled

# Query by date range
ghost webhook events --since 2024-01-01 --until 2024-01-31
```

### View Delivery Status

```bash
# List deliveries
ghost webhook deliveries --limit 50

# Filter by status
ghost webhook deliveries --status failed

# Filter by extension
ghost webhook deliveries --extension my-extension
```

### Replay Events

```bash
# Replay a specific event
ghost webhook replay <event-id>

# Replay failed deliveries
ghost webhook replay --status failed --limit 10
```

### Queue Status

```bash
# View delivery queue stats
ghost webhook queue-stats
```

Output:
```json
{
  "total": 15,
  "pending": 10,
  "retrying": 5,
  "processing": 3
}
```

### Audit Logs

```bash
# View webhook-related audit logs
ghost gateway logs --extension webhook-controller --limit 100

# View with timestamps
ghost audit-log view --type WEBHOOK_* --limit 50
```

## Advanced Topics

### Custom Providers

Register custom webhook providers:

```javascript
const { WebhookController } = require('./core/webhooks');

const controller = new WebhookController();

controller.registerProvider('custom', {
  signatureHeader: 'x-custom-signature',
  signatureAlgorithm: 'sha256',
  signaturePrefix: 'sha256=',
  eventHeader: 'x-custom-event',
  deliveryHeader: 'x-custom-delivery-id'
});
```

### Extension Command Integration

Extensions receive webhook data as command parameters:

```javascript
class MyExtension {
  async processIssueLabel(params) {
    const { webhookEvent, payload, args, flags } = params;
    
    console.log('Webhook event:', webhookEvent.provider, webhookEvent.eventType);
    console.log('Transformed payload:', payload);
    
    return {
      success: true,
      output: `Processed issue #${payload.issueNumber}`
    };
  }
}
```

### Database Management

```bash
# View database location
ghost webhook db-info

# Prune old events (older than 30 days)
ghost webhook prune --days 30

# Export events to JSON
ghost webhook export --output webhooks-backup.json

# Import events from JSON
ghost webhook import --input webhooks-backup.json
```

### Performance Tuning

Configure delivery queue concurrency:

```json
{
  "deliveryQueue": {
    "maxConcurrent": 10,
    "maxRetryAttempts": 5,
    "initialRetryDelay": 1000,
    "maxRetryDelay": 60000,
    "backoffFactor": 2
  }
}
```

### Integration with CI/CD

Example: Auto-deploy on release

```json
{
  "routes": [
    {
      "provider": "github",
      "eventPattern": "release.published",
      "extensionId": "deployment-extension",
      "command": "deploy",
      "transform": {
        "type": "javascript",
        "options": {
          "code": "result = { version: payload.release.tag_name, changelog: payload.release.body };"
        }
      },
      "conditions": [
        {
          "path": "release.prerelease",
          "operator": "equals",
          "value": false
        }
      ]
    }
  ]
}
```

## Troubleshooting

### Webhook Not Received

1. Verify webhook server is running: `ghost webhook status`
2. Check provider webhook configuration
3. Verify URL is publicly accessible
4. Check firewall and port forwarding
5. Review provider webhook delivery logs

### Signature Verification Failed

1. Verify secret environment variable is set
2. Ensure secret matches provider configuration
3. Check for trailing whitespace in secret
4. Review audit logs for specific error

### Delivery Failures

1. Check extension is loaded: `ghost extension list`
2. Verify command exists on extension
3. Review delivery error in database: `ghost webhook deliveries --status failed`
4. Check extension logs for detailed error

### Performance Issues

1. Increase queue concurrency
2. Optimize transform functions
3. Review database size and prune old events
4. Monitor system resources

## Examples

### Auto-Label Issues

```json
{
  "routes": [
    {
      "provider": "github",
      "eventPattern": "issues.opened",
      "extensionId": "triage-extension",
      "command": "autoLabel",
      "transform": "github-issue-labeled"
    }
  ]
}
```

### Deploy on Tag

```json
{
  "routes": [
    {
      "provider": "github",
      "eventPattern": "push",
      "extensionId": "deployment-extension",
      "command": "deploy",
      "conditions": [
        {
          "path": "ref",
          "operator": "startsWith",
          "value": "refs/tags/"
        }
      ]
    }
  ]
}
```

### Notify Team on PR

```json
{
  "routes": [
    {
      "provider": "github",
      "eventPattern": "pull_request.opened",
      "extensionId": "notification-extension",
      "command": "notifyTeam",
      "transform": "github-pull-request"
    }
  ]
}
```

## Support

For issues, questions, or contributions:

- GitHub Issues: https://github.com/lamallamadel/ghost/issues
- Documentation: https://github.com/lamallamadel/ghost/tree/main/docs
- Community: https://github.com/lamallamadel/ghost/discussions
