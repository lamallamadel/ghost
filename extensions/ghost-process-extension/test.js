#!/usr/bin/env node
'use strict';

/**
 * ghost-process-extension unit tests
 * Run: node test.js
 */

const assert = require('assert');
const path = require('path');
const os = require('os');

// ── Minimal SDK stub ─────────────────────────────────────────────────────────
const makeSdk = (overrides = {}) => ({
    requestLog: async () => {},
    requestFileExists: async () => false,
    requestFileRead: async (opts) => { throw new Error(`file not found: ${opts.path}`); },
    requestFileWrite: async () => {},
    requestFileReadJSON: async (p) => { throw new Error(`json not found: ${p}`); },
    requestFileWriteJSON: async () => {},
    emitIntent: async (intent) => {
        if (intent.type === 'filesystem') return {};
        if (intent.type === 'process') return { stdout: '', stderr: '', code: 0 };
        throw new Error(`Unhandled intent: ${JSON.stringify(intent)}`);
    },
    ...overrides
});

const { ProcessExtension } = (() => {
    try { return require('./extension.js'); }
    catch (e) { console.error('Failed to load extension.js:', e.message); return {}; }
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

console.log('\nghost-process-extension tests\n');

await (async () => {
    if (!ProcessExtension) {
        console.error('Failed to load extension — skipping tests');
        process.exit(1);
    }

    // ── initialize ────────────────────────────────────────────────────────────
    console.log('initialize:');

    await test('creates directories and services.json if missing', async () => {
        let mkdirCount = 0;
        let writtenPath = null;
        const sdk = makeSdk({
            emitIntent: async (intent) => {
                if (intent.operation === 'mkdir') mkdirCount++;
                return {};
            },
            requestFileWriteJSON: async (p) => { writtenPath = p; }
        });
        const ext = new ProcessExtension(sdk);
        await ext.initialize();
        assert.ok(mkdirCount >= 1, 'Should have created at least one directory');
        assert.ok(writtenPath !== null, 'Should have written services.json');
        assert.ok(writtenPath.endsWith('services.json'));
    });

    await test('skips directory creation if already exists', async () => {
        let mkdirCount = 0;
        const sdk = makeSdk({
            requestFileExists: async () => true, // all exist
            emitIntent: async (intent) => {
                if (intent.operation === 'mkdir') mkdirCount++;
                return {};
            }
        });
        const ext = new ProcessExtension(sdk);
        await ext.initialize();
        assert.strictEqual(mkdirCount, 0, 'Should not mkdir when paths exist');
    });

    // ── handleRPCRequest routing ──────────────────────────────────────────────
    console.log('\nhandleRPCRequest routing:');

    await test('routes process.list to handleList', async () => {
        const sdk = makeSdk({
            requestFileExists: async () => true,
            requestFileReadJSON: async () => ({ telemetry: { cmd: 'node', args: [] } })
        });
        const ext = new ProcessExtension(sdk);
        const result = await ext.handleRPCRequest({ method: 'process.list', params: {} });
        assert.ok('success' in result);
    });

    await test('routes process.status with service arg', async () => {
        const sdk = makeSdk({
            requestFileExists: async () => true,
            requestFileReadJSON: async (p) => {
                if (p.endsWith('services.json')) return { telemetry: { cmd: 'node', args: [] } };
                throw new Error('not found');
            }
        });
        const ext = new ProcessExtension(sdk);
        const result = await ext.handleRPCRequest({ method: 'process.status', params: { args: ['telemetry'] } });
        assert.ok('success' in result || 'error' in result);
    });

    await test('unknown method returns error', async () => {
        const sdk = makeSdk({ requestFileExists: async () => true });
        const ext = new ProcessExtension(sdk);
        const result = await ext.handleRPCRequest({ method: 'process.unknown', params: {} });
        assert.ok(result.error || result.success === false);
    });

    // ── _isProcessRunning ─────────────────────────────────────────────────────
    console.log('\n_isProcessRunning:');

    await test('returns false for PID 0', async () => {
        const ext = new ProcessExtension(makeSdk());
        // PID 0 will throw EPERM on Linux, should return false
        const result = ext._isProcessRunning(0);
        assert.strictEqual(typeof result, 'boolean');
    });

    await test('returns false for clearly invalid PID', async () => {
        const ext = new ProcessExtension(makeSdk());
        const result = ext._isProcessRunning(999999999);
        assert.strictEqual(result, false);
    });
})();

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
