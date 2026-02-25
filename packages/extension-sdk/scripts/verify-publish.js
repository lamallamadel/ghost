#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('🔍 Verifying package before publish...\n');

let errors = [];
let warnings = [];

// 1. Verify package.json metadata
console.log('📋 Checking package.json metadata...');
const pkgPath = path.join(__dirname, '..', 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

if (!pkg.name) errors.push('Missing package name');
if (!pkg.version || pkg.version === '0.0.0') errors.push('Invalid version');
if (!pkg.description) warnings.push('Missing description');
if (!pkg.author) warnings.push('Missing author');
if (!pkg.license) errors.push('Missing license');
if (!pkg.repository) errors.push('Missing repository');
if (!pkg.repository?.url) errors.push('Missing repository URL');
if (!pkg.bugs) warnings.push('Missing bugs URL');
if (!pkg.homepage) warnings.push('Missing homepage URL');

if (pkg.repository?.url) {
    console.log(`  ✓ Repository: ${pkg.repository.url}`);
}
if (pkg.bugs?.url) {
    console.log(`  ✓ Bugs: ${pkg.bugs.url}`);
}
if (pkg.homepage) {
    console.log(`  ✓ Homepage: ${pkg.homepage}`);
}

// 2. Verify required files exist
console.log('\n📁 Checking required files...');
const requiredFiles = [
    'index.js',
    'index.d.ts',
    'README.md',
    'LICENSE',
    'CHANGELOG.md',
    'package.json'
];

const rootDir = path.join(__dirname, '..');
requiredFiles.forEach(file => {
    const filePath = path.join(rootDir, file);
    if (fs.existsSync(filePath)) {
        console.log(`  ✓ ${file}`);
    } else {
        errors.push(`Missing required file: ${file}`);
    }
});

// 3. Verify lib files and TypeScript definitions
console.log('\n📦 Checking lib files...');
const libDir = path.join(rootDir, 'lib');
if (fs.existsSync(libDir)) {
    const jsFiles = fs.readdirSync(libDir).filter(f => f.endsWith('.js'));
    jsFiles.forEach(jsFile => {
        const dtsFile = jsFile.replace('.js', '.d.ts');
        const dtsPath = path.join(libDir, dtsFile);
        if (fs.existsSync(dtsPath)) {
            console.log(`  ✓ ${jsFile} + ${dtsFile}`);
        } else {
            errors.push(`Missing TypeScript definition: lib/${dtsFile}`);
        }
    });
} else {
    errors.push('lib directory not found');
}

// 4. Verify files field in package.json
console.log('\n📝 Checking package.json files field...');
if (pkg.files && Array.isArray(pkg.files)) {
    console.log(`  ✓ Files field defined (${pkg.files.length} patterns)`);
    pkg.files.forEach(pattern => {
        console.log(`    - ${pattern}`);
    });
} else {
    warnings.push('No files field in package.json - will publish everything');
}

// 5. Verify TypeScript definitions in root index.d.ts
console.log('\n🔷 Checking TypeScript definitions...');
const indexDts = fs.readFileSync(path.join(rootDir, 'index.d.ts'), 'utf8');
const requiredExports = [
    'ExtensionSDK',
    'IntentBuilder',
    'RPCClient',
    'IntentError',
    'ValidationError',
    'RateLimitError'
];

requiredExports.forEach(exp => {
    if (indexDts.includes(exp)) {
        console.log(`  ✓ ${exp} exported`);
    } else {
        errors.push(`Missing export in index.d.ts: ${exp}`);
    }
});

// 6. Verify main entry point
console.log('\n🚪 Checking main entry point...');
const indexJs = fs.readFileSync(path.join(rootDir, 'index.js'), 'utf8');
requiredExports.forEach(exp => {
    if (indexJs.includes(exp)) {
        console.log(`  ✓ ${exp} exported`);
    } else {
        errors.push(`Missing export in index.js: ${exp}`);
    }
});

// 7. Verify keywords for discoverability
console.log('\n🏷️  Checking keywords...');
if (pkg.keywords && pkg.keywords.length > 0) {
    console.log(`  ✓ ${pkg.keywords.length} keywords: ${pkg.keywords.join(', ')}`);
} else {
    warnings.push('No keywords defined - package may be hard to discover');
}

// 8. Verify prepublishOnly script exists
console.log('\n⚙️  Checking scripts...');
if (pkg.scripts?.prepublishOnly) {
    console.log('  ✓ prepublishOnly script defined');
} else {
    warnings.push('No prepublishOnly script - no validation before publish');
}

// 9. Verify README has content
console.log('\n📖 Checking README.md...');
const readme = fs.readFileSync(path.join(rootDir, 'README.md'), 'utf8');
if (readme.length > 1000) {
    console.log(`  ✓ README.md has ${readme.length} characters`);
    if (readme.includes('## Installation')) console.log('  ✓ Installation section found');
    if (readme.includes('## Quick Start') || readme.includes('## Usage')) console.log('  ✓ Usage section found');
    if (readme.includes('## API') || readme.includes('## Complete API Reference')) console.log('  ✓ API documentation found');
} else {
    warnings.push('README.md seems too short');
}

// 10. Verify CHANGELOG has version entry
console.log('\n📜 Checking CHANGELOG.md...');
const changelog = fs.readFileSync(path.join(rootDir, 'CHANGELOG.md'), 'utf8');
if (changelog.includes(`[${pkg.version}]`)) {
    console.log(`  ✓ Version ${pkg.version} documented in CHANGELOG`);
} else {
    warnings.push(`Version ${pkg.version} not found in CHANGELOG.md`);
}

// Print summary
console.log('\n' + '='.repeat(60));
console.log('VERIFICATION SUMMARY');
console.log('='.repeat(60));

if (errors.length === 0 && warnings.length === 0) {
    console.log('\n✅ All checks passed! Package is ready to publish.\n');
    console.log('Next steps:');
    console.log('  1. Run: cd packages/extension-sdk');
    console.log('  2. Run: npm pack (to inspect package contents)');
    console.log('  3. Test installation in clean directory');
    console.log('  4. Run: npm publish --access public');
    process.exit(0);
} else {
    if (errors.length > 0) {
        console.log('\n❌ ERRORS:');
        errors.forEach(err => console.log(`  - ${err}`));
    }
    
    if (warnings.length > 0) {
        console.log('\n⚠️  WARNINGS:');
        warnings.forEach(warn => console.log(`  - ${warn}`));
    }
    
    if (errors.length > 0) {
        console.log('\n❌ Fix errors before publishing.\n');
        process.exit(1);
    } else {
        console.log('\n⚠️  Consider addressing warnings before publishing.\n');
        process.exit(0);
    }
}
