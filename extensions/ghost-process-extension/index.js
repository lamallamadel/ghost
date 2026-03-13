#!/usr/bin/env node

const { ProcessExtension } = require('./extension.js');

function loadExtensionSdk() {
    try {
        return require('@ghost/extension-sdk');
    } catch (error) {
        return require('../../packages/extension-sdk');
    }
}

const { ExtensionSDK, ExtensionRunner } = loadExtensionSdk();

class ExtensionWrapper {
    constructor() {
        this.sdk = new ExtensionSDK('ghost-process-extension');
        this.processExt = new ProcessExtension(this.sdk);
    }

    async init(options = {}) {
        if (options.coreHandler) {
            this.sdk.setCoreHandler(options.coreHandler);
        }
        await this.processExt.initialize();
        return { success: true };
    }

    async process(params) {
        const { subcommand, args, flags } = params;
        const mappedParams = { args, flags };
        
        switch (subcommand) {
            case 'list': return await this.processExt.handleRPCRequest({ method: 'process.list', params: mappedParams });
            case 'status': return await this.processExt.handleRPCRequest({ method: 'process.status', params: mappedParams });
            case 'start': return await this.processExt.handleRPCRequest({ method: 'process.start', params: mappedParams });
            case 'stop': return await this.processExt.handleRPCRequest({ method: 'process.stop', params: mappedParams });
            case 'restart': return await this.processExt.handleRPCRequest({ method: 'process.restart', params: mappedParams });
            default:
                if (!subcommand) {
                    return await this.processExt.handleRPCRequest({ method: 'process.list', params: mappedParams });
                }
                return { success: false, output: `Unknown process subcommand: ${subcommand}` };
        }
    }

    async handleRPCRequest(request) {
        return await this.processExt.handleRPCRequest(request);
    }
}

module.exports = ExtensionWrapper;

if (require.main === module) {
    const wrapper = new ExtensionWrapper();
    const runner = new ExtensionRunner(wrapper);
    runner.start();
}
