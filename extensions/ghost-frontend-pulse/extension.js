#!/usr/bin/env node

/**
 * Ghost Frontend-Pulse
 * Performance and Accessibility optimizer
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

class FERuleEngine {
    constructor() {
        this.RULES = [
            { id: 'perf-01', name: 'Missing Image Alt', regex: /<img(?![^>]*\balt=)[^>]*>/gi, severity: 'medium', message: 'Detected <img> tag without alt attribute. This impacts SEO and Accessibility.' },
            { id: 'perf-02', name: 'External Link Security', regex: /<a[^>]*target=["']_blank["'](?![^>]*\brel=["'](?:noopener|noreferrer)["'])[^>]*>/gi, severity: 'low', message: 'Using target="_blank" without rel="noopener" is a security risk.' },
            { id: 'perf-03', name: 'Missing Lazy Loading', regex: /<img(?![^>]*\bloading=["']lazy["'])[^>]*>/gi, severity: 'low', message: 'Consider adding loading="lazy" to non-critical images to improve LCP.' }
        ];
    }

    analyze(content) {
        const findings = [];
        for (const rule of this.RULES) {
            const matches = content.match(rule.regex);
            if (matches) {
                findings.push({ ...rule, count: matches.length });
            }
        }
        return findings;
    }
}

class FrontendPulseExtension {
    constructor(sdk) {
        this.sdk = sdk;
        this.rules = new FERuleEngine();
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

        await this.sdk.requestLog({ level: 'info', message: `Analyzing frontend performance in: ${target}` });

        try {
            const content = await this.sdk.requestFileRead({ path: target });
            const staticFindings = this.rules.analyze(content);

            const flags = params.flags || {};
            const { provider, apiKey, model } = this._resolveAIConfig(flags);

            let aiAudit = "";
            if (provider && apiKey) {
                const prompt = `Tu es un expert en Web Performance et Accessibilité. Analyse ce code source (React/Next/HTML) et suggère des optimisations concrètes pour améliorer les Core Web Vitals.\n\nCODE :\n${content}\n\nRéponds par un audit technique structuré.`;
                aiAudit = await this.callAI(provider, apiKey, model, "Expert Web Perf", prompt);
            }

            let output = `\n${Colors.BOLD}${Colors.CYAN}FRONTEND-PULSE CORE AUDIT${Colors.ENDC}\n${'='.repeat(40)}\n`;
            
            if (staticFindings.length > 0) {
                output += `\n${Colors.BOLD}STATIC ANALYSIS RESULTS:${Colors.ENDC}\n`;
                for (const f of staticFindings) {
                    const color = f.severity === 'medium' ? Colors.WARNING : Colors.CYAN;
                    output += `  - [${color}${f.severity.toUpperCase()}${Colors.ENDC}] ${f.name} (Found: ${f.count})\n`;
                    output += `    ${f.message}\n`;
                }
            } else {
                output += `\n${Colors.GREEN}✓ No basic performance issues detected in static scan.${Colors.ENDC}\n`;
            }

            if (aiAudit) {
                output += `\n${Colors.BOLD}AI DEEP-DIVE AUDIT:${Colors.ENDC}\n${aiAudit}\n`;
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
            temperature: 0.2
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

    async handleRPCRequest(request) {
        const { method, params = {} } = request;
        try {
            switch (method) {
                case 'fe.analyze': return await this.handleAnalyze(params);
                case 'fe.optimize': return { success: true, output: 'Component optimization pending Phase 2.' };
                case 'fe.report': return { success: true, output: 'Lighthouse integration pending Phase 3.' };
                default: throw new Error(`Unknown method: ${method}`);
            }
        } catch (error) {
            return { error: { code: -32603, message: error.message } };
        }
    }
}

module.exports = { FrontendPulseExtension };
