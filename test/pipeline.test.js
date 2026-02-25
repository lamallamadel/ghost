const assert = require('assert');
const { Readable } = require('stream');
const { 
    IOPipeline, 
    MessageInterceptor, 
    Intent, 
    IntentSchema,
    AuthorizationLayer,
    AuditLayer,
    ExecutionLayer
} = require('../core/pipeline');
const { EntropyValidator } = require('../core/validators');

console.log('🧪 Testing 4-Layer I/O Control Pipeline...\n');

console.log('▶ Test 1: Module imports');
assert.ok(IOPipeline, 'IOPipeline should be defined');
assert.ok(MessageInterceptor, 'MessageInterceptor should be defined');
assert.ok(Intent, 'Intent should be defined');
assert.ok(IntentSchema, 'IntentSchema should be defined');
assert.ok(AuthorizationLayer, 'AuthorizationLayer should be defined');
assert.ok(AuditLayer, 'AuditLayer should be defined');
assert.ok(ExecutionLayer, 'ExecutionLayer should be defined');
assert.ok(EntropyValidator, 'EntropyValidator should be defined');
console.log('✅ All modules imported successfully\n');

console.log('▶ Test 2: JSON-RPC 2.0 compliance validation');
const interceptor = new MessageInterceptor();

const validJsonRpc = {
    jsonrpc: '2.0',
    id: 'test-123',
    method: 'filesystem.read',
    params: {
        type: 'filesystem',
        operation: 'read',
        params: { path: 'test.txt' },
        extensionId: 'test-ext'
    }
};

try {
    interceptor.deserialize(validJsonRpc);
    console.log('  ✓ Valid JSON-RPC 2.0 message accepted');
} catch (error) {
    assert.fail(`Valid JSON-RPC should be accepted: ${error.message}`);
}

try {
    interceptor.deserialize({ method: 'test', params: {} });
    assert.fail('Should reject message without jsonrpc field');
} catch (error) {
    assert.ok(error.message.includes('jsonrpc'), 'Should validate jsonrpc field');
    console.log('  ✓ Rejects missing jsonrpc field');
}

try {
    interceptor.deserialize({ jsonrpc: '1.0', id: '1', method: 'test', params: {} });
    assert.fail('Should reject jsonrpc version other than 2.0');
} catch (error) {
    assert.ok(error.message.includes('2.0'), 'Should require jsonrpc 2.0');
    console.log('  ✓ Rejects non-2.0 jsonrpc version');
}

try {
    interceptor.deserialize({ jsonrpc: '2.0', method: 'test', params: {} });
    assert.fail('Should reject message without id field');
} catch (error) {
    assert.ok(error.message.includes('id'), 'Should validate id field');
    console.log('  ✓ Rejects missing id field');
}

try {
    interceptor.deserialize({ jsonrpc: '2.0', id: {}, method: 'test', params: {} });
    assert.fail('Should reject invalid id type');
} catch (error) {
    assert.ok(error.message.includes('id'), 'Should validate id type');
    console.log('  ✓ Rejects invalid id type');
}

try {
    interceptor.deserialize({ jsonrpc: '2.0', id: '1', params: {} });
    assert.fail('Should reject message without method field');
} catch (error) {
    assert.ok(error.message.includes('method'), 'Should validate method field');
    console.log('  ✓ Rejects missing method field');
}

try {
    interceptor.deserialize({ jsonrpc: '2.0', id: '1', method: '', params: {} });
    assert.fail('Should reject empty method string');
} catch (error) {
    assert.ok(error.message.includes('method'), 'Should validate method is non-empty');
    console.log('  ✓ Rejects empty method field');
}

try {
    interceptor.deserialize({ jsonrpc: '2.0', id: '1', method: 'test', params: null });
    assert.fail('Should reject null params');
} catch (error) {
    assert.ok(error.message.includes('params'), 'Should validate params type');
    console.log('  ✓ Rejects null params');
}

console.log('✅ JSON-RPC 2.0 compliance validation works correctly\n');

console.log('▶ Test 3: IntentSchema validation with detailed error messages');
const validIntent = {
    type: 'filesystem',
    operation: 'read',
    params: { path: 'test.txt' },
    extensionId: 'test-ext'
};
const validation = IntentSchema.validate(validIntent);
assert.strictEqual(validation.valid, true, 'Valid intent should pass validation');
assert.strictEqual(validation.errors.length, 0, 'Valid intent should have no errors');
console.log('  ✓ Valid filesystem intent passes');

const invalidTypeIntent = {
    type: 'invalid_type',
    operation: 'read',
    params: { path: 'test.txt' },
    extensionId: 'test-ext'
};
const typeValidation = IntentSchema.validate(invalidTypeIntent);
assert.strictEqual(typeValidation.valid, false, 'Invalid type should fail');
assert.ok(typeValidation.errors.some(e => e.includes('Invalid type')), 'Should have type error message');
console.log('  ✓ Invalid type rejected with proper error');

const invalidOperationIntent = {
    type: 'filesystem',
    operation: 'invalid_op',
    params: { path: 'test.txt' },
    extensionId: 'test-ext'
};
const opValidation = IntentSchema.validate(invalidOperationIntent);
assert.strictEqual(opValidation.valid, false, 'Invalid operation should fail');
assert.ok(opValidation.errors.some(e => e.includes('Invalid operation')), 'Should have operation error');
console.log('  ✓ Invalid operation rejected with proper error');

const missingParamsIntent = {
    type: 'filesystem',
    operation: 'read',
    params: null,
    extensionId: 'test-ext'
};
const paramsValidation = IntentSchema.validate(missingParamsIntent);
assert.strictEqual(paramsValidation.valid, false, 'Null params should fail');
assert.ok(paramsValidation.errors.some(e => e.includes('params')), 'Should have params error');
console.log('  ✓ Null params rejected with proper error');

console.log('✅ Schema validation with detailed error messages works correctly\n');

console.log('▶ Test 4: Comprehensive IntentSchema validation for all types');

const filesystemWriteIntent = {
    type: 'filesystem',
    operation: 'write',
    params: { path: 'output.txt', content: 'data' },
    extensionId: 'test-ext'
};
assert.strictEqual(IntentSchema.validate(filesystemWriteIntent).valid, true, 'Filesystem write should be valid');
console.log('  ✓ Filesystem write intent validated');

const filesystemWriteInvalid = {
    type: 'filesystem',
    operation: 'write',
    params: { path: 'output.txt' },
    extensionId: 'test-ext'
};
const writeValidation = IntentSchema.validate(filesystemWriteInvalid);
assert.strictEqual(writeValidation.valid, false, 'Write without content should fail');
assert.ok(writeValidation.errors.some(e => e.includes('content')), 'Should require content for write');
console.log('  ✓ Filesystem write without content rejected');

const networkIntent = {
    type: 'network',
    operation: 'https',
    params: { url: 'https://api.example.com', method: 'GET' },
    extensionId: 'test-ext'
};
assert.strictEqual(IntentSchema.validate(networkIntent).valid, true, 'Network intent should be valid');
console.log('  ✓ Network intent validated');

const networkInvalidUrl = {
    type: 'network',
    operation: 'https',
    params: { url: 'not-a-url' },
    extensionId: 'test-ext'
};
const urlValidation = IntentSchema.validate(networkInvalidUrl);
assert.strictEqual(urlValidation.valid, false, 'Invalid URL should fail');
assert.ok(urlValidation.errors.some(e => e.includes('Invalid URL')), 'Should have URL error');
console.log('  ✓ Network intent with invalid URL rejected');

const networkInvalidMethod = {
    type: 'network',
    operation: 'https',
    params: { url: 'https://api.example.com', method: 'INVALID' },
    extensionId: 'test-ext'
};
const methodValidation = IntentSchema.validate(networkInvalidMethod);
assert.strictEqual(methodValidation.valid, false, 'Invalid HTTP method should fail');
assert.ok(methodValidation.errors.some(e => e.includes('Invalid HTTP method')), 'Should have method error');
console.log('  ✓ Network intent with invalid HTTP method rejected');

const gitIntent = {
    type: 'git',
    operation: 'status',
    params: { args: ['--short'] },
    extensionId: 'test-ext'
};
assert.strictEqual(IntentSchema.validate(gitIntent).valid, true, 'Git intent should be valid');
console.log('  ✓ Git intent validated');

const gitInvalidArgs = {
    type: 'git',
    operation: 'status',
    params: { args: 'not-an-array' },
    extensionId: 'test-ext'
};
const gitValidation = IntentSchema.validate(gitInvalidArgs);
assert.strictEqual(gitValidation.valid, false, 'Git args must be array');
assert.ok(gitValidation.errors.some(e => e.includes('args')), 'Should have args error');
console.log('  ✓ Git intent with invalid args rejected');

const processIntent = {
    type: 'process',
    operation: 'spawn',
    params: { command: 'npm', args: ['test'] },
    extensionId: 'test-ext'
};
assert.strictEqual(IntentSchema.validate(processIntent).valid, true, 'Process intent should be valid');
console.log('  ✓ Process intent validated');

const processInvalidCommand = {
    type: 'process',
    operation: 'spawn',
    params: { args: ['test'] },
    extensionId: 'test-ext'
};
const processValidation = IntentSchema.validate(processInvalidCommand);
assert.strictEqual(processValidation.valid, false, 'Process must have command');
assert.ok(processValidation.errors.some(e => e.includes('command')), 'Should have command error');
console.log('  ✓ Process intent without command rejected');

console.log('✅ Comprehensive IntentSchema validation for all types works correctly\n');

console.log('▶ Test 5: Intent deep immutability');
const nestedParams = {
    jsonrpc: '2.0',
    id: 'test-456',
    method: 'filesystem.read',
    params: {
        type: 'filesystem',
        operation: 'read',
        params: { 
            path: 'test.txt',
            options: {
                encoding: 'utf8',
                nested: {
                    deep: 'value',
                    array: [1, 2, { x: 3 }]
                }
            }
        },
        extensionId: 'test-ext'
    }
};
const deepIntent = interceptor.intercept(nestedParams);
assert.ok(Object.isFrozen(deepIntent), 'Intent should be frozen');
assert.ok(Object.isFrozen(deepIntent.params), 'Intent params should be frozen');
assert.ok(Object.isFrozen(deepIntent.params.options), 'Nested params should be frozen');
assert.ok(Object.isFrozen(deepIntent.params.options.nested), 'Deep nested params should be frozen');
assert.ok(Object.isFrozen(deepIntent.params.options.nested.array), 'Arrays in params should be frozen');
assert.ok(Object.isFrozen(deepIntent.params.options.nested.array[2]), 'Objects in arrays should be frozen');
console.log('✅ Intent objects are deeply immutable\n');

console.log('▶ Test 6: Stdio stream processing');
const streamInterceptor = new MessageInterceptor();
const intents = [];
const errors = [];

const testStream = new Readable({
    read() {}
});

streamInterceptor.processStream(
    testStream,
    (intent) => intents.push(intent),
    (error) => errors.push(error)
);

testStream.push('{"jsonrpc":"2.0","id":"1","method":"test","params":{"type":"filesystem","operation":"read","params":{"path":"file1.txt"},"extensionId":"stream-ext"}}\n');
testStream.push('{"jsonrpc":"2.0","id":"2","method":"test","params":{"type":"filesystem","operation":"read","params":{"path":"file2.txt"},"extensionId":"stream-ext"}}\n');
testStream.push(null);

setTimeout(() => {
    assert.strictEqual(intents.length, 2, 'Should process 2 intents from stream');
    assert.strictEqual(intents[0].params.path, 'file1.txt', 'First intent should have correct path');
    assert.strictEqual(intents[1].params.path, 'file2.txt', 'Second intent should have correct path');
    console.log('  ✓ Processes multiple newline-delimited JSON messages');
    
    const partialInterceptor = new MessageInterceptor();
    const partialIntents = [];
    const partialStream = new Readable({ read() {} });
    
    partialInterceptor.processStream(
        partialStream,
        (intent) => partialIntents.push(intent),
        (error) => {}
    );
    
    partialStream.push('{"jsonrpc":"2.0","id":"3","method":"test",');
    partialStream.push('"params":{"type":"git","operation":"status",');
    partialStream.push('"params":{},"extensionId":"partial-ext"}}\n');
    partialStream.push(null);
    
    setTimeout(() => {
        assert.strictEqual(partialIntents.length, 1, 'Should handle partial messages across chunks');
        assert.strictEqual(partialIntents[0].type, 'git', 'Should correctly parse partial message');
        console.log('  ✓ Handles partial messages across chunks');
        
        const errorInterceptor = new MessageInterceptor();
        const errorIntents = [];
        const streamErrors = [];
        const errorStream = new Readable({ read() {} });
        
        errorInterceptor.processStream(
            errorStream,
            (intent) => errorIntents.push(intent),
            (error) => streamErrors.push(error)
        );
        
        errorStream.push('{"jsonrpc":"2.0","id":"4","method":"test","params":{"type":"filesystem","operation":"read","params":{"path":"valid.txt"},"extensionId":"error-ext"}}\n');
        errorStream.push('{"invalid json\n');
        errorStream.push('{"jsonrpc":"2.0","id":"5","method":"test","params":{"type":"filesystem","operation":"read","params":{"path":"after-error.txt"},"extensionId":"error-ext"}}\n');
        errorStream.push(null);
        
        setTimeout(() => {
            assert.strictEqual(errorIntents.length, 2, 'Should continue after error');
            assert.strictEqual(streamErrors.length, 1, 'Should capture stream errors');
            assert.ok(streamErrors[0].message.includes('JSON-RPC'), 'Error should mention JSON-RPC');
            console.log('  ✓ Continues processing after errors');
            
            const endInterceptor = new MessageInterceptor();
            const endIntents = [];
            const endStream = new Readable({ read() {} });
            
            endInterceptor.processStream(
                endStream,
                (intent) => endIntents.push(intent),
                (error) => {}
            );
            
            endStream.push('{"jsonrpc":"2.0","id":"6","method":"test","params":{"type":"filesystem","operation":"read","params":{"path":"no-newline.txt"},"extensionId":"end-ext"}}');
            endStream.push(null);
            
            setTimeout(() => {
                assert.strictEqual(endIntents.length, 1, 'Should process message without trailing newline');
                assert.strictEqual(endIntents[0].params.path, 'no-newline.txt', 'Should parse message at end correctly');
                console.log('  ✓ Processes final message without trailing newline');
                
                const emptyInterceptor = new MessageInterceptor();
                const emptyIntents = [];
                const emptyStream = new Readable({ read() {} });
                
                emptyInterceptor.processStream(
                    emptyStream,
                    (intent) => emptyIntents.push(intent),
                    (error) => {}
                );
                
                emptyStream.push('\n\n');
                emptyStream.push('{"jsonrpc":"2.0","id":"7","method":"test","params":{"type":"filesystem","operation":"read","params":{"path":"after-empty.txt"},"extensionId":"empty-ext"}}\n');
                emptyStream.push('\n');
                emptyStream.push(null);
                
                setTimeout(() => {
                    assert.strictEqual(emptyIntents.length, 1, 'Should skip empty lines');
                    console.log('  ✓ Skips empty lines in stream');
                    
                    try {
                        streamInterceptor.processStream('not-a-stream', () => {}, () => {});
                        assert.fail('Should reject non-stream input');
                    } catch (error) {
                        assert.ok(error.message.includes('Readable stream'), 'Should validate stream type');
                        console.log('  ✓ Rejects non-Readable stream input');
                    }
                    
                    console.log('✅ Stdio stream processing works correctly\n');
                    
                    continueTests();
                }, 50);
            }, 50);
        }, 50);
    }, 50);
}, 50);

function continueTests() {
    console.log('▶ Test 7: Authorization layer');
    const simpleIntent = interceptor.intercept({
        jsonrpc: '2.0',
        id: 'auth-test',
        method: 'filesystem.read',
        params: {
            type: 'filesystem',
            operation: 'read',
            params: { path: 'test.txt' },
            extensionId: 'test-ext'
        }
    });
    
    const auth = new AuthorizationLayer();
    const manifest = {
        id: 'test-ext',
        capabilities: {
            filesystem: {
                read: ['test.txt']
            }
        },
        permissions: ['filesystem:read']
    };
    auth.registerExtension('test-ext', manifest);
    const authResult = auth.authorize(simpleIntent);
    if (!authResult.authorized) {
        console.log('  Authorization failed:', authResult.reason, authResult.code);
    }
    assert.strictEqual(authResult.authorized, true, 'Should authorize valid filesystem read');
    console.log('✅ Authorization layer works correctly\n');

    console.log('▶ Test 8: Entropy scanner');
    const highEntropyString = 'AKIA1234567890ABCDEF';
    const entropyValidator = new EntropyValidator();
    const scan = entropyValidator.scanContent(highEntropyString);
    assert.strictEqual(scan.hasSecrets, true, 'Should detect AWS key pattern');
    assert.ok(scan.secrets.length > 0, 'Should have secrets');
    console.log('✅ Entropy scanner detects secrets\n');

    console.log('▶ Test 9: Pipeline integration');
    const pipeline = new IOPipeline();
    pipeline.registerExtension('test-ext', manifest);
    console.log('✅ Pipeline instantiation and registration works\n');

    console.log('▶ Test 10: Invalid intent rejection');
    const invalidIntent = {
        type: 'invalid_type',
        operation: 'read',
        params: { path: 'test.txt' },
        extensionId: 'test-ext'
    };
    const invalidValidation = IntentSchema.validate(invalidIntent);
    assert.strictEqual(invalidValidation.valid, false, 'Invalid intent should fail validation');
    assert.ok(invalidValidation.errors.length > 0, 'Invalid intent should have errors');
    console.log('✅ Invalid intents are properly rejected\n');

    console.log('▶ Test 11: Permission denial');
    const unauthorizedIntent = interceptor.intercept({
        jsonrpc: '2.0',
        id: 'deny-test',
        method: 'filesystem.write',
        params: {
            type: 'filesystem',
            operation: 'write',
            params: { path: 'test.txt', content: 'data' },
            extensionId: 'test-ext'
        }
    });
    const denyResult = auth.authorize(unauthorizedIntent);
    assert.strictEqual(denyResult.authorized, false, 'Should deny write without permission');
    assert.strictEqual(denyResult.code, 'AUTH_PERMISSION_DENIED', 'Should have correct error code');
    console.log('✅ Permission denial works correctly\n');

    console.log('🎉 All pipeline tests passed!');
}
