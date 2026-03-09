#!/usr/bin/env node

const { GitExtension } = require('./extension.js');
const { ExtensionSDK } = require('@ghost/extension-sdk');
const fs = require('fs');
const path = require('path');
const os = require('os');

const manifestPath = path.join(__dirname, 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

/**
 * Ghost Git Extension Wrapper
 * 
 * Provides an instance-based interface for the Ghost Core Gateway.
 * All domain logic is encapsulated in GitExtension, while this wrapper
 * manages initialization and routing to core-provided handlers.
 */
class ExtensionWrapper {
    constructor() {
        this.sdk = new ExtensionSDK(manifest.id);
        this.git = new GitExtension(this.sdk);
    }

    /**
     * Initialization hook called by core.
     */
    async init(options = {}) {
        // SDK handles IPC automatically via process.stdout/stdin
        return { success: true };
    }

    /**
     * Command: audit
     * Performs a full security audit of the repository.
     */
    async audit(params) {
        // Migration note: audit was part of GitExtension, now we use performFullAudit logic
        // For simplicity in this robust refactor, we expose what we have
        if (typeof this.git.audit === 'function') {
            return await this.git.audit(params);
        }
        return { success: false, output: 'Audit command not implemented in new architecture yet.' };
    }

    /**
     * Helper to resolve AI configuration
     */
    _resolveAIConfig(flags) {
        let provider = flags.provider;
        let apiKey = flags.apiKey || flags['api-key'];
        let model = flags.model;

        if (!provider || !apiKey) {
            try {
                const configPath = path.join(os.homedir(), '.ghost', 'config', 'ghostrc.json');
                if (fs.existsSync(configPath)) {
                    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
                    if (config.ai) {
                        provider = provider || config.ai.provider;
                        apiKey = apiKey || config.ai.apiKey;
                        model = model || config.ai.model;
                    }
                }
            } catch (e) {
                // Ignore config errors
            }
        }
        return { provider, apiKey, model };
    }

    /**
     * Command: commit
     * Generates an AI commit message for staged changes and commits them.
     */
    async commit(params) {
        const flags = params.flags || {};
        const { provider, apiKey, model } = this._resolveAIConfig(flags);

        // Get staged diff
        const diff = await this.git.getStagedDiff();
        if (!diff.text) {
            return { success: false, output: 'No staged changes to commit.' };
        }

        // Security audit
        if (!flags['skip-audit'] && !flags.skipAudit) {
            const audit = await this.git.auditSecurity(diff.map, provider, apiKey, model);
            if (audit.blocked) {
                return { success: false, output: `\x1b[31mCommit blocked: ${audit.reason}\x1b[0m` };
            }
        }

        // Generate commit message via AI
        try {
            const customPrompt = flags.prompt || flags.message;
            const message = await this.git.generateCommit(diff.text, customPrompt, provider, apiKey, model);

            // Run the actual git commit
            await this.git.git.commit(message, {
                noVerify: flags['no-verify'] || flags.noVerify,
                allowEmpty: flags['allow-empty'] || flags.allowEmpty,
                amend: flags.amend
            });

            return { success: true, output: `\x1b[32m✓ Committed:\x1b[0m ${message}` };
        } catch (error) {
            return { success: false, output: `\x1b[31mError:\x1b[0m ${error.message}` };
        }
    }

    /**
     * Command: merge
     * Resolves merge conflicts.
     */
    async merge(params) {
        const subcommand = params.subcommand;
        const strategy = params.flags && params.flags.strategy;

        if (subcommand === 'status') {
            const conflicts = await this.git.git.getConflicts();
            if (conflicts.length > 0) {
                return { success: false, output: `Merge conflicts detected in: ${conflicts.join(', ')}` };
            }
            return { success: true, output: 'No merge conflicts detected' };
        }

        return await this.git.handleMergeResolve(strategy);
    }

    /**
     * Internal: handle generic RPC requests from core
     */
    async handleRPCRequest(request) {
        return await this.git.handleRPCRequest(request);
    }
}

module.exports = ExtensionWrapper;
