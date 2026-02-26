const fs = require('fs');
const path = require('path');
const readline = require('readline');

class TemplateWizard {
    constructor() {
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
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

    async run() {
        console.log('\n🔧 Ghost Extension Template Generator\n');

        // Extension name
        const name = await this.prompt('Extension name: ');
        if (!name) {
            console.log('Error: Extension name is required');
            this.rl.close();
            return;
        }

        // Extension ID (derived from name)
        const defaultId = name.toLowerCase().replace(/\s+/g, '-');
        const id = await this.prompt(`Extension ID (${defaultId}): `) || defaultId;

        // Description
        const description = await this.prompt('Description: ');

        // Author
        const author = await this.prompt('Author: ');

        // Version
        const version = await this.prompt('Version (1.0.0): ') || '1.0.0';

        // Capabilities
        console.log('\nSelect capabilities:');
        const capabilities = await this.promptMultiSelect('', [
            { name: 'Filesystem access', value: 'filesystem', description: 'Read/write files' },
            { name: 'Network access', value: 'network', description: 'HTTP requests' },
            { name: 'Git operations', value: 'git', description: 'Git commands' },
            { name: 'Process execution', value: 'process', description: 'Run shell commands' }
        ]);

        // Commands
        const commandsStr = await this.prompt('Commands (comma-separated, e.g., build,test): ');
        const commands = commandsStr ? commandsStr.split(',').map(c => c.trim()) : [];

        // Template type
        console.log('\nSelect template:');
        const templates = [
            { name: 'Basic', value: 'basic', description: 'Simple extension structure' },
            { name: 'TypeScript', value: 'typescript', description: 'TypeScript with build setup' },
            { name: 'Advanced', value: 'advanced', description: 'Full featured with tests' }
        ];
        templates.forEach((t, idx) => {
            console.log(`  ${idx + 1}. ${t.name} - ${t.description}`);
        });
        const templateChoice = await this.prompt('Choose template (1-3): ');
        const template = templates[parseInt(templateChoice) - 1]?.value || 'basic';

        console.log('\nGenerating extension...\n');

        const extensionData = {
            name,
            id,
            description,
            author,
            version,
            capabilities,
            commands,
            template
        };

        const outputDir = await this.generateExtension(extensionData);
        
        console.log(`✓ Extension generated at: ${outputDir}`);
        console.log('\nNext steps:');
        console.log(`  cd ${outputDir}`);
        if (template === 'typescript') {
            console.log('  npm install');
            console.log('  npm run build');
        }
        console.log('  ghost extension validate');
        console.log('  ghost extension install .\n');

        this.rl.close();
    }

    async generateExtension(data) {
        const outputDir = path.join(process.cwd(), data.id);

        if (fs.existsSync(outputDir)) {
            throw new Error(`Directory ${outputDir} already exists`);
        }

        fs.mkdirSync(outputDir, { recursive: true });

        // Generate manifest.json
        const manifest = this._generateManifest(data);
        fs.writeFileSync(
            path.join(outputDir, 'manifest.json'),
            JSON.stringify(manifest, null, 2)
        );

        // Generate main file
        if (data.template === 'typescript') {
            this._generateTypeScriptExtension(outputDir, data);
        } else if (data.template === 'advanced') {
            this._generateAdvancedExtension(outputDir, data);
        } else {
            this._generateBasicExtension(outputDir, data);
        }

        // Generate README
        const readme = this._generateReadme(data);
        fs.writeFileSync(path.join(outputDir, 'README.md'), readme);

        // Generate .gitignore
        const gitignore = this._generateGitignore();
        fs.writeFileSync(path.join(outputDir, '.gitignore'), gitignore);

        return outputDir;
    }

    _generateManifest(data) {
        const manifest = {
            id: data.id,
            name: data.name,
            version: data.version,
            description: data.description || '',
            author: data.author || '',
            main: data.template === 'typescript' ? 'dist/index.js' : 'index.js',
            capabilities: {},
            commands: data.commands
        };

        // Build capabilities object
        if (data.capabilities.includes('filesystem')) {
            manifest.capabilities.filesystem = {
                read: ['**/*'],
                write: ['**/*']
            };
        }

        if (data.capabilities.includes('network')) {
            manifest.capabilities.network = {
                allowlist: ['*']
            };
        }

        if (data.capabilities.includes('git')) {
            manifest.capabilities.git = {
                read: true,
                write: true
            };
        }

        if (data.capabilities.includes('process')) {
            manifest.capabilities.process = {
                allowlist: ['*']
            };
        }

        return manifest;
    }

    _generateBasicExtension(outputDir, data) {
        const mainContent = `// ${data.name}
// ${data.description}

class ${this._toPascalCase(data.id)}Extension {
    async init(context) {
        console.log('${data.name} initialized');
        this.context = context;
    }

${data.commands.map(cmd => `    async ${cmd}(params) {
        console.log('Executing ${cmd}', params);
        
        // TODO: Implement ${cmd} logic
        
        return {
            success: true,
            message: '${cmd} completed'
        };
    }`).join('\n\n')}

    async cleanup() {
        console.log('${data.name} cleanup');
    }
}

module.exports = ${this._toPascalCase(data.id)}Extension;
`;

        fs.writeFileSync(path.join(outputDir, 'index.js'), mainContent);
    }

    _generateTypeScriptExtension(outputDir, data) {
        // Create src directory
        const srcDir = path.join(outputDir, 'src');
        fs.mkdirSync(srcDir);

        // Generate TypeScript source
        const tsContent = `// ${data.name}
// ${data.description}

interface Context {
    config: Record<string, any>;
}

interface CommandParams {
    subcommand?: string;
    args: string[];
    flags: Record<string, any>;
}

export default class ${this._toPascalCase(data.id)}Extension {
    private context?: Context;

    async init(context: Context): Promise<void> {
        console.log('${data.name} initialized');
        this.context = context;
    }

${data.commands.map(cmd => `    async ${cmd}(params: CommandParams): Promise<any> {
        console.log('Executing ${cmd}', params);
        
        // TODO: Implement ${cmd} logic
        
        return {
            success: true,
            message: '${cmd} completed'
        };
    }`).join('\n\n')}

    async cleanup(): Promise<void> {
        console.log('${data.name} cleanup');
    }
}
`;

        fs.writeFileSync(path.join(srcDir, 'index.ts'), tsContent);

        // Generate tsconfig.json
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

        // Generate package.json
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
        // Generate basic structure first
        this._generateBasicExtension(outputDir, data);

        // Add test directory
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

${data.commands.map(cmd => `    it('should execute ${cmd}', async () => {
        await extension.init({});
        const result = await extension.${cmd}({ args: [], flags: {} });
        assert.strictEqual(result.success, true);
    });`).join('\n\n')}

    it('should cleanup', async () => {
        await extension.init({});
        await extension.cleanup();
    });
});
`;

        fs.writeFileSync(path.join(testDir, 'index.test.js'), testContent);

        // Add package.json for tests
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

${data.commands.map(cmd => `\`\`\`bash
ghost ${cmd}
\`\`\``).join('\n\n')}

## Capabilities

${data.capabilities.map(cap => `- ${cap}`).join('\n')}

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
