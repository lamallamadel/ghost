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

    async handleOptimize(params) {
        const target = params.args?.[0];
        if (!target) return { success: false, output: "Please specify a component file to optimize." };

        await this.sdk.requestLog({ level: 'info', message: `Optimizing component rendering and A11y: ${target}` });

        try {
            const content = await this.sdk.requestFileRead({ path: target });
            const optimizations = this._suggestComponentOptimizations(content);

            let output = `\n${Colors.BOLD}${Colors.CYAN}FRONTEND-PULSE COMPONENT OPTIMIZATION${Colors.ENDC}\n${'='.repeat(40)}\n`;
            
            if (optimizations.length === 0) {
                output += `${Colors.GREEN}✓ Component structure and semantics look good.${Colors.ENDC}\n`;
            } else {
                for (const opt of optimizations) {
                    output += `${Colors.BOLD}→ ${opt.title}${Colors.ENDC}\n`;
                    output += `  ${opt.suggestion}\n\n`;
                }
            }

            return { success: true, output, optimizations };
        } catch (error) {
            return { success: false, output: `Optimization analysis failed: ${error.message}` };
        }
    }

    _suggestComponentOptimizations(content) {
        const suggestions = [];

        // 1. React.memo / useMemo detection
        if (content.includes('export default function') && !content.includes('memo(') && content.length > 2000) {
            suggestions.push({
                title: 'Potential Memoization',
                suggestion: 'This component is quite large. Consider wrapping it in "React.memo" to avoid unnecessary re-renders.'
            });
        }

        // 2. Semantic accessibility
        if (content.includes('<div') && content.includes('onClick') && !content.includes('role=') && !content.includes('tabIndex=')) {
            suggestions.push({
                title: 'Interactive Semantic Gap',
                suggestion: 'Detected click handler on a <div>. Use a <button> or add role="button" and tabIndex={0} for screen readers.'
            });
        }

        // 3. Image Optimization (Next.js)
        if (content.includes('<img') && (content.includes('next/') || content.includes('package.json'))) {
            suggestions.push({
                title: 'Use Next.js Image Component',
                suggestion: 'Detected native <img> tag in a Next.js project. Use "next/image" for automatic resizing and WebP conversion.'
            });
        }

        // 4. Large inline styles
        if (content.match(/style=\{\{.*?\}\}/gs)?.length > 5) {
            suggestions.push({
                title: 'Inline Styles Overhead',
                suggestion: 'Many large inline styles detected. Move them to a CSS module or styled-components to reduce JS bundle size.'
            });
        }

        return suggestions;
    }

    async handleReport(params) {
        await this.sdk.requestLog({ level: 'info', message: 'Synthesizing frontend performance report...' });

        const flags = params.flags || {};
        const url = flags.url || flags.u;
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 10);
        const targetPath = `fe-reports/perf-${timestamp}.md`;

        try {
            let reportSections = [`# Frontend Performance Report\nGenerated: ${new Date().toLocaleString()}\n`];

            // 1. Try to run Lighthouse if a URL is supplied and lhci / lighthouse is available
            if (url) {
                try {
                    const lhResult = await this.sdk.emitIntent({
                        type: 'process',
                        operation: 'spawn',
                        params: {
                            command: 'lighthouse',
                            args: [url, '--output=json', '--output-path=stdout', '--quiet', '--chrome-flags=--headless'],
                            options: { shell: true }
                        }
                    });
                    if (lhResult && lhResult.stdout) {
                        const lh = JSON.parse(lhResult.stdout);
                        const cats = lh.categories || {};
                        reportSections.push(`## Lighthouse Scores (${url})`);
                        for (const [key, cat] of Object.entries(cats)) {
                            const score = Math.round((cat.score || 0) * 100);
                            reportSections.push(`- **${cat.title}**: ${score}/100`);
                        }
                    }
                } catch (e) {
                    reportSections.push(`## Lighthouse\n> Lighthouse not available (${e.message}). Install with: \`npm i -g lighthouse\``);
                }
            } else {
                reportSections.push(`## Lighthouse\n> No URL provided. Run with \`--url <your-app-url>\` to enable Lighthouse scoring.`);
            }

            // 2. Static scan of all HTML/JSX/TSX files in src/
            let allFindings = [];
            try {
                const srcFiles = await this.sdk.emitIntent({
                    type: 'filesystem',
                    operation: 'readdir',
                    params: { path: 'src' }
                });
                for (const f of srcFiles) {
                    if (!/\.(jsx?|tsx?|html)$/i.test(f)) continue;
                    try {
                        const content = await this.sdk.requestFileRead({ path: `src/${f}` });
                        const findings = this.rules.analyze(content);
                        for (const finding of findings) {
                            allFindings.push({ file: `src/${f}`, ...finding });
                        }
                    } catch (e) { /* skip */ }
                }
            } catch (e) { /* no src/ dir */ }

            if (allFindings.length > 0) {
                reportSections.push(`\n## Static Analysis Findings (${allFindings.length} total)`);
                for (const f of allFindings) {
                    reportSections.push(`- **[${f.severity.toUpperCase()}]** ${f.name} in \`${f.file}\` (${f.count}x)\n  ${f.message}`);
                }
            } else {
                reportSections.push(`\n## Static Analysis\n✅ No issues found in source files.`);
            }

            reportSections.push('\n---\n*Report generated by Ghost Frontend-Pulse*');
            const report = reportSections.join('\n');
            await this.sdk.requestFileWrite({ path: targetPath, content: report });

            return {
                success: true,
                output: `${Colors.GREEN}✓ Performance report saved to ${targetPath}${Colors.ENDC}`,
                findings: allFindings
            };
        } catch (error) {
            return { success: false, output: `Report generation failed: ${error.message}` };
        }
    }

    async handleRPCRequest(request) {
        const { method, params = {} } = request;
        try {
            switch (method) {
                case 'fe.analyze': return await this.handleAnalyze(params);
                case 'fe.optimize': return await this.handleOptimize(params);
                case 'fe.report': return await this.handleReport(params);
                default: throw new Error(`Unknown method: ${method}`);
            }
        } catch (error) {
            return { error: { code: -32603, message: error.message } };
        }
    }
}

module.exports = { FrontendPulseExtension };
