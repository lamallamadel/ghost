#!/usr/bin/env node

const { ExtensionRPCClient, GitExtension } = require('./extension.js');
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
        // Initialize with a default handler that will be replaced during init
        this.rpc = new ExtensionRPCClient(async (req) => {
            // This is a bridge that the core will replace or we'll set up
            if (this.coreHandler) {
                return await this.coreHandler(req);
            }
            throw new Error(`RPC Handler not yet initialized for ${manifest.id}`);
        });
        
        this.git = new GitExtension(this.rpc);
    }

    /**
     * Initialization hook called by core or used to set the handler.
     * We support both direct assignment and the 'init' command.
     */
    async init(options = {}) {
        if (options.coreHandler) {
            this.coreHandler = options.coreHandler;
        }
        return { success: true };
    }

    /**
     * Command: audit
     * Performs a full security audit of the repository.
     */
    async audit(params) {
        return await this.git.audit(params);
    }

    /**
     * Command: commit
     * Generates an AI commit message for staged changes and commits them.
     */
    async commit(params) {
        const flags = params.flags || {};

        // Resolve AI config: flags take precedence over ghostrc
        let provider = flags.provider;
        let apiKey = flags.apiKey || flags['api-key'];
        let model = flags.model;

        if (!provider || !apiKey) {
            try {
                const configPath = path.join(os.homedir(), '.ghost', 'config', 'ghostrc.json');
                const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
                if (config.ai) {
                    provider = provider || config.ai.provider;
                    apiKey = apiKey || config.ai.apiKey;
                    model = model || config.ai.model;
                }
            } catch (e) {
                // no config file, will fail later if apiKey still missing
            }
        }

        // Get staged diff
        const diff = await this.git.getStagedDiff();
        if (!diff.text) {
            return { success: false, output: 'No staged changes to commit.' };
        }

        // Security audit (skippable via --skip-audit)
        if (!flags['skip-audit'] && !flags.skipAudit) {
            const audit = await this.git.auditSecurity(diff.map, provider, apiKey, model);
            if (audit.blocked) {
                return { success: false, output: `\x1b[31mCommit blocked: ${audit.reason}\x1b[0m` };
            }
        }

        // Generate commit message via AI
        const customPrompt = flags.prompt || flags.message;
        const message = await this.git.generateCommit(diff.text, customPrompt, provider, apiKey, model);

        // Run the actual git commit
        await this.rpc.gitExec(['commit', '-m', message]);

        return { success: true, output: `\x1b[32m✓ Committed:\x1b[0m ${message}` };
    }

    /**
     * Command: version
     * Manages repository versioning.
     * Subcommands: install-hooks, bump, check
     */
    async version(params) {
        const subcommand = params.subcommand;
        const flags = params.flags || {};

        if (subcommand === 'install-hooks') {
            return await this.git.installVersionHooks(flags);
        }

        // 'bump' subcommand or no subcommand: use --bump flag or subcommand as bumpType
        const bumpType = flags.bump || flags.bumpType || (subcommand !== 'bump' ? subcommand : undefined);
        return await this.git.handleVersionBump(bumpType, flags);
    }

    /**
     * Command: merge
     * Resolves merge conflicts.
     * Subcommands: status (report conflicts, exit non-zero if any), resolve (apply strategy)
     */
    async merge(params) {
        const subcommand = params.subcommand;
        const strategy = params.flags && params.flags.strategy;

        if (subcommand === 'status') {
            const conflicts = await this.git.getConflictedFiles();
            if (conflicts.length > 0) {
                throw new Error(`Merge conflicts detected in: ${conflicts.join(', ')}`);
            }
            return { success: true, message: 'No merge conflicts detected' };
        }

        // resolve subcommand (or default): use strategy from --strategy flag
        return await this.git.handleMergeResolve(strategy, params.flags);
    }

    /**
     * Internal: handle generic RPC requests from core
     */
    async handleRPCRequest(request) {
        return await this.git.handleRPCRequest(request);
    }
}

module.exports = ExtensionWrapper;
