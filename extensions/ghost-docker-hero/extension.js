#!/usr/bin/env node

/**
 * Ghost Docker-Hero
 * Container optimization and security engine
 */

const { ExtensionSDK } = require('@ghost/extension-sdk');
const path = require('path');

const Colors = {
    GREEN: '\x1b[32m',
    CYAN: '\x1b[36m',
    BOLD: '\x1b[1m',
    WARNING: '\x1b[33m',
    FAIL: '\x1b[31m',
    ENDC: '\x1b[0m'
};

class DockerHeroExtension {
    constructor(sdk) {
        this.sdk = sdk;
    }

    async handleScan(params) {
        const target = params.args?.[0] || 'Dockerfile';
        await this.sdk.requestLog({ level: 'info', message: `Scanning Dockerfile: ${target}` });

        try {
            const content = await this.sdk.requestFileRead({ path: target });
            const issues = this._analyzeDockerfile(content);

            let output = `\n${Colors.BOLD}${Colors.CYAN}DOCKER-HERO SECURITY SCAN${Colors.ENDC}\n${'='.repeat(40)}\n`;
            
            if (issues.length === 0) {
                output += `${Colors.GREEN}✓ No major issues found in Dockerfile.${Colors.ENDC}\n`;
            } else {
                for (const issue of issues) {
                    const color = issue.severity === 'high' ? Colors.FAIL : Colors.WARNING;
                    output += `[${color}${issue.severity.toUpperCase()}${Colors.ENDC}] ${issue.rule}\n`;
                    output += `  ${issue.message}\n\n`;
                }
            }

            return { success: true, output, issues };
        } catch (error) {
            return { success: false, output: `Scan failed: ${error.message}` };
        }
    }

    _analyzeDockerfile(content) {
        const issues = [];
        const lines = content.split('\n');

        // 1. Check for USER root
        const userLine = lines.find(l => l.trim().startsWith('USER'));
        if (!userLine || userLine.includes('root')) {
            issues.push({
                rule: 'Non-root User',
                message: 'No non-root user detected. Containers should run as non-privileged users.',
                severity: 'high'
            });
        }

        // 2. Check for latest tag
        if (lines.some(l => l.trim().startsWith('FROM') && l.includes(':latest'))) {
            issues.push({
                rule: 'Pinned Base Image',
                message: 'Using ":latest" tag. It is better to use a specific version for builds reproducibility.',
                severity: 'medium'
            });
        }

        // 3. Check for multiple RUN commands (optimization)
        const runCount = lines.filter(l => l.trim().startsWith('RUN')).length;
        if (runCount > 3) {
            issues.push({
                rule: 'Layer Optimization',
                message: `Detected ${runCount} RUN instructions. Consider chaining them with '&&' to reduce layers.`,
                severity: 'medium'
            });
        }

        // 4. Secret detection in ENV/ARG
        const secretKeywords = ['PASSWORD', 'SECRET', 'TOKEN', 'KEY'];
        for (const line of lines) {
            if (line.trim().startsWith('ENV') || line.trim().startsWith('ARG')) {
                if (secretKeywords.some(k => line.toUpperCase().includes(k))) {
                    issues.push({
                        rule: 'Hardcoded Secrets',
                        message: 'Potential sensitive data found in ENV/ARG instructions.',
                        severity: 'high'
                    });
                }
            }
        }

        return issues;
    }

    async handleRPCRequest(request) {
        const { method, params = {} } = request;
        try {
            switch (method) {
                case 'docker.scan': return await this.handleScan(params);
                case 'docker.shrink': return { success: true, output: 'Size optimization pending Phase 2.' };
                case 'docker.generate': return { success: true, output: 'Multi-stage generation pending Phase 3.' };
                default: throw new Error(`Unknown method: ${method}`);
            }
        } catch (error) {
            return { error: { code: -32603, message: error.message } };
        }
    }
}

module.exports = { DockerHeroExtension };
