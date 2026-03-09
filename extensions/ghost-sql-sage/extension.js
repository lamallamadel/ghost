#!/usr/bin/env node

/**
 * Ghost SQL-Sage
 * AI-powered database optimization
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

class SQLAnalyzer {
    constructor() {
        this.BAD_PATTERNS = [
            { name: 'N+1 Query Potential', regex: /\.map\s*\(.*?\.find.*?\)/gs, severity: 'high', message: 'Detected database call inside a map loop. This usually causes N+1 performance issues.' },
            { name: 'SELECT * Usage', regex: /SELECT\s+\*\s+FROM/gi, severity: 'medium', message: 'Avoid SELECT *. Explicitly name the columns you need to improve performance and stability.' },
            { name: 'Inefficient JOIN', regex: /JOIN\s+.*?\s+ON\s+.*?\s+WHERE\s+.*?LIKE/gi, severity: 'medium', message: 'Large JOINs combined with LIKE filters can be extremely slow without proper indexing.' }
        ];
    }

    analyze(content) {
        const findings = [];
        for (const pattern of this.BAD_PATTERNS) {
            if (pattern.regex.test(content)) {
                findings.push({
                    name: pattern.name,
                    severity: pattern.severity,
                    message: pattern.message
                });
            }
        }
        return findings;
    }
}

class SQLSageExtension {
    constructor(sdk) {
        this.sdk = sdk;
        this.analyzer = new SQLAnalyzer();
        this.DEFAULT_MODEL = "llama-3.3-70b-versatile";
        this.AI_PROVIDERS = {
            groq: { hostname: "api.groq.com", path: "/openai/v1/chat/completions" },
            openai: { hostname: "api.openai.com", path: "/v1/chat/completions" },
            anthropic: { hostname: "api.anthropic.com", path: "/v1/messages" },
            gemini: { hostname: "generativelanguage.googleapis.com", path: "/v1beta/models/" }
        };
    }

    async handleAnalyze(params) {
        const target = params.args?.[0];
        if (!target) return { success: false, output: "Please specify a file or directory to analyze." };

        await this.sdk.requestLog({ level: 'info', message: `Analyzing SQL/ORM performance in: ${target}` });

        try {
            const content = await this.sdk.requestFileRead({ path: target });
            const staticFindings = this.analyzer.analyze(content);

            const flags = params.flags || {};
            const { provider, apiKey, model } = this._resolveAIConfig(flags);

            let aiDeepDive = "";
            if (provider && apiKey) {
                const prompt = `Tu es un expert DBA et SQL. Analyse ce code pour détecter des goulots d'étranglement, des injections SQL, ou des problèmes ORM (N+1).\n\nCODE :\n${content}\n\nRéponds par un rapport technique concis des optimisations recommandées.`;
                aiDeepDive = await this.callAI(provider, apiKey, model, "Expert SQL", prompt);
            }

            let output = `\n${Colors.BOLD}${Colors.CYAN}SQL-SAGE ANALYSIS REPORT${Colors.ENDC}\n${'='.repeat(40)}\n`;
            
            if (staticFindings.length > 0) {
                output += `\n${Colors.BOLD}STATICAL ANALYSIS FINDINGS:${Colors.ENDC}\n`;
                for (const f of staticFindings) {
                    const color = f.severity === 'high' ? Colors.FAIL : Colors.WARNING;
                    output += `  - [${color}${f.severity.toUpperCase()}${Colors.ENDC}] ${f.name}: ${f.message}\n`;
                }
            } else {
                output += `\n${Colors.GREEN}✓ No obvious SQL anti-patterns found.${Colors.ENDC}\n`;
            }

            if (aiDeepDive) {
                output += `\n${Colors.BOLD}AI DEEP-DIVE RECOMMENDATIONS:${Colors.ENDC}\n${aiDeepDive}\n`;
            }

            return { success: true, output, findings: staticFindings };
        } catch (error) {
            return { success: false, output: `Analysis failed: ${error.message}` };
        }
    }

    _resolveAIConfig(flags) {
        return { 
            provider: flags.provider || 'anthropic', 
            apiKey: flags.apiKey || flags['api-key'],
            model: flags.model 
        };
    }

    async callAI(provider, apiKey, model, systemPrompt, userPrompt) {
        const actualModel = model || this.DEFAULT_MODEL;
        const config = this.AI_PROVIDERS[provider] || this.AI_PROVIDERS.groq;
        
        const payload = {
            model: actualModel,
            messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
            temperature: 0.1
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

    async handleAudit(params) {
        const target = params.args?.[0] || 'schemas';
        await this.sdk.requestLog({ level: 'info', message: `Auditing database schema at: ${target}` });

        try {
            const content = await this.sdk.requestFileRead({ path: target });
            const schemaIssues = this._analyzeSchema(content);

            let output = `\n${Colors.BOLD}${Colors.CYAN}SQL-SAGE SCHEMA AUDIT${Colors.ENDC}\n${'='.repeat(40)}\n`;
            
            if (schemaIssues.length === 0) {
                output += `${Colors.GREEN}✓ Schema appears to follow best practices.${Colors.ENDC}\n`;
            } else {
                for (const issue of schemaIssues) {
                    const color = issue.severity === 'high' ? Colors.FAIL : Colors.WARNING;
                    output += `[${color}${issue.severity.toUpperCase()}${Colors.ENDC}] ${issue.rule}\n`;
                    output += `  ${issue.message}\n\n`;
                }
            }

            return { success: true, output, issues: schemaIssues };
        } catch (error) {
            return { success: false, output: `Audit failed: ${error.message}` };
        }
    }

    _analyzeSchema(content) {
        const issues = [];
        const tables = content.split(/CREATE\s+TABLE/gi).slice(1);

        for (const table of tables) {
            const tableNameMatch = table.match(/^\s*(\w+)/);
            const tableName = tableNameMatch ? tableNameMatch[1] : 'Unknown';

            // 1. Check for Primary Key
            if (!table.toUpperCase().includes('PRIMARY KEY')) {
                issues.push({
                    rule: 'Missing Primary Key',
                    message: `Table "${tableName}" does not have a primary key defined.`,
                    severity: 'high'
                });
            }

            // 2. Check for missing indexes on Foreign Keys
            const fkMatches = table.matchAll(/FOREIGN\s+KEY\s*\(\s*(\w+)\s*\)/gi);
            for (const match of fkMatches) {
                const col = match[1];
                if (!table.toUpperCase().includes(`CREATE INDEX`) || !table.toUpperCase().includes(col.toUpperCase())) {
                    issues.push({
                        rule: 'Missing FK Index',
                        message: `Foreign key column "${col}" in table "${tableName}" is not indexed.`,
                        severity: 'medium'
                    });
                }
            }

            // 3. Detect large VARCHAR without size or with huge size
            if (table.match(/VARCHAR\s*\(\s*(?:max|65535)\s*\)/gi)) {
                issues.push({
                    rule: 'Inefficient Data Type',
                    message: `Table "${tableName}" uses very large VARCHAR. Consider TEXT or smaller VARCHAR if possible.`,
                    severity: 'low'
                });
            }
        }

        return issues;
    }

    async handleRPCRequest(request) {
        const { method, params = {} } = request;
        try {
            switch (method) {
                case 'sql.analyze': return await this.handleAnalyze(params);
                case 'sql.audit': return await this.handleAudit(params);
                case 'sql.generate': return { success: true, output: 'Optimization generation pending Phase 3.' };
                default: throw new Error(`Unknown method: ${method}`);
            }
        } catch (error) {
            return { error: { code: -32603, message: error.message } };
        }
    }
}

module.exports = { SQLSageExtension };
