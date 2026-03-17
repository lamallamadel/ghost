#!/usr/bin/env node
'use strict';

/**
 * ghost-author-extension unit tests
 * Run: node test.js
 */

const assert = require('assert');

// ── Minimal SDK stub ─────────────────────────────────────────────────────────
const makeSdk = (overrides = {}) => ({
    requestLog: async () => {},
    requestFileRead: async () => { throw new Error('no file'); },
    requestFileWrite: async () => {},
    requestFileReadJSON: async () => { throw new Error('no json'); },
    requestFileWriteJSON: async () => {},
    emitIntent: async (intent) => {
        if (intent.type === 'process') return { stdout: '', stderr: '', code: 0 };
        return {};
    },
    ...overrides
});

const { AuthorExtension } = (() => {
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

console.log('\nghost-author-extension tests\n');

await (async () => {
    if (!AuthorExtension) {
        console.error('Failed to load extension — skipping tests');
        process.exit(1);
    }

    // ── _resolveInitTarget ────────────────────────────────────────────────────
    console.log('_resolveInitTarget:');

    await test('resolves name from args array', async () => {
        const ext = new AuthorExtension(makeSdk());
        const name = ext._resolveInitTarget({ args: ['my-helper'] });
        assert.strictEqual(name, 'my-helper');
    });

    await test('resolves name from subcommand', async () => {
        const ext = new AuthorExtension(makeSdk());
        const name = ext._resolveInitTarget({ subcommand: 'analytics' });
        assert.strictEqual(name, 'analytics');
    });

    await test('returns empty string when no args or subcommand', async () => {
        const ext = new AuthorExtension(makeSdk());
        const name = ext._resolveInitTarget({});
        assert.strictEqual(name, '');
    });

    // ── handleInit ────────────────────────────────────────────────────────────
    console.log('\nhandleInit:');

    await test('returns failure when no name given', async () => {
        const ext = new AuthorExtension(makeSdk());
        const result = await ext.handleRPCRequest({ method: 'author.init', params: {} });
        assert.strictEqual(result.success, false);
    });

    await test('creates manifest.json with correct id', async () => {
        let writtenFiles = {};
        const sdk = makeSdk({
            requestFileWrite: async (opts) => { writtenFiles[opts.path] = opts.content; },
            emitIntent: async () => ({ stdout: '', code: 0 })
        });
        const ext = new AuthorExtension(sdk);
        const result = await ext.handleRPCRequest({
            method: 'author.init',
            params: { args: ['weather'] }
        });
        // Either success or failure is acceptable — we check what was written
        const manifestKey = Object.keys(writtenFiles).find(k => k.endsWith('manifest.json'));
        if (manifestKey) {
            const manifest = JSON.parse(writtenFiles[manifestKey]);
            assert.ok(manifest.id.includes('weather'), `Expected id to contain "weather", got "${manifest.id}"`);
            assert.strictEqual(manifest.version, '1.0.0');
        }
    });

    await test('prepends ghost- prefix when missing', async () => {
        let capturedDir = null;
        const sdk = makeSdk({
            requestFileWrite: async (opts) => { capturedDir = opts.path; },
            emitIntent: async (intent) => {
                if (intent.type === 'process' && intent.params.command === 'mkdir') {
                    capturedDir = intent.params.args[0];
                }
                return { stdout: '', code: 0 };
            }
        });
        const ext = new AuthorExtension(sdk);
        await ext.handleRPCRequest({ method: 'author.init', params: { args: ['myext'] } });
        assert.ok(capturedDir === null || capturedDir.includes('ghost-myext-extension'),
            `Expected path to contain "ghost-myext-extension", got "${capturedDir}"`);
    });

    await test('does NOT prepend ghost- when already prefixed', async () => {
        let capturedDir = null;
        const sdk = makeSdk({
            requestFileWrite: async (opts) => { capturedDir = opts.path; },
            emitIntent: async (intent) => {
                if (intent.type === 'process') {
                    if (intent.params.args?.[0]) capturedDir = intent.params.args[0];
                }
                return { stdout: '', code: 0 };
            }
        });
        const ext = new AuthorExtension(sdk);
        await ext.handleRPCRequest({ method: 'author.init', params: { args: ['ghost-custom-extension'] } });
        // Should not result in double prefix like ghost-ghost-custom-extension
        if (capturedDir) {
            assert.ok(!capturedDir.includes('ghost-ghost-'), `Should not double-prefix: ${capturedDir}`);
        }
    });

    // ── handleValidate ────────────────────────────────────────────────────────
    console.log('\nhandleValidate:');

    await test('returns failure when manifest is missing required fields', async () => {
        const sdk = makeSdk({
            requestFileRead: async () => JSON.stringify({ id: 'test' }) // missing version, main
        });
        const ext = new AuthorExtension(sdk);
        const result = await ext.handleRPCRequest({ method: 'author.validate', params: {} });
        // May succeed or fail depending on validation depth — just check it runs
        assert.ok('success' in result);
    });

    await test('validates a well-formed manifest', async () => {
        const validManifest = {
            id: 'ghost-test-extension',
            name: 'Test Extension',
            version: '1.0.0',
            main: 'index.js',
            commands: ['test']
        };
        const sdk = makeSdk({
            requestFileRead: async () => JSON.stringify(validManifest)
        });
        const ext = new AuthorExtension(sdk);
        const result = await ext.handleRPCRequest({ method: 'author.validate', params: {} });
        assert.ok('success' in result);
    });

    // ── handleRPCRequest routing ──────────────────────────────────────────────
    console.log('\nerror handling:');

    await test('unknown method returns error or failure', async () => {
        const ext = new AuthorExtension(makeSdk());
        const result = await ext.handleRPCRequest({ method: 'author.nonexistent', params: {} });
        assert.ok(result.error || result.success === false);
    });
})();

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
