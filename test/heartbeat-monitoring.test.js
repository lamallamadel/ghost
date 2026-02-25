const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { ExtensionProcess } = require('../core/runtime');

console.log('🧪 Testing Heartbeat Monitoring Enhancements...\n');

const testDir = path.join(os.tmpdir(), 'ghost-heartbeat-test');

function createTestExtension() {
    if (fs.existsSync(testDir)) {
        fs.rmSync(testDir, { recursive: true, force: true });
    }
    fs.mkdirSync(testDir, { recursive: true });

    const manifest = {
        id: 'test-heartbeat',
        name: 'Test Heartbeat Extension',
        version: '1.0.0',
        main: 'index.js'
    };

    const extensionCode = `
const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false
});

rl.on('line', (line) => {
    try {
        const message = JSON.parse(line);
        
        if (message.method === 'init') {
            process.stdout.write(JSON.stringify({
                jsonrpc: '2.0',
                id: message.id,
                result: { initialized: true }
            }) + '\\n');
        } else if (message.method === 'pong') {
            process.stdout.write(JSON.stringify({
                jsonrpc: '2.0',
                id: message.id,
                method: 'pong',
                params: { timestamp: Date.now() }
            }) + '\\n');
        } else if (message.method === 'shutdown') {
            process.stdout.write(JSON.stringify({
                jsonrpc: '2.0',
                id: message.id,
                result: { shutdown: true }
            }) + '\\n');
            process.exit(0);
        }
    } catch (error) {
        // Ignore parse errors
    }
});
`;

    fs.writeFileSync(path.join(testDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
    fs.writeFileSync(path.join(testDir, 'index.js'), extensionCode);

    return { manifest, path: testDir };
}

async function runTests() {
    let testsPassed = 0;
    let testsFailed = 0;

    // Test 1: Extension initializes with heartbeat metrics
    console.log('▶ Test 1: Extension initializes with heartbeat metrics');
    try {
        const { manifest, path: extPath } = createTestExtension();
        const ext = new ExtensionProcess('test-heartbeat', extPath, manifest, {
            heartbeatPingInterval: 1000,
            heartbeatPongTimeout: 2000,
            degradedThreshold: 500
        });

        await ext.start();

        const state = ext.getState();
        assert.strictEqual(state.state, 'RUNNING', 'Extension should be running');
        assert.strictEqual(state.healthState, 'HEALTHY', 'Extension should be healthy');
        assert(state.heartbeat, 'Heartbeat metrics should exist');
        assert.strictEqual(state.heartbeat.consecutiveFailures, 0, 'Should have 0 failures');
        assert(state.heartbeat.metrics, 'Metrics object should exist');
        assert.strictEqual(state.heartbeat.metrics.totalPings, 0, 'Should have 0 pings initially');
        assert.strictEqual(state.heartbeat.metrics.totalPongs, 0, 'Should have 0 pongs initially');
        assert.strictEqual(state.heartbeat.metrics.successRate, null, 'Success rate should be null initially');

        await ext.stop();
        console.log('✅ Extension initializes with heartbeat metrics\n');
        testsPassed++;
    } catch (error) {
        console.error(`❌ Test failed: ${error.message}\n`);
        testsFailed++;
    }

    // Test 2: Heartbeat metrics track pings and pongs
    console.log('▶ Test 2: Heartbeat metrics track pings and pongs');
    try {
        const { manifest, path: extPath } = createTestExtension();
        const ext = new ExtensionProcess('test-heartbeat', extPath, manifest, {
            heartbeatPingInterval: 500,
            heartbeatPongTimeout: 1000,
            degradedThreshold: 300
        });

        await ext.start();

        await new Promise(resolve => setTimeout(resolve, 1500));

        const state = ext.getState();
        assert(state.heartbeat.metrics.totalPings > 0, 'Should have sent pings');

        await ext.stop();
        console.log('✅ Heartbeat metrics track pings and pongs\n');
        testsPassed++;
    } catch (error) {
        console.error(`❌ Test failed: ${error.message}\n`);
        testsFailed++;
    }

    // Test 3: getState returns all required heartbeat fields
    console.log('▶ Test 3: getState returns all required heartbeat fields');
    try {
        const { manifest, path: extPath } = createTestExtension();
        const ext = new ExtensionProcess('test-heartbeat', extPath, manifest);

        await ext.start();

        const state = ext.getState();
        
        assert(state.healthState !== undefined, 'healthState should be defined');
        assert(state.heartbeat !== undefined, 'heartbeat should be defined');
        assert(state.heartbeat.consecutiveFailures !== undefined, 'consecutiveFailures should be defined');
        assert(state.heartbeat.metrics !== undefined, 'metrics should be defined');
        
        const metrics = state.heartbeat.metrics;
        assert(metrics.totalPings !== undefined, 'totalPings should be defined');
        assert(metrics.totalPongs !== undefined, 'totalPongs should be defined');
        assert(metrics.totalFailures !== undefined, 'totalFailures should be defined');
        assert(metrics.totalTimeouts !== undefined, 'totalTimeouts should be defined');
        assert(metrics.lastResponseTime !== undefined, 'lastResponseTime should be defined');
        assert(metrics.minResponseTime !== undefined, 'minResponseTime should be defined');
        assert(metrics.maxResponseTime !== undefined, 'maxResponseTime should be defined');
        assert(metrics.avgResponseTime !== undefined, 'avgResponseTime should be defined');
        assert(metrics.successRate !== undefined, 'successRate should be defined');

        await ext.stop();
        console.log('✅ getState returns all required heartbeat fields\n');
        testsPassed++;
    } catch (error) {
        console.error(`❌ Test failed: ${error.message}\n`);
        testsFailed++;
    }

    // Cleanup
    if (fs.existsSync(testDir)) {
        fs.rmSync(testDir, { recursive: true, force: true });
    }

    // Summary
    console.log(`\n${'='.repeat(50)}`);
    console.log(`Tests passed: ${testsPassed}`);
    console.log(`Tests failed: ${testsFailed}`);
    
    if (testsFailed === 0) {
        console.log('🎉 All heartbeat monitoring tests passed!');
        process.exit(0);
    } else {
        console.log('❌ Some tests failed');
        process.exit(1);
    }
}

runTests().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});
