#!/usr/bin/env node

const { BridgeExtension } = require('./extension.js');
const { ExtensionSDK } = require('@ghost/extension-sdk');
const fs = require('fs');
const path = require('path');

const manifestPath = path.join(__dirname, 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

class ExtensionWrapper {
    constructor() {
        this.sdk = new ExtensionSDK(manifest.id);
        this.bridge = new BridgeExtension(this.sdk);
    }

    async init() {
        return { success: true };
    }

    async start(params) {
        return await this.bridge.handleRPCRequest({ method: 'bridge.start', params });
    }

    async stop(params) {
        return await this.bridge.handleRPCRequest({ method: 'bridge.stop', params });
    }

    async status(params) {
        return await this.bridge.handleRPCRequest({ method: 'bridge.status', params });
    }

    async handleRPCRequest(request) {
        return await this.bridge.handleRPCRequest(request);
    }
}

module.exports = ExtensionWrapper;
