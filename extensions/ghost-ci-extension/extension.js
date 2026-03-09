#!/usr/bin/env node

/**
 * Ghost Pipeline Orchestrator
 * CI/CD integration and headless automation
 */

const { ExtensionSDK } = require('@ghost/extension-sdk');
const path = require('path');

const Colors = {
    GREEN: '\x1b[32m',
    WARNING: '\x1b[33m',
    FAIL: '\x1b[31m',
    CYAN: '\x1b[36m',
    BOLD: '\x1b[1m',
    ENDC: '\x1b[0m'
};

class CIDetector {
    detect() {
        if (process.env.GITHUB_ACTIONS) return 'GitHub Actions';
        if (process.env.GITLAB_CI) return 'GitLab CI';
        if (process.env.CIRCLECI) return 'CircleCI';
        if (process.env.TRAVIS) return 'Travis CI';
        if (process.env.JENKINS_URL) return 'Jenkins';
        return 'Local / Unknown CI';
    }

    getEnvVars() {
        return {
            branch: process.env.GITHUB_REF_NAME || process.env.CI_COMMIT_REF_NAME || 'unknown',
            sha: process.env.GITHUB_SHA || process.env.CI_COMMIT_SHA || 'unknown',
            actor: process.env.GITHUB_ACTOR || process.env.GITLAB_USER_LOGIN || 'unknown'
        };
    }
}

class CIExtension {
    constructor(sdk) {
        this.sdk = sdk;
        this.detector = new CIDetector();
    }

    async handleStatus(params) {
        const ci = this.detector.detect();
        const env = this.detector.getEnvVars();
        
        let output = `\n${Colors.BOLD}GHOST CI ORCHESTRATOR${Colors.ENDC}\n${'='.repeat(30)}\n`;
        output += `${Colors.CYAN}CI Environment:${Colors.ENDC} ${ci}\n`;
        output += `${Colors.CYAN}Branch:${Colors.ENDC} ${env.branch}\n`;
        output += `${Colors.CYAN}Commit SHA:${Colors.ENDC} ${env.sha.substring(0, 7)}\n`;
        output += `${Colors.CYAN}Triggered By:${Colors.ENDC} ${env.actor}\n\n`;
        
        output += `${Colors.BOLD}Orchestration Capabilities:${Colors.ENDC}\n`;
        output += `  - Security Gates: ✅ Ready (via ghost-security-extension)\n`;
        output += `  - Documentation Audits: ✅ Ready (via ghost-docs-extension)\n`;
        output += `  - Git Health: ✅ Ready (via ghost-git-extension)\n`;

        return { success: true, output };
    }

    async handleRPCRequest(request) {
        const { method, params = {} } = request;
        try {
            switch (method) {
                case 'ci.status': return await this.handleStatus(params);
                case 'ci.check': return { success: true, output: 'CI Gates pending Phase 2.' };
                case 'ci.report': return { success: true, output: 'CI Reporting pending Phase 3.' };
                default: throw new Error(`Unknown method: ${method}`);
            }
        } catch (error) {
            return { error: { code: -32603, message: error.message } };
        }
    }
}

module.exports = { CIExtension, CIDetector };
