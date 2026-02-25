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

console.log('🎉 All token bucket tests passed!');
