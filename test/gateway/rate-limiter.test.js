const assert = require('assert');
const { TokenBucket, RateLimitManager } = require('../../core/pipeline/auth');
const { SingleRateThreeColorTokenBucket, TrafficPolicer } = require('../../core/qos/token-bucket');

console.log('🧪 Testing Rate Limiter and Token Bucket Math...\n');

// Test 1: Basic TokenBucket initialization
console.log('▶ Test 1: TokenBucket initialization');
const bucket = new TokenBucket(60, 100); // 60 tokens/min, 100 capacity
const state = bucket.getState();
assert.strictEqual(state.available, 100, 'Initial tokens should equal capacity');
assert.strictEqual(state.capacity, 100, 'Capacity should be 100');
assert.strictEqual(state.cir, 60, 'CIR should be 60');
console.log('✅ TokenBucket initialized correctly\n');

// Test 2: Token consumption
console.log('▶ Test 2: Token consumption');
const consumed = bucket.tryConsume(10);
assert.strictEqual(consumed, true, 'Should consume 10 tokens');
const newState = bucket.getState();
assert.strictEqual(newState.available, 90, 'Should have 90 tokens left');
console.log('✅ Token consumption works\n');

// Test 3: Insufficient tokens
console.log('▶ Test 3: Insufficient tokens rejection');
const bucket2 = new TokenBucket(60, 10);
bucket2.tryConsume(10); // Consume all
const rejected = bucket2.tryConsume(1);
assert.strictEqual(rejected, false, 'Should reject when insufficient tokens');
console.log('✅ Insufficient tokens rejected\n');

// Test 4: Token refill over time
console.log('▶ Test 4: Token refill over time (simulated)');
const bucket3 = new TokenBucket(60, 100); // 60 tokens/min = 1 token/sec
bucket3.tryConsume(100); // Empty it
assert.strictEqual(bucket3.getState().available, 0, 'Should be empty');

// Simulate 2 seconds passing by manipulating lastRefill
bucket3.lastRefill = Date.now() - 2000; // 2 seconds ago
const stateAfterRefill = bucket3.getState();
assert.ok(stateAfterRefill.available >= 1, 'Should have refilled at least 1 token after 2 seconds');
assert.ok(stateAfterRefill.available <= 3, 'Should not refill more than expected');
console.log(`✅ Token refill working (refilled ${stateAfterRefill.available} tokens)\n`);

// Test 5: Token cap at capacity
console.log('▶ Test 5: Token cap at capacity');
const bucket4 = new TokenBucket(120, 50); // 120 tokens/min = 2 tokens/sec
bucket4.lastRefill = Date.now() - 60000; // 60 seconds ago (should refill 120 tokens)
const cappedState = bucket4.getState();
assert.strictEqual(cappedState.available, 50, 'Tokens should be capped at capacity (50)');
console.log('✅ Token count capped at capacity\n');

// Test 6: RateLimitManager
console.log('▶ Test 6: RateLimitManager initialization and checking');
const manager = new RateLimitManager();
manager.initBucket('ext-1', 60, 100);
const checkResult = manager.checkLimit('ext-1', 10);
assert.strictEqual(checkResult.allowed, true, 'Should allow within limit');
assert.ok(checkResult.state, 'Should return state');
console.log('✅ RateLimitManager works\n');

// Test 7: RateLimitManager exceeding limits
console.log('▶ Test 7: RateLimitManager exceeding limits');
const manager2 = new RateLimitManager();
manager2.initBucket('ext-2', 60, 5);
manager2.checkLimit('ext-2', 5); // Consume all
const exceeded = manager2.checkLimit('ext-2', 1);
assert.strictEqual(exceeded.allowed, false, 'Should deny when limit exceeded');
assert.strictEqual(exceeded.reason, 'Rate limit exceeded', 'Should have correct reason');
console.log('✅ Rate limit enforcement works\n');

// Test 8: RateLimitManager reset
console.log('▶ Test 8: RateLimitManager reset');
manager2.reset('ext-2');
const afterReset = manager2.checkLimit('ext-2', 1);
assert.strictEqual(afterReset.allowed, true, 'Should allow after reset');
console.log('✅ Rate limit reset works\n');

// Test 9: Single-Rate Three-Color Token Bucket (srTCM)
console.log('▶ Test 9: Single-Rate Three-Color Token Bucket');
const trTCM = new SingleRateThreeColorTokenBucket({
    cir: 60,  // Committed Information Rate
    bc: 100,  // Committed Burst Size
    be: 50    // Excess Burst Size
});

// Green traffic (within committed rate)
const greenResult = trTCM.classify(10);
assert.strictEqual(greenResult.color, 'green', 'First traffic should be green');
assert.strictEqual(greenResult.classification, 'Conforming', 'Should classify as Conforming');
assert.strictEqual(greenResult.allowed, true, 'Green traffic should be allowed');
console.log('✅ Green (conforming) traffic classified\n');

// Test 10: Yellow traffic (exceeding committed, within excess)
console.log('▶ Test 10: Yellow (exceeding) traffic');
trTCM.committedTokens = 5; // Manually set to low value
const yellowResult = trTCM.classify(10); // Need 10 but only 5 committed
assert.strictEqual(yellowResult.color, 'yellow', 'Should be yellow when exceeding committed');
assert.strictEqual(yellowResult.classification, 'Exceeding', 'Should classify as Exceeding');
assert.strictEqual(yellowResult.allowed, true, 'Yellow traffic should still be allowed');
console.log('✅ Yellow (exceeding) traffic classified\n');

// Test 11: Red traffic (violating)
console.log('▶ Test 11: Red (violating) traffic');
const trTCM2 = new SingleRateThreeColorTokenBucket({
    cir: 60,
    bc: 10,
    be: 10
});
trTCM2.committedTokens = 0;
trTCM2.excessTokens = 0;
const redResult = trTCM2.classify(1);
assert.strictEqual(redResult.color, 'red', 'Should be red when both buckets empty');
assert.strictEqual(redResult.classification, 'Violating', 'Should classify as Violating');
assert.strictEqual(redResult.allowed, false, 'Red traffic should be denied');
console.log('✅ Red (violating) traffic classified\n');

// Test 12: TrafficPolicer integration
console.log('▶ Test 12: TrafficPolicer with drop policy');
const policer = new TrafficPolicer({
    dropViolating: true,
    persistencePath: require('path').join(require('os').tmpdir(), 'ghost-test-policer.json')
});

policer.registerExtension('ext-policer', {
    cir: 60,
    bc: 100,
    be: 50
});

// Green traffic
const policeGreen = policer.police('ext-policer', 10);
assert.strictEqual(policeGreen.allowed, true, 'Green traffic should pass');
assert.strictEqual(policeGreen.color, 'green', 'Should be classified as green');
console.log('✅ TrafficPolicer green traffic\n');

// Test 13: TrafficPolicer burst handling
console.log('▶ Test 13: TrafficPolicer burst handling');
const policer2 = new TrafficPolicer({
    dropViolating: true,
    persistencePath: require('path').join(require('os').tmpdir(), 'ghost-test-policer2.json')
});

policer2.registerExtension('ext-burst', {
    cir: 60,
    bc: 20,
    be: 30
});

// Consume committed bucket first
let result;
for (let i = 0; i < 3; i++) {
    result = policer2.police('ext-burst', 10);
}
// At this point, committed should be low/empty, should start using excess
const burstResult = policer2.police('ext-burst', 10);
if (burstResult.color === 'yellow') {
    console.log('✅ TrafficPolicer handled burst with yellow classification\n');
} else if (burstResult.color === 'green') {
    console.log('✅ TrafficPolicer still has capacity (green)\n');
} else {
    console.log('✅ TrafficPolicer exhausted (red)\n');
}

// Test 14: TrafficPolicer violation dropping
console.log('▶ Test 14: TrafficPolicer violation dropping');
const policer3 = new TrafficPolicer({
    dropViolating: true,
    persistencePath: require('path').join(require('os').tmpdir(), 'ghost-test-policer3.json')
});

policer3.registerExtension('ext-drop', {
    cir: 60,
    bc: 5,
    be: 5
});

// Exhaust all tokens
policer3.police('ext-drop', 5);
policer3.police('ext-drop', 5);

// This should be dropped
const droppedResult = policer3.police('ext-drop', 1);
assert.strictEqual(droppedResult.allowed, false, 'Violating traffic should be dropped');
assert.strictEqual(droppedResult.code, 'QOS_VIOLATING', 'Should have QOS_VIOLATING code');
assert.ok(droppedResult.reason.includes('dropped'), 'Reason should mention dropped');
console.log('✅ Violating traffic dropped\n');

// Test 15: Token bucket refill math validation
console.log('▶ Test 15: Token bucket refill math validation');
const mathBucket = new SingleRateThreeColorTokenBucket({
    cir: 120, // 120 tokens per minute = 2 tokens per second
    bc: 100,
    be: 50
});

mathBucket.committedTokens = 50;
mathBucket.excessTokens = 25;
mathBucket.lastRefill = Date.now() - 1000; // 1 second ago

const mathState = mathBucket.getState();
// After 1 second at 2 tokens/sec, should add ~2 tokens
// In srTCM: tokens fill Bc first (50 + 2 = 52), no overflow to Be
// committedTokens: 50 + 2 = 52
// excessTokens: 25 (unchanged, no overflow)
assert.ok(mathState.committedTokens >= 51 && mathState.committedTokens <= 53, 
    `Committed tokens should be ~52, got ${mathState.committedTokens}`);
assert.strictEqual(mathState.excessTokens, 25, 
    `Excess tokens should stay at 25 (no overflow), got ${mathState.excessTokens}`);
console.log(`✅ Refill math validated (committed: ${mathState.committedTokens}, excess: ${mathState.excessTokens})\n`);

// Test 16: Burst size validation
console.log('▶ Test 16: Burst size enforcement');
const burstBucket = new SingleRateThreeColorTokenBucket({
    cir: 60,
    bc: 10,   // Small committed burst
    be: 100   // Large excess burst
});

// Try to consume more than committed burst in one go
const largeBurst = burstBucket.classify(20);
// Should use excess bucket since committed only has 10
assert.strictEqual(largeBurst.allowed, true, 'Large burst should use excess');
assert.ok(['green', 'yellow'].includes(largeBurst.color), 'Should be green or yellow');
console.log('✅ Burst size enforcement works\n');

// Test 17: Multiple extensions isolation
console.log('▶ Test 17: Multiple extensions rate limit isolation');
const multiManager = new RateLimitManager();
multiManager.initBucket('ext-a', 60, 10);
multiManager.initBucket('ext-b', 60, 10);

multiManager.checkLimit('ext-a', 10); // Exhaust ext-a
const extAResult = multiManager.checkLimit('ext-a', 1);
const extBResult = multiManager.checkLimit('ext-b', 1);

assert.strictEqual(extAResult.allowed, false, 'ext-a should be limited');
assert.strictEqual(extBResult.allowed, true, 'ext-b should not be affected');
console.log('✅ Rate limits isolated between extensions\n');

// srTCM-specific tests start here
console.log('▶ Test 18: srTCM CIR refill formula accuracy - various time intervals');
const cirBucket = new SingleRateThreeColorTokenBucket({
    cir: 180,
    bc: 200,
    be: 100
});
cirBucket.committedTokens = 0;
cirBucket.excessTokens = 0;
cirBucket.lastRefill = Date.now() - 10000;

const cirState = cirBucket.getState();
const expectedTokens10s = (10 * 180) / 60;
assert.ok(Math.abs(cirState.committedTokens - expectedTokens10s) < 0.1,
    `CIR formula: 10s * 180/min should add ${expectedTokens10s} tokens, got ${cirState.committedTokens}`);
console.log(`✅ CIR refill accuracy: ${expectedTokens10s} tokens in 10s (formula: elapsed * CIR / 60)\n`);

console.log('▶ Test 19: srTCM CIR refill formula with fractional seconds');
const fracBucket = new SingleRateThreeColorTokenBucket({
    cir: 600,
    bc: 300,
    be: 150
});
fracBucket.committedTokens = 100;
fracBucket.excessTokens = 50;
fracBucket.lastRefill = Date.now() - 1500;

const fracState = fracBucket.getState();
const expectedFrac = (1.5 * 600) / 60;
const expectedCommitted = Math.min(300, 100 + expectedFrac);
assert.ok(Math.abs(fracState.committedTokens - expectedCommitted) < 0.5,
    `1.5s at CIR=600/min: expected ~${expectedCommitted}, got ${fracState.committedTokens}`);
console.log(`✅ Fractional CIR refill: ${fracState.committedTokens} tokens after 1.5s\n`);

console.log('▶ Test 20: srTCM CIR refill with very high rate (millisecond precision)');
const highRateBucket = new SingleRateThreeColorTokenBucket({
    cir: 6000,
    bc: 500,
    be: 200
});
highRateBucket.committedTokens = 0;
highRateBucket.excessTokens = 0;
highRateBucket.lastRefill = Date.now() - 100;

const highRateState = highRateBucket.getState();
const expected100ms = (0.1 * 6000) / 60;
assert.ok(Math.abs(highRateState.committedTokens - expected100ms) < 1,
    `100ms at 6000/min (100/s): expected ~${expected100ms}, got ${highRateState.committedTokens}`);
console.log(`✅ High-rate CIR precision: ${highRateState.committedTokens} tokens in 100ms\n`);

console.log('▶ Test 21: Bc-to-Be overflow when Bc is full and at rest');
const restBucket = new SingleRateThreeColorTokenBucket({
    cir: 60,
    bc: 100,
    be: 50
});
restBucket.committedTokens = 100;
restBucket.excessTokens = 0;
restBucket.lastRefill = Date.now() - 60000;

const restState = restBucket.getState();
const tokensGenerated = (60 * 60) / 60;
assert.strictEqual(restState.committedTokens, 100, 'Bc should remain at capacity');
assert.ok(restState.excessTokens > 0 && restState.excessTokens <= 50,
    `Overflow should fill Be: expected ≤50, got ${restState.excessTokens}`);
console.log(`✅ At-rest overflow: Bc capped at 100, Be filled to ${restState.excessTokens}\n`);

console.log('▶ Test 22: Bc-to-Be overflow with partial Bc capacity available');
const partialRestBucket = new SingleRateThreeColorTokenBucket({
    cir: 120,
    bc: 200,
    be: 100
});
partialRestBucket.committedTokens = 180;
partialRestBucket.excessTokens = 20;
partialRestBucket.lastRefill = Date.now() - 5000;

const partialRestState = partialRestBucket.getState();
const tokensToAdd = (5 * 120) / 60;
const bcSpace = 200 - 180;
const bcFill = Math.min(tokensToAdd, bcSpace);
const overflow = tokensToAdd - bcFill;
const expectedBc = 180 + bcFill;
const expectedBe = Math.min(100, 20 + overflow);

assert.ok(Math.abs(partialRestState.committedTokens - expectedBc) < 0.1,
    `Bc should be ${expectedBc}, got ${partialRestState.committedTokens}`);
assert.ok(Math.abs(partialRestState.excessTokens - expectedBe) < 0.1,
    `Be should be ${expectedBe}, got ${partialRestState.excessTokens}`);
console.log(`✅ Partial overflow: ${tokensToAdd} tokens → Bc(${partialRestState.committedTokens}), Be(${partialRestState.excessTokens})\n`);

console.log('▶ Test 23: Bc-to-Be overflow with Be already at capacity');
const fullBeBucket = new SingleRateThreeColorTokenBucket({
    cir: 60,
    bc: 80,
    be: 40
});
fullBeBucket.committedTokens = 80;
fullBeBucket.excessTokens = 40;
fullBeBucket.lastRefill = Date.now() - 10000;

const fullBeState = fullBeBucket.getState();
assert.strictEqual(fullBeState.committedTokens, 80, 'Bc should stay at capacity');
assert.strictEqual(fullBeState.excessTokens, 40, 'Be should stay at capacity (no room for overflow)');
console.log(`✅ Full buckets: No overflow when both at capacity\n`);

console.log('▶ Test 24: Small burst using only Bc (all green)');
const smallBurst = new SingleRateThreeColorTokenBucket({
    cir: 120,
    bc: 150,
    be: 75
});
smallBurst.lastRefill = Date.now();

const sb1 = smallBurst.classify(40);
const sb2 = smallBurst.classify(30);
const sb3 = smallBurst.classify(50);

assert.strictEqual(sb1.color, 'green', 'First 40 should be green');
assert.strictEqual(sb2.color, 'green', 'Next 30 should be green');
assert.strictEqual(sb3.color, 'green', 'Next 50 should be green (total 120 < Bc)');
assert.strictEqual(sb3.state.committedTokens, 30, 'Should have 30 Bc tokens left');
assert.strictEqual(sb3.state.excessTokens, 75, 'Be should be untouched');
console.log(`✅ Small burst: 120 tokens, all green, Bc remaining=${sb3.state.committedTokens}\n`);

console.log('▶ Test 25: Medium burst using Bc + partial Be (green then yellow)');
const medBurst = new SingleRateThreeColorTokenBucket({
    cir: 90,
    bc: 80,
    be: 120
});
medBurst.lastRefill = Date.now();

const mb1 = medBurst.classify(80);
assert.strictEqual(mb1.color, 'green', 'First 80 exhausts Bc (green)');
assert.strictEqual(mb1.state.committedTokens, 0, 'Bc should be empty');

const mb2 = medBurst.classify(50);
assert.strictEqual(mb2.color, 'yellow', 'Next 50 uses Be (yellow)');
assert.strictEqual(mb2.state.excessTokens, 70, 'Be should have 70 left');

const mb3 = medBurst.classify(40);
assert.strictEqual(mb3.color, 'yellow', 'Next 40 still uses Be (yellow)');
assert.strictEqual(mb3.state.excessTokens, 30, 'Be should have 30 left');
assert.strictEqual(mb3.state.committedTokens, 0, 'Bc still empty');
console.log(`✅ Medium burst: Bc exhausted (green), partial Be used (yellow), ${mb3.state.excessTokens} Be left\n`);

console.log('▶ Test 26: Large burst exhausting both Bc and Be (all colors)');
const largeBurst2 = new SingleRateThreeColorTokenBucket({
    cir: 60,
    bc: 50,
    be: 30
});
largeBurst2.lastRefill = Date.now();

const lb1 = largeBurst2.classify(50);
assert.strictEqual(lb1.color, 'green', 'First 50 exhausts Bc');

const lb2 = largeBurst2.classify(30);
assert.strictEqual(lb2.color, 'yellow', 'Next 30 exhausts Be');

const lb3 = largeBurst2.classify(1);
assert.strictEqual(lb3.color, 'red', 'Any more traffic is red');
assert.strictEqual(lb3.allowed, false, 'Red traffic denied');

const lb4 = largeBurst2.classify(100);
assert.strictEqual(lb4.color, 'red', 'Large violating burst is red');
assert.strictEqual(lb4.allowed, false, 'Large violating burst denied');

console.log(`✅ Large burst: Bc→green (50), Be→yellow (30), overflow→red (denied)\n`);

console.log('▶ Test 27: Complex burst scenario with alternating colors');
const complexBurst = new SingleRateThreeColorTokenBucket({
    cir: 180,
    bc: 100,
    be: 60
});
complexBurst.lastRefill = Date.now();

const colors = [];
colors.push(complexBurst.classify(30).color);
colors.push(complexBurst.classify(40).color);
colors.push(complexBurst.classify(30).color);
colors.push(complexBurst.classify(20).color);
colors.push(complexBurst.classify(40).color);
colors.push(complexBurst.classify(10).color);

assert.strictEqual(colors[0], 'green', '30 tokens: green');
assert.strictEqual(colors[1], 'green', '40 tokens: green');
assert.strictEqual(colors[2], 'green', '30 tokens: green (total 100 = Bc)');
assert.strictEqual(colors[3], 'yellow', '20 tokens: yellow (uses Be)');
assert.strictEqual(colors[4], 'yellow', '40 tokens: yellow (uses Be)');
assert.strictEqual(colors[5], 'red', '10 tokens: red (Be exhausted)');

console.log(`✅ Complex burst: [${colors.join(', ')}] - proper three-color marking\n`);

console.log('▶ Test 28: State persistence after crash - single extension');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crashPath1 = path.join(os.tmpdir(), 'ghost-crash-test-1.json');

if (fs.existsSync(crashPath1)) {
    fs.unlinkSync(crashPath1);
}

const precrash = new TrafficPolicer({
    persistencePath: crashPath1,
    dropViolating: true
});

precrash.registerExtension('crash-ext', {
    cir: 240,
    bc: 300,
    be: 150
});

precrash.police('crash-ext', 100);
precrash.police('crash-ext', 80);

const preState = precrash.getState('crash-ext');
const preCommitted = preState.committedTokens;
const preExcess = preState.excessTokens;

const postcrash = new TrafficPolicer({
    persistencePath: crashPath1,
    dropViolating: true
});

const postState = postcrash.getState('crash-ext');
assert.ok(postState, 'State should be restored after crash');
assert.strictEqual(postState.cir, 240, 'CIR restored');
assert.strictEqual(postState.committedCapacity, 300, 'Bc restored');
assert.strictEqual(postState.excessCapacity, 150, 'Be restored');
assert.ok(postState.committedTokens >= preCommitted, 'Committed tokens restored + refilled');

fs.unlinkSync(crashPath1);
console.log(`✅ Crash recovery: Pre(${preCommitted.toFixed(1)}/${preExcess}) → Post(${postState.committedTokens.toFixed(1)}/${postState.excessTokens})\n`);

console.log('▶ Test 29: State persistence after crash - multiple extensions with traffic');
const crashPath2 = path.join(os.tmpdir(), 'ghost-crash-test-2.json');

if (fs.existsSync(crashPath2)) {
    fs.unlinkSync(crashPath2);
}

const multiPrecrash = new TrafficPolicer({
    persistencePath: crashPath2,
    dropViolating: true
});

multiPrecrash.registerExtension('ext-alpha', { cir: 120, bc: 200, be: 100 });
multiPrecrash.registerExtension('ext-beta', { cir: 60, bc: 100, be: 50 });
multiPrecrash.registerExtension('ext-gamma', { cir: 180, bc: 150, be: 75 });

multiPrecrash.police('ext-alpha', 50);
multiPrecrash.police('ext-beta', 30);
multiPrecrash.police('ext-gamma', 70);
multiPrecrash.police('ext-alpha', 80);
multiPrecrash.police('ext-beta', 40);

const preStates = {
    alpha: multiPrecrash.getState('ext-alpha'),
    beta: multiPrecrash.getState('ext-beta'),
    gamma: multiPrecrash.getState('ext-gamma')
};

const multiPostcrash = new TrafficPolicer({
    persistencePath: crashPath2,
    dropViolating: true
});

assert.strictEqual(multiPostcrash.buckets.size, 3, 'All 3 extensions restored');

const postStates = {
    alpha: multiPostcrash.getState('ext-alpha'),
    beta: multiPostcrash.getState('ext-beta'),
    gamma: multiPostcrash.getState('ext-gamma')
};

assert.ok(postStates.alpha, 'ext-alpha restored');
assert.ok(postStates.beta, 'ext-beta restored');
assert.ok(postStates.gamma, 'ext-gamma restored');

assert.strictEqual(postStates.alpha.cir, 120, 'alpha CIR restored');
assert.strictEqual(postStates.beta.cir, 60, 'beta CIR restored');
assert.strictEqual(postStates.gamma.cir, 180, 'gamma CIR restored');

fs.unlinkSync(crashPath2);
console.log(`✅ Multi-extension crash recovery: 3 extensions with traffic state restored\n`);

console.log('▶ Test 30: State restoration with in-progress burst (token validation)');
const crashPath3 = path.join(os.tmpdir(), 'ghost-crash-test-3.json');

if (fs.existsSync(crashPath3)) {
    fs.unlinkSync(crashPath3);
}

const burstPrecrash = new TrafficPolicer({
    persistencePath: crashPath3,
    dropViolating: true
});

burstPrecrash.registerExtension('burst-ext', { cir: 300, bc: 200, be: 100 });

burstPrecrash.police('burst-ext', 150);
burstPrecrash.police('burst-ext', 40);

const burstPreState = burstPrecrash.getState('burst-ext');

const burstPostcrash = new TrafficPolicer({
    persistencePath: crashPath3,
    dropViolating: true
});

const result1 = burstPostcrash.police('burst-ext', 10);
assert.ok(result1.allowed, 'Should allow traffic after restoration');

const burstPostState = burstPostcrash.getState('burst-ext');
assert.ok(burstPostState.committedTokens > 0 || burstPostState.excessTokens > 0,
    'Should have tokens available after restoration');

fs.unlinkSync(crashPath3);
console.log(`✅ In-progress burst recovery: Tokens validated, traffic continues\n`);

console.log('▶ Test 31: State restoration after multiple crashes');
const crashPath4 = path.join(os.tmpdir(), 'ghost-crash-test-4.json');

if (fs.existsSync(crashPath4)) {
    fs.unlinkSync(crashPath4);
}

const iter1 = new TrafficPolicer({ persistencePath: crashPath4, dropViolating: true });
iter1.registerExtension('persistent-ext', { cir: 180, bc: 150, be: 75 });
iter1.police('persistent-ext', 50);

const iter2 = new TrafficPolicer({ persistencePath: crashPath4, dropViolating: true });
iter2.police('persistent-ext', 30);

const iter3 = new TrafficPolicer({ persistencePath: crashPath4, dropViolating: true });
iter3.police('persistent-ext', 40);

const iter4 = new TrafficPolicer({ persistencePath: crashPath4, dropViolating: true });
const finalState = iter4.getState('persistent-ext');

assert.ok(finalState, 'State survives multiple crashes');
assert.strictEqual(finalState.cir, 180, 'Configuration persists');

fs.unlinkSync(crashPath4);
console.log(`✅ Multiple crashes: State survives 4 iterations\n`);

console.log('▶ Test 32: Verify refill continues correctly after restoration');
const crashPath5 = path.join(os.tmpdir(), 'ghost-crash-test-5.json');

if (fs.existsSync(crashPath5)) {
    fs.unlinkSync(crashPath5);
}

const refillPrecrash = new TrafficPolicer({
    persistencePath: crashPath5,
    dropViolating: true
});

refillPrecrash.registerExtension('refill-ext', { cir: 120, bc: 100, be: 50 });
refillPrecrash.police('refill-ext', 100);

const preBucket = refillPrecrash.buckets.get('refill-ext');
preBucket.lastRefill = Date.now() - 2000;
refillPrecrash._saveState();

const refillPostcrash = new TrafficPolicer({
    persistencePath: crashPath5,
    dropViolating: true
});

const postBucket = refillPostcrash.buckets.get('refill-ext');
const postStateImmediate = postBucket.getState();

postBucket.lastRefill = Date.now() - 3000;
const postStateAfterWait = postBucket.getState();

assert.ok(postStateAfterWait.committedTokens > postStateImmediate.committedTokens ||
          postStateImmediate.committedTokens === 100,
    'Refill should continue working after crash');

fs.unlinkSync(crashPath5);
console.log(`✅ Post-crash refill: Tokens refilling correctly after restoration\n`);

console.log('🎉 All rate limiter tests passed!');
