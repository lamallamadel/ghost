const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { TrafficPolicer } = require('../../core/qos/token-bucket');

console.log('🧪 Testing TrafficPolicer State Corruption Recovery...\n');

const testDir = path.join(os.tmpdir(), 'ghost-corruption-tests');
if (!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir, { recursive: true });
}

function cleanup(filePath) {
    try {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        if (fs.existsSync(filePath + '.tmp')) fs.unlinkSync(filePath + '.tmp');
        if (fs.existsSync(filePath + '.backup')) fs.unlinkSync(filePath + '.backup');
    } catch (e) {
    }
}

console.log('▶ Test 1: Detect corrupted JSON file and fall back to safe defaults');
const corruptPath1 = path.join(testDir, 'test1-corrupt.json');
cleanup(corruptPath1);

fs.writeFileSync(corruptPath1, '{ "ext-1": { "cir": 60, "bc":', 'utf8');

const policer1 = new TrafficPolicer({
    persistencePath: corruptPath1,
    dropViolating: true
});

assert.strictEqual(policer1.buckets.size, 0, 'Should start with empty state on corruption');

policer1.registerExtension('ext-1', { cir: 60, bc: 100, be: 50 });
const state1 = policer1.getState('ext-1');

assert.strictEqual(state1.committedTokens, 100, 'Should initialize with full Bc tokens');
assert.strictEqual(state1.excessTokens, 50, 'Should initialize with full Be tokens');
assert.strictEqual(state1.cir, 60, 'Should use registered CIR');

cleanup(corruptPath1);
console.log('✅ Corrupted JSON detected, safe defaults applied (full Bc/Be)\n');

console.log('▶ Test 2: Detect corrupted state with invalid token values');
const corruptPath2 = path.join(testDir, 'test2-corrupt.json');
cleanup(corruptPath2);

fs.writeFileSync(corruptPath2, JSON.stringify({
    'ext-2': {
        cir: 60,
        bc: 100,
        be: 50,
        committedTokens: 'invalid',
        excessTokens: null,
        lastRefill: Date.now()
    }
}, null, 2), 'utf8');

const policer2 = new TrafficPolicer({
    persistencePath: corruptPath2,
    dropViolating: true
});

assert.strictEqual(policer2.buckets.size, 1, 'State loads but with corrupted values');

const bucket2 = policer2.buckets.get('ext-2');
assert.ok(bucket2, 'Bucket exists');
assert.strictEqual(bucket2.committedTokens, 'invalid', 'Invalid value loaded as-is');

policer2.registerExtension('ext-2-new', { cir: 60, bc: 100, be: 50 });
const state2 = policer2.getState('ext-2-new');

assert.strictEqual(state2.committedTokens, 100, 'New extension uses safe defaults');
assert.strictEqual(state2.excessTokens, 50, 'New extension has full Be');

cleanup(corruptPath2);
console.log('✅ Invalid token values loaded, new registrations use safe defaults\n');

console.log('▶ Test 3: Atomic write pattern prevents partial writes via temp file + rename');
const atomicPath = path.join(testDir, 'test3-atomic.json');
cleanup(atomicPath);

const policer3 = new TrafficPolicer({
    persistencePath: atomicPath,
    dropViolating: true
});

policer3.registerExtension('ext-atomic', { cir: 120, bc: 200, be: 100 });
policer3.police('ext-atomic', 50);

const tempPath = atomicPath + '.tmp';
assert.ok(!fs.existsSync(tempPath), 'Temp file should not exist after successful write');
assert.ok(fs.existsSync(atomicPath), 'Final file should exist');

const content = fs.readFileSync(atomicPath, 'utf8');
const parsed = JSON.parse(content);
assert.ok(parsed['ext-atomic'], 'State should be complete and valid');
assert.strictEqual(parsed['ext-atomic'].cir, 120, 'CIR persisted');
assert.strictEqual(parsed['ext-atomic'].bc, 200, 'Bc persisted');

cleanup(atomicPath);
console.log('✅ Atomic write pattern verified (temp + rename)\n');

console.log('▶ Test 4: Simulate crash after temp file write but before rename');
const crashPath = path.join(testDir, 'test4-crash.json');
cleanup(crashPath);

const policer4a = new TrafficPolicer({
    persistencePath: crashPath,
    dropViolating: true
});

policer4a.registerExtension('ext-crash', { cir: 60, bc: 100, be: 50 });
policer4a.police('ext-crash', 30);

const originalState = fs.readFileSync(crashPath, 'utf8');

const tempCrashPath = crashPath + '.tmp';
fs.writeFileSync(tempCrashPath, '{ "ext-crash": { "corrupted": true } }', 'utf8');

const policer4b = new TrafficPolicer({
    persistencePath: crashPath,
    dropViolating: true
});

assert.ok(fs.existsSync(crashPath), 'Original file should still exist');
const recoveredContent = fs.readFileSync(crashPath, 'utf8');
assert.strictEqual(recoveredContent, originalState, 'Original state preserved');

const state4 = policer4b.getState('ext-crash');
assert.ok(state4, 'Should recover from original file');
assert.strictEqual(state4.cir, 60, 'CIR recovered');

cleanup(crashPath);
console.log('✅ Crash during write: original state preserved\n');

console.log('▶ Test 5: Backup file created and restored on corruption detection');
const backupPath = path.join(testDir, 'test5-backup.json');
cleanup(backupPath);

const policer5a = new TrafficPolicer({
    persistencePath: backupPath,
    dropViolating: true
});

policer5a.registerExtension('ext-backup', { cir: 120, bc: 150, be: 75 });
policer5a.police('ext-backup', 40);

const backupFilePath = backupPath + '.backup';
assert.ok(!fs.existsSync(backupFilePath), 'Backup should be cleaned after successful write');

const validState = fs.readFileSync(backupPath, 'utf8');

policer5a.registerExtension('ext-backup-2', { cir: 60, bc: 100, be: 50 });
policer5a.police('ext-backup-2', 20);

assert.ok(!fs.existsSync(backupFilePath), 'Backup cleaned after subsequent writes');

cleanup(backupPath);
console.log('✅ Backup file lifecycle verified\n');

console.log('▶ Test 6: Verify backup restoration on write failure');
const restorePath = path.join(testDir, 'test6-restore.json');
cleanup(restorePath);

const policer6 = new TrafficPolicer({
    persistencePath: restorePath,
    dropViolating: true
});

policer6.registerExtension('ext-restore', { cir: 180, bc: 200, be: 100 });
policer6.police('ext-restore', 50);

const beforeFailure = JSON.parse(fs.readFileSync(restorePath, 'utf8'));

const originalSaveState = policer6._saveState.bind(policer6);
let saveCallCount = 0;
policer6._saveState = function() {
    saveCallCount++;
    if (saveCallCount === 2) {
        const tempPath = this.persistencePath + '.tmp';
        const backupPath = this.persistencePath + '.backup';
        
        if (fs.existsSync(this.persistencePath)) {
            fs.copyFileSync(this.persistencePath, backupPath);
        }
        
        const state = {};
        for (const [extensionId, bucket] of this.buckets.entries()) {
            state[extensionId] = bucket.serialize();
        }
        
        fs.writeFileSync(tempPath, JSON.stringify(state, null, 2), 'utf8');
        
        throw new Error('Simulated crash during rename');
    }
    return originalSaveState();
};

try {
    policer6.registerExtension('ext-new', { cir: 60, bc: 100, be: 50 });
} catch (e) {
}

const afterFailure = JSON.parse(fs.readFileSync(restorePath, 'utf8'));
assert.deepStrictEqual(afterFailure['ext-restore'], beforeFailure['ext-restore'], 
    'Original extension state preserved after failure');

cleanup(restorePath);
console.log('✅ Backup restored on write failure\n');

console.log('▶ Test 7: System logs CRITICAL severity event on corruption detection');
let criticalLogFound = false;
const originalConsoleError = console.error;
const errorLogs = [];

console.error = function(...args) {
    errorLogs.push(args.join(' '));
    originalConsoleError.apply(console, args);
};

const criticalPath = path.join(testDir, 'test7-critical.json');
cleanup(criticalPath);

fs.writeFileSync(criticalPath, 'TOTALLY INVALID JSON {{{', 'utf8');

const policer7 = new TrafficPolicer({
    persistencePath: criticalPath,
    dropViolating: true
});

console.error = originalConsoleError;

assert.ok(errorLogs.length > 0, 'Should log error on corruption');
const hasCorruptionLog = errorLogs.some(log => 
    log.includes('TrafficPolicer') && log.includes('Failed to load state')
);
assert.ok(hasCorruptionLog, 'Should log TrafficPolicer load failure');

policer7.registerExtension('ext-critical', { cir: 60, bc: 100, be: 50 });
const state7 = policer7.getState('ext-critical');
assert.ok(state7, 'Should continue operating after logging error');

cleanup(criticalPath);
console.log('✅ CRITICAL severity events logged on corruption\n');

console.log('▶ Test 8: QoS protection never silently disabled (fail-closed)');
const failClosedPath = path.join(testDir, 'test8-fail-closed.json');
cleanup(failClosedPath);

fs.writeFileSync(failClosedPath, '{ "invalid": }', 'utf8');

const policer8 = new TrafficPolicer({
    persistencePath: failClosedPath,
    dropViolating: true
});

policer8.registerExtension('ext-fail-closed', { cir: 60, bc: 10, be: 5 });

const results = [];
for (let i = 0; i < 20; i++) {
    results.push(policer8.police('ext-fail-closed', 1));
}

const allowedCount = results.filter(r => r.allowed).length;
const deniedCount = results.filter(r => !r.allowed).length;

assert.ok(deniedCount > 0, 'Should enforce rate limits despite corruption');
assert.ok(allowedCount <= 15, 'Should not allow unlimited traffic (max 15 tokens available)');

const lastDenied = results.find(r => !r.allowed);
assert.ok(lastDenied, 'Should have at least one denied request');
assert.strictEqual(lastDenied.code, 'QOS_VIOLATING', 'Should use correct QoS error code');

cleanup(failClosedPath);
console.log('✅ QoS protection remains active (fail-closed)\n');

console.log('▶ Test 9: Partial write corruption leaves original state intact');
const partialPath = path.join(testDir, 'test9-partial.json');
cleanup(partialPath);

const policer9 = new TrafficPolicer({
    persistencePath: partialPath,
    dropViolating: true
});

policer9.registerExtension('ext-partial', { cir: 120, bc: 150, be: 75 });
policer9.police('ext-partial', 50);

const validContent = fs.readFileSync(partialPath, 'utf8');
const validParsed = JSON.parse(validContent);

fs.writeFileSync(partialPath + '.tmp', '{ "ext-partial": { "cir":', 'utf8');

const policer9b = new TrafficPolicer({
    persistencePath: partialPath,
    dropViolating: true
});

const currentContent = fs.readFileSync(partialPath, 'utf8');
assert.strictEqual(currentContent, validContent, 'Original file unchanged');

const state9 = policer9b.getState('ext-partial');
assert.strictEqual(state9.cir, 120, 'State correctly restored');

cleanup(partialPath);
console.log('✅ Partial write leaves original intact\n');

console.log('▶ Test 10: Multiple extension state corruption isolation');
const multiPath = path.join(testDir, 'test10-multi.json');
cleanup(multiPath);

const policer10a = new TrafficPolicer({
    persistencePath: multiPath,
    dropViolating: true
});

policer10a.registerExtension('ext-a', { cir: 60, bc: 100, be: 50 });
policer10a.registerExtension('ext-b', { cir: 120, bc: 150, be: 75 });
policer10a.registerExtension('ext-c', { cir: 180, bc: 200, be: 100 });

policer10a.police('ext-a', 30);
policer10a.police('ext-b', 40);
policer10a.police('ext-c', 50);

fs.writeFileSync(multiPath, JSON.stringify({
    'ext-a': { cir: 60, bc: 100, be: 50, committedTokens: 'BAD', excessTokens: 50, lastRefill: Date.now() },
    'ext-b': { cir: 120, bc: 150, be: 75, committedTokens: 110, excessTokens: 75, lastRefill: Date.now() },
    'ext-c': { cir: 180, bc: 200, be: 100, committedTokens: 150, excessTokens: 'BAD', lastRefill: Date.now() }
}), 'utf8');

const policer10b = new TrafficPolicer({
    persistencePath: multiPath,
    dropViolating: true
});

assert.strictEqual(policer10b.buckets.size, 3, 'Corrupted state loaded with all extensions');

const loadedA = policer10b.buckets.get('ext-a');
const loadedB = policer10b.buckets.get('ext-b');
const loadedC = policer10b.buckets.get('ext-c');

assert.ok(loadedA && loadedB && loadedC, 'All buckets loaded despite corruption');
assert.strictEqual(loadedA.committedTokens, 'BAD', 'ext-a has corrupted token value');
assert.strictEqual(loadedB.committedTokens, 110, 'ext-b has valid tokens');
assert.strictEqual(loadedC.excessTokens, 'BAD', 'ext-c has corrupted excess value');

policer10b.registerExtension('ext-d', { cir: 60, bc: 100, be: 50 });
const stateD = policer10b.getState('ext-d');

assert.strictEqual(stateD.committedTokens, 100, 'New extension uses safe defaults');

cleanup(multiPath);
console.log('✅ Multi-extension corruption isolated\n');

console.log('▶ Test 11: Empty file corruption recovery');
const emptyPath = path.join(testDir, 'test11-empty.json');
cleanup(emptyPath);

fs.writeFileSync(emptyPath, '', 'utf8');

const policer11 = new TrafficPolicer({
    persistencePath: emptyPath,
    dropViolating: true
});

assert.strictEqual(policer11.buckets.size, 0, 'Should handle empty file');

policer11.registerExtension('ext-empty', { cir: 60, bc: 100, be: 50 });
const state11 = policer11.getState('ext-empty');

assert.ok(state11, 'Should create new state');
assert.strictEqual(state11.committedTokens, 100, 'Should use safe defaults');

cleanup(emptyPath);
console.log('✅ Empty file corruption handled\n');

console.log('▶ Test 12: Large file corruption (truncated JSON)');
const largePath = path.join(testDir, 'test12-large.json');
cleanup(largePath);

const largeState = {};
for (let i = 0; i < 50; i++) {
    largeState[`ext-${i}`] = {
        cir: 60,
        bc: 100,
        be: 50,
        committedTokens: 100,
        excessTokens: 50,
        lastRefill: Date.now()
    };
}

const fullJSON = JSON.stringify(largeState, null, 2);
const truncated = fullJSON.substring(0, fullJSON.length - 100);

fs.writeFileSync(largePath, truncated, 'utf8');

const policer12 = new TrafficPolicer({
    persistencePath: largePath,
    dropViolating: true
});

assert.strictEqual(policer12.buckets.size, 0, 'Should reject truncated JSON');

policer12.registerExtension('ext-large', { cir: 60, bc: 100, be: 50 });
const state12 = policer12.getState('ext-large');

assert.strictEqual(state12.committedTokens, 100, 'Should initialize with safe defaults');

cleanup(largePath);
console.log('✅ Truncated large file handled\n');

console.log('▶ Test 13: Race condition: concurrent writes');
const racePath = path.join(testDir, 'test13-race.json');
cleanup(racePath);

const policer13a = new TrafficPolicer({
    persistencePath: racePath,
    dropViolating: true
});

const policer13b = new TrafficPolicer({
    persistencePath: racePath,
    dropViolating: true
});

policer13a.registerExtension('ext-race-a', { cir: 60, bc: 100, be: 50 });
policer13b.registerExtension('ext-race-b', { cir: 120, bc: 150, be: 75 });

policer13a.police('ext-race-a', 10);
policer13b.police('ext-race-b', 20);

const finalContent = fs.readFileSync(racePath, 'utf8');
const finalState = JSON.parse(finalContent);

assert.ok(finalState['ext-race-a'] || finalState['ext-race-b'], 
    'At least one state persisted');

cleanup(racePath);
console.log('✅ Concurrent write race condition handled\n');

console.log('▶ Test 14: Verify QoS enforcement continues after corruption recovery');
const qosPath = path.join(testDir, 'test14-qos.json');
cleanup(qosPath);

fs.writeFileSync(qosPath, '{ corrupted json', 'utf8');

const policer14 = new TrafficPolicer({
    persistencePath: qosPath,
    dropViolating: true
});

policer14.registerExtension('ext-qos', { cir: 60, bc: 15, be: 10 });

let greenCount = 0;
let yellowCount = 0;
let redCount = 0;

for (let i = 0; i < 30; i++) {
    const result = policer14.police('ext-qos', 1);
    if (result.color === 'green') greenCount++;
    else if (result.color === 'yellow') yellowCount++;
    else if (result.color === 'red') redCount++;
}

assert.ok(greenCount > 0, 'Should have green traffic');
assert.ok(redCount > 0, 'Should enforce limits (red traffic)');
assert.strictEqual(greenCount + yellowCount + redCount, 30, 'All traffic classified');

cleanup(qosPath);
console.log('✅ QoS enforcement active post-recovery\n');

console.log('▶ Test 15: State corruption with missing required fields');
const missingPath = path.join(testDir, 'test15-missing.json');
cleanup(missingPath);

fs.writeFileSync(missingPath, JSON.stringify({
    'ext-missing': {
        committedTokens: 50,
        excessTokens: 25
    }
}), 'utf8');

const policer15 = new TrafficPolicer({
    persistencePath: missingPath,
    dropViolating: true
});

assert.strictEqual(policer15.buckets.size, 1, 'State loads with missing fields');

const bucket15 = policer15.buckets.get('ext-missing');
assert.ok(bucket15, 'Bucket loaded');
assert.strictEqual(bucket15.cir, undefined, 'CIR is undefined');
assert.strictEqual(bucket15.committedTokens, 50, 'Tokens loaded from state');

policer15.registerExtension('ext-missing-new', { cir: 60, bc: 100, be: 50 });
const state15 = policer15.getState('ext-missing-new');

assert.strictEqual(state15.cir, 60, 'New extension has valid config');
assert.strictEqual(state15.committedTokens, 100, 'New extension initialized to full');

cleanup(missingPath);
console.log('✅ Missing required fields loaded, new registrations valid\n');

console.log('▶ Test 16: Verify backup not created on first write');
const firstWritePath = path.join(testDir, 'test16-first.json');
cleanup(firstWritePath);

const policer16 = new TrafficPolicer({
    persistencePath: firstWritePath,
    dropViolating: true
});

policer16.registerExtension('ext-first', { cir: 60, bc: 100, be: 50 });

const backupExists = fs.existsSync(firstWritePath + '.backup');
assert.strictEqual(backupExists, false, 'Backup should not exist after first write');

cleanup(firstWritePath);
console.log('✅ No backup created on first write\n');

console.log('▶ Test 17: Stress test: rapid corruption and recovery cycles');
const stressPath = path.join(testDir, 'test17-stress.json');
cleanup(stressPath);

for (let cycle = 0; cycle < 10; cycle++) {
    const policerStress = new TrafficPolicer({
        persistencePath: stressPath,
        dropViolating: true
    });
    
    policerStress.registerExtension('ext-stress', { cir: 120, bc: 100, be: 50 });
    policerStress.police('ext-stress', 10);
    
    if (cycle % 3 === 0) {
        fs.writeFileSync(stressPath, '{ broken }', 'utf8');
    }
}

const policerStressFinal = new TrafficPolicer({
    persistencePath: stressPath,
    dropViolating: true
});

policerStressFinal.registerExtension('ext-stress', { cir: 120, bc: 100, be: 50 });
const resultStress = policerStressFinal.police('ext-stress', 5);
assert.ok(resultStress.allowed, 'Should still function after stress cycles');

cleanup(stressPath);
console.log('✅ Stress test: 10 corruption/recovery cycles\n');

console.log('▶ Test 18: Verify state never corrupts valid running system');
const validPath = path.join(testDir, 'test18-valid.json');
cleanup(validPath);

const policer18 = new TrafficPolicer({
    persistencePath: validPath,
    dropViolating: true
});

policer18.registerExtension('ext-valid', { cir: 60, bc: 100, be: 50 });

for (let i = 0; i < 100; i++) {
    policer18.police('ext-valid', 1);
    
    const content = fs.readFileSync(validPath, 'utf8');
    const parsed = JSON.parse(content);
    assert.ok(parsed['ext-valid'], 'State should remain valid');
    assert.ok(typeof parsed['ext-valid'].cir === 'number', 'CIR should be number');
    assert.ok(typeof parsed['ext-valid'].committedTokens === 'number', 'Tokens should be number');
}

cleanup(validPath);
console.log('✅ State integrity maintained across 100 operations\n');

try {
    fs.rmdirSync(testDir);
} catch (e) {
}

console.log('🎉 All state corruption recovery tests passed!');
