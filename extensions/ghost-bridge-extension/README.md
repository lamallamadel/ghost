# Ghost Bridge Master

IDE connector and RPC bridge for the Ghost CLI ecosystem.

## Phase 1: RPC Bridge & Connectivity (Completed)
This phase established the communication layer between external IDEs and the Ghost Gateway.

### Features
- **WebSocket Gateway**: Exposes a local endpoint (`ws://localhost:9877`) for IDE plugin connections.
- **Protocol Mapping**: Translates IDE-specific requests into Ghost native intents.
- **Service Isolation**: Maintains the zero-trust boundary by ensuring the IDE only has access to explicitly allowed Ghost commands.

### Commands
- `ghost bridge start [--port 9877]`: Starts the IDE connector server.
- `ghost bridge status`: Checks the current state of the bridge and active connections.

## Installation
```bash
ghost extension install extensions/ghost-bridge-extension
```
