#!/usr/bin/env node

/**
 * Test suite for Ghost Security Master Extension
 */

const { SecurityExtension, SecretScanner } = require('./extension.js');
const { ExtensionSDK } = require('@ghost/extension-sdk');
const assert = require('assert');

class MockCoreHandler {
    constructor() {
        this.calls = [];
        this.responses = new Map();
    }

    setResponse(key, result) {
        this.responses.set(key, result);
    }

    async handle(request) {
        this.calls.push(request);
        
        let methodToLookup = request.method;
        if (request.method === 'intent') {
            const { type, operation } = request.params;
            const specificKey = `intent:${type}:${operation}`;
            if (this.responses.has(specificKey)) {
                methodToLookup = specificKey;
            } else if (this.responses.has('intent')) {
                methodToLookup = 'intent';
            }
        }

        const response = this.responses.get(methodToLookup);
        
        if (response instanceof Error) {
            return {
                jsonrpc: "2.0",
                id: request.id,
                error: { code: -32603, message: response.message }
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
    console.log('Running Ghost Security Master Tests...\n');
    
    let passed = 0;
    let failed = 0;

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

    // --- Unit Tests: SecretScanner ---
    
    await asyncTest('Scanner - Detect Regex Secret', async () => {
        const scanner = new SecretScanner();
        const code = 'const key = "gsk_123456789012345678901234567890123456789012345678";';
        const issues = scanner.scan(code);
        assert(issues.some(i => i.type === 'Groq API Key'));
    });

    await asyncTest('Scanner - Detect High Entropy', async () => {
        const scanner = new SecretScanner();
        const code = 'const secret = "Xk9j2Lm4Np8QzRt5Vw3Yx7Ab";';
        const issues = scanner.scan(code);
        assert(issues.some(i => i.type === 'High Entropy String'));
    });

    await asyncTest('Scanner - Detect OWASP Injection', async () => {
        const scanner = new SecretScanner();
        const code = 'eval("const x = " + userInput);';
        const issues = scanner.scan(code);
        assert(issues.some(i => i.category === 'A03:2021-Injection'));
    });

    await asyncTest('Scanner - Ignore Known Models', async () => {
        const scanner = new SecretScanner();
        const code = 'const model = "claude-3-5-sonnet";';
        const issues = scanner.scan(code);
        assert.strictEqual(issues.length, 0);
    });

    // --- Integration Tests: SecurityExtension ---

    const setupExtension = (mock) => {
        const sdk = new ExtensionSDK('ghost-security-extension');
        sdk.emitIntent = async (intent) => {
            const resp = await mock.handle({ jsonrpc: "2.0", id: "1", method: 'intent', params: intent });
            if (resp.error) throw new Error(resp.error.message);
            return resp.result;
        };
        const extension = new SecurityExtension(sdk);
        return extension;
    };

    await asyncTest('RPC - Handle scan request', async () => {
        const mock = new MockCoreHandler();
        const extension = setupExtension(mock);
        
        // Mock file read
        mock.setResponse('intent:filesystem:read', 'const x = 1;');
        mock.setResponse('intent:filesystem:stat', { isDirectory: false });
        
        const response = await extension.handleRPCRequest({
            method: 'security.scan',
            params: { args: ['test.js'] }
        });
        
        assert.strictEqual(response.success, true);
        assert(response.output.includes('No security issues found'));
    });

    await asyncTest('RPC - Handle audit with findings', async () => {
        const mock = new MockCoreHandler();
        const extension = setupExtension(mock);
        
        // Mock directory walk: . -> file.js
        mock.setResponse('intent:filesystem:stat', { isDirectory: true });
        mock.setResponse('intent:filesystem:readdir', ['file.js']);
        
        // Mock file.js content with secret
        let callCount = 0;
        mock.handle = async (request) => {
            if (request.params.operation === 'stat' && request.params.params.path === 'file.js') {
                return { jsonrpc: "2.0", id: request.id, result: { isDirectory: false } };
            }
            if (request.params.operation === 'read') {
                return { jsonrpc: "2.0", id: request.id, result: 'const k = "gsk_123456789012345678901234567890123456789012345678";' };
            }
            return { jsonrpc: "2.0", id: request.id, result: { isDirectory: true, content: [] } };
        };
        
        const response = await extension.handleRPCRequest({
            method: 'security.audit',
            params: {}
        });
        
        assert.strictEqual(response.success, true);
        assert(response.output.includes('SECURITY SCAN REPORT'));
        assert(response.findings.length > 0);
    });

    await asyncTest('RPC - Handle compliance reporting', async () => {
        const mock = new MockCoreHandler();
        const extension = setupExtension(mock);
        
        mock.setResponse('intent:filesystem:stat', { isDirectory: false });
        mock.setResponse('intent:filesystem:read', 'clean code');
        mock.setResponse('intent:filesystem:write', { success: true });
        
        const response = await extension.handleRPCRequest({
            method: 'security.compliance',
            params: {}
        });
        
        assert.strictEqual(response.success, true);
        assert(response.output.includes('Compliance report generated'));
    });

    // Summary
    console.log(`\n${'='.repeat(50)}`);
    console.log(`Tests completed: ${passed + failed}`);
    console.log(`✅ Passed: ${passed}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`${'='.repeat(50)}`);
    
    process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(console.error);
