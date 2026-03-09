#!/usr/bin/env node

const { MeshExtension } = require('./extension.js');
const { ExtensionSDK, ExtensionRunner } = require('@ghost/extension-sdk');
const fs = require('fs');
const path = require('path');

const manifestPath = path.join(__dirname, 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

class ExtensionWrapper {
    constructor() {
        this.sdk = new ExtensionSDK(manifest.id);
        this.mesh = new MeshExtension(this.sdk);
    }

    async init(options = {}) {
        if (options.coreHandler) {
            this.sdk.setCoreHandler(options.coreHandler);
        }
        return { success: true };
    }

    async routes(params) {
        return await this.mesh.handleRPCRequest({ method: 'mesh.routes', params });
    }

    async map(params) {
        return await this.mesh.handleRPCRequest({ method: 'mesh.map', params });
    }

    async health(params) {
        return await this.mesh.handleRPCRequest({ method: 'mesh.health', params });
    }

    async handleRPCRequest(request) {
        return await this.mesh.handleRPCRequest(request);
    }
}

module.exports = ExtensionWrapper;


if (require.main === module) {
    const wrapper = new ExtensionWrapper();
    const runner = new ExtensionRunner(wrapper);
    runner.start();
}
