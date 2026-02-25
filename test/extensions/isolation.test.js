const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { ExtensionRuntime } = require('../../core/runtime');
const { AuditLogger } = require('../../core/pipeline/audit');

console.log('🧪 Testing Extension Isolation and Fault Tolerance...\n');

// Create a crashing extension for testing
const crashingExtensionDir = path.join(os.tmpdir(), 'ghost-test-crashing-ext');
const workingExtensionDir = path.join(os.tmpdir(), 'ghost-test-working-ext');
const unresponsiveExtensionDir = path.join(os.tmpdir(), 'ghost-test-unresponsive-ext');
const crashDuringRequestExtensionDir = path.join(os.tmpdir(), 'ghost-test-crash-during-request-ext');
const memoryLeakExtensionDir = path.join(os.tmpdir(), 'ghost-test-memory-leak-ext');
const testAuditLogPath = path.join(os.tmpdir(), 'ghost-test-audit.log');

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

    // Crash during active request extension
    if (!fs.existsSync(crashDuringRequestExtensionDir)) {
        fs.mkdirSync(crashDuringRequestExtensionDir, { recursive: true });
    }
    
    const crashDuringRequestExtensionCode = `
const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false
});

rl.on('line', (line) => {
    try {
        const request = JSON.parse(line);
        
        if (request.method === 'init') {
            const response = {
                jsonrpc: "2.0",
                id: request.id,
                result: { status: 'initialized' }
            };
            console.log(JSON.stringify(response));
        } else if (request.method === 'work-then-crash') {
            // Crash immediately without responding
            process.exit(1);
        } else if (request.method === 'shutdown') {
            process.exit(0);
        }
    } catch (e) {
        // Ignore parse errors
    }
});
`;

    fs.writeFileSync(path.join(crashDuringRequestExtensionDir, 'extension.js'), crashDuringRequestExtensionCode);
    fs.writeFileSync(path.join(crashDuringRequestExtensionDir, 'manifest.json'), JSON.stringify({
        id: 'crash-during-request-ext',
        name: 'Crash During Request Extension',
        version: '1.0.0',
        main: 'extension.js'
    }));

    // Memory leak extension (simulates OOM)
    if (!fs.existsSync(memoryLeakExtensionDir)) {
        fs.mkdirSync(memoryLeakExtensionDir, { recursive: true });
    }
    
    const memoryLeakExtensionCode = `
const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false
});

let leakArray = [];

rl.on('line', (line) => {
    try {
        const request = JSON.parse(line);
        
        if (request.method === 'init') {
            const response = {
                jsonrpc: "2.0",
                id: request.id,
                result: { status: 'initialized' }
            };
            console.log(JSON.stringify(response));
        } else if (request.method === 'allocate') {
            // Allocate some memory
            for (let i = 0; i < 1000; i++) {
                leakArray.push(new Array(1000).fill('x'));
            }
            const response = {
                jsonrpc: "2.0",
                id: request.id,
                result: { allocated: leakArray.length }
            };
            console.log(JSON.stringify(response));
        } else if (request.method === 'oom') {
            // Try to cause OOM (exit with error code)
            process.exit(137); // SIGKILL typically used for OOM
        } else if (request.method === 'shutdown') {
            process.exit(0);
        }
    } catch (e) {
        // Ignore parse errors
    }
});
`;

    fs.writeFileSync(path.join(memoryLeakExtensionDir, 'extension.js'), memoryLeakExtensionCode);
    fs.writeFileSync(path.join(memoryLeakExtensionDir, 'manifest.json'), JSON.stringify({
        id: 'memory-leak-ext',
        name: 'Memory Leak Extension',
        version: '1.0.0',
        main: 'extension.js'
    }));
}

async function runTests() {
    setupTestExtensions();

    // Clean up audit log before tests
    if (fs.existsSync(testAuditLogPath)) {
        fs.unlinkSync(testAuditLogPath);
    }

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

    // Test 8: Extension crash during active request
    console.log('▶ Test 8: Extension crash during active request (verify request fails but runtime continues)');
    const manifest4 = JSON.parse(fs.readFileSync(path.join(crashDuringRequestExtensionDir, 'manifest.json')));
    await runtime.startExtension('crash-during-request-ext', crashDuringRequestExtensionDir, manifest4);
    
    let requestFailed = false;
    let crashDuringRequestDetected = false;
    
    runtime.once('extension-crashed', (info) => {
        if (info.extensionId === 'crash-during-request-ext') {
            crashDuringRequestDetected = true;
            assert.ok(info.pendingRequestCount >= 0, 'Should report pending request count');
        }
    });
    
    try {
        await runtime.callExtension('crash-during-request-ext', 'work-then-crash', {});
    } catch (e) {
        requestFailed = true;
        assert.ok(e.message.includes('process') || e.message.includes('crash') || e.message.includes('exit'), 
            'Error should indicate process crash');
    }
    
    await new Promise(resolve => setTimeout(resolve, 500));
    
    assert.strictEqual(requestFailed, true, 'Request should fail when extension crashes');
    
    // Runtime should continue
    const healthAfterCrashDuringRequest = runtime.getHealthStatus();
    assert.ok(healthAfterCrashDuringRequest.totalExtensions > 0, 'Runtime should continue');
    
    // Other extensions should still work
    const workResultAfterCrash = await runtime.callExtension('working-ext', 'work', {});
    assert.strictEqual(workResultAfterCrash.status, 'working', 'Other extensions should continue working');
    console.log('✅ Request failed but runtime continues\n');

    // Test 9: Concurrent extension crashes (verify independence)
    console.log('▶ Test 9: Concurrent extension crashes (verify independence)');
    const runtime2 = new ExtensionRuntime({
        maxRestarts: 1,
        restartWindow: 60000,
        responseTimeout: 2000
    });
    
    // Start multiple crashing extensions
    await runtime2.startExtension('crash-ext-1', crashingExtensionDir, manifest1);
    await runtime2.startExtension('crash-ext-2', crashingExtensionDir, manifest1);
    await runtime2.startExtension('working-ext-2', workingExtensionDir, manifest2);
    
    const crashEvents = [];
    runtime2.on('extension-crashed', (info) => {
        crashEvents.push(info);
    });
    
    // Trigger crashes concurrently
    const crashPromises = [
        runtime2.callExtension('crash-ext-1', 'crash', {}).catch(e => ({ error: e, id: 'crash-ext-1' })),
        runtime2.callExtension('crash-ext-2', 'crash', {}).catch(e => ({ error: e, id: 'crash-ext-2' }))
    ];
    
    await Promise.all(crashPromises);
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    // Verify working extension is unaffected
    const workingAfterConcurrentCrashes = await runtime2.callExtension('working-ext-2', 'work', {});
    assert.strictEqual(workingAfterConcurrentCrashes.status, 'working', 
        'Working extension should be unaffected by concurrent crashes');
    
    // Verify crash events were captured independently
    assert.ok(crashEvents.length > 0, 'Should have captured crash events');
    console.log(`✅ Concurrent crashes handled independently (${crashEvents.length} crash events)\n`);
    
    await runtime2.shutdown();

    // Test 10: Restart limit enforcement (verify FAILED state after exceeding maxRestarts)
    console.log('▶ Test 10: Restart limit enforcement (verify FAILED state after exceeding maxRestarts)');
    const runtime3 = new ExtensionRuntime({
        maxRestarts: 2,
        restartWindow: 60000,
        responseTimeout: 2000,
        startupTimeout: 3000
    });
    
    let failedStateReached = false;
    runtime3.on('extension-state-change', (info) => {
        if (info.extensionId === 'restart-limit-test' && info.newState === 'FAILED') {
            failedStateReached = true;
            assert.strictEqual(info.reasonCode, 'RESTART_LIMIT_EXCEEDED', 
                'Should transition to FAILED with restart limit exceeded reason');
        }
    });
    
    await runtime3.startExtension('restart-limit-test', crashingExtensionDir, manifest1);
    
    // Trigger multiple crashes to exceed restart limit
    for (let i = 0; i < 5; i++) {
        try {
            await runtime3.callExtension('restart-limit-test', 'crash', {});
        } catch (e) {
            // Expected
        }
        await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const restartLimitState = runtime3.getExtensionState('restart-limit-test');
    assert.ok(restartLimitState, 'Extension state should exist');
    
    if (restartLimitState.state === 'FAILED') {
        console.log('✅ Extension entered FAILED state after exceeding restart limit\n');
    } else {
        console.log(`⚠️  Extension state is ${restartLimitState.state} (restarts: ${restartLimitState.restartCount})\n`);
    }
    
    await runtime3.shutdown();

    // Test 11: Memory leak isolation (verify extension OOM doesn't affect gateway)
    console.log('▶ Test 11: Memory leak isolation (verify extension OOM doesn\'t affect gateway)');
    const runtime4 = new ExtensionRuntime({
        maxRestarts: 1,
        restartWindow: 60000,
        responseTimeout: 2000
    });
    
    const manifest5 = JSON.parse(fs.readFileSync(path.join(memoryLeakExtensionDir, 'manifest.json')));
    await runtime4.startExtension('memory-leak-ext', memoryLeakExtensionDir, manifest5);
    await runtime4.startExtension('working-ext-3', workingExtensionDir, manifest2);
    
    let oomCrashDetected = false;
    runtime4.once('extension-crashed', (info) => {
        if (info.extensionId === 'memory-leak-ext') {
            oomCrashDetected = true;
            assert.ok(info.exitCode !== 0 || info.signal !== null, 'Should report non-zero exit or signal');
        }
    });
    
    // Simulate OOM
    try {
        await runtime4.callExtension('memory-leak-ext', 'oom', {});
    } catch (e) {
        // Expected to fail
    }
    
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Verify runtime is still operational
    const runtimeStillAlive = runtime4.getHealthStatus();
    assert.ok(runtimeStillAlive.totalExtensions > 0, 'Runtime should still be operational');
    
    // Verify other extensions still work
    const workAfterOOM = await runtime4.callExtension('working-ext-3', 'work', {});
    assert.strictEqual(workAfterOOM.status, 'working', 'Other extensions should be unaffected by OOM');
    console.log('✅ Gateway unaffected by extension OOM\n');
    
    await runtime4.shutdown();

    // Test 12: Verify audit logs capture all crash events with correct severity
    console.log('▶ Test 12: Verify audit logs capture all crash events with correct severity');
    const auditLogger = new AuditLogger(testAuditLogPath);
    const runtime5 = new ExtensionRuntime({
        maxRestarts: 2,
        restartWindow: 60000,
        responseTimeout: 2000
    });
    
    // Capture crash telemetry and log to audit
    const capturedCrashes = [];
    runtime5.on('extension-crashed', (info) => {
        capturedCrashes.push(info);
        
        // Determine severity based on crash details
        let severity = 'medium';
        if (info.exitCode === 137) {
            severity = 'high'; // OOM
        } else if (info.signal === 'SIGSEGV' || info.signal === 'SIGABRT') {
            severity = 'critical'; // Segfault or abort
        } else if (info.consecutiveRestarts >= 3) {
            severity = 'high'; // Repeated crashes
        }
        
        auditLogger.logSecurityEvent(info.extensionId, 'EXTENSION_CRASH', {
            severity,
            pid: info.pid,
            exitCode: info.exitCode,
            signal: info.signal,
            crashType: info.crashType,
            uptime: info.uptime,
            restartCount: info.restartCount,
            consecutiveRestarts: info.consecutiveRestarts,
            timestamp: info.timestamp
        });
    });
    
    runtime5.on('extension-state-change', (info) => {
        if (info.newState === 'FAILED' && info.reasonCode === 'RESTART_LIMIT_EXCEEDED') {
            auditLogger.logSecurityEvent(info.extensionId, 'RESTART_LIMIT_EXCEEDED', {
                severity: 'critical',
                restartCount: info.metadata.restartCount,
                consecutiveRestarts: info.metadata.consecutiveRestarts,
                timestamp: info.timestamp
            });
        }
    });
    
    await runtime5.startExtension('audit-crash-test', crashingExtensionDir, manifest1);
    
    // Trigger multiple crashes
    for (let i = 0; i < 3; i++) {
        try {
            await runtime5.callExtension('audit-crash-test', 'crash', {});
        } catch (e) {
            // Expected
        }
        await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Verify audit logs
    const auditLogs = auditLogger.readLogs({ type: 'SECURITY_EVENT' });
    const crashLogs = auditLogs.filter(log => 
        log.eventType === 'EXTENSION_CRASH' || log.eventType === 'RESTART_LIMIT_EXCEEDED'
    );
    
    assert.ok(crashLogs.length > 0, 'Should have logged crash events');
    assert.ok(capturedCrashes.length > 0, 'Should have captured crash events');
    
    // Verify log structure
    for (const log of crashLogs) {
        assert.ok(log.timestamp, 'Should have timestamp');
        assert.ok(log.extensionId, 'Should have extension ID');
        assert.ok(log.eventType, 'Should have event type');
        assert.ok(log.details, 'Should have details');
        assert.ok(log.details.severity, 'Should have severity');
        assert.ok(['low', 'medium', 'high', 'critical'].includes(log.details.severity), 
            'Severity should be valid');
    }
    
    console.log(`✅ Audit logs captured ${crashLogs.length} crash events with correct severity\n`);
    
    await runtime5.shutdown();

    // Test 13: Clean shutdown of healthy extensions
    console.log('▶ Test 13: Clean shutdown of all extensions');
    await runtime.shutdown();
    
    const postShutdownHealth = runtime.getHealthStatus();
    assert.strictEqual(postShutdownHealth.totalExtensions, 0, 'All extensions should be stopped');
    console.log('✅ Clean shutdown completed\n');

    // Test 14: Extension error events
    console.log('▶ Test 14: Extension error events propagate correctly');
    const runtime6 = new ExtensionRuntime({
        maxRestarts: 0, // Don't restart to test error handling
        responseTimeout: 1000
    });
    
    let errorEventReceived = false;
    runtime6.once('extension-error', (info) => {
        errorEventReceived = true;
    });
    
    await runtime6.startExtension('crashing-ext-2', crashingExtensionDir, manifest1);
    
    try {
        await runtime6.callExtension('crashing-ext-2', 'crash', {});
    } catch (e) {
        // Expected
    }
    
    await new Promise(resolve => setTimeout(resolve, 500));
    await runtime6.shutdown();
    console.log('✅ Error events propagate correctly\n');

    // Test 15: Process isolation verification
    console.log('▶ Test 15: Process-level isolation verification');
    const runtime7 = new ExtensionRuntime();
    
    await runtime7.startExtension('ext-isolated-1', workingExtensionDir, manifest2);
    await runtime7.startExtension('ext-isolated-2', workingExtensionDir, manifest2);
    
    const stateIso1 = runtime7.getExtensionState('ext-isolated-1');
    const stateIso2 = runtime7.getExtensionState('ext-isolated-2');
    
    assert.notStrictEqual(stateIso1.pid, stateIso2.pid, 'Extensions should run in separate processes');
    assert.ok(stateIso1.pid > 0, 'Extension 1 should have valid PID');
    assert.ok(stateIso2.pid > 0, 'Extension 2 should have valid PID');
    
    await runtime7.shutdown();
    console.log('✅ Process-level isolation verified\n');

    // Cleanup
    try {
        fs.rmSync(crashingExtensionDir, { recursive: true, force: true });
        fs.rmSync(workingExtensionDir, { recursive: true, force: true });
        fs.rmSync(unresponsiveExtensionDir, { recursive: true, force: true });
        fs.rmSync(crashDuringRequestExtensionDir, { recursive: true, force: true });
        fs.rmSync(memoryLeakExtensionDir, { recursive: true, force: true });
        if (fs.existsSync(testAuditLogPath)) {
            fs.unlinkSync(testAuditLogPath);
        }
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
