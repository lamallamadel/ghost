const path = require('path');
const { Gateway, ExtensionRuntime, ExtensionHotReload, HotReloadWebSocketServer } = require('../index');

async function main() {
    const gateway = new Gateway({
        extensionsDir: path.join(require('os').homedir(), '.ghost', 'extensions'),
        bundledExtensionsDir: path.join(__dirname, '..', '..', 'extensions')
    });

    await gateway.initialize();
    console.log('Gateway initialized with extensions:', gateway.listExtensions().map(e => e.id));

    const runtime = new ExtensionRuntime({
        executionMode: 'process',
        healthCheckFrequency: 30000
    });

    for (const ext of gateway.extensions.values()) {
        try {
            await runtime.startExtension(
                ext.manifest.id,
                ext.path,
                ext.manifest
            );
            console.log(`Started extension: ${ext.manifest.id}`);
        } catch (error) {
            console.error(`Failed to start extension ${ext.manifest.id}:`, error.message);
        }
    }

    const hotReload = new ExtensionHotReload(gateway, runtime, {
        watch: true,
        debounceTime: 500,
        gracefulShutdownTimeout: 5000,
        runtimeOptions: {
            executionMode: 'process'
        }
    });

    hotReload.on('reload-started', (data) => {
        console.log(`[Hot Reload] Reload started for ${data.extensionId}`);
    });

    hotReload.on('reload-completed', (data) => {
        console.log(`[Hot Reload] Reload completed for ${data.extensionId} in ${data.duration}ms`);
    });

    hotReload.on('reload-failed', (data) => {
        console.error(`[Hot Reload] Reload failed for ${data.extensionId}:`, data.error);
    });

    hotReload.on('watch-enabled', (data) => {
        console.log(`[Hot Reload] Watching ${data.extensionId} for changes`);
    });

    hotReload.on('state-restored', (data) => {
        console.log(`[Hot Reload] State restored for ${data.extensionId}`);
    });

    for (const ext of gateway.extensions.values()) {
        try {
            await hotReload.enableHotReload(ext.manifest.id);
        } catch (error) {
            console.error(`Failed to enable hot reload for ${ext.manifest.id}:`, error.message);
        }
    }

    const wsServer = new HotReloadWebSocketServer(hotReload, {
        port: 9876,
        host: 'localhost'
    });

    wsServer.on('started', (data) => {
        console.log(`[WebSocket] Server started at ${data.url}`);
    });

    wsServer.on('client-connected', (data) => {
        console.log(`[WebSocket] Client connected: ${data.clientId} (total: ${data.clientCount})`);
    });

    wsServer.on('client-disconnected', (data) => {
        console.log(`[WebSocket] Client disconnected: ${data.clientId} (remaining: ${data.clientCount})`);
    });

    await wsServer.start();

    console.log('\nHot Reload System Ready!');
    console.log('- WebSocket Server:', wsServer.getStatus().url);
    console.log('- Watched Extensions:', Object.keys(hotReload.getAllReloadStatus()).length);
    console.log('\nPress Ctrl+C to shutdown');

    process.on('SIGINT', async () => {
        console.log('\nShutting down...');
        
        await wsServer.stop();
        await hotReload.shutdown();
        await runtime.shutdown();
        gateway.shutdown();
        
        console.log('Shutdown complete');
        process.exit(0);
    });

    setInterval(() => {
        const status = hotReload.getAllReloadStatus();
        console.log('\nCurrent Status:');
        for (const [extensionId, extStatus] of Object.entries(status)) {
            console.log(`  ${extensionId}: ${JSON.stringify(extStatus)}`);
        }
    }, 30000);
}

main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});
