const assert = require('assert');
const NetworkValidator = require('../core/validators/network-validator');

console.log('🧪 Testing Network Validator Hardening Features...\n');

console.log('▶ Test 1: NetworkValidator loads with new methods');
const validator = new NetworkValidator();
assert.strictEqual(typeof validator.resolveAndValidate, 'function', 'resolveAndValidate should be a function');
assert.strictEqual(typeof NetworkValidator.validateFromManifest, 'function', 'validateFromManifest should be a static function');
assert.strictEqual(typeof validator.normalizeIPNotation, 'function', 'normalizeIPNotation should be a function');
assert.strictEqual(typeof validator.decodeURLEncodedString, 'function', 'decodeURLEncodedString should be a function');
assert.strictEqual(typeof validator.isCloudMetadataEndpoint, 'function', 'isCloudMetadataEndpoint should be a function');
console.log('✅ All new methods present\n');

console.log('▶ Test 2: IP notation normalization - hexadecimal');
const hexIP = validator.normalizeIPNotation('0x7f000001');
assert.strictEqual(hexIP, '127.0.0.1', 'Should convert hex to dotted decimal');
console.log('✅ Hex IP normalized to', hexIP, '\n');

console.log('▶ Test 3: IP notation normalization - decimal');
const decimalIP = validator.normalizeIPNotation('2130706433');
assert.strictEqual(decimalIP, '127.0.0.1', 'Should convert decimal to dotted decimal');
console.log('✅ Decimal IP normalized to', decimalIP, '\n');

console.log('▶ Test 4: IP notation normalization - octal');
const octalIP = validator.normalizeIPNotation('017700000001');
assert.strictEqual(octalIP, '127.0.0.1', 'Should convert octal to dotted decimal');
console.log('✅ Octal IP normalized to', octalIP, '\n');

console.log('▶ Test 5: URL encoding obfuscation detection');
const encodedLocalhostURL = 'http://%31%32%37.0.0.1/admin';
const obfuscationCheck = validator.detectURLEncodingObfuscation(encodedLocalhostURL);
assert.strictEqual(obfuscationCheck.detected, true, 'Should detect encoded localhost');
assert.ok(obfuscationCheck.reason.includes('127'), 'Reason should mention 127');
console.log('✅ URL encoding obfuscation detected\n');

console.log('▶ Test 6: Cloud metadata endpoint detection - AWS');
assert.strictEqual(validator.isCloudMetadataEndpoint('169.254.169.254'), true, 'Should detect AWS metadata');
console.log('✅ AWS metadata endpoint detected\n');

console.log('▶ Test 7: Cloud metadata endpoint detection - Azure');
assert.strictEqual(validator.isCloudMetadataEndpoint('169.254.170.2'), true, 'Should detect Azure metadata');
console.log('✅ Azure metadata endpoint detected\n');

console.log('▶ Test 8: Cloud metadata endpoint detection - GCP');
assert.strictEqual(validator.isCloudMetadataEndpoint('metadata.google.internal'), true, 'Should detect GCP metadata');
console.log('✅ GCP metadata endpoint detected\n');

console.log('▶ Test 9: Cloud metadata endpoint detection - Azure domain');
assert.strictEqual(validator.isCloudMetadataEndpoint('metadata.azure.com'), true, 'Should detect Azure metadata domain');
console.log('✅ Azure metadata domain detected\n');

console.log('▶ Test 10: validateFromManifest static factory');
const manifestAllowlist = {
    schemes: ['https'],
    domains: ['api.github.com', '*.example.com'],
    requireTLS: true,
    allowPrivateIPs: false,
    allowLocalhostIPs: false
};

const result1 = NetworkValidator.validateFromManifest('https://api.github.com/repos', manifestAllowlist);
assert.strictEqual(result1.valid, true, 'Should allow whitelisted domain');

const result2 = NetworkValidator.validateFromManifest('https://api.evil.com/data', manifestAllowlist);
assert.strictEqual(result2.valid, false, 'Should block non-whitelisted domain');

const result3 = NetworkValidator.validateFromManifest('http://api.github.com/repos', manifestAllowlist);
assert.strictEqual(result3.valid, false, 'Should block non-HTTPS when TLS required');

console.log('✅ validateFromManifest working correctly\n');

console.log('▶ Test 11: Async resolveAndValidate with safe URL');
(async () => {
    try {
        const devValidator = NetworkValidator.createForDevelopment();
        const result = await devValidator.resolveAndValidate('https://www.google.com');
        assert.strictEqual(result.valid, true, 'Should validate safe URL');
        console.log('✅ Safe URL validated with DNS resolution\n');
        
        console.log('▶ Test 12: Async resolveAndValidate blocks localhost');
        const prodValidator = new NetworkValidator({ allowedSchemes: ['https', 'http'], requireTLS: false, allowLocalhostIPs: false });
        const localhostResult = await prodValidator.resolveAndValidate('http://localhost:8080/admin');
        assert.strictEqual(localhostResult.valid, false, 'Should block localhost');
        console.log('  Reason:', localhostResult.reason);
        assert.ok(localhostResult.reason.toLowerCase().includes('localhost') || localhostResult.reason.includes('SSRF'), 'Should mention localhost or SSRF in reason');
        console.log('✅ Localhost blocked\n');
        
        console.log('🎉 All network validator hardening tests passed!');
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        process.exit(1);
    }
})();
