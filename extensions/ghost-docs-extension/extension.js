#!/usr/bin/env node

const { ExtensionSDK } = require('@ghost/extension-sdk');
const path = require('path');

const Colors = {
    GREEN: '\x1b[32m',
    FAIL: '\x1b[31m',
    BOLD: '\x1b[1m',
    ENDC: '\x1b[0m'
};

class ProjectAnalyzer {
    constructor(sdk) { this.sdk = sdk; }
    async detectStack() {
        const rootFiles = await this.sdk.emitIntent({ type: 'filesystem', operation: 'readdir', params: { path: '.' } });
        const languages = [];
        if (rootFiles.includes('package.json')) languages.push('Node.js');
        if (rootFiles.includes('requirements.txt')) languages.push('Python');
        return { languages };
    }
    async getFileTree() {
        const entries = await this.sdk.emitIntent({ type: 'filesystem', operation: 'readdir', params: { path: '.' } });
        return entries.filter(e => !['node_modules', '.git'].includes(e));
    }
}

class DocsExtension {
    constructor(sdk) {
        this.sdk = sdk;
        this.analyzer = new ProjectAnalyzer(sdk);
        this.AI_PROVIDERS = {
            anthropic: { hostname: "api.anthropic.com", path: "/v1/messages" }
        };
    }

    async _resolveAIConfig(flags) {
        const config = await this.sdk.requestConfig().catch(() => ({}));
        return {
            provider: flags.provider || config.ai?.provider || 'anthropic',
            apiKey: flags.apiKey || flags['api-key'] || config.ai?.apiKey,
            model: flags.model || config.ai?.model || 'claude-sonnet-4-6'
        };
    }

    async handleInit(params) {
        try {
            const { provider, apiKey, model } = await this._resolveAIConfig(params.flags || {});
            if (!apiKey) throw new Error('API Key missing');

            const stack = await this.analyzer.detectStack();
            const structure = await this.analyzer.getFileTree();

            const prompt = `Generate a README.md for this project. Stack: ${JSON.stringify(stack)}. Files: ${JSON.stringify(structure)}. Output ONLY markdown content.`;
            
            const readmeContent = await this.callAI(provider, apiKey, model, "Technical Writer", prompt);
            
            if (readmeContent.includes('"error"')) {
                throw new Error(`AI Provider Error: ${readmeContent}`);
            }

            await this.sdk.requestFileWrite({ path: 'README.md', content: readmeContent });
            return { success: true, output: `${Colors.GREEN}✓ README.md generated with ${model}.${Colors.ENDC}` };
        } catch (error) {
            return { success: false, output: `${Colors.FAIL}Error:${Colors.ENDC} ${error.message}` };
        }
    }

    async callAI(provider, apiKey, model, systemPrompt, userPrompt) {
        const config = this.AI_PROVIDERS[provider];
        const payload = {
            model: model,
            max_tokens: 4096,
            messages: [{ role: "user", content: userPrompt }],
            system: systemPrompt,
            temperature: 0
        };

        const response = await this.sdk.requestNetworkCall({
            url: `https://${config.hostname}${config.path}`,
            method: 'POST',
            headers: { 
                'x-api-key': apiKey, 
                'anthropic-version': '2023-06-01',
                'Content-Type': 'application/json' 
            },
            body: JSON.stringify(payload)
        });

        const data = JSON.parse(response);
        if (data.error) return JSON.stringify(data);
        return data.content?.[0]?.text || response;
    }

    async handleRPCRequest(request) {
        if (request.method === 'docs.init') return await this.handleInit(request.params);
        return { error: { code: -32601, message: 'Method not found' } };
    }
}

module.exports = { DocsExtension };
