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
        if (intent.type === 'filesystem' && intent.operation === 'mkdir') {
            this.dirs.add(intent.params.path);
        }
        if (intent.type === 'system' && intent.operation === 'registry') {
            return [
                { id: 'ghost-git-extension', version: '1.0.0' },
                { id: 'ghost-security-extension', version: '1.0.0' }
            ];
        }
        return { success: true };
    }

    lastIntent(type, operation) {
        return [...this.intents].reverse().find(i => i.type === type && i.operation === operation);
    }

    intentsOf(type, operation) {
        return this.intents.filter(i => i.type === type && i.operation === operation);
    }
}

// ─── Sample matrix fixture ────────────────────────────────────────────────────
const SAMPLE_MATRIX = {
    schema: '1.0',
    core: { version: '1.0.0' },
    extensions: {
        'ghost-git-extension': { version: '1.0.0', core_range: '>=1.0.0', stability: 'stable', security: { vuln_status: 'clean' }, capabilities: ['git'] },
        'ghost-security-extension': { version: '1.0.0', core_range: '>=1.0.0', stability: 'stable', security: { vuln_status: 'clean' }, capabilities: ['security'] }
    },
    policies: {
        capability_overlaps: { git: ['ghost-git-extension'] }
    }
};

const SAMPLE_PKG = { version: '1.0.0', name: 'ghost' };

// ─── Load extension under test ────────────────────────────────────────────────
const { PolicyExtension } = require('../../extensions/ghost-policy-extension/extension');

console.log('🧪 Testing ghost-policy-extension boundary compliance...\n');

(async () => {
    // ─── Test 1: No direct fs imports ────────────────────────────────────────
    console.log('▶ Test 1: Extension must not import fs');
    const src = require('fs').readFileSync(
        path.join(__dirname, '../../extensions/ghost-policy-extension/extension.js'), 'utf8'
    );
    assert.ok(!src.includes("require('fs')"), "Must not require('fs')");
    assert.ok(!src.includes('require("fs")'), 'Must not require("fs")');
    console.log('  ✓ No direct fs import in source');
    console.log('✅ Source-level boundary check passed\n');

    // ─── Test 2: _loadMatrix() is async and uses SDK ─────────────────────────
    console.log('▶ Test 2: _loadMatrix() reads via SDK requestFileReadJSON');
    const sdk = new MockSDK();
    const ext = new PolicyExtension(sdk);
    sdk.files.set(ext.matrixPath, JSON.stringify(SAMPLE_MATRIX));

    const matrix = await ext._loadMatrix();
    assert.deepStrictEqual(matrix.core, SAMPLE_MATRIX.core, 'Should return parsed matrix');
    assert.ok(matrix.extensions['ghost-git-extension'], 'Extensions should be present');
    console.log('  ✓ _loadMatrix() returns parsed JSON via SDK');
    console.log('✅ _loadMatrix() is async and boundary-compliant\n');

    // ─── Test 3: _loadMatrix() throws when file absent ───────────────────────
    console.log('▶ Test 3: _loadMatrix() throws when matrix file is absent');
    const sdk2 = new MockSDK();
    const ext2 = new PolicyExtension(sdk2);

    try {
        await ext2._loadMatrix();
        assert.fail('Should throw when matrix file absent');
    } catch (err) {
        assert.ok(err.message.includes('Matrix file not found'), `Expected "Matrix file not found", got: ${err.message}`);
        console.log('  ✓ Throws descriptive error when matrix absent');
    }
    console.log('✅ _loadMatrix() error handling is correct\n');

    // ─── Test 4: _loadPackageJson() is async and uses SDK ────────────────────
    console.log('▶ Test 4: _loadPackageJson() reads via SDK requestFileReadJSON');
    const sdk3 = new MockSDK();
    const ext3 = new PolicyExtension(sdk3);
    const pkgPath = require('path').join(ext3.projectRoot, 'package.json');
    sdk3.files.set(pkgPath, JSON.stringify(SAMPLE_PKG));

    const pkg = await ext3._loadPackageJson();
    assert.strictEqual(pkg.version, '1.0.0', 'Should parse package.json version');
    console.log('✅ _loadPackageJson() is async and boundary-compliant\n');

    // ─── Test 5: handleCompatStatus() uses SDK for all reads ─────────────────
    console.log('▶ Test 5: handleCompatStatus() uses SDK (no fs calls)');
    const sdk4 = new MockSDK();
    const ext4 = new PolicyExtension(sdk4);
    sdk4.files.set(ext4.matrixPath, JSON.stringify(SAMPLE_MATRIX));
    sdk4.files.set(path.join(ext4.projectRoot, 'package.json'), JSON.stringify(SAMPLE_PKG));

    const statusResult = await ext4.handleCompatStatus({});
    assert.strictEqual(statusResult.success, true, `handleCompatStatus should succeed, got: ${statusResult.output}`);
    assert.ok(statusResult.output.includes('1.0.0'), 'Output should include core version');
    console.log('  ✓ handleCompatStatus returns success with version info');
    console.log('✅ handleCompatStatus() is boundary-compliant\n');

    // ─── Test 6: handleCompatExport() emits mkdir + write intents ────────────
    console.log('▶ Test 6: handleCompatExport() emits mkdir + write intents via SDK');
    const sdk5 = new MockSDK();
    const ext5 = new PolicyExtension(sdk5);
    sdk5.files.set(ext5.matrixPath, JSON.stringify(SAMPLE_MATRIX));

    const docsDir = path.join(ext5.projectRoot, 'docs');
    const exportResult = await ext5.handleCompatExport({});
    assert.strictEqual(exportResult.success, true, `handleCompatExport should succeed, got: ${exportResult.output}`);

    const mkdirIntents = sdk5.intentsOf('filesystem', 'mkdir');
    assert.ok(mkdirIntents.length > 0, 'Should emit mkdir intent for docs dir');
    assert.ok(
        mkdirIntents.some(i => i.params.path === docsDir),
        'mkdir intent should target docs directory'
    );

    const jsonOut = path.join(docsDir, 'compat-matrix.json');
    const mdOut = path.join(docsDir, 'compat-matrix.md');
    assert.ok(sdk5.files.has(jsonOut), 'compat-matrix.json should be written via SDK');
    assert.ok(sdk5.files.has(mdOut), 'compat-matrix.md should be written via SDK');

    const exported = JSON.parse(sdk5.files.get(jsonOut));
    assert.deepStrictEqual(exported.core, SAMPLE_MATRIX.core, 'Exported JSON should match matrix');

    const mdContent = sdk5.files.get(mdOut);
    assert.ok(mdContent.includes('# Ghost Compatibility Matrix'), 'MD should have heading');
    assert.ok(mdContent.includes('ghost-git-extension'), 'MD should include extension names');
    console.log('  ✓ mkdir intent emitted for docs directory');
    console.log('  ✓ compat-matrix.json written via SDK');
    console.log('  ✓ compat-matrix.md written via SDK');
    console.log('✅ handleCompatExport() is boundary-compliant\n');

    // ─── Test 7: handleCompatExport() skips mkdir if docs dir exists ─────────
    console.log('▶ Test 7: handleCompatExport() skips mkdir if docs dir already exists');
    const sdk6 = new MockSDK();
    const ext6 = new PolicyExtension(sdk6);
    sdk6.files.set(ext6.matrixPath, JSON.stringify(SAMPLE_MATRIX));
    sdk6.dirs.add(path.join(ext6.projectRoot, 'docs'));

    const exportResult2 = await ext6.handleCompatExport({});
    assert.strictEqual(exportResult2.success, true, 'Should succeed even if docs dir exists');
    const mkdirIntents2 = sdk6.intentsOf('filesystem', 'mkdir');
    assert.strictEqual(mkdirIntents2.length, 0, 'Should NOT emit mkdir when docs dir exists');
    console.log('  ✓ No redundant mkdir when docs dir already exists');
    console.log('✅ handleCompatExport() is idempotent\n');

    // ─── Test 8: handleCompatCheck() uses SDK and reports violations ──────────
    console.log('▶ Test 8: handleCompatCheck() returns violations via SDK reads');
    const violationMatrix = JSON.parse(JSON.stringify(SAMPLE_MATRIX));
    violationMatrix.extensions['ghost-git-extension'].core_range = '>=99.0.0';

    const sdk7 = new MockSDK();
    const ext7 = new PolicyExtension(sdk7);
    sdk7.files.set(ext7.matrixPath, JSON.stringify(violationMatrix));
    sdk7.files.set(path.join(ext7.projectRoot, 'package.json'), JSON.stringify(SAMPLE_PKG));

    const checkResult = await ext7.handleCompatCheck({});
    assert.strictEqual(checkResult.success, false, 'Should report failure when violations exist');
    assert.strictEqual(checkResult.code, 'MATRIX_VIOLATION', 'Should include violation code');
    console.log('  ✓ Violations correctly detected and reported');
    console.log('✅ handleCompatCheck() is boundary-compliant and detects violations\n');

    // ─── Test 9: handleVerifyPlan() awaits _loadMatrix() ────────────────────
    console.log('▶ Test 9: handleVerifyPlan() uses async _loadMatrix()');
    const sdk8 = new MockSDK();
    const ext8 = new PolicyExtension(sdk8);
    sdk8.files.set(ext8.matrixPath, JSON.stringify(SAMPLE_MATRIX));

    const planGood = await ext8.handleVerifyPlan({ plan: ['ghost-git-extension'] });
    assert.strictEqual(planGood.success, true, 'Known extension should pass plan verification');

    const planBad = await ext8.handleVerifyPlan({ plan: ['ghost-mystery-extension'] });
    assert.strictEqual(planBad.success, false, 'Unknown extension should fail plan verification');
    console.log('  ✓ Valid plan approved');
    console.log('  ✓ Unknown extension rejected by policy');
    console.log('✅ handleVerifyPlan() is async and boundary-compliant\n');

    console.log('🎉 All ghost-policy-extension boundary compliance tests passed!');
})().catch(err => {
    console.error('❌ Test failed:', err);
    process.exit(1);
});
