const fs = require('fs');
const path = require('path');

/**
 * ExtensionMigrator - Migrates v0.x extensions to v1.0.0 SDK
 * 
 * Analyzes legacy extension code and generates:
 * 1. ExtensionWrapper boilerplate with ExtensionSDK
 * 2. Updated RPC client initialization with coreHandler injection
 * 3. Manifest compatibility validation for v1.0.0
 * 4. Migration report with required manual changes
 */
class ExtensionMigrator {
    constructor() {
        this.Colors = {
            HEADER: '\x1b[95m',
            BLUE: '\x1b[94m',
            CYAN: '\x1b[96m',
            GREEN: '\x1b[92m',
            WARNING: '\x1b[93m',
            FAIL: '\x1b[91m',
            ENDC: '\x1b[0m',
            BOLD: '\x1b[1m',
            DIM: '\x1b[2m'
        };
    }

    async migrate(extensionPath, flags = {}) {
        const absolutePath = path.resolve(extensionPath);
        const manifestPath = path.join(absolutePath, 'manifest.json');

        console.log(`\n${this.Colors.BOLD}${this.Colors.CYAN}Ghost Extension Migration Tool v1.0.0${this.Colors.ENDC}`);
        console.log(`${this.Colors.DIM}${'─'.repeat(60)}${this.Colors.ENDC}\n`);
        console.log(`Analyzing extension at: ${this.Colors.DIM}${absolutePath}${this.Colors.ENDC}\n`);

        // Check if manifest exists
        if (!fs.existsSync(manifestPath)) {
            console.error(`${this.Colors.FAIL}✗ No manifest.json found${this.Colors.ENDC}`);
            console.log(`\nPlease run this command from the extension root directory.`);
            process.exit(1);
        }

        // Load manifest
        let manifest;
        try {
            const content = fs.readFileSync(manifestPath, 'utf8');
            manifest = JSON.parse(content);
            console.log(`${this.Colors.GREEN}✓${this.Colors.ENDC} Loaded manifest for: ${this.Colors.BOLD}${manifest.name}${this.Colors.ENDC}`);
        } catch (error) {
            console.error(`${this.Colors.FAIL}✗ Failed to parse manifest.json: ${error.message}${this.Colors.ENDC}`);
            process.exit(1);
        }

        // Load main entry file
        const mainPath = path.join(absolutePath, manifest.main || 'index.js');
        if (!fs.existsSync(mainPath)) {
            console.error(`${this.Colors.FAIL}✗ Main file not found: ${manifest.main || 'index.js'}${this.Colors.ENDC}`);
            process.exit(1);
        }

        let mainContent;
        try {
            mainContent = fs.readFileSync(mainPath, 'utf8');
            console.log(`${this.Colors.GREEN}✓${this.Colors.ENDC} Loaded main file: ${this.Colors.DIM}${manifest.main || 'index.js'}${this.Colors.ENDC}\n`);
        } catch (error) {
            console.error(`${this.Colors.FAIL}✗ Failed to read main file: ${error.message}${this.Colors.ENDC}`);
            process.exit(1);
        }

        // Analyze extension code
        console.log(`${this.Colors.BOLD}Step 1: Analyzing code patterns${this.Colors.ENDC}`);
        const analysis = this.analyzeCode(mainContent, manifest);
        this.printAnalysis(analysis);

        // Validate manifest compatibility
        console.log(`\n${this.Colors.BOLD}Step 2: Validating manifest compatibility${this.Colors.ENDC}`);
        const manifestValidation = this.validateManifestV1(manifest);
        this.printManifestValidation(manifestValidation);

        // Generate migration plan
        console.log(`\n${this.Colors.BOLD}Step 3: Generating migration plan${this.Colors.ENDC}`);
        const migrationPlan = this.generateMigrationPlan(analysis, manifest, absolutePath);
        this.printMigrationPlan(migrationPlan);

        // Apply migration if requested
        if (flags.apply || flags.a) {
            console.log(`\n${this.Colors.BOLD}Step 4: Applying migration${this.Colors.ENDC}`);
            await this.applyMigration(migrationPlan, absolutePath, mainPath, manifest, flags);
        } else {
            console.log(`\n${this.Colors.DIM}Run with --apply flag to apply migration changes${this.Colors.ENDC}`);
            console.log(`${this.Colors.DIM}Example: ghost extension migrate ${flags.backup !== false ? '--backup ' : ''}--apply${this.Colors.ENDC}\n`);
        }
    }

    analyzeCode(content, manifest) {
        const analysis = {
            hasModuleExports: false,
            hasExtensionRPCClient: false,
            hasCustomRPCClient: false,
            hasExtensionSDK: false,
            usesDirectFS: false,
            usesDirectHTTP: false,
            usesDirectGit: false,
            rpcClientPattern: null,
            exportPattern: null,
            imports: [],
            legacyPatterns: []
        };

        // Check for module.exports pattern
        if (/module\.exports\s*=/.test(content)) {
            analysis.hasModuleExports = true;
            if (/module\.exports\s*=\s*{/.test(content)) {
                analysis.exportPattern = 'object';
            } else if (/module\.exports\s*=\s*class/.test(content)) {
                analysis.exportPattern = 'class';
            } else if (/module\.exports\s*=\s*function/.test(content)) {
                analysis.exportPattern = 'function';
            } else {
                analysis.exportPattern = 'other';
            }
        }

        // Check for ExtensionRPCClient usage
        if (/class\s+ExtensionRPCClient/.test(content) || /new\s+ExtensionRPCClient/.test(content)) {
            analysis.hasExtensionRPCClient = true;
            analysis.rpcClientPattern = 'legacy-builtin';
        }

        // Check for custom RPC client
        if (/class\s+\w*RPC\w*Client/.test(content) && !analysis.hasExtensionRPCClient) {
            analysis.hasCustomRPCClient = true;
            const match = content.match(/class\s+(\w*RPC\w*Client)/);
            if (match) {
                analysis.rpcClientPattern = match[1];
            }
        }

        // Check for ExtensionSDK usage (already migrated)
        if (/@ghost\/extension-sdk/.test(content) || /require.*extension-sdk/.test(content)) {
            analysis.hasExtensionSDK = true;
        }

        // Check for direct fs usage
        if (/require\s*\(\s*['"]fs['"]\s*\)/.test(content) && !/(\/\/|\/\*).*require.*fs/.test(content)) {
            analysis.usesDirectFS = true;
            analysis.legacyPatterns.push({
                pattern: 'Direct fs module usage',
                severity: 'high',
                recommendation: 'Use ExtensionSDK.requestFileRead/Write methods'
            });
        }

        // Check for direct http/https usage
        if (/require\s*\(\s*['"]https?['"]\s*\)/.test(content)) {
            analysis.usesDirectHTTP = true;
            analysis.legacyPatterns.push({
                pattern: 'Direct http/https module usage',
                severity: 'high',
                recommendation: 'Use ExtensionSDK.requestNetworkCall method'
            });
        }

        // Check for direct git command usage
        if (/child_process|execSync|spawn/.test(content) && /git\s/.test(content)) {
            analysis.usesDirectGit = true;
            analysis.legacyPatterns.push({
                pattern: 'Direct git command execution',
                severity: 'medium',
                recommendation: 'Use ExtensionSDK.requestGitExec method'
            });
        }

        // Extract imports
        const importMatches = content.matchAll(/(?:const|let|var)\s+(?:{[^}]+}|\w+)\s*=\s*require\s*\(\s*['"]([^'"]+)['"]\s*\)/g);
        for (const match of importMatches) {
            analysis.imports.push(match[1]);
        }

        // Check for coreHandler injection pattern
        if (/coreHandler/.test(content) && /constructor.*coreHandler/.test(content)) {
            analysis.hasCoreHandlerInjection = true;
        } else {
            analysis.hasCoreHandlerInjection = false;
            if (analysis.hasExtensionRPCClient || analysis.hasCustomRPCClient) {
                analysis.legacyPatterns.push({
                    pattern: 'RPC client without coreHandler injection',
                    severity: 'critical',
                    recommendation: 'Update RPC client constructor to accept coreHandler parameter'
                });
            }
        }

        return analysis;
    }

    validateManifestV1(manifest) {
        const validation = {
            compatible: true,
            errors: [],
            warnings: [],
            upgrades: []
        };

        // Check required fields for v1.0.0
        const requiredFields = ['id', 'name', 'version', 'main', 'capabilities'];
        for (const field of requiredFields) {
            if (!manifest[field]) {
                validation.errors.push(`Missing required field: ${field}`);
                validation.compatible = false;
            }
        }

        // Validate ID format
        if (manifest.id && !/^[a-z0-9-]+$/.test(manifest.id)) {
            validation.errors.push('Invalid id format: must be lowercase alphanumeric with hyphens');
            validation.compatible = false;
        }

        // Validate version format
        if (manifest.version && !/^\d+\.\d+\.\d+$/.test(manifest.version)) {
            validation.errors.push('Invalid version format: must be semantic version (major.minor.patch)');
            validation.compatible = false;
        }

        // Check capabilities structure
        if (manifest.capabilities) {
            // Validate network rate limit (v1.0.0 requires be parameter)
            if (manifest.capabilities.network && manifest.capabilities.network.rateLimit) {
                const rl = manifest.capabilities.network.rateLimit;
                if (!rl.cir) {
                    validation.errors.push('Network rate limit missing required "cir" parameter');
                    validation.compatible = false;
                }
                if (!rl.bc) {
                    validation.errors.push('Network rate limit missing required "bc" parameter');
                    validation.compatible = false;
                }
                // Check if be is missing (v1.0.0 change)
                if (rl.be === undefined) {
                    validation.upgrades.push({
                        field: 'capabilities.network.rateLimit.be',
                        current: 'undefined',
                        suggested: rl.bc ? Math.floor(rl.bc * 0.5) : 0,
                        reason: 'v1.0.0 requires "be" (excess burst) parameter'
                    });
                }
            }

            // Check filesystem patterns
            if (manifest.capabilities.filesystem) {
                if (manifest.capabilities.filesystem.read && !Array.isArray(manifest.capabilities.filesystem.read)) {
                    validation.errors.push('capabilities.filesystem.read must be an array');
                    validation.compatible = false;
                }
                if (manifest.capabilities.filesystem.write && !Array.isArray(manifest.capabilities.filesystem.write)) {
                    validation.errors.push('capabilities.filesystem.write must be an array');
                    validation.compatible = false;
                }
            }
        }

        // Check for dependencies (recommend @ghost/extension-sdk)
        if (!manifest.dependencies || !manifest.dependencies['@ghost/extension-sdk']) {
            validation.upgrades.push({
                field: 'dependencies["@ghost/extension-sdk"]',
                current: 'not present',
                suggested: '^1.0.0',
                reason: 'v1.0.0 extensions should use @ghost/extension-sdk package'
            });
        }

        return validation;
    }

    generateMigrationPlan(analysis, manifest, extensionPath) {
        const plan = {
            steps: [],
            files: {
                toCreate: [],
                toModify: [],
                toBackup: []
            },
            manualChanges: []
        };

        const mainFile = manifest.main || 'index.js';

        // Step 1: Backup original files
        plan.files.toBackup.push(mainFile);
        plan.files.toBackup.push('manifest.json');

        // Step 2: Update package.json to include @ghost/extension-sdk
        if (!analysis.hasExtensionSDK) {
            const packageJsonPath = path.join(extensionPath, 'package.json');
            if (fs.existsSync(packageJsonPath)) {
                plan.steps.push({
                    title: 'Add @ghost/extension-sdk dependency to package.json',
                    type: 'file-modify',
                    file: 'package.json',
                    automated: true
                });
                plan.files.toModify.push('package.json');
            } else {
                plan.steps.push({
                    title: 'Create package.json with @ghost/extension-sdk dependency',
                    type: 'file-create',
                    file: 'package.json',
                    automated: true
                });
                plan.files.toCreate.push('package.json');
            }
        }

        // Step 3: Update manifest.json
        plan.steps.push({
            title: 'Update manifest.json for v1.0.0 compatibility',
            type: 'file-modify',
            file: 'manifest.json',
            automated: true
        });
        plan.files.toModify.push('manifest.json');

        // Step 4: Generate ExtensionWrapper
        if (analysis.hasModuleExports && !analysis.hasExtensionSDK) {
            plan.steps.push({
                title: 'Generate ExtensionWrapper with ExtensionSDK',
                type: 'file-create',
                file: 'extension-wrapper.js',
                automated: true
            });
            plan.files.toCreate.push('extension-wrapper.js');

            // Update main entry point
            plan.steps.push({
                title: 'Update main entry point to use ExtensionWrapper',
                type: 'file-modify',
                file: mainFile,
                automated: true
            });
            if (!plan.files.toModify.includes(mainFile)) {
                plan.files.toModify.push(mainFile);
            }
        }

        // Step 5: Update RPC client initialization
        if ((analysis.hasExtensionRPCClient || analysis.hasCustomRPCClient) && !analysis.hasCoreHandlerInjection) {
            plan.steps.push({
                title: 'Update RPC client to accept coreHandler injection',
                type: 'code-pattern',
                file: mainFile,
                automated: true
            });
            plan.manualChanges.push({
                file: mainFile,
                issue: 'RPC client constructor needs coreHandler parameter',
                current: 'constructor() { ... }',
                suggested: 'constructor(coreHandler) { this.coreHandler = coreHandler; ... }',
                priority: 'critical'
            });
        }

        // Step 6: Replace direct I/O with SDK methods
        if (analysis.usesDirectFS || analysis.usesDirectHTTP || analysis.usesDirectGit) {
            plan.manualChanges.push({
                file: mainFile,
                issue: 'Direct I/O operations detected',
                recommendation: 'Replace with ExtensionSDK methods:\n' +
                    '  - fs.readFile → sdk.requestFileRead\n' +
                    '  - fs.writeFile → sdk.requestFileWrite\n' +
                    '  - https.request → sdk.requestNetworkCall\n' +
                    '  - execSync(git ...) → sdk.requestGitExec',
                priority: 'high'
            });
        }

        return plan;
    }

    async applyMigration(plan, extensionPath, mainPath, manifest, flags) {
        const backupDir = path.join(extensionPath, '.migration-backup');
        
        // Create backup directory if backup is not disabled
        if (flags.backup !== false) {
            if (!fs.existsSync(backupDir)) {
                fs.mkdirSync(backupDir, { recursive: true });
            }
            console.log(`${this.Colors.GREEN}✓${this.Colors.ENDC} Created backup directory: ${this.Colors.DIM}.migration-backup/${this.Colors.ENDC}`);

            // Backup files
            for (const file of plan.files.toBackup) {
                const sourcePath = path.join(extensionPath, file);
                const backupPath = path.join(backupDir, file);
                if (fs.existsSync(sourcePath)) {
                    fs.copyFileSync(sourcePath, backupPath);
                    console.log(`${this.Colors.DIM}  Backed up: ${file}${this.Colors.ENDC}`);
                }
            }
        }

        // Update package.json
        const packageJsonPath = path.join(extensionPath, 'package.json');
        if (plan.files.toCreate.includes('package.json')) {
            const packageJson = {
                name: manifest.id,
                version: manifest.version || '1.0.0',
                description: manifest.description || '',
                main: manifest.main || 'index.js',
                dependencies: {
                    '@ghost/extension-sdk': '^1.0.0'
                }
            };
            fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
            console.log(`${this.Colors.GREEN}✓${this.Colors.ENDC} Created package.json`);
        } else if (plan.files.toModify.includes('package.json') && fs.existsSync(packageJsonPath)) {
            const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
            if (!packageJson.dependencies) {
                packageJson.dependencies = {};
            }
            if (!packageJson.dependencies['@ghost/extension-sdk']) {
                packageJson.dependencies['@ghost/extension-sdk'] = '^1.0.0';
                fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
                console.log(`${this.Colors.GREEN}✓${this.Colors.ENDC} Updated package.json with @ghost/extension-sdk`);
            }
        }

        // Update manifest.json
        const updatedManifest = { ...manifest };
        const manifestValidation = this.validateManifestV1(manifest);
        
        // Apply manifest upgrades
        for (const upgrade of manifestValidation.upgrades) {
            if (upgrade.field === 'capabilities.network.rateLimit.be') {
                if (!updatedManifest.capabilities) updatedManifest.capabilities = {};
                if (!updatedManifest.capabilities.network) updatedManifest.capabilities.network = {};
                if (!updatedManifest.capabilities.network.rateLimit) updatedManifest.capabilities.network.rateLimit = {};
                updatedManifest.capabilities.network.rateLimit.be = upgrade.suggested;
            } else if (upgrade.field === 'dependencies["@ghost/extension-sdk"]') {
                if (!updatedManifest.dependencies) updatedManifest.dependencies = {};
                updatedManifest.dependencies['@ghost/extension-sdk'] = upgrade.suggested;
            }
        }

        const manifestPath = path.join(extensionPath, 'manifest.json');
        fs.writeFileSync(manifestPath, JSON.stringify(updatedManifest, null, 2));
        console.log(`${this.Colors.GREEN}✓${this.Colors.ENDC} Updated manifest.json`);

        // Generate ExtensionWrapper
        if (plan.files.toCreate.includes('extension-wrapper.js')) {
            const wrapperContent = this.generateExtensionWrapper(manifest);
            const wrapperPath = path.join(extensionPath, 'extension-wrapper.js');
            fs.writeFileSync(wrapperPath, wrapperContent);
            console.log(`${this.Colors.GREEN}✓${this.Colors.ENDC} Generated extension-wrapper.js`);
        }

        // Generate migration guide
        const guideContent = this.generateMigrationGuide(plan, manifest);
        const guidePath = path.join(extensionPath, 'MIGRATION_GUIDE.md');
        fs.writeFileSync(guidePath, guideContent);
        console.log(`${this.Colors.GREEN}✓${this.Colors.ENDC} Generated MIGRATION_GUIDE.md`);

        console.log(`\n${this.Colors.BOLD}${this.Colors.GREEN}Migration Applied Successfully!${this.Colors.ENDC}\n`);
        
        if (plan.manualChanges.length > 0) {
            console.log(`${this.Colors.WARNING}⚠ Manual changes required (see MIGRATION_GUIDE.md):${this.Colors.ENDC}`);
            plan.manualChanges.forEach((change, idx) => {
                console.log(`  ${idx + 1}. ${change.file}: ${change.issue}`);
            });
            console.log('');
        }

        console.log(`${this.Colors.BOLD}Next Steps:${this.Colors.ENDC}`);
        console.log(`  1. Run: ${this.Colors.CYAN}npm install${this.Colors.ENDC}`);
        console.log(`  2. Review: ${this.Colors.CYAN}MIGRATION_GUIDE.md${this.Colors.ENDC}`);
        console.log(`  3. Make required manual changes`);
        console.log(`  4. Test: ${this.Colors.CYAN}ghost extension validate${this.Colors.ENDC}`);
        console.log(`  5. Install: ${this.Colors.CYAN}ghost extension install .${this.Colors.ENDC}\n`);
    }

    generateExtensionWrapper(manifest) {
        const className = this.toPascalCase(manifest.id) + 'Extension';
        
        return `const { ExtensionSDK } = require('@ghost/extension-sdk');

/**
 * ${manifest.name} - Extension Wrapper for v1.0.0
 * 
 * This file provides the ExtensionSDK-based wrapper for your extension.
 * It replaces direct I/O operations with SDK method calls.
 */

class ${className} {
    constructor(extensionId, coreHandler) {
        this.extensionId = extensionId || '${manifest.id}';
        this.sdk = new ExtensionSDK(this.extensionId, { coreHandler });
    }

    /**
     * Initialize the extension
     * Called when the extension is loaded by Ghost CLI
     */
    async initialize() {
        console.log('${manifest.name} initialized');
        // Add your initialization logic here
    }

    /**
     * Handle commands routed to this extension
     * @param {Object} params - Command parameters
     * @param {string} params.command - Command name
     * @param {string} params.subcommand - Subcommand name (optional)
     * @param {Array<string>} params.args - Command arguments
     * @param {Object} params.flags - Command flags
     */
    async handleCommand(params) {
        const { command, subcommand, args, flags } = params;

        // Route to appropriate command handler
        // TODO: Implement your command routing logic here
        
        throw new Error(\`Command not implemented: \${command}\`);
    }

    /**
     * Example helper: Read file using SDK
     * Replace your direct fs.readFile calls with this
     */
    async readFile(path) {
        return await this.sdk.requestFileRead({ path, encoding: 'utf8' });
    }

    /**
     * Example helper: Write file using SDK
     * Replace your direct fs.writeFile calls with this
     */
    async writeFile(path, content) {
        return await this.sdk.requestFileWrite({ path, content, encoding: 'utf8' });
    }

    /**
     * Example helper: Make network request using SDK
     * Replace your direct https.request calls with this
     */
    async makeRequest(url, options = {}) {
        return await this.sdk.requestNetworkCall({
            url,
            method: options.method || 'GET',
            headers: options.headers || {},
            body: options.body
        });
    }

    /**
     * Example helper: Execute git command using SDK
     * Replace your direct execSync('git ...') calls with this
     */
    async gitExec(operation, args = []) {
        return await this.sdk.requestGitExec({ operation, args });
    }
}

/**
 * Factory function to create extension instance
 * This is called by Ghost CLI with coreHandler injection
 */
function createExtension(extensionId, coreHandler) {
    return new ${className}(extensionId, coreHandler);
}

module.exports = {
    ${className},
    createExtension
};
`;
    }

    generateMigrationGuide(plan, manifest) {
        let guide = `# Migration Guide: ${manifest.name}

## Overview

This extension has been migrated from Ghost CLI v0.x to v1.0.0 SDK.

## What Changed

### v0.x → v1.0.0 Key Changes

1. **ExtensionSDK Package**: Extensions now use \`@ghost/extension-sdk\` package instead of inline RPC clients
2. **Core Handler Injection**: RPC clients must accept \`coreHandler\` parameter for dependency injection
3. **Manifest Updates**: New required fields and rate limit parameters
4. **I/O Operations**: All file, network, and git operations must go through SDK methods

## Files Modified

`;

        // List modified files
        for (const file of plan.files.toModify) {
            guide += `- \`${file}\` - Updated for v1.0.0 compatibility\n`;
        }

        guide += `\n## Files Created

`;

        // List created files
        for (const file of plan.files.toCreate) {
            guide += `- \`${file}\` - Generated during migration\n`;
        }

        guide += `\n## Manual Changes Required

`;

        if (plan.manualChanges.length === 0) {
            guide += `No manual changes required! Your extension has been automatically migrated.\n`;
        } else {
            plan.manualChanges.forEach((change, idx) => {
                guide += `### ${idx + 1}. ${change.file}: ${change.issue}

**Priority**: ${change.priority}

`;
                if (change.current) {
                    guide += `**Current Code:**
\`\`\`javascript
${change.current}
\`\`\`

`;
                }
                if (change.suggested) {
                    guide += `**Suggested Code:**
\`\`\`javascript
${change.suggested}
\`\`\`

`;
                }
                if (change.recommendation) {
                    guide += `**Recommendation:**
${change.recommendation}

`;
                }
            });
        }

        guide += `## Testing Your Migration

1. Install dependencies:
   \`\`\`bash
   npm install
   \`\`\`

2. Validate the extension:
   \`\`\`bash
   ghost extension validate
   \`\`\`

3. Install locally:
   \`\`\`bash
   ghost extension install .
   \`\`\`

4. Test your commands:
   \`\`\`bash
   ghost <your-command>
   \`\`\`

## Common Migration Patterns

### Pattern 1: Replace Direct fs Operations

**Before (v0.x):**
\`\`\`javascript
const fs = require('fs');
const content = fs.readFileSync('file.txt', 'utf8');
\`\`\`

**After (v1.0.0):**
\`\`\`javascript
const content = await this.sdk.requestFileRead({ path: 'file.txt' });
\`\`\`

### Pattern 2: Replace Direct HTTP Requests

**Before (v0.x):**
\`\`\`javascript
const https = require('https');
https.request(options, callback);
\`\`\`

**After (v1.0.0):**
\`\`\`javascript
const response = await this.sdk.requestNetworkCall({
    url: 'https://api.example.com',
    method: 'GET'
});
\`\`\`

### Pattern 3: Replace Direct Git Commands

**Before (v0.x):**
\`\`\`javascript
const { execSync } = require('child_process');
execSync('git status');
\`\`\`

**After (v1.0.0):**
\`\`\`javascript
const result = await this.sdk.requestGitExec({ 
    operation: 'status', 
    args: [] 
});
\`\`\`

### Pattern 4: Update RPC Client Constructor

**Before (v0.x):**
\`\`\`javascript
class ExtensionRPCClient {
    constructor() {
        this.requestId = 0;
    }
}
\`\`\`

**After (v1.0.0):**
\`\`\`javascript
class ExtensionRPCClient {
    constructor(coreHandler) {
        this.coreHandler = coreHandler;
        this.requestId = 0;
    }
}
\`\`\`

## Need Help?

- Check the documentation: \`docs/extension-api.md\`
- See examples: \`docs/extension-examples.md\`
- Review the SDK: \`packages/extension-sdk/README.md\`

## Rollback

If you need to rollback, restore from backup:
\`\`\`bash
cp .migration-backup/* .
\`\`\`
`;

        return guide;
    }

    printAnalysis(analysis) {
        console.log(`${this.Colors.DIM}Code Pattern Analysis:${this.Colors.ENDC}`);
        
        if (analysis.hasExtensionSDK) {
            console.log(`  ${this.Colors.GREEN}✓${this.Colors.ENDC} Already using @ghost/extension-sdk`);
            console.log(`  ${this.Colors.WARNING}⚠ Extension may already be migrated${this.Colors.ENDC}`);
            return;
        }

        if (analysis.hasModuleExports) {
            console.log(`  ${this.Colors.CYAN}•${this.Colors.ENDC} Export pattern: ${analysis.exportPattern}`);
        }

        if (analysis.hasExtensionRPCClient) {
            console.log(`  ${this.Colors.CYAN}•${this.Colors.ENDC} Uses ExtensionRPCClient (legacy)`);
        } else if (analysis.hasCustomRPCClient) {
            console.log(`  ${this.Colors.CYAN}•${this.Colors.ENDC} Uses custom RPC client: ${analysis.rpcClientPattern}`);
        }

        if (analysis.hasCoreHandlerInjection) {
            console.log(`  ${this.Colors.GREEN}✓${this.Colors.ENDC} CoreHandler injection detected`);
        } else if (analysis.hasExtensionRPCClient || analysis.hasCustomRPCClient) {
            console.log(`  ${this.Colors.WARNING}⚠${this.Colors.ENDC} Missing coreHandler injection`);
        }

        if (analysis.usesDirectFS) {
            console.log(`  ${this.Colors.WARNING}⚠${this.Colors.ENDC} Direct fs module usage detected`);
        }

        if (analysis.usesDirectHTTP) {
            console.log(`  ${this.Colors.WARNING}⚠${this.Colors.ENDC} Direct http/https module usage detected`);
        }

        if (analysis.usesDirectGit) {
            console.log(`  ${this.Colors.WARNING}⚠${this.Colors.ENDC} Direct git command execution detected`);
        }

        if (analysis.legacyPatterns.length > 0) {
            console.log(`\n${this.Colors.DIM}Legacy patterns found:${this.Colors.ENDC}`);
            analysis.legacyPatterns.forEach((pattern, idx) => {
                const severity = pattern.severity === 'critical' ? this.Colors.FAIL :
                               pattern.severity === 'high' ? this.Colors.WARNING :
                               this.Colors.CYAN;
                console.log(`  ${idx + 1}. [${severity}${pattern.severity}${this.Colors.ENDC}] ${pattern.pattern}`);
                console.log(`     ${this.Colors.DIM}→ ${pattern.recommendation}${this.Colors.ENDC}`);
            });
        }
    }

    printManifestValidation(validation) {
        if (validation.compatible && validation.errors.length === 0) {
            console.log(`  ${this.Colors.GREEN}✓${this.Colors.ENDC} Manifest is v1.0.0 compatible`);
        } else {
            console.log(`  ${this.Colors.FAIL}✗${this.Colors.ENDC} Manifest has compatibility issues`);
        }

        if (validation.errors.length > 0) {
            console.log(`\n${this.Colors.DIM}Errors:${this.Colors.ENDC}`);
            validation.errors.forEach((error, idx) => {
                console.log(`  ${idx + 1}. ${this.Colors.FAIL}${error}${this.Colors.ENDC}`);
            });
        }

        if (validation.warnings.length > 0) {
            console.log(`\n${this.Colors.DIM}Warnings:${this.Colors.ENDC}`);
            validation.warnings.forEach((warning, idx) => {
                console.log(`  ${idx + 1}. ${this.Colors.WARNING}${warning}${this.Colors.ENDC}`);
            });
        }

        if (validation.upgrades.length > 0) {
            console.log(`\n${this.Colors.DIM}Required upgrades:${this.Colors.ENDC}`);
            validation.upgrades.forEach((upgrade, idx) => {
                console.log(`  ${idx + 1}. ${upgrade.field}`);
                console.log(`     ${this.Colors.DIM}Current: ${upgrade.current}${this.Colors.ENDC}`);
                console.log(`     ${this.Colors.CYAN}Suggested: ${upgrade.suggested}${this.Colors.ENDC}`);
                console.log(`     ${this.Colors.DIM}Reason: ${upgrade.reason}${this.Colors.ENDC}`);
            });
        }
    }

    printMigrationPlan(plan) {
        console.log(`${this.Colors.DIM}Migration steps:${this.Colors.ENDC}`);
        plan.steps.forEach((step, idx) => {
            const icon = step.automated ? this.Colors.GREEN + '●' : this.Colors.WARNING + '○';
            console.log(`  ${idx + 1}. ${icon}${this.Colors.ENDC} ${step.title}`);
            console.log(`     ${this.Colors.DIM}Type: ${step.type} | File: ${step.file}${this.Colors.ENDC}`);
        });

        if (plan.manualChanges.length > 0) {
            console.log(`\n${this.Colors.WARNING}Manual changes required: ${plan.manualChanges.length}${this.Colors.ENDC}`);
            plan.manualChanges.forEach((change, idx) => {
                console.log(`  ${idx + 1}. [${change.priority}] ${change.file}: ${change.issue}`);
            });
        }

        console.log(`\n${this.Colors.DIM}Files to create: ${plan.files.toCreate.length}${this.Colors.ENDC}`);
        console.log(`${this.Colors.DIM}Files to modify: ${plan.files.toModify.length}${this.Colors.ENDC}`);
        console.log(`${this.Colors.DIM}Files to backup: ${plan.files.toBackup.length}${this.Colors.ENDC}`);
    }

    toPascalCase(str) {
        return str
            .split('-')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join('');
    }
}

module.exports = ExtensionMigrator;
