const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { ExtensionRuntime } = require('../core/runtime');

console.log('🧪 Testing JSON-RPC 2.0 Protocol Validation...\n');

const testExtensionDir = path.join(os.tmpdir(), 'ghost-test-jsonrpc-validation');

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
        } else if (request.method === 'echo') {
            const response = {
                jsonrpc: "2.0",
                id: request.id,
                result: request.params
            };
            console.log(JSON.stringify(response));
        } else if (request.method === 'send-malformed') {
            // Send malformed JSON
            console.log('not valid json{}}');
        } else if (request.method === 'send-invalid-rpc') {
            // Send invalid JSON-RPC (missing jsonrpc field)
            console.log(JSON.stringify({ id: request.id, result: {} }));
        } else if (request.method === 'send-error') {
            // Send proper JSON-RPC error
            const errorResponse = {
                jsonrpc: "2.0",
                id: request.id,
                error: {
                    code: -32000,
                    message: "Custom error",
                    data: { detail: "Error details" }
                }
            };
            console.log(JSON.stringify(errorResponse));
        } else if (request.method === 'shutdown') {
            process.exit(0);
        }
    } catch (e) {
        // Ignore parse errors in the extension
    }
});
`;

    fs.writeFileSync(path.join(testExtensionDir, 'extension.js'), extensionCode);
}

async function runTests() {
    setupTestExtension();

    // Test 1: Valid JSON-RPC request/response
    console.log('▶ Test 1: Valid JSON-RPC communication');
    const runtime1 = new ExtensionRuntime({ responseTimeout: 5000 });
    
    const validManifest = {
        id: 'test-jsonrpc',
        name: 'JSON-RPC Test Extension',
        version: '1.0.0',
        main: 'extension.js'
    };
    
    await runtime1.startExtension('test-jsonrpc', testExtensionDir, validManifest);
    
    const echoResult = await runtime1.callExtension('test-jsonrpc', 'echo', { test: 'data' });
    assert.deepStrictEqual(echoResult, { test: 'data' }, 'Should echo back parameters');
    
    await runtime1.shutdown();
    console.log('✅ Valid JSON-RPC communication works\n');

    // Test 2: JSON-RPC error response handling
    console.log('▶ Test 2: JSON-RPC error response handling');
    const runtime2 = new ExtensionRuntime({ responseTimeout: 5000 });
    
    await runtime2.startExtension('test-jsonrpc', testExtensionDir, validManifest);
    
    try {
        await runtime2.callExtension('test-jsonrpc', 'send-error', {});
        assert.fail('Should have thrown error');
    } catch (error) {
        assert.strictEqual(error.code, -32000, 'Should have error code');
        assert.strictEqual(error.message, 'Custom error', 'Should have error message');
        assert.deepStrictEqual(error.data, { detail: 'Error details' }, 'Should have error data');
    }
    
    await runtime2.shutdown();
    console.log('✅ JSON-RPC error responses handled correctly\n');

    // Test 3: Timeout handling with proper cleanup
    console.log('▶ Test 3: Request timeout with proper cleanup');
    const runtime3 = new ExtensionRuntime({ responseTimeout: 1000 });
    
    await runtime3.startExtension('test-jsonrpc', testExtensionDir, validManifest);
    
    // Create an extension that doesn't respond
    const hangingExtensionDir = path.join(os.tmpdir(), 'ghost-test-hanging');
    if (!fs.existsSync(hangingExtensionDir)) {
        fs.mkdirSync(hangingExtensionDir, { recursive: true });
    }
    
    const hangingCode = `
const readline = require('readline');
const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: false });
rl.on('line', (line) => {
    const req = JSON.parse(line);
    if (req.method === 'init') {
        console.log(JSON.stringify({ jsonrpc: "2.0", id: req.id, result: {} }));
    }
    // Don't respond to other requests
});
`;
    fs.writeFileSync(path.join(hangingExtensionDir, 'extension.js'), hangingCode);
    
    const hangingManifest = {
        id: 'hanging-ext',
        name: 'Hanging Extension',
        version: '1.0.0',
        main: 'extension.js'
    };
    
    await runtime3.startExtension('hanging-ext', hangingExtensionDir, hangingManifest);
    
    try {
        await runtime3.callExtension('hanging-ext', 'hang', {});
        assert.fail('Should have timed out');
    } catch (error) {
        assert.ok(error.message.includes('timeout'), 'Should report timeout');
        assert.strictEqual(error.code, -32603, 'Should have Internal error code');
    }
    
    await runtime3.shutdown();
    
    // Cleanup
    try {
        fs.rmSync(hangingExtensionDir, { recursive: true, force: true });
    } catch (e) {}
    
    console.log('✅ Timeout handling with proper cleanup works\n');

    // Test 4: Method validation
    console.log('▶ Test 4: Method validation (reserved names)');
    const runtime4 = new ExtensionRuntime();
    
    await runtime4.startExtension('test-jsonrpc', testExtensionDir, validManifest);
    
    try {
        await runtime4.callExtension('test-jsonrpc', 'rpc.reserved', {});
        assert.fail('Should reject reserved method name');
    } catch (error) {
        assert.ok(error.message.includes('reserved'), 'Should report reserved method');
    }
    
    await runtime4.shutdown();
    console.log('✅ Reserved method names rejected\n');

    // Cleanup
    try {
        fs.rmSync(testExtensionDir, { recursive: true, force: true });
    } catch (e) {}

    console.log('🎉 All JSON-RPC validation tests passed!');
}

runTests().then(() => {
    process.exit(0);
}).catch((error) => {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
});
