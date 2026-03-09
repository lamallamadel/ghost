#!/usr/bin/env node

const { AuthorExtension } = require('./extension.js');
const { ExtensionSDK } = require('@ghost/extension-sdk');
const fs = require('fs');
const path = require('path');

const manifestPath = path.join(__dirname, 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

class ExtensionWrapper {
    constructor() {
        this.sdk = new ExtensionSDK(manifest.id);
        this.author = new AuthorExtension(this.sdk);
    }

    async init() {
        return { success: true };
    }

    async initExt(params) {
        return await this.author.handleRPCRequest({ method: 'author.init', params });
    }

    async validate(params) {
        return await this.author.handleRPCRequest({ method: 'author.validate', params });
    }

    async publish(params) {
        return await this.author.handleRPCRequest({ method: 'author.publish', params });
    }

    async handleRPCRequest(request) {
        return await this.author.handleRPCRequest(request);
    }
}

module.exports = ExtensionWrapper;
