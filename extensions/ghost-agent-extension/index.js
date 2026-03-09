#!/usr/bin/env node

const { AgentExtension } = require('./extension.js');
const { ExtensionSDK } = require('@ghost/extension-sdk');
const fs = require('fs');
const path = require('path');

const manifestPath = path.join(__dirname, 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

class ExtensionWrapper {
    constructor() {
        this.sdk = new ExtensionSDK(manifest.id);
        this.agent = new AgentExtension(this.sdk);
    }

    async init() {
        return { success: true };
    }

    async solve(params) {
        return await this.agent.handleRPCRequest({ method: 'agent.solve', params });
    }

    async think(params) {
        return await this.agent.handleRPCRequest({ method: 'agent.think', params });
    }

    async plan(params) {
        return await this.agent.handleRPCRequest({ method: 'agent.plan', params });
    }

    async handleRPCRequest(request) {
        return await this.agent.handleRPCRequest(request);
    }
}

module.exports = ExtensionWrapper;
