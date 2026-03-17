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
    DIM: '\x1b[2m',
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

    async _loadRegistry(profile) {
        // Try to fetch from registry URL, fall back to local cache
        const url = resolveRegistryUrl(profile);
        try {
            const response = await this.sdk.requestNetworkCall({
                url: `${url}/extensions`,
                method: 'GET',
                headers: { 'Accept': 'application/json' }
            });
            return JSON.parse(response);
        } catch (e) {
            // Network unavailable — try local cache
            try {
                const cachePath = path.join(os.homedir(), '.ghost', 'marketplace-cache', 'registry.json');
                const content = await this.sdk.requestFileRead({ path: cachePath });
                return JSON.parse(content);
            } catch (e2) {
                throw new Error(`Marketplace registry unavailable (tried ${url} and local cache).`);
            }
        }
    }

    async handleSearch(params) {
        const query = params.args?.join(' ') || '';
        if (!query) return { success: false, output: 'Please specify a search query.' };
        await this.sdk.requestLog({ level: 'info', message: `Searching marketplace for: ${query}` });

        try {
            const registry = await this._loadRegistry(params.flags?.profile);
            const results = (registry.extensions || []).filter(e =>
                e.id.includes(query) || (e.name || '').toLowerCase().includes(query.toLowerCase()) ||
                (e.description || '').toLowerCase().includes(query.toLowerCase())
            );

            let output = `\n${Colors.BOLD}SEARCH RESULTS: "${query}"${Colors.ENDC}\n${'='.repeat(40)}\n`;
            if (results.length === 0) {
                output += `${Colors.WARNING}No extensions found matching "${query}".${Colors.ENDC}\n`;
            } else {
                for (const ext of results) {
                    output += `${Colors.BOLD}${ext.name || ext.id}${Colors.ENDC} — ${ext.description || ''}\n`;
                    output += `  ID: ${ext.id}  Version: ${ext.latestVersion || '?'}\n\n`;
                }
            }
            return { success: true, output, count: results.length };
        } catch (error) {
            return { success: false, output: `Search failed: ${error.message}` };
        }
    }

    async handleInfo(params) {
        const extensionId = params.args?.[0];
        if (!extensionId) return { success: false, output: 'Please specify an extension ID.' };

        try {
            const registry = await this._loadRegistry(params.flags?.profile);
            const ext = (registry.extensions || []).find(e => e.id === extensionId);
            if (!ext) return { success: false, output: `Extension '${extensionId}' not found.` };

            let output = `\n${Colors.BOLD}${ext.name || ext.id}${Colors.ENDC}\n${'='.repeat(40)}\n`;
            output += `${Colors.CYAN}ID:${Colors.ENDC}          ${ext.id}\n`;
            output += `${Colors.CYAN}Version:${Colors.ENDC}     ${ext.latestVersion || '?'}\n`;
            output += `${Colors.CYAN}Description:${Colors.ENDC} ${ext.description || 'N/A'}\n`;
            output += `${Colors.CYAN}Author:${Colors.ENDC}      ${ext.author || 'Unknown'}\n`;
            output += `${Colors.CYAN}Verified:${Colors.ENDC}    ${ext.verified ? Colors.GREEN + 'Yes' : Colors.WARNING + 'No'}${Colors.ENDC}\n`;
            return { success: true, output };
        } catch (error) {
            return { success: false, output: `Info failed: ${error.message}` };
        }
    }

    async handleUpdate(params) {
        const extensionId = params.args?.[0];
        if (!extensionId) return { success: false, output: 'Please specify an extension to update.' };
        await this.sdk.requestLog({ level: 'info', message: `Updating extension: ${extensionId}` });

        try {
            const registry = await this._loadRegistry(params.flags?.profile);
            const extInfo = (registry.extensions || []).find(e => e.id === extensionId);
            if (!extInfo) return { success: false, output: `Extension '${extensionId}' not found in registry.` };

            const manifestPath = path.join('extensions', extensionId, 'manifest.json');
            let currentVersion = null;
            try {
                const current = await this.sdk.requestFileRead({ path: manifestPath });
                currentVersion = JSON.parse(current).version;
            } catch (e) { /* not installed */ }

            if (currentVersion && currentVersion === extInfo.latestVersion) {
                return { success: true, output: `${Colors.GREEN}✓ ${extensionId} is already up to date (${currentVersion}).${Colors.ENDC}` };
            }

            // Re-install latest
            const installResult = await this.handleInstall({ ...params, args: [extensionId] });
            if (installResult.success) {
                return { success: true, output: `${Colors.GREEN}✓ ${extensionId} updated to ${extInfo.latestVersion}.${Colors.ENDC}` };
            }
            return installResult;
        } catch (error) {
            return { success: false, output: `Update failed: ${error.message}` };
        }
    }

    async handleUninstall(params) {
        const extensionId = params.args?.[0];
        if (!extensionId) return { success: false, output: 'Please specify an extension to uninstall.' };

        try {
            const targetDir = path.join('extensions', extensionId);
            const entries = await this.sdk.emitIntent({
                type: 'filesystem', operation: 'readdir', params: { path: targetDir }
            });
            for (const entry of entries) {
                await this.sdk.emitIntent({
                    type: 'filesystem', operation: 'unlink',
                    params: { path: path.join(targetDir, entry) }
                });
            }
            return { success: true, output: `${Colors.GREEN}✓ Extension '${extensionId}' uninstalled.${Colors.ENDC}` };
        } catch (error) {
            return { success: false, output: `Uninstall failed: ${error.message}` };
        }
    }

    async handleRate(params) {
        const extensionId = params.args?.[0];
        const rating = parseInt(params.flags?.rating || params.args?.[1]);
        if (!extensionId || !rating || rating < 1 || rating > 5) {
            return { success: false, output: 'Usage: ghost marketplace rate <id> --rating <1-5>' };
        }

        const profile = params.flags?.profile || null;
        const authToken = readAuthToken(profile);
        if (!authToken) return { success: false, output: `${Colors.WARNING}Not logged in. Run "ghost marketplace login" first.${Colors.ENDC}` };

        try {
            const url = resolveRegistryUrl(profile);
            await this.sdk.requestNetworkCall({
                url: `${url}/extensions/${extensionId}/ratings`,
                method: 'POST',
                headers: { 'Authorization': `Bearer ${authToken}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ rating })
            });
            return { success: true, output: `${Colors.GREEN}✓ Rated ${extensionId} ${rating}/5.${Colors.ENDC}` };
        } catch (error) {
            return { success: false, output: `Rating failed: ${error.message}` };
        }
    }

    async handleSync(params) {
        await this.sdk.requestLog({ level: 'info', message: 'Syncing installed extensions with registry...' });
        try {
            const registry = await this._loadRegistry(params.flags?.profile);
            const installed = [];
            try {
                const dirs = await this.sdk.emitIntent({ type: 'filesystem', operation: 'readdir', params: { path: 'extensions' } });
                for (const dir of dirs) {
                    try {
                        const manifest = JSON.parse(await this.sdk.requestFileRead({ path: path.join('extensions', dir, 'manifest.json') }));
                        installed.push(manifest);
                    } catch (e) { /* skip */ }
                }
            } catch (e) { /* no extensions dir */ }

            const updates = [];
            for (const inst of installed) {
                const remote = (registry.extensions || []).find(e => e.id === inst.id);
                if (remote && remote.latestVersion && remote.latestVersion !== inst.version) {
                    updates.push({ id: inst.id, current: inst.version, latest: remote.latestVersion });
                }
            }

            let output = `\n${Colors.BOLD}MARKETPLACE SYNC${Colors.ENDC}\n${'='.repeat(40)}\n`;
            output += `${installed.length} extension(s) installed. ${updates.length} update(s) available.\n`;
            for (const u of updates) {
                output += `  ${Colors.WARNING}↑${Colors.ENDC} ${u.id}: ${u.current} → ${u.latest}\n`;
            }
            if (updates.length === 0) output += `${Colors.GREEN}✓ All extensions up to date.${Colors.ENDC}\n`;
            return { success: true, output, updates };
        } catch (error) {
            return { success: false, output: `Sync failed: ${error.message}` };
        }
    }

    async handleRPCRequest(request) {
        const { method, params = {} } = request;
        try {
            switch (method) {
                case 'marketplace.browse': return await this.handleBrowse(params);
                case 'marketplace.search': return await this.handleSearch(params);
                case 'marketplace.info': return await this.handleInfo(params);
                case 'marketplace.install': return await this.handleInstall(params);
                case 'marketplace.update': return await this.handleUpdate(params);
                case 'marketplace.uninstall': return await this.handleUninstall(params);
                case 'marketplace.rate': return await this.handleRate(params);
                case 'marketplace.sync': return await this.handleSync(params);
                case 'marketplace.refresh': return await this.handleSync(params); // alias
                default: throw new Error(`Unknown method: ${method}`);
            }
        } catch (error) {
            return { error: { code: -32603, message: error.message } };
        }
    }
}

module.exports = { MarketplaceExtension };
