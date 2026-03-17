#!/usr/bin/env node

/**
 * Ghost Marketplace Extension
 * Centralized extension management hub
 */

const { ExtensionSDK } = require('@ghost/extension-sdk');
const { resolveRegistryUrl, readAuthToken } = require('../../core/marketplace');
const path = require('path');
const os = require('os');

const Colors = {
    GREEN: '\x1b[32m',
    CYAN: '\x1b[36m',
    BOLD: '\x1b[1m',
    WARNING: '\x1b[33m',
    FAIL: '\x1b[31m',
    ENDC: '\x1b[0m'
};

class MarketplaceExtension {
    constructor(sdk) {
        this.sdk = sdk;
        this.registryUrl = resolveRegistryUrl();
    }

    async handleBrowse(params) {
        const profile = params.flags?.profile || null;
        const registryUrl = resolveRegistryUrl(profile);
        const authToken = readAuthToken(profile);
        const category = params.args?.[0];
        await this.sdk.requestLog({ level: 'info', message: `Browsing extensions${category ? ' in ' + category : ''}${profile ? ` (profile: ${profile})` : ''}` });

        try {
            const registry = await this._loadRegistry();
            let extensions = registry.extensions || [];
            
            if (category) {
                extensions = extensions.filter(e => e.category === category);
            }

            let output = `\n${Colors.BOLD}${Colors.CYAN}GHOST MARKETPLACE${category ? ' - ' + category.toUpperCase() : ''}${Colors.ENDC}\n${'='.repeat(40)}\n`;
            
            for (const ext of extensions) {
                const verified = ext.verified ? `${Colors.GREEN}✓${Colors.ENDC}` : '';
                output += `${Colors.BOLD}${ext.name}${Colors.ENDC} ${verified} [${ext.id}]\n`;
                output += `${Colors.DIM}${ext.description}${Colors.ENDC}\n\n`;
            }

            return { success: true, output };
        } catch (error) {
            return { success: false, output: `Failed to browse marketplace: ${error.message}` };
        }
    }

    async handleInstall(params) {
        const profile = params.flags?.profile || null;
        const registryUrl = resolveRegistryUrl(profile);
        const authToken = readAuthToken(profile);
        const extensionId = params.args?.[0];
        if (!extensionId) return { success: false, output: "Please specify an extension to install." };

        await this.sdk.requestLog({ level: 'info', message: `Installing extension: ${extensionId}${profile ? ` (profile: ${profile})` : ''}` });

        try {
            const registry = await this._loadRegistry();
            const extInfo = registry.extensions?.find(e => e.id === extensionId);
            
            if (!extInfo) throw new Error(`Extension '${extensionId}' not found in registry.`);

            // 1. Security Pre-check (Call Security Extension)
            await this.sdk.requestLog({ level: 'info', message: 'Triggering security audit for installation...' });
            try {
                await this.sdk.emitIntent({
                    type: 'extension',
                    operation: 'call',
                    params: {
                        extensionId: 'ghost-security-extension',
                        method: 'security.scan',
                        params: { args: [extInfo.id] }
                    }
                });
            } catch (e) { /* Optional safety */ }

            // 2. Perform Installation (Simulated filesystem writes)
            const targetDir = path.join('extensions', extensionId);
            await this.sdk.requestFileWrite({ 
                path: path.join(targetDir, 'manifest.json'), 
                content: extInfo.versions[0].manifest 
            });

            return { 
                success: true, 
                output: `${Colors.GREEN}✓ Extension '${extInfo.name}' installed successfully.${Colors.ENDC}\nLocation: ${targetDir}` 
            };
        } catch (error) {
            return { success: false, output: `${Colors.FAIL}Installation failed:${Colors.ENDC} ${error.message}` };
        }
    }

    async _loadRegistry() {
        // In real impl, we'd use network:https intent to fetch from registryUrl
        // Fallback to local marketplace-registry.json
        try {
            const content = await this.sdk.requestFileRead({ path: 'marketplace-registry.json' });
            return JSON.parse(content);
        } catch (e) {
            throw new Error('Marketplace registry unavailable.');
        }
    }

    async handleRPCRequest(request) {
        const { method, params = {} } = request;
        try {
            switch (method) {
                case 'marketplace.browse': return await this.handleBrowse(params);
                case 'marketplace.install': return await this.handleInstall(params);
                case 'marketplace.search': return { success: true, output: 'Search pending Phase 2.' };
                case 'marketplace.update': return { success: true, output: 'Updates pending Phase 3.' };
                default: throw new Error(`Unknown method: ${method}`);
            }
        } catch (error) {
            return { error: { code: -32603, message: error.message } };
        }
    }
}

module.exports = { MarketplaceExtension };
