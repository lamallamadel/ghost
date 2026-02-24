class SampleAnalyzer {
    constructor() {
        this.name = 'Sample Analyzer';
        this.config = {};
    }

    async init(config) {
        this.config = config || {};
        console.log(`[${this.name}] Initialized with config:`, this.config);
    }

    async analyzeCode(filePath, content) {
        const lines = content.split('\n');
        const issues = [];

        const maxLineLength = this.config?.rules?.maxLineLength || 120;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            
            if (line.length > maxLineLength) {
                issues.push({
                    line: i + 1,
                    severity: 'warning',
                    message: `Line exceeds maximum length of ${maxLineLength} characters`,
                    length: line.length
                });
            }

            if (line.includes('TODO') || line.includes('FIXME')) {
                issues.push({
                    line: i + 1,
                    severity: 'info',
                    message: 'Contains TODO/FIXME comment',
                    content: line.trim()
                });
            }
        }

        return {
            file: filePath,
            totalLines: lines.length,
            issues: issues,
            passed: issues.filter(i => i.severity === 'error').length === 0
        };
    }

    async onPreCommit(stagedFiles) {
        console.log(`[${this.name}] Running pre-commit analysis on ${stagedFiles.length} files`);
        
        const results = [];
        
        for (const file of stagedFiles) {
            if (file.endsWith('.js') || file.endsWith('.ts')) {
                try {
                    const fs = require('fs');
                    const content = fs.readFileSync(file, 'utf8');
                    const result = await this.analyzeCode(file, content);
                    results.push(result);
                } catch (error) {
                    console.error(`[${this.name}] Failed to analyze ${file}:`, error.message);
                }
            }
        }

        const totalIssues = results.reduce((sum, r) => sum + r.issues.length, 0);
        const hasErrors = results.some(r => !r.passed);

        if (totalIssues > 0) {
            console.log(`[${this.name}] Found ${totalIssues} issue(s)`);
            results.forEach(r => {
                if (r.issues.length > 0) {
                    console.log(`  ${r.file}:`);
                    r.issues.forEach(issue => {
                        console.log(`    Line ${issue.line} [${issue.severity}]: ${issue.message}`);
                    });
                }
            });
        }

        return {
            success: !hasErrors,
            results: results,
            summary: {
                totalFiles: results.length,
                totalIssues: totalIssues,
                errors: results.filter(r => !r.passed).length
            }
        };
    }

    async onCommitMsg(message) {
        console.log(`[${this.name}] Validating commit message`);

        const conventionalPattern = /^(feat|fix|docs|style|refactor|test|chore)(\(.+\))?: .+/;
        
        if (!conventionalPattern.test(message)) {
            return {
                success: false,
                message: 'Commit message does not follow Conventional Commits format'
            };
        }

        return {
            success: true,
            message: 'Commit message is valid'
        };
    }

    cleanup() {
        console.log(`[${this.name}] Cleaning up resources`);
    }
}

module.exports = SampleAnalyzer;
