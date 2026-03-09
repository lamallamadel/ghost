#!/usr/bin/env node

const { MarketplaceExtension } = require('./extension.js');
const { ExtensionSDK, ExtensionRunner } = require('@ghost/extension-sdk');
const fs = require('fs');
const path = require('path');

const manifestPath = path.join(__dirname, 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

/**
 * Ghost Marketplace Extension Wrapper
 */
class ExtensionWrapper {
    constructor() {
        this.sdk = new ExtensionSDK(manifest.id);
        this.marketplace = new MarketplaceExtension(this.sdk);
    }

    async init(options = {}) {
        if (options.coreHandler) {
            this.sdk.setCoreHandler(options.coreHandler);
        }
        return { success: true };
    }

    async browse(params) {
        return { success: true };
    }

    async browse(params) {
        return await this.marketplace.handleRPCRequest({ method: 'marketplace.browse', params });
    }

    async install(params) {
        return await this.marketplace.handleRPCRequest({ method: 'marketplace.install', params });
    }

    async search(params) {
        return await this.marketplace.handleRPCRequest({ method: 'marketplace.search', params });
    }

    async update(params) {
        return await this.marketplace.handleRPCRequest({ method: 'marketplace.update', params });
    }

    async handleRPCRequest(request) {
        return await this.marketplace.handleRPCRequest(request);
    }
}

module.exports = ExtensionWrapper;


if (require.main === module) {
    const wrapper = new ExtensionWrapper();
    const runner = new ExtensionRunner(wrapper);
    runner.start();
}
