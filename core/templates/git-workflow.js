const BaseTemplate = require('./base-template');

class GitWorkflowTemplate extends BaseTemplate {
    constructor() {
        super({
            id: 'git-workflow',
            name: 'Git Workflow',
            description: 'Git commit hooks and validation automation',
            category: 'Git',
            features: ['Commit hooks', 'Message validation', 'Pre-commit checks', 'Branch policies'],
            prompts: [
                { key: 'enablePreCommit', question: 'Enable pre-commit validation (yes/no): ', default: 'yes' },
                { key: 'enableCommitMsg', question: 'Enable commit message validation (yes/no): ', default: 'yes' },
                { key: 'conventionalCommits', question: 'Enforce conventional commits (yes/no): ', default: 'yes' }
            ],
            setup: [
                'npm install',
                'ghost extension install .',
                'Extension will automatically register git hooks'
            ],
            usage: [
                'git commit -m "feat: add new feature"',
                'ghost git-check',
                'ghost git-lint'
            ]
        });
    }

    async generate(outputDir, data) {
        const enablePreCommit = data.enablePreCommit === 'yes';
        const enableCommitMsg = data.enableCommitMsg === 'yes';
        const conventionalCommits = data.conventionalCommits === 'yes';

        this._generateManifest(outputDir, data, enablePreCommit, enableCommitMsg);
        this._generatePackageJson(outputDir, data);
        this._generateMainFile(outputDir, data, enablePreCommit, enableCommitMsg, conventionalCommits);
        this._generateValidators(outputDir, data, conventionalCommits);
        this._generateTestFile(outputDir, data);
        this._generateReadme(outputDir, data, enablePreCommit, enableCommitMsg, conventionalCommits);
        this.writeFile(outputDir, '.gitignore', this._generateGitignore());
    }

    _generateManifest(outputDir, data, enablePreCommit, enableCommitMsg) {
        const hooks = {};
        
        if (enablePreCommit) {
            hooks['pre-commit'] = {
                handler: 'onPreCommit',
                description: 'Validates code before commit'
            };
        }

        if (enableCommitMsg) {
            hooks['commit-msg'] = {
                handler: 'onCommitMsg',
                description: 'Validates commit message format'
            };
        }

        const manifest = {
            id: data.id,
            name: data.name,
            version: data.version,
            description: data.description,
            author: data.author,
            main: 'index.js',
            capabilities: {
                git: {
                    read: true,
                    write: false
                },
                filesystem: {
                    read: ['**/*'],
                    write: []
                },
                hooks
            },
            commands: ['git-check', 'git-lint', 'git-validate']
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
                'chalk': '^5.3.0'
            },
            devDependencies: {
                jest: '^29.0.0'
            }
        };

        this.writeFile(outputDir, 'package.json', JSON.stringify(packageJson, null, 2));
    }

    _generateMainFile(outputDir, data, enablePreCommit, enableCommitMsg, conventionalCommits) {
        const className = this._toPascalCase(data.id);
        
        const content = `const { ExtensionSDK } = require('@ghost/extension-sdk');
const { validateCommitMessage, validateFiles, checkBranchName } = require('./validators');

class ${className} {
    constructor() {
        this.sdk = new ExtensionSDK('${data.id}');
        this.config = {
            enablePreCommit: ${enablePreCommit},
            enableCommitMsg: ${enableCommitMsg},
            conventionalCommits: ${conventionalCommits}
        };
    }

    async init(context) {
        console.log('${data.name} initialized');
        this.context = context;
    }

    ${enablePreCommit ? `
    async onPreCommit(params) {
        console.log('Running pre-commit validation...');

        try {
            const status = await this.sdk.requestGitExec({
                command: 'status',
                args: ['--porcelain']
            });

            const stagedFiles = status.stdout
                .split('\\n')
                .filter(line => line.startsWith('A ') || line.startsWith('M '))
                .map(line => line.substring(3).trim())
                .filter(Boolean);

            if (stagedFiles.length === 0) {
                return {
                    success: true,
                    output: 'No staged files to validate'
                };
            }

            console.log(\`Validating \${stagedFiles.length} staged files...\`);

            const validationResult = await validateFiles(this.sdk, stagedFiles);

            if (!validationResult.success) {
                console.error('\\nPre-commit validation failed:');
                validationResult.errors.forEach(error => {
                    console.error(\`  ✗ \${error}\`);
                });

                return {
                    success: false,
                    error: 'Pre-commit validation failed. Fix the errors and try again.',
                    violations: validationResult.errors
                };
            }

            console.log('✓ Pre-commit validation passed');
            return {
                success: true,
                output: 'Pre-commit validation passed'
            };
        } catch (error) {
            return {
                success: false,
                error: \`Pre-commit validation error: \${error.message}\`
            };
        }
    }
    ` : ''}

    ${enableCommitMsg ? `
    async onCommitMsg(params) {
        const { commitMessage } = params;

        console.log('Validating commit message...');

        const validationResult = validateCommitMessage(
            commitMessage,
            this.config.conventionalCommits
        );

        if (!validationResult.success) {
            console.error('\\nCommit message validation failed:');
            console.error(\`  ✗ \${validationResult.error}\`);
            
            if (this.config.conventionalCommits) {
                console.error('\\nExpected format: <type>(<scope>): <subject>');
                console.error('Types: feat, fix, docs, style, refactor, test, chore');
                console.error('Example: feat(api): add user authentication');
            }

            return {
                success: false,
                error: validationResult.error
            };
        }

        console.log('✓ Commit message validation passed');
        return {
            success: true,
            output: 'Commit message validation passed'
        };
    }
    ` : ''}

    async gitCheck(params) {
        try {
            console.log('Running comprehensive git checks...\\n');

            const checks = {
                branch: await this.checkBranch(),
                status: await this.checkStatus(),
                conflicts: await this.checkConflicts()
            };

            const allPassed = Object.values(checks).every(c => c.success);

            console.log('\\nGit Check Summary:');
            Object.entries(checks).forEach(([name, result]) => {
                const symbol = result.success ? '✓' : '✗';
                console.log(\`  \${symbol} \${name}: \${result.message}\`);
            });

            return {
                success: allPassed,
                output: allPassed ? 'All checks passed' : 'Some checks failed',
                data: checks
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    async gitLint(params) {
        try {
            console.log('Linting git repository...\\n');

            const log = await this.sdk.requestGitExec({
                command: 'log',
                args: ['--format=%H|%s', '-n', '20']
            });

            const commits = log.stdout
                .split('\\n')
                .filter(Boolean)
                .map(line => {
                    const [hash, message] = line.split('|');
                    return { hash, message };
                });

            const issues = [];

            commits.forEach(commit => {
                const validation = validateCommitMessage(commit.message, this.config.conventionalCommits);
                if (!validation.success) {
                    issues.push({
                        hash: commit.hash.substring(0, 7),
                        message: commit.message,
                        error: validation.error
                    });
                }
            });

            if (issues.length > 0) {
                console.log(\`Found \${issues.length} commits with invalid messages:\\n\`);
                issues.forEach(issue => {
                    console.log(\`  [\${issue.hash}] \${issue.message}\`);
                    console.log(\`    ✗ \${issue.error}\`);
                });
            } else {
                console.log('✓ All recent commits follow the commit message convention');
            }

            return {
                success: issues.length === 0,
                output: \`Checked \${commits.length} commits, found \${issues.length} issues\`,
                data: { total: commits.length, issues }
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    async gitValidate(params) {
        const { args, flags } = params;
        const target = args[0] || 'HEAD';

        try {
            const diff = await this.sdk.requestGitExec({
                command: 'diff',
                args: ['--name-only', target]
            });

            const files = diff.stdout.split('\\n').filter(Boolean);

            if (files.length === 0) {
                return {
                    success: true,
                    output: 'No files to validate'
                };
            }

            const validationResult = await validateFiles(this.sdk, files);

            return {
                success: validationResult.success,
                output: validationResult.success 
                    ? \`Validated \${files.length} files successfully\`
                    : \`Validation failed for \${validationResult.errors.length} files\`,
                data: validationResult
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    async checkBranch() {
        try {
            const branch = await this.sdk.requestGitExec({
                command: 'rev-parse',
                args: ['--abbrev-ref', 'HEAD']
            });

            const branchName = branch.stdout.trim();
            const validation = checkBranchName(branchName);

            return {
                success: validation.success,
                message: validation.success 
                    ? \`Branch name '\${branchName}' is valid\`
                    : validation.error
            };
        } catch (error) {
            return {
                success: false,
                message: error.message
            };
        }
    }

    async checkStatus() {
        try {
            const status = await this.sdk.requestGitExec({
                command: 'status',
                args: ['--porcelain']
            });

            const hasUncommitted = status.stdout.trim().length > 0;

            return {
                success: true,
                message: hasUncommitted 
                    ? 'Working directory has uncommitted changes'
                    : 'Working directory is clean'
            };
        } catch (error) {
            return {
                success: false,
                message: error.message
            };
        }
    }

    async checkConflicts() {
        try {
            const status = await this.sdk.requestGitExec({
                command: 'diff',
                args: ['--name-only', '--diff-filter=U']
            });

            const conflicts = status.stdout.trim();
            const hasConflicts = conflicts.length > 0;

            return {
                success: !hasConflicts,
                message: hasConflicts 
                    ? \`Merge conflicts detected in \${conflicts.split('\\n').length} files\`
                    : 'No merge conflicts'
            };
        } catch (error) {
            return {
                success: false,
                message: error.message
            };
        }
    }

    async cleanup() {
        console.log('${data.name} cleanup');
    }
}

module.exports = ${className};
`;

        this.writeFile(outputDir, 'index.js', content);
    }

    _generateValidators(outputDir, data, conventionalCommits) {
        const content = `
function validateCommitMessage(message, useConventionalCommits = true) {
    if (!message || message.trim().length === 0) {
        return {
            success: false,
            error: 'Commit message cannot be empty'
        };
    }

    const trimmedMessage = message.trim();

    if (trimmedMessage.length < 10) {
        return {
            success: false,
            error: 'Commit message too short (minimum 10 characters)'
        };
    }

    if (useConventionalCommits) {
        const conventionalRegex = /^(feat|fix|docs|style|refactor|perf|test|chore|build|ci|revert)(\\([a-z0-9-]+\\))?:\\s.+/;
        
        if (!conventionalRegex.test(trimmedMessage)) {
            return {
                success: false,
                error: 'Commit message does not follow conventional commits format'
            };
        }
    }

    return { success: true };
}

async function validateFiles(sdk, files) {
    const errors = [];

    for (const file of files) {
        try {
            const content = await sdk.requestFileRead({ path: file });

            if (file.endsWith('.js') || file.endsWith('.ts')) {
                if (content.includes('console.log') && !file.includes('test')) {
                    errors.push(\`\${file}: Contains console.log statements\`);
                }

                if (content.includes('debugger')) {
                    errors.push(\`\${file}: Contains debugger statements\`);
                }

                const trailingWhitespace = content.split('\\n').some(line => /\\s+$/.test(line));
                if (trailingWhitespace) {
                    errors.push(\`\${file}: Contains trailing whitespace\`);
                }
            }

            const lines = content.split('\\n');
            if (lines.length > 1000) {
                errors.push(\`\${file}: File too long (\${lines.length} lines, max 1000)\`);
            }
        } catch (error) {
        }
    }

    return {
        success: errors.length === 0,
        errors
    };
}

function checkBranchName(branchName) {
    if (branchName === 'master' || branchName === 'main') {
        return { success: true };
    }

    const validPattern = /^(feature|bugfix|hotfix|release)\\/[a-z0-9-]+$/;
    
    if (!validPattern.test(branchName)) {
        return {
            success: false,
            error: 'Branch name should follow pattern: feature|bugfix|hotfix|release/name'
        };
    }

    return { success: true };
}

module.exports = {
    validateCommitMessage,
    validateFiles,
    checkBranchName
};
`;

        this.writeFile(outputDir, 'validators.js', content);
    }

    _generateTestFile(outputDir, data) {
        const className = this._toPascalCase(data.id);
        
        const content = `const { validateCommitMessage, validateFiles, checkBranchName } = require('../validators');

describe('${data.name} Validators', () => {
    describe('validateCommitMessage', () => {
        it('should accept valid conventional commit', () => {
            const result = validateCommitMessage('feat: add new feature', true);
            expect(result.success).toBe(true);
        });

        it('should accept commit with scope', () => {
            const result = validateCommitMessage('fix(api): resolve auth issue', true);
            expect(result.success).toBe(true);
        });

        it('should reject empty message', () => {
            const result = validateCommitMessage('', true);
            expect(result.success).toBe(false);
            expect(result.error).toContain('empty');
        });

        it('should reject short message', () => {
            const result = validateCommitMessage('fix it', true);
            expect(result.success).toBe(false);
            expect(result.error).toContain('short');
        });

        it('should reject invalid conventional format', () => {
            const result = validateCommitMessage('added new feature', true);
            expect(result.success).toBe(false);
            expect(result.error).toContain('conventional');
        });

        it('should accept any message when conventional commits disabled', () => {
            const result = validateCommitMessage('added new feature', false);
            expect(result.success).toBe(true);
        });
    });

    describe('checkBranchName', () => {
        it('should accept main branch', () => {
            const result = checkBranchName('main');
            expect(result.success).toBe(true);
        });

        it('should accept master branch', () => {
            const result = checkBranchName('master');
            expect(result.success).toBe(true);
        });

        it('should accept valid feature branch', () => {
            const result = checkBranchName('feature/new-api');
            expect(result.success).toBe(true);
        });

        it('should accept valid bugfix branch', () => {
            const result = checkBranchName('bugfix/auth-issue');
            expect(result.success).toBe(true);
        });

        it('should reject invalid branch name', () => {
            const result = checkBranchName('my-random-branch');
            expect(result.success).toBe(false);
        });
    });
});
`;

        const testDir = this.createDir(outputDir, 'test');
        this.writeFile(testDir, 'validators.test.js', content);
    }

    _generateReadme(outputDir, data, enablePreCommit, enableCommitMsg, conventionalCommits) {
        const readme = `# ${data.name}

${data.description}

## Features

- ${enablePreCommit ? '✓' : '✗'} Pre-commit validation
- ${enableCommitMsg ? '✓' : '✗'} Commit message validation
- ${conventionalCommits ? '✓' : '✗'} Conventional commits enforcement
- Branch naming validation
- Git status checking
- Conflict detection

## Installation

\`\`\`bash
npm install
ghost extension install .
\`\`\`

The extension will automatically register git hooks when installed.

## Git Hooks

${enablePreCommit ? `### Pre-commit Hook

Runs before each commit to validate:

- No console.log statements in production code
- No debugger statements
- No trailing whitespace
- File size limits

` : ''}${enableCommitMsg ? `### Commit-msg Hook

Validates commit messages${conventionalCommits ? ' against conventional commits format' : ''}:

${conventionalCommits ? `Expected format: \`<type>(<scope>): <subject>\`

Valid types:
- \`feat\` - New feature
- \`fix\` - Bug fix
- \`docs\` - Documentation changes
- \`style\` - Code style changes
- \`refactor\` - Code refactoring
- \`test\` - Test additions/changes
- \`chore\` - Maintenance tasks

Examples:
\`\`\`bash
git commit -m "feat: add user authentication"
git commit -m "fix(api): resolve timeout issue"
git commit -m "docs: update installation guide"
\`\`\`
` : ''}
` : ''}

## Commands

### git-check

Run comprehensive git repository checks:

\`\`\`bash
ghost git-check
\`\`\`

Checks:
- Branch name validation
- Working directory status
- Merge conflicts

### git-lint

Lint recent commit messages:

\`\`\`bash
ghost git-lint
\`\`\`

Validates the last 20 commit messages against your conventions.

### git-validate

Validate specific files or commits:

\`\`\`bash
# Validate files changed since HEAD
ghost git-validate

# Validate files changed in specific commit
ghost git-validate HEAD~1
\`\`\`

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

module.exports = GitWorkflowTemplate;
