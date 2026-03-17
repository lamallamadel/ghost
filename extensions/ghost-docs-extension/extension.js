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

    async handleGenerate(params) {
        try {
            const target = params.args?.[0];
            if (!target) return { success: false, output: `${Colors.FAIL}Error:${Colors.ENDC} Please specify a source file to document.` };

            const { provider, apiKey, model } = await this._resolveAIConfig(params.flags || {});
            if (!apiKey) throw new Error('API Key missing. Run ghost setup.');

            const content = await this.sdk.requestFileRead({ path: target });
            const prompt = `Generate clear JSDoc/TSDoc comments and a markdown usage section for the following code. Output ONLY the annotated code file.\n\n${content}`;

            const documented = await this.callAI(provider, apiKey, model, "Technical Documentation Expert", prompt);
            const outPath = target.replace(/(\.[^.]+)$/, '.documented$1');
            await this.sdk.requestFileWrite({ path: outPath, content: documented });

            return { success: true, output: `${Colors.GREEN}✓ Documented file written to ${outPath}${Colors.ENDC}` };
        } catch (error) {
            return { success: false, output: `${Colors.FAIL}Error:${Colors.ENDC} ${error.message}` };
        }
    }

    async handleDiagram(params) {
        try {
            const target = params.args?.[0] || '.';
            const stack = await this.analyzer.detectStack();
            const files = await this.analyzer.getFileTree();

            const { provider, apiKey, model } = await this._resolveAIConfig(params.flags || {});
            if (!apiKey) throw new Error('API Key missing. Run ghost setup.');

            const prompt = `Generate a Mermaid architecture diagram for this project. Stack: ${JSON.stringify(stack)}. Files: ${JSON.stringify(files.slice(0, 30))}. Output ONLY the mermaid code block (no explanations).`;
            const diagram = await this.callAI(provider, apiKey, model, "Software Architect", prompt);

            const outPath = 'docs/architecture.md';
            const mdContent = `# Architecture Diagram\n\nGenerated by Ghost Docs.\n\n${diagram}`;
            await this.sdk.requestFileWrite({ path: outPath, content: mdContent });

            return { success: true, output: `${Colors.GREEN}✓ Architecture diagram saved to ${outPath}${Colors.ENDC}` };
        } catch (error) {
            return { success: false, output: `${Colors.FAIL}Error:${Colors.ENDC} ${error.message}` };
        }
    }

    async handleChat(params) {
        try {
            const question = params.args?.join(' ');
            if (!question) return { success: false, output: `${Colors.FAIL}Error:${Colors.ENDC} Please provide a question about the codebase.` };

            const { provider, apiKey, model } = await this._resolveAIConfig(params.flags || {});
            if (!apiKey) throw new Error('API Key missing. Run ghost setup.');

            const stack = await this.analyzer.detectStack();
            const files = await this.analyzer.getFileTree();

            const context = `Project stack: ${JSON.stringify(stack)}. Top-level files: ${JSON.stringify(files.slice(0, 20))}.`;
            const prompt = `${context}\n\nDeveloper question: ${question}`;

            const answer = await this.callAI(provider, apiKey, model, "Codebase Documentation Assistant", prompt);
            return { success: true, output: answer };
        } catch (error) {
            return { success: false, output: `${Colors.FAIL}Error:${Colors.ENDC} ${error.message}` };
        }
    }

    async handleRPCRequest(request) {
        const { method, params = {} } = request;
        switch (method) {
            case 'docs.init': return await this.handleInit(params);
            case 'docs.generate': return await this.handleGenerate(params);
            case 'docs.diagram': return await this.handleDiagram(params);
            case 'docs.chat': return await this.handleChat(params);
            default: return { error: { code: -32601, message: 'Method not found' } };
        }
    }
}

module.exports = { DocsExtension };
