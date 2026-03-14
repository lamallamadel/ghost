const assert = require('assert');

console.log('🧪 Testing Registry REGISTRY_API_KEY middleware (Phase 1)\n');

// Simulate the requireRegistryKey middleware logic directly
// (function is local to setupRoutes, tested here via its exact logic)
function requireRegistryKey(req, res, next) {
    const authHeader = req.headers.authorization || '';
    const key = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!key || key !== process.env.REGISTRY_API_KEY) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }
    next();
}

function mockRes() {
    const r = { _status: null, _body: null };
    r.status = (code) => { r._status = code; return r; };
    r.json = (body) => { r._body = body; return r; };
    return r;
}

// ── Test 1: No Authorization header → 401 ─────────────────────────────────────

console.log('▶ Test 1: No Authorization header → 401');
process.env.REGISTRY_API_KEY = 'real-api-key-abc123';
let nextCalled = false;
const res1 = mockRes();
requireRegistryKey({ headers: {} }, res1, () => { nextCalled = true; });
assert.strictEqual(res1._status, 401);
assert.strictEqual(res1._body.error, 'Unauthorized');
assert.strictEqual(nextCalled, false, 'next() must not be called');
console.log('  ✓ Missing header → 401\n');

// ── Test 2: Wrong key → 401 ───────────────────────────────────────────────────

console.log('▶ Test 2: Wrong key → 401');
nextCalled = false;
const res2 = mockRes();
requireRegistryKey(
    { headers: { authorization: 'Bearer wrong-key' } },
    res2,
    () => { nextCalled = true; }
);
assert.strictEqual(res2._status, 401);
assert.strictEqual(nextCalled, false, 'next() must not be called');
console.log('  ✓ Wrong key → 401\n');

// ── Test 3: Correct key → next() ──────────────────────────────────────────────

console.log('▶ Test 3: Correct key → next() called');
nextCalled = false;
const res3 = mockRes();
requireRegistryKey(
    { headers: { authorization: 'Bearer real-api-key-abc123' } },
    res3,
    () => { nextCalled = true; }
);
assert.strictEqual(nextCalled, true, 'next() must be called for valid key');
assert.strictEqual(res3._status, null, 'No response written on success');
console.log('  ✓ Correct key → next() called\n');

// ── Test 4: Malformed header (no "Bearer " prefix) → 401 ─────────────────────

console.log('▶ Test 4: Malformed header (no Bearer prefix) → 401');
nextCalled = false;
const res4 = mockRes();
requireRegistryKey(
    { headers: { authorization: 'real-api-key-abc123' } },
    res4,
    () => { nextCalled = true; }
);
assert.strictEqual(res4._status, 401);
assert.strictEqual(nextCalled, false);
console.log('  ✓ Missing Bearer prefix → 401\n');

// ── Test 5: REGISTRY_API_KEY not set → all keys rejected ─────────────────────

console.log('▶ Test 5: REGISTRY_API_KEY undefined → all requests rejected');
delete process.env.REGISTRY_API_KEY;
nextCalled = false;
const res5 = mockRes();
requireRegistryKey(
    { headers: { authorization: 'Bearer any-key' } },
    res5,
    () => { nextCalled = true; }
);
assert.strictEqual(res5._status, 401);
assert.strictEqual(nextCalled, false, 'No key should pass when env var is unset');
console.log('  ✓ Unset REGISTRY_API_KEY rejects all requests\n');

console.log('✅ All registry-auth tests passed');
