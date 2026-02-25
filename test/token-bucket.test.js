const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { TrafficPolicer, SingleRateThreeColorTokenBucket } = require('../core/qos/token-bucket');

console.log('🧪 Testing Token Bucket Traffic Policing Engine...\n');

const testPersistencePath = path.join(os.tmpdir(), 'test-rate-limits.json');

console.log('▶ Test 1: Module imports');
assert.ok(TrafficPolicer, 'TrafficPolicer should be defined');
assert.ok(SingleRateThreeColorTokenBucket, 'SingleRateThreeColorTokenBucket should be defined');
console.log('✅ Modules imported successfully\n');

console.log('▶ Test 2: SingleRateThreeColorTokenBucket creation');
const bucket = new SingleRateThreeColorTokenBucket({
    cir: 60,
    bc: 100,
    be: 200
});
assert.strictEqual(bucket.cir, 60, 'CIR should be 60');
assert.strictEqual(bucket.bc, 100, 'Bc should be 100');
assert.strictEqual(bucket.be, 200, 'Be should be 200');
assert.strictEqual(bucket.committedTokens, 100, 'Initial committed tokens should equal Bc');
assert.strictEqual(bucket.excessTokens, 200, 'Initial excess tokens should equal Be');
console.log('✅ Token bucket created correctly\n');

console.log('▶ Test 3: Three-color classification');
const fixedTime = Date.now();
bucket.lastRefill = fixedTime;
const greenResult = bucket.classify(50);
assert.strictEqual(greenResult.color, 'green', 'First request should be green');
assert.strictEqual(greenResult.classification, 'Conforming', 'First request should be Conforming');
assert.strictEqual(greenResult.allowed, true, 'Green traffic should be allowed');

bucket.lastRefill = fixedTime;
const yellowResult = bucket.classify(60);
assert.strictEqual(yellowResult.color, 'yellow', 'Second request should be yellow');
assert.strictEqual(yellowResult.classification, 'Exceeding', 'Second request should be Exceeding');
assert.strictEqual(yellowResult.allowed, true, 'Yellow traffic should be allowed');

bucket.lastRefill = fixedTime;
bucket.classify(50);
bucket.lastRefill = fixedTime;
bucket.classify(140);
bucket.lastRefill = fixedTime;
const redResult = bucket.classify(1);
assert.strictEqual(redResult.color, 'red', 'Oversubscribed request should be red');
assert.strictEqual(redResult.classification, 'Violating', 'Oversubscribed request should be Violating');
assert.strictEqual(redResult.allowed, false, 'Red traffic should not be allowed');
console.log('✅ Three-color classification works correctly\n');

console.log('▶ Test 4: TrafficPolicer creation and registration');
if (fs.existsSync(testPersistencePath)) {
    fs.unlinkSync(testPersistencePath);
}

const policer = new TrafficPolicer({
    persistencePath: testPersistencePath,
    dropViolating: true
});

policer.registerExtension('test-ext', {
    cir: 30,
    bc: 50,
    be: 100
});

assert.ok(fs.existsSync(testPersistencePath), 'Persistence file should be created');
console.log('✅ TrafficPolicer created and extension registered\n');

console.log('▶ Test 5: Traffic policing');
const extBucket = policer.buckets.get('test-ext');
const fixedTime2 = Date.now();
extBucket.lastRefill = fixedTime2;
const policeGreen = policer.police('test-ext', 25);
assert.strictEqual(policeGreen.allowed, true, 'Within committed rate should be allowed');
assert.strictEqual(policeGreen.color, 'green', 'Should be classified as green');

extBucket.lastRefill = fixedTime2;
const policeYellow = policer.police('test-ext', 30);
assert.strictEqual(policeYellow.allowed, true, 'Within excess rate should be allowed');
assert.strictEqual(policeYellow.color, 'yellow', 'Should be classified as yellow');

extBucket.lastRefill = fixedTime2;
policer.police('test-ext', 25);
extBucket.lastRefill = fixedTime2;
policer.police('test-ext', 70);
extBucket.lastRefill = fixedTime2;
const policeRed = policer.police('test-ext', 1);
assert.strictEqual(policeRed.allowed, false, 'Violating traffic should be dropped');
assert.strictEqual(policeRed.color, 'red', 'Should be classified as red');
assert.strictEqual(policeRed.code, 'QOS_VIOLATING', 'Should have correct error code');
console.log('✅ Traffic policing works correctly\n');

console.log('▶ Test 6: State persistence');
const state = policer.getState('test-ext');
assert.ok(state, 'Should return state for registered extension');
assert.ok(state.committedTokens >= 0, 'Should have committed tokens value');
assert.ok(state.excessTokens >= 0, 'Should have excess tokens value');

const persistedData = JSON.parse(fs.readFileSync(testPersistencePath, 'utf8'));
assert.ok(persistedData['test-ext'], 'Extension state should be persisted');
console.log('✅ State persistence works correctly\n');

console.log('▶ Test 7: State restoration');
const policer2 = new TrafficPolicer({
    persistencePath: testPersistencePath,
    dropViolating: true
});
const restoredState = policer2.getState('test-ext');
assert.ok(restoredState, 'Should restore state from persistence file');
assert.strictEqual(restoredState.cir, 30, 'CIR should be restored');
assert.strictEqual(restoredState.committedCapacity, 50, 'Bc should be restored');
assert.strictEqual(restoredState.excessCapacity, 100, 'Be should be restored');
console.log('✅ State restoration works correctly\n');

console.log('▶ Test 8: Cleanup');
policer2.cleanup('test-ext');
const cleanedState = policer2.getState('test-ext');
assert.strictEqual(cleanedState, null, 'State should be null after cleanup');

fs.unlinkSync(testPersistencePath);
console.log('✅ Cleanup works correctly\n');

console.log('▶ Test 9: srTCM CIR refill formula accuracy');
const refillBucket = new SingleRateThreeColorTokenBucket({
    cir: 120,
    bc: 100,
    be: 50
});
refillBucket.committedTokens = 50;
refillBucket.excessTokens = 25;
refillBucket.lastRefill = Date.now() - 5000;

const stateAfter5Sec = refillBucket.getState();
const expectedTokens = (5 * 120) / 60;
assert.ok(Math.abs(stateAfter5Sec.committedTokens - (50 + expectedTokens)) < 0.01 || 
          stateAfter5Sec.committedTokens === 100,
    `After 5s at CIR=120/min, should add ${expectedTokens} tokens (formula: elapsed * CIR / 60)`);
console.log(`✅ CIR refill formula accurate: ${expectedTokens} tokens added in 5s\n`);

console.log('▶ Test 10: srTCM CIR refill with sub-second precision');
const precisionBucket = new SingleRateThreeColorTokenBucket({
    cir: 3600,
    bc: 200,
    be: 100
});
precisionBucket.committedTokens = 0;
precisionBucket.lastRefill = Date.now() - 500;

const stateAfter500Ms = precisionBucket.getState();
const expected500Ms = (0.5 * 3600) / 60;
assert.ok(Math.abs(stateAfter500Ms.committedTokens - expected500Ms) < 1,
    `After 500ms at CIR=3600/min (60/s), should add ~${expected500Ms} tokens`);
console.log(`✅ Sub-second refill precision: ${stateAfter500Ms.committedTokens} tokens after 500ms\n`);

console.log('▶ Test 11: Bc-to-Be overflow behavior when buckets at rest');
const overflowBucket = new SingleRateThreeColorTokenBucket({
    cir: 120,
    bc: 100,
    be: 50
});
overflowBucket.committedTokens = 100;
overflowBucket.excessTokens = 0;
overflowBucket.lastRefill = Date.now() - 10000;

const overflowState = overflowBucket.getState();
assert.strictEqual(overflowState.committedTokens, 100, 'Bc should be capped at capacity');
const expectedOverflow = ((10 * 120) / 60) - 0;
assert.ok(overflowState.excessTokens > 0 && overflowState.excessTokens <= 50,
    `Overflow should fill Be (capped at 50), got ${overflowState.excessTokens}`);
console.log(`✅ Bc-to-Be overflow: Bc full (100), Be received overflow (${overflowState.excessTokens})\n`);

console.log('▶ Test 12: Bc-to-Be overflow with partial Bc space');
const partialOverflowBucket = new SingleRateThreeColorTokenBucket({
    cir: 60,
    bc: 100,
    be: 100
});
partialOverflowBucket.committedTokens = 80;
partialOverflowBucket.excessTokens = 30;
partialOverflowBucket.lastRefill = Date.now() - 3000;

const partialState = partialOverflowBucket.getState();
const tokensAdded = (3 * 60) / 60;
const spaceInBc = 20;
const expectedCommitted = Math.min(100, 80 + Math.min(tokensAdded, spaceInBc));
const expectedExcessAdd = Math.max(0, tokensAdded - spaceInBc);
const expectedExcess = Math.min(100, 30 + expectedExcessAdd);

assert.strictEqual(partialState.committedTokens, expectedCommitted,
    `Bc should be ${expectedCommitted}, got ${partialState.committedTokens}`);
assert.ok(Math.abs(partialState.excessTokens - expectedExcess) < 0.01,
    `Be should be ~${expectedExcess}, got ${partialState.excessTokens}`);
console.log(`✅ Partial overflow: Bc=${partialState.committedTokens}, Be=${partialState.excessTokens}\n`);

console.log('▶ Test 13: Small burst using only Bc (green traffic)');
const smallBurstBucket = new SingleRateThreeColorTokenBucket({
    cir: 60,
    bc: 100,
    be: 50
});
smallBurstBucket.lastRefill = Date.now();

const burst1 = smallBurstBucket.classify(30);
assert.strictEqual(burst1.color, 'green', 'First 30 tokens should be green');
assert.strictEqual(burst1.state.committedTokens, 70, 'Should have 70 committed tokens left');
assert.strictEqual(burst1.state.excessTokens, 50, 'Excess tokens should be untouched');

const burst2 = smallBurstBucket.classify(40);
assert.strictEqual(burst2.color, 'green', 'Next 40 tokens should be green');
assert.strictEqual(burst2.state.committedTokens, 30, 'Should have 30 committed tokens left');
assert.strictEqual(burst2.state.excessTokens, 50, 'Excess tokens still untouched');
console.log(`✅ Small burst: Used only Bc (${burst2.state.committedTokens} remaining)\n`);

console.log('▶ Test 14: Medium burst using Bc + partial Be (yellow traffic)');
const mediumBurstBucket = new SingleRateThreeColorTokenBucket({
    cir: 60,
    bc: 50,
    be: 100
});
mediumBurstBucket.lastRefill = Date.now();

const mburst1 = mediumBurstBucket.classify(50);
assert.strictEqual(mburst1.color, 'green', 'First 50 should exhaust Bc (green)');
assert.strictEqual(mburst1.state.committedTokens, 0, 'Bc should be empty');

const mburst2 = mediumBurstBucket.classify(40);
assert.strictEqual(mburst2.color, 'yellow', 'Next 40 should use Be (yellow)');
assert.strictEqual(mburst2.state.committedTokens, 0, 'Bc still empty');
assert.strictEqual(mburst2.state.excessTokens, 60, 'Be should have 60 tokens remaining');

const mburst3 = mediumBurstBucket.classify(30);
assert.strictEqual(mburst3.color, 'yellow', 'Next 30 still uses partial Be (yellow)');
assert.strictEqual(mburst3.state.excessTokens, 30, 'Be should have 30 tokens remaining');
console.log(`✅ Medium burst: Used Bc fully + partial Be (${mburst3.state.excessTokens} Be remaining)\n`);

console.log('▶ Test 15: Large burst exhausting both Bc and Be (red traffic)');
const largeBurstBucket = new SingleRateThreeColorTokenBucket({
    cir: 60,
    bc: 30,
    be: 20
});
largeBurstBucket.lastRefill = Date.now();

const lburst1 = largeBurstBucket.classify(30);
assert.strictEqual(lburst1.color, 'green', 'Exhaust Bc (green)');

const lburst2 = largeBurstBucket.classify(20);
assert.strictEqual(lburst2.color, 'yellow', 'Exhaust Be (yellow)');

const lburst3 = largeBurstBucket.classify(1);
assert.strictEqual(lburst3.color, 'red', 'No tokens left (red)');
assert.strictEqual(lburst3.allowed, false, 'Red traffic should be denied');
assert.strictEqual(lburst3.state.committedTokens, 0, 'Bc exhausted');
assert.strictEqual(lburst3.state.excessTokens, 0, 'Be exhausted');
console.log(`✅ Large burst: Exhausted both buckets, traffic marked red\n`);

console.log('▶ Test 16: Combined burst scenario with all three colors');
const comboBucket = new SingleRateThreeColorTokenBucket({
    cir: 120,
    bc: 100,
    be: 50
});
comboBucket.lastRefill = Date.now();

const results = [];
results.push(comboBucket.classify(60));
results.push(comboBucket.classify(40));
results.push(comboBucket.classify(30));
results.push(comboBucket.classify(20));
results.push(comboBucket.classify(10));

assert.strictEqual(results[0].color, 'green', 'First 60 tokens: green');
assert.strictEqual(results[1].color, 'green', 'Next 40 tokens: green');
assert.strictEqual(results[2].color, 'yellow', 'Next 30 tokens: yellow');
assert.strictEqual(results[3].color, 'yellow', 'Next 20 tokens: yellow');
assert.strictEqual(results[4].color, 'red', 'Excess: red');
console.log(`✅ Three-color sequence: green→green→yellow→yellow→red\n`);

console.log('▶ Test 17: State persistence after simulated crash (write-verify-reload)');
const crashTestPath = path.join(os.tmpdir(), 'test-crash-recovery.json');
if (fs.existsSync(crashTestPath)) {
    fs.unlinkSync(crashTestPath);
}

const policerBeforeCrash = new TrafficPolicer({
    persistencePath: crashTestPath,
    dropViolating: true
});

policerBeforeCrash.registerExtension('crash-test', {
    cir: 90,
    bc: 150,
    be: 75
});

const crashBucket = policerBeforeCrash.buckets.get('crash-test');
crashBucket.committedTokens = 42;
crashBucket.excessTokens = 17;
crashBucket.lastRefill = Date.now() - 1000;
policerBeforeCrash._saveState();

const beforeCrashState = {
    committed: crashBucket.committedTokens,
    excess: crashBucket.excessTokens
};

const policerAfterCrash = new TrafficPolicer({
    persistencePath: crashTestPath,
    dropViolating: true
});

const recoveredBucket = policerAfterCrash.buckets.get('crash-test');
assert.ok(recoveredBucket, 'Bucket should be recovered after crash');
assert.strictEqual(recoveredBucket.cir, 90, 'CIR should match');
assert.strictEqual(recoveredBucket.bc, 150, 'Bc should match');
assert.strictEqual(recoveredBucket.be, 75, 'Be should match');

const afterCrashState = recoveredBucket.getState();
assert.ok(afterCrashState.committedTokens >= beforeCrashState.committed,
    'Committed tokens should be recovered + refilled');
assert.ok(afterCrashState.excessTokens >= beforeCrashState.excess,
    'Excess tokens should be recovered');

fs.unlinkSync(crashTestPath);
console.log(`✅ Crash recovery: State restored (Bc: ${beforeCrashState.committed}→${afterCrashState.committedTokens})\n`);

console.log('▶ Test 18: State persistence with multiple extensions after crash');
const multiCrashPath = path.join(os.tmpdir(), 'test-multi-crash.json');
if (fs.existsSync(multiCrashPath)) {
    fs.unlinkSync(multiCrashPath);
}

const multiPolicer = new TrafficPolicer({
    persistencePath: multiCrashPath,
    dropViolating: true
});

multiPolicer.registerExtension('ext-1', { cir: 60, bc: 100, be: 50 });
multiPolicer.registerExtension('ext-2', { cir: 120, bc: 200, be: 100 });
multiPolicer.registerExtension('ext-3', { cir: 30, bc: 50, be: 25 });

multiPolicer.police('ext-1', 30);
multiPolicer.police('ext-2', 50);
multiPolicer.police('ext-3', 15);

const states1 = multiPolicer.getAllStates();

const multiPolicer2 = new TrafficPolicer({
    persistencePath: multiCrashPath,
    dropViolating: true
});

assert.strictEqual(multiPolicer2.buckets.size, 3, 'Should restore all 3 extensions');
const states2 = multiPolicer2.getAllStates();
assert.ok(states2['ext-1'], 'ext-1 should be restored');
assert.ok(states2['ext-2'], 'ext-2 should be restored');
assert.ok(states2['ext-3'], 'ext-3 should be restored');

fs.unlinkSync(multiCrashPath);
console.log(`✅ Multi-extension crash recovery: All ${multiPolicer2.buckets.size} extensions restored\n`);

console.log('▶ Test 19: State restoration with corrupted file handling');
const corruptPath = path.join(os.tmpdir(), 'test-corrupt.json');
fs.writeFileSync(corruptPath, '{invalid json content', 'utf8');

const corruptPolicer = new TrafficPolicer({
    persistencePath: corruptPath,
    dropViolating: true
});

assert.strictEqual(corruptPolicer.buckets.size, 0, 'Should handle corrupt file gracefully');
corruptPolicer.registerExtension('new-ext', { cir: 60, bc: 100, be: 50 });
assert.strictEqual(corruptPolicer.buckets.size, 1, 'Should continue working after corruption');

fs.unlinkSync(corruptPath);
console.log(`✅ Corrupt file handling: Graceful recovery\n`);

console.log('▶ Test 20: Zero-token edge case in burst scenarios');
const zeroBucket = new SingleRateThreeColorTokenBucket({
    cir: 60,
    bc: 10,
    be: 10
});
zeroBucket.committedTokens = 0;
zeroBucket.excessTokens = 0;
zeroBucket.lastRefill = Date.now();

const zeroResult = zeroBucket.classify(0);
assert.strictEqual(zeroResult.allowed, true, 'Zero-token request should be allowed');
assert.strictEqual(zeroResult.color, 'green', 'Zero-token request should be green');
console.log(`✅ Zero-token edge case handled correctly\n`);

console.log('🎉 All token bucket tests passed!');
