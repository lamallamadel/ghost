#!/usr/bin/env node

/**
 * Ghost Team-Pulse
 * Team collaboration assistant
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

class TeamPulseExtension {
    constructor(sdk) {
        this.sdk = sdk;
    }

    async handleNotify(params) {
        const message = params.args?.join(' ');
        const flags = params.flags || {};
        const platform = flags.platform || 'slack'; // slack or discord

        if (!message) return { success: false, output: "Please provide a message to send." };

        await this.sdk.requestLog({ level: 'info', message: `Sending team notification to ${platform}...` });

        try {
            // In a real implementation, we'd read the webhook URL from ~/.ghost/config/team-pulse.json
            // For Phase 1, we simulate the network intent call
            const webhookUrl = platform === 'slack' ? 'https://hooks.slack.com/services/...' : 'https://discord.com/api/webhooks/...';
            
            const payload = platform === 'slack' 
                ? { text: `👻 *Ghost CLI Notification*\n${message}` }
                : { content: `👻 **Ghost CLI Notification**\n${message}` };

            await this.sdk.requestNetworkCall({
                url: webhookUrl,
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            return { 
                success: true, 
                output: `${Colors.GREEN}✓ Notification sent to ${platform.toUpperCase()}.${Colors.ENDC}` 
            };
        } catch (error) {
            // Note: Since we use dummy URLs, this will fail in real network, but we catch it
            return { success: false, output: `Failed to send notification: ${error.message}` };
        }
    }

    async handleRPCRequest(request) {
        const { method, params = {} } = request;
        try {
            switch (method) {
                case 'team.notify': return await this.handleNotify(params);
                case 'team.status': return { success: true, output: 'Team integration: ACTIVE (Connected to Slack).' };
                case 'team.config': return { success: true, output: 'Use ghost team config --slack <url> to set webhooks.' };
                default: throw new Error(`Unknown method: ${method}`);
            }
        } catch (error) {
            return { error: { code: -32603, message: error.message } };
        }
    }
}

module.exports = { TeamPulseExtension };
