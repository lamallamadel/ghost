# Extension Hot Reload System

The Ghost CLI provides a powerful hot-reload capability that allows extensions to be reloaded at runtime without restarting the gateway. This feature is essential for extension development, providing instant feedback and maintaining application state during development cycles.

## Features

### 1. Graceful Extension Shutdown
- **Pending Request Handling**: Waits for in-flight requests to complete before shutdown
- **Cleanup Lifecycle**: Invokes extension `cleanup()` methods gracefully
- **Configurable Timeouts**: Customizable grace period for pending operations
- **Process Management**: Handles both process-based and sandboxed extensions

### 2. State Preservation
- **State Capture**: Automatically captures extension state before reload
- **State Restoration**: Restores state after successful reload
- **Optional State Management**: Can be disabled per reload operation
- **Persistent State**: State survives across reload cycles

### 3. Pending Request Management
- **Request Queuing**: Tracks all pending requests during reload
- **Graceful Waiting**: Waits for requests to complete before proceeding
- **Request Retry**: Optionally retries failed requests after reload
- **Timeout Protection**: Prevents indefinite blocking on stuck requests

### 4. File Watching
- **Automatic Detection**: Monitors extension files for changes
- **Debounced Reloading**: Batches rapid file changes
- **Selective Watching**: Only monitors `.js` and `manifest.json` files
- **Recursive Monitoring**: Watches entire extension directory tree

### 5. WebSocket Notifications
- **Real-time Updates**: Broadcasts reload events to connected clients
- **Desktop Integration**: Live updates in Ghost Console desktop app
- **Event Streaming**: Complete reload lifecycle event stream
- **Status Queries**: Real-time status queries via WebSocket

## Architecture

### Core Components

#### ExtensionHotReload
Main hot-reload orchestrator that manages the reload lifecycle:

```javascript
const hotReload = new ExtensionHotReload(gateway, runtime, {
    watch: true,                    // Enable file watching
    debounceTime: 300,              // Debounce delay in ms
    gracefulShutdownTimeout: 5000,  // Grace period for shutdown
    runtimeOptions: {}              // Options passed to runtime
});
```

#### HotReloadWebSocketServer
WebSocket server for desktop app integration:

```javascript
const wsServer = new HotReloadWebSocketServer(hotReload, {
    port: 9876,          // WebSocket port
    host: 'localhost'    // Bind address
});
```

### Reload Lifecycle

1. **Reload Initiated**
   - Manual trigger or file change detection
   - Extension marked as reloading

2. **State Capture**
   - Call extension's `getState()` method if available
   - Store state for later restoration

3. **Pending Request Capture**
   - Enumerate all pending requests
   - Track request metadata (ID, method, age)

4. **Graceful Shutdown**
   - Wait for pending requests (up to timeout)
   - Invoke extension `cleanup()` method
   - Stop runtime process/sandbox

5. **Module Cache Clear**
   - Remove extension from Node.js require cache
   - Ensure fresh module load

6. **Extension Reload**
   - Load fresh manifest and code
   - Re-register with gateway
   - Start new runtime instance

7. **State Restoration**
   - Call extension's `setState()` method if available
   - Restore captured state

8. **Request Retry**
   - Optionally retry failed pending requests
   - Report retry results

9. **Reload Complete**
   - Emit completion event
   - Clear reloading flag

## API Reference

### ExtensionHotReload

#### Constructor
```javascript
new ExtensionHotReload(gateway, runtime, options)
```

**Options:**
- `watch` (boolean): Enable file watching (default: true)
- `debounceTime` (number): Debounce delay in ms (default: 300)
- `gracefulShutdownTimeout` (number): Shutdown timeout in ms (default: 5000)
- `runtimeOptions` (object): Options passed to runtime on reload

#### Methods

##### enableHotReload(extensionId)
Enable file watching for an extension:
```javascript
await hotReload.enableHotReload('my-extension');
```

##### disableHotReload(extensionId)
Disable file watching:
```javascript
hotReload.disableHotReload('my-extension');
```

##### reloadExtension(extensionId, options)
Manually trigger extension reload:
```javascript
await hotReload.reloadExtension('my-extension', {
    reason: 'manual',           // Reload reason
    restoreState: true,         // Restore state (default: true)
    retryPendingRequests: false // Retry requests (default: false)
});
```

##### getReloadStatus(extensionId)
Get reload status for an extension:
```javascript
const status = hotReload.getReloadStatus('my-extension');
// {
//   isReloading: false,
//   watchEnabled: true,
//   hasScheduledReload: false,
//   hasCapturedState: true
// }
```

##### getAllReloadStatus()
Get status for all extensions:
```javascript
const allStatus = hotReload.getAllReloadStatus();
```

##### shutdown()
Shutdown hot-reload system:
```javascript
await hotReload.shutdown();
```

#### Events

- `reload-started`: Reload operation started
- `reload-completed`: Reload completed successfully
- `reload-failed`: Reload operation failed
- `watch-enabled`: File watching enabled
- `watch-disabled`: File watching disabled
- `shutdown-started`: Extension shutdown initiated
- `shutdown-completed`: Extension shutdown completed
- `extension-loaded`: Extension loaded successfully
- `state-captured`: Extension state captured
- `state-restored`: Extension state restored
- `state-capture-error`: State capture failed
- `state-restore-error`: State restoration failed
- `cache-cleared`: Module cache cleared
- `retry-started`: Request retry started
- `retry-completed`: Request retry completed
- `retry-failed`: Individual request retry failed

### HotReloadWebSocketServer

#### Constructor
```javascript
new HotReloadWebSocketServer(hotReload, options)
```

**Options:**
- `port` (number): WebSocket port (default: 9876)
- `host` (string): Bind address (default: 'localhost')

#### Methods

##### start()
Start WebSocket server:
```javascript
const info = await wsServer.start();
// { port: 9876, host: 'localhost', url: 'ws://localhost:9876/ws' }
```

##### stop()
Stop WebSocket server:
```javascript
await wsServer.stop();
```

##### getStatus()
Get server status:
```javascript
const status = wsServer.getStatus();
// {
//   isRunning: true,
//   port: 9876,
//   host: 'localhost',
//   clientCount: 2,
//   url: 'ws://localhost:9876/ws'
// }
```

#### Events

- `started`: Server started
- `stopped`: Server stopped
- `client-connected`: Client connected
- `client-disconnected`: Client disconnected
- `client-error`: Client error occurred
- `error`: Server error occurred

### WebSocket Protocol

#### Client → Server Messages

**Reload Extension:**
```json
{
  "type": "reload-request",
  "data": {
    "extensionId": "my-extension",
    "options": {
      "restoreState": true
    }
  }
}
```

**Enable Watch:**
```json
{
  "type": "enable-watch",
  "data": {
    "extensionId": "my-extension"
  }
}
```

**Disable Watch:**
```json
{
  "type": "disable-watch",
  "data": {
    "extensionId": "my-extension"
  }
}
```

**Status Request:**
```json
{
  "type": "status-request"
}
```

**Ping:**
```json
{
  "type": "ping"
}
```

#### Server → Client Messages

**Hot Reload Event:**
```json
{
  "type": "hot-reload",
  "event": "reload-completed",
  "data": {
    "extensionId": "my-extension",
    "duration": 234,
    "pendingRequestsCount": 0,
    "stateRestored": true
  },
  "timestamp": 1234567890
}
```

**Status Response:**
```json
{
  "type": "status-response",
  "data": {
    "my-extension": {
      "isReloading": false,
      "watchEnabled": true,
      "hasScheduledReload": false,
      "hasCapturedState": false
    }
  },
  "timestamp": 1234567890
}
```

**Connection Acknowledgment:**
```json
{
  "type": "connection",
  "event": "connected",
  "data": {
    "clientId": "client-1234-abcd",
    "reloadStatus": { ... }
  }
}
```

## Desktop App Integration

### React Hook

```typescript
import { useHotReloadWebSocket } from '../hooks/useHotReloadWebSocket';

function MyComponent() {
  const {
    isConnected,
    reloadStatus,
    reloadExtension,
    enableWatch,
    disableWatch,
    refreshStatus
  } = useHotReloadWebSocket('ws://localhost:9876/ws', {
    onReloadCompleted: (data) => {
      console.log('Reload completed:', data);
    },
    onReloadFailed: (data) => {
      console.error('Reload failed:', data);
    }
  });

  return (
    <div>
      <p>Connected: {isConnected ? 'Yes' : 'No'}</p>
      <button onClick={() => reloadExtension('my-extension')}>
        Reload Extension
      </button>
    </div>
  );
}
```

### HotReloadMonitor Component

Pre-built component for monitoring hot-reload activity:

```typescript
import { HotReloadMonitor } from '../components/HotReloadMonitor';

function DevelopmentPage() {
  return (
    <div>
      <HotReloadMonitor />
    </div>
  );
}
```

## Extension Implementation

Extensions can optionally implement state management methods:

```javascript
class MyExtension {
    constructor() {
        this.state = {
            counter: 0,
            data: []
        };
    }

    async init(config) {
        // Initialize extension
    }

    async getState() {
        // Return current state for preservation
        return this.state;
    }

    async setState(params) {
        // Restore state after reload
        this.state = params.state;
    }

    async cleanup() {
        // Cleanup before shutdown
    }

    async execute(params) {
        // Extension logic
        this.state.counter++;
    }
}

module.exports = MyExtension;
```

## Complete Example

```javascript
const { Gateway, ExtensionRuntime, ExtensionHotReload, HotReloadWebSocketServer } = require('ghost-cli/core');

async function setupHotReload() {
    // Initialize gateway and runtime
    const gateway = new Gateway({
        bundledExtensionsDir: './extensions'
    });
    await gateway.initialize();

    const runtime = new ExtensionRuntime();
    for (const ext of gateway.extensions.values()) {
        await runtime.startExtension(ext.manifest.id, ext.path, ext.manifest);
    }

    // Setup hot-reload
    const hotReload = new ExtensionHotReload(gateway, runtime, {
        watch: true,
        debounceTime: 500
    });

    hotReload.on('reload-completed', (data) => {
        console.log(`✓ Reloaded ${data.extensionId} in ${data.duration}ms`);
    });

    // Enable watching for all extensions
    for (const ext of gateway.extensions.values()) {
        await hotReload.enableHotReload(ext.manifest.id);
    }

    // Start WebSocket server
    const wsServer = new HotReloadWebSocketServer(hotReload);
    await wsServer.start();

    console.log('Hot-reload enabled at ws://localhost:9876/ws');

    // Graceful shutdown
    process.on('SIGINT', async () => {
        await wsServer.stop();
        await hotReload.shutdown();
        await runtime.shutdown();
        gateway.shutdown();
        process.exit(0);
    });
}

setupHotReload().catch(console.error);
```

## Best Practices

1. **Development Mode Only**: Enable hot-reload only in development
2. **State Management**: Implement `getState()`/`setState()` for stateful extensions
3. **Graceful Cleanup**: Always implement `cleanup()` method
4. **Pending Requests**: Design extensions to complete requests quickly
5. **Error Handling**: Handle reload failures gracefully
6. **Testing**: Test reload scenarios during extension development
7. **Monitoring**: Use desktop app to monitor reload events

## Configuration

### Environment Variables

- `GHOST_HOT_RELOAD_ENABLED`: Enable hot-reload (default: false)
- `GHOST_HOT_RELOAD_PORT`: WebSocket port (default: 9876)
- `GHOST_HOT_RELOAD_DEBOUNCE`: Debounce time in ms (default: 300)

### Development Setup

```javascript
const isDev = process.env.NODE_ENV === 'development';

const hotReload = new ExtensionHotReload(gateway, runtime, {
    watch: isDev,
    debounceTime: isDev ? 500 : 0
});
```

## Troubleshooting

### Extension Won't Reload

1. Check file watching is enabled: `hotReload.getReloadStatus(extensionId).watchEnabled`
2. Verify extension path is correct
3. Check console for error messages
4. Ensure no syntax errors in extension code

### State Not Restored

1. Implement `getState()` and `setState()` methods
2. Verify state is serializable (no functions or circular references)
3. Check logs for state restoration errors

### Pending Requests Timeout

1. Increase `gracefulShutdownTimeout` option
2. Design extensions to complete requests quickly
3. Implement proper request cancellation

### WebSocket Connection Issues

1. Check firewall settings
2. Verify port 9876 is available
3. Check WebSocket server is running: `wsServer.getStatus()`
4. Use browser DevTools to inspect WebSocket connection

## Performance Considerations

- **Debounce Time**: Balance between responsiveness and reload frequency
- **State Size**: Keep state minimal to reduce serialization overhead
- **Pending Requests**: Monitor and minimize long-running requests
- **Watch Overhead**: File watching has minimal overhead on modern systems
- **WebSocket Clients**: Each client consumes minimal resources

## Security Notes

- WebSocket server binds to localhost by default
- No authentication on WebSocket (development only)
- Do not expose WebSocket server to public networks
- Disable hot-reload in production environments
