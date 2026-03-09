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
    }

    async handleRun(params) {
        const target = params.args?.[0] || '';
        await this.sdk.requestLog({ level: 'info', message: `Running tests${target ? ' for ' + target : ''}...` });

        try {
            // Use process:spawn to run npm test
            // In Ghost, we usually delegate this to the core which has rights to spawn
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

    async handleRPCRequest(request) {
        const { method, params = {} } = request;
        try {
            switch (method) {
                case 'test.run': return await this.handleRun(params);
                case 'test.gen': return { success: true, output: 'Test generation pending Phase 2.' };
                case 'test.coverage': return { success: true, output: 'Coverage reporting pending Phase 3.' };
                default: throw new Error(`Unknown method: ${method}`);
            }
        } catch (error) {
            return { error: { code: -32603, message: error.message } };
        }
    }
}

module.exports = { TestExtension };
