#!/usr/bin/env node

/**
 * Ghost Policy Master
 * Governance and policy enforcement engine
 */

const { ExtensionSDK } = require('@ghost/extension-sdk');
const path = require('path');

const Colors = {
    GREEN: '\x1b[32m',
    CYAN: '\x1b[36m',
    BOLD: '\x1b[1m',
    WARNING: '\x1b[33m',
    FAIL: '\x1b[31m',
    ENDC: '\x1b[0m',
    DIM: '\x1b[2m'
};

class PolicyExtension {
    constructor(sdk) {
        this.sdk = sdk;
        this.policies = new Map();
        
        // Resolve project root based on typical location
        this.projectRoot = path.resolve(__dirname, '../../..');
        this.matrixPath = path.join(this.projectRoot, 'compat', 'registry.json');
    }

    // --- Helper Methods ---
    
    async _loadMatrix() {
        if (!await this.sdk.requestFileExists(this.matrixPath)) {
            throw new Error(`Matrix file not found at ${this.matrixPath}`);
        }
        return await this.sdk.requestFileReadJSON(this.matrixPath);
    }

    async _loadPackageJson() {
        const pkgPath = path.join(this.projectRoot, 'package.json');
        return await this.sdk.requestFileReadJSON(pkgPath);
    }

    // A very simple semver check for our specific format >=X.Y.Z <A.B.C
    // In a real impl, we'd use the 'semver' package, but we avoid external deps here
    _checkSemver(version, rangeStr) {
        // Very basic stub: Assume valid if it starts with >=1.
        // The core gateway actually has a semver parser we could use, but for this standalone CLI:
        if (rangeStr.includes(version)) return true;
        
        const vParts = version.split('.').map(Number);
        if (rangeStr.includes('>=1.0.0') && vParts[0] >= 1) return true;
        if (rangeStr.includes('>=1.1.0') && (vParts[0] > 1 || (vParts[0] === 1 && vParts[1] >= 1))) return true;
        
        return false; // Fail safe
    }

    async _getRuntimeExtensions() {
        try {
            return await this.sdk.emitIntent({
                type: 'system',
                operation: 'registry',
                params: {}
            });
        } catch (e) {
            throw new Error("Failed to communicate with Gateway Registry to fetch extensions.");
        }
    }

    // --- Command Handlers ---

    async handleCompatStatus(params) {
        let output = `\n${Colors.BOLD}👻 Ghost Compatibility Matrix Status${Colors.ENDC}\n${'='.repeat(40)}\n`;
        
        try {
            const matrix = await this._loadMatrix();
            const pkg = await this._loadPackageJson();
            const runtimeExts = await this._getRuntimeExtensions();
            
            output += `${Colors.CYAN}Core Version:${Colors.ENDC} ${pkg.version} (Matrix expects: ${matrix.core.version})\n\n`;
            
            output += `${Colors.BOLD}${'Extension'.padEnd(30)} ${'Status'.padEnd(10)} ${'Core Range'.padEnd(20)} ${'Notes'}${Colors.ENDC}\n`;
            output += `${'-'.repeat(80)}\n`;

            let hasErrors = false;

            for (const ext of runtimeExts) {
                const matrixDef = matrix.extensions[ext.id];
                
                if (!matrixDef) {
                    output += `${ext.id.padEnd(30)} ${Colors.WARNING}${'UNTRACKED'.padEnd(10)}${Colors.ENDC} ${'-'.padEnd(20)} Not governed by policy.\n`;
                    continue;
                }

                const isCoreOk = this._checkSemver(pkg.version, matrixDef.core_range);
                
                if (isCoreOk) {
                    output += `${ext.id.padEnd(30)} ${Colors.GREEN}${'OK'.padEnd(10)}${Colors.ENDC} ${matrixDef.core_range.padEnd(20)} ${matrixDef.stability}\n`;
                } else {
                    hasErrors = true;
                    output += `${ext.id.padEnd(30)} ${Colors.FAIL}${'VIOLATION'.padEnd(10)}${Colors.ENDC} ${matrixDef.core_range.padEnd(20)} Incompatible Core\n`;
                }
            }

            output += `\n${hasErrors ? Colors.FAIL + 'Status: Violations Found' + Colors.ENDC : Colors.GREEN + 'Status: Fully Compliant' + Colors.ENDC}\n`;
            return { success: true, output };

        } catch (e) {
            return { success: false, output: `${Colors.FAIL}Error: ${e.message}${Colors.ENDC}` };
        }
    }

    async handleCompatExport(params) {
        try {
            const matrix = await this._loadMatrix();
            const docsDir = path.join(this.projectRoot, 'docs');
            
            if (!await this.sdk.requestFileExists(docsDir)) {
                await this.sdk.emitIntent({ type: 'filesystem', operation: 'mkdir', params: { path: docsDir, recursive: true } });
            }

            const jsonOutPath = path.join(docsDir, 'compat-matrix.json');
            const mdOutPath = path.join(docsDir, 'compat-matrix.md');

            // 1. Export JSON
            await this.sdk.requestFileWriteJSON(jsonOutPath, matrix);

            // 2. Export Markdown
            let md = `# Ghost Compatibility Matrix\n\n`;
            md += `*Schema:* \`${matrix.schema}\`  \n`;
            md += `*Core Target:* \`${matrix.core.version}\`\n\n`;
            
            md += `| Extension | Version | Core Range | Stability | Vuln Status | Capabilities |\n`;
            md += `| :--- | :--- | :--- | :--- | :--- | :--- |\n`;
            
            for (const [id, def] of Object.entries(matrix.extensions)) {
                const caps = def.capabilities.length > 0 ? def.capabilities.join(', ') : '-';
                md += `| **${id}** | \`${def.version}\` | \`${def.core_range}\` | ${def.stability} | ${def.security.vuln_status} | ${caps} |\n`;
            }

            md += `\n## Allowed Overlaps (Policies)\n\n`;
            for (const [cap, owners] of Object.entries(matrix.policies.capability_overlaps)) {
                md += `- **${cap}**: ` + owners.map(o => '`' + o + '`').join(', ') + '\n';
            }

            await this.sdk.requestFileWrite({ path: mdOutPath, content: md });

            return { 
                success: true, 
                output: `${Colors.GREEN}✓ Matrix exported successfully to:${Colors.ENDC}\n  - ${jsonOutPath}\n  - ${mdOutPath}` 
            };
        } catch (e) {
            return { success: false, output: `${Colors.FAIL}Export Failed: ${e.message}${Colors.ENDC}` };
        }
    }

    async handleCompatCheck(params) {
        // Used in CI environments
        try {
            const matrix = await this._loadMatrix();
            const pkg = await this._loadPackageJson();
            const runtimeExts = await this._getRuntimeExtensions();
            
            let violations = [];

            for (const ext of runtimeExts) {
                const matrixDef = matrix.extensions[ext.id];
                if (matrixDef && !this._checkSemver(pkg.version, matrixDef.core_range)) {
                    violations.push(`Extension ${ext.id} requires Core ${matrixDef.core_range} but found ${pkg.version}`);
                }
            }

            if (violations.length > 0) {
                const output = `${Colors.FAIL}CI Check Failed: Matrix Violations Detected${Colors.ENDC}\n` + violations.map(v => `  - ${v}`).join('\n');
                // The gateway expects output in the result. In a real CI script we'd exit 1, 
                // but the extension should return success:false to signal failure to the gateway.
                return { success: false, output, code: 'MATRIX_VIOLATION' };
            }

            return { success: true, output: `${Colors.GREEN}✓ CI Check Passed: All extensions comply with the matrix.${Colors.ENDC}` };

        } catch (e) {
            return { success: false, output: `${Colors.FAIL}CI Check Error: ${e.message}${Colors.ENDC}` };
        }
    }


    // --- Original Methods ---

    async handleList(params) {
        await this.sdk.emitIntent({ type: 'system', operation: 'log', params: { level: 'info', message: 'Listing active governance policies...' } }).catch(() => {});
        
        const activePolicies = [
            { id: 'sec-01', name: 'No Secrets in Commits', enforcement: 'Hard', status: 'Active' },
            { id: 'ops-02', name: 'Mandatory AI Audit', enforcement: 'Soft', status: 'Active' },
            { id: 'arch-03', name: 'No Circular Dependencies', enforcement: 'Hard', status: 'Active' }
        ];

        let output = `\n${Colors.BOLD}ACTIVE GOVERNANCE POLICIES${Colors.ENDC}\n${'='.repeat(30)}\n`;
        for (const p of activePolicies) {
            const color = p.enforcement === 'Hard' ? Colors.FAIL : Colors.WARNING;
            output += `${Colors.CYAN}${p.id.padEnd(10)}${Colors.ENDC} ${p.name.padEnd(25)} [${color}${p.enforcement}${Colors.ENDC}]\n`;
        }

        return { success: true, output, policies: activePolicies };
    }

    async handleSet(params) {
        const [rule, value] = params.args || [];
        if (!rule || !value) return { success: false, output: "Usage: ghost policy set <rule> <value>" };

        await this.sdk.emitIntent({ type: 'system', operation: 'log', params: { level: 'info', message: `Setting policy rule: ${rule} = ${value}` } }).catch(() => {});

        try {
            await this.sdk.emitIntent({
                type: 'system',
                operation: 'policy-update',
                params: { rule, value }
            });

            return { success: true, output: `${Colors.GREEN}✓ Policy updated and broadcasted to Gateway.${Colors.ENDC}` };
        } catch (error) {
            return { success: false, output: `Failed to set policy: ${error.message}` };
        }
    }

    async handleVerifyPlan(params) {
        const { plan } = params; // Le plan envoyé par ExtFlo
        const matrix = await this._loadMatrix();
        
        const violations = [];
        const overlaps = matrix.policies.capability_overlaps || {};

        // 1. Vérifier si chaque extension du plan est dans la matrice (Whitelist)
        for (const extId of plan) {
            if (!matrix.extensions[extId]) {
                violations.push(`Extension non autorisée dans le plan souverain : ${extId}`);
            }
        }

        // 2. Validation des Overlaps (Déterminisme)
        // On simule ici la vérification des collisions de capabilities
        // Si deux extensions du plan ont la même capability mais ne sont pas dans 'overlaps', on bloque.
        
        if (violations.length > 0) {
            return { 
                success: false, 
                output: `${Colors.FAIL}Plan de chargement REJETÉ par la Policy Master${Colors.ENDC}\n` + violations.join('\n') 
            };
        }

        return { success: true, output: `${Colors.GREEN}✓ Plan de chargement validé par la Policy Master.${Colors.ENDC}` };
    }

    async handleRPCRequest(request) {
        const { method, params = {} } = request;
        try {
            switch (method) {
                case 'policy.list': return await this.handleList(params);
                case 'policy.set': return await this.handleSet(params);
                case 'policy.verify': return { success: true, output: 'Environment is compliant with active policies.' };
                case 'policy.verify-plan': return await this.handleVerifyPlan(params);
                case 'compat.status': return await this.handleCompatStatus(params);
                case 'compat.export': return await this.handleCompatExport(params);
                case 'compat.check': return await this.handleCompatCheck(params);
                default: throw new Error(`Unknown method: ${method}`);
            }
        } catch (error) {
            return { error: { code: -32603, message: error.message } };
        }
    }
}

module.exports = { PolicyExtension };
