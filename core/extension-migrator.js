const fs = require('fs');
const path = require('path');

/**
 * ExtensionMigrator - Migrates v0.x extensions to v1.0.0 SDK
 * 
 * Analyzes legacy extension code and generates:
 * 1. ExtensionWrapper boilerplate with ExtensionSDK
 * 2. Updated RPC client initialization with coreHandler injection
 * 3. Manifest compatibility validation for v1.0.0
 * 4. Migration report with file-by-file diff preview
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

        if (!fs.existsSync(manifestPath)) {
            this.showError('NO_MANIFEST', {
                message: 'No manifest.json found',
                path: absolutePath,
                suggestion: 'Please run this command from the extension root directory.'
            });
            process.exit(1);
        }

        let manifest;
        try {
            const content = fs.readFileSync(manifestPath, 'utf8');
            manifest = JSON.parse(content);
            console.log(`${this.Colors.GREEN}✓${this.Colors.ENDC} Loaded manifest for: ${this.Colors.BOLD}${manifest.name}${this.Colors.ENDC}`);
        } catch (error) {
            this.showError('INVALID_MANIFEST', {
                message: 'Failed to parse manifest.json',
                error: error.message,
                suggestion: 'Ensure manifest.json is valid JSON format.'
            });
            process.exit(1);
        }

        const mainPath = path.join(absolutePath, manifest.main || 'index.js');
        if (!fs.existsSync(mainPath)) {
            this.showError('MISSING_MAIN_FILE', {
                message: 'Main file not found',
                file: manifest.main || 'index.js',
                suggestion: 'Check that the "main" field in manifest.json points to a valid file.'
            });
            process.exit(1);
        }

        let mainContent;
        try {
            mainContent = fs.readFileSync(mainPath, 'utf8');
            console.log(`${this.Colors.GREEN}✓${this.Colors.ENDC} Loaded main file: ${this.Colors.DIM}${manifest.main || 'index.js'}${this.Colors.ENDC}\n`);
        } catch (error) {
            this.showError('READ_ERROR', {
                message: 'Failed to read main file',
                file: manifest.main || 'index.js',
                error: error.message
            });
            process.exit(1);
        }

        console.log(`${this.Colors.BOLD}Step 1: Analyzing code patterns${this.Colors.ENDC}`);
        const analysis = this.analyzeCode(mainContent, manifest, absolutePath);
        this.printAnalysis(analysis);

        console.log(`\n${this.Colors.BOLD}Step 2: Validating manifest compatibility${this.Colors.ENDC}`);
        const manifestValidation = this.validateManifestV1(manifest);
        this.printManifestValidation(manifestValidation);

        console.log(`\n${this.Colors.BOLD}Step 3: Generating migration report${this.Colors.ENDC}`);
        const migrationPlan = this.generateMigrationPlan(analysis, manifest, absolutePath, mainContent);
        this.printMigrationPlan(migrationPlan);

        if (migrationPlan.diffs && migrationPlan.diffs.length > 0) {
            console.log(`\n${this.Colors.BOLD}Step 4: File-by-file diff preview${this.Colors.ENDC}`);
            this.printDiffPreviews(migrationPlan.diffs);
        }

        const autoFlag = flags.auto || flags.apply || flags.a;

        if (autoFlag) {
            console.log(`\n${this.Colors.BOLD}Step 5: Applying automatic migration${this.Colors.ENDC}`);
            await this.applyMigration(migrationPlan, absolutePath, mainPath, manifest, flags);
        } else {
            console.log(`\n${this.Colors.DIM}Run with --auto flag to apply migration changes${this.Colors.ENDC}`);
            console.log(`${this.Colors.DIM}Example: ghost extension migrate ${flags.backup !== false ? '' : '--no-backup '}--auto${this.Colors.ENDC}\n`);
        }
    }

    analyzeCode(content, manifest, extensionPath) {
        const analysis = {
            hasModuleExports: false,
            hasExtensionWrapper: false,
            hasExtensionRPCClient: false,
            hasCustomRPCClient: false,
            hasExtensionSDK: false,
            usesDirectFS: false,
            usesDirectHTTP: false,
            usesDirectGit: false,
            usesDirectStdio: false,
            rpcClientPattern: null,
            exportPattern: null,
            imports: [],
            legacyPatterns: [],
            fileCount: 0,
            functions: [],
            classes: []
        };

        const moduleExportsMatch = content.match(/module\.exports\s*=\s*([^;]+)/);
        if (moduleExportsMatch) {
            analysis.hasModuleExports = true;
            const exportValue = moduleExportsMatch[1].trim();
            
            if (/^class\s+\w+/.test(exportValue)) {
                analysis.exportPattern = 'class';
                const classMatch = exportValue.match(/class\s+(\w+)/);
                if (classMatch) analysis.classes.push(classMatch[1]);
            } else if (/^function\s+\w+/.test(exportValue)) {
                analysis.exportPattern = 'function';
            } else if (/^\{/.test(exportValue)) {
                analysis.exportPattern = 'object';
            } else if (/^new\s+/.test(exportValue)) {
                analysis.exportPattern = 'instance';
            } else {
                analysis.exportPattern = 'other';
            }
        }

        if (/class\s+ExtensionWrapper/.test(content) || /new\s+ExtensionWrapper/.test(content)) {
            analysis.hasExtensionWrapper = true;
        }

        if (/class\s+ExtensionRPCClient/.test(content) || /new\s+ExtensionRPCClient/.test(content)) {
            analysis.hasExtensionRPCClient = true;
            analysis.rpcClientPattern = 'legacy-builtin';
        }

        if (/class\s+(\w*RPC\w*Client)/.test(content) && !analysis.hasExtensionRPCClient) {
            analysis.hasCustomRPCClient = true;
            const match = content.match(/class\s+(\w*RPC\w*Client)/);
            if (match) {
                analysis.rpcClientPattern = match[1];
                analysis.classes.push(match[1]);
            }
        }

        if (/@ghost\/extension-sdk/.test(content) || /require.*extension-sdk/.test(content)) {
            analysis.hasExtensionSDK = true;
        }

        if (/require\s*\(\s*['"]fs['"]\s*\)/.test(content) && !/(\/\/|\/\*).*require.*fs/.test(content)) {
            analysis.usesDirectFS = true;
            this.addLegacyPattern(analysis, 'DIRECT_FS', 'high',
                'Direct fs module usage detected',
                'Replace fs.readFileSync/writeFileSync with ExtensionSDK.requestFileRead/requestFileWrite'
            );
        }

        if (/require\s*\(\s*['"]https?['"]\s*\)/.test(content)) {
            analysis.usesDirectHTTP = true;
            this.addLegacyPattern(analysis, 'DIRECT_HTTP', 'high',
                'Direct http/https module usage detected',
                'Replace http/https requests with ExtensionSDK.requestNetworkCall'
            );
        }

        if (/(child_process|execSync|spawn)/.test(content) && /git[\s\(]/.test(content)) {
            analysis.usesDirectGit = true;
            this.addLegacyPattern(analysis, 'DIRECT_GIT', 'medium',
                'Direct git command execution detected',
                'Replace execSync(\'git ...\') with ExtensionSDK.requestGitExec'
            );
        }

        if (/(process\.stdin|process\.stdout)\.write/.test(content) && !analysis.hasExtensionWrapper) {
            analysis.usesDirectStdio = true;
            this.addLegacyPattern(analysis, 'DIRECT_STDIO', 'critical',
                'Direct stdio JSON-RPC communication detected',
                'Replace direct stdio with ExtensionRPCClient pattern using coreHandler injection'
            );
        }

        const importMatches = content.matchAll(/(?:const|let|var)\s+(?:{[^}]+}|\w+)\s*=\s*require\s*\(\s*['"]([^'"]+)['"]\s*\)/g);
        for (const match of importMatches) {
            analysis.imports.push(match[1]);
        }

        if (/coreHandler/.test(content) && /constructor.*coreHandler/.test(content)) {
            analysis.hasCoreHandlerInjection = true;
        } else {
            analysis.hasCoreHandlerInjection = false;
            if (analysis.hasExtensionRPCClient || analysis.hasCustomRPCClient) {
                this.addLegacyPattern(analysis, 'NO_CORE_HANDLER', 'critical',
                    'RPC client without coreHandler injection',
                    'Update RPC client constructor to accept coreHandler parameter: constructor(coreHandler) { this.coreHandler = coreHandler; }'
                );
            }
        }

        const functionMatches = content.matchAll(/(?:async\s+)?function\s+(\w+)/g);
        for (const match of functionMatches) {
            analysis.functions.push(match[1]);
        }

        const classMatches = content.matchAll(/class\s+(\w+)/g);
        for (const match of classMatches) {
            if (!analysis.classes.includes(match[1])) {
                analysis.classes.push(match[1]);
            }
        }

        try {
            const files = this.getAllJSFiles(extensionPath);
            analysis.fileCount = files.length;
        } catch (e) {
            analysis.fileCount = 1;
        }

        return analysis;
    }

    addLegacyPattern(analysis, code, severity, pattern, recommendation) {
        analysis.legacyPatterns.push({
            code,
            pattern,
            severity,
            recommendation
        });
    }

    getAllJSFiles(dir, fileList = []) {
        const files = fs.readdirSync(dir);
        
        files.forEach(file => {
            const filePath = path.join(dir, file);
            const stat = fs.statSync(filePath);
            
            if (stat.isDirectory()) {
                if (!file.startsWith('.') && file !== 'node_modules') {
                    this.getAllJSFiles(filePath, fileList);
                }
            } else if (file.endsWith('.js')) {
                fileList.push(filePath);
            }
        });
        
        return fileList;
    }

    validateManifestV1(manifest) {
        const validation = {
            compatible: true,
            errors: [],
            warnings: [],
            upgrades: []
        };

        const requiredFields = ['id', 'name', 'version', 'main', 'capabilities'];
        for (const field of requiredFields) {
            if (!manifest[field]) {
                validation.errors.push(`Missing required field: ${field}`);
                validation.compatible = false;
            }
        }

        if (manifest.id && !/^[a-z0-9-]+$/.test(manifest.id)) {
            validation.errors.push('Invalid id format: must be lowercase alphanumeric with hyphens');
            validation.compatible = false;
        }

        if (manifest.version && !/^\d+\.\d+\.\d+$/.test(manifest.version)) {
            validation.errors.push('Invalid version format: must be semantic version (major.minor.patch)');
            validation.compatible = false;
        }

        if (!manifest.commands || !Array.isArray(manifest.commands)) {
            validation.upgrades.push({
                field: 'commands',
                current: 'not present',
                suggested: '[]',
                reason: 'v1.0.0 requires "commands" array listing all CLI commands exposed by the extension'
            });
        }

        if (manifest.capabilities) {
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
                if (rl.be === undefined) {
                    validation.upgrades.push({
                        field: 'capabilities.network.rateLimit.be',
                        current: 'undefined',
                        suggested: rl.bc ? Math.floor(rl.bc * 2) : 0,
                        reason: 'v1.0.0 requires "be" (excess burst) parameter for two-rate three-color marking'
                    });
                }
            }

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

    generateMigrationPlan(analysis, manifest, extensionPath, mainContent) {
        const plan = {
            steps: [],
            files: {
                toCreate: [],
                toModify: [],
                toBackup: []
            },
            diffs: [],
            manualChanges: []
        };

        const mainFile = manifest.main || 'index.js';

        plan.files.toBackup.push(mainFile);
        plan.files.toBackup.push('manifest.json');

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
                plan.files.toBackup.push('package.json');

                const pkgContent = fs.readFileSync(packageJsonPath, 'utf8');
                const pkg = JSON.parse(pkgContent);
                const newPkg = { ...pkg };
                if (!newPkg.dependencies) newPkg.dependencies = {};
                newPkg.dependencies['@ghost/extension-sdk'] = '^1.0.0';

                plan.diffs.push({
                    file: 'package.json',
                    oldContent: JSON.stringify(pkg, null, 2),
                    newContent: JSON.stringify(newPkg, null, 2)
                });
            } else {
                plan.steps.push({
                    title: 'Create package.json with @ghost/extension-sdk dependency',
                    type: 'file-create',
                    file: 'package.json',
                    automated: true
                });
                plan.files.toCreate.push('package.json');

                const newPkg = {
                    name: manifest.id,
                    version: manifest.version || '1.0.0',
                    description: manifest.description || '',
                    main: manifest.main || 'index.js',
                    dependencies: {
                        '@ghost/extension-sdk': '^1.0.0'
                    }
                };

                plan.diffs.push({
                    file: 'package.json',
                    oldContent: '(file does not exist)',
                    newContent: JSON.stringify(newPkg, null, 2)
                });
            }
        }

        plan.steps.push({
            title: 'Update manifest.json for v1.0.0 compatibility',
            type: 'file-modify',
            file: 'manifest.json',
            automated: true
        });
        plan.files.toModify.push('manifest.json');

        const updatedManifest = this.generateUpdatedManifest(manifest);
        plan.diffs.push({
            file: 'manifest.json',
            oldContent: JSON.stringify(manifest, null, 2),
            newContent: JSON.stringify(updatedManifest, null, 2)
        });

        if (analysis.hasModuleExports && !analysis.hasExtensionWrapper && !analysis.hasExtensionSDK) {
            const wrapperFile = path.basename(mainFile, '.js') + '-wrapper.js';
            
            plan.steps.push({
                title: 'Generate ExtensionWrapper with ExtensionSDK',
                type: 'file-create',
                file: wrapperFile,
                automated: true
            });
            plan.files.toCreate.push(wrapperFile);

            const wrapperContent = this.generateExtensionWrapper(manifest, analysis);
            plan.diffs.push({
                file: wrapperFile,
                oldContent: '(new file)',
                newContent: wrapperContent
            });

            if (analysis.usesDirectStdio || analysis.hasExtensionRPCClient) {
                plan.manualChanges.push({
                    file: mainFile,
                    issue: 'Direct stdio JSON-RPC pattern needs migration',
                    pattern: 'STDIO_RPC_MIGRATION',
                    current: 'process.stdin/stdout based JSON-RPC',
                    suggested: 'Use ExtensionWrapper with init(config) method that receives coreHandler',
                    priority: 'critical',
                    guide: this.getMigrationGuideForPattern('STDIO_RPC_MIGRATION')
                });
            }
        }

        if ((analysis.hasExtensionRPCClient || analysis.hasCustomRPCClient) && !analysis.hasCoreHandlerInjection) {
            plan.manualChanges.push({
                file: mainFile,
                issue: 'RPC client constructor needs coreHandler parameter',
                pattern: 'NO_CORE_HANDLER',
                current: `class ${analysis.rpcClientPattern || 'ExtensionRPCClient'} {\n    constructor() {\n        this.requestId = 0;\n    }\n}`,
                suggested: `class ${analysis.rpcClientPattern || 'ExtensionRPCClient'} {\n    constructor(coreHandler) {\n        this.coreHandler = coreHandler;\n        this.requestId = 0;\n    }\n}`,
                priority: 'critical',
                guide: this.getMigrationGuideForPattern('NO_CORE_HANDLER')
            });
        }

        if (analysis.usesDirectFS || analysis.usesDirectHTTP || analysis.usesDirectGit) {
            plan.manualChanges.push({
                file: mainFile,
                issue: 'Direct I/O operations detected',
                pattern: 'DIRECT_IO',
                recommendation: this.getDirectIORecommendations(analysis),
                priority: 'high',
                guide: this.getMigrationGuideForPattern('DIRECT_IO')
            });
        }

        if (analysis.exportPattern === 'object' && !analysis.hasExtensionWrapper) {
            plan.manualChanges.push({
                file: mainFile,
                issue: 'Object export pattern needs conversion to class-based ExtensionWrapper',
                pattern: 'OBJECT_EXPORT',
                current: 'module.exports = { command1, command2 }',
                suggested: 'Use ExtensionWrapper class with methods for each command',
                priority: 'high',
                guide: this.getMigrationGuideForPattern('OBJECT_EXPORT')
            });
        }

        return plan;
    }

    generateUpdatedManifest(manifest) {
        const updated = { ...manifest };

        if (!updated.commands || !Array.isArray(updated.commands)) {
            updated.commands = [];
        }

        if (!updated.dependencies) {
            updated.dependencies = {};
        }
        if (!updated.dependencies['@ghost/extension-sdk']) {
            updated.dependencies['@ghost/extension-sdk'] = '^1.0.0';
        }

        if (updated.capabilities && updated.capabilities.network && updated.capabilities.network.rateLimit) {
            const rl = updated.capabilities.network.rateLimit;
            if (!rl.be && rl.bc) {
                rl.be = Math.floor(rl.bc * 2);
            }
        }

        return updated;
    }

    getDirectIORecommendations(analysis) {
        const recommendations = [];
        
        if (analysis.usesDirectFS) {
            recommendations.push('• fs.readFileSync(path) → await sdk.requestFileRead({ path })');
            recommendations.push('• fs.writeFileSync(path, data) → await sdk.requestFileWrite({ path, content: data })');
            recommendations.push('• fs.readdirSync(path) → await sdk.requestFileRead({ path, operation: \'readdir\' })');
        }
        
        if (analysis.usesDirectHTTP) {
            recommendations.push('• https.request(options) → await sdk.requestNetworkCall({ url, method, headers, body })');
            recommendations.push('• http.get(url) → await sdk.requestNetworkCall({ url, method: \'GET\' })');
        }
        
        if (analysis.usesDirectGit) {
            recommendations.push('• execSync(\'git status\') → await sdk.requestGitExec({ operation: \'status\', args: [] })');
            recommendations.push('• execSync(\'git commit -m "msg"\') → await sdk.requestGitExec({ operation: \'commit\', args: [\'-m\', \'msg\'] })');
        }
        
        return recommendations.join('\n');
    }

    getMigrationGuideForPattern(pattern) {
        const guides = {
            'STDIO_RPC_MIGRATION': `
The extension is using direct stdio JSON-RPC communication, which needs migration to the v1.0.0 pattern.

Steps:
1. Remove readline interface and stdin/stdout handlers
2. Create an extension class with init() method
3. Accept coreHandler in init() method: async init(config) { this.coreHandler = config.coreHandler; }
4. Replace direct JSON-RPC writes with RPC client calls
5. Export the extension class: module.exports = new YourExtension();

Example:
  // OLD (v0.x):
  process.stdin.on('line', (line) => {
      const request = JSON.parse(line);
      // ... handle request
      process.stdout.write(JSON.stringify(response) + '\\n');
  });

  // NEW (v1.0.0):
  class MyExtension {
      async init(config) {
          this.coreHandler = config.coreHandler;
      }
      
      async myCommand(params) {
          const result = await this.coreHandler({
              jsonrpc: "2.0",
              id: 1,
              method: "intent",
              params: { type: "filesystem", operation: "read", params: { path: "file.txt" } }
          });
          return result.result;
      }
  }
  
  module.exports = new MyExtension();
`,
            'NO_CORE_HANDLER': `
RPC client needs coreHandler injection to communicate with Ghost core.

Steps:
1. Add coreHandler parameter to constructor
2. Store it as instance property
3. Update any instantiation to pass coreHandler

Example:
  // OLD (v0.x):
  class ExtensionRPCClient {
      constructor() {
          this.requestId = 0;
      }
  }

  // NEW (v1.0.0):
  class ExtensionRPCClient {
      constructor(coreHandler) {
          this.coreHandler = coreHandler;
          this.requestId = 0;
      }
  }
  
  // In your extension init:
  async init(config) {
      this.rpcClient = new ExtensionRPCClient(config.coreHandler);
  }
`,
            'DIRECT_IO': `
Direct I/O operations (fs, http/https, child_process) must be replaced with SDK methods.

All file, network, and git operations must go through the security pipeline via ExtensionSDK.

Steps:
1. Import ExtensionSDK: const { ExtensionSDK } = require('@ghost/extension-sdk');
2. Initialize in constructor: this.sdk = new ExtensionSDK(extensionId, { coreHandler });
3. Replace direct calls with SDK methods

Example transformations:
  // Filesystem:
  fs.readFileSync('file.txt', 'utf8') → await this.sdk.requestFileRead({ path: 'file.txt' })
  fs.writeFileSync('file.txt', data) → await this.sdk.requestFileWrite({ path: 'file.txt', content: data })
  
  // Network:
  https.request({ hostname, path }) → await this.sdk.requestNetworkCall({ url: \`https://\${hostname}\${path}\` })
  
  // Git:
  execSync('git status') → await this.sdk.requestGitExec({ operation: 'status', args: [] })
`,
            'OBJECT_EXPORT': `
Object exports need to be converted to class-based ExtensionWrapper pattern.

Steps:
1. Create a class that wraps your extension logic
2. Move each exported function to a class method
3. Implement init() method to receive coreHandler
4. Export the class instance

Example:
  // OLD (v0.x):
  module.exports = {
      commit: async (params) => { /* ... */ },
      push: async (params) => { /* ... */ }
  };

  // NEW (v1.0.0):
  class MyExtension {
      async init(config) {
          this.coreHandler = config.coreHandler;
      }
      
      async commit(params) {
          // Your commit logic
      }
      
      async push(params) {
          // Your push logic
      }
  }
  
  module.exports = new MyExtension();
`
        };

        return guides[pattern] || 'No specific guide available for this pattern.';
    }

    async applyMigration(plan, extensionPath, mainPath, manifest, flags) {
        const backupDir = path.join(extensionPath, '.migration-backup');
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const versionedBackupDir = path.join(backupDir, timestamp);
        
        if (flags.backup !== false) {
            if (!fs.existsSync(versionedBackupDir)) {
                fs.mkdirSync(versionedBackupDir, { recursive: true });
            }
            console.log(`${this.Colors.GREEN}✓${this.Colors.ENDC} Created backup directory: ${this.Colors.DIM}.migration-backup/${timestamp}/${this.Colors.ENDC}`);

            for (const file of plan.files.toBackup) {
                const sourcePath = path.join(extensionPath, file);
                const backupPath = path.join(versionedBackupDir, file);
                if (fs.existsSync(sourcePath)) {
                    const backupFileDir = path.dirname(backupPath);
                    if (!fs.existsSync(backupFileDir)) {
                        fs.mkdirSync(backupFileDir, { recursive: true });
                    }
                    fs.copyFileSync(sourcePath, backupPath);
                    console.log(`${this.Colors.DIM}  Backed up: ${file}${this.Colors.ENDC}`);
                }
            }
        }

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

        const updatedManifest = this.generateUpdatedManifest(manifest);
        const manifestPath = path.join(extensionPath, 'manifest.json');
        fs.writeFileSync(manifestPath, JSON.stringify(updatedManifest, null, 2));
        console.log(`${this.Colors.GREEN}✓${this.Colors.ENDC} Updated manifest.json`);

        for (const file of plan.files.toCreate) {
            if (file.endsWith('-wrapper.js') || file === 'extension-wrapper.js') {
                const analysis = this.analyzeCode(fs.readFileSync(mainPath, 'utf8'), manifest, extensionPath);
                const wrapperContent = this.generateExtensionWrapper(manifest, analysis);
                const wrapperPath = path.join(extensionPath, file);
                fs.writeFileSync(wrapperPath, wrapperContent);
                console.log(`${this.Colors.GREEN}✓${this.Colors.ENDC} Generated ${file}`);
            }
        }

        const guideContent = this.generateMigrationGuide(plan, manifest);
        const guidePath = path.join(extensionPath, 'MIGRATION_GUIDE.md');
        fs.writeFileSync(guidePath, guideContent);
        console.log(`${this.Colors.GREEN}✓${this.Colors.ENDC} Generated MIGRATION_GUIDE.md`);

        console.log(`\n${this.Colors.BOLD}${this.Colors.GREEN}✓ Automatic Migration Applied Successfully!${this.Colors.ENDC}\n`);
        
        if (plan.manualChanges.length > 0) {
            console.log(`${this.Colors.WARNING}⚠ ${plan.manualChanges.length} manual change(s) required (see MIGRATION_GUIDE.md):${this.Colors.ENDC}`);
            plan.manualChanges.forEach((change, idx) => {
                const priorityColor = change.priority === 'critical' ? this.Colors.FAIL : 
                                    change.priority === 'high' ? this.Colors.WARNING : this.Colors.CYAN;
                console.log(`  ${idx + 1}. [${priorityColor}${change.priority}${this.Colors.ENDC}] ${change.file}: ${change.issue}`);
            });
            console.log('');
        }

        console.log(`${this.Colors.BOLD}Next Steps:${this.Colors.ENDC}`);
        console.log(`  1. Run: ${this.Colors.CYAN}npm install${this.Colors.ENDC}`);
        console.log(`  2. Review: ${this.Colors.CYAN}MIGRATION_GUIDE.md${this.Colors.ENDC}`);
        console.log(`  3. Complete manual changes listed above`);
        console.log(`  4. Validate: ${this.Colors.CYAN}ghost extension validate${this.Colors.ENDC}`);
        console.log(`  5. Install: ${this.Colors.CYAN}ghost extension install .${this.Colors.ENDC}\n`);

        if (flags.validate) {
            console.log(`${this.Colors.BOLD}Running validation...${this.Colors.ENDC}\n`);
            try {
                await this.validateMigratedExtension(extensionPath);
            } catch (error) {
                console.log(`${this.Colors.WARNING}⚠ Validation detected issues. Review and fix before installing.${this.Colors.ENDC}\n`);
            }
        }
    }

    async validateMigratedExtension(extensionPath) {
        console.log(`${this.Colors.DIM}Note: Run 'ghost extension validate' for comprehensive validation${this.Colors.ENDC}`);
        console.log(`${this.Colors.DIM}This is a basic post-migration check only.${this.Colors.ENDC}\n`);

        const manifestPath = path.join(extensionPath, 'manifest.json');
        const packageJsonPath = path.join(extensionPath, 'package.json');

        let checks = [];

        if (fs.existsSync(manifestPath)) {
            try {
                const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
                checks.push({ name: 'manifest.json is valid JSON', passed: true });
                
                if (manifest.dependencies && manifest.dependencies['@ghost/extension-sdk']) {
                    checks.push({ name: '@ghost/extension-sdk in manifest', passed: true });
                } else {
                    checks.push({ name: '@ghost/extension-sdk in manifest', passed: false });
                }

                if (manifest.capabilities && manifest.capabilities.network && 
                    manifest.capabilities.network.rateLimit && 
                    manifest.capabilities.network.rateLimit.be !== undefined) {
                    checks.push({ name: 'Rate limit "be" parameter present', passed: true });
                } else if (manifest.capabilities && manifest.capabilities.network && 
                           manifest.capabilities.network.rateLimit) {
                    checks.push({ name: 'Rate limit "be" parameter present', passed: false });
                }
            } catch (e) {
                checks.push({ name: 'manifest.json is valid JSON', passed: false });
            }
        }

        if (fs.existsSync(packageJsonPath)) {
            try {
                const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
                checks.push({ name: 'package.json is valid JSON', passed: true });
                
                if (pkg.dependencies && pkg.dependencies['@ghost/extension-sdk']) {
                    checks.push({ name: '@ghost/extension-sdk in package.json', passed: true });
                } else {
                    checks.push({ name: '@ghost/extension-sdk in package.json', passed: false });
                }
            } catch (e) {
                checks.push({ name: 'package.json is valid JSON', passed: false });
            }
        }

        checks.forEach(check => {
            const icon = check.passed ? `${this.Colors.GREEN}✓${this.Colors.ENDC}` : `${this.Colors.FAIL}✗${this.Colors.ENDC}`;
            console.log(`${icon} ${check.name}`);
        });

        const allPassed = checks.every(c => c.passed);
        console.log('');
        
        if (allPassed) {
            console.log(`${this.Colors.GREEN}✓ Basic validation passed${this.Colors.ENDC}\n`);
        } else {
            console.log(`${this.Colors.WARNING}⚠ Some checks failed${this.Colors.ENDC}\n`);
            throw new Error('Validation failed');
        }
    }

    generateExtensionWrapper(manifest, analysis) {
        const className = this.toPascalCase(manifest.id);
        const commands = (manifest.commands || []).map(cmd => `        // case '${cmd}': return await this.handle${this.toPascalCase(cmd)}(params);`).join('\n');
        
        return `const { ExtensionSDK } = require('@ghost/extension-sdk');

/**
 * ${manifest.name} - v1.0.0 Migration Wrapper
 * 
 * This is an automatically generated wrapper for your extension.
 * It provides the v1.0.0 ExtensionSDK interface.
 * 
 * TODO: Complete the migration by:
 * 1. Implementing command handlers
 * 2. Replacing direct I/O with SDK methods
 * 3. Moving business logic from old extension file
 */

class ${className} {
    constructor() {
        this.extensionId = '${manifest.id}';
        this.sdk = null;
    }

    /**
     * Initialize the extension with coreHandler injection
     * @param {Object} config - Configuration object
     * @param {Function} config.coreHandler - Core handler for pipeline communication
     */
    async init(config) {
        if (!config || !config.coreHandler) {
            throw new Error('coreHandler is required in init config');
        }

        this.sdk = new ExtensionSDK(this.extensionId, { 
            coreHandler: config.coreHandler 
        });

        console.log('[${manifest.id}] Initialized with ExtensionSDK v1.0.0');
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
        switch (command) {
${commands}
            default:
                throw new Error(\`Unknown command: \${command}\`);
        }
    }

${(manifest.commands || []).map(cmd => `    /**
     * Handle '${cmd}' command
     * TODO: Implement this command handler
     */
    async handle${this.toPascalCase(cmd)}(params) {
        throw new Error('Command not yet implemented: ${cmd}');
    }
`).join('\n')}
    /**
     * SDK Helper: Read file
     * Replaces: fs.readFileSync(path, 'utf8')
     */
    async readFile(filePath, encoding = 'utf8') {
        const result = await this.sdk.requestFileRead({ path: filePath, encoding });
        return result;
    }

    /**
     * SDK Helper: Write file
     * Replaces: fs.writeFileSync(path, content)
     */
    async writeFile(filePath, content, encoding = 'utf8') {
        const result = await this.sdk.requestFileWrite({ path: filePath, content, encoding });
        return result;
    }

    /**
     * SDK Helper: Network request
     * Replaces: https.request(options)
     */
    async httpRequest(url, options = {}) {
        const result = await this.sdk.requestNetworkCall({
            url,
            method: options.method || 'GET',
            headers: options.headers || {},
            body: options.body
        });
        return result;
    }

    /**
     * SDK Helper: Git command
     * Replaces: execSync('git ...')
     */
    async gitExec(operation, args = []) {
        const result = await this.sdk.requestGitExec({ operation, args });
        return result;
    }

    /**
     * Cleanup method called on extension shutdown
     */
    async cleanup() {
        console.log('[${manifest.id}] Cleaning up...');
    }
}

module.exports = new ${className}();
`;
    }

    generateMigrationGuide(plan, manifest) {
        let guide = `# Migration Guide: ${manifest.name}

## Overview

This extension has been automatically migrated from Ghost CLI v0.x to v1.0.0 SDK.

**Migration Date:** ${new Date().toISOString()}

## What Changed

### v0.x → v1.0.0 Architecture Changes

1. **ExtensionSDK Package**: Extensions now use \`@ghost/extension-sdk\` package
2. **Core Handler Injection**: Extension \`init()\` method receives \`coreHandler\` for dependency injection
3. **I/O Through Pipeline**: All file, network, and git operations route through security pipeline
4. **Manifest Schema**: New \`commands\` array and \`dependencies\` field required
5. **Rate Limiting**: Network capabilities require \`be\` (excess burst) parameter

### Security Benefits

- All I/O operations are audited and logged
- Permission-based access control enforced by pipeline
- Rate limiting prevents resource exhaustion
- Extensible validation and monitoring

## Files Modified

`;

        for (const file of plan.files.toModify) {
            guide += `- \`${file}\` - Updated for v1.0.0 compatibility\n`;
        }

        guide += `\n## Files Created\n\n`;

        for (const file of plan.files.toCreate) {
            guide += `- \`${file}\` - Generated during migration\n`;
        }

        guide += `\n## Files Backed Up\n\n`;

        for (const file of plan.files.toBackup) {
            guide += `- \`${file}\` - Backed up to \`.migration-backup/\`\n`;
        }

        guide += `\n## Manual Changes Required\n\n`;

        if (plan.manualChanges.length === 0) {
            guide += `✓ No manual changes required! Your extension has been automatically migrated.\n\n`;
            guide += `However, please review the generated files and test thoroughly.\n`;
        } else {
            plan.manualChanges.forEach((change, idx) => {
                guide += `### ${idx + 1}. ${change.file}: ${change.issue}\n\n`;
                guide += `**Pattern:** \`${change.pattern}\`\n`;
                guide += `**Priority:** ${change.priority}\n\n`;
                
                if (change.current) {
                    guide += `**Current Code:**\n\`\`\`javascript\n${change.current}\n\`\`\`\n\n`;
                }
                
                if (change.suggested) {
                    guide += `**Suggested Code:**\n\`\`\`javascript\n${change.suggested}\n\`\`\`\n\n`;
                }
                
                if (change.recommendation) {
                    guide += `**Recommendations:**\n${change.recommendation}\n\n`;
                }
                
                if (change.guide) {
                    guide += `**Detailed Guide:**\n${change.guide}\n\n`;
                }
                
                guide += `---\n\n`;
            });
        }

        guide += `## Common Migration Patterns

### Pattern 1: Replace Direct Filesystem Operations

**Before (v0.x):**
\`\`\`javascript
const fs = require('fs');
const content = fs.readFileSync('file.txt', 'utf8');
fs.writeFileSync('output.txt', content);
\`\`\`

**After (v1.0.0):**
\`\`\`javascript
const content = await this.sdk.requestFileRead({ path: 'file.txt' });
await this.sdk.requestFileWrite({ path: 'output.txt', content });
\`\`\`

### Pattern 2: Replace Direct HTTP Requests

**Before (v0.x):**
\`\`\`javascript
const https = require('https');
https.request({ hostname: 'api.example.com', path: '/data' }, callback);
\`\`\`

**After (v1.0.0):**
\`\`\`javascript
const response = await this.sdk.requestNetworkCall({
    url: 'https://api.example.com/data',
    method: 'GET'
});
\`\`\`

### Pattern 3: Replace Direct Git Commands

**Before (v0.x):**
\`\`\`javascript
const { execSync } = require('child_process');
const output = execSync('git status').toString();
\`\`\`

**After (v1.0.0):**
\`\`\`javascript
const result = await this.sdk.requestGitExec({ 
    operation: 'status', 
    args: [] 
});
const output = result.stdout;
\`\`\`

### Pattern 4: Update RPC Client with CoreHandler

**Before (v0.x):**
\`\`\`javascript
class ExtensionRPCClient {
    constructor() {
        this.requestId = 0;
    }
    
    async call(method, params) {
        // Direct stdio communication
        process.stdout.write(JSON.stringify(request) + '\\n');
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
    
    async call(method, params) {
        // Use injected coreHandler
        const response = await this.coreHandler(request);
        return response.result;
    }
}

// In extension init:
async init(config) {
    this.rpcClient = new ExtensionRPCClient(config.coreHandler);
}
\`\`\`

### Pattern 5: Convert Object Export to Class

**Before (v0.x):**
\`\`\`javascript
module.exports = {
    myCommand: async (params) => {
        // Command logic
    }
};
\`\`\`

**After (v1.0.0):**
\`\`\`javascript
class MyExtension {
    async init(config) {
        this.coreHandler = config.coreHandler;
        this.sdk = new ExtensionSDK('my-extension', { coreHandler: config.coreHandler });
    }
    
    async myCommand(params) {
        // Command logic using this.sdk
    }
}

module.exports = new MyExtension();
\`\`\`

## Testing Your Migration

### 1. Install Dependencies

\`\`\`bash
npm install
\`\`\`

### 2. Validate Extension

\`\`\`bash
ghost extension validate
\`\`\`

This will check:
- Manifest schema compliance
- Permission declarations
- Rate limit configuration
- File structure

### 3. Install Locally

\`\`\`bash
ghost extension install .
\`\`\`

### 4. Test Commands

\`\`\`bash
${(manifest.commands || ['your-command']).map(cmd => `ghost ${cmd}`).join('\n')}
\`\`\`

### 5. Check Audit Logs

\`\`\`bash
ghost gateway logs --extension=${manifest.id}
\`\`\`

## Troubleshooting

### Issue: "coreHandler is not defined"

**Cause:** Extension init() not receiving coreHandler properly.

**Solution:** Ensure your extension exports an instance with init() method:
\`\`\`javascript
class MyExtension {
    async init(config) {
        this.coreHandler = config.coreHandler;
    }
}
module.exports = new MyExtension();
\`\`\`

### Issue: "Permission denied" errors

**Cause:** Manifest capabilities don't match actual I/O operations.

**Solution:** Update manifest.json capabilities to match your extension's needs:
\`\`\`json
{
    "capabilities": {
        "filesystem": {
            "read": ["**/*"],
            "write": ["output/**"]
        },
        "network": {
            "allowlist": ["https://api.example.com"]
        }
    }
}
\`\`\`

### Issue: Rate limit errors

**Cause:** Extension exceeds configured rate limits.

**Solution:** Adjust rate limit parameters in manifest.json or optimize request patterns.

## Resources

- **Extension API Documentation:** \`docs/extension-api.md\`
- **SDK Reference:** \`packages/extension-sdk/README.md\`
- **Working Examples:** \`docs/extension-examples.md\`
- **Developer Toolkit:** \`docs/DEVELOPER_TOOLKIT.md\`

## Rollback Instructions

If you need to rollback to the pre-migration state:

\`\`\`bash
# Restore from latest backup
cp -r .migration-backup/$(ls -t .migration-backup | head -1)/* .

# Reinstall extension
ghost extension remove ${manifest.id}
ghost extension install .
\`\`\`

## Need Help?

If you encounter issues during migration:

1. Check \`MIGRATION_GUIDE.md\` (this file)
2. Review migration error messages
3. Consult SDK documentation
4. Run \`ghost extension validate\` for detailed diagnostics

---

*Migration tool version: 1.0.0*
*Generated: ${new Date().toISOString()}*
`;

        return guide;
    }

    printAnalysis(analysis) {
        console.log(`${this.Colors.DIM}Code Pattern Analysis:${this.Colors.ENDC}`);
        
        if (analysis.hasExtensionSDK) {
            console.log(`  ${this.Colors.GREEN}✓${this.Colors.ENDC} Already using @ghost/extension-sdk`);
            console.log(`  ${this.Colors.WARNING}⚠ Extension appears to be already migrated${this.Colors.ENDC}`);
            console.log(`  ${this.Colors.DIM}  Running migration anyway for validation...${this.Colors.ENDC}`);
        }

        console.log(`  ${this.Colors.CYAN}•${this.Colors.ENDC} Files analyzed: ${analysis.fileCount}`);
        console.log(`  ${this.Colors.CYAN}•${this.Colors.ENDC} Classes found: ${analysis.classes.length > 0 ? analysis.classes.join(', ') : 'none'}`);
        console.log(`  ${this.Colors.CYAN}•${this.Colors.ENDC} Functions found: ${analysis.functions.length}`);

        if (analysis.hasModuleExports) {
            const icon = analysis.exportPattern === 'class' ? this.Colors.GREEN + '✓' : this.Colors.WARNING + '⚠';
            console.log(`  ${icon}${this.Colors.ENDC} Export pattern: ${analysis.exportPattern}`);
        }

        if (analysis.hasExtensionWrapper) {
            console.log(`  ${this.Colors.GREEN}✓${this.Colors.ENDC} Uses ExtensionWrapper pattern`);
        }

        if (analysis.hasExtensionRPCClient) {
            console.log(`  ${this.Colors.CYAN}•${this.Colors.ENDC} Uses ExtensionRPCClient (legacy builtin)`);
        } else if (analysis.hasCustomRPCClient) {
            console.log(`  ${this.Colors.CYAN}•${this.Colors.ENDC} Uses custom RPC client: ${analysis.rpcClientPattern}`);
        }

        if (analysis.hasCoreHandlerInjection) {
            console.log(`  ${this.Colors.GREEN}✓${this.Colors.ENDC} CoreHandler injection detected`);
        } else if (analysis.hasExtensionRPCClient || analysis.hasCustomRPCClient) {
            console.log(`  ${this.Colors.FAIL}✗${this.Colors.ENDC} Missing coreHandler injection`);
        }

        const warnings = [];
        if (analysis.usesDirectFS) warnings.push('Direct fs module');
        if (analysis.usesDirectHTTP) warnings.push('Direct http/https');
        if (analysis.usesDirectGit) warnings.push('Direct git commands');
        if (analysis.usesDirectStdio) warnings.push('Direct stdio JSON-RPC');

        if (warnings.length > 0) {
            console.log(`  ${this.Colors.WARNING}⚠${this.Colors.ENDC} Legacy patterns: ${warnings.join(', ')}`);
        }

        if (analysis.legacyPatterns.length > 0) {
            console.log(`\n${this.Colors.DIM}Incompatibility Details:${this.Colors.ENDC}`);
            analysis.legacyPatterns.forEach((pattern, idx) => {
                const severity = pattern.severity === 'critical' ? this.Colors.FAIL :
                               pattern.severity === 'high' ? this.Colors.WARNING :
                               this.Colors.CYAN;
                console.log(`  ${idx + 1}. [${severity}${pattern.severity.toUpperCase()}${this.Colors.ENDC}] ${pattern.pattern}`);
                console.log(`     ${this.Colors.DIM}→ ${pattern.recommendation}${this.Colors.ENDC}`);
            });
        }
    }

    printManifestValidation(validation) {
        if (validation.compatible && validation.errors.length === 0) {
            console.log(`  ${this.Colors.GREEN}✓${this.Colors.ENDC} Manifest is v1.0.0 compatible`);
        } else {
            console.log(`  ${this.Colors.FAIL}✗${this.Colors.ENDC} Manifest requires updates for v1.0.0`);
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
            console.log(`\n${this.Colors.DIM}Required Upgrades:${this.Colors.ENDC}`);
            validation.upgrades.forEach((upgrade, idx) => {
                console.log(`  ${idx + 1}. ${upgrade.field}`);
                console.log(`     ${this.Colors.DIM}Current: ${upgrade.current}${this.Colors.ENDC}`);
                console.log(`     ${this.Colors.CYAN}Suggested: ${upgrade.suggested}${this.Colors.ENDC}`);
                console.log(`     ${this.Colors.DIM}Reason: ${upgrade.reason}${this.Colors.ENDC}`);
            });
        }
    }

    printMigrationPlan(plan) {
        console.log(`${this.Colors.DIM}Migration Plan:${this.Colors.ENDC}`);
        
        if (plan.steps.length === 0) {
            console.log(`  ${this.Colors.DIM}No automated steps required${this.Colors.ENDC}`);
        } else {
            plan.steps.forEach((step, idx) => {
                const icon = step.automated ? this.Colors.GREEN + '✓' : this.Colors.WARNING + '○';
                console.log(`  ${idx + 1}. ${icon}${this.Colors.ENDC} ${step.title}`);
                console.log(`     ${this.Colors.DIM}${step.type} → ${step.file}${this.Colors.ENDC}`);
            });
        }

        if (plan.manualChanges.length > 0) {
            console.log(`\n${this.Colors.WARNING}Manual Changes Required: ${plan.manualChanges.length}${this.Colors.ENDC}`);
            plan.manualChanges.forEach((change, idx) => {
                const priorityColor = change.priority === 'critical' ? this.Colors.FAIL : 
                                    change.priority === 'high' ? this.Colors.WARNING : this.Colors.CYAN;
                console.log(`  ${idx + 1}. [${priorityColor}${change.priority.toUpperCase()}${this.Colors.ENDC}] ${change.file}`);
                console.log(`     ${this.Colors.DIM}${change.issue}${this.Colors.ENDC}`);
            });
        }

        console.log(`\n${this.Colors.DIM}Summary:${this.Colors.ENDC}`);
        console.log(`  Files to create: ${plan.files.toCreate.length}`);
        console.log(`  Files to modify: ${plan.files.toModify.length}`);
        console.log(`  Files to backup: ${plan.files.toBackup.length}`);
    }

    printDiffPreviews(diffs) {
        diffs.forEach((diff, idx) => {
            console.log(`\n${this.Colors.CYAN}${idx + 1}. ${diff.file}${this.Colors.ENDC}`);
            console.log(`${this.Colors.DIM}${'─'.repeat(60)}${this.Colors.ENDC}`);
            
            if (diff.oldContent === '(file does not exist)' || diff.oldContent === '(new file)') {
                console.log(`${this.Colors.GREEN}+++ New file${this.Colors.ENDC}`);
                const lines = diff.newContent.split('\n').slice(0, 10);
                lines.forEach(line => {
                    console.log(`${this.Colors.GREEN}+ ${line}${this.Colors.ENDC}`);
                });
                if (diff.newContent.split('\n').length > 10) {
                    console.log(`${this.Colors.DIM}... (${diff.newContent.split('\n').length - 10} more lines)${this.Colors.ENDC}`);
                }
            } else {
                const oldLines = diff.oldContent.split('\n');
                const newLines = diff.newContent.split('\n');
                const maxPreview = 15;
                
                const changes = this.computeSimpleDiff(oldLines, newLines);
                const preview = changes.slice(0, maxPreview);
                
                preview.forEach(change => {
                    if (change.type === 'add') {
                        console.log(`${this.Colors.GREEN}+ ${change.line}${this.Colors.ENDC}`);
                    } else if (change.type === 'remove') {
                        console.log(`${this.Colors.FAIL}- ${change.line}${this.Colors.ENDC}`);
                    } else {
                        console.log(`${this.Colors.DIM}  ${change.line}${this.Colors.ENDC}`);
                    }
                });
                
                if (changes.length > maxPreview) {
                    console.log(`${this.Colors.DIM}... (${changes.length - maxPreview} more changes)${this.Colors.ENDC}`);
                }
            }
        });
    }

    computeSimpleDiff(oldLines, newLines) {
        const changes = [];
        const maxLen = Math.max(oldLines.length, newLines.length);
        
        for (let i = 0; i < maxLen; i++) {
            const oldLine = oldLines[i];
            const newLine = newLines[i];
            
            if (oldLine === newLine) {
                changes.push({ type: 'same', line: oldLine });
            } else if (oldLine === undefined) {
                changes.push({ type: 'add', line: newLine });
            } else if (newLine === undefined) {
                changes.push({ type: 'remove', line: oldLine });
            } else {
                changes.push({ type: 'remove', line: oldLine });
                changes.push({ type: 'add', line: newLine });
            }
        }
        
        return changes;
    }

    showError(errorCode, details) {
        const errorMessages = {
            'NO_MANIFEST': {
                title: 'Manifest Not Found',
                icon: '✗',
                color: this.Colors.FAIL
            },
            'INVALID_MANIFEST': {
                title: 'Invalid Manifest',
                icon: '✗',
                color: this.Colors.FAIL
            },
            'MISSING_MAIN_FILE': {
                title: 'Main File Not Found',
                icon: '✗',
                color: this.Colors.FAIL
            },
            'READ_ERROR': {
                title: 'File Read Error',
                icon: '✗',
                color: this.Colors.FAIL
            }
        };

        const error = errorMessages[errorCode] || { title: 'Error', icon: '✗', color: this.Colors.FAIL };
        
        console.error(`\n${error.color}${error.icon} ${error.title}${this.Colors.ENDC}`);
        console.error(`${this.Colors.DIM}${'─'.repeat(60)}${this.Colors.ENDC}`);
        
        if (details.message) {
            console.error(`\n${error.color}${details.message}${this.Colors.ENDC}`);
        }
        
        if (details.path) {
            console.error(`\nPath: ${this.Colors.DIM}${details.path}${this.Colors.ENDC}`);
        }
        
        if (details.file) {
            console.error(`\nFile: ${this.Colors.DIM}${details.file}${this.Colors.ENDC}`);
        }
        
        if (details.error) {
            console.error(`\nError Details: ${this.Colors.DIM}${details.error}${this.Colors.ENDC}`);
        }
        
        if (details.suggestion) {
            console.error(`\n${this.Colors.CYAN}Suggestion:${this.Colors.ENDC} ${details.suggestion}`);
        }
        
        console.error('');
    }

    toPascalCase(str) {
        return str
            .split('-')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join('');
    }
}

module.exports = ExtensionMigrator;
