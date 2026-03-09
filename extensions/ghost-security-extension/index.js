#!/usr/bin/env node

const { SecurityExtension } = require('./extension.js');
const { ExtensionSDK, ExtensionRunner } = require('@ghost/extension-sdk');
const fs = require('fs');
const path = require('path');

const manifestPath = path.join(__dirname, 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

/**
 * Ghost Security Extension Wrapper
 */
class ExtensionWrapper {
    constructor() {
        this.sdk = new ExtensionSDK(manifest.id);
        this.security = new SecurityExtension(this.sdk);
    }

    async init(options = {}) {
        if (options.coreHandler) {
            this.sdk.setCoreHandler(options.coreHandler);
        }
        return { success: true };
    }

    /**
     * Command: scan
     */
    async scan(params) {
        return await this.security.handleRPCRequest({
            method: 'security.scan',
            params
        });
    }

    /**
     * Command: audit
     */
    async audit(params) {
        return await this.security.handleRPCRequest({
            method: 'security.audit',
            params
        });
    }

    /**
     * Command: status
     */
    async status(params) {
        return await this.security.handleRPCRequest({
            method: 'security.status',
            params
        });
    }

    /**
     * Command: compliance
     */
    async compliance(params) {
        return await this.security.handleRPCRequest({
            method: 'security.compliance',
            params
        });
    }

    /**
     * Internal: handle generic RPC requests from core
     */
    async handleRPCRequest(request) {
        return await this.security.handleRPCRequest(request);
    }
}

module.exports = ExtensionWrapper;


if (require.main === module) {
    const wrapper = new ExtensionWrapper();
    const runner = new ExtensionRunner(wrapper);
    runner.start();
}
