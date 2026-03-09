#!/usr/bin/env node

/**
 * Ghost Dependency Master
 * Dependency management and visualization
 */

const { ExtensionSDK } = require('@ghost/extension-sdk');
const path = require('path');

const Colors = {
    GREEN: '\x1b[32m',
    CYAN: '\x1b[36m',
    BOLD: '\x1b[1m',
    FAIL: '\x1b[31m',
    ENDC: '\x1b[0m'
};

class DependencyExtension {
    constructor(sdk) {
        this.sdk = sdk;
    }

    async handleGraph(params) {
        await this.sdk.requestLog({ level: 'info', message: 'Generating dependency graph...' });

        try {
            const rootPkg = await this._safeReadJson('package.json');
            const deps = rootPkg.dependencies || {};
            const devDeps = rootPkg.devDependencies || {};

            let graph = "graph TD\n";
            graph += `    Root[${rootPkg.name || 'Project Root'}] --> Deps(Dependencies)\n`;
            graph += `    Root --> DevDeps(Dev Dependencies)\n`;

            for (const dep of Object.keys(deps)) {
                graph += `    Deps --> ${dep.replace(/[@/]/g, '_')}[${dep}]\n`;
            }
            
            // Add extensions (simulated detection)
            graph += `    Root --> Extensions(Ghost Extensions)\n`;
            graph += `    Extensions --> ghost_git_extension[ghost-git-extension]\n`;
            graph += `    Extensions --> ghost_security_extension[ghost-security-extension]\n`;

            const output = `\n${Colors.BOLD}DEPENDENCY GRAPH (Mermaid)${Colors.ENDC}\n${'='.repeat(30)}\n\n\`\`\`mermaid\n${graph}\n\`\`\`\n`;
            
            return { success: true, output, graph };
        } catch (error) {
            return { success: false, output: `Graph generation failed: ${error.message}` };
        }
    }

    async _safeReadJson(filePath) {
        try {
            const content = await this.sdk.requestFileRead({ path: filePath });
            return JSON.parse(content);
        } catch (e) {
            return {};
        }
    }

    async handleRPCRequest(request) {
        const { method, params = {} } = request;
        try {
            switch (method) {
                case 'deps.graph': return await this.handleGraph(params);
                case 'deps.audit': return { success: true, output: 'Security audit pending Phase 2.' };
                case 'deps.solve': return { success: true, output: 'Conflict resolution pending Phase 3.' };
                default: throw new Error(`Unknown method: ${method}`);
            }
        } catch (error) {
            return { error: { code: -32603, message: error.message } };
        }
    }
}

module.exports = { DependencyExtension };
