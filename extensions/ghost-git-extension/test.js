#!/usr/bin/env node

/**
 * Test suite for Ghost Git Extension
 */

const { createExtension, ExtensionRPCClient, GitExtension } = require('./extension.js');
const assert = require('assert');

class MockCoreHandler {
    constructor() {
        this.calls = [];
        this.responses = new Map();
    }

    setResponse(method, result) {
        this.responses.set(method, result);
    }

    async handle(request) {
        this.calls.push(request);
        
        const response = this.responses.get(request.method);
        
        if (response instanceof Error) {
            return {
                jsonrpc: "2.0",
                id: request.id,
                error: {
                    code: -32603,
                    message: response.message
                }
            };
        }
        
        return {
            jsonrpc: "2.0",
            id: request.id,
            result: response !== undefined ? response : null
        };
    }
}

async function runTests() {
    console.log('Running Ghost Git Extension Tests...\n');
    
    let passed = 0;
    let failed = 0;

    function test(name, fn) {
        try {
            fn();
            console.log(`✅ ${name}`);
            passed++;
        } catch (e) {
            console.error(`❌ ${name}`);
            console.error(`   ${e.message}`);
            failed++;
        }
    }

    async function asyncTest(name, fn) {
        try {
            await fn();
            console.log(`✅ ${name}`);
            passed++;
        } catch (e) {
            console.error(`❌ ${name}`);
            console.error(`   ${e.message}`);
            failed++;
        }
    }

    // Test RPC Client
    await asyncTest('RPC Client - Basic call', async () => {
        const mock = new MockCoreHandler();
        const client = new ExtensionRPCClient((req) => mock.handle(req));
        
        mock.setResponse('test.method', { success: true });
        const result = await client.call('test.method', { param: 'value' });
        
        assert.strictEqual(result.success, true);
        assert.strictEqual(mock.calls.length, 1);
        assert.strictEqual(mock.calls[0].method, 'test.method');
    });

    await asyncTest('RPC Client - Error handling', async () => {
        const mock = new MockCoreHandler();
        const client = new ExtensionRPCClient((req) => mock.handle(req));
        
        mock.setResponse('test.error', new Error('Test error'));
        
        try {
            await client.call('test.error');
            throw new Error('Should have thrown');
        } catch (e) {
            assert(e.message.includes('Test error'));
        }
    });

    // Test Semver Functions
    test('Semver - Parse valid version', () => {
        const mock = new MockCoreHandler();
        const { extension } = createExtension((req) => mock.handle(req));
        
        const v = extension.semverParse('1.2.3');
        assert.strictEqual(v.major, 1);
        assert.strictEqual(v.minor, 2);
        assert.strictEqual(v.patch, 3);
    });

    test('Semver - Parse version with v prefix', () => {
        const mock = new MockCoreHandler();
        const { extension } = createExtension((req) => mock.handle(req));
        
        const v = extension.semverParse('v2.0.1');
        assert.strictEqual(v.major, 2);
        assert.strictEqual(v.minor, 0);
        assert.strictEqual(v.patch, 1);
    });

    test('Semver - Parse invalid version', () => {
        const mock = new MockCoreHandler();
        const { extension } = createExtension((req) => mock.handle(req));
        
        const v = extension.semverParse('invalid');
        assert.strictEqual(v, null);
    });

    test('Semver - Bump major', () => {
        const mock = new MockCoreHandler();
        const { extension } = createExtension((req) => mock.handle(req));
        
        const v = { major: 1, minor: 2, patch: 3 };
        const bumped = extension.semverBump(v, 'major');
        assert.strictEqual(bumped.major, 2);
        assert.strictEqual(bumped.minor, 0);
        assert.strictEqual(bumped.patch, 0);
    });

    test('Semver - Bump minor', () => {
        const mock = new MockCoreHandler();
        const { extension } = createExtension((req) => mock.handle(req));
        
        const v = { major: 1, minor: 2, patch: 3 };
        const bumped = extension.semverBump(v, 'minor');
        assert.strictEqual(bumped.major, 1);
        assert.strictEqual(bumped.minor, 3);
        assert.strictEqual(bumped.patch, 0);
    });

    test('Semver - Bump patch', () => {
        const mock = new MockCoreHandler();
        const { extension } = createExtension((req) => mock.handle(req));
        
        const v = { major: 1, minor: 2, patch: 3 };
        const bumped = extension.semverBump(v, 'patch');
        assert.strictEqual(bumped.major, 1);
        assert.strictEqual(bumped.minor, 2);
        assert.strictEqual(bumped.patch, 4);
    });

    test('Semver - Compare versions', () => {
        const mock = new MockCoreHandler();
        const { extension } = createExtension((req) => mock.handle(req));
        
        const v1 = { major: 1, minor: 2, patch: 3 };
        const v2 = { major: 1, minor: 2, patch: 4 };
        const v3 = { major: 2, minor: 0, patch: 0 };
        
        assert.strictEqual(extension.semverCompare(v1, v2), -1);
        assert.strictEqual(extension.semverCompare(v2, v1), 1);
        assert.strictEqual(extension.semverCompare(v1, v1), 0);
        assert.strictEqual(extension.semverCompare(v3, v1), 1);
    });

    // Test Conventional Commits
    test('Conventional Commits - feat requires minor', () => {
        const mock = new MockCoreHandler();
        const { extension } = createExtension((req) => mock.handle(req));
        
        const bump = extension.conventionalRequiredBumpFromMessage('feat: add new feature');
        assert.strictEqual(bump, 'minor');
    });

    test('Conventional Commits - fix requires patch', () => {
        const mock = new MockCoreHandler();
        const { extension } = createExtension((req) => mock.handle(req));
        
        const bump = extension.conventionalRequiredBumpFromMessage('fix: resolve bug');
        assert.strictEqual(bump, 'patch');
    });

    test('Conventional Commits - breaking change requires major', () => {
        const mock = new MockCoreHandler();
        const { extension } = createExtension((req) => mock.handle(req));
        
        const bump = extension.conventionalRequiredBumpFromMessage('feat!: breaking change');
        assert.strictEqual(bump, 'major');
    });

    test('Conventional Commits - BREAKING CHANGE in body requires major', () => {
        const mock = new MockCoreHandler();
        const { extension } = createExtension((req) => mock.handle(req));
        
        const bump = extension.conventionalRequiredBumpFromMessage('feat: something\n\nBREAKING CHANGE: removed API');
        assert.strictEqual(bump, 'major');
    });

    // Test Security Scanning
    test('Security - Detect high entropy strings', () => {
        const mock = new MockCoreHandler();
        const { extension } = createExtension((req) => mock.handle(req));
        
        const entropy = extension.calculateShannonEntropy('aaaaaa');
        assert(entropy < 1); // Low entropy
        
        const highEntropy = extension.calculateShannonEntropy('Xk9j2Lm4Np8Q');
        assert(highEntropy > 3); // High entropy
    });

    test('Security - Scan for secrets', () => {
        const mock = new MockCoreHandler();
        const { extension } = createExtension((req) => mock.handle(req));
        
        const code = 'const key = "gsk_' + 'a'.repeat(48) + '";';
        const suspects = extension.scanForSecrets(code);
        assert(suspects.length > 0);
    });

    test('Security - Ignore known non-secrets', () => {
        const mock = new MockCoreHandler();
        const { extension } = createExtension((req) => mock.handle(req));
        
        const code = 'const model = "claude-3-5-sonnet-20240620";';
        const suspects = extension.scanForSecrets(code);
        assert.strictEqual(suspects.length, 0);
    });

    // Test RPC Request Handling
    await asyncTest('RPC - Handle checkRepo request', async () => {
        const mock = new MockCoreHandler();
        const { handleRequest } = createExtension((req) => mock.handle(req));
        
        mock.setResponse('git.exec', '');
        
        const response = await handleRequest({
            jsonrpc: "2.0",
            id: 1,
            method: "git.checkRepo",
            params: {}
        });
        
        assert.strictEqual(response.jsonrpc, "2.0");
        assert.strictEqual(response.id, 1);
        assert.strictEqual(typeof response.result, 'boolean');
    });

    await asyncTest('RPC - Handle unknown method', async () => {
        const mock = new MockCoreHandler();
        const { handleRequest } = createExtension((req) => mock.handle(req));
        
        const response = await handleRequest({
            jsonrpc: "2.0",
            id: 1,
            method: "unknown.method",
            params: {}
        });
        
        assert.strictEqual(response.jsonrpc, "2.0");
        assert.strictEqual(response.id, 1);
        assert(response.error);
        assert(response.error.message.includes('Unknown method'));
    });

    // Summary
    console.log(`\n${'='.repeat(50)}`);
    console.log(`Tests completed: ${passed + failed}`);
    console.log(`✅ Passed: ${passed}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`${'='.repeat(50)}`);
    
    process.exit(failed > 0 ? 1 : 0);
}

if (require.main === module) {
    runTests().catch(console.error);
}

module.exports = { runTests };
