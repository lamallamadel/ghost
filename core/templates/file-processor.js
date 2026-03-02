const BaseTemplate = require('./base-template');

class FileProcessorTemplate extends BaseTemplate {
    constructor() {
        super({
            id: 'file-processor',
            name: 'File Processor',
            description: 'Batch file operations with progress tracking',
            category: 'Utilities',
            features: ['Batch processing', 'Progress tracking', 'File transformations', 'Pattern matching'],
            prompts: [
                { key: 'processType', question: 'Process type (transform/analyze/batch): ', default: 'transform' }
            ],
            setup: [
                'npm install'
            ],
            usage: [
                'ghost process src dist --pattern "*.js"',
                'ghost process src dist --transform minify',
                'ghost process analyze src --report'
            ]
        });
    }

    async generate(outputDir, data) {
        const processType = data.processType || 'transform';

        this._generateManifest(outputDir, data);
        this._generatePackageJson(outputDir, data);
        this._generateMainFile(outputDir, data, processType);
        this._generateTestFile(outputDir, data);
        this._generateReadme(outputDir, data, processType);
        this.writeFile(outputDir, '.gitignore', this._generateGitignore());
    }

    _generateManifest(outputDir, data) {
        const manifest = {
            id: data.id,
            name: data.name,
            version: data.version,
            description: data.description,
            author: data.author,
            main: 'index.js',
            capabilities: {
                filesystem: {
                    read: ['**/*'],
                    write: ['**/*']
                }
            },
            commands: ['process', 'analyze']
        };

        this.writeFile(outputDir, 'manifest.json', JSON.stringify(manifest, null, 2));
    }

    _generatePackageJson(outputDir, data) {
        const packageJson = {
            name: data.id,
            version: data.version,
            description: data.description,
            main: 'index.js',
            scripts: {
                test: 'jest',
                'test:watch': 'jest --watch',
                'test:coverage': 'jest --coverage'
            },
            dependencies: {
                'glob': '^10.0.0',
                'chalk': '^5.3.0'
            },
            devDependencies: {
                jest: '^29.0.0'
            }
        };

        this.writeFile(outputDir, 'package.json', JSON.stringify(packageJson, null, 2));
    }

    _generateMainFile(outputDir, data, processType) {
        const className = this._toPascalCase(data.id);
        
        const content = `const { ExtensionSDK } = require('@ghost/extension-sdk');
const path = require('path');

class ${className} {
    constructor() {
        this.sdk = new ExtensionSDK('${data.id}');
        this.progressCallback = null;
    }

    async init(context) {
        console.log('${data.name} initialized');
        this.context = context;
    }

    async process(params) {
        const { args, flags } = params;
        const sourceDir = args[0] || './src';
        const outputDir = args[1] || './dist';
        const pattern = flags.pattern || '**/*.js';

        try {
            console.log(\`Processing files from \${sourceDir} to \${outputDir}\`);
            console.log(\`Pattern: \${pattern}\n\`);

            const files = await this.findFiles(sourceDir, pattern);
            
            if (files.length === 0) {
                return {
                    success: true,
                    output: \`No files found matching pattern: \${pattern}\`
                };
            }

            console.log(\`Found \${files.length} files\n\`);

            const results = {
                processed: 0,
                skipped: 0,
                errors: 0,
                totalSize: 0
            };

            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                const progress = Math.round(((i + 1) / files.length) * 100);
                
                try {
                    await this.processFile(file, sourceDir, outputDir, flags);
                    results.processed++;
                    
                    console.log(\`[\${progress}%] ✓ \${file}\`);
                } catch (error) {
                    results.errors++;
                    console.error(\`[\${progress}%] ✗ \${file}: \${error.message}\`);
                }
            }

            console.log(\`\n\nProcessing complete!\`);
            console.log(\`  Processed: \${results.processed}\`);
            console.log(\`  Errors: \${results.errors}\`);

            return {
                success: results.errors === 0,
                output: \`Processed \${results.processed} files with \${results.errors} errors\`,
                data: results
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    async analyze(params) {
        const { args, flags } = params;
        const sourceDir = args[0] || './src';
        const pattern = flags.pattern || '**/*.js';

        try {
            console.log(\`Analyzing files in \${sourceDir}\`);
            console.log(\`Pattern: \${pattern}\n\`);

            const files = await this.findFiles(sourceDir, pattern);
            
            if (files.length === 0) {
                return {
                    success: true,
                    output: \`No files found matching pattern: \${pattern}\`
                };
            }

            const analysis = {
                totalFiles: files.length,
                totalLines: 0,
                totalSize: 0,
                fileTypes: {},
                largestFiles: []
            };

            for (const file of files) {
                const filePath = path.join(sourceDir, file);
                const content = await this.sdk.requestFileRead({ path: filePath });
                const lines = content.split('\\n').length;
                const size = Buffer.byteLength(content, 'utf8');
                
                analysis.totalLines += lines;
                analysis.totalSize += size;

                const ext = path.extname(file) || 'no-extension';
                analysis.fileTypes[ext] = (analysis.fileTypes[ext] || 0) + 1;

                analysis.largestFiles.push({ file, lines, size });
            }

            analysis.largestFiles.sort((a, b) => b.size - a.size);
            analysis.largestFiles = analysis.largestFiles.slice(0, 10);

            const output = [
                \`Analysis Results:\`,
                \`\`,
                \`Total Files: \${analysis.totalFiles}\`,
                \`Total Lines: \${analysis.totalLines}\`,
                \`Total Size: \${this.formatBytes(analysis.totalSize)}\`,
                \`\`,
                \`File Types:\`,
                ...Object.entries(analysis.fileTypes).map(([ext, count]) => \`  \${ext}: \${count}\`),
                \`\`,
                \`Largest Files:\`,
                ...analysis.largestFiles.map(f => \`  \${f.file}: \${f.lines} lines, \${this.formatBytes(f.size)}\`)
            ].join('\\n');

            if (flags.report) {
                const reportPath = path.join(sourceDir, 'analysis-report.json');
                await this.sdk.requestFileWrite({
                    path: reportPath,
                    content: JSON.stringify(analysis, null, 2)
                });
                
                return {
                    success: true,
                    output: output + \`\\n\\nReport saved to: \${reportPath}\`
                };
            }

            return {
                success: true,
                output
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    async findFiles(sourceDir, pattern) {
        // In real implementation, use SDK to list directory recursively
        // For now, use simple directory read
        const files = [];
        await this.walkDirectory(sourceDir, '', pattern, files);
        return files;
    }

    async walkDirectory(baseDir, currentPath, pattern, files) {
        try {
            const fullPath = path.join(baseDir, currentPath);
            const entries = await this.sdk.requestFileReadDir({ path: fullPath });

            for (const entry of entries) {
                const entryPath = currentPath ? path.join(currentPath, entry) : entry;
                const fullEntryPath = path.join(baseDir, entryPath);

                try {
                    // Check if it's a file by trying to read it
                    const isFile = !entry.includes('/') && entry.includes('.');
                    
                    if (isFile && this.matchesPattern(entry, pattern)) {
                        files.push(entryPath);
                    }
                } catch (error) {
                    // Might be a directory, try to walk it
                    try {
                        await this.walkDirectory(baseDir, entryPath, pattern, files);
                    } catch (e) {
                        // Skip inaccessible directories
                    }
                }
            }
        } catch (error) {
            // Skip errors for inaccessible directories
        }
    }

    matchesPattern(filename, pattern) {
        const regex = new RegExp(pattern.replace(/\*/g, '.*').replace(/\?/g, '.'));
        return regex.test(filename);
    }

    async processFile(file, sourceDir, outputDir, flags) {
        const sourcePath = path.join(sourceDir, file);
        const outputPath = path.join(outputDir, file);

        const content = await this.sdk.requestFileRead({ path: sourcePath });
        const transformed = this.transform(content, flags);

        await this.sdk.requestFileWrite({
            path: outputPath,
            content: transformed
        });
    }

    transform(content, flags) {
        let result = content;

        if (flags.transform === 'minify') {
            result = result
                .split('\\n')
                .map(line => line.trim())
                .filter(line => line && !line.startsWith('//'))
                .join('\\n');
        }

        if (flags.transform === 'uppercase') {
            result = result.toUpperCase();
        }

        if (flags.transform === 'lowercase') {
            result = result.toLowerCase();
        }

        if (flags.header) {
            const header = \`// Processed by \${this.context?.name || 'File Processor'}\\n// Date: \${new Date().toISOString()}\\n\\n\`;
            result = header + result;
        }

        return result;
    }

    formatBytes(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
    }

    async cleanup() {
        console.log('${data.name} cleanup');
    }
}

module.exports = ${className};
`;

        this.writeFile(outputDir, 'index.js', content);
    }

    _generateTestFile(outputDir, data) {
        const className = this._toPascalCase(data.id);
        
        const content = `const Extension = require('../index');

describe('${data.name}', () => {
    let extension;

    beforeEach(() => {
        extension = new Extension();
    });

    it('should initialize', async () => {
        await extension.init({ name: '${data.name}' });
        expect(extension.context).toBeDefined();
    });

    it('should match patterns correctly', () => {
        expect(extension.matchesPattern('test.js', '*.js')).toBe(true);
        expect(extension.matchesPattern('test.txt', '*.js')).toBe(false);
        expect(extension.matchesPattern('test.min.js', '*.min.js')).toBe(true);
    });

    it('should transform content with minify', () => {
        const input = \`// Comment
const x = 1;

// Another comment
const y = 2;\`;
        
        const result = extension.transform(input, { transform: 'minify' });
        expect(result).not.toContain('//');
    });

    it('should add header when requested', () => {
        const input = 'const x = 1;';
        const result = extension.transform(input, { header: true });
        expect(result).toContain('// Processed by');
        expect(result).toContain('const x = 1;');
    });

    it('should format bytes correctly', () => {
        expect(extension.formatBytes(0)).toBe('0 Bytes');
        expect(extension.formatBytes(1024)).toBe('1 KB');
        expect(extension.formatBytes(1048576)).toBe('1 MB');
    });
});
`;

        const testDir = this.createDir(outputDir, 'test');
        this.writeFile(testDir, 'index.test.js', content);
    }

    _generateReadme(outputDir, data, processType) {
        const readme = `# ${data.name}

${data.description}

## Features

- Batch file processing with progress tracking
- Pattern-based file selection
- Multiple transformation options
- File analysis and reporting
- Error handling and recovery

## Installation

\`\`\`bash
npm install
ghost extension install .
\`\`\`

## Usage

### Process Files

Transform files from source to destination:

\`\`\`bash
# Basic usage
ghost process src dist

# With pattern
ghost process src dist --pattern "*.js"

# With transformation
ghost process src dist --transform minify

# Add header to files
ghost process src dist --header
\`\`\`

### Analyze Files

Analyze source files and generate reports:

\`\`\`bash
# Basic analysis
ghost analyze src

# With pattern
ghost analyze src --pattern "*.js"

# Generate JSON report
ghost analyze src --report
\`\`\`

## Transformations

Available transformations:

- \`minify\` - Remove comments and extra whitespace
- \`uppercase\` - Convert content to uppercase
- \`lowercase\` - Convert content to lowercase

## Testing

\`\`\`bash
npm test
npm run test:watch
npm run test:coverage
\`\`\`

## License

MIT
`;

        this.writeFile(outputDir, 'README.md', readme);
    }
}

module.exports = FileProcessorTemplate;
