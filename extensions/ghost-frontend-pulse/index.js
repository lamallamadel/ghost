#!/usr/bin/env node

const { FrontendPulseExtension } = require('./extension.js');
const { ExtensionSDK, ExtensionRunner } = require('@ghost/extension-sdk');
const fs = require('fs');
const path = require('path');

const manifestPath = path.join(__dirname, 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

/**
 * Ghost Frontend-Pulse Extension Wrapper
 */
class ExtensionWrapper {
    constructor() {
        this.sdk = new ExtensionSDK(manifest.id);
        this.pulse = new FrontendPulseExtension(this.sdk);
    }

    async init(options = {}) {
        if (options.coreHandler) {
            this.sdk.setCoreHandler(options.coreHandler);
        }
        return { success: true };
    }

    async analyze(params) {
        return await this.pulse.handleRPCRequest({ method: 'fe.analyze', params });
    }

    async optimize(params) {
        return await this.pulse.handleRPCRequest({ method: 'fe.optimize', params });
    }

    async report(params) {
        return await this.pulse.handleRPCRequest({ method: 'fe.report', params });
    }

    async handleRPCRequest(request) {
        return await this.pulse.handleRPCRequest(request);
    }
}

module.exports = ExtensionWrapper;


if (require.main === module) {
    const wrapper = new ExtensionWrapper();
    const runner = new ExtensionRunner(wrapper);
    runner.start();
}
