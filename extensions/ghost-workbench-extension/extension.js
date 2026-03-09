#!/usr/bin/env node

/**
 * Ghost Workbench Extension
 * Visual Command Center
 */

const { ExtensionSDK } = require('@ghost/extension-sdk');
const path = require('path');

const Colors = {
    GREEN: '\x1b[32m',
    CYAN: '\x1b[36m',
    BOLD: '\x1b[1m',
    MAGENTA: '\x1b[35m',
    ENDC: '\x1b[0m'
};

class WorkbenchExtension {
    constructor(sdk) {
        this.sdk = sdk;
    }

    async handleOpen(params) {
        await this.sdk.requestLog({ level: 'info', message: 'Opening Unified Ghost Workbench...' });

        try {
            // 1. Sync state: Discovery of all active extensions for the UI
            const extensions = await this._discoverExtensions();
            
            // 2. Trigger Desktop Console start (if not running)
            await this.sdk.emitIntent({
                type: 'extension',
                operation: 'call',
                params: {
                    extensionId: 'ghost-desktop-extension',
                    method: 'desktop.console',
                    params: { subcommand: 'start' }
                }
            });

            let output = `\n${Colors.BOLD}${Colors.MAGENTA}GHOST WORKBENCH${Colors.ENDC}\n${'='.repeat(40)}\n`;
            output += `${Colors.GREEN}✓ Dashboard synchronized with ${extensions.length} extensions.${Colors.ENDC}\n`;
            output += `${Colors.CYAN}Ready to manage your development ecosystem visually.${Colors.ENDC}\n`;

            return { success: true, output, extensionCount: extensions.length };
        } catch (error) {
            return { success: false, output: `Failed to open Workbench: ${error.message}` };
        }
    }

    async _discoverExtensions() {
        const extensionsDir = 'extensions';
        const active = [];
        try {
            const dirs = await this.sdk.emitIntent({ type: 'filesystem', operation: 'readdir', params: { path: extensionsDir } });
            for (const dir of dirs) {
                try {
                    const manifestPath = path.join(extensionsDir, dir, 'manifest.json');
                    const content = await this.sdk.requestFileRead({ path: manifestPath });
                    active.push(JSON.parse(content));
                } catch (e) {}
            }
        } catch (e) {}
        return active;
    }

    async handleRPCRequest(request) {
        const { method, params = {} } = request;
        try {
            switch (method) {
                case 'workbench.open': return await this.handleOpen(params);
                case 'workbench.status': return { success: true, output: 'Workbench: READY' };
                case 'workbench.layout': return { success: true, output: 'Custom layout saved.' };
                default: throw new Error(`Unknown method: ${method}`);
            }
        } catch (error) {
            return { error: { code: -32603, message: error.message } };
        }
    }
}

module.exports = { WorkbenchExtension };
