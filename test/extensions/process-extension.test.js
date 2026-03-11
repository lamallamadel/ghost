const assert = require('assert');
const path = require('path');
const os = require('os');

// ─── Mock SDK ────────────────────────────────────────────────────────────────
class MockSDK {
    constructor() {
        this.intents = [];
        this.files = new Map();     // path → string content
        this.dirs = new Set();
        this.deleted = new Set();
    }

    async requestFileExists(p) {
        return this.files.has(p) || this.dirs.has(p);
    }

    async requestFileRead({ path: p }) {
        if (!this.files.has(p)) throw Object.assign(new Error(`ENOENT: ${p}`), { code: 'ENOENT' });
        return this.files.get(p);
    }

    async requestFileReadJSON(p) {
        const raw = await this.requestFileRead({ path: p });
        return JSON.parse(raw);
    }

    async requestFileWrite({ path: p, content }) {
        this.files.set(p, content);
        return { success: true };
    }

    async requestFileWriteJSON(p, obj) {
        return this.requestFileWrite({ path: p, content: JSON.stringify(obj, null, 2) });
    }

    async emitIntent(intent) {
        this.intents.push(intent);
        if (intent.type === 'filesystem' && intent.operation === 'mkdir') {
            this.dirs.add(intent.params.path);
            return { success: true };
        }
        if (intent.type === 'filesystem' && intent.operation === 'unlink') {
            this.files.delete(intent.params.path);
            this.deleted.add(intent.params.path);
            return { success: true };
        }
        if (intent.type === 'process' && intent.operation === 'spawn-detached') {
            return { success: true, pid: 99999, result: { pid: 99999 } };
        }
        return { success: true };
    }

    lastIntent(type, operation) {
        return [...this.intents].reverse().find(i => i.type === type && i.operation === operation);
    }
}

// ─── Load the extension under test ───────────────────────────────────────────
const { ProcessExtension } = require('../../extensions/ghost-process-extension/extension');

console.log('🧪 Testing ghost-process-extension boundary compliance...\n');

(async () => {
    // ─── Test 1: No direct fs or child_process imports ───────────────────────
    console.log('▶ Test 1: Extension must not import fs or child_process');
    const src = require('fs').readFileSync(
        path.join(__dirname, '../../extensions/ghost-process-extension/extension.js'), 'utf8'
    );
    assert.ok(!src.includes("require('fs')"), "Must not require('fs')");
    assert.ok(!src.includes('require("fs")'), 'Must not require("fs")');
    assert.ok(!src.includes("require('child_process')"), "Must not require('child_process')");
    assert.ok(!src.includes('require("child_process")'), 'Must not require("child_process")');
    console.log('  ✓ No direct fs or child_process imports');
    console.log('✅ Source-level boundary check passed\n');

    // ─── Test 2: initialize() uses SDK for dirs and services file ────────────
    console.log('▶ Test 2: initialize() creates dirs and services file via SDK');
    const sdk = new MockSDK();
    const ext = new ProcessExtension(sdk);

    await ext.initialize();

    const mkdirIntents = sdk.intents.filter(i => i.type === 'filesystem' && i.operation === 'mkdir');
    assert.ok(mkdirIntents.length >= 2, `Expected ≥2 mkdir intents, got ${mkdirIntents.length}`);
    assert.ok(
        mkdirIntents.some(i => i.params.path === ext.runDir),
        'Should create runDir via intent'
    );
    assert.ok(
        mkdirIntents.some(i => i.params.path === ext.configDir),
        'Should create configDir via intent'
    );
    assert.ok(sdk.files.has(ext.servicesFile), 'Should write default services.json via SDK');

    const services = JSON.parse(sdk.files.get(ext.servicesFile));
    assert.ok(services.telemetry, 'Default services.json should include telemetry');
    assert.ok(services.webhook, 'Default services.json should include webhook');
    console.log('  ✓ mkdir intents emitted for runDir and configDir');
    console.log('  ✓ Default services.json written via SDK');
    console.log('✅ initialize() is fully boundary-compliant\n');

    // ─── Test 3: initialize() skips creation if dirs already exist ───────────
    console.log('▶ Test 3: initialize() is idempotent — skips if already exists');
    const sdk2 = new MockSDK();
    const ext2 = new ProcessExtension(sdk2);
    sdk2.dirs.add(ext2.runDir);
    sdk2.dirs.add(ext2.configDir);
    sdk2.files.set(ext2.servicesFile, '{"existing": true}');

    sdk2.intents = [];
    await ext2.initialize();

    const mkdirIntents2 = sdk2.intents.filter(i => i.type === 'filesystem' && i.operation === 'mkdir');
    assert.strictEqual(mkdirIntents2.length, 0, 'Should not emit mkdir if dirs already exist');
    assert.strictEqual(sdk2.files.get(ext2.servicesFile), '{"existing": true}', 'Should not overwrite existing services file');
    console.log('  ✓ No redundant mkdir or write when already initialized');
    console.log('✅ initialize() is idempotent\n');

    // ─── Test 4: _loadServices() reads via SDK ────────────────────────────────
    console.log('▶ Test 4: _loadServices() reads via SDK requestFileReadJSON');
    const sdk3 = new MockSDK();
    const ext3 = new ProcessExtension(sdk3);
    sdk3.files.set(ext3.servicesFile, JSON.stringify({ 'myapp': { cmd: 'node', args: ['app.js'] } }));

    const svc = await ext3._loadServices();
    assert.ok(svc.myapp, 'Should return parsed services');
    assert.strictEqual(svc.myapp.cmd, 'node', 'Should parse cmd correctly');
    console.log('✅ _loadServices() reads via SDK\n');

    // ─── Test 5: handleList() queries files via SDK ───────────────────────────
    console.log('▶ Test 5: handleList() checks PID files via SDK');
    const sdk4 = new MockSDK();
    const ext4 = new ProcessExtension(sdk4);
    sdk4.files.set(ext4.servicesFile, JSON.stringify({ 'svc-a': { cmd: 'node', args: [] } }));

    const listResult = await ext4.handleList({});
    assert.strictEqual(listResult.success, true, 'handleList should return success:true');
    assert.ok(typeof listResult.output === 'string', 'handleList should return output string');
    assert.ok(listResult.output.includes('svc-a'), 'Output should mention the service name');
    console.log('  ✓ handleList returns success and includes service names');
    console.log('✅ handleList() is boundary-compliant\n');

    // ─── Test 6: handleStart() emits process:spawn-detached intent ───────────
    console.log('▶ Test 6: handleStart() emits process:spawn-detached intent via SDK');
    const sdk5 = new MockSDK();
    const ext5 = new ProcessExtension(sdk5);
    sdk5.files.set(ext5.servicesFile, JSON.stringify({
        'worker': { cmd: 'node', args: ['worker.js'] }
    }));

    const startResult = await ext5.handleStart({ args: ['worker'] });
    assert.strictEqual(startResult.success, true, `handleStart should succeed, got: ${startResult.output}`);

    const spawnIntent = sdk5.lastIntent('process', 'spawn-detached');
    assert.ok(spawnIntent, 'Should emit process:spawn-detached intent');
    assert.strictEqual(spawnIntent.params.command, 'node', 'command should come from services allowlist');
    assert.deepStrictEqual(spawnIntent.params.args, ['worker.js'], 'args should come from services allowlist');
    assert.ok(spawnIntent.params.outLog, 'outLog path should be in intent params');
    assert.ok(spawnIntent.params.errLog, 'errLog path should be in intent params');

    assert.ok(sdk5.files.has(ext5._getPaths('worker').pid), 'PID file should be written via SDK');
    assert.ok(sdk5.files.has(ext5._getPaths('worker').state), 'State file should be written via SDK');
    assert.ok(!sdk5.files.has(ext5._getPaths('worker').lock), 'Lock file should be removed after start');
    console.log('  ✓ process:spawn-detached intent emitted with correct command/args');
    console.log('  ✓ PID file written via SDK');
    console.log('  ✓ Lock file removed via SDK unlink intent');
    console.log('✅ handleStart() is boundary-compliant\n');

    // ─── Test 7: handleStart() rejects unlisted service ──────────────────────
    console.log('▶ Test 7: handleStart() rejects service not in allowlist');
    const sdk6 = new MockSDK();
    const ext6 = new ProcessExtension(sdk6);
    sdk6.files.set(ext6.servicesFile, JSON.stringify({ 'safe-svc': { cmd: 'node', args: [] } }));

    const badStart = await ext6.handleStart({ args: ['evil-cmd'] });
    assert.strictEqual(badStart.success, false, 'Should reject unlisted service');
    assert.ok(badStart.output.includes('not in the allowlist'), 'Error should mention allowlist');
    const spawnIntentBad = sdk6.lastIntent('process', 'spawn-detached');
    assert.ok(!spawnIntentBad, 'Should NOT emit spawn intent for unlisted service');
    console.log('  ✓ Unlisted service rejected without emitting spawn intent');
    console.log('✅ handleStart() enforces allowlist\n');

    // ─── Test 8: handleStop() cleans up files via SDK ────────────────────────
    console.log('▶ Test 8: handleStop() cleans up PID/state/lock via SDK intents');
    const sdk7 = new MockSDK();
    const ext7 = new ProcessExtension(sdk7);
    sdk7.files.set(ext7.servicesFile, JSON.stringify({ 'stale': { cmd: 'node', args: [] } }));

    // Simulate stale PID (no running process)
    const stalePidPath = ext7._getPaths('stale').pid;
    sdk7.files.set(stalePidPath, '99999999'); // Very unlikely to be running

    const stopResult = await ext7.handleStop({ args: ['stale'] });
    assert.strictEqual(stopResult.success, true, 'handleStop should return success');

    const unlinkIntents = sdk7.intents.filter(i => i.type === 'filesystem' && i.operation === 'unlink');
    assert.ok(unlinkIntents.length >= 1, `Expected ≥1 unlink intents, got ${unlinkIntents.length}`);
    assert.ok(
        unlinkIntents.some(i => i.params.path === stalePidPath),
        'PID file should be unlinked via intent'
    );
    console.log('  ✓ PID cleanup emitted as filesystem:unlink intents');
    console.log('✅ handleStop() is boundary-compliant\n');

    // ─── Test 9: handleStop() returns early when no PID file ─────────────────
    console.log('▶ Test 9: handleStop() returns gracefully when service is not running');
    const sdk8 = new MockSDK();
    const ext8 = new ProcessExtension(sdk8);
    sdk8.files.set(ext8.servicesFile, JSON.stringify({ 'ghost': { cmd: 'node', args: [] } }));

    const stopNotRunning = await ext8.handleStop({ args: ['ghost'] });
    assert.strictEqual(stopNotRunning.success, true, 'Should return success even if not running');
    console.log('  ✓ handleStop is graceful when service was not running');
    console.log('✅ handleStop() edge case handled\n');

    console.log('🎉 All ghost-process-extension boundary compliance tests passed!');
})().catch(err => {
    console.error('❌ Test failed:', err);
    process.exit(1);
});
