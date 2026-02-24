#!/usr/bin/env node

const ExtensionWrapper = require('./extension-wrapper');

class SampleSubprocessExtension {
    constructor() {
        this.name = 'Sample Subprocess Extension';
        this.config = {};
    }

    async init(config) {
        this.config = config || {};
        return { initialized: true };
    }

    async analyzeCode(params) {
        const { filePath, content } = params;
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

    async onPreCommit(params) {
        const { stagedFiles } = params;
        const results = [];
        
        for (const file of stagedFiles) {
            if (file.endsWith('.js') || file.endsWith('.ts')) {
                try {
                    const fs = require('fs');
                    const content = fs.readFileSync(file, 'utf8');
                    const result = await this.analyzeCode({ filePath: file, content });
                    results.push(result);
                } catch (error) {
                    results.push({
                        file,
                        error: error.message,
                        passed: false
                    });
                }
            }
        }

        const totalIssues = results.reduce((sum, r) => sum + (r.issues?.length || 0), 0);
        const hasErrors = results.some(r => !r.passed);

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

    async onCommitMsg(params) {
        const { message } = params;
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
        return { cleaned: true };
    }
}

if (process.env.GHOST_EXTENSION_MODE === 'subprocess') {
    const extension = new SampleSubprocessExtension();
    const wrapper = new ExtensionWrapper(extension);
    wrapper.start();
} else {
    module.exports = SampleSubprocessExtension;
}
