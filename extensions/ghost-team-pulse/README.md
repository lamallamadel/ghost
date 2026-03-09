# Ghost Team-Pulse

Team collaboration and notification assistant for the Ghost CLI ecosystem.

## Phase 1: Webhook Integration (Completed)
This phase established the connectivity between Ghost and team communication platforms.

### Features
- **Slack & Discord Support**: Built-in support for sending notifications via incoming webhooks.
- **Secure Networking**: Uses Ghost's audited network intents to communicate with external APIs.
- **Custom Notifications**: Allows sending manual or automated messages directly from the CLI.

### Commands
- `ghost team notify "<message>"`: Sends a message to the configured Slack or Discord channel.

## Installation
```bash
ghost marketplace install ghost-team-pulse
```
