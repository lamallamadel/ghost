# Ghost Extension Examples

Complete working examples demonstrating various extension patterns.

## Table of Contents

- [Hello World Extension](#hello-world-extension)
- [File Processor Extension](#file-processor-extension)
- [API Integration Extension](#api-integration-extension)
- [Git Helper Extension](#git-helper-extension)
- [Multi-Command Extension](#multi-command-extension)

## Hello World Extension

A minimal extension to get started.

### manifest.json

```json
{
  "id": "hello-world",
  "name": "Hello World Extension",
  "version": "1.0.0",
  "description": "A simple hello world extension",
  "author": "Your Name",
  "main": "index.js",
  "capabilities": {
    "filesystem": {
      "read": ["**/*"],
      "write": []
    },
    "git": {
      "read": false,
      "write": false
    }
  },
  "permissions": [
    "filesystem:read"
  ]
}
```

### index.js

```javascript
const { ExtensionSDK } = require('@ghost/extension-sdk');

class HelloWorldExtension {
    constructor() {
        this.sdk = new ExtensionSDK('hello-world');
    }

    async initialize() {
        console.log('Hello World Extension initialized');
    }

    async hello(params) {
        const { args, flags } = params;
        const name = args[0] || 'World';

        return {
            success: true,
            output: `Hello, ${name}!`
        };
    }

    async shutdown() {
        console.log('Hello World Extension shutting down');
    }
}

module.exports = HelloWorldExtension;
```

### Usage

```bash
ghost extension install .
ghost hello Alice
# Output: Hello, Alice!
```

## File Processor Extension

Read, transform, and write files.

### manifest.json

```json
{
  "id": "file-processor",
  "name": "File Processor Extension",
  "version": "1.0.0",
  "description": "Process and transform files",
  "author": "Your Name",
  "main": "index.js",
  "capabilities": {
    "filesystem": {
      "read": ["src/**/*.js", "*.json"],
      "write": ["dist/**"]
    }
  },
  "permissions": [
    "filesystem:read",
    "filesystem:write"
  ]
}
```

### index.js

```javascript
const { ExtensionSDK } = require('@ghost/extension-sdk');

class FileProcessorExtension {
    constructor() {
        this.sdk = new ExtensionSDK('file-processor');
    }

    async initialize() {
        console.log('File Processor initialized');
    }

    async process(params) {
        const { args, flags } = params;
        const sourceDir = args[0] || './src';
        const outputDir = args[1] || './dist';

        try {
            // Read source directory
            const files = await this.sdk.requestFileReadDir({
                path: sourceDir
            });

            console.log(`Found ${files.length} files in ${sourceDir}`);

            let processed = 0;

            // Process each JavaScript file
            for (const file of files) {
                if (!file.endsWith('.js')) continue;

                const sourcePath = `${sourceDir}/${file}`;
                const content = await this.sdk.requestFileRead({
                    path: sourcePath
                });

                // Transform content
                const transformed = this.transform(content, flags);

                // Write to output
                const outputPath = `${outputDir}/${file}`;
                await this.sdk.requestFileWrite({
                    path: outputPath,
                    content: transformed
                });

                processed++;
                console.log(`Processed: ${file}`);
            }

            return {
                success: true,
                output: `Processed ${processed} files from ${sourceDir} to ${outputDir}`
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    transform(content, flags) {
        let result = content;

        // Add header comment
        if (flags.header) {
            result = `// Processed by File Processor\n${result}`;
        }

        // Minify (simple example)
        if (flags.minify) {
            result = result
                .split('\n')
                .map(line => line.trim())
                .filter(line => line && !line.startsWith('//'))
                .join('\n');
        }

        return result;
    }

    async shutdown() {
        console.log('File Processor shutting down');
    }
}

module.exports = FileProcessorExtension;
```

### Usage

```bash
ghost process src dist
ghost process src dist --minify
ghost process src dist --header
```

## API Integration Extension

Make HTTP requests to external APIs.

### manifest.json

```json
{
  "id": "github-api",
  "name": "GitHub API Extension",
  "version": "1.0.0",
  "description": "Interact with GitHub API",
  "author": "Your Name",
  "main": "index.js",
  "capabilities": {
    "network": {
      "allowlist": [
        "https://api.github.com"
      ],
      "rateLimit": {
        "cir": 60,
        "bc": 100
      }
    }
  },
  "permissions": [
    "network:https"
  ]
}
```

### index.js

```javascript
const { ExtensionSDK } = require('@ghost/extension-sdk');

class GitHubExtension {
    constructor() {
        this.sdk = new ExtensionSDK('github-api');
        this.apiBase = 'https://api.github.com';
    }

    async initialize() {
        console.log('GitHub Extension initialized');
    }

    async repos(params) {
        const { args, flags } = params;
        const username = args[0];

        if (!username) {
            return {
                success: false,
                error: 'Username required: ghost repos <username>'
            };
        }

        try {
            const response = await this.sdk.requestNetworkCall({
                url: `${this.apiBase}/users/${username}/repos`,
                method: 'GET',
                headers: {
                    'Accept': 'application/vnd.github.v3+json',
                    'User-Agent': 'Ghost-CLI-Extension'
                }
            });

            const repos = JSON.parse(response);

            if (flags.json) {
                return {
                    success: true,
                    output: JSON.stringify(repos, null, 2)
                };
            }

            const output = repos
                .slice(0, flags.limit || 10)
                .map(repo => `${repo.name} - ${repo.description || 'No description'}\n  Stars: ${repo.stargazers_count} | Forks: ${repo.forks_count}`)
                .join('\n\n');

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

    async issue(params) {
        const { args, flags } = params;
        const [owner, repo, title, ...bodyParts] = args;
        const body = bodyParts.join(' ');

        if (!owner || !repo || !title) {
            return {
                success: false,
                error: 'Usage: ghost issue <owner> <repo> <title> [body]'
            };
        }

        const token = process.env.GITHUB_TOKEN;
        if (!token) {
            return {
                success: false,
                error: 'GITHUB_TOKEN environment variable required'
            };
        }

        try {
            const response = await this.sdk.requestNetworkCall({
                url: `${this.apiBase}/repos/${owner}/${repo}/issues`,
                method: 'POST',
                headers: {
                    'Accept': 'application/vnd.github.v3+json',
                    'Authorization': `token ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ title, body })
            });

            const issue = JSON.parse(response);

            return {
                success: true,
                output: `Created issue #${issue.number}: ${issue.html_url}`
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    async shutdown() {
        console.log('GitHub Extension shutting down');
    }
}

module.exports = GitHubExtension;
```

### Usage

```bash
# List repositories
ghost repos octocat

# Create an issue
export GITHUB_TOKEN=your_token_here
ghost issue owner repo "Bug title" "Bug description"
```

## Git Helper Extension

Work with git operations.

### manifest.json

```json
{
  "id": "git-helper",
  "name": "Git Helper Extension",
  "version": "1.0.0",
  "description": "Helper utilities for git operations",
  "author": "Your Name",
  "main": "index.js",
  "capabilities": {
    "git": {
      "read": true,
      "write": false
    },
    "filesystem": {
      "read": ["**/*"],
      "write": []
    }
  },
  "permissions": [
    "git:read",
    "filesystem:read"
  ]
}
```

### index.js

```javascript
const { ExtensionSDK } = require('@ghost/extension-sdk');

class GitHelperExtension {
    constructor() {
        this.sdk = new ExtensionSDK('git-helper');
    }

    async initialize() {
        console.log('Git Helper initialized');
    }

    async summary(params) {
        try {
            // Get status
            const status = await this.sdk.requestGitStatus(['--short']);

            // Get recent commits
            const log = await this.sdk.requestGitLog(['--oneline', '-5']);

            // Get current branch
            const branch = await this.sdk.requestGitExec({
                operation: 'branch',
                args: ['--show-current']
            });

            // Analyze changes
            let diff = '';
            if (!status.includes('nothing to commit')) {
                diff = await this.sdk.requestGitDiff();
            }

            const analysis = this.analyzeDiff(diff);

            const output = [
                `Branch: ${branch.trim()}`,
                '',
                'Status:',
                status || 'Nothing to commit, working tree clean',
                '',
                'Recent commits:',
                log,
                ''
            ];

            if (analysis.files > 0) {
                output.push('Changes:');
                output.push(`  Files: ${analysis.files}`);
                output.push(`  Additions: ${analysis.additions}`);
                output.push(`  Deletions: ${analysis.deletions}`);
            }

            return {
                success: true,
                output: output.join('\n')
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    async stats(params) {
        const { args } = params;
        const author = args[0];

        try {
            let logArgs = ['--pretty=format:%h|%an|%s|%ar', '-100'];
            if (author) {
                logArgs.push(`--author=${author}`);
            }

            const log = await this.sdk.requestGitLog(logArgs);
            const commits = log.split('\n').filter(l => l.trim());

            const stats = {
                total: commits.length,
                authors: {},
                recentDays: {}
            };

            commits.forEach(commit => {
                const [hash, author, message, time] = commit.split('|');
                
                stats.authors[author] = (stats.authors[author] || 0) + 1;
                
                const dayKey = time.includes('day') ? time.split(' ')[0] : 'today';
                stats.recentDays[dayKey] = (stats.recentDays[dayKey] || 0) + 1;
            });

            const output = [
                `Git Statistics (last ${commits.length} commits)`,
                '',
                'By Author:',
                ...Object.entries(stats.authors)
                    .sort((a, b) => b[1] - a[1])
                    .map(([author, count]) => `  ${author}: ${count}`),
                '',
                'By Time:',
                ...Object.entries(stats.recentDays)
                    .map(([day, count]) => `  ${day}: ${count}`)
            ];

            return {
                success: true,
                output: output.join('\n')
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    analyzeDiff(diff) {
        if (!diff) {
            return { additions: 0, deletions: 0, files: 0 };
        }

        const lines = diff.split('\n');
        return {
            additions: lines.filter(l => l.startsWith('+')).length,
            deletions: lines.filter(l => l.startsWith('-')).length,
            files: lines.filter(l => l.startsWith('diff --git')).length
        };
    }

    async shutdown() {
        console.log('Git Helper shutting down');
    }
}

module.exports = GitHelperExtension;
```

### Usage

```bash
# Show git summary
ghost summary

# Show commit statistics
ghost stats
ghost stats "John Doe"
```

## Multi-Command Extension

Extension with multiple related commands.

### manifest.json

```json
{
  "id": "devtools",
  "name": "Developer Tools Extension",
  "version": "1.0.0",
  "description": "Collection of developer utilities",
  "author": "Your Name",
  "main": "index.js",
  "capabilities": {
    "filesystem": {
      "read": ["**/*"],
      "write": ["logs/**"]
    },
    "git": {
      "read": true,
      "write": false
    }
  },
  "permissions": [
    "filesystem:read",
    "filesystem:write",
    "git:read"
  ]
}
```

### index.js

```javascript
const { ExtensionSDK } = require('@ghost/extension-sdk');

class DevToolsExtension {
    constructor() {
        this.sdk = new ExtensionSDK('devtools');
    }

    async initialize() {
        console.log('Developer Tools initialized');
    }

    // Count lines of code
    async loc(params) {
        const { args } = params;
        const dir = args[0] || './src';

        try {
            const files = await this.sdk.requestFileReadDir({ path: dir });
            
            let totalLines = 0;
            const fileStats = [];

            for (const file of files) {
                if (!this.isCodeFile(file)) continue;

                const content = await this.sdk.requestFileRead({
                    path: `${dir}/${file}`
                });

                const lines = content.split('\n').length;
                totalLines += lines;
                fileStats.push({ file, lines });
            }

            fileStats.sort((a, b) => b.lines - a.lines);

            const output = [
                `Lines of Code in ${dir}:`,
                '',
                ...fileStats.map(s => `  ${s.file}: ${s.lines}`),
                '',
                `Total: ${totalLines} lines`
            ];

            return {
                success: true,
                output: output.join('\n')
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Find TODOs in code
    async todos(params) {
        const { args } = params;
        const dir = args[0] || './src';

        try {
            const files = await this.sdk.requestFileReadDir({ path: dir });
            const todos = [];

            for (const file of files) {
                if (!this.isCodeFile(file)) continue;

                const content = await this.sdk.requestFileRead({
                    path: `${dir}/${file}`
                });

                const lines = content.split('\n');
                lines.forEach((line, index) => {
                    if (line.includes('TODO') || line.includes('FIXME')) {
                        todos.push({
                            file,
                            line: index + 1,
                            text: line.trim()
                        });
                    }
                });
            }

            if (todos.length === 0) {
                return {
                    success: true,
                    output: 'No TODOs found'
                };
            }

            const output = [
                `Found ${todos.length} TODOs in ${dir}:`,
                '',
                ...todos.map(t => `${t.file}:${t.line} - ${t.text}`)
            ];

            return {
                success: true,
                output: output.join('\n')
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Generate project report
    async report(params) {
        try {
            // Get git info
            const branch = await this.sdk.requestGitExec({
                operation: 'branch',
                args: ['--show-current']
            });

            const commits = await this.sdk.requestGitLog(['--oneline', '-10']);

            // Get file info
            const files = await this.sdk.requestFileReadDir({ path: '.' });

            const report = {
                timestamp: new Date().toISOString(),
                branch: branch.trim(),
                files: files.length,
                recentCommits: commits.split('\n').length
            };

            // Write report
            const reportPath = `./logs/report-${Date.now()}.json`;
            await this.sdk.requestFileWrite({
                path: reportPath,
                content: JSON.stringify(report, null, 2)
            });

            return {
                success: true,
                output: `Report generated: ${reportPath}`
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    isCodeFile(filename) {
        const codeExtensions = ['.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.go', '.rs'];
        return codeExtensions.some(ext => filename.endsWith(ext));
    }

    async shutdown() {
        console.log('Developer Tools shutting down');
    }
}

module.exports = DevToolsExtension;
```

### Usage

```bash
# Count lines of code
ghost loc src

# Find TODOs
ghost todos src

# Generate report
ghost report
```

## Next Steps

1. Study these examples
2. Create your own extension with `ghost extension init`
3. Implement your custom logic
4. Test with `ghost extension validate`
5. Install with `ghost extension install .`

## Resources

- [Extension API Documentation](./extension-api.md)
- [@ghost/extension-sdk](../packages/extension-sdk/README.md)
- [Manifest Reference](../core/MANIFEST_REFERENCE.md)
