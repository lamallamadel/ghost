#!/usr/bin/env node
'use strict';

/**
 * ghost-bridge-extension tests — Unit + Integration (real WebSocket)
 * Run: node test.js
 */

const assert = require('assert');
const WebSocket = require('ws');
const crypto = require('crypto');
const net = require('net');

// ── SDK stub ──────────────────────────────────────────────────────────────────

function makeSdk(overrides = {}) {
    return {
        requestLog: async () => {},
        requestFileRead: async () => { throw new Error('no config'); },
        requestFileWrite: async () => {},
        emitIntent: async (intent) => {
            if (intent.type === 'extension') {
                return { success: true, output: `stub:${intent.params.method}` };
            }
            return {};
        },
        ...overrides
    };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

function getFreePort() {
    return new Promise((resolve, reject) => {
        const server = net.createServer();
        server.listen(0, '127.0.0.1', () => {
            const port = server.address().port;
            server.close(() => resolve(port));
        });
        server.on('error', reject);
    });
}

function wsConnect(port) {
    return new Promise((resolve, reject) => {
        const ws = new WebSocket(`ws://127.0.0.1:${port}`);
        ws.once('open', () => resolve(ws));
        ws.once('error', reject);
    });
}

// Wait for the next message that has an `id` (response), skipping notifications
function wsResponse(ws, expectedId, timeoutMs = 4000) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`Timeout waiting for id=${expectedId}`)), timeoutMs);
        function onMsg(data) {
            const msg = JSON.parse(data.toString());
            if (msg.id === expectedId) {
                clearTimeout(timer);
                ws.off('message', onMsg);
                resolve(msg);
            }
        }
        ws.on('message', onMsg);
    });
}

// Wait for any next message (notifications + responses)
function wsNextMsg(ws, timeoutMs = 4000) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Timeout waiting for next message')), timeoutMs);
        ws.once('message', (data) => {
            clearTimeout(timer);
            resolve(JSON.parse(data.toString()));
        });
    });
}

// Collect messages for a given window
function wsCollect(ws, durationMs = 500) {
    return new Promise((resolve) => {
        const msgs = [];
        function onMsg(data) { msgs.push(JSON.parse(data.toString())); }
        ws.on('message', onMsg);
        setTimeout(() => { ws.off('message', onMsg); resolve(msgs); }, durationMs);
    });
}

// ── Runner ────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────

async function runTests() {
    const { BridgeExtension } = require('./extension.js');

    // ══════════════════════════════════════════════════════════════════════════
    // UNIT TESTS
    // ══════════════════════════════════════════════════════════════════════════

    console.log('\nghost-bridge-extension — Unit Tests\n');

    // ── _verifyToken ──────────────────────────────────────────────────────────
    console.log('_verifyToken:');

    await test('returns false when no config and no env var', async () => {
        const ext = new BridgeExtension(makeSdk());
        assert.strictEqual(await ext._verifyToken('any-token'), false);
    });

    await test('returns true when token matches GHOST_BRIDGE_TOKEN env', async () => {
        process.env.GHOST_BRIDGE_TOKEN = 'env-secret-123';
        const ext = new BridgeExtension(makeSdk());
        const ok = await ext._verifyToken('env-secret-123');
        delete process.env.GHOST_BRIDGE_TOKEN;
        assert.strictEqual(ok, true);
    });

    await test('returns false for wrong env token', async () => {
        process.env.GHOST_BRIDGE_TOKEN = 'env-secret-123';
        const ext = new BridgeExtension(makeSdk());
        const ok = await ext._verifyToken('not-the-right-one');
        delete process.env.GHOST_BRIDGE_TOKEN;
        assert.strictEqual(ok, false);
    });

    await test('returns true when token matches ghostrc bridge.token', async () => {
        const sdk = makeSdk({
            requestFileRead: async () => JSON.stringify({ bridge: { token: 'cfg-bridge-tok' } })
        });
        const ext = new BridgeExtension(sdk);
        assert.strictEqual(await ext._verifyToken('cfg-bridge-tok'), true);
    });

    await test('returns true when token matches ghostrc marketplace.token', async () => {
        const sdk = makeSdk({
            requestFileRead: async () => JSON.stringify({ marketplace: { token: 'mkt-tok-42' } })
        });
        const ext = new BridgeExtension(sdk);
        assert.strictEqual(await ext._verifyToken('mkt-tok-42'), true);
    });

    // ── handleStatus — offline ────────────────────────────────────────────────
    console.log('\nstatus (offline):');

    await test('returns OFFLINE when server not started', async () => {
        const ext = new BridgeExtension(makeSdk());
        const r = await ext.handleRPCRequest({ method: 'bridge.status', params: {} });
        assert.strictEqual(r.success, true);
        assert.ok(r.output.includes('OFFLINE'), `Expected OFFLINE, got: ${r.output}`);
    });

    await test('reports 0 sessions when offline', async () => {
        const ext = new BridgeExtension(makeSdk());
        const r = await ext.handleRPCRequest({ method: 'bridge.status', params: {} });
        assert.strictEqual(r.sessions, 0);
    });

    // ── handleStop — when not running ─────────────────────────────────────────
    console.log('\nstop (when not running):');

    await test('returns failure when not running', async () => {
        const ext = new BridgeExtension(makeSdk());
        const r = await ext.handleRPCRequest({ method: 'bridge.stop', params: {} });
        assert.strictEqual(r.success, false);
    });

    // ── RPC routing ───────────────────────────────────────────────────────────
    console.log('\nRPC routing:');

    await test('unknown CLI method returns error', async () => {
        const ext = new BridgeExtension(makeSdk());
        const r = await ext.handleRPCRequest({ method: 'bridge.nonexistent', params: {} });
        assert.ok(r.error || r.success === false);
    });

    // ══════════════════════════════════════════════════════════════════════════
    // INTEGRATION TESTS — real WebSocket
    // ══════════════════════════════════════════════════════════════════════════

    console.log('\nghost-bridge-extension — Integration Tests (real WebSocket)\n');

    const TEST_TOKEN = `bridge-test-${crypto.randomBytes(4).toString('hex')}`;
    process.env.GHOST_BRIDGE_TOKEN = TEST_TOKEN;

    const port = await getFreePort();
    const ext = new BridgeExtension(makeSdk());
    let clientWs;

    // ── Lifecycle ─────────────────────────────────────────────────────────────
    console.log('server lifecycle:');

    await test('start returns success and binds a port', async () => {
        const r = await ext.handleRPCRequest({ method: 'bridge.start', params: { flags: { port } } });
        assert.strictEqual(r.success, true);
        assert.ok(r.output.includes('listening'), `Output: ${r.output}`);
        assert.strictEqual(typeof r.port, 'number');
    });

    await test('start returns failure if already running', async () => {
        const r = await ext.handleRPCRequest({ method: 'bridge.start', params: { flags: { port } } });
        assert.strictEqual(r.success, false);
    });

    await test('status is ONLINE with 0 sessions after start', async () => {
        const r = await ext.handleRPCRequest({ method: 'bridge.status', params: {} });
        assert.ok(r.output.includes('ONLINE'), `Output: ${r.output}`);
        assert.strictEqual(r.sessions, 0);
    });

    // ── Connection + auth ─────────────────────────────────────────────────────
    console.log('\nconnection + auth:');

    await test('client connects and receives ghost.connected notification', async () => {
        // Register the message listener BEFORE the WebSocket connects to avoid the race
        // where the server sends ghost.connected synchronously during the open event cycle.
        const ws = new WebSocket(`ws://127.0.0.1:${port}`);
        clientWs = ws;
        const msg = await new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('Timeout waiting for ghost.connected')), 4000);
            ws.once('message', (data) => { clearTimeout(timer); resolve(JSON.parse(data.toString())); });
            ws.once('error', (e) => { clearTimeout(timer); reject(e); });
        });
        assert.strictEqual(msg.method, 'ghost.connected');
        assert.ok(typeof msg.params?.sessionId === 'string');
        assert.ok(msg.params.sessionId.startsWith('sess_'));
        assert.strictEqual(msg.params.authRequired, true);
    });

    await test('unauthenticated call returns -32001', async () => {
        clientWs.send(JSON.stringify({ jsonrpc: '2.0', id: 99, method: 'git.status', params: {} }));
        const msg = await wsResponse(clientWs, 99);
        assert.ok(msg.error, 'Expected an error');
        assert.strictEqual(msg.error.code, -32001);
    });

    await test('ghost.auth with wrong token returns error', async () => {
        clientWs.send(JSON.stringify({ jsonrpc: '2.0', id: 10, method: 'ghost.auth', params: { token: 'bad', editor: 'Test' } }));
        const msg = await wsResponse(clientWs, 10);
        assert.ok(msg.error, `Expected error, got: ${JSON.stringify(msg)}`);
    });

    await test('ghost.auth with correct token returns authenticated:true', async () => {
        clientWs.send(JSON.stringify({ jsonrpc: '2.0', id: 11, method: 'ghost.auth', params: { token: TEST_TOKEN, editor: 'VS Code' } }));
        const msg = await wsResponse(clientWs, 11);
        assert.ok(msg.result, `Expected result, got: ${JSON.stringify(msg.error)}`);
        assert.strictEqual(msg.result.authenticated, true);
    });

    await test('ghost.ping returns pong:true after auth', async () => {
        clientWs.send(JSON.stringify({ jsonrpc: '2.0', id: 12, method: 'ghost.ping', params: {} }));
        const msg = await wsResponse(clientWs, 12);
        assert.strictEqual(msg.result?.pong, true);
    });

    await test('status reports 1 session with editor name', async () => {
        const r = await ext.handleRPCRequest({ method: 'bridge.status', params: {} });
        assert.strictEqual(r.sessions, 1);
        assert.ok(r.output.includes('VS Code'), `Expected "VS Code" in output: ${r.output}`);
    });

    // ── Proxy ─────────────────────────────────────────────────────────────────
    console.log('\nproxy:');

    await test('git.status proxied to ghost-git-extension returns result', async () => {
        const collectPromise = wsCollect(clientWs, 600);
        clientWs.send(JSON.stringify({ jsonrpc: '2.0', id: 20, method: 'git.status', params: {} }));
        const msgs = await collectPromise;

        const response = msgs.find(m => m.id === 20);
        assert.ok(response, 'Expected response for id=20');
        assert.ok(response.result || response.error, 'Expected result or error');
        if (response.result) {
            assert.strictEqual(response.result.success, true);
        }
    });

    await test('proxy sends ghost.progress notifications (dispatching + done)', async () => {
        const collectPromise = wsCollect(clientWs, 600);
        clientWs.send(JSON.stringify({ jsonrpc: '2.0', id: 21, method: 'security.scan', params: {} }));
        const msgs = await collectPromise;

        const progressEvents = msgs
            .filter(m => m.method === 'ghost.progress')
            .map(m => m.params?.status);
        assert.ok(progressEvents.includes('dispatching'), `Missing "dispatching". Got: ${JSON.stringify(progressEvents)}`);
        assert.ok(progressEvents.includes('done'), `Missing "done". Got: ${JSON.stringify(progressEvents)}`);
    });

    await test('method without dot returns error (not a crash)', async () => {
        clientWs.send(JSON.stringify({ jsonrpc: '2.0', id: 30, method: 'nodot', params: {} }));
        const msg = await wsResponse(clientWs, 30);
        assert.ok(msg.error, `Expected error for methodwithout dot: ${JSON.stringify(msg)}`);
    });

    await test('malformed JSON returns parse error', async () => {
        clientWs.send('{ not valid json }');
        const msg = await wsNextMsg(clientWs, 2000);
        assert.ok(msg.error, 'Expected parse error');
        assert.strictEqual(msg.error.code, -32700);
    });

    // ── Shutdown ──────────────────────────────────────────────────────────────
    console.log('\nshutdown:');

    await test('stop succeeds and closes the server', async () => {
        const r = await ext.handleRPCRequest({ method: 'bridge.stop', params: {} });
        assert.strictEqual(r.success, true);
        // Give the server time to fully close
        await wait(300);
    });

    await test('status is OFFLINE after stop', async () => {
        const r = await ext.handleRPCRequest({ method: 'bridge.status', params: {} });
        assert.ok(r.output.includes('OFFLINE'), `Expected OFFLINE after stop: ${r.output}`);
    });

    await test('new connection is refused after stop', async () => {
        let refused = false;
        try {
            await wsConnect(port);
        } catch (e) {
            refused = true;
        }
        assert.strictEqual(refused, true, 'Expected connection refused after server stop');
    });

    // Cleanup
    delete process.env.GHOST_BRIDGE_TOKEN;
    if (clientWs && clientWs.readyState === WebSocket.OPEN) clientWs.terminate();

    // ── Summary ───────────────────────────────────────────────────────────────
    console.log(`\n${'='.repeat(50)}`);
    console.log(`Tests: ${passed + failed}   ✓ ${passed}   ✗ ${failed}`);
    console.log(`${'='.repeat(50)}`);
    process.exit(failed > 0 ? 1 : 0);
}

if (require.main === module) {
    runTests().catch((err) => {
        console.error('\nFatal error:', err.message);
        process.exit(1);
    });
}

module.exports = { runTests };
