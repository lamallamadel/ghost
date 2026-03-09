#!/usr/bin/env node

const { DependencyExtension } = require('./extension.js');
const { ExtensionSDK } = require('@ghost/extension-sdk');
const fs = require('fs');
const path = require('path');

const manifestPath = path.join(__dirname, 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

class ExtensionWrapper {
    constructor() {
        this.sdk = new ExtensionSDK(manifest.id);
        this.deps = new DependencyExtension(this.sdk);
    }

    async init() {
        return { success: true };
    }

    async graph(params) {
        return await this.deps.handleRPCRequest({ method: 'deps.graph', params });
    }

    async audit(params) {
        return await this.deps.handleRPCRequest({ method: 'deps.audit', params });
    }

    async solve(params) {
        return await this.deps.handleRPCRequest({ method: 'deps.solve', params });
    }

    async handleRPCRequest(request) {
        return await this.deps.handleRPCRequest(request);
    }
}

module.exports = ExtensionWrapper;
