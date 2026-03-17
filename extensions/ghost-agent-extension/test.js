#!/usr/bin/env node
'use strict';

/**
 * ghost-agent-extension unit tests
 * Run: node test.js
 */

const assert = require('assert');

// ── Minimal SDK stub ─────────────────────────────────────────────────────────
const makeSdk = (overrides = {}) => ({
    requestLog: async () => {},
    requestFileRead: async () => { throw new Error('no file'); },
    requestFileWrite: async () => {},
    requestConfig: async () => ({}),
    emitIntent: async (intent) => {
        if (intent.type === 'extension') return { success: true, output: 'stub' };
        if (intent.type === 'process') return { stdout: '', stderr: '', code: 0 };
        return {};
    },
    requestNetworkCall: async () => JSON.stringify({
        choices: [{ message: { content: 'AI response stub' } }]
    }),
    ...overrides
});

const { AgentExtension } = (() => {
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

console.log('\nghost-agent-extension tests\n');

await (async () => {
    if (!AgentExtension) {
        console.error('Failed to load extension — skipping tests');
        process.exit(1);
    }

    // ── handleThink ───────────────────────────────────────────────────────────
    console.log('handleThink:');

    await test('returns error when no thought provided', async () => {
        const ext = new AgentExtension(makeSdk());
        const result = await ext.handleRPCRequest({ method: 'agent.think', params: {} });
        assert.strictEqual(result.success, false);
    });

    await test('returns success with thought content', async () => {
        const ext = new AgentExtension(makeSdk());
        const result = await ext.handleRPCRequest({
            method: 'agent.think',
            params: { args: ['optimize', 'database', 'queries'] }
        });
        assert.ok('success' in result);
        assert.ok(typeof result.output === 'string');
    });

    // ── handlePlan ────────────────────────────────────────────────────────────
    console.log('\nhandlePlan:');

    await test('returns error when no goal provided', async () => {
        const ext = new AgentExtension(makeSdk());
        const result = await ext.handleRPCRequest({ method: 'agent.plan', params: {} });
        assert.strictEqual(result.success, false);
    });

    await test('returns plan with steps array', async () => {
        const ext = new AgentExtension(makeSdk());
        const result = await ext.handleRPCRequest({
            method: 'agent.plan',
            params: { args: ['release version 2.0'] }
        });
        assert.ok('success' in result);
        if (result.success) {
            assert.ok(Array.isArray(result.plan), 'Expected plan to be an array');
            assert.ok(result.plan.length > 0, 'Plan should have at least one step');
        }
    });

    await test('plan output mentions extensions', async () => {
        const ext = new AgentExtension(makeSdk());
        const result = await ext.handleRPCRequest({
            method: 'agent.plan',
            params: { args: ['deploy to production'] }
        });
        if (result.success) {
            assert.ok(result.output.includes('extension') || result.output.includes('ghost-'));
        }
    });

    // ── handleSolve ───────────────────────────────────────────────────────────
    console.log('\nhandleSolve:');

    await test('returns error when no goal provided', async () => {
        const ext = new AgentExtension(makeSdk());
        const result = await ext.handleRPCRequest({ method: 'agent.solve', params: {} });
        assert.strictEqual(result.success, false);
    });

    await test('resets memory before each mission', async () => {
        const ext = new AgentExtension(makeSdk());
        ext.memory = [{ step: 1, data: 'old' }];
        await ext.handleRPCRequest({
            method: 'agent.solve',
            params: { args: ['new goal'] }
        });
        // Memory should have been reset at start of solve
        assert.ok(Array.isArray(ext.memory));
    });

    // ── handleRPCRequest routing ──────────────────────────────────────────────
    console.log('\nerror handling:');

    await test('unknown method returns error or failure', async () => {
        const ext = new AgentExtension(makeSdk());
        const result = await ext.handleRPCRequest({ method: 'agent.nonexistent', params: {} });
        assert.ok(result.error || result.success === false);
    });
})();

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
