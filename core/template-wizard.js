const fs = require('fs');
const path = require('path');
const readline = require('readline');

/**
 * Enhanced Template Wizard with Gallery System
 * 
 * Provides interactive template selection from a gallery of pre-built templates:
 * - API Integration Template
 * - File Processor Template
 * - Git Workflow Template
 * - Testing Template
 * - Basic/TypeScript/Advanced templates
 */
class TemplateWizard {
    constructor() {
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        this.templateGallery = {
            'api-integration': {
                name: 'API Integration',
                description: 'REST/GraphQL client with auth, rate limiting, retry logic, and caching',
                path: path.join(__dirname, '..', 'templates', 'api-integration-template'),
                capabilities: ['Network access', 'Authentication', 'Rate limiting', 'Caching'],
                useCases: ['API clients', 'Third-party integrations', 'Webhook consumers'],
                preview: `Features:
  • Multiple auth types (Bearer, API Key, Basic)
  • Automatic retry with exponential backoff
  • Rate limit detection and handling
  • Response caching with TTL
  • GraphQL support
  
Commands: api-call, api-config`
            },
            'file-processor': {
                name: 'File Processor',
                description: 'Batch file operations with progress tracking, streaming, and glob patterns',
                path: path.join(__dirname, '..', 'templates', 'file-processor-template'),
                capabilities: ['File I/O', 'Batch processing', 'Streaming', 'Progress events'],
                useCases: ['Build tools', 'Code generators', 'File transformers'],
                preview: `Features:
  • Batch processing with concurrency control
  • Progress tracking and events
  • Streaming for large files
  • Glob pattern matching
  • Recursive directory traversal
  
Commands: process-files, batch-transform, stream-large-file`
            },
            'git-workflow': {
                name: 'Git Workflow',
                description: 'Commit hooks, branch validation, and conventional commits enforcement',
                path: path.join(__dirname, '..', 'templates', 'git-workflow-template'),
                capabilities: ['Git hooks', 'Branch validation', 'Commit validation', 'Conventional commits'],
                useCases: ['Workflow automation', 'Quality gates', 'Team standards'],
                preview: `Features:
  • Install and manage Git hooks
  • Branch name validation
  • Conventional commit format enforcement
  • Protected branch prevention
  • Pre-commit/pre-push checks
  
Commands: install-hooks, validate-branch, validate-commit, enforce-conventional`
            },
            'testing': {
                name: 'Testing Template',
                description: 'Vitest config, mock RPC client, integration tests, and coverage reporting',
                path: path.join(__dirname, '..', 'templates', 'testing-template'),
                capabilities: ['Test runner', 'Mock RPC', 'Coverage', 'CI integration'],
                useCases: ['Extension testing', 'TDD workflows', 'CI/CD pipelines'],
                preview: `Features:
  • Vitest test runner integration
  • Mock RPC client for pipeline testing
  • Coverage reporting (HTML, JSON, LCOV)
  • Integration test examples
  • Test scenarios (success, error, timeout)
  
Commands: run-tests, generate-coverage, mock-test`
            },
            'basic': {
                name: 'Basic',
                description: 'Simple extension structure for quick prototyping',
                path: null,
                capabilities: ['Minimal setup', 'Quick start'],
                useCases: ['Learning', 'Prototypes', 'Simple tools'],
                preview: `Features:
  • Minimal boilerplate
  • Single file structure
  • Easy to understand
  • Fast to scaffold`
            },
            'typescript': {
                name: 'TypeScript',
                description: 'TypeScript extension with build configuration',
                path: null,
                capabilities: ['Type safety', 'Build pipeline', 'Modern JS'],
                useCases: ['Type-safe extensions', 'Large projects', 'Team development'],
                preview: `Features:
  • TypeScript configuration
  • Build scripts
  • Type definitions
  • Modern ES features`
            },
            'advanced': {
                name: 'Advanced',
                description: 'Full-featured extension with tests and documentation',
                path: null,
                capabilities: ['Testing', 'Documentation', 'CI ready'],
                useCases: ['Production extensions', 'Open source', 'Enterprise'],
                preview: `Features:
  • Test suite included
  • Comprehensive documentation
  • CI configuration
  • Best practices`
            }
        };
    }

    async prompt(question) {
        return new Promise((resolve) => {
            this.rl.question(question, (answer) => {
                resolve(answer);
            });
        });
    }

    async promptMultiSelect(question, options) {
        console.log(question);
        options.forEach((opt, idx) => {
            console.log(`  ${idx + 1}. ${opt.name}${opt.description ? ` - ${opt.description}` : ''}`);
        });
        
        const answer = await this.prompt('Enter numbers separated by commas (e.g., 1,3,4): ');
        const selections = answer.split(',')
            .map(s => parseInt(s.trim()) - 1)
            .filter(i => i >= 0 && i < options.length);
        
        return selections.map(i => options[i].value);
    }

    async run(options = {}) {
        const { template: preselectedTemplate, name: extensionName } = options;

        console.log('\n🎨 Ghost Extension Template Gallery\n');

        let templateChoice = preselectedTemplate;

        // If template is pre-selected, validate it
        if (preselectedTemplate) {
            if (!this.templateGallery[preselectedTemplate]) {
                console.error(`❌ Error: Unknown template '${preselectedTemplate}'`);
                console.log('\nAvailable templates:');
                Object.keys(this.templateGallery).forEach(key => {
                    console.log(`  - ${key}`);
                });
                this.rl.close();
                return;
            }
            
            console.log(`Using template: ${this.templateGallery[preselectedTemplate].name}\n`);
        } else {
            // Interactive template selection
            console.log('Choose from pre-built templates or create a custom extension\n');

            // Show template gallery
            await this.showTemplateGallery();

            // Get template selection
            templateChoice = await this.selectTemplate();

            if (!templateChoice) {
                console.log('Template selection cancelled');
                this.rl.close();
                return;
            }
        }

        // Get extension details
        const extensionData = await this.getExtensionDetails(templateChoice, extensionName);

        if (!extensionData) {
            console.log('Extension creation cancelled');
            this.rl.close();
            return;
        }

        console.log('\n📦 Generating extension...\n');

        try {
            const outputDir = await this.generateExtension(extensionData, templateChoice);
            
            console.log(`✅ Extension generated at: ${outputDir}\n`);
            console.log('Next steps:');
            console.log(`  cd ${path.basename(outputDir)}`);
            
            if (templateChoice === 'typescript' || this.requiresNpmInstall(templateChoice)) {
                console.log('  npm install');
            }
            
            if (templateChoice === 'typescript') {
                console.log('  npm run build');
            } else if (this.hasTests(templateChoice)) {
                console.log('  npm test');
            }
            
            console.log('  ghost extension validate');
            console.log('  ghost extension install .\n');
        } catch (error) {
            console.error(`❌ Error: ${error.message}`);
        }

        this.rl.close();
    }

    async showTemplateGallery() {
        console.log('📚 Available Templates:\n');

        let index = 1;
        for (const [key, template] of Object.entries(this.templateGallery)) {
            console.log(`${index}. ${template.name}`);
            console.log(`   ${template.description}`);
            console.log(`   Use cases: ${template.useCases?.join(', ') || 'General purpose'}`);
            console.log('');
            index++;
        }
    }

    async selectTemplate() {
        const templates = Object.keys(this.templateGallery);
        const answer = await this.prompt(`Select template (1-${templates.length}, or 'p' for preview): `);

        if (answer.toLowerCase() === 'p') {
            await this.showTemplatePreviews();
            return this.selectTemplate();
        }

        const choice = parseInt(answer);
        if (choice < 1 || choice > templates.length) {
            console.log('Invalid selection');
            return null;
        }

        const templateKey = templates[choice - 1];
        
        // Show preview
        await this.showTemplatePreview(templateKey);
        
        // Confirm
        const confirm = await this.prompt(`\nUse this template? (y/n): `);
        if (confirm.toLowerCase() !== 'y') {
            return this.selectTemplate();
        }

        return templateKey;
    }

    async showTemplatePreviews() {
        console.log('\n📖 Template Previews:\n');

        for (const [key, template] of Object.entries(this.templateGallery)) {
            console.log(`━━━ ${template.name} ━━━`);
            console.log(template.preview);
            console.log('');
        }

        await this.prompt('Press Enter to continue...');
        console.log('');
    }

    async showTemplatePreview(templateKey) {
        const template = this.templateGallery[templateKey];
        
        console.log(`\n╔════════════════════════════════════════════════════════════╗`);
        console.log(`║  ${template.name.padEnd(56)} ║`);
        console.log(`╚════════════════════════════════════════════════════════════╝`);
        console.log(`\n${template.description}\n`);
        console.log(`Capabilities:`);
        template.capabilities.forEach(cap => console.log(`  • ${cap}`));
        console.log('');
        console.log(template.preview);
    }

    async getExtensionDetails(templateKey, presetName) {
        const template = this.templateGallery[templateKey];

        // Extension name
        const name = presetName || await this.prompt('Extension name: ');
        if (!name) {
            console.log('Error: Extension name is required');
            return null;
        }

        // Extension ID (derived from name)
        const defaultId = name.toLowerCase().replace(/\s+/g, '-');
        const id = await this.prompt(`Extension ID (${defaultId}): `) || defaultId;

        // Description
        const defaultDescription = `${name} extension`;
        const description = await this.prompt(`Description (${defaultDescription}): `) || defaultDescription;

        // Author
        const author = await this.prompt('Author (optional): ') || '';

        // Version
        const version = await this.prompt('Version (1.0.0): ') || '1.0.0';

        return {
            name,
            id,
            description,
            author,
            version,
            template: templateKey
        };
    }

    async generateExtension(data, templateKey) {
        const outputDir = path.join(process.cwd(), data.id);

        if (fs.existsSync(outputDir)) {
            throw new Error(`Directory ${outputDir} already exists`);
        }

        const template = this.templateGallery[templateKey];

        // If template has a path (pre-built template), copy it
        if (template.path && fs.existsSync(template.path)) {
            await this.copyTemplate(template.path, outputDir, data);
        } else {
            // Generate from scratch (basic, typescript, advanced)
            fs.mkdirSync(outputDir, { recursive: true });
            
            if (templateKey === 'typescript') {
                this._generateTypeScriptExtension(outputDir, data);
            } else if (templateKey === 'advanced') {
                this._generateAdvancedExtension(outputDir, data);
            } else {
                this._generateBasicExtension(outputDir, data);
            }

            // Generate common files
            const manifest = this._generateManifest(data);
            fs.writeFileSync(
                path.join(outputDir, 'manifest.json'),
                JSON.stringify(manifest, null, 2)
            );

            const readme = this._generateReadme(data);
            fs.writeFileSync(path.join(outputDir, 'README.md'), readme);

            const gitignore = this._generateGitignore();
            fs.writeFileSync(path.join(outputDir, '.gitignore'), gitignore);
        }

        return outputDir;
    }

    async copyTemplate(templatePath, outputDir, data) {
        fs.mkdirSync(outputDir, { recursive: true });

        const entries = fs.readdirSync(templatePath, { withFileTypes: true });

        for (const entry of entries) {
            const srcPath = path.join(templatePath, entry.name);
            const destPath = path.join(outputDir, entry.name);

            if (entry.isDirectory()) {
                await this.copyTemplate(srcPath, destPath, data);
            } else {
                let content = fs.readFileSync(srcPath, 'utf8');

                // Replace template variables in manifest.json
                if (entry.name === 'manifest.json') {
                    const manifest = JSON.parse(content);
                    manifest.id = data.id;
                    manifest.name = data.name;
                    manifest.version = data.version;
                    manifest.description = data.description;
                    if (data.author) {
                        manifest.author = data.author;
                    }
                    content = JSON.stringify(manifest, null, 2);
                }

                fs.writeFileSync(destPath, content);
            }
        }
    }

    requiresNpmInstall(templateKey) {
        return ['api-integration', 'file-processor', 'git-workflow', 'testing', 'typescript', 'advanced'].includes(templateKey);
    }

    hasTests(templateKey) {
        return ['api-integration', 'file-processor', 'git-workflow', 'testing', 'advanced'].includes(templateKey);
    }

    _generateManifest(data) {
        return {
            id: data.id,
            name: data.name,
            version: data.version,
            description: data.description || '',
            author: data.author || '',
            main: data.template === 'typescript' ? 'dist/index.js' : 'index.js',
            capabilities: {},
            commands: []
        };
    }

    _generateBasicExtension(outputDir, data) {
        const mainContent = `// ${data.name}
// ${data.description}

class ${this._toPascalCase(data.id)}Extension {
    async init(context) {
        console.log('${data.name} initialized');
        this.context = context;
    }

    // Add your extension commands here

    async cleanup() {
        console.log('${data.name} cleanup');
    }
}

module.exports = ${this._toPascalCase(data.id)}Extension;
`;

        fs.writeFileSync(path.join(outputDir, 'index.js'), mainContent);
    }

    _generateTypeScriptExtension(outputDir, data) {
        const srcDir = path.join(outputDir, 'src');
        fs.mkdirSync(srcDir);

        const tsContent = `// ${data.name}
// ${data.description}

interface Context {
    config: Record<string, any>;
}

export default class ${this._toPascalCase(data.id)}Extension {
    private context?: Context;

    async init(context: Context): Promise<void> {
        console.log('${data.name} initialized');
        this.context = context;
    }

    // Add your extension commands here

    async cleanup(): Promise<void> {
        console.log('${data.name} cleanup');
    }
}
`;

        fs.writeFileSync(path.join(srcDir, 'index.ts'), tsContent);

        const tsconfig = {
            compilerOptions: {
                target: 'ES2020',
                module: 'commonjs',
                lib: ['ES2020'],
                outDir: './dist',
                rootDir: './src',
                strict: true,
                esModuleInterop: true,
                skipLibCheck: true,
                forceConsistentCasingInFileNames: true,
                declaration: true
            },
            include: ['src/**/*'],
            exclude: ['node_modules', 'dist']
        };

        fs.writeFileSync(
            path.join(outputDir, 'tsconfig.json'),
            JSON.stringify(tsconfig, null, 2)
        );

        const packageJson = {
            name: data.id,
            version: data.version,
            description: data.description,
            main: 'dist/index.js',
            scripts: {
                build: 'tsc',
                watch: 'tsc --watch',
                clean: 'rm -rf dist'
            },
            devDependencies: {
                typescript: '^5.0.0',
                '@types/node': '^20.0.0'
            }
        };

        fs.writeFileSync(
            path.join(outputDir, 'package.json'),
            JSON.stringify(packageJson, null, 2)
        );
    }

    _generateAdvancedExtension(outputDir, data) {
        this._generateBasicExtension(outputDir, data);

        const testDir = path.join(outputDir, 'test');
        fs.mkdirSync(testDir);

        const testContent = `const assert = require('assert');
const Extension = require('../index');

describe('${data.name}', () => {
    let extension;

    beforeEach(() => {
        extension = new Extension();
    });

    it('should initialize', async () => {
        await extension.init({});
        assert.ok(extension.context);
    });

    it('should cleanup', async () => {
        await extension.init({});
        await extension.cleanup();
    });
});
`;

        fs.writeFileSync(path.join(testDir, 'index.test.js'), testContent);

        const packageJson = {
            name: data.id,
            version: data.version,
            description: data.description,
            main: 'index.js',
            scripts: {
                test: 'mocha'
            },
            devDependencies: {
                mocha: '^10.0.0'
            }
        };

        fs.writeFileSync(
            path.join(outputDir, 'package.json'),
            JSON.stringify(packageJson, null, 2)
        );
    }

    _generateReadme(data) {
        return `# ${data.name}

${data.description}

## Installation

\`\`\`bash
ghost extension install .
\`\`\`

## Usage

\`\`\`bash
# Add usage examples here
\`\`\`

## Development

${data.template === 'typescript' ? `\`\`\`bash
npm install
npm run build
\`\`\`

` : ''}${data.template === 'advanced' ? `### Testing

\`\`\`bash
npm test
\`\`\`

` : ''}## License

MIT
`;
    }

    _generateGitignore() {
        return `node_modules/
dist/
*.log
.DS_Store
.env
coverage/
`;
    }

    _toPascalCase(str) {
        return str
            .split('-')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join('');
    }
}

module.exports = TemplateWizard;
