#!/usr/bin/env node

const { PolicyExtension } = require('./extension.js');
const { ExtensionSDK } = require('@ghost/extension-sdk');
const fs = require('fs');
const path = require('path');

const manifestPath = path.join(__dirname, 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

class ExtensionWrapper {
    constructor() {
        this.sdk = new ExtensionSDK(manifest.id);
        this.policy = new PolicyExtension(this.sdk);
    }

    async init() {
        return { success: true };
    }

    async list(params) {
        return await this.policy.handleRPCRequest({ method: 'policy.list', params });
    }

    async set(params) {
        return await this.policy.handleRPCRequest({ method: 'policy.set', params });
    }

    async verify(params) {
        return await this.policy.handleRPCRequest({ method: 'policy.verify', params });
    }

    async handleRPCRequest(request) {
        return await this.policy.handleRPCRequest(request);
    }
}

module.exports = ExtensionWrapper;
