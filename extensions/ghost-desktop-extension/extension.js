#!/usr/bin/env node

/**
 * Ghost Desktop Extension
 * Manages the Desktop Console UI and unifies it with the CLI
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

class DesktopExtension {
    constructor(sdk) {
        this.sdk = sdk;
    }

    async handleConsole(params) {
        const subcommand = params.subcommand || 'start';
        const flags = params.flags || {};

        if (subcommand === 'start') {
            await this.sdk.requestLog({ level: 'info', message: 'Starting Ghost Desktop Console...' });
            
            // 1. Tell core to start telemetry server (we use a custom intent we'll add to core)
            try {
                await this.sdk.emitIntent({
                    type: 'system',
                    operation: 'telemetry-start',
                    params: { port: parseInt(flags.port) || 9876 }
                });
            } catch (e) {
                await this.sdk.requestLog({ level: 'warn', message: 'Could not trigger core telemetry server start. It might already be running.' });
            }

            // 2. Launch Electron
            if (!flags['no-ui']) {
                try {
                    await this._launchElectron();
                    return { success: true, output: `${Colors.GREEN}✓ Ghost Desktop Console launched.${Colors.ENDC}` };
                } catch (error) {
                    return { success: false, output: `${Colors.FAIL}Failed to launch UI:${Colors.ENDC} ${error.message}` };
                }
            }

            return { success: true, output: `${Colors.GREEN}✓ Telemetry server requested.${Colors.ENDC}` };
        }

        return { success: false, output: `Unknown subcommand: ${subcommand}` };
    }

    async _launchElectron() {
        const desktopDir = __dirname;
        // In a real Ghost env, the extension uses process:spawn intent
        await this.sdk.emitIntent({
            type: 'process',
            operation: 'spawn',
            params: {
                command: 'npm',
                args: ['run', 'desktop:start'],
                options: { cwd: desktopDir }
            }
        });
    }

    async handleRPCRequest(request) {
        const { method, params = {} } = request;
        try {
            switch (method) {
                case 'desktop.console': return await this.handleConsole(params);
                default: throw new Error(`Unknown method: ${method}`);
            }
        } catch (error) {
            return { error: { code: -32603, message: error.message } };
        }
    }
}

module.exports = { DesktopExtension };
