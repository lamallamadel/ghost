# Ghost Bridge Master

IDE connector and RPC bridge for the Ghost CLI ecosystem.

## Phase 3: UI Events & Intent Proxy (Completed)
This final phase enabled full two-way communication between Ghost and external editors.

### New Features
- **Dynamic Intent Proxy**: Relays commands from the IDE to any standard library extension (Git, Security, Docs, etc.).
- **Automatic Routing**: Resolves extension IDs based on command prefixes (e.g., `test.run` → `ghost-test-extension`).
- **Real-time Notifications**: Notifies the editor of Ghost system events and intent outcomes.
- **Bi-directional Bridge**: Provides a unified interface for the IDE to interact with the entire Ghost Standard Library.

### New Commands
- `ghost bridge proxy --sessionId <s> --method <m> --payload <p>`: Relays an IDE request to the appropriate Ghost extension.

## Installation
```bash
ghost extension install extensions/ghost-bridge-extension
```
