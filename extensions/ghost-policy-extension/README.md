# Ghost Policy Master

Governance and policy enforcement engine for the Ghost CLI ecosystem.

## Phase 1: Policy Engine & Authority (Completed)
This phase established the central authority for system-wide rules and configuration.

### Features
- **Governance Registry**: Lists and tracks active security and operational policies.
- **Authority Enforcement**: Only extension authorized to emit `system:policy-update` intents to the Gateway.
- **Compliance Verification**: Checks project status against established organizational rules.

### Commands
- `ghost policy list`: Displays all active governance rules.
- `ghost policy set <rule> <value>`: Updates a specific policy and broadcasts it to the Gateway.
- `ghost policy verify`: Audits the current environment for policy compliance.

## Installation
```bash
ghost extension install extensions/ghost-policy-extension
```
