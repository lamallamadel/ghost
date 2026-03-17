#!/usr/bin/env node

const { DockerHeroExtension } = require('./extension.js');
const { ExtensionSDK, ExtensionRunner } = require('@ghost/extension-sdk');
const fs = require('fs');
const path = require('path');

const manifestPath = path.join(__dirname, 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

class ExtensionWrapper {
    constructor() {
        this.sdk = new ExtensionSDK(manifest.id);
        this.docker = new DockerHeroExtension(this.sdk);
    }

    async init(options = {}) {
        if (options.coreHandler) {
            this.sdk.setCoreHandler(options.coreHandler);
        }
        return { success: true };
    }

    async scan(params) {
        return await this.docker.handleRPCRequest({ method: 'docker.scan', params });
    }

    async shrink(params) {
        return await this.docker.handleRPCRequest({ method: 'docker.shrink', params });
    }

    async generate(params) {
        return await this.docker.handleRPCRequest({ method: 'docker.generate', params });
    }

    async handleRPCRequest(request) {
        return await this.docker.handleRPCRequest(request);
    }
}

module.exports = ExtensionWrapper;


if (require.main === module) {
    const wrapper = new ExtensionWrapper();
    const runner = new ExtensionRunner(wrapper);
    runner.start();
}
