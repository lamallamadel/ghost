#!/usr/bin/env node

/**
 * Ghost Workbench Extension
 * Visual Command Center — extension dashboard and layout management
 */

const { ExtensionSDK } = require('@ghost/extension-sdk');
const os = require('os');
const path = require('path');

const Colors = {
    GREEN: '\x1b[32m',
    CYAN: '\x1b[36m',
    BOLD: '\x1b[1m',
    MAGENTA: '\x1b[35m',
    WARNING: '\x1b[33m',
    FAIL: '\x1b[31m',
    ENDC: '\x1b[0m'
};

const LAYOUT_CONFIG_PATH = path.join(os.homedir(), '.ghost', 'config', 'workbench-layout.json');

class WorkbenchExtension {
    constructor(sdk) {
        this.sdk = sdk;
    }

    async handleOpen(params) {
        await this.sdk.requestLog({ level: 'info', message: 'Opening Ghost Workbench...' });

        try {
            const extensions = await this._discoverExtensions();

            // Trigger Desktop Console if available
            try {
                await this.sdk.emitIntent({
                    type: 'extension',
                    operation: 'call',
                    params: {
                        extensionId: 'ghost-desktop-extension',
                        method: 'desktop.console',
                        params: { subcommand: 'start' }
                    }
                });
            } catch (e) {
                await this.sdk.requestLog({ level: 'warn', message: `Desktop console unavailable: ${e.message}` });
            }

            let output = `\n${Colors.BOLD}${Colors.MAGENTA}GHOST WORKBENCH${Colors.ENDC}\n${'='.repeat(40)}\n`;
            output += `${Colors.GREEN}✓ Dashboard synchronized with ${extensions.length} extension(s).${Colors.ENDC}\n\n`;

            output += `${Colors.BOLD}Registered Extensions:${Colors.ENDC}\n`;
            for (const ext of extensions) {
                output += `  ${Colors.CYAN}${ext.id}${Colors.ENDC} v${ext.version || '?'} — ${ext.name || ''}\n`;
            }

            return { success: true, output, extensionCount: extensions.length };
        } catch (error) {
            return { success: false, output: `Failed to open Workbench: ${error.message}` };
        }
    }

    async handleStatus(params) {
        const extensions = await this._discoverExtensions();
        const layout = await this._readLayout();
        const panels = layout.panels || [];

        let output = `\n${Colors.BOLD}WORKBENCH STATUS${Colors.ENDC}\n${'='.repeat(40)}\n`;
        output += `${Colors.CYAN}Extensions discovered:${Colors.ENDC} ${extensions.length}\n`;
        output += `${Colors.CYAN}Saved layout panels:${Colors.ENDC}  ${panels.length}\n`;

        const healthy = extensions.filter(e => e.id && e.version).length;
        const degraded = extensions.length - healthy;
        if (degraded > 0) {
            output += `${Colors.WARNING}⚠ ${degraded} extension(s) have incomplete manifests.${Colors.ENDC}\n`;
        } else if (extensions.length > 0) {
            output += `${Colors.GREEN}✓ All extensions have valid manifests.${Colors.ENDC}\n`;
        }

        return { success: true, output, extensionCount: extensions.length };
    }

    async handleLayout(params) {
        const flags = params.flags || {};
        const action = params.args?.[0] || 'show';

        if (action === 'show') {
            const layout = await this._readLayout();
            let output = `\n${Colors.BOLD}WORKBENCH LAYOUT${Colors.ENDC}\n${'='.repeat(40)}\n`;
            if (Object.keys(layout).length === 0) {
                output += `${Colors.WARNING}No layout saved yet. Use "ghost workbench layout set --panels <list>".${Colors.ENDC}\n`;
            } else {
                output += JSON.stringify(layout, null, 2) + '\n';
            }
            return { success: true, output };
        }

        if (action === 'set') {
            const panels = (flags.panels || '').split(',').map(s => s.trim()).filter(Boolean);
            const theme = flags.theme || 'default';
            const layout = { panels, theme, updatedAt: new Date().toISOString() };

            await this.sdk.requestFileWrite({
                path: LAYOUT_CONFIG_PATH,
                content: JSON.stringify(layout, null, 2)
            });

            return {
                success: true,
                output: `${Colors.GREEN}✓ Layout saved: ${panels.length} panel(s), theme="${theme}".${Colors.ENDC}`
            };
        }

        if (action === 'reset') {
            await this.sdk.requestFileWrite({ path: LAYOUT_CONFIG_PATH, content: '{}' });
            return { success: true, output: `${Colors.GREEN}✓ Layout reset to defaults.${Colors.ENDC}` };
        }

        return { success: false, output: `Unknown layout action: ${action}. Use show|set|reset.` };
    }

    async _readLayout() {
        try {
            const content = await this.sdk.requestFileRead({ path: LAYOUT_CONFIG_PATH });
            return JSON.parse(content);
        } catch (e) {
            return {};
        }
    }

    async _discoverExtensions() {
        const extensionsDir = 'extensions';
        const active = [];
        try {
            const dirs = await this.sdk.emitIntent({
                type: 'filesystem',
                operation: 'readdir',
                params: { path: extensionsDir }
            });
            for (const dir of dirs) {
                try {
                    const manifestPath = path.join(extensionsDir, dir, 'manifest.json');
                    const content = await this.sdk.requestFileRead({ path: manifestPath });
                    active.push(JSON.parse(content));
                } catch (e) {
                    await this.sdk.requestLog({ level: 'debug', message: `Skipping ${dir}: ${e.message}` });
                }
            }
        } catch (e) {
            await this.sdk.requestLog({ level: 'warn', message: `Could not read extensions directory: ${e.message}` });
        }
        return active;
    }

    async handleRPCRequest(request) {
        const { method, params = {} } = request;
        try {
            switch (method) {
                case 'workbench.open': return await this.handleOpen(params);
                case 'workbench.status': return await this.handleStatus(params);
                case 'workbench.layout': return await this.handleLayout(params);
                default: throw new Error(`Unknown method: ${method}`);
            }
        } catch (error) {
            return { error: { code: -32603, message: error.message } };
        }
    }
}

module.exports = { WorkbenchExtension };
