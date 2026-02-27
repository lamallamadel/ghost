#!/usr/bin/env node

const { AnalyticsAPIServer } = require('./index');
const path = require('path');
const os = require('os');

const server = new AnalyticsAPIServer({
    port: 9876,
    host: 'localhost',
    analytics: {
        persistenceDir: path.join(os.homedir(), '.ghost', 'analytics'),
        flushInterval: 60000,
        retentionDays: 30
    }
});

async function main() {
    try {
        await server.start();
        console.log('[Analytics] API Server started successfully');
        console.log('[Analytics] Access dashboard at: http://localhost:9876/api/analytics/dashboard');
    } catch (error) {
        console.error('[Analytics] Failed to start API server:', error);
        process.exit(1);
    }
}

process.on('SIGINT', async () => {
    console.log('\n[Analytics] Shutting down...');
    await server.stop();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\n[Analytics] Shutting down...');
    await server.stop();
    process.exit(0);
});

main();
