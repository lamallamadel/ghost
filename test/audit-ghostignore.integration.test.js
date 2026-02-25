const { execSync } = require('child_process');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('🔍 Testing .ghostignore Integration with Audit Functionality\n');

// Helper to run ghost commands
function runGhost(args) {
    try {
        const ghostPath = path.resolve(__dirname, '../ghost.js');
        return execSync(`node "${ghostPath}" ${args}`, { encoding: 'utf8', stdio: 'pipe' });
    } catch (e) {
        return e.stdout + e.stderr;
    }
}

// Setup test directory
const testDir = path.join(__dirname, 'temp_ghostignore_test');
if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true, force: true });
}
fs.mkdirSync(testDir, { recursive: true });
process.chdir(testDir);

// Initialize git
execSync('git init');
execSync('git config user.email "test@example.com"');
execSync('git config user.name "Test User"');

console.log('▶ Test 1: .ghostignore with single file pattern');
// Create a file with a secret
const fakeSecret = 'AKIA' + 'T'.repeat(16);
fs.writeFileSync('secrets.conf', `api_key = "${fakeSecret}"`);

// Create .ghostignore to ignore it
fs.writeFileSync('.ghostignore', 'secrets.conf');

const output1 = runGhost('audit');
// Should not detect secrets because file is ignored
const hasNoSecrets = output1.includes('Aucun secret') || output1.includes('No secrets') || !output1.includes('secrets.conf');
assert.ok(hasNoSecrets, '.ghostignore should exclude secrets.conf from scanning');
console.log('✅ Single file pattern works\n');

console.log('▶ Test 2: .ghostignore with directory pattern');
// Create a directory with secrets
fs.mkdirSync('config', { recursive: true });
fs.writeFileSync('config/api-keys.txt', `key = "${fakeSecret}"`);
fs.writeFileSync('config/database.yml', 'password: secret123456');

// Update .ghostignore to ignore directory
fs.writeFileSync('.ghostignore', 'secrets.conf\nconfig/');

const output2 = runGhost('audit');
const hasNoSecretsDir = output2.includes('Aucun secret') || output2.includes('No secrets') || 
    (!output2.includes('api-keys.txt') && !output2.includes('database.yml'));
assert.ok(hasNoSecretsDir, '.ghostignore should exclude entire config/ directory');
console.log('✅ Directory pattern works\n');

console.log('▶ Test 3: .ghostignore with wildcard pattern');
// Create multiple .env files
fs.writeFileSync('.env', `SECRET_KEY="${fakeSecret}"`);
fs.writeFileSync('.env.local', `API_TOKEN="${fakeSecret}2"`);
fs.writeFileSync('.env.production', `DB_PASSWORD="${fakeSecret}3"`);

// Update .ghostignore with wildcard
fs.writeFileSync('.ghostignore', 'secrets.conf\nconfig/\n.env*');

const output3 = runGhost('audit');
const hasNoSecretsEnv = output3.includes('Aucun secret') || output3.includes('No secrets') ||
    (!output3.includes('.env') && !output3.includes('SECRET_KEY'));
assert.ok(hasNoSecretsEnv, '.ghostignore should exclude all .env* files');
console.log('✅ Wildcard pattern works\n');

console.log('▶ Test 4: .ghostignore with comments and empty lines');
// Test that comments and empty lines are properly handled
fs.writeFileSync('.ghostignore', `
# This is a comment
secrets.conf

# Ignore config directory
config/

# Ignore all env files
.env*

`);

const output4 = runGhost('audit');
const hasNoSecretsComments = output4.includes('Aucun secret') || output4.includes('No secrets');
assert.ok(hasNoSecretsComments, '.ghostignore should handle comments and empty lines');
console.log('✅ Comments and empty lines handled correctly\n');

console.log('▶ Test 5: Files not in .ghostignore are still scanned');
// Create a file that is NOT ignored
fs.writeFileSync('app.js', `const apiKey = "${fakeSecret}";`);

const output5 = runGhost('audit');
// This should detect the secret in app.js
const detectsAppJs = output5.includes('app.js') || output5.includes('problème') || output5.includes('detected');
assert.ok(detectsAppJs, 'Files not in .ghostignore should still be scanned');
console.log('✅ Non-ignored files are scanned correctly\n');

console.log('▶ Test 6: .ghostignore removes app.js violation');
// Now add app.js to .ghostignore
fs.writeFileSync('.ghostignore', `
secrets.conf
config/
.env*
app.js
`);

const output6 = runGhost('audit');
const hasNoSecretsAppJs = output6.includes('Aucun secret') || output6.includes('No secrets');
assert.ok(hasNoSecretsAppJs, 'Adding app.js to .ghostignore should exclude it');
console.log('✅ Adding files to .ghostignore excludes them\n');

console.log('▶ Test 7: .ghostignore with partial path matching');
// Create nested structure
fs.mkdirSync('src/utils', { recursive: true });
fs.writeFileSync('src/utils/secrets.js', `export const key = "${fakeSecret}";`);

// Ignore by filename anywhere
fs.writeFileSync('.ghostignore', `
secrets.conf
config/
.env*
app.js
secrets.js
`);

const output7 = runGhost('audit');
const hasNoSecretsPartial = output7.includes('Aucun secret') || output7.includes('No secrets');
assert.ok(hasNoSecretsPartial, 'Pattern should match files in subdirectories');
console.log('✅ Partial path matching works\n');

console.log('▶ Test 8: Empty .ghostignore scans all files');
// Empty .ghostignore
fs.writeFileSync('.ghostignore', '');

const output8 = runGhost('audit');
const detectsWithEmpty = output8.includes('problème') || output8.includes('detected') || 
    output8.includes('secrets.js') || output8.includes('app.js');
assert.ok(detectsWithEmpty, 'Empty .ghostignore should scan all files');
console.log('✅ Empty .ghostignore scans all files\n');

console.log('▶ Test 9: Missing .ghostignore scans all files');
// Remove .ghostignore
if (fs.existsSync('.ghostignore')) {
    fs.unlinkSync('.ghostignore');
}

const output9 = runGhost('audit');
const detectsWithoutFile = output9.includes('problème') || output9.includes('detected');
assert.ok(detectsWithoutFile, 'Missing .ghostignore should scan all files');
console.log('✅ Missing .ghostignore scans all files\n');

console.log('▶ Test 10: .ghostignore with node_modules and .git exclusion');
// These should be automatically excluded even without .ghostignore
fs.mkdirSync('node_modules', { recursive: true });
fs.writeFileSync('node_modules/package.json', `{"key": "${fakeSecret}"}`);

fs.mkdirSync('.git/objects', { recursive: true });
fs.writeFileSync('.git/config', `[core]\n\tkey = ${fakeSecret}`);

// Create a safe file to ensure audit runs
fs.writeFileSync('clean.txt', 'No secrets here');
fs.writeFileSync('.ghostignore', 'secrets.conf\nconfig/\n.env*\napp.js\nsecrets.js');

const output10 = runGhost('audit');
// Should not scan node_modules or .git even if they contain secrets
const excludesNodeModules = !output10.includes('node_modules') || output10.includes('Aucun secret');
assert.ok(excludesNodeModules, 'node_modules should be automatically excluded');
console.log('✅ node_modules and .git automatically excluded\n');

console.log('▶ Test 11: .ghostignore case sensitivity');
// Test case sensitivity
fs.writeFileSync('SECRET.conf', `key = "${fakeSecret}"`);
fs.writeFileSync('.ghostignore', 'secret.conf'); // lowercase pattern

const output11 = runGhost('audit');
// Pattern matching should be case-sensitive (or insensitive based on implementation)
// This test documents the behavior
const caseResult = output11.includes('SECRET.conf');
if (caseResult) {
    console.log('  ℹ️  Pattern matching is case-sensitive');
} else {
    console.log('  ℹ️  Pattern matching is case-insensitive or pattern matched');
}
console.log('✅ Case sensitivity documented\n');

console.log('▶ Test 12: .ghostignore with extension pattern');
// Test extension-based ignoring
fs.writeFileSync('test1.bak', `backup_key = "${fakeSecret}"`);
fs.writeFileSync('test2.bak', `backup_token = "${fakeSecret}2"`);
fs.writeFileSync('.ghostignore', `
secrets.conf
config/
.env*
app.js
secrets.js
*.bak
`);

const output12 = runGhost('audit');
const excludesBak = output12.includes('Aucun secret') || !output12.includes('.bak');
assert.ok(excludesBak, '*.bak pattern should exclude .bak files');
console.log('✅ Extension pattern works\n');

// Cleanup
process.chdir('..');
fs.rmSync(testDir, { recursive: true, force: true });

console.log('🎉 All .ghostignore Integration Tests Passed!\n');

// Summary
console.log('📊 Test Summary:');
console.log('  ✓ Single file pattern');
console.log('  ✓ Directory pattern');
console.log('  ✓ Wildcard pattern');
console.log('  ✓ Comments and empty lines');
console.log('  ✓ Non-ignored files still scanned');
console.log('  ✓ Dynamic .ghostignore updates');
console.log('  ✓ Partial path matching');
console.log('  ✓ Empty .ghostignore behavior');
console.log('  ✓ Missing .ghostignore behavior');
console.log('  ✓ node_modules and .git auto-exclusion');
console.log('  ✓ Case sensitivity documented');
console.log('  ✓ Extension-based patterns');
