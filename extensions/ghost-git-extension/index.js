#!/usr/bin/env node

const { ExtensionRPCClient, GitExtension } = require('./extension.js');
const fs = require('fs');
const path = require('path');

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
     * Generates a commit message using AI.
     */
    async commit(params) {
        return await this.git.generateCommit(
            params.diffText,
            params.customPrompt,
            params.provider,
            params.apiKey,
            params.model
        );
    }

    /**
     * Command: version
     * Manages repository versioning.
     */
    async version(params) {
        return await this.git.handleVersionBump(params.bumpType, params.flags);
    }

    /**
     * Command: merge
     * Resolves merge conflicts.
     */
    async merge(params) {
        return await this.git.handleMergeResolve(params.strategy, params.flags);
    }

    /**
     * Internal: handle generic RPC requests from core
     */
    async handleRPCRequest(request) {
        return await this.git.handleRPCRequest(request);
    }
}

module.exports = ExtensionWrapper;
