#!/usr/bin/env node

/**
 * Ghost Documentation Bot
 * AI-powered documentation engine
 */

const { ExtensionSDK } = require('@ghost/extension-sdk');
const path = require('path');

const Colors = {
    GREEN: '\x1b[32m',
    CYAN: '\x1b[36m',
    BOLD: '\x1b[1m',
    ENDC: '\x1b[0m'
};

/**
 * Logic to analyze project structure and stack
 */
class ProjectAnalyzer {
    constructor(sdk) {
        this.sdk = sdk;
    }

    async detectStack() {
        const stack = {
            languages: [],
            frameworks: [],
            tooling: []
        };

        const rootFiles = await this.sdk.emitIntent({ type: 'filesystem', operation: 'readdir', params: { path: '.' } });
        
        if (rootFiles.includes('package.json')) stack.languages.push('JavaScript/Node.js');
        if (rootFiles.includes('requirements.txt') || rootFiles.includes('pyproject.toml')) stack.languages.push('Python');
        if (rootFiles.includes('go.mod')) stack.languages.push('Go');
        if (rootFiles.includes('Cargo.toml')) stack.languages.push('Rust');
        
        // Detailed framework detection could be added here by reading package.json
        return stack;
    }

    async getFileTree(dir = '.', depth = 2) {
        if (depth < 0) return [];
        const entries = await this.sdk.emitIntent({ type: 'filesystem', operation: 'readdir', params: { path: dir } });
        const tree = [];
        
        for (const entry of entries) {
            if (['node_modules', '.git', 'dist', '.migration-backup'].includes(entry)) continue;
            tree.push(path.join(dir, entry));
            // Simple depth-limited recursion would go here
        }
        return tree;
    }
}

class DocsExtension {
    constructor(sdk) {
        this.sdk = sdk;
        this.analyzer = new ProjectAnalyzer(sdk);
        this.DEFAULT_MODEL = "llama-3.3-70b-versatile";
        this.AI_PROVIDERS = {
            groq: { hostname: "api.groq.com", path: "/openai/v1/chat/completions" },
            openai: { hostname: "api.openai.com", path: "/v1/chat/completions" },
            anthropic: { hostname: "api.anthropic.com", path: "/v1/messages" },
            gemini: { hostname: "generativelanguage.googleapis.com", path: "/v1beta/models/" }
        };
    }

    async handleInit(params) {
        const flags = params.flags || {};
        await this.sdk.requestLog({ level: 'info', message: 'Analyzing project for README generation...' });
        
        const stack = await this.analyzer.detectStack();
        const files = await this.analyzer.getFileTree();
        
        const context = {
            stack,
            fileCount: files.length,
            structure: files.slice(0, 20) // Give AI a sample
        };

        const prompt = `Tu es un rédacteur technique expert. Analyse ce projet et génère un README.md professionnel, complet et structuré.
        
        STACK : ${JSON.stringify(stack)}
        STRUCTURE : ${JSON.stringify(context.structure)}
        
        Inclus : Description, Installation, Usage, et Architecture.
        Réponds UNIQUEMENT avec le contenu du fichier Markdown.`;

        try {
            const { provider, apiKey, model } = this._resolveAIConfig(flags);
            if (!provider || !apiKey) throw new Error('AI Provider not configured. Run ghost setup.');

            const readmeContent = await this.callAI(provider, apiKey, model, "Rédacteur technique expert", prompt);
            
            await this.sdk.requestFileWrite({ path: 'README.md', content: readmeContent });
            return { success: true, output: `${Colors.GREEN}✓ README.md generated successfully.${Colors.ENDC}` };
        } catch (error) {
            return { success: false, output: `Initialization failed: ${error.message}` };
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
                case 'docs.init': return await this.handleInit(params);
                case 'docs.generate': return { success: true, output: 'API generation pending Phase 2.' };
                case 'docs.diagram': return { success: true, output: 'Diagram generation pending Phase 2.' };
                case 'docs.chat': return { success: true, output: 'Interactive chat pending Phase 3.' };
                default: throw new Error(`Unknown method: ${method}`);
            }
        } catch (error) {
            return { error: { code: -32603, message: error.message } };
        }
    }
}

module.exports = { DocsExtension, ProjectAnalyzer };
