const assert = require('assert');
const path = require('path');
const os = require('os');
const fs = require('fs');
const {
    ProcessExecutor,
    ExecutionError
} = require('../core/pipeline/execute.js');

console.log('🧪 Testing ProcessExecutor spawn-detached operation...\n');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ghost-spawn-detached-'));

(async () => {
    // ─── Test 1: execute() dispatches spawn-detached ───────────────────────
    console.log('▶ Test 1: execute() dispatches spawn-detached operation');
    const pe = new ProcessExecutor();

    const outLog = path.join(tmpDir, 'test1.out.log');
    const errLog = path.join(tmpDir, 'test1.err.log');

    const result = await pe.execute('spawn-detached', {
        command: process.execPath,
        args: ['-e', 'setTimeout(()=>{},500)'],
        outLog,
        errLog,
        cwd: tmpDir
    });

    assert.strictEqual(result.success, true, 'success should be true');
    assert.ok(typeof result.pid === 'number', `pid should be a number, got ${typeof result.pid}`);
    assert.ok(result.pid > 0, `pid should be positive, got ${result.pid}`);
    assert.ok(result.result && result.result.pid === result.pid, 'result.result.pid should match top-level pid');
    console.log(`  ✓ Detached process spawned with PID ${result.pid}`);
    console.log('✅ spawn-detached dispatched and returned PID\n');

    // ─── Test 2: execute() still dispatches regular spawn ──────────────────
    console.log('▶ Test 2: execute() still dispatches regular spawn operation');
    const spawnResult = await pe.execute('spawn', {
        command: process.execPath,
        args: ['-e', 'process.exit(0)'],
        cwd: tmpDir
    });
    assert.strictEqual(spawnResult.success, true, 'Regular spawn should succeed');
    assert.strictEqual(spawnResult.exitCode, 0, 'Exit code should be 0');
    console.log('✅ Regular spawn still works after adding spawn-detached\n');

    // ─── Test 3: spawn-detached creates log files ───────────────────────────
    console.log('▶ Test 3: spawn-detached creates outLog and errLog files');
    const outLog3 = path.join(tmpDir, 'test3.out.log');
    const errLog3 = path.join(tmpDir, 'test3.err.log');

    await pe.execute('spawn-detached', {
        command: process.execPath,
        args: ['-e', 'console.log("hello"); setTimeout(()=>{},300)'],
        outLog: outLog3,
        errLog: errLog3,
        cwd: tmpDir
    });

    assert.ok(fs.existsSync(outLog3), 'outLog file should exist after spawn-detached');
    assert.ok(fs.existsSync(errLog3), 'errLog file should exist after spawn-detached');
    console.log('  ✓ outLog and errLog created by pipeline (not extension)');
    console.log('✅ Log files created inside ExecutionLayer, not by extension\n');

    // ─── Test 4: spawn-detached is fire-and-forget (no error on bad cmd) ────────
    console.log('▶ Test 4: spawn-detached is fire-and-forget — resolves before child exits');
    // Detached processes are unreffed immediately. The pipeline does not track their
    // exit status. This is by design: we hand the process to the OS and move on.
    // A bad command will get a PID assigned then fail asynchronously — that is
    // the caller's responsibility to detect via the PID file / state file.
    const quickLog = path.join(tmpDir, 'quick.log');
    const quickResult = await pe.execute('spawn-detached', {
        command: process.execPath,
        args: ['-e', 'process.exit(1)'], // exits with failure, but we don't wait
        outLog: quickLog,
        errLog: quickLog,
        cwd: tmpDir
    });
    assert.strictEqual(quickResult.success, true, 'spawn-detached should resolve even if child will exit non-zero');
    assert.ok(typeof quickResult.pid === 'number', 'PID should be a number');
    console.log(`  ✓ spawn-detached resolves immediately with PID ${quickResult.pid} (fire-and-forget)`);
    console.log('✅ spawn-detached correctly implements fire-and-forget semantics\n');

    // ─── Test 5: unknown operation still throws ──────────────────────────────
    console.log('▶ Test 5: execute() throws on unknown operation');
    try {
        await pe.execute('spawn-teleport', {});
        assert.fail('Should throw on unknown operation');
    } catch (err) {
        assert.ok(err.message.includes('spawn-teleport'), `Expected operation name in error, got: ${err.message}`);
        console.log('  ✓ Unknown operation correctly rejected');
    }
    console.log('✅ Unknown operations rejected\n');

    // ─── Cleanup ─────────────────────────────────────────────────────────────
    try { fs.rmSync(tmpDir, { recursive: true }); } catch (_) {}

    console.log('🎉 All pipeline spawn-detached tests passed!');
})().catch(err => {
    console.error('❌ Test failed:', err);
    try { fs.rmSync(tmpDir, { recursive: true }); } catch (_) {}
    process.exit(1);
});
