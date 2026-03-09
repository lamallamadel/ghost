#!/usr/bin/env node

/**
 * Ghost Cloud-Master
 * AI-powered infrastructure management
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

class CloudExtension {
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

    async handleDetect(params) {
        await this.sdk.requestLog({ level: 'info', message: 'Analyzing code for cloud resource requirements...' });

        try {
            // 1. Scan for hints of cloud dependencies
            const resources = {
                database: false,
                storage: false,
                compute: 'web',
                needs: []
            };

            const rootFiles = await this.sdk.emitIntent({ type: 'filesystem', operation: 'readdir', params: { path: '.' } });
            
            if (rootFiles.includes('package.json')) {
                const pkg = JSON.parse(await this.sdk.requestFileRead({ path: 'package.json' }));
                const deps = Object.keys(pkg.dependencies || {});
                if (deps.some(d => d.includes('aws-sdk') || d.includes('@aws-sdk'))) resources.needs.push('AWS SDK');
                if (deps.some(d => d.includes('pg') || d.includes('mysql') || d.includes('mongoose'))) resources.database = true;
                if (deps.some(d => d.includes('multer') || d.includes('s3'))) resources.storage = true;
            }

            const flags = params.flags || {};
            const { provider, apiKey, model } = this._resolveAIConfig(flags);

            let aiInsights = "";
            if (provider && apiKey) {
                const prompt = `Analyse ces besoins en ressources cloud pour une application et suggère les services AWS/GCP correspondants.\n\nRESSOURCES : ${JSON.stringify(resources)}`;
                aiInsights = await this.callAI(provider, apiKey, model, "Architecte Cloud Expert", prompt);
            }

            let output = `\n${Colors.BOLD}${Colors.CYAN}CLOUD-MASTER INFRASTRUCTURE DETECTION${Colors.ENDC}\n${'='.repeat(40)}\n`;
            output += `\n${Colors.BOLD}DETECTED REQUIREMENTS:${Colors.ENDC}\n`;
            output += `  - Compute: ${resources.compute}\n`;
            output += `  - Database: ${resources.database ? Colors.GREEN + 'YES' : 'NONE'}${Colors.ENDC}\n`;
            output += `  - Object Storage: ${resources.storage ? Colors.GREEN + 'YES' : 'NONE'}${Colors.ENDC}\n`;
            
            if (aiInsights) {
                output += `\n${Colors.BOLD}RECOMMENDED INFRASTRUCTURE (AI):${Colors.ENDC}\n${aiInsights}\n`;
            }

            return { success: true, output, resources };
        } catch (error) {
            return { success: false, output: `Detection failed: ${error.message}` };
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
        const payload = { model: actualModel, messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }], temperature: 0.1 };
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
                case 'cloud.detect': return await this.handleDetect(params);
                case 'cloud.generate': return { success: true, output: 'IaC generation pending Phase 2.' };
                case 'cloud.audit': return { success: true, output: 'Cost/Security audit pending Phase 3.' };
                default: throw new Error(`Unknown method: ${method}`);
            }
        } catch (error) {
            return { error: { code: -32603, message: error.message } };
        }
    }
}

module.exports = { CloudExtension };
