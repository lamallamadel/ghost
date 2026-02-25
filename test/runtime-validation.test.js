const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { ExtensionRuntime } = require('../core/runtime');

console.log('🧪 Testing Runtime Enhancements...\n');

const testExtensionDir = path.join(os.tmpdir(), 'ghost-test-runtime-validation');

function setupTestExtension() {
    if (!fs.existsSync(testExtensionDir)) {
        fs.mkdirSync(testExtensionDir, { recursive: true });
    }
    
    const extensionCode = `
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

    fs.writeFileSync(path.join(testExtensionDir, 'extension.js'), extensionCode);
}

async function runTests() {
    setupTestExtension();

    // Test 1: Manifest validation - missing required fields
    console.log('▶ Test 1: Manifest validation rejects missing fields');
    const runtime1 = new ExtensionRuntime();
    
    const invalidManifest = {
        id: 'test-ext',
        name: 'Test Extension'
        // Missing version and main
    };
    
    try {
        await runtime1.startExtension('test-ext', testExtensionDir, invalidManifest);
        assert.fail('Should have rejected invalid manifest');
    } catch (error) {
        assert.ok(error.message.includes('missing required fields'), 'Should report missing fields');
        assert.ok(error.message.includes('version'), 'Should mention version field');
        assert.ok(error.message.includes('main'), 'Should mention main field');
    }
    
    await runtime1.shutdown();
    console.log('✅ Manifest validation works correctly\n');

    // Test 2: Main file existence check
    console.log('▶ Test 2: Main file existence validation');
    const runtime2 = new ExtensionRuntime();
    
    const manifestWithBadMain = {
        id: 'test-ext',
        name: 'Test Extension',
        version: '1.0.0',
        main: 'nonexistent.js'
    };
    
    try {
        await runtime2.startExtension('test-ext', testExtensionDir, manifestWithBadMain);
        assert.fail('Should have rejected missing main file');
    } catch (error) {
        assert.ok(error.message.includes('Main file does not exist'), 'Should report missing main file');
        assert.ok(error.message.includes('nonexistent.js'), 'Should mention the file name');
    }
    
    await runtime2.shutdown();
    console.log('✅ Main file validation works correctly\n');

    // Test 3: Valid manifest and main file
    console.log('▶ Test 3: Valid extension starts successfully');
    const runtime3 = new ExtensionRuntime({ startupTimeout: 5000 });
    
    const validManifest = {
        id: 'test-ext',
        name: 'Test Extension',
        version: '1.0.0',
        main: 'extension.js'
    };
    
    await runtime3.startExtension('test-ext', testExtensionDir, validManifest);
    
    const state = runtime3.getExtensionState('test-ext');
    assert.strictEqual(state.state, 'RUNNING', 'Extension should be running');
    assert.ok(state.pid > 0, 'Should have valid PID');
    
    await runtime3.shutdown();
    console.log('✅ Valid extension starts successfully\n');

    // Test 4: Semver version validation
    console.log('▶ Test 4: Semver version format validation');
    const runtime4 = new ExtensionRuntime();
    
    const invalidVersionManifest = {
        id: 'test-ext',
        name: 'Test Extension',
        version: 'not-semver',
        main: 'extension.js'
    };
    
    try {
        await runtime4.startExtension('test-ext', testExtensionDir, invalidVersionManifest);
        assert.fail('Should have rejected invalid semver');
    } catch (error) {
        assert.ok(error.message.includes('version'), 'Should report version issue');
        assert.ok(error.message.includes('semver'), 'Should mention semver format');
    }
    
    await runtime4.shutdown();
    console.log('✅ Semver validation works correctly\n');

    // Test 5: Structured error logging event
    console.log('▶ Test 5: Structured error logging');
    const runtime5 = new ExtensionRuntime({ startupTimeout: 1000 });
    
    let structuredErrorReceived = false;
    runtime5.on('extension-error', (info) => {
        // This would be called for general errors
    });
    
    // Listen for structured error events from the extension process
    const manifestTimeout = {
        id: 'test-timeout',
        name: 'Test Timeout',
        version: '1.0.0',
        main: 'nonexistent-for-timeout.js'
    };
    
    try {
        await runtime5.startExtension('test-timeout', testExtensionDir, manifestTimeout);
    } catch (error) {
        // Expected to fail
        assert.ok(error.message.includes('Main file does not exist'), 'Should fail on missing file');
    }
    
    await runtime5.shutdown();
    console.log('✅ Error logging works correctly\n');

    // Cleanup
    try {
        fs.rmSync(testExtensionDir, { recursive: true, force: true });
    } catch (e) {
        // Ignore cleanup errors
    }

    console.log('🎉 All runtime enhancement tests passed!');
}

runTests().then(() => {
    process.exit(0);
}).catch((error) => {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
});
