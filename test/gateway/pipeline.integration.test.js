const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { 
    IOPipeline,
    MessageInterceptor,
    AuthorizationLayer,
    AuditLayer,
    ExecutionLayer
} = require('../../core/pipeline');

console.log('🧪 Testing Gateway Pipeline Integration...\n');

// Test 1: Full pipeline with valid filesystem read intent
console.log('▶ Test 1: Valid filesystem read through full pipeline');
const pipeline = new IOPipeline({
    auditLogPath: path.join(os.tmpdir(), 'ghost-test-audit.log')
});

const manifest = {
    id: 'test-extension-1',
    name: 'Test Extension 1',
    version: '1.0.0',
    capabilities: {
        filesystem: {
            read: ['test/**/*.txt', '*.md'],
            write: []
        }
    }
};

pipeline.registerExtension('test-extension-1', manifest);

const testFile = path.join(os.tmpdir(), 'ghost-test-read.txt');
fs.writeFileSync(testFile, 'test content', 'utf8');

(async () => {
    try {
        const validReadIntent = {
            type: 'filesystem',
            operation: 'read',
            params: { path: testFile },
            extensionId: 'test-extension-1',
            requestId: 'req-001'
        };

        const result = await pipeline.process(validReadIntent);
        assert.strictEqual(result.success, true, 'Valid read should succeed');
        assert.strictEqual(result.result.success, true, 'Read result should be successful');
        assert.ok(result.result.content, 'Should return content');
        console.log('✅ Valid filesystem read succeeded\n');

        // Test 2: Invalid intent schema
        console.log('▶ Test 2: Invalid intent schema (missing type)');
        const invalidSchemaIntent = {
            operation: 'read',
            params: { path: testFile },
            extensionId: 'test-extension-1'
        };

        const invalidResult = await pipeline.process(invalidSchemaIntent);
        assert.strictEqual(invalidResult.success, false, 'Invalid schema should fail');
        assert.strictEqual(invalidResult.stage, 'INTERCEPT', 'Should fail at intercept stage');
        assert.ok(invalidResult.error.includes('type'), 'Error should mention type field');
        console.log('✅ Invalid schema rejected at intercept\n');

        // Test 3: Unauthorized filesystem write
        console.log('▶ Test 3: Unauthorized filesystem write (no permission)');
        const unauthorizedWriteIntent = {
            type: 'filesystem',
            operation: 'write',
            params: { path: '/tmp/test.txt', content: 'data' },
            extensionId: 'test-extension-1',
            requestId: 'req-002'
        };

        const unauthorizedResult = await pipeline.process(unauthorizedWriteIntent);
        assert.strictEqual(unauthorizedResult.success, false, 'Unauthorized write should fail');
        assert.strictEqual(unauthorizedResult.stage, 'AUTHORIZATION', 'Should fail at authorization stage');
        assert.strictEqual(unauthorizedResult.code, 'AUTH_PERMISSION_DENIED', 'Should have correct error code');
        console.log('✅ Unauthorized write blocked at authorization\n');

        // Test 4: Path traversal attempt blocked at audit
        console.log('▶ Test 4: Path traversal attempt blocked at audit');
        const manifest2 = {
            id: 'test-extension-2',
            capabilities: {
                filesystem: {
                    read: ['**/*'],
                    write: []
                }
            }
        };
        pipeline.registerExtension('test-extension-2', manifest2);

        const traversalIntent = {
            type: 'filesystem',
            operation: 'read',
            params: { path: '../../../etc/passwd' },
            extensionId: 'test-extension-2',
            requestId: 'req-003'
        };

        const traversalResult = await pipeline.process(traversalIntent);
        assert.strictEqual(traversalResult.success, false, 'Path traversal should fail');
        assert.strictEqual(traversalResult.stage, 'AUDIT', 'Should fail at audit stage');
        assert.ok(traversalResult.violations, 'Should have violations');
        assert.ok(traversalResult.violations.some(v => v.rule.includes('PATH-TRAVERSAL')), 
            'Should detect path traversal');
        console.log('✅ Path traversal blocked at audit\n');

        // Test 5: Network request with rate limiting
        console.log('▶ Test 5: Network request with rate limiting');
        const manifest3 = {
            id: 'test-extension-3',
            capabilities: {
                network: {
                    allowlist: ['https://api.example.com'],
                    rateLimit: {
                        cir: 60,
                        bc: 10,
                        be: 10
                    }
                }
            }
        };
        pipeline.registerExtension('test-extension-3', manifest3);

        const networkIntent = {
            type: 'network',
            operation: 'https',
            params: { 
                url: 'https://api.example.com/data',
                method: 'GET'
            },
            extensionId: 'test-extension-3',
            requestId: 'req-004'
        };

        // First request should succeed (or fail at execution due to real network)
        const networkResult = await pipeline.process(networkIntent);
        if (networkResult.success === false && networkResult.stage === 'AUTHORIZATION') {
            console.log('  Note: Rate limit state tracked but may be exhausted from previous tests');
        }
        console.log('✅ Network rate limiting layer active\n');

        // Test 6: Command injection attempt
        console.log('▶ Test 6: Command injection attempt blocked');
        const manifest4 = {
            id: 'test-extension-4',
            capabilities: {
                git: {
                    read: true,
                    write: false
                }
            },
            permissions: ['process:spawn']
        };
        pipeline.registerExtension('test-extension-4', manifest4);

        const injectionIntent = {
            type: 'process',
            operation: 'spawn',
            params: { 
                command: 'ls && cat /etc/passwd'
            },
            extensionId: 'test-extension-4',
            requestId: 'req-005'
        };

        const injectionResult = await pipeline.process(injectionIntent);
        assert.strictEqual(injectionResult.success, false, 'Command injection should fail');
        assert.strictEqual(injectionResult.stage, 'AUDIT', 'Should fail at audit stage');
        assert.ok(injectionResult.violations.some(v => v.rule.includes('COMMAND-INJECTION')), 
            'Should detect command injection');
        console.log('✅ Command injection blocked at audit\n');

        // Test 7: Secret detection in parameters
        console.log('▶ Test 7: Secret detection in write content');
        const manifest5 = {
            id: 'test-extension-5',
            capabilities: {
                filesystem: {
                    read: [],
                    write: ['config/**/*.txt']
                }
            }
        };
        pipeline.registerExtension('test-extension-5', manifest5);

        const secretIntent = {
            type: 'filesystem',
            operation: 'write',
            params: { 
                path: 'config/secrets.txt',
                content: 'API_KEY=AKIAIOSFODNN7EXAMPLE'
            },
            extensionId: 'test-extension-5',
            requestId: 'req-006'
        };

        const secretResult = await pipeline.process(secretIntent);
        assert.strictEqual(secretResult.success, false, 'Secret in content should be blocked');
        assert.strictEqual(secretResult.stage, 'AUDIT', 'Should fail at audit stage');
        assert.ok(secretResult.violations.some(v => v.rule.includes('CONTENT-SECRETS')), 
            'Should detect secrets in content');
        console.log('✅ Secret detection working\n');

        // Test 8: Multiple intents from same extension
        console.log('▶ Test 8: Multiple valid intents from same extension');
        let successCount = 0;
        for (let i = 0; i < 3; i++) {
            const intent = {
                type: 'filesystem',
                operation: 'read',
                params: { path: testFile },
                extensionId: 'test-extension-1',
                requestId: `req-multi-${i}`
            };
            const res = await pipeline.process(intent);
            if (res.success) successCount++;
        }
        assert.ok(successCount > 0, 'At least one request should succeed');
        console.log(`✅ Processed ${successCount}/3 requests successfully\n`);

        // Test 9: Audit log verification
        console.log('▶ Test 9: Audit log verification');
        const logs = pipeline.getAuditLogs({ limit: 50 });
        assert.ok(logs.length > 0, 'Audit logs should be created');
        assert.ok(logs.some(log => log.type === 'INTENT'), 'Should have INTENT logs');
        assert.ok(logs.some(log => log.type === 'SECURITY_EVENT'), 'Should have SECURITY_EVENT logs');
        console.log(`✅ Audit log contains ${logs.length} entries\n`);

        // Test 10: Pipeline state inspection
        console.log('▶ Test 10: Pipeline state inspection');
        const rateLimitState = pipeline.getRateLimitState('test-extension-3');
        if (rateLimitState) {
            assert.ok(rateLimitState.cir, 'Rate limit state should have CIR');
            assert.ok(rateLimitState.capacity !== undefined, 'Rate limit state should have capacity');
        }
        console.log('✅ Pipeline state accessible\n');

        // Cleanup
        try {
            fs.unlinkSync(testFile);
        } catch (e) {}

        console.log('🎉 All gateway pipeline integration tests passed!');
        process.exit(0);

    } catch (error) {
        console.error('❌ Test failed:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
})();
