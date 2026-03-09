#!/usr/bin/env node

const { CloudExtension } = require('./extension.js');
const { ExtensionSDK } = require('@ghost/extension-sdk');
const fs = require('fs');
const path = require('path');

const manifestPath = path.join(__dirname, 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

/**
 * Ghost Cloud-Master Extension Wrapper
 */
class ExtensionWrapper {
    constructor() {
        this.sdk = new ExtensionSDK(manifest.id);
        this.cloud = new CloudExtension(this.sdk);
    }

    async init() {
        return { success: true };
    }

    async detect(params) {
        return await this.cloud.handleRPCRequest({ method: 'cloud.detect', params });
    }

    async generate(params) {
        return await this.cloud.handleRPCRequest({ method: 'cloud.generate', params });
    }

    async audit(params) {
        return await this.cloud.handleRPCRequest({ method: 'cloud.audit', params });
    }

    async handleRPCRequest(request) {
        return await this.cloud.handleRPCRequest(request);
    }
}

module.exports = ExtensionWrapper;
