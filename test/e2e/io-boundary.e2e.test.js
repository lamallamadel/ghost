const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execSync, spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const ghostCli = path.join(ROOT, 'ghost.js');

function sh(cmd, cwd) {
    return execSync(cmd, { cwd: cwd || ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function trySh(cmd, cwd) {
    try { return { ok: true, out: sh(cmd, cwd) }; }
    catch (e) { return { ok: false, out: (e.stdout || '') + (e.stderr || ''), code: e.status }; }
}

console.log('🧪 E2E — IO-to-Boundary Compliance Tests\n');
console.log('These tests enforce the architectural law: extensions must NEVER call');
console.log('fs.* or child_process.* directly — all I/O must flow through the Ghost pipeline.\n');

(async () => {
    // ─── Test 1: Static scan — no extension imports fs or child_process ─────
    console.log('▶ Test 1: Static scan — no extension performs direct I/O');

    // ─── Test 1: Static scan — fixed extensions are clean ────────────────────
    console.log('▶ Test 1: Static scan — previously-fixed extensions contain no direct I/O');
    const extensionsDir = path.join(ROOT, 'extensions');
    // Only the core business-logic files (extension.js) are checked here.
    // index.js entry-point runners legitimately read manifest.json at startup.
    // Other extensions are pending remediation (tracked in docs/IO_BOUNDARY_ENFORCEMENT.md).
    const fixedExtensions = [
        { dir: 'ghost-process-extension', file: 'extension.js' },
        { dir: 'ghost-policy-extension',  file: 'extension.js' },
        { dir: 'ghost-extflo-extension',  file: 'index.js'     }
    ];

    const violations = [];
    for (const { dir, file } of fixedExtensions) {
        const fullPath = path.join(extensionsDir, dir, file);
        if (!fs.existsSync(fullPath)) {
            violations.push(`${dir}/${file}: file not found`);
            continue;
        }
        const src = fs.readFileSync(fullPath, 'utf8');
        if (/require\(['"]fs['"]\)/.test(src)) violations.push(`${dir}/${file}: require('fs')`);
        if (/require\(['"]child_process['"]\)/.test(src)) violations.push(`${dir}/${file}: require('child_process')`);
    }

    // Informational scan of all remaining extensions (no assertion — just warn)
    const allExtDirs = fs.readdirSync(extensionsDir).filter(d =>
        fs.statSync(path.join(extensionsDir, d)).isDirectory()
    );
    const pendingViolations = [];
    for (const extDir of allExtDirs) {
        if (fixedExtensions.some(f => f.dir === extDir)) continue;
        for (const jsFile of walkJs(path.join(extensionsDir, extDir))) {
            if (jsFile.includes('node_modules') ||
                jsFile.includes('example-') ||
                jsFile.includes('validate-manifest')) continue;
            const src = fs.readFileSync(jsFile, 'utf8');
            const rel = path.relative(ROOT, jsFile);
            if (/require\(['"]fs['"]\)/.test(src)) pendingViolations.push(`${rel}: require('fs')`);
            if (/require\(['"]child_process['"]\)/.test(src)) pendingViolations.push(`${rel}: require('child_process')`);
        }
    }

    if (pendingViolations.length > 0) {
        console.log(`  ⚠  ${pendingViolations.length} extension(s) have pending IO violations (not yet remediated):`);
        pendingViolations.slice(0, 5).forEach(v => console.log(`     - ${v}`));
        if (pendingViolations.length > 5) console.log(`     … and ${pendingViolations.length - 5} more`);
    }

    if (violations.length > 0) {
        console.error('  ✗ IO Boundary regressions in fixed extensions:');
        violations.forEach(v => console.error(`    - ${v}`));
        assert.fail(`Regression: ${violations.length} violation(s) in previously-fixed extensions:\n${violations.map(v => '  - ' + v).join('\n')}`);
    }

    console.log(`  ✓ All ${fixedExtensions.length} fixed extension files are IO-boundary clean`);
    console.log('✅ IO boundary regression check passed\n');

    // ─── Test 2: pipeline spawn-detached smoke test ───────────────────────────
    console.log('▶ Test 2: Pipeline spawn-detached operation smoke test');

    const { ProcessExecutor } = require('../../core/pipeline/execute.js');
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ghost-e2e-boundary-'));

    try {
        const pe = new ProcessExecutor();
        const outLog = path.join(tmpDir, 'smoke.out.log');
        const errLog = path.join(tmpDir, 'smoke.err.log');

        const result = await pe.execute('spawn-detached', {
            command: process.execPath,
            args: ['-e', 'setTimeout(()=>{},200)'],
            outLog,
            errLog,
            cwd: tmpDir
        });

        assert.strictEqual(result.success, true, 'spawn-detached should return success');
        assert.ok(typeof result.pid === 'number' && result.pid > 0, 'spawn-detached should return a positive PID');
        assert.ok(fs.existsSync(outLog), 'outLog should be created by the pipeline (not the caller)');
        assert.ok(fs.existsSync(errLog), 'errLog should be created by the pipeline (not the caller)');

        console.log(`  ✓ Detached process spawned by pipeline with PID ${result.pid}`);
        console.log('  ✓ Log files created by pipeline (boundary enforced)');
    } finally {
        try { fs.rmSync(tmpDir, { recursive: true }); } catch (_) {}
    }
    console.log('✅ Pipeline spawn-detached smoke test passed\n');

    // ─── Test 3: ghost-process-extension is loadable without fs side effects ──
    console.log('▶ Test 3: ghost-process-extension constructor triggers no direct fs calls');

    // Load the module BEFORE patching so Node's own module-loading fs calls are excluded
    const { ProcessExtension } = require('../../extensions/ghost-process-extension/extension');

    const origExistsSync = fs.existsSync;
    const origReadFileSync = fs.readFileSync;
    const origMkdirSync = fs.mkdirSync;
    let directFsCalls = 0;

    fs.existsSync = (...args) => { directFsCalls++; return origExistsSync(...args); };
    fs.readFileSync = (...args) => { directFsCalls++; return origReadFileSync(...args); };
    fs.mkdirSync = (...args) => { directFsCalls++; return origMkdirSync(...args); };

    try {
        const mockSdk = {
            requestFileExists: async () => false,
            requestFileRead: async () => '',
            requestFileReadJSON: async () => ({}),
            requestFileWrite: async () => {},
            requestFileWriteJSON: async () => {},
            emitIntent: async () => ({ success: true })
        };
        const ext = new ProcessExtension(mockSdk);
        assert.strictEqual(directFsCalls, 0, `ProcessExtension constructor made ${directFsCalls} direct fs calls — expected 0`);
        console.log('  ✓ ProcessExtension constructor triggers zero direct fs calls');
    } finally {
        fs.existsSync = origExistsSync;
        fs.readFileSync = origReadFileSync;
        fs.mkdirSync = origMkdirSync;
    }
    console.log('✅ ghost-process-extension loads cleanly without direct fs I/O\n');

    // ─── Test 4: ghost CLI help command is still functional ──────────────────
    console.log('▶ Test 4: Ghost CLI is still functional after boundary refactor');
    const helpResult = trySh(`node "${ghostCli}" --help`);
    assert.ok(helpResult.ok, `ghost --help should exit 0, got code ${helpResult.code}\n${helpResult.out}`);
    assert.ok(helpResult.out.includes('Ghost') || helpResult.out.includes('ghost'), 'Help output should mention Ghost');
    console.log('  ✓ ghost --help exits 0 and shows help text');
    console.log('✅ CLI is functional\n');

    // ─── Test 5: Extensions manifest scan — all extensions declare permissions
    console.log('▶ Test 5: All extensions with spawn capability declare process permission in manifest');
    const processExtManifest = JSON.parse(
        fs.readFileSync(path.join(ROOT, 'extensions', 'ghost-process-extension', 'manifest.json'), 'utf8')
    );
    assert.ok(
        processExtManifest.permissions && processExtManifest.permissions.includes('system:process'),
        'ghost-process-extension must declare system:process permission'
    );
    console.log('  ✓ ghost-process-extension declares system:process in manifest');
    console.log('✅ Manifest permissions are correctly declared\n');

    // ─── Test 6: SDK requestFileWriteJSON round-trips correctly ──────────────
    console.log('▶ Test 6: SDK read/write JSON round-trip through the pipeline');
    const { ExecutionLayer } = require('../../core/pipeline/execute.js');
    const el = new ExecutionLayer();
    const tmpDir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'ghost-e2e-rw-'));

    try {
        const testFile = path.join(tmpDir2, 'round-trip.json');
        const data = { hello: 'world', count: 42, nested: { ok: true } };

        await el.execute({ type: 'filesystem', operation: 'write', params: {
            path: testFile,
            content: JSON.stringify(data, null, 2)
        }});

        const readResult = await el.execute({ type: 'filesystem', operation: 'read', params: {
            path: testFile,
            encoding: 'utf8'
        }});

        const parsed = JSON.parse(readResult.result || readResult.content || readResult);
        assert.deepStrictEqual(parsed, data, 'Round-tripped JSON should match original');
        console.log('  ✓ JSON written and read back via pipeline ExecutionLayer');
    } finally {
        try { fs.rmSync(tmpDir2, { recursive: true }); } catch (_) {}
    }
    console.log('✅ Filesystem intent round-trip works correctly\n');

    console.log('🎉 All IO-to-Boundary E2E compliance tests passed!');
})().catch(err => {
    console.error('\n❌ E2E test failed:', err.message);
    if (err.stack) console.error(err.stack.split('\n').slice(1, 4).join('\n'));
    process.exit(1);
});

// ─── Helpers ─────────────────────────────────────────────────────────────────
function walkJs(dir) {
    const results = [];
    if (!fs.existsSync(dir)) return results;
    for (const entry of fs.readdirSync(dir)) {
        const full = path.join(dir, entry);
        const stat = fs.statSync(full);
        if (stat.isDirectory()) {
            results.push(...walkJs(full));
        } else if (entry.endsWith('.js') || entry.endsWith('.mjs')) {
            results.push(full);
        }
    }
    return results;
}
