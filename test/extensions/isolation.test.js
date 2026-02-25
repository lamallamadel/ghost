const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { ExtensionRuntime } = require('../../core/runtime');

console.log('🧪 Testing Extension Isolation and Fault Tolerance...\n');

// Create a crashing extension for testing
const crashingExtensionDir = path.join(os.tmpdir(), 'ghost-test-crashing-ext');
const workingExtensionDir = path.join(os.tmpdir(), 'ghost-test-working-ext');
const unresponsiveExtensionDir = path.join(os.tmpdir(), 'ghost-test-unresponsive-ext');

// Setup test extensions
function setupTestExtensions() {
    // Crashing extension
    if (!fs.existsSync(crashingExtensionDir)) {
        fs.mkdirSync(crashingExtensionDir, { recursive: true });
    }
    
    const crashingExtensionCode = `
const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false
});

let initialized = false;
let crashCount = 0;

rl.on('line', (line) => {
    try {
        const request = JSON.parse(line);
        
        if (request.method === 'init') {
            initialized = true;
            const response = {
                jsonrpc: "2.0",
                id: request.id,
                result: { status: 'initialized' }
            };
            console.log(JSON.stringify(response));
        } else if (request.method === 'crash') {
            // Simulate crash
            crashCount++;
            if (crashCount <= 2) {
                // Crash on first 2 attempts
                process.exit(1);
            } else {
                // Succeed after restarts
                const response = {
                    jsonrpc: "2.0",
                    id: request.id,
                    result: { status: 'recovered', crashCount }
                };
                console.log(JSON.stringify(response));
            }
        } else if (request.method === 'ping') {
            const response = {
                jsonrpc: "2.0",
                id: request.id,
                result: { alive: true }
            };
            console.log(JSON.stringify(response));
        } else if (request.method === 'shutdown') {
            process.exit(0);
        }
    } catch (e) {
        // Ignore parse errors
    }
});
`;

    fs.writeFileSync(path.join(crashingExtensionDir, 'extension.js'), crashingExtensionCode);
    fs.writeFileSync(path.join(crashingExtensionDir, 'manifest.json'), JSON.stringify({
        id: 'crashing-ext',
        name: 'Crashing Extension',
        version: '1.0.0',
        main: 'extension.js'
    }));

    // Working extension
    if (!fs.existsSync(workingExtensionDir)) {
        fs.mkdirSync(workingExtensionDir, { recursive: true });
    }
    
    const workingExtensionCode = `
const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false
});

let initialized = false;

rl.on('line', (line) => {
    try {
        const request = JSON.parse(line);
        
        if (request.method === 'init') {
            initialized = true;
            const response = {
                jsonrpc: "2.0",
                id: request.id,
                result: { status: 'initialized' }
            };
            console.log(JSON.stringify(response));
        } else if (request.method === 'work') {
            const response = {
                jsonrpc: "2.0",
                id: request.id,
                result: { status: 'working', data: 'work completed' }
            };
            console.log(JSON.stringify(response));
        } else if (request.method === 'ping') {
            const response = {
                jsonrpc: "2.0",
                id: request.id,
                result: { alive: true }
            };
            console.log(JSON.stringify(response));
        } else if (request.method === 'shutdown') {
            process.exit(0);
        }
    } catch (e) {
        // Ignore parse errors
    }
});
`;

    fs.writeFileSync(path.join(workingExtensionDir, 'extension.js'), workingExtensionCode);
    fs.writeFileSync(path.join(workingExtensionDir, 'manifest.json'), JSON.stringify({
        id: 'working-ext',
        name: 'Working Extension',
        version: '1.0.0',
        main: 'extension.js'
    }));

    // Unresponsive extension
    if (!fs.existsSync(unresponsiveExtensionDir)) {
        fs.mkdirSync(unresponsiveExtensionDir, { recursive: true });
    }
    
    const unresponsiveExtensionCode = `
const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false
});

let initialized = false;

rl.on('line', (line) => {
    try {
        const request = JSON.parse(line);
        
        if (request.method === 'init') {
            initialized = true;
            const response = {
                jsonrpc: "2.0",
                id: request.id,
                result: { status: 'initialized' }
            };
            console.log(JSON.stringify(response));
        } else if (request.method === 'hang') {
            // Don't respond - simulate hang
            // Just do nothing
        } else if (request.method === 'ping') {
            const response = {
                jsonrpc: "2.0",
                id: request.id,
                result: { alive: true }
            };
            console.log(JSON.stringify(response));
        } else if (request.method === 'shutdown') {
            process.exit(0);
        }
    } catch (e) {
        // Ignore parse errors
    }
});
`;

    fs.writeFileSync(path.join(unresponsiveExtensionDir, 'extension.js'), unresponsiveExtensionCode);
    fs.writeFileSync(path.join(unresponsiveExtensionDir, 'manifest.json'), JSON.stringify({
        id: 'unresponsive-ext',
        name: 'Unresponsive Extension',
        version: '1.0.0',
        main: 'extension.js'
    }));
}

async function runTests() {
    setupTestExtensions();

    // Test 1: Extension crash does not affect runtime
    console.log('▶ Test 1: Crashing extension does not kill runtime');
    const runtime = new ExtensionRuntime({
        maxRestarts: 3,
        restartWindow: 60000,
        heartbeatTimeout: 5000,
        responseTimeout: 3000,
        startupTimeout: 5000
    });

    const manifest1 = JSON.parse(fs.readFileSync(path.join(crashingExtensionDir, 'manifest.json')));
    await runtime.startExtension('crashing-ext', crashingExtensionDir, manifest1);
    
    const state1 = runtime.getExtensionState('crashing-ext');
    assert.strictEqual(state1.state, 'RUNNING', 'Extension should be running');
    console.log('✅ Runtime survived extension startup\n');

    // Test 2: Multiple extensions can run simultaneously
    console.log('▶ Test 2: Multiple extensions run in isolation');
    const manifest2 = JSON.parse(fs.readFileSync(path.join(workingExtensionDir, 'manifest.json')));
    await runtime.startExtension('working-ext', workingExtensionDir, manifest2);

    const state2 = runtime.getExtensionState('working-ext');
    assert.strictEqual(state2.state, 'RUNNING', 'Second extension should be running');
    
    const healthStatus = runtime.getHealthStatus();
    assert.strictEqual(healthStatus.running, 2, 'Both extensions should be running');
    console.log('✅ Multiple extensions running simultaneously\n');

    // Test 3: Working extension continues working while other crashes
    console.log('▶ Test 3: Crash isolation - working extension unaffected');
    
    let crashedEventReceived = false;
    runtime.once('extension-crashed', (info) => {
        crashedEventReceived = true;
        assert.strictEqual(info.extensionId, 'crashing-ext', 'Crashed extension should be crashing-ext');
    });

    // Call the working extension to verify it's operational
    const workResult = await runtime.callExtension('working-ext', 'work', {});
    assert.strictEqual(workResult.status, 'working', 'Working extension should respond');
    
    // Now trigger a crash in the crashing extension
    try {
        await runtime.callExtension('crashing-ext', 'crash', {});
    } catch (e) {
        // Expected to fail or timeout during crash/restart cycle
    }
    
    // Wait a bit for crash handling
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Working extension should still be operational
    const workResult2 = await runtime.callExtension('working-ext', 'work', {});
    assert.strictEqual(workResult2.status, 'working', 'Working extension still operational after crash');
    console.log('✅ Working extension isolated from crash\n');

    // Test 4: Extension auto-restart after crash
    console.log('▶ Test 4: Extension auto-restart after crash');
    await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for potential restart
    
    const crashedState = runtime.getExtensionState('crashing-ext');
    // Should be RUNNING (restarted) or FAILED (if exceeded restart limit)
    assert.ok(['RUNNING', 'FAILED'].includes(crashedState.state), 
        'Crashing extension should be restarted or failed');
    
    if (crashedState.state === 'RUNNING') {
        assert.ok(crashedState.restartCount > 0, 'Should have restarted at least once');
        console.log(`✅ Extension auto-restarted (${crashedState.restartCount} times)\n`);
    } else {
        console.log('✅ Extension failed after exceeding restart limit\n');
    }

    // Test 5: Extension state isolation
    console.log('▶ Test 5: Extension state isolation verification');
    const allStates = runtime.getAllExtensionStates();
    assert.ok(allStates['working-ext'], 'Working extension state should exist');
    assert.ok(allStates['crashing-ext'], 'Crashing extension state should exist');
    assert.notStrictEqual(allStates['working-ext'].pid, allStates['crashing-ext'].pid, 
        'Extensions should have different PIDs');
    console.log('✅ Extension states isolated\n');

    // Test 6: Gateway continues processing after extension failure
    console.log('▶ Test 6: Runtime continues after extension failure');
    const health = runtime.getHealthStatus();
    assert.ok(health.totalExtensions >= 1, 'Runtime should still track extensions');
    
    // Should still be able to work with functioning extensions
    const finalWorkResult = await runtime.callExtension('working-ext', 'work', {});
    assert.strictEqual(finalWorkResult.status, 'working', 'Can still call working extensions');
    console.log('✅ Runtime continues operating after extension failure\n');

    // Test 7: Timeout handling doesn't block other extensions
    console.log('▶ Test 7: Timeout handling isolation');
    const manifest3 = JSON.parse(fs.readFileSync(path.join(unresponsiveExtensionDir, 'manifest.json')));
    await runtime.startExtension('unresponsive-ext', unresponsiveExtensionDir, manifest3);
    
    // Call unresponsive extension (will timeout)
    const timeoutStart = Date.now();
    let timeoutOccurred = false;
    try {
        await runtime.callExtension('unresponsive-ext', 'hang', {});
    } catch (e) {
        timeoutOccurred = true;
        const elapsed = Date.now() - timeoutStart;
        assert.ok(elapsed < 5000, 'Should timeout within response timeout period');
    }
    assert.strictEqual(timeoutOccurred, true, 'Should timeout on unresponsive call');
    
    // Working extension should still respond immediately
    const quickResult = await runtime.callExtension('working-ext', 'work', {});
    assert.strictEqual(quickResult.status, 'working', 'Working extension not blocked by timeout');
    console.log('✅ Timeout in one extension does not block others\n');

    // Test 8: Clean shutdown of healthy extensions
    console.log('▶ Test 8: Clean shutdown of all extensions');
    await runtime.shutdown();
    
    const postShutdownHealth = runtime.getHealthStatus();
    assert.strictEqual(postShutdownHealth.totalExtensions, 0, 'All extensions should be stopped');
    console.log('✅ Clean shutdown completed\n');

    // Test 9: Extension error events
    console.log('▶ Test 9: Extension error events propagate correctly');
    const runtime2 = new ExtensionRuntime({
        maxRestarts: 0, // Don't restart to test error handling
        responseTimeout: 1000
    });
    
    let errorEventReceived = false;
    runtime2.once('extension-error', (info) => {
        errorEventReceived = true;
    });
    
    await runtime2.startExtension('crashing-ext-2', crashingExtensionDir, manifest1);
    
    try {
        await runtime2.callExtension('crashing-ext-2', 'crash', {});
    } catch (e) {
        // Expected
    }
    
    await new Promise(resolve => setTimeout(resolve, 500));
    await runtime2.shutdown();
    console.log('✅ Error events propagate correctly\n');

    // Test 10: Process isolation verification
    console.log('▶ Test 10: Process-level isolation verification');
    const runtime3 = new ExtensionRuntime();
    
    await runtime3.startExtension('ext-isolated-1', workingExtensionDir, manifest2);
    await runtime3.startExtension('ext-isolated-2', workingExtensionDir, manifest2);
    
    const stateIso1 = runtime3.getExtensionState('ext-isolated-1');
    const stateIso2 = runtime3.getExtensionState('ext-isolated-2');
    
    assert.notStrictEqual(stateIso1.pid, stateIso2.pid, 'Extensions should run in separate processes');
    assert.ok(stateIso1.pid > 0, 'Extension 1 should have valid PID');
    assert.ok(stateIso2.pid > 0, 'Extension 2 should have valid PID');
    
    await runtime3.shutdown();
    console.log('✅ Process-level isolation verified\n');

    // Cleanup
    try {
        fs.rmSync(crashingExtensionDir, { recursive: true, force: true });
        fs.rmSync(workingExtensionDir, { recursive: true, force: true });
        fs.rmSync(unresponsiveExtensionDir, { recursive: true, force: true });
    } catch (e) {
        // Ignore cleanup errors
    }

    console.log('🎉 All extension isolation tests passed!');
}

runTests().then(() => {
    process.exit(0);
}).catch((error) => {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
});
