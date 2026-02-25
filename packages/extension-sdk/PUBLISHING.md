# Publishing Guide for @ghost/extension-sdk

This guide walks through the complete process of publishing the SDK to npm.

## Prerequisites

1. **npm Account**: You must have an npm account with publish permissions for the `@ghost` scope
2. **npm CLI**: Authenticated with `npm login`
3. **Git**: Repository must be clean with all changes committed

## Pre-Publishing Checklist

### 1. Verify Package Metadata

Run the verification script:

```bash
npm run verify
```

This checks:
- ✓ package.json has all required fields (name, version, repository, bugs, homepage)
- ✓ All required files exist (index.js, index.d.ts, README.md, LICENSE, CHANGELOG.md)
- ✓ All lib/*.js files have corresponding .d.ts TypeScript definitions
- ✓ All exports are properly defined
- ✓ CHANGELOG.md includes version entry

### 2. Create Package Tarball

Generate a tarball to inspect contents:

```bash
npm pack
```

This creates `ghost-extension-sdk-1.0.0.tgz`. Inspect contents:

```bash
# Windows PowerShell
tar -tzf ghost-extension-sdk-1.0.0.tgz

# Or extract to inspect
mkdir package-preview
tar -xzf ghost-extension-sdk-1.0.0.tgz -C package-preview
```

Verify the tarball includes:
- ✓ index.js and index.d.ts
- ✓ lib/ directory with all .js and .d.ts files
- ✓ README.md
- ✓ LICENSE
- ✓ CHANGELOG.md
- ✓ package.json

And does NOT include:
- ✗ scripts/ directory
- ✗ test files
- ✗ .git files
- ✗ IDE configuration files

### 3. Test Installation in Clean Environment

Run the automated installation test:

```bash
npm run pack:test
```

This script:
1. Creates a temporary test directory
2. Installs the package from the tarball
3. Tests CommonJS require()
4. Tests TypeScript definitions compile correctly
5. Verifies all expected files are present
6. Tests SDK instantiation
7. Cleans up test directory

### 4. Manual Installation Test (Optional)

For additional verification, test in a real project:

```bash
# Create test directory
mkdir sdk-test
cd sdk-test

# Initialize npm project
npm init -y

# Install from tarball
npm install ../path/to/ghost-extension-sdk-1.0.0.tgz

# Test the installation
node -e "const sdk = require('@ghost/extension-sdk'); console.log(new sdk.ExtensionSDK('test'));"
```

### 5. Verify TypeScript Definitions

Create a test TypeScript file:

```typescript
// test.ts
import { ExtensionSDK } from '@ghost/extension-sdk';

const sdk = new ExtensionSDK('test-extension');

async function test() {
    const content = await sdk.requestFileRead({ path: './file.txt' });
    console.log(content);
}
```

Compile to verify types:

```bash
npx tsc test.ts --noEmit
```

## Publishing to npm

### Method 1: Manual Publishing (Recommended for First Release)

1. **Ensure you're in the package directory:**

```bash
cd packages/extension-sdk
```

2. **Run verification:**

```bash
npm run verify
```

3. **Publish with public access:**

```bash
npm publish --access public
```

The `prepublishOnly` script will run automatically before publishing.

4. **Verify publication:**

```bash
npm view @ghost/extension-sdk
```

### Method 2: Automated Publishing via GitHub Actions

Push a version tag to trigger automated publishing:

```bash
git tag v1.0.0
git push origin v1.0.0
```

The GitHub Actions workflow will:
- Run verification checks
- Run tests
- Publish to npm registry

## Post-Publishing Verification

### 1. Verify on npmjs.com

Visit https://www.npmjs.com/package/@ghost/extension-sdk and verify:
- ✓ Version 1.0.0 is listed
- ✓ README.md is displayed correctly
- ✓ Package metadata is correct (repository, homepage, bugs links)
- ✓ Keywords are displayed
- ✓ License is shown

### 2. Test Installation from npm

In a clean directory:

```bash
npm install @ghost/extension-sdk
```

Verify:
- ✓ Package installs without errors
- ✓ All files are present in node_modules/@ghost/extension-sdk/
- ✓ TypeScript definitions work
- ✓ Can import and use the SDK

### 3. Test in a Real Extension

Create a test extension:

```javascript
const { ExtensionSDK } = require('@ghost/extension-sdk');

class TestExtension {
    constructor() {
        this.sdk = new ExtensionSDK('test-extension');
    }

    async test() {
        try {
            const files = await this.sdk.requestFileReadDir({ path: './' });
            console.log('Files:', files);
        } catch (error) {
            console.error('Error:', error);
        }
    }
}

module.exports = TestExtension;
```

### 4. Create GitHub Release

1. Go to https://github.com/lamallamadel/ghost/releases
2. Click "Draft a new release"
3. Tag: `v1.0.0`
4. Title: `@ghost/extension-sdk v1.0.0`
5. Description: Copy from CHANGELOG.md
6. Publish release

## Troubleshooting

### "You do not have permission to publish"

Ensure you're logged in and have access to the `@ghost` scope:

```bash
npm whoami
npm login
```

Contact the scope owner to grant publish permissions.

### "Version already exists"

You cannot republish the same version. Bump the version:

```bash
npm version patch  # 1.0.0 -> 1.0.1
npm version minor  # 1.0.0 -> 1.1.0
npm version major  # 1.0.0 -> 2.0.0
```

### "prepublishOnly script failed"

Fix the errors reported by the verification script:

```bash
npm run verify
```

### TypeScript Definitions Not Found

Ensure:
- `index.d.ts` exists in package root
- All `lib/*.d.ts` files exist
- `package.json` has `"types": "index.d.ts"`
- `.d.ts` files are included in `package.json` files array

### Missing Files in Published Package

Check `.npmignore` - it may be excluding files you want to include.

The `files` array in `package.json` is the whitelist of what to include.

## Version Bumping Workflow

When preparing a new version:

1. **Make your changes**

2. **Update CHANGELOG.md:**
   - Move items from `[Unreleased]` to new version section
   - Add release date
   - Update comparison links at bottom

3. **Bump version:**

```bash
npm version patch  # or minor/major
```

This updates `package.json` and creates a git tag.

4. **Run verification:**

```bash
npm run verify
```

5. **Test installation:**

```bash
npm run pack:test
```

6. **Commit and push:**

```bash
git push origin main
git push origin v1.0.1
```

7. **Publish:**

```bash
npm publish --access public
```

8. **Create GitHub release** from the tag

## Quick Reference

```bash
# Verify package is ready
npm run verify

# Create tarball and test installation
npm run pack:test

# Publish to npm
npm publish --access public

# Check published version
npm view @ghost/extension-sdk

# Install from npm
npm install @ghost/extension-sdk

# Test installation
node -e "console.log(require('@ghost/extension-sdk'))"
```

## Support

For issues with publishing:
- Check npm status: https://status.npmjs.org/
- npm documentation: https://docs.npmjs.com/
- Ghost repository: https://github.com/lamallamadel/ghost
