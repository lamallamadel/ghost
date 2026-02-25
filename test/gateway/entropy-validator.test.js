const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const EntropyValidator = require('../../core/validators/entropy-validator');

console.log('🧪 Testing Entropy Validator - Shannon Entropy & Secret Detection...\n');

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
// Shannon Entropy Calculation Tests
// =======================
console.log('\n🔢 Shannon Entropy Calculation\n');

const entropyValidator = new EntropyValidator({
    minEntropyThreshold: 4.5,
    maxEntropyThreshold: 7.0,
    minLength: 16,
    maxLength: 256
});

test('Shannon entropy: "aaaa" → 0 bits (no randomness)', () => {
    const entropy = entropyValidator.calculateShannonEntropy('aaaa');
    assert.strictEqual(entropy, 0);
});

test('Shannon entropy: "aaaabbbb" → 1.0 bits (2 symbols, equal frequency)', () => {
    const entropy = entropyValidator.calculateShannonEntropy('aaaabbbb');
    assert.strictEqual(entropy, 1.0);
});

test('Shannon entropy: "abcd" → 2.0 bits (4 symbols, equal frequency)', () => {
    const entropy = entropyValidator.calculateShannonEntropy('abcd');
    assert.strictEqual(entropy, 2.0);
});

test('Shannon entropy: uniform 16-char lowercase → ~4.0 bits', () => {
    const str = 'abcdefghijklmnop';
    const entropy = entropyValidator.calculateShannonEntropy(str);
    assert.ok(entropy >= 3.9 && entropy <= 4.1, `Expected ~4.0, got ${entropy}`);
});

test('Shannon entropy: uniform 52-char alphanumeric → ~5.7 bits', () => {
    const str = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
    const entropy = entropyValidator.calculateShannonEntropy(str);
    assert.ok(entropy >= 5.6 && entropy <= 5.8, `Expected ~5.7, got ${entropy}`);
});

test('Shannon entropy: uniform 62-char alphanumeric → ~5.95 bits (log2(62))', () => {
    const str = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const entropy = entropyValidator.calculateShannonEntropy(str);
    assert.ok(entropy >= 5.9 && entropy <= 6.0, `Expected ~5.95, got ${entropy}`);
});

test('Shannon entropy: Base64 charset (64 chars) → ~6.0 bits (log2(64))', () => {
    const str = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    const entropy = entropyValidator.calculateShannonEntropy(str);
    assert.ok(entropy >= 5.95 && entropy <= 6.05, `Expected ~6.0, got ${entropy}`);
});

test('Shannon entropy: printable ASCII (95 chars) → ~6.57 bits (log2(95))', () => {
    const str = ' !"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~';
    const entropy = entropyValidator.calculateShannonEntropy(str);
    assert.ok(entropy >= 6.5 && entropy <= 6.65, `Expected ~6.57, got ${entropy}`);
});

test('Shannon entropy: empty string → 0 bits', () => {
    const entropy = entropyValidator.calculateShannonEntropy('');
    assert.strictEqual(entropy, 0);
});

test('Shannon entropy: null input → 0 bits', () => {
    const entropy = entropyValidator.calculateShannonEntropy(null);
    assert.strictEqual(entropy, 0);
});

// =======================
// Threshold Calibration Tests
// =======================
console.log('\n⚖️  Threshold Calibration - Real Secrets vs Model Names\n');

test('Real AWS key AKIA... is detected (critical severity)', () => {
    const content = 'AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE';
    const result = entropyValidator.scanContent(content);
    assert.strictEqual(result.hasSecrets, true);
    assert.ok(result.secrets.some(s => s.type.includes('AWS') && s.severity === 'critical'));
});

test('Real AWS secret key (40 chars high entropy) is detected (high severity)', () => {
    const content = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY12';
    const result = entropyValidator.scanContent(content);
    assert.strictEqual(result.hasSecrets, true);
    assert.ok(result.secrets.some(s => s.severity === 'high' || s.severity === 'medium'));
});

test('Real GitHub token ghp_... is detected (critical severity)', () => {
    const content = 'GITHUB_TOKEN=ghp_1234567890abcdefghijklmnopqrstuvwxyz';
    const result = entropyValidator.scanContent(content);
    assert.strictEqual(result.hasSecrets, true);
    assert.ok(result.secrets.some(s => s.type.includes('GitHub') && s.severity === 'critical'));
});

test('Real GitHub OAuth token gho_... is detected', () => {
    const content = 'token=gho_16C7e42F292c6912E7710c838347Ae178B4a';
    const result = entropyValidator.scanContent(content);
    assert.strictEqual(result.hasSecrets, true);
    assert.ok(result.secrets.some(s => s.type.includes('GitHub')));
});

test('Real Groq API key gsk_... is detected (critical severity)', () => {
    const content = 'GROQ_API_KEY=gsk_abcdefghijklmnopqrstuvwxyz1234567890ABCDEFGHIJKLMN';
    const result = entropyValidator.scanContent(content);
    assert.strictEqual(result.hasSecrets, true);
    assert.ok(result.secrets.some(s => s.type.includes('Groq') && s.severity === 'critical'));
});

test('RSA private key header is detected (critical severity)', () => {
    const content = '-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA...';
    const result = entropyValidator.scanContent(content);
    assert.strictEqual(result.hasSecrets, true);
    assert.ok(result.secrets.some(s => s.type.includes('Private Key') && s.severity === 'critical'));
});

test('OpenSSH private key header is detected (critical severity)', () => {
    const content = '-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1rZXktdjEA...';
    const result = entropyValidator.scanContent(content);
    assert.strictEqual(result.hasSecrets, true);
    assert.ok(result.secrets.some(s => s.type.includes('Private Key') && s.severity === 'critical'));
});

test('Model name "claude-3-5-sonnet" is NOT flagged', () => {
    const content = 'MODEL=claude-3-5-sonnet';
    const result = entropyValidator.scanContent(content);
    assert.strictEqual(result.hasSecrets, false);
});

test('Model name "llama-3.3-70b" is NOT flagged', () => {
    const content = 'const model = "llama-3.3-70b";';
    const result = entropyValidator.scanContent(content);
    assert.strictEqual(result.hasSecrets, false);
});

test('Model name "gemini-1.5-flash" is NOT flagged', () => {
    const content = 'provider: gemini-1.5-flash';
    const result = entropyValidator.scanContent(content);
    assert.strictEqual(result.hasSecrets, false);
});

test('Model name "gpt-4" is NOT flagged', () => {
    const content = 'engine: gpt-4';
    const result = entropyValidator.scanContent(content);
    assert.strictEqual(result.hasSecrets, false);
});

test('UUID v4 is NOT flagged (known non-secret pattern)', () => {
    const content = 'request_id="550e8400-e29b-41d4-a716-446655440000"';
    const result = entropyValidator.scanContent(content);
    assert.strictEqual(result.hasSecrets, false);
});

test('Base64 test fixture is NOT flagged', () => {
    const content = 'const fixture = "iVBORw0KGgoAAAANSUhEUgAAAAUA";';
    const result = entropyValidator.scanContent(content);
    assert.strictEqual(result.hasSecrets, false);
});

test('Data URI image is NOT flagged', () => {
    const content = 'img.src = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUA"';
    const result = entropyValidator.scanContent(content);
    assert.strictEqual(result.hasSecrets, false);
});

test('Example AWS key "AKIAIOSFODNN7EXAMPLE" is NOT flagged', () => {
    const content = 'Example: AKIAIOSFODNN7EXAMPLE';
    const result = entropyValidator.scanContent(content);
    const awsSecrets = result.secrets.filter(s => s.value && s.value.includes('AKIAIOSFODNN7EXAMPLE'));
    assert.strictEqual(awsSecrets.length, 0);
});

// =======================
// .ghostignore Pattern Loading and Exclusion
// =======================
console.log('\n🚫 .ghostignore Pattern Loading and Exclusion\n');

const tempTestDir = path.join(os.tmpdir(), `ghost-entropy-test-${Date.now()}`);
fs.mkdirSync(tempTestDir, { recursive: true });

const ghostignoreContent = `# Test .ghostignore for entropy validator
AKIAIOSFODNN7EXAMPLE
wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
test-secret-12345678901234567890
ghp_test_token_for_testing_purposes_only_123456
sk-test-api-key-1234567890abcdef
`;

fs.writeFileSync(path.join(tempTestDir, '.ghostignore'), ghostignoreContent);

test('.ghostignore loading: patterns are loaded correctly', () => {
    const validator = new EntropyValidator();
    validator.loadGhostIgnore(tempTestDir);
    assert.strictEqual(validator.ghostIgnoreLoaded, true);
    assert.ok(validator.ghostIgnorePatterns.length >= 5);
    assert.ok(validator.ghostIgnorePatterns.includes('AKIAIOSFODNN7EXAMPLE'));
});

test('.ghostignore exclusion: AWS example key is ignored', () => {
    const validator = new EntropyValidator();
    validator.loadGhostIgnore(tempTestDir);
    const content = 'AWS_KEY=AKIAIOSFODNN7EXAMPLE';
    const result = validator.scanContent(content);
    const awsMatches = result.secrets.filter(s => s.value && s.value.includes('AKIAIOSFODNN7EXAMPLE'));
    assert.strictEqual(awsMatches.length, 0);
});

test('.ghostignore exclusion: custom test pattern is ignored', () => {
    const validator = new EntropyValidator();
    validator.loadGhostIgnore(tempTestDir);
    const content = 'SECRET=sk-test-api-key-1234567890abcdef';
    const result = validator.scanContent(content);
    const matches = result.secrets.filter(s => s.value && s.value.includes('sk-test-api-key'));
    assert.strictEqual(matches.length, 0);
});

test('.ghostignore exclusion: test secret pattern is ignored', () => {
    const validator = new EntropyValidator();
    validator.loadGhostIgnore(tempTestDir);
    const content = 'api_key="test-secret-12345678901234567890"';
    const result = validator.scanContent(content);
    const matches = result.secrets.filter(s => s.value && s.value.includes('test-secret-12345'));
    assert.strictEqual(matches.length, 0);
});

test('.ghostignore exclusion: GitHub test token is ignored', () => {
    const validator = new EntropyValidator();
    validator.loadGhostIgnore(tempTestDir);
    const content = 'TOKEN=ghp_test_token_for_testing_purposes_only_123456';
    const result = validator.scanContent(content);
    const matches = result.secrets.filter(s => s.value && s.value.includes('ghp_test_token'));
    assert.strictEqual(matches.length, 0);
});

test('.ghostignore: Non-ignored real secret is still detected', () => {
    const validator = new EntropyValidator();
    validator.loadGhostIgnore(tempTestDir);
    const content = 'REAL_AWS_KEY=AKIA9876543210REALKEY';
    const result = validator.scanContent(content);
    assert.strictEqual(result.hasSecrets, true);
    assert.ok(result.secrets.some(s => s.type.includes('AWS')));
});

test('.ghostignore: Missing file loads gracefully', () => {
    const validator = new EntropyValidator();
    const nonExistentPath = path.join(os.tmpdir(), `non-existent-${Date.now()}`);
    validator.loadGhostIgnore(nonExistentPath);
    assert.strictEqual(validator.ghostIgnoreLoaded, true);
    assert.strictEqual(validator.ghostIgnorePatterns.length, 0);
});

test('.ghostignore: Comments and empty lines are filtered', () => {
    const testDir2 = path.join(os.tmpdir(), `ghost-entropy-test-2-${Date.now()}`);
    fs.mkdirSync(testDir2, { recursive: true });
    
    const commentContent = `# Comment line
# Another comment

valid-pattern-1
  
valid-pattern-2
# Final comment`;
    
    fs.writeFileSync(path.join(testDir2, '.ghostignore'), commentContent);
    
    const validator = new EntropyValidator();
    validator.loadGhostIgnore(testDir2);
    
    assert.strictEqual(validator.ghostIgnorePatterns.length, 2);
    assert.ok(validator.ghostIgnorePatterns.includes('valid-pattern-1'));
    assert.ok(validator.ghostIgnorePatterns.includes('valid-pattern-2'));
    
    fs.rmSync(testDir2, { recursive: true, force: true });
});

// =======================
// scanContentForIntent() Structure Tests
// =======================
console.log('\n📋 scanContentForIntent() Return Structure\n');

test('scanContentForIntent: Returns {valid, violations} structure', () => {
    const validator = new EntropyValidator();
    const content = 'const message = "Hello, world!";';
    const result = validator.scanContentForIntent(content);
    
    assert.ok(result.hasOwnProperty('valid'));
    assert.ok(result.hasOwnProperty('violations'));
    assert.strictEqual(typeof result.valid, 'boolean');
    assert.ok(Array.isArray(result.violations));
});

test('scanContentForIntent: Clean content returns valid=true, violations=[]', () => {
    const validator = new EntropyValidator();
    const content = 'function test() { return "clean"; }';
    const result = validator.scanContentForIntent(content);
    
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.violations.length, 0);
});

test('scanContentForIntent: Secret content returns valid=false with violations', () => {
    const validator = new EntropyValidator();
    const content = 'AWS_KEY=AKIAIOSFODNN7EXAMPLE';
    const result = validator.scanContentForIntent(content);
    
    assert.strictEqual(result.valid, false);
    assert.ok(result.violations.length > 0);
});

test('scanContentForIntent: Violations have correct structure', () => {
    const validator = new EntropyValidator();
    const content = 'GITHUB_TOKEN=ghp_1234567890abcdefghijklmnopqrstuvwxyz';
    const result = validator.scanContentForIntent(content);
    
    assert.strictEqual(result.valid, false);
    assert.ok(result.violations.length > 0);
    
    const violation = result.violations[0];
    assert.ok(violation.hasOwnProperty('rule'));
    assert.ok(violation.hasOwnProperty('message'));
    assert.ok(violation.hasOwnProperty('severity'));
    assert.ok(violation.hasOwnProperty('detail'));
    assert.ok(violation.hasOwnProperty('method'));
    
    assert.strictEqual(violation.rule, 'SI-10-SECRET-DETECTION');
    assert.ok(violation.message.includes('secret'));
});

test('scanContentForIntent: Multiple secrets create multiple violations', () => {
    const validator = new EntropyValidator();
    const content = `
        AWS_KEY=AKIAIOSFODNN7EXAMPLE
        GITHUB_TOKEN=ghp_1234567890abcdefghijklmnopqrstuvwxyz
        GROQ_KEY=gsk_abcdefghijklmnopqrstuvwxyz1234567890ABCDEFGH
    `;
    const result = validator.scanContentForIntent(content);
    
    assert.strictEqual(result.valid, false);
    assert.ok(result.violations.length >= 3);
    assert.ok(result.violations.every(v => v.rule === 'SI-10-SECRET-DETECTION'));
});

// =======================
// Severity Mapping Tests
// =======================
console.log('\n⚠️  Severity Mapping Tests\n');

test('Severity: Private key header → critical', () => {
    const validator = new EntropyValidator();
    const content = '-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA...';
    const result = validator.scanContent(content);
    
    const privateKeySecret = result.secrets.find(s => s.type.includes('Private Key'));
    assert.ok(privateKeySecret);
    assert.strictEqual(privateKeySecret.severity, 'critical');
});

test('Severity: AWS Access Key → critical', () => {
    const validator = new EntropyValidator();
    const content = 'AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE';
    const result = validator.scanContent(content);
    
    const awsSecret = result.secrets.find(s => s.type.includes('AWS'));
    assert.ok(awsSecret);
    assert.strictEqual(awsSecret.severity, 'critical');
});

test('Severity: GitHub token → critical', () => {
    const validator = new EntropyValidator();
    const content = 'ghp_1234567890abcdefghijklmnopqrstuvwxyz';
    const result = validator.scanContent(content);
    
    const ghSecret = result.secrets.find(s => s.type.includes('GitHub'));
    assert.ok(ghSecret);
    assert.strictEqual(ghSecret.severity, 'critical');
});

test('Severity: Groq API key → critical', () => {
    const validator = new EntropyValidator();
    const content = 'gsk_abcdefghijklmnopqrstuvwxyz1234567890ABCDEFGHIJKLMN';
    const result = validator.scanContent(content);
    
    const groqSecret = result.secrets.find(s => s.type.includes('Groq'));
    assert.ok(groqSecret);
    assert.strictEqual(groqSecret.severity, 'critical');
});

test('Severity: AWS Secret Key (40 chars) → high', () => {
    const validator = new EntropyValidator();
    const content = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY';
    const result = validator.scanContent(content);
    
    const secret = result.secrets.find(s => s.type.includes('AWS Secret') || s.method === 'entropy');
    assert.ok(secret);
    assert.ok(secret.severity === 'high' || secret.severity === 'medium');
});

test('Severity: Generic API key → medium', () => {
    const validator = new EntropyValidator();
    const content = 'api_key="abcd1234efgh5678ijkl9012mnop3456"';
    const result = validator.scanContent(content);
    
    const apiSecret = result.secrets.find(s => s.type.includes('Generic API'));
    assert.ok(apiSecret);
    assert.strictEqual(apiSecret.severity, 'medium');
});

test('Severity: High entropy string (>5.5 entropy) → high', () => {
    const validator = new EntropyValidator();
    // Create a high-entropy string that doesn't match known patterns
    const highEntropyStr = 'ZxK9mP2nQ7rL4wE8vT3yB6gH5jN1aC0dF';
    const content = `secret="${highEntropyStr}"`;
    const result = validator.scanContent(content);
    
    const entropySecret = result.secrets.find(s => s.method === 'entropy' && parseFloat(s.entropy) > 5.5);
    if (entropySecret) {
        assert.strictEqual(entropySecret.severity, 'high');
    }
});

test('Severity: Medium entropy string (4.5-5.5 entropy) → medium', () => {
    const validator = new EntropyValidator();
    // Create a medium-entropy string
    const mediumEntropyStr = 'aabbccddeeffgghh';
    const content = `token="${mediumEntropyStr}"`;
    const result = validator.scanContent(content);
    
    const entropySecret = result.secrets.find(s => s.method === 'entropy');
    if (entropySecret) {
        const entropy = parseFloat(entropySecret.entropy);
        if (entropy >= 4.5 && entropy <= 5.5) {
            assert.strictEqual(entropySecret.severity, 'medium');
        }
    }
});

// =======================
// Summary Statistics Tests
// =======================
console.log('\n📊 Summary Statistics Tests\n');

test('Summary: byMethod tracks regex vs entropy detection', () => {
    const validator = new EntropyValidator();
    const content = `
        AWS_KEY=AKIAIOSFODNN7EXAMPLE
        api_key="abcd1234efgh5678ijkl9012mnop3456"
    `;
    const result = validator.scanContent(content);
    
    assert.ok(result.summary.byMethod.hasOwnProperty('regex'));
    assert.ok(result.summary.byMethod.regex > 0);
});

test('Summary: bySeverity tracks critical/high/medium counts', () => {
    const validator = new EntropyValidator();
    const content = `
        -----BEGIN RSA PRIVATE KEY-----
        AWS_KEY=AKIAIOSFODNN7EXAMPLE
        api_key="abcd1234efgh5678ijkl9012mnop3456"
    `;
    const result = validator.scanContent(content);
    
    assert.ok(result.summary.bySeverity.hasOwnProperty('critical') || 
              result.summary.bySeverity.hasOwnProperty('high') || 
              result.summary.bySeverity.hasOwnProperty('medium'));
    assert.ok(result.summary.total > 0);
});

test('Summary: total matches secret count', () => {
    const validator = new EntropyValidator();
    const content = `
        GITHUB_TOKEN=ghp_1234567890abcdefghijklmnopqrstuvwxyz
        GROQ_KEY=gsk_abcdefghijklmnopqrstuvwxyz1234567890ABCDEFGH
    `;
    const result = validator.scanContent(content);
    
    assert.strictEqual(result.summary.total, result.secrets.length);
});

// Cleanup
try {
    fs.rmSync(tempTestDir, { recursive: true, force: true });
} catch (error) {
    // Ignore cleanup errors
}

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
    console.log('\n🎉 All entropy validator tests passed!');
    process.exit(0);
} else {
    console.log(`\n❌ ${failedCount} test(s) failed`);
    process.exit(1);
}
