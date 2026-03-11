const assert = require('assert');
const path = require('path');

// ─── Mock SDK ────────────────────────────────────────────────────────────────
class MockSDK {
    constructor() {
        this.intents = [];
        this.files = new Map();
        this.dirs = new Set();
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
        this.files.set(p, JSON.stringify(obj, null, 2));
        return { success: true };
    }

    async emitIntent(intent) {
        this.intents.push(intent);
        return { success: true };
    }
}

// ─── We need to reach ExtensionFlowFactory which uses `new ExtensionSDK()` in
//     its constructor. We monkey-patch the SDK module so the constructor returns
//     a MockSDK instance we control.
let capturedSdk;
const originalModule = require.cache[require.resolve('@ghost/extension-sdk')];

// Wrap the ExtensionSDK constructor to capture the instance
const realSdk = require('@ghost/extension-sdk');
const OriginalExtensionSDK = realSdk.ExtensionSDK;

class TrackingSDK extends OriginalExtensionSDK {
    constructor(...args) {
        super(...args);
        // Overlay the async methods with MockSDK behaviour but keep the instance
        const mock = new MockSDK();
        this._mock = mock;
        capturedSdk = this;
    }
}

// We cannot easily intercept `new ExtensionSDK()` inside the module without
// full DI. Instead, test the _loadLockfile logic directly by loading the class
// and replacing the sdk property with a MockSDK after construction.
// This is the standard Node.js unit testing pattern without a DI framework.

const { ExtensionFlowFactory } = (() => {
    // Temporarily replace ExtensionSDK so the constructor call inside
    // ExtensionFlowFactory uses our shim
    const sdkMod = require('@ghost/extension-sdk');

    // Patch
    const OrigSDK = sdkMod.ExtensionSDK;
    sdkMod.ExtensionSDK = class PatchedSDK {
        constructor() {
            this._mock = new MockSDK();
            capturedSdk = this._mock;
        }
        async requestFileExists(p) { return capturedSdk.requestFileExists(p); }
        async requestFileRead(p) { return capturedSdk.requestFileRead(p); }
        async requestFileReadJSON(p) { return capturedSdk.requestFileReadJSON(p); }
        async emitIntent(i) { return capturedSdk.emitIntent(i); }
    };

    const mod = require('../../extensions/ghost-extflo-extension/index');

    // Restore
    sdkMod.ExtensionSDK = OrigSDK;
    return mod;
})();

console.log('🧪 Testing ghost-extflo-extension boundary compliance...\n');

(async () => {
    // ─── Test 1: No direct fs imports ────────────────────────────────────────
    console.log('▶ Test 1: Extension must not import fs');
    const src = require('fs').readFileSync(
        path.join(__dirname, '../../extensions/ghost-extflo-extension/index.js'), 'utf8'
    );
    assert.ok(!src.includes("require('fs')"), "Must not require('fs')");
    assert.ok(!src.includes('require("fs")'), 'Must not require("fs")');
    console.log('  ✓ No direct fs import in source');
    console.log('✅ Source-level boundary check passed\n');

    // ─── Test 2: _loadLockfile() returns null when lockfile absent ────────────
    console.log('▶ Test 2: _loadLockfile() returns null when lockfile does not exist');
    const mock2 = new MockSDK();
    const factory2 = new ExtensionFlowFactory();
    factory2.sdk = mock2;

    const result = await factory2._loadLockfile();
    assert.strictEqual(result, null, '_loadLockfile should return null when file absent');
    console.log('  ✓ Returns null for missing lockfile');
    console.log('✅ _loadLockfile() handles missing file correctly\n');

    // ─── Test 3: _loadLockfile() reads via SDK when file exists ──────────────
    console.log('▶ Test 3: _loadLockfile() reads and parses lockfile via SDK');
    const mock3 = new MockSDK();
    const factory3 = new ExtensionFlowFactory();
    factory3.sdk = mock3;

    const lockData = {
        version: '1.0.0',
        extensions: [
            { id: 'ghost-git-extension', version: '1.2.0' },
            { id: 'ghost-security-extension', version: '1.1.0' }
        ]
    };
    mock3.files.set(factory3.lockPath, JSON.stringify(lockData));

    const loaded = await factory3._loadLockfile();
    assert.ok(loaded !== null, '_loadLockfile should return data when file exists');
    assert.strictEqual(loaded.version, '1.0.0', 'Should parse version');
    assert.strictEqual(loaded.extensions.length, 2, 'Should parse extensions array');
    assert.strictEqual(loaded.extensions[0].id, 'ghost-git-extension', 'Should parse extension IDs');
    console.log('  ✓ Lockfile parsed correctly via SDK');
    console.log('✅ _loadLockfile() reads and parses via SDK\n');

    // ─── Test 4: _loadLockfile() returns null on malformed JSON ──────────────
    console.log('▶ Test 4: _loadLockfile() returns null when JSON is malformed');
    const mock4 = new MockSDK();
    const factory4 = new ExtensionFlowFactory();
    factory4.sdk = mock4;
    mock4.files.set(factory4.lockPath, '{ this is not valid json !!');

    const badResult = await factory4._loadLockfile();
    assert.strictEqual(badResult, null, 'Should return null on malformed JSON (caught by try/catch)');
    console.log('  ✓ Malformed JSON returns null gracefully');
    console.log('✅ _loadLockfile() is resilient to malformed JSON\n');

    // ─── Test 5: _loadLockfile() uses requestFileExists before read ───────────
    console.log('▶ Test 5: _loadLockfile() checks file existence before reading');
    const mock5 = new MockSDK();
    const factory5 = new ExtensionFlowFactory();
    factory5.sdk = mock5;

    let existsCalled = false;
    let readCalled = false;
    mock5.requestFileExists = async (p) => {
        existsCalled = true;
        return false; // does not exist
    };
    mock5.requestFileReadJSON = async (p) => {
        readCalled = true;
        return null;
    };

    await factory5._loadLockfile();
    assert.ok(existsCalled, 'requestFileExists should be called');
    assert.ok(!readCalled, 'requestFileReadJSON should NOT be called when file absent');
    console.log('  ✓ Existence check performed before read');
    console.log('  ✓ No read attempted when file absent');
    console.log('✅ _loadLockfile() correctly short-circuits on missing file\n');

    // ─── Test 6: lockPath is derived from projectRoot (no hardcoded abs path) ─
    console.log('▶ Test 6: lockPath is relative to project root (no ad-hoc absolute paths)');
    const factory6 = new ExtensionFlowFactory();
    assert.ok(factory6.lockPath.endsWith('extensions.lock.json'), 'lockPath should end with extensions.lock.json');
    assert.ok(path.isAbsolute(factory6.lockPath), 'lockPath should be an absolute path resolved from projectRoot');
    console.log(`  ✓ lockPath resolved to: ${factory6.lockPath}`);
    console.log('✅ lockPath correctly resolved\n');

    console.log('🎉 All ghost-extflo-extension boundary compliance tests passed!');
})().catch(err => {
    console.error('❌ Test failed:', err);
    process.exit(1);
});
