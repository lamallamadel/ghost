const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { PathValidator, NetworkValidator, CommandValidator, EntropyValidator } = require('../../core/validators');

console.log('🧪 Testing NIST SI-10 Validators - Comprehensive Negative Case Suite...\n');

let testCount = 0;
let passedCount = 0;
let failedCount = 0;

function test(name, fn) {
    testCount++;
    try {
        fn();
        passedCount++;
        console.log(`✅ Test ${testCount}: ${name}`);
    } catch (error) {
        failedCount++;
        console.error(`❌ Test ${testCount}: ${name}`);
        console.error(`   Error: ${error.message}`);
    }
}

// =======================
// PathValidator Tests
// =======================
console.log('\n📁 PathValidator - Negative Cases\n');

const testRoot = process.cwd();
const pathValidator = new PathValidator({
    rootDirectory: testRoot,
    allowedPatterns: ['**/*'],
    deniedPaths: []
});

test('Path traversal with ../', () => {
    const result = pathValidator.isPathAllowed('../../../etc/passwd');
    assert.strictEqual(result.allowed, false);
    assert.ok(result.reason.includes('traversal'));
});

test('Path traversal with ..\\', () => {
    const result = pathValidator.isPathAllowed('..\\..\\..\\windows\\system32');
    assert.strictEqual(result.allowed, false);
    assert.ok(result.reason.includes('traversal'));
});

test('Path traversal with %2e%2e%2f', () => {
    const result = pathValidator.isPathAllowed('%2e%2e%2fconfig/secrets.txt');
    assert.strictEqual(result.allowed, false);
    assert.ok(result.reason.includes('traversal'));
});

test('Path traversal with %252e%252e', () => {
    const result = pathValidator.isPathAllowed('%252e%252e/sensitive.key');
    assert.strictEqual(result.allowed, false);
    assert.ok(result.reason.includes('traversal'));
});

test('Path traversal with %c0%ae', () => {
    const result = pathValidator.isPathAllowed('%c0%ae%c0%ae/etc/passwd');
    assert.strictEqual(result.allowed, false);
    assert.ok(result.reason.includes('traversal'));
});

test('Path traversal with null-byte + ../', () => {
    const result = pathValidator.isPathAllowed('test.txt\0../../../etc/passwd');
    assert.strictEqual(result.allowed, false);
    assert.ok(result.reason.includes('Null-byte'));
});

test('Path traversal with multiple null-bytes', () => {
    const result = pathValidator.isPathAllowed('\0\0\0../config');
    assert.strictEqual(result.allowed, false);
    assert.ok(result.reason.includes('Null-byte'));
});

test('Path traversal with mixed encoding', () => {
    const result = pathValidator.isPathAllowed('./test/%2E%2E/%2e%2e/secrets');
    assert.strictEqual(result.allowed, false);
    assert.ok(result.reason.includes('traversal'));
});

test('Symlink to outside root (simulation)', () => {
    const result = pathValidator.isWithinRoot('/etc/passwd');
    assert.strictEqual(result, false);
});

test('Unicode normalization bypass attempt (/../)', () => {
    const result = pathValidator.isPathAllowed('\u002e\u002e\u002f\u002e\u002e\u002fconfig');
    assert.strictEqual(result.allowed, false);
    assert.ok(result.reason.includes('traversal'));
});

test('Path with backslash normalization bypass', () => {
    const result = pathValidator.isPathAllowed('test\\..\\..\\secrets');
    assert.strictEqual(result.allowed, false);
    assert.ok(result.reason.includes('traversal'));
});

test('Complex traversal: ./test/../../sensitive.key', () => {
    const result = pathValidator.isPathAllowed('./test/../../sensitive.key');
    assert.strictEqual(result.allowed, false);
});

test('PathValidator positive case: valid relative path', () => {
    const result = pathValidator.isPathAllowed('test/data/file.txt');
    assert.strictEqual(result.allowed, true);
});

test('PathValidator positive case: valid file in current dir', () => {
    const result = pathValidator.isPathAllowed('README.md');
    assert.strictEqual(result.allowed, true);
});

// =======================
// NetworkValidator Tests
// =======================
console.log('\n🌐 NetworkValidator - Negative Cases\n');

const networkValidator = new NetworkValidator({
    allowedSchemes: ['http', 'https'],
    allowLocalhostIPs: false,
    allowPrivateIPs: false,
    requireTLS: false
});

test('SSRF: http://127.0.0.1', () => {
    const result = networkValidator.validateURL('http://127.0.0.1');
    assert.strictEqual(result.valid, false);
});

test('SSRF: http://[::1]', () => {
    const isLocalhost = networkValidator.isLocalhostIP('::1');
    assert.strictEqual(isLocalhost, true);
});

test('SSRF: http://0x7f000001 (hex notation)', () => {
    const normalizedIP = networkValidator.normalizeIPNotation('0x7f000001');
    assert.strictEqual(normalizedIP, '127.0.0.1');
    const ssrfCheck = networkValidator.isSSRFAttempt(normalizedIP);
    assert.strictEqual(ssrfCheck.isSSRF, true);
});

test('SSRF: http://2130706433 (decimal notation)', () => {
    const normalizedIP = networkValidator.normalizeIPNotation('2130706433');
    assert.strictEqual(normalizedIP, '127.0.0.1');
    const ssrfCheck = networkValidator.isSSRFAttempt(normalizedIP);
    assert.strictEqual(ssrfCheck.isSSRF, true);
});

test('SSRF: http://169.254.169.254 (AWS metadata)', () => {
    const result = networkValidator.validateURL('http://169.254.169.254');
    assert.strictEqual(result.valid, false);
});

test('SSRF: http://metadata.google.internal', () => {
    const result = networkValidator.validateURL('http://metadata.google.internal');
    assert.strictEqual(result.valid, false);
});

test('SSRF: URL-encoded localhost (%31%32%37)', () => {
    const detection = networkValidator.detectURLEncodingObfuscation('http://%31%32%37.0.0.1');
    assert.strictEqual(detection.detected, true);
    assert.ok(detection.reason.includes('localhost') || detection.reason.includes('127'));
});

test('SSRF: Private IP 10.0.0.1', () => {
    const result = networkValidator.validateURL('http://10.0.0.1');
    assert.strictEqual(result.valid, false);
});

test('SSRF: Private IP 192.168.1.1', () => {
    const result = networkValidator.validateURL('http://192.168.1.1');
    assert.strictEqual(result.valid, false);
});

test('SSRF: Private IP 172.16.0.1', () => {
    const result = networkValidator.validateURL('http://172.16.0.1');
    assert.strictEqual(result.valid, false);
});

test('SSRF: Link-local IP 169.254.1.1', () => {
    const isPrivate = networkValidator.isPrivateIP('169.254.1.1');
    assert.strictEqual(isPrivate, true);
});

test('SSRF: localhost string', () => {
    const result = networkValidator.validateURL('http://localhost');
    assert.strictEqual(result.valid, false);
});

test('SSRF: 0.0.0.0', () => {
    const isLocalhost = networkValidator.isLocalhostIP('0.0.0.0');
    assert.strictEqual(isLocalhost, true);
});

test('SSRF: Octal notation 0177.0.0.1', () => {
    const normalizedIP = networkValidator.normalizeIPNotation('0177');
    assert.strictEqual(normalizedIP, '0.0.0.127');
});

test('SSRF: 127.0.0.2 (another localhost)', () => {
    const isLocalhost = networkValidator.isLocalhostIP('127.0.0.2');
    assert.strictEqual(isLocalhost, true);
});

test('NetworkValidator positive case: valid HTTPS URL', () => {
    const validator = new NetworkValidator({
        allowedSchemes: ['https'],
        allowedDomains: ['api.github.com'],
        allowLocalhostIPs: false,
        allowPrivateIPs: false
    });
    const result = validator.validateURL('https://api.github.com/repos');
    assert.strictEqual(result.valid, true);
});

test('NetworkValidator positive case: valid public IP', () => {
    const validator = new NetworkValidator({
        allowedSchemes: ['https'],
        allowLocalhostIPs: false,
        allowPrivateIPs: false
    });
    const result = validator.validateURL('https://8.8.8.8');
    assert.strictEqual(result.valid, true);
});

// =======================
// CommandValidator Tests
// =======================
console.log('\n⚙️  CommandValidator - Negative Cases\n');

const cmdValidator = new CommandValidator({
    allowedCommands: ['git'],
    allowShellExpansion: false
});

test('Command injection with semicolon', () => {
    const hasInjection = cmdValidator.hasInjectionAttempt('status;rm -rf /');
    assert.strictEqual(hasInjection, true);
});

test('Command injection with pipe |', () => {
    const hasInjection = cmdValidator.hasInjectionAttempt('log | cat /etc/passwd');
    assert.strictEqual(hasInjection, true);
});

test('Command injection with &&', () => {
    const hasInjection = cmdValidator.hasInjectionAttempt('status && curl evil.com');
    assert.strictEqual(hasInjection, true);
});

test('Command injection with ||', () => {
    const hasInjection = cmdValidator.hasInjectionAttempt('branch || wget malware');
    assert.strictEqual(hasInjection, true);
});

test('Command injection with $()', () => {
    const hasInjection = cmdValidator.hasInjectionAttempt('log $(cat secrets)');
    assert.strictEqual(hasInjection, true);
});

test('Command injection with backticks', () => {
    const hasInjection = cmdValidator.hasInjectionAttempt('status `whoami`');
    assert.strictEqual(hasInjection, true);
});

test('Command injection with newline \\n', () => {
    const hasInjection = cmdValidator.hasInjectionAttempt('status\nrm -rf /');
    assert.strictEqual(hasInjection, true);
});

test('Command injection with carriage return \\r', () => {
    const hasInjection = cmdValidator.hasInjectionAttempt('log\rcat /etc/passwd');
    assert.strictEqual(hasInjection, true);
});

test('Command injection with null byte \\x00', () => {
    const hasInjection = cmdValidator.hasInjectionAttempt('status\x00rm -rf /');
    assert.strictEqual(hasInjection, true);
});

test('Command injection with redirect >', () => {
    const hasInjection = cmdValidator.hasInjectionAttempt('log > /etc/passwd');
    assert.strictEqual(hasInjection, true);
});

test('Command injection with multiple operators', () => {
    const hasInjection = cmdValidator.hasInjectionAttempt('status && echo $PATH | grep bin');
    assert.strictEqual(hasInjection, true);
});

test('Command injection with ${var}', () => {
    const hasInjection = cmdValidator.hasInjectionAttempt('log ${HOME}/.ssh/id_rsa');
    assert.strictEqual(hasInjection, true);
});

test('CommandValidator positive case: valid git command', () => {
    const result = cmdValidator.validateCommand('git', ['status']);
    assert.strictEqual(result.valid, true);
});

test('CommandValidator positive case: git with safe args', () => {
    const result = cmdValidator.validateCommand('git', ['log', '--oneline', '-n', '10']);
    assert.strictEqual(result.valid, true);
});

// =======================
// EntropyValidator Tests
// =======================
console.log('\n🔐 EntropyValidator - Negative Cases\n');

const entropyValidator = new EntropyValidator({
    minEntropyThreshold: 4.5,
    maxEntropyThreshold: 7.0,
    minLength: 16,
    maxLength: 256
});

test('Secret detection: Real AWS Access Key format', () => {
    const content = 'AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE';
    const result = entropyValidator.scanContent(content);
    assert.strictEqual(result.hasSecrets, true);
    assert.ok(result.secrets.some(s => s.type.includes('AWS')));
});

test('Secret detection: Real AWS Secret Key format', () => {
    const content = 'AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY';
    const result = entropyValidator.scanContent(content);
    assert.strictEqual(result.hasSecrets, true);
});

test('Secret detection: GitHub Personal Access Token', () => {
    const content = 'token=ghp_1234567890abcdefghijklmnopqrstuvwxyz';
    const result = entropyValidator.scanContent(content);
    assert.strictEqual(result.hasSecrets, true);
    assert.ok(result.secrets.some(s => s.type.includes('GitHub')));
});

test('Secret detection: GitHub OAuth Token', () => {
    const content = 'gho_16C7e42F292c6912E7710c838347Ae178B4a';
    const result = entropyValidator.scanContent(content);
    assert.strictEqual(result.hasSecrets, true);
});

test('Secret detection: JWT Token', () => {
    const content = 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
    const result = entropyValidator.scanContent(content);
    assert.strictEqual(result.hasSecrets, true);
    assert.ok(result.secrets.some(s => s.type.includes('JWT')));
});

test('Secret detection: RSA Private Key Header', () => {
    const content = '-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA...';
    const result = entropyValidator.scanContent(content);
    assert.strictEqual(result.hasSecrets, true);
    assert.ok(result.secrets.some(s => s.type.includes('Private Key')));
});

test('Secret detection: OpenSSH Private Key Header', () => {
    const content = '-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1rZXktdjEA...';
    const result = entropyValidator.scanContent(content);
    assert.strictEqual(result.hasSecrets, true);
    assert.ok(result.secrets.some(s => s.type.includes('Private Key')));
});

test('Secret detection: EC Private Key Header', () => {
    const content = '-----BEGIN EC PRIVATE KEY-----\nMHcCAQEEII...';
    const result = entropyValidator.scanContent(content);
    assert.strictEqual(result.hasSecrets, true);
    assert.ok(result.secrets.some(s => s.type.includes('Private Key')));
});

test('Secret detection: OpenAI API Key', () => {
    const content = 'OPENAI_API_KEY=sk-proj-abcdefghijklmnopqrstuvwxyz1234567890ABCD';
    const result = entropyValidator.scanContent(content);
    assert.strictEqual(result.hasSecrets, true);
});

test('Secret detection: Anthropic API Key', () => {
    const content = 'ANTHROPIC_API_KEY=sk-ant-api03-abcdefghijklmnopqrstuvwxyz1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890ABCDEFGHIJK';
    const result = entropyValidator.scanContent(content);
    assert.strictEqual(result.hasSecrets, true);
});

test('Secret detection: Groq API Key', () => {
    const content = 'GROQ_API_KEY=gsk_abcdefghijklmnopqrstuvwxyz1234567890ABCDEFGH';
    const result = entropyValidator.scanContent(content);
    assert.strictEqual(result.hasSecrets, true);
    assert.ok(result.secrets.some(s => s.type.includes('Groq') || (s.value && s.value.startsWith('gsk_'))));
});

test('Secret detection: Slack Token', () => {
    const content = 'SLACK_TOKEN=xoxb-000000000000-000000000000-XXXXXXXXXXXXXXXXXXXX0000';
    const result = entropyValidator.scanContent(content);
    assert.strictEqual(result.hasSecrets, true);
    assert.ok(result.secrets.some(s => s.type.includes('Slack')));
});

test('Secret detection: Stripe Live Key', () => {
    const content = 'STRIPE_KEY=sk_test_FAKEKEYFORTESTING000000000000000';
    const result = entropyValidator.scanContent(content);
    assert.strictEqual(result.hasSecrets, true);
    assert.ok(result.secrets.some(s => s.type.includes('Stripe')));
});

test('Secret detection: Generic API Key pattern', () => {
    const content = 'api_key="abcd1234efgh5678ijkl9012mnop3456"';
    const result = entropyValidator.scanContent(content);
    assert.strictEqual(result.hasSecrets, true);
});

test('Secret detection: Database connection string', () => {
    const content = 'mongodb://admin:P@ssw0rd123@localhost:27017/mydb';
    const result = entropyValidator.scanContent(content);
    assert.strictEqual(result.hasSecrets, true);
    assert.ok(result.secrets.some(s => s.type.includes('Database')));
});

// =======================
// .ghostignore Tests
// =======================
console.log('\n🚫 .ghostignore Exclusion Tests\n');

// Create temporary test directory and .ghostignore file
const tempTestDir = path.join(os.tmpdir(), `ghost-test-${Date.now()}`);
fs.mkdirSync(tempTestDir, { recursive: true });

const ghostignoreContent = `# Test .ghostignore
AKIAIOSFODNN7EXAMPLE
wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
test-api-key-12345
ghp_test_token_for_testing_only
`;

fs.writeFileSync(path.join(tempTestDir, '.ghostignore'), ghostignoreContent);

test('.ghostignore: Excluded AWS key should be ignored', () => {
    const validator = new EntropyValidator();
    validator.loadGhostIgnore(tempTestDir);
    const content = 'AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE';
    const result = validator.scanContent(content);
    const awsSecrets = result.secrets.filter(s => s.value.includes('AKIAIOSFODNN7EXAMPLE'));
    assert.strictEqual(awsSecrets.length, 0);
});

test('.ghostignore: Excluded secret key should be ignored', () => {
    const validator = new EntropyValidator();
    validator.loadGhostIgnore(tempTestDir);
    const content = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY';
    const result = validator.scanContent(content);
    const secrets = result.secrets.filter(s => s.value && s.value.includes('wJalrXUtnFEMI'));
    assert.strictEqual(secrets.length, 0);
});

test('.ghostignore: Non-excluded secret should be detected', () => {
    const validator = new EntropyValidator();
    validator.loadGhostIgnore(tempTestDir);
    const content = 'REAL_SECRET=AKIA9876543210REALKEY';
    const result = validator.scanContent(content);
    assert.strictEqual(result.hasSecrets, true);
    assert.ok(result.secrets.some(s => s.type.includes('AWS')));
});

test('.ghostignore: Pattern exclusion works', () => {
    const validator = new EntropyValidator();
    validator.loadGhostIgnore(tempTestDir);
    const content = 'api_key="test-api-key-12345"';
    const result = validator.scanContent(content);
    const matchingSecrets = result.secrets.filter(s => s.value && s.value.includes('test-api-key-12345'));
    assert.strictEqual(matchingSecrets.length, 0);
});

// Cleanup temp directory
try {
    fs.rmSync(tempTestDir, { recursive: true, force: true });
} catch (error) {
    // Ignore cleanup errors
}

// =======================
// Positive Cases
// =======================
console.log('\n✅ Positive Cases - Valid Inputs\n');

test('PathValidator: Valid path without traversal passes', () => {
    const result = pathValidator.isPathAllowed('src/app.js');
    assert.strictEqual(result.allowed, true);
});

test('PathValidator: Valid nested path passes', () => {
    const result = pathValidator.isPathAllowed('test/data/fixtures/sample.json');
    assert.strictEqual(result.allowed, true);
});

test('NetworkValidator: Valid HTTPS URL passes', () => {
    const validator = new NetworkValidator({
        allowedSchemes: ['https'],
        allowedDomains: ['api.example.com'],
        allowLocalhostIPs: false
    });
    const result = validator.validateURL('https://api.example.com/v1/users');
    assert.strictEqual(result.valid, true);
});

test('NetworkValidator: Valid domain with wildcard passes', () => {
    const validator = new NetworkValidator({
        allowedSchemes: ['https'],
        allowedDomains: ['*.github.com'],
        allowLocalhostIPs: false
    });
    const result = validator.validateURL('https://api.github.com/repos');
    assert.strictEqual(result.valid, true);
});

test('CommandValidator: Valid git status passes', () => {
    const result = cmdValidator.validateCommand('git', ['status']);
    assert.strictEqual(result.valid, true);
});

test('CommandValidator: Valid git log with args passes', () => {
    const result = cmdValidator.validateCommand('git', ['log', '--oneline', '-n', '10']);
    assert.strictEqual(result.valid, true);
});

test('CommandValidator: Valid git diff passes', () => {
    const result = cmdValidator.validateCommand('git', ['diff', 'HEAD~1']);
    assert.strictEqual(result.valid, true);
});

test('EntropyValidator: Normal text without secrets passes', () => {
    const content = 'This is a normal comment with no secrets';
    const result = entropyValidator.scanContent(content);
    assert.strictEqual(result.hasSecrets, false);
});

test('EntropyValidator: Code with no secrets passes', () => {
    const content = 'function getData() { return { status: "ok", message: "success" }; }';
    const result = entropyValidator.scanContent(content);
    assert.strictEqual(result.hasSecrets, false);
});

test('EntropyValidator: Known non-secret model names pass', () => {
    const content = 'MODEL=claude-3-5-sonnet';
    const result = entropyValidator.scanContent(content);
    assert.strictEqual(result.hasSecrets, false);
});

// =======================
// Summary
// =======================
console.log('\n' + '='.repeat(60));
console.log('📊 Test Summary');
console.log('='.repeat(60));
console.log(`Total Tests: ${testCount}`);
console.log(`Passed: ${passedCount} ✅`);
console.log(`Failed: ${failedCount} ❌`);
console.log('='.repeat(60));

if (failedCount === 0) {
    console.log('\n🎉 All NIST SI-10 validator tests passed!');
    process.exit(0);
} else {
    console.log(`\n❌ ${failedCount} test(s) failed`);
    process.exit(1);
}
