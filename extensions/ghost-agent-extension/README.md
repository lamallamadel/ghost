# Ghost Agent Supreme

The autonomous orchestration brain for the Ghost CLI ecosystem.

## Phase 1: Task Engine & Orchestration (Completed)
This phase established the core ability of the agent to communicate with and pilot other expert extensions.

### Features
- **Cross-Extension Call (RPC)**: Uses the `extension:call` permission to trigger actions in any Standard Library extension.
- **Workflow Orchestration**: Executes multi-step missions by combining Security, Docs, and Git insights.
- **Goal-Oriented Execution**: Receives high-level objectives and delegates technical work to specialized modules.

### Commands
- `ghost agent solve "<goal>"`: Initiates an autonomous mission to achieve the specified goal.

## Installation
```bash
ghost extension install extensions/ghost-agent-extension
```
