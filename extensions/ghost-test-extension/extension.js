#!/usr/bin/env node

/**
 * Ghost Test Master
 * AI-powered test automation
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

class TestExtension {
    constructor(sdk) {
        this.sdk = sdk;
        this.DEFAULT_MODEL = "llama-3.3-70b-versatile";
        this.AI_PROVIDERS = {
            groq: { hostname: "api.groq.com", path: "/openai/v1/chat/completions" },
            openai: { hostname: "api.openai.com", path: "/v1/chat/completions" },
            anthropic: { hostname: "api.anthropic.com", path: "/v1/messages" },
            gemini: { hostname: "generativelanguage.googleapis.com", path: "/v1beta/models/" }
        };
    }

    async handleRun(params) {
        const target = params.args?.[0] || '';
        await this.sdk.requestLog({ level: 'info', message: `Running tests${target ? ' for ' + target : ''}...` });

        try {
            const result = await this.sdk.emitIntent({
                type: 'process',
                operation: 'spawn',
                params: {
                    command: 'npm',
                    args: ['test', target].filter(Boolean),
                    options: { shell: true }
                }
            });

            return { 
                success: true, 
                output: `${Colors.GREEN}✓ Test execution completed.${Colors.ENDC}\n${result.stdout || ''}` 
            };
        } catch (error) {
            return { success: false, output: `${Colors.FAIL}Test execution failed:${Colors.ENDC} ${error.message}` };
        }
    }

    async handleGen(params) {
        const target = params.args?.[0];
        if (!target) return { success: false, output: "Please specify a source file to generate tests for." };

        await this.sdk.requestLog({ level: 'info', message: `Generating unit tests for: ${target}` });

        try {
            const content = await this.sdk.requestFileRead({ path: target });
            const { provider, apiKey, model } = this._resolveAIConfig(params.flags || {});
            
            if (!provider || !apiKey) throw new Error('AI Provider not configured. Run ghost setup.');

            const prompt = `Tu es un expert en tests unitaires. Génère une suite de tests complète et robuste pour le code suivant.
            Utilise le framework de test détecté ou par défaut (Vitest/Jest).
            
            CODE SOURCE (${target}) :
            ${content}
            
            Réponds UNIQUEMENT avec le contenu du fichier de test.`;

            const testContent = await this.callAI(provider, apiKey, model, "Expert en tests unitaires", prompt);
            
            const testPath = target.replace(/\.[^.]+$/, '.test.js');
            await this.sdk.requestFileWrite({ path: testPath, content: testContent });

            return { 
                success: true, 
                output: `${Colors.GREEN}✓ Tests generated successfully at ${testPath}${Colors.ENDC}` 
            };
        } catch (error) {
            return { success: false, output: `Generation failed: ${error.message}` };
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

    async handleRPCRequest(request) {
        const { method, params = {} } = request;
        try {
            switch (method) {
                case 'test.run': return await this.handleRun(params);
                case 'test.gen': return await this.handleGen(params);
                case 'test.coverage': return { success: true, output: 'Coverage reporting pending Phase 3.' };
                default: throw new Error(`Unknown method: ${method}`);
            }
        } catch (error) {
            return { error: { code: -32603, message: error.message } };
        }
    }
}

module.exports = { TestExtension };
