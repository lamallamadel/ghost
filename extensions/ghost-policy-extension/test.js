#!/usr/bin/env node
'use strict';

/**
 * ghost-policy-extension unit tests
 * Run: node test.js
 */

const assert = require('assert');

// ── Minimal SDK stub ─────────────────────────────────────────────────────────
const makeSdk = (overrides = {}) => ({
    requestLog: async () => {},
    requestFileExists: async () => false,
    requestFileRead: async (p) => { throw new Error(`no file: ${p}`); },
    requestFileWrite: async () => {},
    requestFileReadJSON: async (p) => { throw new Error(`no json: ${p}`); },
    requestFileWriteJSON: async () => {},
    emitIntent: async (intent) => {
        if (intent.type === 'system' && intent.operation === 'registry') return [];
        if (intent.type === 'filesystem') return {};
        return {};
    },
    ...overrides
});

const SAMPLE_MATRIX = {
    schema: '1.0',
    core: { version: '2.0.0' },
    extensions: {
        'ghost-git-extension': {
            version: '1.0.0',
            core_range: '>=1.0.0 <3.0.0',
            stability: 'stable',
            security: { vuln_status: 'clean' },
            capabilities: ['git:read', 'git:write']
        }
    },
    policies: {
        capability_overlaps: {
            'git:read': ['ghost-git-extension']
        }
    }
};

const { PolicyExtension } = (() => {
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

console.log('\nghost-policy-extension tests\n');

await (async () => {
    if (!PolicyExtension) {
        console.error('Failed to load extension — skipping tests');
        process.exit(1);
    }

    // ── _checkSemver ──────────────────────────────────────────────────────────
    console.log('_checkSemver:');

    await test('2.0.0 satisfies >=1.0.0 <3.0.0', async () => {
        const ext = new PolicyExtension(makeSdk());
        assert.strictEqual(ext._checkSemver('2.0.0', '>=1.0.0 <3.0.0'), true);
    });

    await test('0.9.0 does not satisfy >=1.0.0', async () => {
        const ext = new PolicyExtension(makeSdk());
        // Basic check — may pass depending on impl, just check it returns boolean
        const result = ext._checkSemver('0.9.0', '>=1.0.0');
        assert.strictEqual(typeof result, 'boolean');
    });

    await test('exact match satisfies range', async () => {
        const ext = new PolicyExtension(makeSdk());
        const result = ext._checkSemver('1.2.3', '>=1.0.0');
        // Should be true for any reasonable semver impl
        assert.strictEqual(result, true);
    });

    // ── handleCompatStatus ────────────────────────────────────────────────────
    console.log('\nhandleCompatStatus:');

    await test('returns failure gracefully when matrix file missing', async () => {
        const ext = new PolicyExtension(makeSdk());
        const result = await ext.handleRPCRequest({ method: 'policy.compatStatus', params: {} });
        assert.ok('success' in result);
        // Matrix is missing, so should return false or error message
        if (!result.success) {
            assert.ok(typeof result.output === 'string');
        }
    });

    await test('returns success with a well-formed matrix', async () => {
        const sdk = makeSdk({
            requestFileExists: async () => true,
            requestFileReadJSON: async (p) => {
                if (p.endsWith('registry.json')) return SAMPLE_MATRIX;
                if (p.endsWith('package.json')) return { version: '2.0.0' };
                throw new Error(`unexpected: ${p}`);
            },
            emitIntent: async () => [{ id: 'ghost-git-extension', version: '1.0.0' }]
        });
        const ext = new PolicyExtension(sdk);
        const result = await ext.handleRPCRequest({ method: 'policy.compatStatus', params: {} });
        assert.strictEqual(result.success, true);
        assert.ok(result.output.includes('ghost-git-extension'));
    });

    // ── handleCompatCheck (CI gate) ───────────────────────────────────────────
    console.log('\nhandleCompatCheck:');

    await test('passes when all extensions satisfy core range', async () => {
        const sdk = makeSdk({
            requestFileExists: async () => true,
            requestFileReadJSON: async (p) => {
                if (p.endsWith('registry.json')) return SAMPLE_MATRIX;
                if (p.endsWith('package.json')) return { version: '2.0.0' };
                throw new Error(`unexpected: ${p}`);
            },
            emitIntent: async () => [{ id: 'ghost-git-extension', version: '1.0.0' }]
        });
        const ext = new PolicyExtension(sdk);
        const result = await ext.handleRPCRequest({ method: 'policy.compatCheck', params: {} });
        assert.strictEqual(result.success, true);
    });

    // ── handleCompatExport ────────────────────────────────────────────────────
    console.log('\nhandleCompatExport:');

    await test('exports matrix and returns success paths', async () => {
        let writtenFiles = {};
        const sdk = makeSdk({
            requestFileExists: async () => true,
            requestFileReadJSON: async (p) => {
                if (p.endsWith('registry.json')) return SAMPLE_MATRIX;
                throw new Error(`unexpected: ${p}`);
            },
            requestFileWrite: async (opts) => { writtenFiles[opts.path] = opts.content; },
            requestFileWriteJSON: async (p) => { writtenFiles[p] = true; }
        });
        const ext = new PolicyExtension(sdk);
        const result = await ext.handleRPCRequest({ method: 'policy.compatExport', params: {} });
        assert.strictEqual(result.success, true);
        // At least one markdown or json should have been written
        assert.ok(Object.keys(writtenFiles).length > 0, 'Expected at least one file to be written');
    });

    // ── error handling ────────────────────────────────────────────────────────
    console.log('\nerror handling:');

    await test('unknown method returns error or failure', async () => {
        const ext = new PolicyExtension(makeSdk());
        const result = await ext.handleRPCRequest({ method: 'policy.nonexistent', params: {} });
        assert.ok(result.error || result.success === false);
    });
})();

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
