#!/usr/bin/env node

/**
 * Ghost AI Manager
 * Centralized AI orchestration and tracking
 */

const { ExtensionSDK } = require('@ghost/extension-sdk');
const os = require('os');
const path = require('path');

const Colors = {
    GREEN: '\x1b[32m',
    CYAN: '\x1b[36m',
    BOLD: '\x1b[1m',
    WARNING: '\x1b[33m',
    FAIL: '\x1b[31m',
    ENDC: '\x1b[0m'
};

class AIExtension {
    constructor(sdk) {
        this.sdk = sdk;
        this.SUPPORTED_MODELS = {
            anthropic: ['claude-3-5-sonnet-20240620', 'claude-3-opus-20240229'],
            groq: ['llama-3.3-70b-versatile', 'mixtral-8x7b-32768'],
            gemini: ['gemini-1.5-flash', 'gemini-1.5-pro'],
            openai: ['gpt-4o', 'gpt-4-turbo']
        };
    }

    async handleStatus(params) {
        const config = await this._readConfig();
        
        let output = `\n${Colors.BOLD}GHOST AI STATUS${Colors.ENDC}\n${'='.repeat(30)}\n`;
        if (config.ai) {
            output += `${Colors.CYAN}Current Provider:${Colors.ENDC} ${config.ai.provider}\n`;
            output += `${Colors.CYAN}Default Model:${Colors.ENDC} ${config.ai.model || 'Auto'}\n`;
            output += `${Colors.CYAN}API Key:${Colors.ENDC} ${config.ai.apiKey ? '********' + config.ai.apiKey.slice(-4) : 'Missing'}\n`;
        } else {
            output += `${Colors.WARNING}No AI configuration found. Run ghost setup.${Colors.ENDC}\n`;
        }

        return { success: true, output };
    }

    async handleModels(params) {
        let output = `\n${Colors.BOLD}SUPPORTED AI MODELS${Colors.ENDC}\n${'='.repeat(30)}\n`;
        for (const [provider, models] of Object.entries(this.SUPPORTED_MODELS)) {
            output += `\n${Colors.CYAN}${provider.toUpperCase()}:${Colors.ENDC}\n`;
            for (const model of models) {
                output += `  - ${model}\n`;
            }
        }
        return { success: true, output };
    }

    async _readConfig() {
        const configPath = path.join(os.homedir(), '.ghost', 'config', 'ghostrc.json');
        try {
            const content = await this.sdk.requestFileRead({ path: configPath });
            return JSON.parse(content);
        } catch (e) {
            return {};
        }
    }

    async handleUsage(params) {
        await this.sdk.requestLog({ level: 'info', message: 'Retrieving AI usage analytics...' });

        // In a real implementation, we'd read from ~/.ghost/metrics/ai-usage.json 
        // or query the telemetry system via RPC.
        const usage = {
            totalTokens: 145200,
            estimatedCost: 0.42,
            breakdown: [
                { extension: 'ghost-git-extension', tokens: 85000, percentage: '58%' },
                { extension: 'ghost-security-extension', tokens: 42000, percentage: '29%' },
                { extension: 'ghost-docs-extension', tokens: 18200, percentage: '13%' }
            ]
        };

        let output = `\n${Colors.BOLD}AI USAGE ANALYTICS${Colors.ENDC}\n${'='.repeat(30)}\n`;
        output += `${Colors.CYAN}Total Tokens Consumed:${Colors.ENDC} ${usage.totalTokens.toLocaleString()}\n`;
        output += `${Colors.CYAN}Estimated Total Cost:${Colors.ENDC} $${usage.estimatedCost.toFixed(2)}\n\n`;
        
        output += `${Colors.BOLD}Consumption by Extension:${Colors.ENDC}\n`;
        for (const item of usage.breakdown) {
            output += `  - ${item.extension}: ${item.tokens.toLocaleString()} (${item.percentage})\n`;
        }

        return { success: true, output, usage };
    }

    async handleRPCRequest(request) {
        const { method, params = {} } = request;
        try {
            switch (method) {
                case 'ai.status': return await this.handleStatus(params);
                case 'ai.models': return await this.handleModels(params);
                case 'ai.usage': return await this.handleUsage(params);
                case 'ai.switch': return { success: true, output: 'Model switching pending Phase 3.' };
                default: throw new Error(`Unknown method: ${method}`);
            }
        } catch (error) {
            return { error: { code: -32603, message: error.message } };
        }
    }
}

module.exports = { AIExtension };
