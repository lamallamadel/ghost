#!/usr/bin/env node

const { AIExtension } = require('./extension.js');
const { ExtensionSDK } = require('@ghost/extension-sdk');
const fs = require('fs');
const path = require('path');

const manifestPath = path.join(__dirname, 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

class ExtensionWrapper {
    constructor() {
        this.sdk = new ExtensionSDK(manifest.id);
        this.ai = new AIExtension(this.sdk);
    }

    async init() {
        return { success: true };
    }

    async status(params) {
        return await this.ai.handleRPCRequest({ method: 'ai.status', params });
    }

    async models(params) {
        return await this.ai.handleRPCRequest({ method: 'ai.models', params });
    }

    async usage(params) {
        return await this.ai.handleRPCRequest({ method: 'ai.usage', params });
    }

    async switch(params) {
        return await this.ai.handleRPCRequest({ method: 'ai.switch', params });
    }

    async handleRPCRequest(request) {
        return await this.ai.handleRPCRequest(request);
    }
}

module.exports = ExtensionWrapper;
