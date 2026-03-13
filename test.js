const assert = require('assert');
const { execSync } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');

console.log('🧪 Running Ghost CLI Tests...\n');

try {
    // Test 1: Version check
    const packageJson = require('./package.json');
    const binPath = path.resolve(__dirname, packageJson.bin.ghost);
    assert.ok(packageJson.version, 'package.json version should be defined');
    console.log('✅ Test 1: package.json version is correct');

    // Test 2: Published bin help path
    const Gateway = require('./core/gateway');
    const { GatewayLauncher } = require('./ghost.js');
    const binStat = fs.statSync(binPath);
    const binSource = fs.readFileSync(binPath, 'utf8');
    assert.ok((binStat.mode & 0o111) !== 0, 'Published ghost bin should be executable');
    assert.ok(binSource.startsWith('#!/usr/bin/env node'), 'Published ghost bin should have a Node shebang');
    const launcher = new GatewayLauncher();
    launcher.gateway = new Gateway({
        extensionsDir: path.join(os.homedir(), '.ghost', 'extensions'),
        bundledExtensionsDir: path.join(__dirname, 'extensions')
    });
    launcher.gateway.initializeMetadataOnly();

    const originalLog = console.log;
    let helpOutput = '';
    console.log = (...args) => {
        helpOutput += `${args.join(' ')}\n`;
    };
    try {
        launcher.showHelp();
    } finally {
        console.log = originalLog;
    }

    assert.ok(helpOutput.includes(`GHOST CLI v${packageJson.version}`), `Help output should contain version v${packageJson.version}`);
    assert.ok(helpOutput.includes('Gateway'), 'Help output should contain Gateway');
    assert.ok(helpOutput.includes('extension'), 'Help output should contain extension command');
    assert.ok(helpOutput.includes('gateway'), 'Help output should contain gateway command');
    assert.ok(helpOutput.includes('audit-log'), 'Help output should contain audit-log command');
    assert.ok(helpOutput.includes('--verbose'), 'Help output should contain --verbose');
    assert.ok(helpOutput.includes('bridge:start'), 'Help output should use namespaced command ids for ambiguous commands');
    assert.ok(helpOutput.includes('cli:start'), 'Help output should list CLI start explicitly');
    assert.ok(!helpOutput.includes('start                          (Ghost Bridge Master)'), 'Help output should not collapse ambiguous flat command ownership');
    console.log('✅ Test 2: Published bin help output is correct');

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
