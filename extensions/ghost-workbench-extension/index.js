#!/usr/bin/env node

const { WorkbenchExtension } = require('./extension.js');
const { ExtensionSDK, ExtensionRunner } = require('@ghost/extension-sdk');
const fs = require('fs');
const path = require('path');

const manifestPath = path.join(__dirname, 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

/**
 * Ghost Workbench Extension Wrapper
 */
class ExtensionWrapper {
    constructor() {
        this.sdk = new ExtensionSDK(manifest.id);
        this.workbench = new WorkbenchExtension(this.sdk);
    }

    async init(options = {}) {
        if (options.coreHandler) {
            this.sdk.setCoreHandler(options.coreHandler);
        }
        return { success: true };
    }

    async open(params) {
        return await this.workbench.handleRPCRequest({ method: 'workbench.open', params });
    }

    async status(params) {
        return await this.workbench.handleRPCRequest({ method: 'workbench.status', params });
    }

    async layout(params) {
        return await this.workbench.handleRPCRequest({ method: 'workbench.layout', params });
    }

    async handleRPCRequest(request) {
        return await this.workbench.handleRPCRequest(request);
    }
}

module.exports = ExtensionWrapper;


if (require.main === module) {
    const wrapper = new ExtensionWrapper();
    const runner = new ExtensionRunner(wrapper);
    runner.start();
}
