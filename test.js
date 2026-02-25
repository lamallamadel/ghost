const assert = require('assert');
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

console.log('🧪 Running Ghost CLI Tests...\n');

try {
    // Test 1: Version check
    const packageJson = require('./package.json');
    assert.strictEqual(packageJson.version, '0.4.0', 'package.json version should be 0.4.0');
    console.log('✅ Test 1: package.json version is correct');

    // Test 2: Help flag
    const helpOutput = execSync('node ghost.js --help', { encoding: 'utf8' });
    assert.ok(helpOutput.includes('GHOST CLI v0.4.0'), 'Help output should contain version');
    assert.ok(helpOutput.includes('Gateway'), 'Help output should contain Gateway');
    assert.ok(helpOutput.includes('extension'), 'Help output should contain extension command');
    assert.ok(helpOutput.includes('gateway'), 'Help output should contain gateway command');
    assert.ok(helpOutput.includes('audit-log'), 'Help output should contain audit-log command');
    assert.ok(helpOutput.includes('--verbose'), 'Help output should contain --verbose');
    console.log('✅ Test 2: Help flag output is correct');

    // Test 3: ghost.js syntax is valid
    try {
        execSync('node -c ghost.js', { stdio: 'inherit' });
        console.log('✅ Test 3: ghost.js syntax is valid');
    } catch (e) {
        console.error('❌ Test 3 Failed: Syntax error in ghost.js');
        process.exit(1);
    }

    const testDir = path.join(__dirname, 'test');
    
    // Collect all test files including subdirectories
    const testFiles = [];
    
    function collectTests(dir) {
        if (!fs.existsSync(dir)) return;
        
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            const relativePath = path.relative(testDir, fullPath);
            
            if (entry.isDirectory()) {
                collectTests(fullPath);
            } else if (entry.name.endsWith('.test.js')) {
                testFiles.push({ name: relativePath, path: fullPath });
            }
        }
    }
    
    collectTests(testDir);
    testFiles.sort((a, b) => a.name.localeCompare(b.name));

    for (const { name, path: testPath } of testFiles) {
        console.log(`\n▶ Running ${name}`);
        try {
            execSync(`node "${testPath}"`, { stdio: 'inherit' });
        } catch (e) {
            console.error(`\n❌ Test failed: ${name}`);
            throw e;
        }
    }

    console.log('\n🎉 All tests passed successfully!');
} catch (error) {
    console.error(`\n❌ Test failed: ${error.message}`);
    process.exit(1);
}
