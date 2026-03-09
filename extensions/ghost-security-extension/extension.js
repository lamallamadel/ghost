#!/usr/bin/env node

/**
 * Ghost Security Extension
 * Centralized security hub for Ghost CLI
 */

const { ExtensionSDK } = require('@ghost/extension-sdk');
const path = require('path');

const Colors = {
    GREEN: '\x1b[32m',
    WARNING: '\x1b[33m',
    FAIL: '\x1b[31m',
    CYAN: '\x1b[36m',
    BOLD: '\x1b[1m',
    DIM: '\x1b[2m',
    ENDC: '\x1b[0m'
};

/**
 * High-performance Secret Scanner
 */
class SecretScanner {
    constructor() {
        this.SECRET_REGEXES = [
            { name: 'Groq API Key', regex: /gsk_[a-zA-Z0-9]{48,}/g, severity: 'critical' },
            { name: 'GitHub Token', regex: /gh[pous]_[a-zA-Z0-9]{36,}/g, severity: 'critical' },
            { name: 'Slack Token', regex: /xox[baprs]-[0-9a-zA-Z]{10,48}/g, severity: 'high' },
            { name: 'AWS Access Key', regex: /AKIA[0-9A-Z]{16}/g, severity: 'critical' },
            { name: 'AWS Secret Key', regex: /[A-Za-z0-9/+=]{40}/g, severity: 'high' },
            { name: 'Private Key Header', regex: /-----BEGIN (RSA|EC|PGP|OPENSSH|DSA) PRIVATE KEY-----/g, severity: 'critical' },
            { name: 'Generic API Key', regex: /(?:key|api|token|secret|auth)[_-]?(?:key|api|token|secret|auth)?\s*[:=]\s*['"]([a-zA-Z0-9_\-]{16,})['"]?/gi, severity: 'medium' },
            { name: 'OpenAI API Key', regex: /sk-[a-zA-Z0-9]{48,}/g, severity: 'critical' },
            { name: 'Anthropic API Key', regex: /sk-ant-[a-zA-Z0-9\-]{95,}/g, severity: 'critical' }
        ];

        this.OWASP_PATTERNS = [
            { name: 'Insecure eval()', regex: /eval\s*\(/g, severity: 'high', category: 'A03:2021-Injection' },
            { name: 'Insecure Command Execution', regex: /child_process\.(?:exec|spawn)\s*\(/g, severity: 'high', category: 'A03:2021-Injection' },
            { name: 'Insecure innerHTML', regex: /\.innerHTML\s*=/g, severity: 'medium', category: 'A03:2021-Injection' },
            { name: 'Hardcoded sensitive storage', regex: /localStorage\.setItem\s*\(\s*['"](?:token|auth|password|key)/gi, severity: 'high', category: 'A07:2021-Identification and Authentication Failures' }
        ];

        this.KNOWN_NON_SECRETS = [
            'claude-3-5-sonnet', 'gemini-1.5-flash', 'llama-3.3-70b', 'anthropic', 'openai', 'google', 'groq'
        ];
    }

    calculateShannonEntropy(data) {
        if (!data) return 0;
        const frequencies = {};
        for (const char of data) frequencies[char] = (frequencies[char] || 0) + 1;
        let entropy = 0;
        const len = data.length;
        for (const char in frequencies) {
            const p = frequencies[char] / len;
            entropy -= p * Math.log2(p);
        }
        return entropy;
    }

    scan(content) {
        if (!content) return [];
        const suspicious = [];
        const isKnown = (str) => {
            if (/example|test|sample|placeholder|dummy/i.test(str)) return true;
            return this.KNOWN_NON_SECRETS.some(ns => str.toLowerCase().includes(ns.toLowerCase()));
        };

        // 1. Scan for Secrets (Regex)
        for (const { name, regex, severity } of this.SECRET_REGEXES) {
            const matches = content.matchAll(regex);
            for (const m of matches) {
                const val = m[0];
                if (val.length > 8 && !isKnown(val)) {
                    suspicious.push({ 
                        display: val.substring(0, 30) + (val.length > 30 ? '...' : ''), 
                        type: name, 
                        value: val, 
                        severity, 
                        method: 'regex' 
                    });
                }
            }
        }

        // 2. Scan for OWASP Vulnerabilities
        for (const { name, regex, severity, category } of this.OWASP_PATTERNS) {
            const matches = content.matchAll(regex);
            for (const m of matches) {
                suspicious.push({
                    display: m[0],
                    type: name,
                    category,
                    severity,
                    method: 'owasp'
                });
            }
        }

        // 3. Entropy Analysis
        const entropyRegex = /(['"])(.*?)(\1)|=\s*([^\s]+)/g;
        let match;
        while ((match = entropyRegex.exec(content)) !== null) {
            const candidate = match[2] || match[4];
            if (!candidate || candidate.length < 16 || candidate.includes(' ') || isKnown(candidate)) continue;
            const entropy = this.calculateShannonEntropy(candidate);
            if (entropy >= 4.5 && entropy <= 7.0) {
                if (!suspicious.some(s => s.value === candidate)) {
                    suspicious.push({ 
                        display: candidate.substring(0, 30) + (candidate.length > 30 ? '...' : ''), 
                        type: 'High Entropy String', 
                        value: candidate, 
                        severity: entropy > 5.5 ? 'high' : 'medium', 
                        entropy: entropy.toFixed(2), 
                        method: 'entropy' 
                    });
                }
            }
        }
        return suspicious;
    }
}

class SecurityExtension {
    constructor(sdk) {
        this.sdk = sdk;
        this.scanner = new SecretScanner();
        this.DEFAULT_MODEL = "llama-3.3-70b-versatile";
        this.AI_PROVIDERS = {
            groq: { hostname: "api.groq.com", path: "/openai/v1/chat/completions" },
            openai: { hostname: "api.openai.com", path: "/v1/chat/completions" },
            anthropic: { hostname: "api.anthropic.com", path: "/v1/messages" },
            gemini: { hostname: "generativelanguage.googleapis.com", path: "/v1beta/models/" }
        };
    }

    async handleScan(params) {
        const target = params.args?.[0] || '.';
        await this.sdk.requestLog({ level: 'info', message: `Starting targeted security scan on: ${target}` });
        
        try {
            const results = await this._scanRecursive(target);
            return { 
                success: true, 
                output: this._formatScanReport(results, 'TARGETED SCAN'),
                findings: results
            };
        } catch (error) {
            return { success: false, output: `Scan failed: ${error.message}` };
        }
    }

    async handleAudit(params) {
        const flags = params.flags || {};
        await this.sdk.requestLog({ level: 'info', message: `Starting comprehensive repository audit` });
        
        try {
            // 1. Recursive Scan
            const results = await this._scanRecursive('.');
            
            // 2. Configuration Analysis
            const configIssues = await this._auditConfigurations();
            
            // 3. AI Validation (if enabled)
            let aiReport = "";
            if (flags.ai && results.length > 0) {
                aiReport = await this._validateWithAI(results, params);
            }

            const output = this._formatScanReport(results, 'FULL REPOSITORY AUDIT') + 
                           this._formatConfigReport(configIssues) +
                           (aiReport ? `\n\n${Colors.BOLD}AI VALIDATION ANALYSIS${Colors.ENDC}\n${aiReport}` : "");

            return { 
                success: true, 
                output,
                findings: results,
                configIssues
            };
        } catch (error) {
            return { success: false, output: `Audit failed: ${error.message}` };
        }
    }

    async _scanRecursive(target) {
        const findings = [];
        const ignoreDirs = ['.git', 'node_modules', 'dist', 'build', '.migration-backup'];
        
        const walk = async (currentPath) => {
            try {
                const stats = await this.sdk.emitIntent({ type: 'filesystem', operation: 'stat', params: { path: currentPath } });
                
                if (stats.isDirectory) {
                    if (ignoreDirs.some(d => currentPath.includes(d))) return;
                    
                    const files = await this.sdk.emitIntent({ type: 'filesystem', operation: 'readdir', params: { path: currentPath } });
                    for (const file of files) {
                        await walk(path.join(currentPath, file));
                    }
                } else {
                    // Only scan text files or relevant code files
                    const ext = path.extname(currentPath).toLowerCase();
                    const textExtensions = ['.js', '.ts', '.py', '.env', '.json', '.yml', '.yaml', '.md', '.sh', '.txt'];
                    if (textExtensions.includes(ext) || ext === '') {
                        const content = await this.sdk.requestFileRead({ path: currentPath });
                        const issues = this.scanner.scan(content);
                        if (issues.length > 0) {
                            findings.push({ file: currentPath, issues });
                        }
                    }
                }
            } catch (e) {
                // Skip files that can't be read
            }
        };

        await walk(target);
        return findings;
    }

    async _auditConfigurations() {
        const issues = [];
        const configFiles = [
            { path: '.env', type: 'Environment File' },
            { path: 'package.json', type: 'Node Dependencies' },
            { path: 'docker-compose.yml', type: 'Docker Configuration' }
        ];

        for (const config of configFiles) {
            try {
                const exists = await this.sdk.emitIntent({ type: 'filesystem', operation: 'stat', params: { path: config.path } });
                if (exists) {
                    if (config.path === '.env') {
                        issues.push({ file: config.path, type: 'Information Exposure', message: '.env file found in repository. This should be ignored by Git.', severity: 'high' });
                    }
                    // Add more specific config checks here
                }
            } catch (e) { /* ignore */ }
        }
        return issues;
    }

    async _validateWithAI(findings, params) {
        const flags = params.flags || {};
        const { provider, apiKey, model } = this._resolveAIConfig(flags);
        
        if (!provider || !apiKey) return `${Colors.WARNING}⚠ AI validation skipped: No API key configured.${Colors.ENDC}`;

        const prompt = `Tu es un expert en cybersécurité. Voici une liste de vulnérabilités potentielles détectées par un scanner automatique.
        Analyse-les et identifie les vrais risques par rapport aux faux positifs (ex: clés de test, placeholders).
        
        DONNÉES : ${JSON.stringify(findings)}
        
        Réponds par un résumé concis des risques critiques réels.`;

        try {
            return await this.callAI(provider, apiKey, model, "Expert en cybersécurité", prompt);
        } catch (e) {
            return `${Colors.FAIL}⚠ AI call failed: ${e.message}${Colors.ENDC}`;
        }
    }

    _resolveAIConfig(flags) {
        // Simple mock for resolve - in real impl, read from ghostrc via intent
        return { 
            provider: flags.provider || 'anthropic', 
            apiKey: flags.apiKey || flags['api-key'],
            model: flags.model 
        };
    }

    async callAI(provider, apiKey, model, systemPrompt, userPrompt, temperature = 0.3) {
        const actualModel = model || this.DEFAULT_MODEL;
        const config = this.AI_PROVIDERS[provider] || this.AI_PROVIDERS.groq;
        
        const payload = {
            model: actualModel,
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt }
            ],
            temperature
        };

        const response = await this.sdk.requestNetworkCall({
            url: `https://${config.hostname}${config.path}`,
            method: 'POST',
            headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = JSON.parse(response);
        return data.choices?.[0]?.message?.content || JSON.stringify(data);
    }

    _formatScanReport(results, title) {
        if (results.length === 0) return `${Colors.GREEN}✓ No security issues found in scan.${Colors.ENDC}`;
        
        let report = `\n${Colors.BOLD}${title}${Colors.ENDC}\n${'='.repeat(30)}\n`;
        for (const res of results) {
            report += `\nFile: ${Colors.CYAN}${res.file}${Colors.ENDC}\n`;
            for (const issue of res.issues) {
                const color = issue.severity === 'critical' || issue.severity === 'high' ? Colors.FAIL : Colors.WARNING;
                report += `  - [${color}${issue.severity.toUpperCase()}${Colors.ENDC}] ${issue.type}: ${issue.display}\n`;
            }
        }
        return report;
    }

    _formatConfigReport(issues) {
        if (issues.length === 0) return "";
        
        let report = `\n\n${Colors.BOLD}CONFIGURATION AUDIT${Colors.ENDC}\n${'='.repeat(30)}\n`;
        for (const issue of issues) {
            const color = issue.severity === 'high' ? Colors.FAIL : Colors.WARNING;
            report += `\n[${color}${issue.severity.toUpperCase()}${Colors.ENDC}] ${issue.file}: ${issue.type}\n`;
            report += `  ${issue.message}\n`;
        }
        return report;
    }

    async handleRPCRequest(request) {
        const { method, params = {} } = request;
        try {
            switch (method) {
                case 'security.scan': return await this.handleScan(params);
                case 'security.audit': return await this.handleAudit(params);
                case 'security.status': return { success: true, output: 'Security Status: BASELINE (Phase 2 Auditing Active)' };
                default: throw new Error(`Unknown method: ${method}`);
            }
        } catch (error) {
            return { error: { code: -32603, message: error.message } };
        }
    }
}

module.exports = { SecurityExtension, SecretScanner };
