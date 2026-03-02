# Hot Reload Quick Start

Get extension hot-reload running in 5 minutes.

## 1. Basic Setup (Node.js)

```javascript
const { 
    Gateway, 
    ExtensionRuntime, 
    ExtensionHotReload, 
    HotReloadWebSocketServer 
} = require('ghost-cli/core');

// Initialize
const gateway = new Gateway({
    bundledExtensionsDir: './extensions'
});
await gateway.initialize();

const runtime = new ExtensionRuntime();

// Start extensions
for (const ext of gateway.extensions.values()) {
    await runtime.startExtension(
        ext.manifest.id, 
        ext.path, 
        ext.manifest
    );
}

// Enable hot-reload
const hotReload = new ExtensionHotReload(gateway, runtime, {
    watch: true
});

for (const ext of gateway.extensions.values()) {
    await hotReload.enableHotReload(ext.manifest.id);
}

// Start WebSocket server
const wsServer = new HotReloadWebSocketServer(hotReload);
await wsServer.start();

console.log('Hot-reload ready at ws://localhost:9876/ws');
```

## 2. Extension with State (Optional)

```javascript
class MyExtension {
    constructor() {
        this.state = { counter: 0 };
    }

    // Required
    async init(config) {
        console.log('Extension initialized');
    }

    // Optional: State preservation
    async getState() {
        return this.state;
    }

    async setState({ state }) {
        this.state = state;
    }

    // Optional: Cleanup
    async cleanup() {
        console.log('Extension cleanup');
    }

    // Your methods
    async execute(params) {
        this.state.counter++;
        return { counter: this.state.counter };
    }
}

module.exports = MyExtension;
```

## 3. Desktop App Integration (React)

```typescript
import { useHotReloadWebSocket } from './hooks/useHotReloadWebSocket';

function DevTools() {
    const { 
        isConnected, 
        reloadStatus, 
        reloadExtension 
    } = useHotReloadWebSocket();

    return (
        <div>
            <h2>Hot Reload</h2>
            <p>Status: {isConnected ? '🟢 Connected' : '🔴 Disconnected'}</p>
            
            {Object.entries(reloadStatus).map(([id, status]) => (
                <div key={id}>
                    <span>{id}</span>
                    {status.watchEnabled && <span>👁️ Watching</span>}
                    <button onClick={() => reloadExtension(id)}>
                        🔄 Reload
                    </button>
                </div>
            ))}
        </div>
    );
}
```

Or use the pre-built component:

```typescript
import { HotReloadMonitor } from './components/HotReloadMonitor';

function DevPage() {
    return <HotReloadMonitor />;
}
```

## 4. Run the Example

```bash
# Run the complete example
node core/examples/hot-reload-example.js

# Edit an extension file
# The extension will auto-reload
```

## 5. Manual Reload (CLI)

```javascript
// Reload specific extension
await hotReload.reloadExtension('my-extension');

// Reload with options
await hotReload.reloadExtension('my-extension', {
    restoreState: true,
    retryPendingRequests: false
});
```

## 6. Monitor Events

```javascript
hotReload.on('reload-started', (data) => {
    console.log(`⏳ Reloading ${data.extensionId}...`);
});

hotReload.on('reload-completed', (data) => {
    console.log(`✅ Reloaded ${data.extensionId} in ${data.duration}ms`);
});

hotReload.on('reload-failed', (data) => {
    console.error(`❌ Reload failed: ${data.error}`);
});
```

## 7. WebSocket Client (JavaScript)

```javascript
const ws = new WebSocket('ws://localhost:9876/ws');

ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    
    if (msg.type === 'hot-reload') {
        console.log(`Event: ${msg.event}`, msg.data);
    }
};

// Reload extension
ws.send(JSON.stringify({
    type: 'reload-request',
    data: { extensionId: 'my-extension' }
}));

// Enable watch
ws.send(JSON.stringify({
    type: 'enable-watch',
    data: { extensionId: 'my-extension' }
}));
```

## Configuration Options

### ExtensionHotReload Options

```javascript
{
    watch: true,                    // Enable file watching
    debounceTime: 300,              // Debounce delay (ms)
    gracefulShutdownTimeout: 5000,  // Shutdown timeout (ms)
    runtimeOptions: {}              // Options for runtime
}
```

### HotReloadWebSocketServer Options

```javascript
{
    port: 9876,        // WebSocket port
    host: 'localhost'  // Bind address
}
```

## Common Patterns

### Development vs Production

```javascript
const isDev = process.env.NODE_ENV === 'development';

const hotReload = new ExtensionHotReload(gateway, runtime, {
    watch: isDev,
    debounceTime: isDev ? 500 : 0
});

if (isDev) {
    const wsServer = new HotReloadWebSocketServer(hotReload);
    await wsServer.start();
}
```

### Graceful Shutdown

```javascript
process.on('SIGINT', async () => {
    console.log('Shutting down...');
    await wsServer.stop();
    await hotReload.shutdown();
    await runtime.shutdown();
    gateway.shutdown();
    process.exit(0);
});
```

### Status Monitoring

```javascript
// Get status for one extension
const status = hotReload.getReloadStatus('my-extension');
console.log(status);
// {
//   isReloading: false,
//   watchEnabled: true,
//   hasScheduledReload: false,
//   hasCapturedState: false
// }

// Get status for all extensions
const allStatus = hotReload.getAllReloadStatus();
```

## Troubleshooting

### Extension won't reload?
```javascript
// Check if watching is enabled
const status = hotReload.getReloadStatus('my-extension');
console.log('Watch enabled:', status.watchEnabled);

// Enable watching
await hotReload.enableHotReload('my-extension');
```

### State not preserved?
```javascript
// Implement in extension:
async getState() { return this.state; }
async setState({ state }) { this.state = state; }
```

### WebSocket won't connect?
```bash
# Check server status
curl http://localhost:9876/health

# Check WebSocket status
curl http://localhost:9876/status
```

## Next Steps

- Read [complete documentation](./HOT_RELOAD.md)
- See [implementation details](../core/HOT_RELOAD_IMPLEMENTATION.md)
- Run the [example](../core/examples/hot-reload-example.js)
- Check the [desktop component](../desktop/src/components/HotReloadMonitor.tsx)

## Resources

- **Main Documentation**: `docs/HOT_RELOAD.md`
- **Implementation Guide**: `core/HOT_RELOAD_IMPLEMENTATION.md`
- **Example Code**: `core/examples/hot-reload-example.js`
- **React Hook**: `desktop/src/hooks/useHotReloadWebSocket.ts`
- **UI Component**: `desktop/src/components/HotReloadMonitor.tsx`
