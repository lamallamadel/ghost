#!/usr/bin/env node

const { CIExtension } = require('./extension.js');
const { ExtensionSDK } = require('@ghost/extension-sdk');
const fs = require('fs');
const path = require('path');

const manifestPath = path.join(__dirname, 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

/**
 * Ghost CI Extension Wrapper
 */
class ExtensionWrapper {
    constructor() {
        this.sdk = new ExtensionSDK(manifest.id);
        this.ci = new CIExtension(this.sdk);
    }

    async status(params) {
        return await this.ci.handleRPCRequest({ method: 'ci.status', params });
    }

    async check(params) {
        return await this.ci.handleRPCRequest({ method: 'ci.check', params });
    }

    async report(params) {
        return await this.ci.handleRPCRequest({ method: 'ci.report', params });
    }

    async handleRPCRequest(request) {
        return await this.ci.handleRPCRequest(request);
    }
}

module.exports = ExtensionWrapper;
