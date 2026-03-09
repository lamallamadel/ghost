#!/usr/bin/env node

const { TeamPulseExtension } = require('./extension.js');
const { ExtensionSDK } = require('@ghost/extension-sdk');
const fs = require('fs');
const path = require('path');

const manifestPath = path.join(__dirname, 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

/**
 * Ghost Team-Pulse Extension Wrapper
 */
class ExtensionWrapper {
    constructor() {
        this.sdk = new ExtensionSDK(manifest.id);
        this.team = new TeamPulseExtension(this.sdk);
    }

    async init() {
        return { success: true };
    }

    async notify(params) {
        return await this.team.handleRPCRequest({ method: 'team.notify', params });
    }

    async status(params) {
        return await this.team.handleRPCRequest({ method: 'team.status', params });
    }

    async config(params) {
        return await this.team.handleRPCRequest({ method: 'team.config', params });
    }

    async handleRPCRequest(request) {
        return await this.team.handleRPCRequest(request);
    }
}

module.exports = ExtensionWrapper;
