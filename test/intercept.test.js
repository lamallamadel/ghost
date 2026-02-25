const assert = require('assert');
const { Readable } = require('stream');
const { MessageInterceptor, Intent, IntentSchema } = require('../core/pipeline/intercept');

console.log('🧪 Testing Enhanced Intercept Layer...\n');

console.log('▶ Test 1: JSON-RPC 2.0 Strict Compliance');
const interceptor = new MessageInterceptor();

console.log('  Testing jsonrpc field validation...');
try {
    interceptor.deserialize({ id: '1', method: 'test', params: {} });
    assert.fail('Should reject missing jsonrpc field');
} catch (error) {
    assert.ok(error.message.includes('jsonrpc'), 'Should mention jsonrpc field');
}

try {
    interceptor.deserialize({ jsonrpc: '1.0', id: '1', method: 'test' });
    assert.fail('Should reject wrong jsonrpc version');
} catch (error) {
    assert.ok(error.message.includes('2.0'), 'Should require version 2.0');
}

try {
    interceptor.deserialize({ jsonrpc: 2.0, id: '1', method: 'test' });
    assert.fail('Should reject non-string jsonrpc');
} catch (error) {
    assert.ok(error.message.includes('2.0'), 'Should validate jsonrpc format');
}

console.log('  Testing id field validation...');
try {
    interceptor.deserialize({ jsonrpc: '2.0', method: 'test' });
    assert.fail('Should reject missing id');
} catch (error) {
    assert.ok(error.message.includes('id'), 'Should mention id field');
}

try {
    interceptor.deserialize({ jsonrpc: '2.0', id: [], method: 'test' });
    assert.fail('Should reject invalid id type');
} catch (error) {
    assert.ok(error.message.includes('id'), 'Should validate id type');
}

try {
    interceptor.deserialize({ jsonrpc: '2.0', id: {}, method: 'test' });
    assert.fail('Should reject object id');
} catch (error) {
    assert.ok(error.message.includes('id'), 'Should reject non-primitive id');
}

const validIds = ['string-id', 123, null];
for (const id of validIds) {
    const msg = { jsonrpc: '2.0', id, method: 'test', params: {} };
    try {
        interceptor.deserialize(msg);
    } catch (e) {
    }
}

console.log('  Testing method field validation...');
try {
    interceptor.deserialize({ jsonrpc: '2.0', id: '1', params: {} });
    assert.fail('Should reject missing method');
} catch (error) {
    assert.ok(error.message.includes('method'), 'Should mention method field');
}

try {
    interceptor.deserialize({ jsonrpc: '2.0', id: '1', method: '', params: {} });
    assert.fail('Should reject empty method');
} catch (error) {
    assert.ok(error.message.includes('method'), 'Should validate method is non-empty');
}

try {
    interceptor.deserialize({ jsonrpc: '2.0', id: '1', method: 123, params: {} });
    assert.fail('Should reject non-string method');
} catch (error) {
    assert.ok(error.message.includes('method'), 'Should validate method type');
}

console.log('  Testing params field validation...');
try {
    interceptor.deserialize({ jsonrpc: '2.0', id: '1', method: 'test', params: null });
    assert.fail('Should reject null params');
} catch (error) {
    assert.ok(error.message.includes('params'), 'Should validate params');
}

try {
    interceptor.deserialize({ jsonrpc: '2.0', id: '1', method: 'test', params: 'string' });
    assert.fail('Should reject non-object params');
} catch (error) {
    assert.ok(error.message.includes('params'), 'Should validate params type');
}

interceptor.deserialize({ jsonrpc: '2.0', id: '1', method: 'test', params: {} });
interceptor.deserialize({ jsonrpc: '2.0', id: '1', method: 'test', params: [] });
interceptor.deserialize({ jsonrpc: '2.0', id: '1', method: 'test' });

console.log('✅ JSON-RPC 2.0 strict compliance validation passed\n');

console.log('▶ Test 2: Deep Immutability of Intent Objects');

const complexIntent = {
    jsonrpc: '2.0',
    id: 'complex-123',
    method: 'filesystem.read',
    params: {
        type: 'filesystem',
        operation: 'read',
        params: {
            path: '/test/file.txt',
            options: {
                encoding: 'utf8',
                flag: 'r',
                nested: {
                    level1: {
                        level2: {
                            level3: 'deep value',
                            array: [1, 2, { x: 3, y: [4, 5] }]
                        }
                    }
                }
            }
        },
        extensionId: 'test-ext'
    }
};

const intent = interceptor.intercept(complexIntent);

assert.ok(Object.isFrozen(intent), 'Intent root should be frozen');
assert.ok(Object.isFrozen(intent.params), 'Level 1 params should be frozen');
assert.ok(Object.isFrozen(intent.params.options), 'Level 2 options should be frozen');
assert.ok(Object.isFrozen(intent.params.options.nested), 'Level 3 nested should be frozen');
assert.ok(Object.isFrozen(intent.params.options.nested.level1), 'Level 4 should be frozen');
assert.ok(Object.isFrozen(intent.params.options.nested.level1.level2), 'Level 5 should be frozen');
assert.ok(Object.isFrozen(intent.params.options.nested.level1.level2.level3), 'Deep string should be frozen (immutable)');
assert.ok(Object.isFrozen(intent.params.options.nested.level1.level2.array), 'Arrays should be frozen');
assert.ok(Object.isFrozen(intent.params.options.nested.level1.level2.array[2]), 'Objects in arrays should be frozen');
assert.ok(Object.isFrozen(intent.params.options.nested.level1.level2.array[2].y), 'Nested arrays in objects should be frozen');

try {
    intent.type = 'modified';
    assert.fail('Should not allow modification of frozen intent');
} catch (error) {
}

try {
    intent.params.path = 'modified';
    assert.fail('Should not allow modification of frozen params');
} catch (error) {
}

try {
    intent.params.options.encoding = 'modified';
    assert.fail('Should not allow modification of deeply nested properties');
} catch (error) {
}

console.log('✅ Deep immutability verification passed\n');

console.log('▶ Test 3: Comprehensive IntentSchema Validation');

console.log('  Testing filesystem intents...');
assert.ok(IntentSchema.validate({
    type: 'filesystem',
    operation: 'read',
    params: { path: '/file.txt' },
    extensionId: 'ext'
}).valid, 'Valid filesystem read should pass');

assert.ok(IntentSchema.validate({
    type: 'filesystem',
    operation: 'write',
    params: { path: '/file.txt', content: 'data' },
    extensionId: 'ext'
}).valid, 'Valid filesystem write should pass');

assert.ok(IntentSchema.validate({
    type: 'filesystem',
    operation: 'mkdir',
    params: { path: '/dir', recursive: true },
    extensionId: 'ext'
}).valid, 'Valid mkdir with recursive should pass');

let result = IntentSchema.validate({
    type: 'filesystem',
    operation: 'read',
    params: {},
    extensionId: 'ext'
});
assert.ok(!result.valid, 'Filesystem without path should fail');
assert.ok(result.errors.some(e => e.includes('path')), 'Should mention path');

result = IntentSchema.validate({
    type: 'filesystem',
    operation: 'write',
    params: { path: '/file.txt' },
    extensionId: 'ext'
});
assert.ok(!result.valid, 'Write without content should fail');
assert.ok(result.errors.some(e => e.includes('content')), 'Should mention content');

result = IntentSchema.validate({
    type: 'filesystem',
    operation: 'mkdir',
    params: { path: '/dir', recursive: 'yes' },
    extensionId: 'ext'
});
assert.ok(!result.valid, 'Invalid recursive type should fail');
assert.ok(result.errors.some(e => e.includes('recursive')), 'Should mention recursive');

console.log('  Testing network intents...');
assert.ok(IntentSchema.validate({
    type: 'network',
    operation: 'https',
    params: { url: 'https://api.example.com' },
    extensionId: 'ext'
}).valid, 'Valid network request should pass');

assert.ok(IntentSchema.validate({
    type: 'network',
    operation: 'https',
    params: { 
        url: 'https://api.example.com',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{"key":"value"}'
    },
    extensionId: 'ext'
}).valid, 'Valid POST request should pass');

result = IntentSchema.validate({
    type: 'network',
    operation: 'https',
    params: {},
    extensionId: 'ext'
});
assert.ok(!result.valid, 'Network without url should fail');
assert.ok(result.errors.some(e => e.includes('url')), 'Should mention url');

result = IntentSchema.validate({
    type: 'network',
    operation: 'https',
    params: { url: 'not-a-valid-url' },
    extensionId: 'ext'
});
assert.ok(!result.valid, 'Invalid URL should fail');
assert.ok(result.errors.some(e => e.includes('Invalid URL')), 'Should mention invalid URL');

result = IntentSchema.validate({
    type: 'network',
    operation: 'https',
    params: { url: 'https://api.example.com', method: 'INVALID' },
    extensionId: 'ext'
});
assert.ok(!result.valid, 'Invalid HTTP method should fail');
assert.ok(result.errors.some(e => e.includes('Invalid HTTP method')), 'Should mention invalid method');

result = IntentSchema.validate({
    type: 'network',
    operation: 'https',
    params: { url: 'https://api.example.com', headers: [] },
    extensionId: 'ext'
});
assert.ok(!result.valid, 'Headers as array should fail');
assert.ok(result.errors.some(e => e.includes('headers')), 'Should mention headers');

result = IntentSchema.validate({
    type: 'network',
    operation: 'https',
    params: { url: 'https://api.example.com', body: {} },
    extensionId: 'ext'
});
assert.ok(!result.valid, 'Body as object should fail');
assert.ok(result.errors.some(e => e.includes('body')), 'Should mention body');

console.log('  Testing git intents...');
assert.ok(IntentSchema.validate({
    type: 'git',
    operation: 'status',
    params: {},
    extensionId: 'ext'
}).valid, 'Valid git status should pass');

assert.ok(IntentSchema.validate({
    type: 'git',
    operation: 'log',
    params: { args: ['--oneline', '-10'] },
    extensionId: 'ext'
}).valid, 'Valid git log with args should pass');

result = IntentSchema.validate({
    type: 'git',
    operation: 'status',
    params: { args: 'not-an-array' },
    extensionId: 'ext'
});
assert.ok(!result.valid, 'Non-array args should fail');
assert.ok(result.errors.some(e => e.includes('args')), 'Should mention args');

result = IntentSchema.validate({
    type: 'git',
    operation: 'log',
    params: { args: ['--oneline', 123] },
    extensionId: 'ext'
});
assert.ok(!result.valid, 'Non-string in args should fail');
assert.ok(result.errors.some(e => e.includes('args')), 'Should mention args element type');

console.log('  Testing process intents...');
assert.ok(IntentSchema.validate({
    type: 'process',
    operation: 'spawn',
    params: { command: 'npm' },
    extensionId: 'ext'
}).valid, 'Valid process spawn should pass');

assert.ok(IntentSchema.validate({
    type: 'process',
    operation: 'exec',
    params: { command: 'npm', args: ['test'] },
    extensionId: 'ext'
}).valid, 'Valid process with args should pass');

result = IntentSchema.validate({
    type: 'process',
    operation: 'spawn',
    params: {},
    extensionId: 'ext'
});
assert.ok(!result.valid, 'Process without command should fail');
assert.ok(result.errors.some(e => e.includes('command')), 'Should mention command');

result = IntentSchema.validate({
    type: 'process',
    operation: 'spawn',
    params: { command: 'npm', args: 'not-an-array' },
    extensionId: 'ext'
});
assert.ok(!result.valid, 'Non-array args should fail');
assert.ok(result.errors.some(e => e.includes('args')), 'Should mention args');

result = IntentSchema.validate({
    type: 'process',
    operation: 'spawn',
    params: { command: 'npm', args: ['test', 123] },
    extensionId: 'ext'
});
assert.ok(!result.valid, 'Non-string in args should fail');
assert.ok(result.errors.some(e => e.includes('args')), 'Should mention args element type');

console.log('  Testing invalid types and operations...');
result = IntentSchema.validate({
    type: 'invalid_type',
    operation: 'read',
    params: {},
    extensionId: 'ext'
});
assert.ok(!result.valid, 'Invalid type should fail');
assert.ok(result.errors.some(e => e.includes('Invalid type')), 'Should mention invalid type');

result = IntentSchema.validate({
    type: 'filesystem',
    operation: 'invalid_operation',
    params: { path: '/file.txt' },
    extensionId: 'ext'
});
assert.ok(!result.valid, 'Invalid operation should fail');
assert.ok(result.errors.some(e => e.includes('Invalid operation')), 'Should mention invalid operation');

result = IntentSchema.validate({
    operation: 'read',
    params: {},
    extensionId: 'ext'
});
assert.ok(!result.valid, 'Missing type should fail');
assert.ok(result.errors.some(e => e.includes('type')), 'Should mention missing type');

result = IntentSchema.validate({
    type: 'filesystem',
    params: {},
    extensionId: 'ext'
});
assert.ok(!result.valid, 'Missing operation should fail');
assert.ok(result.errors.some(e => e.includes('operation')), 'Should mention missing operation');

result = IntentSchema.validate({
    type: 'filesystem',
    operation: 'read',
    extensionId: 'ext'
});
assert.ok(!result.valid, 'Missing params should fail');
assert.ok(result.errors.some(e => e.includes('params')), 'Should mention missing params');

result = IntentSchema.validate({
    type: 'filesystem',
    operation: 'read',
    params: { path: '/file.txt' }
});
assert.ok(!result.valid, 'Missing extensionId should fail');
assert.ok(result.errors.some(e => e.includes('extensionId')), 'Should mention missing extensionId');

console.log('✅ Comprehensive IntentSchema validation passed\n');

console.log('▶ Test 4: Stdio Stream Processing');

console.log('  Testing multiple newline-delimited messages...');
let streamInterceptor = new MessageInterceptor();
let intents = [];
let errors = [];
let stream = new Readable({ read() {} });

streamInterceptor.processStream(
    stream,
    (intent) => intents.push(intent),
    (error) => errors.push(error)
);

stream.push('{"jsonrpc":"2.0","id":"1","method":"test","params":{"type":"filesystem","operation":"read","params":{"path":"file1.txt"},"extensionId":"ext"}}\n');
stream.push('{"jsonrpc":"2.0","id":"2","method":"test","params":{"type":"filesystem","operation":"read","params":{"path":"file2.txt"},"extensionId":"ext"}}\n');
stream.push('{"jsonrpc":"2.0","id":"3","method":"test","params":{"type":"filesystem","operation":"read","params":{"path":"file3.txt"},"extensionId":"ext"}}\n');
stream.push(null);

setTimeout(() => {
    assert.strictEqual(intents.length, 3, 'Should process all 3 messages');
    assert.strictEqual(intents[0].params.path, 'file1.txt');
    assert.strictEqual(intents[1].params.path, 'file2.txt');
    assert.strictEqual(intents[2].params.path, 'file3.txt');
    
    console.log('  Testing partial message buffering...');
    streamInterceptor = new MessageInterceptor();
    intents = [];
    stream = new Readable({ read() {} });
    
    streamInterceptor.processStream(
        stream,
        (intent) => intents.push(intent),
        (error) => {}
    );
    
    stream.push('{"jsonrpc":"2.0"');
    stream.push(',"id":"4","method"');
    stream.push(':"test","params":{"type":"git"');
    stream.push(',"operation":"status","params"');
    stream.push(':{},"extensionId":"ext"}}\n');
    stream.push(null);
    
    setTimeout(() => {
        assert.strictEqual(intents.length, 1, 'Should handle fragmented JSON');
        assert.strictEqual(intents[0].type, 'git');
        
        console.log('  Testing error handling and recovery...');
        streamInterceptor = new MessageInterceptor();
        intents = [];
        errors = [];
        stream = new Readable({ read() {} });
        
        streamInterceptor.processStream(
            stream,
            (intent) => intents.push(intent),
            (error) => errors.push(error)
        );
        
        stream.push('{"jsonrpc":"2.0","id":"5","method":"test","params":{"type":"filesystem","operation":"read","params":{"path":"before-error.txt"},"extensionId":"ext"}}\n');
        stream.push('{"invalid json syntax\n');
        stream.push('{"missing fields":"data"}\n');
        stream.push('{"jsonrpc":"2.0","id":"6","method":"test","params":{"type":"filesystem","operation":"read","params":{"path":"after-errors.txt"},"extensionId":"ext"}}\n');
        stream.push(null);
        
        setTimeout(() => {
            assert.strictEqual(intents.length, 2, 'Should process valid messages around errors');
            assert.ok(errors.length >= 2, 'Should capture multiple errors');
            assert.strictEqual(intents[0].params.path, 'before-error.txt');
            assert.strictEqual(intents[1].params.path, 'after-errors.txt');
            
            console.log('  Testing final message without newline...');
            streamInterceptor = new MessageInterceptor();
            intents = [];
            stream = new Readable({ read() {} });
            
            streamInterceptor.processStream(
                stream,
                (intent) => intents.push(intent),
                (error) => {}
            );
            
            stream.push('{"jsonrpc":"2.0","id":"7","method":"test","params":{"type":"filesystem","operation":"read","params":{"path":"no-newline.txt"},"extensionId":"ext"}}');
            stream.push(null);
            
            setTimeout(() => {
                assert.strictEqual(intents.length, 1, 'Should process final message without newline');
                assert.strictEqual(intents[0].params.path, 'no-newline.txt');
                
                console.log('  Testing empty line skipping...');
                streamInterceptor = new MessageInterceptor();
                intents = [];
                stream = new Readable({ read() {} });
                
                streamInterceptor.processStream(
                    stream,
                    (intent) => intents.push(intent),
                    (error) => {}
                );
                
                stream.push('\n\n\n');
                stream.push('{"jsonrpc":"2.0","id":"8","method":"test","params":{"type":"filesystem","operation":"read","params":{"path":"after-empty.txt"},"extensionId":"ext"}}\n');
                stream.push('\n\n');
                stream.push('{"jsonrpc":"2.0","id":"9","method":"test","params":{"type":"filesystem","operation":"read","params":{"path":"final.txt"},"extensionId":"ext"}}\n');
                stream.push(null);
                
                setTimeout(() => {
                    assert.strictEqual(intents.length, 2, 'Should skip empty lines');
                    
                    console.log('  Testing stream error events...');
                    streamInterceptor = new MessageInterceptor();
                    errors = [];
                    stream = new Readable({ read() {} });
                    
                    streamInterceptor.processStream(
                        stream,
                        (intent) => {},
                        (error) => errors.push(error)
                    );
                    
                    stream.emit('error', new Error('Stream error'));
                    
                    setTimeout(() => {
                        assert.ok(errors.length > 0, 'Should capture stream errors');
                        assert.ok(errors[0].message.includes('Stream error'), 'Should propagate stream error message');
                        
                        console.log('  Testing non-stream input rejection...');
                        try {
                            streamInterceptor.processStream('not-a-stream', () => {}, () => {});
                            assert.fail('Should reject non-stream input');
                        } catch (error) {
                            assert.ok(error.message.includes('Readable stream'), 'Should validate stream type');
                        }
                        
                        try {
                            streamInterceptor.processStream({}, () => {}, () => {});
                            assert.fail('Should reject object as stream');
                        } catch (error) {
                            assert.ok(error.message.includes('Readable stream'), 'Should validate stream type');
                        }
                        
                        console.log('✅ Stdio stream processing passed\n');
                        console.log('🎉 All enhanced intercept tests passed!');
                    }, 10);
                }, 10);
            }, 10);
        }, 10);
    }, 10);
}, 10);
