const assert = require('assert');
const os = require('os');
const fs = require('fs');
const path = require('path');

console.log('🧪 Testing AuthManager — JWT hardening (Phase 1)\n');

// ── helpers ──────────────────────────────────────────────────────────────────

function makeAuthManager(secret = 'test-secret-32-chars-minimum-xx') {
    process.env.JWT_SECRET = secret;
    // Fresh require each time to avoid module cache issues with env changes
    delete require.cache[require.resolve('../../core/marketplace-backend/auth-manager')];
    const { AuthManager } = require('../../core/marketplace-backend/auth-manager');
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ghost-auth-test-'));
    return new AuthManager({ dataDir: tmpDir });
}

// ── Test 1: JWT_SECRET required ───────────────────────────────────────────────

console.log('▶ Test 1: JWT_SECRET required at construction');
delete process.env.JWT_SECRET;
delete require.cache[require.resolve('../../core/marketplace-backend/auth-manager')];
const { AuthManager } = require('../../core/marketplace-backend/auth-manager');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ghost-auth-test-'));
assert.throws(
    () => new AuthManager({ dataDir: tmpDir }),
    /JWT_SECRET/,
    'Should throw if JWT_SECRET is missing'
);
console.log('  ✓ throws without JWT_SECRET\n');

// ── Test 2: Token round-trip ──────────────────────────────────────────────────

console.log('▶ Test 2: register → verifyToken round-trip');
const am = makeAuthManager();
const reg = am.register('alice', 'Password1!', 'alice@example.com');
assert.strictEqual(reg.success, true, 'register should succeed');
assert.ok(reg.token, 'register should return a token');

const payload = am.verifyToken(reg.token);
assert.ok(payload, 'verifyToken should return payload for valid token');
assert.strictEqual(payload.userId, reg.user.id, 'payload.userId should match user id');
assert.strictEqual(payload.isAdmin, false, 'isAdmin should be false for new user');
console.log('  ✓ register produces verifiable token\n');

// ── Test 3: Login → verifyToken round-trip ────────────────────────────────────

console.log('▶ Test 3: login → verifyToken round-trip');
const am2 = makeAuthManager();
am2.register('bob', 'Password1!', 'bob@example.com');
const login = am2.login('bob', 'Password1!');
assert.strictEqual(login.success, true, 'login should succeed');
const loginPayload = am2.verifyToken(login.token);
assert.ok(loginPayload, 'token from login should verify');
assert.strictEqual(loginPayload.isAdmin, false);
console.log('  ✓ login produces verifiable token\n');

// ── Test 4: verifyToken rejects null / undefined ──────────────────────────────

console.log('▶ Test 4: verifyToken rejects null / undefined / empty');
const am3 = makeAuthManager();
assert.strictEqual(am3.verifyToken(null), null, 'null token → null');
assert.strictEqual(am3.verifyToken(undefined), null, 'undefined token → null');
assert.strictEqual(am3.verifyToken(''), null, 'empty string → null');
console.log('  ✓ null/undefined/empty return null\n');

// ── Test 5: verifyToken rejects tampered payload ──────────────────────────────

console.log('▶ Test 5: verifyToken rejects tampered payload');
const am4 = makeAuthManager();
const reg4 = am4.register('charlie', 'Password1!', 'charlie@example.com');
const parts = reg4.token.split('.');
// Tamper payload: flip isAdmin to true
const tamperedPayload = Buffer.from(
    JSON.stringify({ ...JSON.parse(Buffer.from(parts[1], 'base64url').toString()), isAdmin: true })
).toString('base64url');
const tamperedToken = `${parts[0]}.${tamperedPayload}.${parts[2]}`;
assert.strictEqual(am4.verifyToken(tamperedToken), null, 'tampered token should be rejected');
console.log('  ✓ tampered payload rejected\n');

// ── Test 6: Algorithm substitution (alg:none) blocked ────────────────────────

console.log('▶ Test 6: alg:none substitution attack blocked');
const am5 = makeAuthManager();
const reg5 = am5.register('dan', 'Password1!', 'dan@example.com');
const [, rawPayload] = reg5.token.split('.');
// Forge a token with alg:none and no signature
const fakeHeader = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
const noneToken = `${fakeHeader}.${rawPayload}.`;
assert.strictEqual(am5.verifyToken(noneToken), null, 'alg:none token must be rejected');
console.log('  ✓ alg:none substitution attack blocked\n');

// ── Test 7: Token from different secret rejected ──────────────────────────────

console.log('▶ Test 7: Token signed with different secret rejected');
const am6a = makeAuthManager('secret-A-32-chars-minimum-xxxxxx');
const am6b = makeAuthManager('secret-B-32-chars-minimum-xxxxxx');
const reg6 = am6a.register('eve', 'Password1!', 'eve@example.com');
assert.strictEqual(am6b.verifyToken(reg6.token), null, 'Token from different secret should fail');
console.log('  ✓ cross-secret token rejected\n');

// ── Test 8: Admin bypass — null token must not pass ───────────────────────────

console.log('▶ Test 8: Admin bypass — null token must not satisfy isAdmin');
const am7 = makeAuthManager();
const decoded = am7.verifyToken(null);
// Replicate the fixed server.js guard
const adminAccessGranted = decoded && decoded.isAdmin;
assert.strictEqual(!!adminAccessGranted, false, 'null token must not grant admin access');
console.log('  ✓ null token does not bypass admin guard\n');

// ── Test 9: promoteToAdmin reflected in new token ─────────────────────────────

console.log('▶ Test 9: promoteToAdmin → new token reflects admin status');
const am8 = makeAuthManager();
const reg8 = am8.register('frank', 'Password1!', 'frank@example.com');
am8.promoteToAdmin(reg8.user.id);
const loginAdmin = am8.login('frank', 'Password1!');
const adminPayload = am8.verifyToken(loginAdmin.token);
assert.strictEqual(adminPayload.isAdmin, true, 'Promoted user token should have isAdmin=true');
console.log('  ✓ admin promotion reflected in token\n');

// ── Test 10: Wrong password rejected ─────────────────────────────────────────

console.log('▶ Test 10: Wrong password rejected');
const am9 = makeAuthManager();
am9.register('grace', 'correct-password', 'grace@example.com');
const badLogin = am9.login('grace', 'wrong-password');
assert.strictEqual(badLogin.success, false);
assert.strictEqual(badLogin.error, 'Invalid credentials');
console.log('  ✓ wrong password rejected\n');

console.log('✅ All auth-manager tests passed');
