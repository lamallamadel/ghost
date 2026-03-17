#!/usr/bin/env node
'use strict';

/**
 * ghost-ci-extension unit tests
 * Run: node test.js
 */

const assert = require('assert');

// ── Minimal SDK stub ─────────────────────────────────────────────────────────
const makeSdk = (overrides = {}) => ({
    requestLog: async () => {},
    requestFileRead: async () => { throw new Error('no file'); },
    requestFileWrite: async () => {},
    emitIntent: async (intent) => {
        if (intent.type === 'process' && intent.operation === 'spawn') {
            return { stdout: '', stderr: '' };
        }
        throw new Error(`Unhandled intent: ${intent.type}.${intent.operation}`);
    },
    ...overrides
});

const { CIExtension } = (() => {
    // Load extension
    try { return require('./extension.js'); }
    catch (e) { return {}; }
})();

let passed = 0;
let failed = 0;

async function test(name, fn) {
    try {
        await fn();
        console.log(`  ✓ ${name}`);
        passed++;
    } catch (err) {
        console.error(`  ✗ ${name}`);
        console.error(`    ${err.message}`);
        failed++;
    }
}

// ── CIDetector tests ─────────────────────────────────────────────────────────
const { CIDetector } = (() => {
    try {
        const mod = require('./extension.js');
        // CIDetector may not be exported — access via extension internals
        // We test it indirectly through CIExtension
        return { CIDetector: null };
    } catch (e) { return {}; }
})();

console.log('\nghost-ci-extension tests\n');

await (async () => {
    if (!CIExtension) {
        console.error('Failed to load extension.js');
        process.exit(1);
    }

    const sdk = makeSdk();

    // ── handleStatus ──────────────────────────────────────────────────────────
    console.log('handleStatus:');

    await test('returns success with CI environment info', async () => {
        const ext = new CIExtension(sdk);
        const result = await ext.handleRPCRequest({ method: 'ci.status', params: {} });
        assert.strictEqual(result.success, true);
        assert.ok(typeof result.output === 'string');
        assert.ok(result.output.includes('CI'));
    });

    await test('output includes branch info', async () => {
        const ext = new CIExtension(sdk);
        const result = await ext.handleRPCRequest({ method: 'ci.status', params: {} });
        assert.ok(result.output.includes('Branch'));
    });

    await test('detects GitHub Actions when env var is set', async () => {
        process.env.GITHUB_ACTIONS = 'true';
        process.env.GITHUB_REF_NAME = 'main';
        const ext = new CIExtension(sdk);
        const result = await ext.handleRPCRequest({ method: 'ci.status', params: {} });
        assert.ok(result.output.toLowerCase().includes('github'));
        delete process.env.GITHUB_ACTIONS;
        delete process.env.GITHUB_REF_NAME;
    });

    // ── handleCheck ──────────────────────────────────────────────────────────
    console.log('\nhandleCheck:');

    await test('returns result with success property', async () => {
        const ext = new CIExtension(sdk);
        const result = await ext.handleRPCRequest({ method: 'ci.check', params: {} });
        assert.ok('success' in result);
    });

    await test('check with gate param runs security gate', async () => {
        let securityCalled = false;
        const sdkWithSec = makeSdk({
            emitIntent: async (intent) => {
                if (intent.params?.extensionId === 'ghost-security-extension') securityCalled = true;
                return { stdout: '' };
            }
        });
        const ext = new CIExtension(sdkWithSec);
        await ext.handleRPCRequest({ method: 'ci.check', params: { flags: { gate: 'security' } } });
        assert.ok(securityCalled, 'Should have called security extension');
    });

    // ── handleReport ─────────────────────────────────────────────────────────
    console.log('\nhandleReport:');

    await test('generates report with output string', async () => {
        const ext = new CIExtension(sdk);
        const result = await ext.handleRPCRequest({ method: 'ci.report', params: {} });
        assert.ok('success' in result);
        assert.ok(typeof result.output === 'string');
    });

    // ── unknown method ────────────────────────────────────────────────────────
    console.log('\nerror handling:');

    await test('unknown method returns error', async () => {
        const ext = new CIExtension(sdk);
        const result = await ext.handleRPCRequest({ method: 'ci.unknown', params: {} });
        assert.ok(result.error || result.success === false);
    });
})();

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
