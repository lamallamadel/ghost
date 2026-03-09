#!/usr/bin/env node

const { DocsExtension } = require('./extension.js');
const { ExtensionSDK, ExtensionRunner } = require('@ghost/extension-sdk');
const fs = require('fs');
const path = require('path');

const manifestPath = path.join(__dirname, 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

/**
 * Ghost Docs Extension Wrapper
 */
class ExtensionWrapper {
    constructor() {
        this.sdk = new ExtensionSDK(manifest.id);
        this.docs = new DocsExtension(this.sdk);
    }

    async init() {
        return { success: true };
    }

    async initialize(params) {
        return await this.docs.handleRPCRequest({ method: 'docs.init', params });
    }

    async generate(params) {
        return await this.docs.handleRPCRequest({ method: 'docs.generate', params });
    }

    async diagram(params) {
        return await this.docs.handleRPCRequest({ method: 'docs.diagram', params });
    }

    async chat(params) {
        return await this.docs.handleRPCRequest({ method: 'docs.chat', params });
    }

    async handleRPCRequest(request) {
        return await this.docs.handleRPCRequest(request);
    }
}

module.exports = ExtensionWrapper;


if (require.main === module) {
    const wrapper = new ExtensionWrapper();
    const runner = new ExtensionRunner(wrapper);
    runner.start();
}
