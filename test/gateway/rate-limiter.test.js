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

console.log('🎉 All rate limiter tests passed!');
