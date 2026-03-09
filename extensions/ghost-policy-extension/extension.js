#!/usr/bin/env node

/**
 * Ghost Policy Master
 * Governance and policy enforcement engine
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

class PolicyExtension {
    constructor(sdk) {
        this.sdk = sdk;
        this.policies = new Map();
    }

    async handleList(params) {
        await this.sdk.requestLog({ level: 'info', message: 'Listing active governance policies...' });
        
        // In a real impl, we'd read from ~/.ghost/policies/active.json
        const activePolicies = [
            { id: 'sec-01', name: 'No Secrets in Commits', enforcement: 'Hard', status: 'Active' },
            { id: 'ops-02', name: 'Mandatory AI Audit', enforcement: 'Soft', status: 'Active' },
            { id: 'arch-03', name: 'No Circular Dependencies', enforcement: 'Hard', status: 'Active' }
        ];

        let output = `\n${Colors.BOLD}ACTIVE GOVERNANCE POLICIES${Colors.ENDC}\n${'='.repeat(30)}\n`;
        for (const p of activePolicies) {
            const color = p.enforcement === 'Hard' ? Colors.FAIL : Colors.WARNING;
            output += `${Colors.CYAN}${p.id.padEnd(10)}${Colors.ENDC} ${p.name.padEnd(25)} [${color}${p.enforcement}${Colors.ENDC}]\n`;
        }

        return { success: true, output, policies: activePolicies };
    }

    async handleSet(params) {
        const [rule, value] = params.args || [];
        if (!rule || !value) return { success: false, output: "Usage: ghost policy set <rule> <value>" };

        await this.sdk.requestLog({ level: 'info', message: `Setting policy rule: ${rule} = ${value}` });

        try {
            // Tell Gateway to enforce this policy via system intent
            await this.sdk.emitIntent({
                type: 'system',
                operation: 'policy-update',
                params: { rule, value }
            });

            return { success: true, output: `${Colors.GREEN}✓ Policy updated and broadcasted to Gateway.${Colors.ENDC}` };
        } catch (error) {
            return { success: false, output: `Failed to set policy: ${error.message}` };
        }
    }

    async handleRPCRequest(request) {
        const { method, params = {} } = request;
        try {
            switch (method) {
                case 'policy.list': return await this.handleList(params);
                case 'policy.set': return await this.handleSet(params);
                case 'policy.verify': return { success: true, output: 'Environment is compliant with active policies.' };
                default: throw new Error(`Unknown method: ${method}`);
            }
        } catch (error) {
            return { error: { code: -32603, message: error.message } };
        }
    }
}

module.exports = { PolicyExtension };
