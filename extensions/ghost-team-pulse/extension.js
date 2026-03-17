#!/usr/bin/env node

/**
 * Ghost Team-Pulse
 * Team collaboration assistant — real Slack/Discord webhook delivery
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

const CONFIG_PATH = path.join(os.homedir(), '.ghost', 'config', 'team-pulse.json');

class TeamPulseExtension {
    constructor(sdk) {
        this.sdk = sdk;
    }

    async _readConfig() {
        try {
            const content = await this.sdk.requestFileRead({ path: CONFIG_PATH });
            return JSON.parse(content);
        } catch (e) {
            return {};
        }
    }

    async _writeConfig(config) {
        await this.sdk.requestFileWrite({
            path: CONFIG_PATH,
            content: JSON.stringify(config, null, 2)
        });
    }

    async handleNotify(params) {
        const message = params.args?.join(' ');
        const flags = params.flags || {};
        const platform = flags.platform || flags.p || 'slack';

        if (!message) return { success: false, output: 'Please provide a message to send.' };

        const config = await this._readConfig();
        const webhookUrl = flags.webhook || config[platform]?.webhookUrl;

        if (!webhookUrl) {
            return {
                success: false,
                output: `${Colors.FAIL}No webhook URL configured for ${platform}.${Colors.ENDC}\nRun: ghost team config --platform ${platform} --webhook <url>`
            };
        }

        await this.sdk.requestLog({ level: 'info', message: `Sending notification to ${platform}...` });

        const payload = platform === 'discord'
            ? { content: `**Ghost CLI** ${message}` }
            : { text: `*Ghost CLI* ${message}` };

        try {
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
            return { success: false, output: `Failed to send notification: ${error.message}` };
        }
    }

    async handleStatus(params) {
        const config = await this._readConfig();
        const platforms = Object.keys(config);

        let output = `\n${Colors.BOLD}TEAM-PULSE STATUS${Colors.ENDC}\n${'='.repeat(30)}\n`;

        if (platforms.length === 0) {
            output += `${Colors.WARNING}No platforms configured. Run "ghost team config" to set up webhooks.${Colors.ENDC}\n`;
        } else {
            for (const platform of platforms) {
                const cfg = config[platform];
                const hasUrl = !!cfg.webhookUrl;
                const statusColor = hasUrl ? Colors.GREEN : Colors.WARNING;
                output += `${Colors.CYAN}${platform}:${Colors.ENDC} ${statusColor}${hasUrl ? 'Configured' : 'Missing webhook URL'}${Colors.ENDC}\n`;
                if (cfg.channel) output += `  Channel: ${cfg.channel}\n`;
            }
        }

        return { success: true, output };
    }

    async handleConfig(params) {
        const flags = params.flags || {};
        const platform = flags.platform || flags.p || 'slack';
        const webhookUrl = flags.webhook || flags.w;
        const channel = flags.channel || flags.c;

        if (!webhookUrl && !channel) {
            return {
                success: false,
                output: `Usage: ghost team config --platform <slack|discord> --webhook <url> [--channel <name>]`
            };
        }

        const config = await this._readConfig();
        if (!config[platform]) config[platform] = {};

        if (webhookUrl) config[platform].webhookUrl = webhookUrl;
        if (channel) config[platform].channel = channel;

        await this._writeConfig(config);

        return {
            success: true,
            output: `${Colors.GREEN}✓ ${platform} webhook configured and saved to ${CONFIG_PATH}${Colors.ENDC}`
        };
    }

    async handleRPCRequest(request) {
        const { method, params = {} } = request;
        try {
            switch (method) {
                case 'team.notify': return await this.handleNotify(params);
                case 'team.status': return await this.handleStatus(params);
                case 'team.config': return await this.handleConfig(params);
                default: throw new Error(`Unknown method: ${method}`);
            }
        } catch (error) {
            return { error: { code: -32603, message: error.message } };
        }
    }
}

module.exports = { TeamPulseExtension };
