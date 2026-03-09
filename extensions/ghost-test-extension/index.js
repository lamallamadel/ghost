#!/usr/bin/env node

const { TestExtension } = require('./extension.js');
const { ExtensionSDK } = require('@ghost/extension-sdk');
const fs = require('fs');
const path = require('path');

const manifestPath = path.join(__dirname, 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

class ExtensionWrapper {
    constructor() {
        this.sdk = new ExtensionSDK(manifest.id);
        this.test = new TestExtension(this.sdk);
    }

    async init() {
        return { success: true };
    }

    async run(params) {
        return await this.test.handleRPCRequest({ method: 'test.run', params });
    }

    async gen(params) {
        return await this.test.handleRPCRequest({ method: 'test.gen', params });
    }

    async coverage(params) {
        return await this.test.handleRPCRequest({ method: 'test.coverage', params });
    }

    async handleRPCRequest(request) {
        return await this.test.handleRPCRequest(request);
    }
}

module.exports = ExtensionWrapper;
