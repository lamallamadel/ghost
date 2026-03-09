#!/usr/bin/env node

const { DesktopExtension } = require('./extension.js');
const { ExtensionSDK } = require('@ghost/extension-sdk');
const fs = require('fs');
const path = require('path');

const manifestPath = path.join(__dirname, 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

/**
 * Ghost Desktop Extension Wrapper
 */
class ExtensionWrapper {
    constructor() {
        this.sdk = new ExtensionSDK(manifest.id);
        this.desktop = new DesktopExtension(this.sdk);
    }

    async init() {
        return { success: true };
    }

    /**
     * Overrides/Implements the 'console' command
     */
    async console(params) {
        return await this.desktop.handleRPCRequest({
            method: 'desktop.console',
            params
        });
    }

    async handleRPCRequest(request) {
        return await this.desktop.handleRPCRequest(request);
    }
}

module.exports = ExtensionWrapper;
