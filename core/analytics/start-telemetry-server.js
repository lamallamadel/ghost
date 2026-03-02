#!/usr/bin/env node

const { AnalyticsPlatform } = require('./index');
const path = require('path');
const os = require('os');

const analytics = new AnalyticsPlatform({
    persistenceDir: path.join(os.homedir(), '.ghost', 'analytics'),
    enableWebSocket: true,
    wsPort: 9877,
    wsHost: 'localhost'
});

async function startServer() {
    try {
        await analytics.initialize();
        console.log('[TelemetryServer] Analytics Platform initialized');
        console.log('[TelemetryServer] WebSocket server running on ws://localhost:9877/telemetry');
        console.log('[TelemetryServer] Press Ctrl+C to stop');

        analytics.on('invocation-started', (event) => {
            console.log(`[Invocation] Started: ${event.extensionId} - ${event.method}`);
        });

        analytics.on('invocation-completed', (event) => {
            console.log(`[Invocation] Completed: ${event.extensionId} - ${event.status} (${event.duration}ms)`);
        });

        analytics.on('regression-detected', (alert) => {
            console.log(`[Alert] Regression detected: ${alert.extensionId} - ${alert.severity}`);
        });
    } catch (error) {
        console.error('[TelemetryServer] Failed to start:', error.message);
        process.exit(1);
    }
}

process.on('SIGINT', async () => {
    console.log('\n[TelemetryServer] Shutting down...');
    await analytics.shutdown();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\n[TelemetryServer] Shutting down...');
    await analytics.shutdown();
    process.exit(0);
});

startServer();
