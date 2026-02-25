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

test('Unicode normalization: UTF-16 encoded dots', () => {
    const result = pathValidator.isPathAllowed('\uFF0E\uFF0E\u002F\uFF0E\uFF0E\u002F');
    assert.strictEqual(result.allowed, true);
});

test('Unicode normalization: Mixed UTF-8/UTF-16', () => {
    const result = pathValidator.isPathAllowed('test/\u002e\u002e\uFF0F\uFF0E\uFF0E/secrets');
    assert.strictEqual(result.allowed, true);
});

test('Unicode normalization: Overlong UTF-8 sequences', () => {
    const result = pathValidator.isPathAllowed('\xc0\xae\xc0\xae\x2f\x2e\x2e\x2fetc/passwd');
    assert.strictEqual(result.allowed, false);
});

test('Unicode normalization: Zero-width characters', () => {
    const result = pathValidator.isPathAllowed('..\u200B/\u200B..\u200B/\u200Bsecrets');
    assert.strictEqual(result.allowed, false);
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

console.log('\n🔗 Symlink-based Path Escape Tests\n');

test('Symlink escape: Path outside root via absolute symlink target', () => {
    const result = pathValidator.isWithinRoot('/etc/shadow');
    assert.strictEqual(result, false);
});

test('Symlink escape: Path to system directory', () => {
    const result = pathValidator.isWithinRoot('/var/log/system.log');
    assert.strictEqual(result, false);
});

test('Symlink escape: Path with symlink traversal attempt', () => {
    const result = pathValidator.isPathAllowed('test-symlink/../../../etc/passwd');
    assert.strictEqual(result.allowed, false);
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

console.log('\n🌐 DNS Rebinding & Advanced IP Notation Tests\n');

test('DNS rebinding: metadata.google.internal', () => {
    const result = networkValidator.validateURL('http://metadata.google.internal');
    assert.strictEqual(result.valid, false);
    assert.ok(result.reason.includes('metadata'));
});

test('DNS rebinding: IPv4 169.254.169.254 (AWS metadata)', () => {
    const result = networkValidator.validateURL('http://169.254.169.254/latest/meta-data/');
    assert.strictEqual(result.valid, false);
});

test('DNS rebinding: IPv4 169.254.170.2 (ECS metadata)', () => {
    const result = networkValidator.validateURL('http://169.254.170.2/v2/credentials/');
    assert.strictEqual(result.valid, false);
});

test('DNS rebinding: metadata.azure.com', () => {
    const isMetadata = networkValidator.isCloudMetadataEndpoint('metadata.azure.com');
    assert.strictEqual(isMetadata, true);
});

test('IP notation: Decimal 2130706433 = 127.0.0.1', () => {
    const normalizedIP = networkValidator.normalizeIPNotation('2130706433');
    assert.strictEqual(normalizedIP, '127.0.0.1');
    const ssrfCheck = networkValidator.isSSRFAttempt(normalizedIP);
    assert.strictEqual(ssrfCheck.isSSRF, true);
});

test('IP notation: Hex 0x7f000001 = 127.0.0.1', () => {
    const normalizedIP = networkValidator.normalizeIPNotation('0x7f000001');
    assert.strictEqual(normalizedIP, '127.0.0.1');
    const ssrfCheck = networkValidator.isSSRFAttempt(normalizedIP);
    assert.strictEqual(ssrfCheck.isSSRF, true);
});

test('IP notation: Octal 017700000001 = 127.0.0.1', () => {
    const normalizedIP = networkValidator.normalizeIPNotation('017700000001');
    assert.strictEqual(normalizedIP, '127.0.0.1');
});

test('IP notation: Decimal private IP 167772161 = 10.0.0.1', () => {
    const normalizedIP = networkValidator.normalizeIPNotation('167772161');
    assert.strictEqual(normalizedIP, '10.0.0.1');
    const isPrivate = networkValidator.isPrivateIP(normalizedIP);
    assert.strictEqual(isPrivate, true);
});

test('IP notation: Hex 0x0a000001 = 10.0.0.1', () => {
    const normalizedIP = networkValidator.normalizeIPNotation('0x0a000001');
    assert.strictEqual(normalizedIP, '10.0.0.1');
});

test('IPv6 localhost: ::1', () => {
    const isLocalhost = networkValidator.isLocalhostIP('::1');
    assert.strictEqual(isLocalhost, true);
});

test('IPv6 localhost variant: ::ffff:127.0.0.1', () => {
    const isLocalhost = networkValidator.isLocalhostIP('::ffff:127.0.0.1');
    assert.strictEqual(isLocalhost, false);
});

test('IPv6 localhost: 0:0:0:0:0:0:0:1', () => {
    const isLocalhost = networkValidator.isLocalhostIP('0:0:0:0:0:0:0:1');
    assert.strictEqual(isLocalhost, false);
});

test('IPv6 link-local: fe80::1', () => {
    const isPrivate = networkValidator.isPrivateIP('fe80::1');
    assert.strictEqual(isPrivate, true);
});

test('IPv6 unique local: fc00::1', () => {
    const isPrivate = networkValidator.isPrivateIP('fc00::1');
    assert.strictEqual(isPrivate, true);
});

test('IPv6 unique local: fd00::1', () => {
    const isPrivate = networkValidator.isPrivateIP('fd00::1');
    assert.strictEqual(isPrivate, true);
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

console.log('\n⚙️  Environment Variable Expansion Injection Tests\n');

test('Command injection: $VAR expansion', () => {
    const hasInjection = cmdValidator.hasInjectionAttempt('status $HOME');
    assert.strictEqual(hasInjection, true);
});

test('Command injection: ${VAR} expansion', () => {
    const hasInjection = cmdValidator.hasInjectionAttempt('log ${PATH}/bin');
    assert.strictEqual(hasInjection, true);
});

test('Command injection: $VAR with command substitution', () => {
    const hasInjection = cmdValidator.hasInjectionAttempt('log $USER-$(id)');
    assert.strictEqual(hasInjection, true);
});

test('Command injection: Multiple ${VAR} expansions', () => {
    const hasInjection = cmdValidator.hasInjectionAttempt('commit -m "${USER}:${PWD}"');
    assert.strictEqual(hasInjection, true);
});

test('Command injection: $VAR in quoted string', () => {
    const hasInjection = cmdValidator.hasInjectionAttempt('"message with $HOME"');
    assert.strictEqual(hasInjection, true);
});

test('Command injection: ${VAR:-default} syntax', () => {
    const hasInjection = cmdValidator.hasInjectionAttempt('${VAR:-default}');
    assert.strictEqual(hasInjection, true);
});

test('Command injection: Environment var with backticks', () => {
    const hasInjection = cmdValidator.hasInjectionAttempt('log $PATH `whoami`');
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

console.log('\n🔐 Additional Cloud Provider & Service API Keys\n');

test('Secret detection: Google Cloud Service Account Key (full)', () => {
    const content = '{"type": "service_account", "project_id": "my-project", "private_key_id": "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0", "private_key": "-----BEGIN PRIVATE KEY-----\\nMIIEvQIBADANBgkqhkiG9w0BAQ...\\n-----END PRIVATE KEY-----\\n"}';
    const result = entropyValidator.scanContent(content);
    assert.strictEqual(result.hasSecrets, true);
    assert.ok(result.secrets.some(s => s.type.includes('Service Account') || s.type.includes('Private Key')));
});

test('Secret detection: Google Cloud Private Key ID', () => {
    const content = '"private_key_id": "1234567890abcdef1234567890abcdef12345678"';
    const result = entropyValidator.scanContent(content);
    assert.strictEqual(result.hasSecrets, true);
    assert.ok(result.secrets.some(s => s.type.includes('Private Key ID') || s.type.includes('private_key_id')));
});

test('Secret detection: Stripe Live Secret Key', () => {
    const content = 'STRIPE_SECRET=sk_test_FAKEKEYFORTESTING0000000000000005kVCdPJLE9bYm';
    const result = entropyValidator.scanContent(content);
    assert.strictEqual(result.hasSecrets, true);
    assert.ok(result.secrets.some(s => s.type.includes('Stripe')));
});

test('Secret detection: Stripe Restricted Key', () => {
    const content = 'STRIPE_KEY=rk_live_51HqJTF2eZvKYlo2CNWY4mho4vPR1iI';
    const result = entropyValidator.scanContent(content);
    assert.strictEqual(result.hasSecrets, true);
    assert.ok(result.secrets.some(s => s.type.includes('Stripe')));
});

test('Secret detection: Twilio API Key', () => {
    const content = 'TWILIO_API_KEY=SK1234567890abcdef1234567890abcdef';
    const result = entropyValidator.scanContent(content);
    assert.strictEqual(result.hasSecrets, true);
    assert.ok(result.secrets.some(s => s.type.includes('Twilio')));
});

test('Secret detection: Twilio Account SID format', () => {
    const content = 'ACCOUNT_SID=SK1234567890abcdef1234567890abcdef';
    const result = entropyValidator.scanContent(content);
    assert.strictEqual(result.hasSecrets, true);
    assert.ok(result.secrets.some(s => s.type.includes('Twilio')));
});

test('Secret detection: Azure Storage Connection String', () => {
    const content = 'DefaultEndpointsProtocol=https;AccountName=mystorageaccount;AccountKey=abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcdefghijklmnopqrstuv==;EndpointSuffix=core.windows.net';
    const result = entropyValidator.scanContent(content);
    assert.strictEqual(result.hasSecrets, true);
    assert.ok(result.secrets.some(s => s.type.includes('Azure')));
});

test('Secret detection: Azure Shared Access Signature', () => {
    const content = 'https://mystorageaccount.blob.core.windows.net/?sv=2020-08-04&ss=bfqt&srt=sco&sp=rwdlacupx&se=2023-12-31T23:59:59Z&st=2023-01-01T00:00:00Z&spr=https&sig=abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ0%3D';
    const result = entropyValidator.scanContent(content);
    assert.strictEqual(result.hasSecrets, true);
    assert.ok(result.secrets.some(s => s.type.includes('Azure') || s.type.includes('Signature')));
});

test('Secret detection: Azure Connection String with HTTP', () => {
    const content = 'DefaultEndpointsProtocol=http;AccountName=devstoreaccount1;AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==';
    const result = entropyValidator.scanContent(content);
    assert.strictEqual(result.hasSecrets, true);
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
sk_live_test12345678901234567890
SK1234567890abcdef1234567890TEST
a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5TEST
DefaultEndpointsProtocol=https;AccountName=teststorage;AccountKey=testkey12345678901234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcdefghijklmnopqrstuv==
metadata.test.internal
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

test('.ghostignore: Stripe test key exclusion', () => {
    const validator = new EntropyValidator();
    validator.loadGhostIgnore(tempTestDir);
    const content = 'STRIPE_KEY=sk_live_test12345678901234567890';
    const result = validator.scanContent(content);
    const stripeSecrets = result.secrets.filter(s => s.value && s.value.includes('sk_live_test'));
    assert.strictEqual(stripeSecrets.length, 0);
});

test('.ghostignore: Twilio test key exclusion', () => {
    const validator = new EntropyValidator();
    validator.loadGhostIgnore(tempTestDir);
    const content = 'TWILIO_KEY=SK1234567890abcdef1234567890TEST';
    const result = validator.scanContent(content);
    const twilioSecrets = result.secrets.filter(s => s.value && s.value.includes('SK1234567890abcdef1234567890TEST'));
    assert.strictEqual(twilioSecrets.length, 0);
});

test('.ghostignore: Google Cloud test private_key_id exclusion', () => {
    const validator = new EntropyValidator();
    validator.loadGhostIgnore(tempTestDir);
    const content = '"private_key_id": "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5TEST"';
    const result = validator.scanContent(content);
    const gcpSecrets = result.secrets.filter(s => s.value && s.value.includes('a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5TEST'));
    assert.strictEqual(gcpSecrets.length, 0);
});

test('.ghostignore: Azure connection string test exclusion', () => {
    const validator = new EntropyValidator();
    validator.loadGhostIgnore(tempTestDir);
    const content = 'DefaultEndpointsProtocol=https;AccountName=teststorage;AccountKey=testkey12345678901234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcdefghijklmnopqrstuv==';
    const result = validator.scanContent(content);
    const azureSecrets = result.secrets.filter(s => s.value && s.value.includes('teststorage'));
    assert.strictEqual(azureSecrets.length, 0);
});

test('.ghostignore: Metadata endpoint exclusion', () => {
    const validator = new EntropyValidator();
    validator.loadGhostIgnore(tempTestDir);
    const content = 'endpoint=metadata.test.internal';
    const result = validator.scanContent(content);
    const metadataSecrets = result.secrets.filter(s => s.value && s.value.includes('metadata.test.internal'));
    assert.strictEqual(metadataSecrets.length, 0);
});

test('.ghostignore: Real secrets not in ignore list are detected', () => {
    const validator = new EntropyValidator();
    validator.loadGhostIgnore(tempTestDir);
    const content = 'STRIPE_KEY=sk_live_51RealKey123456789012345678901234567890';
    const result = validator.scanContent(content);
    assert.strictEqual(result.hasSecrets, true);
});

test('.ghostignore: Multiple patterns all work', () => {
    const validator = new EntropyValidator();
    validator.loadGhostIgnore(tempTestDir);
    const content = `
        AWS_KEY=AKIAIOSFODNN7EXAMPLE
        AWS_SECRET=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
        API_KEY=test-api-key-12345
        GITHUB_TOKEN=ghp_test_token_for_testing_only
    `;
    const result = validator.scanContent(content);
    const filteredSecrets = result.secrets.filter(s => 
        !s.value.includes('AKIAIOSFODNN7EXAMPLE') &&
        !s.value.includes('wJalrXUtnFEMI') &&
        !s.value.includes('test-api-key-12345') &&
        !s.value.includes('ghp_test_token_for_testing_only')
    );
    assert.strictEqual(filteredSecrets.length, 0);
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
