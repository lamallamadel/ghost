#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

console.log('🧪 Testing package installation in clean environment...\n');

// Create temporary test directory
const testDir = path.join(os.tmpdir(), `ghost-sdk-test-${Date.now()}`);
console.log(`📁 Creating test directory: ${testDir}`);
fs.mkdirSync(testDir, { recursive: true });

try {
    // Get package tarball name
    const pkgPath = path.join(__dirname, '..', 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    const tarballName = `ghost-extension-sdk-${pkg.version}.tgz`;
    const tarballPath = path.join(__dirname, '..', tarballName);
    
    if (!fs.existsSync(tarballPath)) {
        console.error(`❌ Tarball not found: ${tarballName}`);
        console.log('\nRun "npm pack" first to create the tarball.');
        process.exit(1);
    }
    
    console.log(`📦 Found tarball: ${tarballName}\n`);
    
    // Initialize test project
    console.log('📝 Initializing test project...');
    process.chdir(testDir);
    
    const testPackageJson = {
        name: 'test-ghost-extension-sdk',
        version: '1.0.0',
        private: true,
        description: 'Test installation of @ghost/extension-sdk'
    };
    fs.writeFileSync('package.json', JSON.stringify(testPackageJson, null, 2));
    console.log('  ✓ Created package.json\n');
    
    // Install the package from tarball
    console.log('📥 Installing package from tarball...');
    execSync(`npm install ${tarballPath}`, { stdio: 'inherit' });
    console.log('  ✓ Package installed\n');
    
    // Test CommonJS import
    console.log('🔍 Testing CommonJS require...');
    const testFileJS = `
const sdk = require('@ghost/extension-sdk');

console.log('Testing CommonJS imports...');

// Test all exports are available
const exports = ['ExtensionSDK', 'IntentBuilder', 'RPCClient', 'IntentError', 'ValidationError', 'RateLimitError'];
const missing = [];

exports.forEach(exp => {
    if (!sdk[exp]) {
        missing.push(exp);
        console.error('  ✗ Missing export:', exp);
    } else {
        console.log('  ✓', exp);
    }
});

if (missing.length > 0) {
    console.error('\\n❌ Missing exports:', missing.join(', '));
    process.exit(1);
}

// Test instantiation
try {
    const instance = new sdk.ExtensionSDK('test-extension');
    console.log('  ✓ ExtensionSDK instantiation');
    
    const builder = new sdk.IntentBuilder('test-extension');
    console.log('  ✓ IntentBuilder instantiation');
    
    const client = new sdk.RPCClient('test-extension');
    console.log('  ✓ RPCClient instantiation');
    
    console.log('\\n✅ All CommonJS tests passed!');
} catch (error) {
    console.error('\\n❌ Instantiation failed:', error.message);
    process.exit(1);
}
`;
    
    fs.writeFileSync('test-cjs.js', testFileJS);
    console.log('  Running CommonJS test...');
    execSync('node test-cjs.js', { stdio: 'inherit' });
    console.log('  ✓ CommonJS test passed\n');
    
    // Test TypeScript definitions
    console.log('🔷 Testing TypeScript definitions...');
    const testFileTS = `
import { ExtensionSDK, IntentBuilder, RPCClient, IntentError, ValidationError, RateLimitError } from '@ghost/extension-sdk';

// Test type checking works
const sdk = new ExtensionSDK('test-extension');
const builder = new IntentBuilder('test-extension');
const client = new RPCClient('test-extension');

console.log('TypeScript definitions are valid');
`;
    
    fs.writeFileSync('test-types.ts', testFileTS);
    
    // Install TypeScript as dev dependency
    console.log('  Installing TypeScript...');
    execSync('npm install --save-dev typescript', { stdio: 'pipe' });
    
    // Check TypeScript compilation
    console.log('  Checking TypeScript compilation...');
    try {
        execSync('npx tsc test-types.ts --noEmit --esModuleInterop', { stdio: 'inherit' });
        console.log('  ✓ TypeScript definitions are valid\n');
    } catch (error) {
        console.error('  ✗ TypeScript compilation failed');
        throw error;
    }
    
    // Verify package structure
    console.log('📂 Verifying installed package structure...');
    const nodeModulesPath = path.join(testDir, 'node_modules', '@ghost', 'extension-sdk');
    
    const expectedFiles = [
        'index.js',
        'index.d.ts',
        'package.json',
        'README.md',
        'LICENSE',
        'CHANGELOG.md',
        'lib/sdk.js',
        'lib/sdk.d.ts',
        'lib/intent-builder.js',
        'lib/intent-builder.d.ts',
        'lib/rpc-client.js',
        'lib/rpc-client.d.ts',
        'lib/errors.js',
        'lib/errors.d.ts'
    ];
    
    let allFilesPresent = true;
    expectedFiles.forEach(file => {
        const filePath = path.join(nodeModulesPath, file);
        if (fs.existsSync(filePath)) {
            console.log(`  ✓ ${file}`);
        } else {
            console.error(`  ✗ Missing: ${file}`);
            allFilesPresent = false;
        }
    });
    
    if (!allFilesPresent) {
        throw new Error('Some expected files are missing from installed package');
    }
    
    // Success!
    console.log('\n' + '='.repeat(60));
    console.log('✅ ALL INSTALLATION TESTS PASSED!');
    console.log('='.repeat(60));
    console.log('\nThe package is ready for publication.');
    
} catch (error) {
    console.error('\n' + '='.repeat(60));
    console.error('❌ INSTALLATION TEST FAILED');
    console.error('='.repeat(60));
    console.error('\nError:', error.message);
    process.exit(1);
} finally {
    // Cleanup
    console.log(`\n🧹 Cleaning up test directory: ${testDir}`);
    try {
        fs.rmSync(testDir, { recursive: true, force: true });
        console.log('  ✓ Cleanup complete');
    } catch (error) {
        console.warn('  ⚠️  Failed to cleanup:', error.message);
    }
}
