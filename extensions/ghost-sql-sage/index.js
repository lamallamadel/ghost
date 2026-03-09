#!/usr/bin/env node

const { SQLSageExtension } = require('./extension.js');
const { ExtensionSDK, ExtensionRunner } = require('@ghost/extension-sdk');
const fs = require('fs');
const path = require('path');

const manifestPath = path.join(__dirname, 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

/**
 * Ghost SQL-Sage Extension Wrapper
 */
class ExtensionWrapper {
    constructor() {
        this.sdk = new ExtensionSDK(manifest.id);
        this.sage = new SQLSageExtension(this.sdk);
    }

    async init(options = {}) {
        if (options.coreHandler) {
            this.sdk.setCoreHandler(options.coreHandler);
        }
        return { success: true };
    }

    async analyze(params) {
        return await this.sage.handleRPCRequest({ method: 'sql.analyze', params });
    }

    async audit(params) {
        return await this.sage.handleRPCRequest({ method: 'sql.audit', params });
    }

    async generate(params) {
        return await this.sage.handleRPCRequest({ method: 'sql.generate', params });
    }

    async handleRPCRequest(request) {
        return await this.sage.handleRPCRequest(request);
    }
}

module.exports = ExtensionWrapper;


if (require.main === module) {
    const wrapper = new ExtensionWrapper();
    const runner = new ExtensionRunner(wrapper);
    runner.start();
}
