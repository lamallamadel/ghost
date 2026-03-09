#!/usr/bin/env node

const { SystemExtension } = require('./extension.js');
const { ExtensionSDK, ExtensionRunner } = require('@ghost/extension-sdk');
const fs = require('fs');
const path = require('path');

const manifestPath = path.join(__dirname, 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

/**
 * Ghost System Extension Wrapper
 */
class ExtensionWrapper {
    constructor() {
        this.sdk = new ExtensionSDK(manifest.id);
        this.sys = new SystemExtension(this.sdk);
    }

    async init(options = {}) {
        if (options.coreHandler) {
            this.sdk.setCoreHandler(options.coreHandler);
        }
        return { success: true };
    }

    async status(params) {
        return await this.sys.handleRPCRequest({ method: 'sys.status', params });
    }

    async logs(params) {
        return await this.sys.handleRPCRequest({ method: 'sys.logs', params });
    }

    async sanitize(params) {
        return await this.sys.handleRPCRequest({ method: 'sys.sanitize', params });
    }

    async doctor(params) {
        return await this.sys.handleRPCRequest({ method: 'sys.doctor', params });
    }

    async analytics(params) {
        return await this.sys.handleRPCRequest({ method: 'sys.analytics', params });
    }

    async handleRPCRequest(request) {
        return await this.sys.handleRPCRequest(request);
    }
}

module.exports = ExtensionWrapper;


if (require.main === module) {
    const wrapper = new ExtensionWrapper();
    const runner = new ExtensionRunner(wrapper);
    runner.start();
}
