const assert = require('assert');
const { execSync } = require('child_process');
const path = require('path');

// Mock Colors if needed or import from ghost.js if it were exported
const Colors = {
    CYAN: '', BOLD: '', ENDC: '', DIM: '', GREEN: '', FAIL: ''
};

console.log('🧪 Running Ghost CLI Tests...\n');

try {
    // Test 1: Version check
    const packageJson = require('./package.json');
    assert.strictEqual(packageJson.version, '0.3.1', 'package.json version should be 0.3.1');
    console.log('✅ Test 1: package.json version is correct');

    // Test 2: Help flag
    const helpOutput = execSync('node ghost.js --help', { encoding: 'utf8' });
    assert.ok(helpOutput.includes('GHOST CLI v0.3.1'), 'Help output should contain version');
    assert.ok(helpOutput.includes('anthropic'), 'Help output should contain anthropic');
    assert.ok(helpOutput.includes('gemini'), 'Help output should contain gemini');
    assert.ok(helpOutput.includes('--history'), 'Help output should contain --history');
    assert.ok(helpOutput.includes('--console'), 'Help output should contain --console');
    console.log('✅ Test 2: Help flag output is correct');

    // Test 3: Internal logic (Entropy)
    // We can't easily import internal functions without exporting them
    // But we can test if the file is valid JS
    execSync('node --check ghost.js');
    console.log('✅ Test 3: ghost.js syntax is valid');

    console.log('\n🎉 All tests passed successfully!');
} catch (error) {
    console.error(`\n❌ Test failed: ${error.message}`);
    process.exit(1);
}
