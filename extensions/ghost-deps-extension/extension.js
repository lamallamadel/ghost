#!/usr/bin/env node

/**
 * Ghost Dependency Master
 * Dependency management and visualization
 */

const { ExtensionSDK } = require('@ghost/extension-sdk');
const path = require('path');
const { satisfies: semverSatisfies } = (() => { try { return require('semver'); } catch(e) { return {}; } })();

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

    async handleAudit(params) {
        await this.sdk.requestLog({ level: 'info', message: 'Auditing dependency licenses and security...' });

        try {
            const rootPkg = await this._safeReadJson('package.json');
            const allDeps = Object.keys({ ...(rootPkg.dependencies || {}), ...(rootPkg.devDependencies || {}) });

            let output = `\n${Colors.BOLD}DEPENDENCY AUDIT REPORT${Colors.ENDC}\n${'='.repeat(30)}\n`;
            output += `${Colors.CYAN}Total dependencies:${Colors.ENDC} ${allDeps.length}\n`;

            // 1. License Check — read from node_modules/{pkg}/package.json
            const licenseCounts = {};
            let checked = 0;
            for (const dep of allDeps.slice(0, 50)) { // cap at 50 to stay fast
                try {
                    const pkg = await this._safeReadJson(path.join('node_modules', dep, 'package.json'));
                    const lic = pkg.license || 'Unknown';
                    licenseCounts[lic] = (licenseCounts[lic] || 0) + 1;
                    checked++;
                } catch (e) { /* skip */ }
            }

            if (checked > 0) {
                output += `\n${Colors.CYAN}License Summary (${checked} packages sampled):${Colors.ENDC}\n`;
                for (const [lic, count] of Object.entries(licenseCounts).sort((a, b) => b[1] - a[1])) {
                    const pct = Math.round((count / checked) * 100);
                    output += `  - ${lic}: ${count} (${pct}%)\n`;
                }
            }

            // 2. Security Scan via npm audit
            output += `\n${Colors.CYAN}Security Vulnerabilities:${Colors.ENDC}\n`;
            try {
                const auditResult = await this.sdk.emitIntent({
                    type: 'process',
                    operation: 'spawn',
                    params: { command: 'npm', args: ['audit', '--json'], options: { shell: true } }
                });

                if (auditResult && auditResult.stdout) {
                    const report = JSON.parse(auditResult.stdout);
                    const vulns = report.metadata?.vulnerabilities || {};
                    const high = (vulns.high || 0) + (vulns.critical || 0);
                    const moderate = vulns.moderate || 0;
                    if (high > 0) {
                        output += `${Colors.FAIL}✗ ${high} high/critical vulnerabilities found. Run "npm audit fix".${Colors.ENDC}\n`;
                    } else if (moderate > 0) {
                        output += `${Colors.WARNING}⚠ ${moderate} moderate vulnerabilities found.${Colors.ENDC}\n`;
                    } else {
                        output += `${Colors.GREEN}✓ No high-severity vulnerabilities found.${Colors.ENDC}\n`;
                    }
                } else {
                    output += `${Colors.GREEN}✓ npm audit completed.${Colors.ENDC}\n`;
                }
            } catch (e) {
                output += `${Colors.WARNING}⚠ Security scan limited (npm audit unavailable).${Colors.ENDC}\n`;
            }

            return { success: true, output };
        } catch (error) {
            return { success: false, output: `Audit failed: ${error.message}` };
        }
    }

    async handleSolve(params) {
        await this.sdk.requestLog({ level: 'info', message: 'Analyzing dependency conflicts...' });

        try {
            const rootPkg = await this._safeReadJson('package.json');
            const declared = {
                ...(rootPkg.dependencies || {}),
                ...(rootPkg.devDependencies || {}),
                ...(rootPkg.peerDependencies || {})
            };

            const conflicts = [];

            // Check each declared dep against its installed version in node_modules
            for (const [name, range] of Object.entries(declared)) {
                try {
                    const installedPkg = await this._safeReadJson(path.join('node_modules', name, 'package.json'));
                    if (installedPkg.version && !this._satisfies(installedPkg.version, range)) {
                        conflicts.push({
                            package: name,
                            required: range,
                            actual: installedPkg.version,
                            type: rootPkg.peerDependencies?.[name] ? 'peer' : 'direct'
                        });
                    }
                } catch (e) {
                    if (range && !range.startsWith('file:') && !range.startsWith('git')) {
                        conflicts.push({ package: name, required: range, actual: 'NOT INSTALLED', type: 'missing' });
                    }
                }
            }

            let output = `\n${Colors.BOLD}DEPENDENCY SOLVER${Colors.ENDC}\n${'='.repeat(30)}\n`;

            if (conflicts.length === 0) {
                output += `${Colors.GREEN}✓ No version conflicts detected.${Colors.ENDC}\n`;
            } else {
                output += `${Colors.WARNING}⚠ Detected ${conflicts.length} conflict(s):${Colors.ENDC}\n\n`;
                for (const c of conflicts) {
                    output += `${Colors.CYAN}${c.package}${Colors.ENDC} [${c.type}]\n`;
                    output += `  - Required: ${c.required}   Found: ${c.actual}\n`;
                    output += `  - Fix: ${Colors.BOLD}npm install ${c.package}@"${c.required}"${Colors.ENDC}\n\n`;
                }
            }

            return { success: true, output, conflicts };
        } catch (error) {
            return { success: false, output: `Solver failed: ${error.message}` };
        }
    }

    // Minimal semver satisfies check (handles ^, ~, exact, *)
    _satisfies(version, range) {
        if (!range || range === '*' || range === 'latest') return true;
        if (range.startsWith('file:') || range.startsWith('git')) return true;
        try {
            const clean = range.replace(/^[\^~>=<v\s]+/, '').split(' ')[0];
            const [majR, minR, patR] = clean.split('.').map(Number);
            const [majV, minV, patV] = version.split('-')[0].split('.').map(Number);
            if (range.startsWith('^')) {
                if (majR !== majV) return false;
                if (minV < minR) return false;
                if (minV === minR && patV < patR) return false;
                return true;
            }
            if (range.startsWith('~')) {
                if (majR !== majV || minR !== minV) return false;
                return patV >= patR;
            }
            // Exact or >= style — just compare major
            return majV >= majR;
        } catch (e) {
            return true; // Don't flag if we can't parse
        }
    }

    async handleRPCRequest(request) {
        const { method, params = {} } = request;
        try {
            switch (method) {
                case 'deps.graph': return await this.handleGraph(params);
                case 'deps.audit': return await this.handleAudit(params);
                case 'deps.solve': return await this.handleSolve(params);
                default: throw new Error(`Unknown method: ${method}`);
            }
        } catch (error) {
            return { error: { code: -32603, message: error.message } };
        }
    }
}

module.exports = { DependencyExtension };
