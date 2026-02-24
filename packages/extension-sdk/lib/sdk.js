const { IntentBuilder } = require('./intent-builder');
const { RPCClient } = require('./rpc-client');

class ExtensionSDK {
    constructor(extensionId) {
        if (!extensionId || typeof extensionId !== 'string') {
            throw new Error('Extension ID is required');
        }
        
        this.extensionId = extensionId;
        this.rpcClient = new RPCClient(extensionId);
        this.intentBuilder = new IntentBuilder(extensionId);
    }

    async emitIntent(intent) {
        if (!intent || typeof intent !== 'object') {
            throw new Error('Intent must be an object');
        }

        const fullIntent = {
            ...intent,
            extensionId: this.extensionId,
            requestId: intent.requestId || this._generateRequestId()
        };

        return await this.rpcClient.send(fullIntent);
    }

    async requestFileRead(params) {
        const { path, encoding = 'utf8' } = params;
        
        if (!path || typeof path !== 'string') {
            throw new Error('File path is required');
        }

        const intent = this.intentBuilder.filesystem('read', { path, encoding });
        const response = await this.rpcClient.send(intent);

        if (!response.success) {
            throw new Error(response.error || 'File read failed');
        }

        return response.result;
    }

    async requestFileWrite(params) {
        const { path, content, encoding = 'utf8' } = params;
        
        if (!path || typeof path !== 'string') {
            throw new Error('File path is required');
        }

        if (content === undefined) {
            throw new Error('File content is required');
        }

        const intent = this.intentBuilder.filesystem('write', { path, content, encoding });
        const response = await this.rpcClient.send(intent);

        if (!response.success) {
            throw new Error(response.error || 'File write failed');
        }

        return response.result;
    }

    async requestFileReadDir(params) {
        const { path } = params;
        
        if (!path || typeof path !== 'string') {
            throw new Error('Directory path is required');
        }

        const intent = this.intentBuilder.filesystem('readdir', { path });
        const response = await this.rpcClient.send(intent);

        if (!response.success) {
            throw new Error(response.error || 'Directory read failed');
        }

        return response.result;
    }

    async requestFileStat(params) {
        const { path } = params;
        
        if (!path || typeof path !== 'string') {
            throw new Error('File path is required');
        }

        const intent = this.intentBuilder.filesystem('stat', { path });
        const response = await this.rpcClient.send(intent);

        if (!response.success) {
            throw new Error(response.error || 'File stat failed');
        }

        return response.result;
    }

    async requestNetworkCall(params) {
        const { url, method = 'GET', headers = {}, body } = params;
        
        if (!url || typeof url !== 'string') {
            throw new Error('URL is required');
        }

        try {
            new URL(url);
        } catch (e) {
            throw new Error(`Invalid URL: ${url}`);
        }

        const operation = method.toLowerCase();
        const intent = this.intentBuilder.network(operation, { url, method, headers, body });
        const response = await this.rpcClient.send(intent);

        if (!response.success) {
            throw new Error(response.error || 'Network call failed');
        }

        return response.result;
    }

    async requestGitExec(params) {
        const { operation, args = [] } = params;
        
        if (!operation || typeof operation !== 'string') {
            throw new Error('Git operation is required');
        }

        if (!Array.isArray(args)) {
            throw new Error('Git args must be an array');
        }

        const intent = this.intentBuilder.git(operation, { args });
        const response = await this.rpcClient.send(intent);

        if (!response.success) {
            throw new Error(response.error || 'Git operation failed');
        }

        return response.result;
    }

    async requestGitStatus(args = []) {
        return await this.requestGitExec({ operation: 'status', args });
    }

    async requestGitLog(args = []) {
        return await this.requestGitExec({ operation: 'log', args });
    }

    async requestGitDiff(args = []) {
        return await this.requestGitExec({ operation: 'diff', args });
    }

    buildIntent() {
        return this.intentBuilder;
    }

    _generateRequestId() {
        return `${this.extensionId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
}

module.exports = { ExtensionSDK };
