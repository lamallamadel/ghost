const assert = require('assert');
const { 
    IOPipeline, 
    MessageInterceptor, 
    Intent, 
    IntentSchema,
    AuthorizationLayer,
    AuditLayer,
    ExecutionLayer,
    EntropyScanner
} = require('../core/pipeline');

console.log('🧪 Testing 4-Layer I/O Control Pipeline...\n');

console.log('▶ Test 1: Module imports');
assert.ok(IOPipeline, 'IOPipeline should be defined');
assert.ok(MessageInterceptor, 'MessageInterceptor should be defined');
assert.ok(Intent, 'Intent should be defined');
assert.ok(IntentSchema, 'IntentSchema should be defined');
assert.ok(AuthorizationLayer, 'AuthorizationLayer should be defined');
assert.ok(AuditLayer, 'AuditLayer should be defined');
assert.ok(ExecutionLayer, 'ExecutionLayer should be defined');
assert.ok(EntropyScanner, 'EntropyScanner should be defined');
console.log('✅ All modules imported successfully\n');

console.log('▶ Test 2: IntentSchema validation');
const validIntent = {
    type: 'filesystem',
    operation: 'read',
    params: { path: 'test.txt' },
    extensionId: 'test-ext'
};
const validation = IntentSchema.validate(validIntent);
assert.strictEqual(validation.valid, true, 'Valid intent should pass validation');
assert.strictEqual(validation.errors.length, 0, 'Valid intent should have no errors');
console.log('✅ Schema validation works correctly\n');

console.log('▶ Test 3: Intent immutability');
const interceptor = new MessageInterceptor();
const intent = interceptor.intercept(validIntent);
assert.ok(Object.isFrozen(intent), 'Intent should be frozen');
assert.ok(Object.isFrozen(intent.params), 'Intent params should be frozen');
console.log('✅ Intent objects are immutable\n');

console.log('▶ Test 4: Authorization layer');
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
const authResult = auth.authorize(intent);
if (!authResult.authorized) {
    console.log('  Authorization failed:', authResult.reason, authResult.code);
}
assert.strictEqual(authResult.authorized, true, 'Should authorize valid filesystem read');
console.log('✅ Authorization layer works correctly\n');

console.log('▶ Test 5: Entropy scanner');
const highEntropyString = 'AKIAIOSFODNN7EXAMPLE';
const scan = EntropyScanner.scanForSecrets(highEntropyString);
assert.strictEqual(scan.hasSecrets, true, 'Should detect AWS key pattern');
assert.ok(scan.findings.length > 0, 'Should have findings');
console.log('✅ Entropy scanner detects secrets\n');

console.log('▶ Test 6: Pipeline integration');
const pipeline = new IOPipeline();
pipeline.registerExtension('test-ext', manifest);
console.log('✅ Pipeline instantiation and registration works\n');

console.log('▶ Test 7: Invalid intent rejection');
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

console.log('▶ Test 8: Permission denial');
const unauthorizedIntent = interceptor.intercept({
    type: 'filesystem',
    operation: 'write',
    params: { path: 'test.txt', content: 'data' },
    extensionId: 'test-ext'
});
const denyResult = auth.authorize(unauthorizedIntent);
assert.strictEqual(denyResult.authorized, false, 'Should deny write without permission');
assert.strictEqual(denyResult.code, 'AUTH_PERMISSION_DENIED', 'Should have correct error code');
console.log('✅ Permission denial works correctly\n');

console.log('🎉 All pipeline tests passed!');
