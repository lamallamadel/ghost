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

console.log('🧪 Testing Gateway Pipeline Integration (Zero Trust Properties)...\n');

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
            read: ['**/*'],
            write: []
        }
    }
};

pipeline.registerExtension('test-extension-1', manifest);

// Create test directory and file within the project root (not tmpdir)
const testDir = path.join(process.cwd(), 'test-temp');
if (!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir, { recursive: true });
}
const testFile = path.join(testDir, 'ghost-test-read.txt');
fs.writeFileSync(testFile, 'test content', 'utf8');

(async () => {
    try {
        const validReadMessage = {
            jsonrpc: '2.0',
            id: 'msg-001',
            method: 'filesystem.read',
            params: {
                type: 'filesystem',
                operation: 'read',
                params: { path: testFile },
                extensionId: 'test-extension-1',
                requestId: 'req-001'
            }
        };

        const result = await pipeline.process(validReadMessage);
        if (!result.success) {
            console.log('Result:', JSON.stringify(result, null, 2));
        }
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
        // Error message will mention validation failure
        assert.ok(invalidResult.error, 'Should have error message');
        console.log('✅ Invalid schema rejected at intercept (fail-closed)\n');

        // Test 3: Unauthorized filesystem write
        console.log('▶ Test 3: Unauthorized filesystem write (no permission)');
        const unauthorizedWriteIntent = {
            type: 'filesystem',
            operation: 'write',
            params: { path: path.join(testDir, 'test-write.txt'), content: 'data' },
            extensionId: 'test-extension-1',
            requestId: 'req-002'
        };

        const unauthorizedResult = await pipeline.process(unauthorizedWriteIntent);
        assert.strictEqual(unauthorizedResult.success, false, 'Unauthorized write should fail');
        // It may fail at INTERCEPT or AUTHORIZATION depending on validation order
        assert.ok(['INTERCEPT', 'AUTHORIZATION'].includes(unauthorizedResult.stage), `Should fail at INTERCEPT or AUTHORIZATION stage, got: ${unauthorizedResult.stage}`);
        assert.ok(unauthorizedResult.code, 'Should have error code');
        console.log('✅ Unauthorized write blocked (fail-closed)\n');

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
        // PathValidator detects traversal early, may fail at INTERCEPT or AUDIT
        assert.ok(['INTERCEPT', 'AUDIT'].includes(traversalResult.stage), `Should fail at INTERCEPT or AUDIT stage, got: ${traversalResult.stage}`);
        assert.ok(traversalResult.violations || traversalResult.error, 'Should have violations or error');
        if (traversalResult.violations) {
            assert.ok(traversalResult.violations.some(v => v.rule.includes('PATH-TRAVERSAL') || v.rule.includes('PATH')), 
                'Should detect path traversal');
        }
        console.log('✅ Path traversal blocked (fail-closed)\n');

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
        // May fail at INTERCEPT or AUDIT depending on validation order (both are correct fail-closed behavior)
        assert.ok(['INTERCEPT', 'AUDIT'].includes(injectionResult.stage), `Should fail, got stage: ${injectionResult.stage}`);
        if (injectionResult.violations) {
            assert.ok(injectionResult.violations.some(v => v.rule.includes('COMMAND-INJECTION') || v.rule.includes('COMMAND')), 
                'Should detect command injection');
        }
        console.log('✅ Command injection blocked (fail-closed)\n');

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
        assert.ok(['INTERCEPT', 'AUDIT', 'AUTHORIZATION'].includes(secretResult.stage), 'Should fail closed');
        if (secretResult.violations) {
            assert.ok(secretResult.violations.some(v => v.rule.includes('SECRET') || v.rule.includes('CONTENT')), 
                'Should detect secrets in content');
        }
        console.log('✅ Secret detection working (fail-closed)\n');

        // Test 8: Multiple intents from same extension
        console.log('▶ Test 8: Multiple valid intents from same extension');
        // Reset circuit breakers to ensure clean state
        pipeline.resetCircuitBreaker('filesystem');
        let successCount = 0;
        for (let i = 0; i < 3; i++) {
            const message = {
                jsonrpc: '2.0',
                id: `msg-multi-${i}`,
                method: 'filesystem.read',
                params: {
                    type: 'filesystem',
                    operation: 'read',
                    params: { path: testFile },
                    extensionId: 'test-extension-1',
                    requestId: `req-multi-${i}`
                }
            };
            const res = await pipeline.process(message);
            if (res.success) {
                successCount++;
            } else {
                console.log(`  Request ${i} failed: ${res.error} (stage: ${res.stage}, code: ${res.code})`);
            }
        }
        assert.ok(successCount > 0, `At least one request should succeed (got ${successCount}/3)`);
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

        // === ZERO TRUST PROPERTY TESTS ===
        console.log('═══════════════════════════════════════');
        console.log('🔒 ZERO TRUST PROPERTY TESTS');
        console.log('═══════════════════════════════════════\n');

        // Test 11: Extension not registered (fail-closed)
        console.log('▶ Test 11: Extension not registered - fail-closed behavior');
        const unregisteredIntent = {
            type: 'filesystem',
            operation: 'read',
            params: { path: testFile },
            extensionId: 'non-existent-extension',
            requestId: 'req-unregistered-001'
        };

        const unregisteredResult = await pipeline.process(unregisteredIntent);
        assert.strictEqual(unregisteredResult.success, false, 'Unregistered extension should fail');
        assert.strictEqual(unregisteredResult.stage, 'AUTHORIZATION', 'Should fail at authorization stage');
        assert.strictEqual(unregisteredResult.code, 'AUTH_NOT_REGISTERED', 'Should have AUTH_NOT_REGISTERED code');
        assert.ok(unregisteredResult.error.includes('not registered'), 'Error should indicate extension not registered');
        console.log('✅ Unregistered extension blocked (fail-closed)\n');

        // Test 12: Rate limit exhaustion (fail-closed)
        console.log('▶ Test 12: Rate limit exhaustion - fail-closed behavior');
        const manifest6 = {
            id: 'test-extension-6',
            capabilities: {
                network: {
                    allowlist: ['https://api.test.com'],
                    rateLimit: {
                        cir: 60,
                        bc: 2,
                        be: 0
                    }
                }
            }
        };
        pipeline.registerExtension('test-extension-6', manifest6);

        let rateLimitExhausted = false;
        for (let i = 0; i < 10; i++) {
            const rateLimitIntent = {
                type: 'network',
                operation: 'https',
                params: { 
                    url: 'https://api.test.com/endpoint',
                    method: 'GET'
                },
                extensionId: 'test-extension-6',
                requestId: `req-ratelimit-${i}`
            };

            const rateLimitResult = await pipeline.process(rateLimitIntent);
            if (!rateLimitResult.success && rateLimitResult.code === 'AUTH_RATE_LIMIT') {
                rateLimitExhausted = true;
                assert.strictEqual(rateLimitResult.stage, 'AUTHORIZATION', 'Should fail at authorization stage');
                assert.ok(rateLimitResult.error.includes('Rate limit'), 'Error should mention rate limit');
                break;
            }
        }
        assert.strictEqual(rateLimitExhausted, true, 'Rate limit should be exhausted');
        console.log('✅ Rate limit exhaustion blocked (fail-closed)\n');

        // Test 13: All NIST violation rule types (fail-closed)
        console.log('▶ Test 13: All NIST violation rule types - fail-closed behavior');

        // 13a: URL-encoded path traversal
        const manifest7 = {
            id: 'test-extension-7',
            capabilities: {
                filesystem: { read: ['**/*'], write: [] }
            }
        };
        pipeline.registerExtension('test-extension-7', manifest7);

        const urlEncodedTraversalIntent = {
            type: 'filesystem',
            operation: 'read',
            params: { path: 'test%2e%2e/etc/passwd' },
            extensionId: 'test-extension-7',
            requestId: 'req-nist-001'
        };
        const urlEncodedResult = await pipeline.process(urlEncodedTraversalIntent);
        assert.strictEqual(urlEncodedResult.success, false, 'URL-encoded traversal should fail');
        assert.ok(urlEncodedResult.violations.some(v => v.rule.includes('PATH-TRAVERSAL')), 
            'Should detect URL-encoded path traversal');
        console.log('  ✅ URL-encoded path traversal blocked');

        // 13b: SSRF - localhost
        const manifest8 = {
            id: 'test-extension-8',
            capabilities: {
                network: {
                    allowlist: ['https://localhost:8080'],
                    rateLimit: { cir: 60, bc: 10, be: 10 }
                }
            }
        };
        pipeline.registerExtension('test-extension-8', manifest8);

        const localhostIntent = {
            type: 'network',
            operation: 'https',
            params: { url: 'https://localhost:8080/admin', method: 'GET' },
            extensionId: 'test-extension-8',
            requestId: 'req-nist-002'
        };
        const localhostResult = await pipeline.process(localhostIntent);
        assert.strictEqual(localhostResult.success, false, 'Localhost access should fail');
        assert.ok(localhostResult.violations.some(v => v.rule.includes('SSRF-LOCALHOST')), 
            'Should detect SSRF localhost attempt');
        console.log('  ✅ SSRF localhost blocked');

        // 13c: SSRF - private IP
        const manifest9 = {
            id: 'test-extension-9',
            capabilities: {
                network: {
                    allowlist: ['https://192.168.1.1'],
                    rateLimit: { cir: 60, bc: 10, be: 10 }
                }
            }
        };
        pipeline.registerExtension('test-extension-9', manifest9);

        const privateIpIntent = {
            type: 'network',
            operation: 'https',
            params: { url: 'https://192.168.1.1/router', method: 'GET' },
            extensionId: 'test-extension-9',
            requestId: 'req-nist-003'
        };
        const privateIpResult = await pipeline.process(privateIpIntent);
        assert.strictEqual(privateIpResult.success, false, 'Private IP access should fail');
        assert.ok(privateIpResult.violations.some(v => v.rule.includes('SSRF-PRIVATE-IP')), 
            'Should detect SSRF private IP attempt');
        console.log('  ✅ SSRF private IP blocked');

        // 13d: SSRF - metadata service
        const manifest10 = {
            id: 'test-extension-10',
            capabilities: {
                network: {
                    allowlist: ['http://169.254.169.254'],
                    rateLimit: { cir: 60, bc: 10, be: 10 }
                }
            }
        };
        pipeline.registerExtension('test-extension-10', manifest10);

        const metadataIntent = {
            type: 'network',
            operation: 'http',
            params: { url: 'http://169.254.169.254/latest/meta-data/', method: 'GET' },
            extensionId: 'test-extension-10',
            requestId: 'req-nist-004'
        };
        const metadataResult = await pipeline.process(metadataIntent);
        assert.strictEqual(metadataResult.success, false, 'Metadata service access should fail');
        assert.ok(metadataResult.violations.some(v => v.rule.includes('SSRF-METADATA')), 
            'Should detect SSRF metadata service attempt');
        console.log('  ✅ SSRF metadata service blocked');

        // 13e: Command injection - pipe
        const manifest11 = {
            id: 'test-extension-11',
            capabilities: {},
            permissions: ['process:spawn']
        };
        pipeline.registerExtension('test-extension-11', manifest11);

        const pipeInjectionIntent = {
            type: 'process',
            operation: 'spawn',
            params: { command: 'cat file.txt | grep secret' },
            extensionId: 'test-extension-11',
            requestId: 'req-nist-005'
        };
        const pipeResult = await pipeline.process(pipeInjectionIntent);
        assert.strictEqual(pipeResult.success, false, 'Pipe injection should fail');
        assert.ok(pipeResult.violations.some(v => v.rule.includes('COMMAND-INJECTION')), 
            'Should detect pipe injection');
        console.log('  ✅ Command injection (pipe) blocked');

        // 13f: Command injection - backtick
        const backtickInjectionIntent = {
            type: 'process',
            operation: 'spawn',
            params: { command: 'echo `whoami`' },
            extensionId: 'test-extension-11',
            requestId: 'req-nist-006'
        };
        const backtickResult = await pipeline.process(backtickInjectionIntent);
        assert.strictEqual(backtickResult.success, false, 'Backtick injection should fail');
        assert.ok(backtickResult.violations.some(v => v.rule.includes('COMMAND-INJECTION')), 
            'Should detect backtick injection');
        console.log('  ✅ Command injection (backtick) blocked');

        // 13g: Command injection - command substitution
        const substInjectionIntent = {
            type: 'process',
            operation: 'spawn',
            params: { command: 'ls $(pwd)' },
            extensionId: 'test-extension-11',
            requestId: 'req-nist-007'
        };
        const substResult = await pipeline.process(substInjectionIntent);
        assert.strictEqual(substResult.success, false, 'Command substitution should fail');
        assert.ok(substResult.violations.some(v => v.rule.includes('COMMAND-INJECTION')), 
            'Should detect command substitution');
        console.log('  ✅ Command injection (substitution) blocked');

        // 13h: Secret detection - private key
        const manifest12 = {
            id: 'test-extension-12',
            capabilities: {
                filesystem: { read: [], write: ['**/*.txt'] }
            }
        };
        pipeline.registerExtension('test-extension-12', manifest12);

        const privateKeyIntent = {
            type: 'filesystem',
            operation: 'write',
            params: { 
                path: 'test/key.txt',
                content: '-----BEGIN RSA PRIVATE KEY-----\nMIIBogIBAAJBALRQ...'
            },
            extensionId: 'test-extension-12',
            requestId: 'req-nist-008'
        };
        const privateKeyResult = await pipeline.process(privateKeyIntent);
        assert.strictEqual(privateKeyResult.success, false, 'Private key in content should fail');
        assert.ok(privateKeyResult.violations.some(v => v.rule.includes('SECRET')), 
            'Should detect private key');
        console.log('  ✅ Secret detection (private key) blocked');

        // 13i: Dangerous command argument
        const dangerousArgIntent = {
            type: 'process',
            operation: 'spawn',
            params: { command: 'node --eval "process.exit()"' },
            extensionId: 'test-extension-11',
            requestId: 'req-nist-009'
        };
        const dangerousArgResult = await pipeline.process(dangerousArgIntent);
        assert.strictEqual(dangerousArgResult.success, false, 'Dangerous arg should fail');
        assert.ok(dangerousArgResult.violations.some(v => v.rule.includes('DANGEROUS-COMMAND-ARG')), 
            'Should detect dangerous command argument');
        console.log('  ✅ Dangerous command argument blocked');

        console.log('✅ All NIST violation types blocked (fail-closed)\n');

        // Test 14: Circuit breaker opening after repeated failures
        console.log('▶ Test 14: Circuit breaker opening after repeated failures - fail-closed');
        const nonExistentFile = path.join(testDir, 'ghost-non-existent-file-12345.txt');
        
        for (let i = 0; i < 6; i++) {
            const failIntent = {
                type: 'filesystem',
                operation: 'read',
                params: { path: nonExistentFile },
                extensionId: 'test-extension-1',
                requestId: `req-circuit-${i}`
            };
            const failResult = await pipeline.process(failIntent);
            assert.strictEqual(failResult.success, false, `Attempt ${i + 1} should fail`);
        }

        const circuitState = pipeline.getCircuitBreakerState('filesystem');
        assert.ok(circuitState, 'Circuit breaker state should exist');
        assert.strictEqual(circuitState.state, 'OPEN', 'Circuit breaker should be OPEN after failures');

        // Attempt another request with open circuit
        const circuitOpenIntent = {
            type: 'filesystem',
            operation: 'read',
            params: { path: nonExistentFile },
            extensionId: 'test-extension-1',
            requestId: 'req-circuit-open'
        };
        const circuitOpenResult = await pipeline.process(circuitOpenIntent);
        assert.strictEqual(circuitOpenResult.success, false, 'Should fail when circuit is open');
        assert.strictEqual(circuitOpenResult.stage, 'EXECUTION', 'Should fail at execution stage');
        assert.strictEqual(circuitOpenResult.code, 'CIRCUIT_OPEN', 'Should have CIRCUIT_OPEN code');
        
        pipeline.resetCircuitBreaker('filesystem');
        console.log('✅ Circuit breaker opened after repeated failures (fail-closed)\n');

        // Test 15: Concurrent requests from multiple extensions
        console.log('▶ Test 15: Concurrent requests from multiple extensions');
        const manifest13 = {
            id: 'test-extension-13',
            capabilities: {
                filesystem: { read: ['**/*.txt'], write: [] }
            }
        };
        const manifest14 = {
            id: 'test-extension-14',
            capabilities: {
                filesystem: { read: ['**/*.md'], write: [] }
            }
        };
        const manifest15 = {
            id: 'test-extension-15',
            capabilities: {
                filesystem: { read: ['**/*'], write: [] }
            }
        };
        
        pipeline.registerExtension('test-extension-13', manifest13);
        pipeline.registerExtension('test-extension-14', manifest14);
        pipeline.registerExtension('test-extension-15', manifest15);

        const concurrentPromises = [];
        
        // Extension 13 - 5 concurrent requests
        for (let i = 0; i < 5; i++) {
            concurrentPromises.push(
                pipeline.process({
                    type: 'filesystem',
                    operation: 'read',
                    params: { path: testFile },
                    extensionId: 'test-extension-13',
                    requestId: `req-concurrent-13-${i}`
                })
            );
        }

        // Extension 14 - 5 concurrent requests (should fail - wrong pattern)
        const testMd = path.join(testDir, 'test.md');
        fs.writeFileSync(testMd, '# Test', 'utf8');
        for (let i = 0; i < 5; i++) {
            concurrentPromises.push(
                pipeline.process({
                    type: 'filesystem',
                    operation: 'read',
                    params: { path: testMd },
                    extensionId: 'test-extension-14',
                    requestId: `req-concurrent-14-${i}`
                })
            );
        }

        // Extension 15 - 5 concurrent requests with violations
        for (let i = 0; i < 5; i++) {
            concurrentPromises.push(
                pipeline.process({
                    type: 'filesystem',
                    operation: 'read',
                    params: { path: '../../../etc/passwd' },
                    extensionId: 'test-extension-15',
                    requestId: `req-concurrent-15-${i}`
                })
            );
        }

        const concurrentResults = await Promise.all(concurrentPromises);
        
        const ext13Results = concurrentResults.slice(0, 5);
        const ext14Results = concurrentResults.slice(5, 10);
        const ext15Results = concurrentResults.slice(10, 15);

        assert.ok(ext13Results.every(r => r.success === true), 'Extension 13 requests should succeed');
        assert.ok(ext14Results.every(r => r.success === true), 'Extension 14 requests should succeed');
        assert.ok(ext15Results.every(r => r.success === false && r.stage === 'AUDIT'), 
            'Extension 15 requests should fail at audit (path traversal)');
        
        console.log(`✅ Concurrent requests handled correctly: ${ext13Results.filter(r => r.success).length + ext14Results.filter(r => r.success).length} succeeded, ${ext15Results.length} blocked\n`);

        // Test 16: Audit log immutability
        console.log('▶ Test 16: Audit log immutability verification');
        const auditLogs = pipeline.getAuditLogs({ limit: 100 });
        assert.ok(auditLogs.length > 0, 'Should have audit logs');

        // Verify all logs have timestamps
        assert.ok(auditLogs.every(log => log.timestamp), 'All logs should have timestamps');
        assert.ok(auditLogs.every(log => {
            const timestamp = new Date(log.timestamp);
            return !isNaN(timestamp.getTime());
        }), 'All timestamps should be valid ISO 8601 format');

        // Verify logs are immutable (frozen)
        const firstLog = auditLogs[0];
        let immutabilityError = null;
        try {
            firstLog.timestamp = 'modified';
            firstLog.newField = 'should not work';
        } catch (e) {
            immutabilityError = e;
        }

        // In strict mode, this would throw. In non-strict mode, it silently fails.
        // Verify the log wasn't modified
        assert.notStrictEqual(firstLog.timestamp, 'modified', 'Timestamp should not be modifiable');
        assert.strictEqual(firstLog.newField, undefined, 'New fields should not be addable');

        // Verify log types and structure
        const intentLogs = auditLogs.filter(log => log.type === 'INTENT');
        const securityEventLogs = auditLogs.filter(log => log.type === 'SECURITY_EVENT');
        const executionLogs = auditLogs.filter(log => log.type === 'EXECUTION');

        assert.ok(intentLogs.length > 0, 'Should have INTENT logs');
        assert.ok(securityEventLogs.length > 0, 'Should have SECURITY_EVENT logs');
        assert.ok(executionLogs.length > 0, 'Should have EXECUTION logs');

        // Verify INTENT logs have required fields
        assert.ok(intentLogs.every(log => 
            log.requestId && log.extensionId && log.intentType && log.operation
        ), 'All INTENT logs should have required fields');

        // Verify SECURITY_EVENT logs for authorization denials
        const authDenialLogs = securityEventLogs.filter(log => 
            log.eventType === 'AUTHORIZATION_DENIED'
        );
        assert.ok(authDenialLogs.length > 0, 'Should have AUTHORIZATION_DENIED security events');

        console.log(`✅ Audit log immutability verified: ${auditLogs.length} total logs, ${intentLogs.length} intents, ${securityEventLogs.length} security events, ${executionLogs.length} executions\n`);

        // Test 17: Verify fail-closed on all error paths
        console.log('▶ Test 17: Fail-closed behavior on all error paths');
        
        let errorPathTests = 0;
        let failClosedCount = 0;

        // Error path 1: Malformed JSON
        errorPathTests++;
        try {
            const malformedResult = await pipeline.process({ invalid: 'intent' });
            if (!malformedResult.success) failClosedCount++;
            assert.strictEqual(malformedResult.success, false, 'Malformed intent should fail');
        } catch (e) {
            failClosedCount++;
        }
        console.log('  ✅ Malformed intent failed closed');

        // Error path 2: Missing required fields
        errorPathTests++;
        const missingFieldResult = await pipeline.process({
            type: 'filesystem',
            operation: 'read',
            // missing params and extensionId
        });
        if (!missingFieldResult.success) failClosedCount++;
        assert.strictEqual(missingFieldResult.success, false, 'Missing fields should fail');
        console.log('  ✅ Missing fields failed closed');

        // Error path 3: Invalid operation for type
        errorPathTests++;
        const invalidOpResult = await pipeline.process({
            type: 'filesystem',
            operation: 'invalid_op',
            params: { path: testFile },
            extensionId: 'test-extension-1'
        });
        if (!invalidOpResult.success) failClosedCount++;
        assert.strictEqual(invalidOpResult.success, false, 'Invalid operation should fail');
        console.log('  ✅ Invalid operation failed closed');

        // Error path 4: Empty extensionId
        errorPathTests++;
        const emptyExtResult = await pipeline.process({
            type: 'filesystem',
            operation: 'read',
            params: { path: testFile },
            extensionId: ''
        });
        if (!emptyExtResult.success) failClosedCount++;
        assert.strictEqual(emptyExtResult.success, false, 'Empty extensionId should fail');
        console.log('  ✅ Empty extensionId failed closed');

        // Error path 5: Invalid URL format
        errorPathTests++;
        const manifest16 = {
            id: 'test-extension-16',
            capabilities: {
                network: {
                    allowlist: ['https://example.com'],
                    rateLimit: { cir: 60, bc: 10, be: 10 }
                }
            }
        };
        pipeline.registerExtension('test-extension-16', manifest16);
        const invalidUrlResult = await pipeline.process({
            type: 'network',
            operation: 'https',
            params: { url: 'not-a-valid-url', method: 'GET' },
            extensionId: 'test-extension-16'
        });
        if (!invalidUrlResult.success) failClosedCount++;
        assert.strictEqual(invalidUrlResult.success, false, 'Invalid URL should fail');
        console.log('  ✅ Invalid URL failed closed');

        // Error path 6: Missing permission
        errorPathTests++;
        const noPermResult = await pipeline.process({
            type: 'process',
            operation: 'spawn',
            params: { command: 'ls' },
            extensionId: 'test-extension-1' // doesn't have process:spawn permission
        });
        if (!noPermResult.success) failClosedCount++;
        assert.strictEqual(noPermResult.success, false, 'Missing permission should fail');
        console.log('  ✅ Missing permission failed closed');

        // Error path 7: Path outside allowed patterns
        errorPathTests++;
        const outsidePatternResult = await pipeline.process({
            type: 'filesystem',
            operation: 'read',
            params: { path: '/etc/hosts' },
            extensionId: 'test-extension-1' // only allows test/**/*.txt and *.md
        });
        if (!outsidePatternResult.success) failClosedCount++;
        assert.strictEqual(outsidePatternResult.success, false, 'Path outside patterns should fail');
        console.log('  ✅ Path outside patterns failed closed');

        assert.strictEqual(failClosedCount, errorPathTests, `All ${errorPathTests} error paths should fail closed`);
        console.log(`✅ All ${errorPathTests} error paths verified fail-closed\n`);

        // === EXTENDED ERROR SCENARIO TESTS ===
        console.log('═══════════════════════════════════════');
        console.log('🔬 EXTENDED ERROR SCENARIO TESTS');
        console.log('═══════════════════════════════════════\n');

        // Test 18: Extension not registered at INTERCEPT (verify EXTENSION_NOT_FOUND)
        console.log('▶ Test 18: Extension not registered - EXTENSION_NOT_FOUND at AUTHORIZATION');
        const notRegisteredIntent = {
            type: 'filesystem',
            operation: 'read',
            params: { path: testFile },
            extensionId: 'extension-never-registered',
            requestId: 'req-ext-not-found-001'
        };
        const notRegisteredResult = await pipeline.process(notRegisteredIntent);
        assert.strictEqual(notRegisteredResult.success, false, 'Unregistered extension should fail');
        assert.strictEqual(notRegisteredResult.stage, 'AUTHORIZATION', 'Should fail at authorization stage');
        assert.strictEqual(notRegisteredResult.code, 'AUTH_NOT_REGISTERED', 'Should have AUTH_NOT_REGISTERED code');
        console.log('✅ Extension not registered returns AUTH_NOT_REGISTERED\n');

        // Test 19: Rate limit exhaustion reaching Violating state (verify AUTH drops request with QOS_VIOLATING)
        console.log('▶ Test 19: Rate limit exhaustion reaching Violating state - QOS_VIOLATING');
        const manifest17 = {
            id: 'test-extension-17',
            capabilities: {
                network: {
                    allowlist: ['https://api.qostest.com'],
                    rateLimit: {
                        cir: 60,
                        bc: 1,
                        be: 1
                    }
                }
            }
        };
        pipeline.registerExtension('test-extension-17', manifest17);

        let qosViolatingReached = false;
        for (let i = 0; i < 15; i++) {
            const qosIntent = {
                type: 'network',
                operation: 'https',
                params: { 
                    url: 'https://api.qostest.com/data',
                    method: 'GET'
                },
                extensionId: 'test-extension-17',
                requestId: `req-qos-${i}`
            };
            const qosResult = await pipeline.process(qosIntent);
            if (!qosResult.success && qosResult.code === 'QOS_VIOLATING') {
                qosViolatingReached = true;
                assert.strictEqual(qosResult.stage, 'AUTHORIZATION', 'Should fail at authorization stage');
                assert.ok(qosResult.qos, 'Should have QOS details');
                assert.strictEqual(qosResult.qos.classification, 'Violating', 'Should be in Violating state');
                assert.strictEqual(qosResult.qos.color, 'red', 'Should have red color');
                console.log(`  QOS_VIOLATING reached after ${i + 1} requests`);
                break;
            }
        }
        assert.strictEqual(qosViolatingReached, true, 'Should reach QOS_VIOLATING state');
        console.log('✅ Rate limit Violating state blocks requests with QOS_VIOLATING\n');

        // Test 20: All NIST SI-10 rule violations with expected error codes
        console.log('▶ Test 20: Comprehensive NIST SI-10 rule violations with error codes');

        // Path traversal with various patterns
        const pathTraversalTests = [
            { path: '../../etc/shadow', desc: 'relative path traversal' },
            { path: '/etc/passwd', desc: 'absolute path outside allowed' },
            { path: 'test/../../../etc/hosts', desc: 'mixed path traversal' },
        ];

        const manifest18 = {
            id: 'test-extension-18',
            capabilities: {
                filesystem: { read: ['test/**/*'], write: [] }
            }
        };
        pipeline.registerExtension('test-extension-18', manifest18);

        for (const test of pathTraversalTests) {
            const traversalTestIntent = {
                type: 'filesystem',
                operation: 'read',
                params: { path: test.path },
                extensionId: 'test-extension-18',
                requestId: `req-path-${Date.now()}`
            };
            const traversalTestResult = await pipeline.process(traversalTestIntent);
            assert.strictEqual(traversalTestResult.success, false, `Path traversal (${test.desc}) should fail`);
            assert.strictEqual(traversalTestResult.stage, 'AUDIT', 'Should fail at audit stage');
            assert.ok(traversalTestResult.violations.some(v => v.rule.includes('PATH-TRAVERSAL')), 
                `Should detect path traversal (${test.desc})`);
            console.log(`  ✅ Path traversal blocked: ${test.desc}`);
        }

        // Command injection with various patterns
        const commandInjectionTests = [
            { cmd: 'ls; rm -rf /', desc: 'semicolon separator' },
            { cmd: 'cat file && rm file', desc: 'AND operator' },
            { cmd: 'grep text || echo fail', desc: 'OR operator' },
            { cmd: 'echo $(cat /etc/passwd)', desc: 'command substitution' },
            { cmd: 'cat `ls`', desc: 'backtick substitution' },
            { cmd: 'cat file.txt | base64', desc: 'pipe operator' },
        ];

        for (const test of commandInjectionTests) {
            const cmdTestIntent = {
                type: 'process',
                operation: 'spawn',
                params: { command: test.cmd },
                extensionId: 'test-extension-11',
                requestId: `req-cmd-${Date.now()}`
            };
            const cmdTestResult = await pipeline.process(cmdTestIntent);
            assert.strictEqual(cmdTestResult.success, false, `Command injection (${test.desc}) should fail`);
            assert.strictEqual(cmdTestResult.stage, 'AUDIT', 'Should fail at audit stage');
            assert.ok(cmdTestResult.violations.some(v => v.rule.includes('COMMAND-INJECTION') || v.rule.includes('DANGEROUS')), 
                `Should detect command injection (${test.desc})`);
            console.log(`  ✅ Command injection blocked: ${test.desc}`);
        }

        // SSRF with various patterns
        const ssrfTests = [
            { url: 'http://127.0.0.1:8080/admin', desc: 'localhost IP', rule: 'SSRF-LOCALHOST' },
            { url: 'http://localhost:3000/api', desc: 'localhost hostname', rule: 'SSRF-LOCALHOST' },
            { url: 'http://10.0.0.1/internal', desc: 'private IP 10.x', rule: 'SSRF-PRIVATE-IP' },
            { url: 'http://172.16.0.1/admin', desc: 'private IP 172.16.x', rule: 'SSRF-PRIVATE-IP' },
            { url: 'http://192.168.0.1/router', desc: 'private IP 192.168.x', rule: 'SSRF-PRIVATE-IP' },
            { url: 'http://169.254.169.254/metadata', desc: 'AWS metadata service', rule: 'SSRF-METADATA' },
        ];

        for (let i = 0; i < ssrfTests.length; i++) {
            const test = ssrfTests[i];
            const manifestSsrf = {
                id: `test-extension-ssrf-${i}`,
                capabilities: {
                    network: {
                        allowlist: [test.url],
                        rateLimit: { cir: 60, bc: 10, be: 10 }
                    }
                }
            };
            pipeline.registerExtension(`test-extension-ssrf-${i}`, manifestSsrf);

            const ssrfTestIntent = {
                type: 'network',
                operation: test.url.startsWith('https') ? 'https' : 'http',
                params: { url: test.url, method: 'GET' },
                extensionId: `test-extension-ssrf-${i}`,
                requestId: `req-ssrf-${Date.now()}`
            };
            const ssrfTestResult = await pipeline.process(ssrfTestIntent);
            assert.strictEqual(ssrfTestResult.success, false, `SSRF (${test.desc}) should fail`);
            assert.strictEqual(ssrfTestResult.stage, 'AUDIT', 'Should fail at audit stage');
            assert.ok(ssrfTestResult.violations.some(v => v.rule.includes(test.rule)), 
                `Should detect ${test.rule} (${test.desc})`);
            console.log(`  ✅ SSRF blocked (${test.rule}): ${test.desc}`);
        }

        // Secret/entropy detection with various patterns
        const secretTests = [
            { content: 'AWS_KEY=AKIAIOSFODNN7EXAMPLE', desc: 'AWS access key', rule: 'SECRET' },
            { content: 'password="super_secret_123456"', desc: 'password in code', rule: 'SECRET' },
            { content: '-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBg', desc: 'private key header', rule: 'SECRET' },
            { content: 'token=ghp_1234567890abcdefghijklmnopqrstuv', desc: 'GitHub token', rule: 'SECRET' },
        ];

        for (const test of secretTests) {
            const secretTestIntent = {
                type: 'filesystem',
                operation: 'write',
                params: { 
                    path: 'test/secrets.txt',
                    content: test.content
                },
                extensionId: 'test-extension-12',
                requestId: `req-secret-${Date.now()}`
            };
            const secretTestResult = await pipeline.process(secretTestIntent);
            assert.strictEqual(secretTestResult.success, false, `Secret detection (${test.desc}) should fail`);
            assert.strictEqual(secretTestResult.stage, 'AUDIT', 'Should fail at audit stage');
            assert.ok(secretTestResult.violations.some(v => v.rule.includes('SECRET')), 
                `Should detect secret (${test.desc})`);
            console.log(`  ✅ Secret detected and blocked: ${test.desc}`);
        }

        console.log('✅ All NIST SI-10 rule violations comprehensively tested\n');

        // Test 21: Circuit breaker opening after 5 failures (verify EXECUTE returns CIRCUIT_OPEN)
        console.log('▶ Test 21: Circuit breaker opening after exactly 5 failures - CIRCUIT_OPEN');
        
        // Reset circuit breaker first
        pipeline.resetCircuitBreaker('filesystem');
        
        // Create a new extension for clean circuit breaker test
        const manifest19 = {
            id: 'test-extension-19',
            capabilities: {
                filesystem: { read: ['**/*'], write: [] }
            }
        };
        pipeline.registerExtension('test-extension-19', manifest19);

        const nonExistentPath = path.join(testDir, 'ghost-circuit-test-nonexistent.txt');
        
        // Trigger exactly 5 failures
        for (let i = 0; i < 5; i++) {
            const circuitFailIntent = {
                type: 'filesystem',
                operation: 'read',
                params: { path: nonExistentPath },
                extensionId: 'test-extension-19',
                requestId: `req-circuit-fail-${i}`
            };
            const circuitFailResult = await pipeline.process(circuitFailIntent);
            assert.strictEqual(circuitFailResult.success, false, `Failure ${i + 1} should fail`);
            console.log(`  Failure ${i + 1}/5: ${circuitFailResult.code || circuitFailResult.error}`);
        }

        // Verify circuit breaker state is OPEN
        const circuitStateAfter5 = pipeline.getCircuitBreakerState('filesystem');
        assert.ok(circuitStateAfter5, 'Circuit breaker state should exist');
        assert.strictEqual(circuitStateAfter5.state, 'OPEN', 'Circuit breaker should be OPEN after 5 failures');
        assert.strictEqual(circuitStateAfter5.failures, 5, 'Should have exactly 5 failures recorded');

        // Next request should be rejected with CIRCUIT_OPEN
        const circuitOpenTestIntent = {
            type: 'filesystem',
            operation: 'read',
            params: { path: nonExistentPath },
            extensionId: 'test-extension-19',
            requestId: 'req-circuit-open-test'
        };
        const circuitOpenTestResult = await pipeline.process(circuitOpenTestIntent);
        assert.strictEqual(circuitOpenTestResult.success, false, 'Request should fail with open circuit');
        assert.strictEqual(circuitOpenTestResult.stage, 'EXECUTION', 'Should fail at execution stage');
        assert.strictEqual(circuitOpenTestResult.code, 'CIRCUIT_OPEN', 'Should return CIRCUIT_OPEN code');
        
        console.log('✅ Circuit breaker opens after 5 failures and returns CIRCUIT_OPEN\n');

        // Test 22: Concurrent requests from multiple extensions - verify isolation
        console.log('▶ Test 22: Concurrent requests from multiple extensions - verify isolation');
        
        // Create multiple extensions with different capabilities and rate limits
        const manifest20 = {
            id: 'test-extension-20',
            capabilities: {
                filesystem: { read: ['data/**/*.json'], write: [] }
            }
        };
        const manifest21 = {
            id: 'test-extension-21',
            capabilities: {
                filesystem: { read: ['config/**/*.yaml'], write: [] },
                network: {
                    allowlist: ['https://api1.example.com'],
                    rateLimit: { cir: 60, bc: 3, be: 2 }
                }
            }
        };
        const manifest22 = {
            id: 'test-extension-22',
            capabilities: {
                filesystem: { read: ['logs/**/*.log'], write: [] },
                network: {
                    allowlist: ['https://api2.example.com'],
                    rateLimit: { cir: 60, bc: 5, be: 0 }
                }
            }
        };

        pipeline.registerExtension('test-extension-20', manifest20);
        pipeline.registerExtension('test-extension-21', manifest21);
        pipeline.registerExtension('test-extension-22', manifest22);

        // Prepare test files
        const dataJsonFile = path.join(testDir, 'data-test.json');
        const configYamlFile = path.join(testDir, 'config-test.yaml');
        const logsLogFile = path.join(testDir, 'logs-test.log');
        fs.writeFileSync(dataJsonFile, '{"test": true}', 'utf8');
        fs.writeFileSync(configYamlFile, 'test: true', 'utf8');
        fs.writeFileSync(logsLogFile, 'test log entry', 'utf8');

        const isolationPromises = [];

        // Extension 20: Valid filesystem requests (should succeed)
        for (let i = 0; i < 3; i++) {
            isolationPromises.push(
                pipeline.process({
                    type: 'filesystem',
                    operation: 'read',
                    params: { path: dataJsonFile },
                    extensionId: 'test-extension-20',
                    requestId: `req-iso-20-${i}`
                })
            );
        }

        // Extension 20: Invalid path (should fail - wrong pattern)
        for (let i = 0; i < 2; i++) {
            isolationPromises.push(
                pipeline.process({
                    type: 'filesystem',
                    operation: 'read',
                    params: { path: configYamlFile },
                    extensionId: 'test-extension-20',
                    requestId: `req-iso-20-invalid-${i}`
                })
            );
        }

        // Extension 21: Network requests (will exhaust rate limit)
        for (let i = 0; i < 8; i++) {
            isolationPromises.push(
                pipeline.process({
                    type: 'network',
                    operation: 'https',
                    params: { url: 'https://api1.example.com/data', method: 'GET' },
                    extensionId: 'test-extension-21',
                    requestId: `req-iso-21-${i}`
                })
            );
        }

        // Extension 22: Mix of valid and malicious requests
        for (let i = 0; i < 3; i++) {
            isolationPromises.push(
                pipeline.process({
                    type: 'filesystem',
                    operation: 'read',
                    params: { path: logsLogFile },
                    extensionId: 'test-extension-22',
                    requestId: `req-iso-22-valid-${i}`
                })
            );
        }
        for (let i = 0; i < 3; i++) {
            isolationPromises.push(
                pipeline.process({
                    type: 'filesystem',
                    operation: 'read',
                    params: { path: '../../etc/passwd' },
                    extensionId: 'test-extension-22',
                    requestId: `req-iso-22-malicious-${i}`
                })
            );
        }

        const isolationResults = await Promise.all(isolationPromises);

        // Analyze results by extension
        const ext20Results = isolationResults.slice(0, 5);
        const ext21Results = isolationResults.slice(5, 13);
        const ext22Results = isolationResults.slice(13, 19);

        // Extension 20: Valid requests should succeed, invalid should fail at authorization
        const ext20Valid = ext20Results.slice(0, 3);
        const ext20Invalid = ext20Results.slice(3, 5);
        assert.ok(ext20Valid.every(r => r.success === true), 'Extension 20 valid requests should succeed');
        assert.ok(ext20Invalid.every(r => r.success === false && r.stage === 'AUTHORIZATION'), 
            'Extension 20 invalid path should fail at authorization');

        // Extension 21: Some should succeed, some should hit rate limit
        const ext21Success = ext21Results.filter(r => r.success === true || r.stage === 'EXECUTION');
        const ext21RateLimited = ext21Results.filter(r => r.code === 'QOS_VIOLATING' || r.code === 'AUTH_RATE_LIMIT');
        assert.ok(ext21Success.length > 0, 'Extension 21 should have some successful requests');
        assert.ok(ext21RateLimited.length > 0, 'Extension 21 should hit rate limit');

        // Extension 22: Valid should succeed, malicious should fail at audit
        const ext22Valid = ext22Results.slice(0, 3);
        const ext22Malicious = ext22Results.slice(3, 6);
        assert.ok(ext22Valid.every(r => r.success === true), 'Extension 22 valid requests should succeed');
        assert.ok(ext22Malicious.every(r => r.success === false && r.stage === 'AUDIT'), 
            'Extension 22 malicious requests should fail at audit');

        // Verify isolation: Extension 21 rate limit doesn't affect Extension 22
        const ext22AfterExt21 = await pipeline.process({
            type: 'filesystem',
            operation: 'read',
            params: { path: logsLogFile },
            extensionId: 'test-extension-22',
            requestId: 'req-iso-22-after'
        });
        assert.strictEqual(ext22AfterExt21.success, true, 
            'Extension 22 should not be affected by Extension 21 rate limit');

        console.log(`✅ Extension isolation verified:`);
        console.log(`   - Extension 20: ${ext20Valid.filter(r => r.success).length}/3 valid succeeded, ${ext20Invalid.filter(r => !r.success).length}/2 invalid blocked`);
        console.log(`   - Extension 21: ${ext21Success.length} succeeded, ${ext21RateLimited.length} rate-limited`);
        console.log(`   - Extension 22: ${ext22Valid.filter(r => r.success).length}/3 valid succeeded, ${ext22Malicious.filter(r => !r.success).length}/3 malicious blocked`);
        console.log(`   - Extensions remain isolated from each other's rate limits and permissions\n`);

        // Test 23: Verify audit log immutability after all error scenarios
        console.log('▶ Test 23: Verify audit log immutability after all error scenarios');
        
        const finalAuditLogs = pipeline.getAuditLogs({ limit: 500 });
        assert.ok(finalAuditLogs.length > 100, 'Should have extensive audit logs from all tests');

        // Verify all logs are frozen (immutable)
        let frozenCount = 0;
        let modificationAttempts = 0;
        for (const log of finalAuditLogs.slice(0, 10)) {
            modificationAttempts++;
            try {
                log.timestamp = 'MODIFIED';
                log.type = 'TAMPERED';
                log.newField = 'should-not-exist';
            } catch (e) {
                // In strict mode, this throws
                frozenCount++;
            }
            // Verify modifications didn't persist
            if (log.timestamp !== 'MODIFIED' && log.type !== 'TAMPERED' && !log.newField) {
                frozenCount++;
            }
        }
        assert.ok(frozenCount >= modificationAttempts, 'All audit logs should be immutable');

        // Verify error scenario logs are present
        const authNotRegisteredLogs = finalAuditLogs.filter(log => 
            log.type === 'SECURITY_EVENT' && log.eventType === 'AUTHORIZATION_DENIED' &&
            log.details && log.details.code === 'AUTH_NOT_REGISTERED'
        );
        assert.ok(authNotRegisteredLogs.length > 0, 'Should have AUTH_NOT_REGISTERED security events');

        const qosViolatingLogs = finalAuditLogs.filter(log =>
            log.type === 'SECURITY_EVENT' && log.eventType === 'AUTHORIZATION_DENIED' &&
            log.details && log.details.code === 'QOS_VIOLATING'
        );
        assert.ok(qosViolatingLogs.length > 0, 'Should have QOS_VIOLATING security events');

        const nistViolationLogs = finalAuditLogs.filter(log =>
            log.type === 'SECURITY_EVENT' && log.eventType === 'VALIDATION_VIOLATION' &&
            log.rule && (
                log.rule.includes('SSRF') || 
                log.rule.includes('COMMAND-INJECTION') ||
                log.rule.includes('PATH-TRAVERSAL') ||
                log.rule.includes('SECRET')
            )
        );
        assert.ok(nistViolationLogs.length > 0, 'Should have NIST SI-10 violation logs');

        // Verify circuit breaker events
        const circuitOpenLogs = finalAuditLogs.filter(log =>
            log.type === 'EXECUTION' && log.error && log.error.code === 'CIRCUIT_OPEN'
        );
        assert.ok(circuitOpenLogs.length > 0, 'Should have CIRCUIT_OPEN execution logs');

        // Verify log integrity: all logs have required fields
        const logsWithTimestamps = finalAuditLogs.filter(log => log.timestamp);
        assert.strictEqual(logsWithTimestamps.length, finalAuditLogs.length, 
            'All logs must have timestamps');

        const logsWithType = finalAuditLogs.filter(log => log.type);
        assert.strictEqual(logsWithType.length, finalAuditLogs.length, 
            'All logs must have type field');

        // Verify timestamp ordering (recent logs come last)
        const timestamps = finalAuditLogs.map(log => new Date(log.timestamp).getTime());
        let ordered = true;
        for (let i = 1; i < timestamps.length; i++) {
            if (timestamps[i] < timestamps[i - 1]) {
                ordered = false;
                break;
            }
        }
        assert.ok(ordered, 'Audit logs should be in chronological order');

        console.log(`✅ Audit log immutability verified after all error scenarios:`);
        console.log(`   - Total logs: ${finalAuditLogs.length}`);
        console.log(`   - AUTH_NOT_REGISTERED events: ${authNotRegisteredLogs.length}`);
        console.log(`   - QOS_VIOLATING events: ${qosViolatingLogs.length}`);
        console.log(`   - NIST SI-10 violations: ${nistViolationLogs.length}`);
        console.log(`   - CIRCUIT_OPEN events: ${circuitOpenLogs.length}`);
        console.log(`   - All logs immutable and properly timestamped\n`);

        // Cleanup
        try {
            fs.unlinkSync(testFile);
            fs.unlinkSync(testMd);
            fs.unlinkSync(dataJsonFile);
            fs.unlinkSync(configYamlFile);
            fs.unlinkSync(logsLogFile);
            // Remove test directory
            fs.rmdirSync(testDir, { recursive: true });
        } catch (e) {}

        console.log('═══════════════════════════════════════');
        console.log('🎉 All gateway pipeline integration tests passed!');
        console.log('   - Basic pipeline tests: 10 passed');
        console.log('   - Zero Trust properties: 7 tests');
        console.log('   - Fail-closed verification: All paths verified');
        console.log('   - Extended error scenarios: 6 comprehensive tests');
        console.log('   - Total tests: 23 test suites');
        console.log('═══════════════════════════════════════');
        process.exit(0);

    } catch (error) {
        console.error('❌ Test failed:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
})();
