const { IntentBuilder } = require('./intent-builder');
const { RPCClient } = require('./rpc-client');
const { IntentError, ValidationError, RateLimitError } = require('./errors');

class ExtensionSDK {
    constructor(extensionId, options = {}) {
        if (!extensionId || typeof extensionId !== 'string') {
            throw new ValidationError('Extension ID is required', 'MISSING_EXTENSION_ID', 'initialization');
        }
        
        this.extensionId = extensionId;
        this.rpcClient = new RPCClient(extensionId, options);
        this.intentBuilder = new IntentBuilder(extensionId);
    }

    setCoreHandler(handler) {
        this.rpcClient.setCoreHandler(handler);
    }

    async emitIntent(intent) {
        if (!intent || typeof intent !== 'object') {
            throw new ValidationError('Intent must be an object', 'INVALID_INTENT', 'validation');
        }

        const fullIntent = {
            ...intent,
            extensionId: this.extensionId,
            requestId: intent.requestId || this._generateRequestId()
        };

        try {
            const response = await this.rpcClient.send(fullIntent);
            
            // Standardize result extraction
            if (response && typeof response === 'object' && response.success === true && 'result' in response) {
                return response.result;
            }

            return response;
        } catch (error) {
            throw this._handleError(error, fullIntent.requestId);
        }
    }

    async requestBatch(requests) {
        if (!Array.isArray(requests)) {
            throw new ValidationError('Requests must be an array', 'INVALID_BATCH_REQUEST', 'validation');
        }

        if (requests.length === 0) {
            return [];
        }

        for (const request of requests) {
            if (!request || typeof request !== 'object') {
                throw new ValidationError('Each request must be an object', 'INVALID_BATCH_REQUEST_ITEM', 'validation');
            }
        }

        const intents = requests.map(request => ({
            ...request,
            extensionId: this.extensionId,
            requestId: request.requestId || this._generateRequestId()
        }));

        try {
            return await this.rpcClient.sendBatch(intents);
        } catch (error) {
            throw this._handleError(error);
        }
    }

    async requestFileReadBatch(paths) {
        if (!Array.isArray(paths)) {
            throw new ValidationError('Paths must be an array', 'INVALID_PATHS', 'validation');
        }

        if (paths.length === 0) {
            return [];
        }

        for (const path of paths) {
            if (!path || typeof path !== 'string') {
                throw new ValidationError('Each path must be a non-empty string', 'INVALID_PATH', 'validation');
            }
        }

        const intents = paths.map(path => 
            this.intentBuilder.filesystem('read', { path, encoding: 'utf8' })
        );

        try {
            const responses = await this.rpcClient.sendBatch(intents);
            
            return responses.map((response, index) => {
                if (!response.success) {
                    throw this._createErrorFromResponse(response, intents[index].requestId);
                }
                return response.result;
            });
        } catch (error) {
            throw this._handleError(error);
        }
    }

    async requestFileRead(params) {
        const { path, encoding = 'utf8' } = params;
        
        if (!path || typeof path !== 'string') {
            throw new ValidationError('File path is required', 'MISSING_FILE_PATH', 'validation');
        }

        const intent = this.intentBuilder.filesystem('read', { path, encoding });
        
        try {
            const response = await this.rpcClient.send(intent);

            if (!response.success) {
                throw this._createErrorFromResponse(response, intent.requestId);
            }

            return response.result;
        } catch (error) {
            throw this._handleError(error, intent.requestId);
        }
    }

    async requestFileWrite(params) {
        const { path, content, encoding = 'utf8' } = params;
        
        if (!path || typeof path !== 'string') {
            throw new ValidationError('File path is required', 'MISSING_FILE_PATH', 'validation');
        }

        if (content === undefined) {
            throw new ValidationError('File content is required', 'MISSING_FILE_CONTENT', 'validation');
        }

        const intent = this.intentBuilder.filesystem('write', { path, content, encoding });
        
        try {
            const response = await this.rpcClient.send(intent);

            if (!response.success) {
                throw this._createErrorFromResponse(response, intent.requestId);
            }

            return response.result;
        } catch (error) {
            throw this._handleError(error, intent.requestId);
        }
    }

    async requestFileReadDir(params) {
        const { path } = params;
        
        if (!path || typeof path !== 'string') {
            throw new ValidationError('Directory path is required', 'MISSING_DIRECTORY_PATH', 'validation');
        }

        const intent = this.intentBuilder.filesystem('readdir', { path });
        
        try {
            const response = await this.rpcClient.send(intent);

            if (!response.success) {
                throw this._createErrorFromResponse(response, intent.requestId);
            }

            return response.result;
        } catch (error) {
            throw this._handleError(error, intent.requestId);
        }
    }

    async requestFileStat(params) {
        const { path } = params;
        
        if (!path || typeof path !== 'string') {
            throw new ValidationError('File path is required', 'MISSING_FILE_PATH', 'validation');
        }

        const intent = this.intentBuilder.filesystem('stat', { path });
        
        try {
            const response = await this.rpcClient.send(intent);

            if (!response.success) {
                throw this._createErrorFromResponse(response, intent.requestId);
            }

            return response.result;
        } catch (error) {
            throw this._handleError(error, intent.requestId);
        }
    }

    async requestNetworkCall(params) {
        const { url, method = 'GET', headers = {}, body } = params;
        
        if (!url || typeof url !== 'string') {
            throw new ValidationError('URL is required', 'MISSING_URL', 'validation');
        }

        try {
            new URL(url);
        } catch (e) {
            throw new ValidationError(`Invalid URL: ${url}`, 'INVALID_URL', 'validation');
        }

        const operation = method.toLowerCase();
        const intent = this.intentBuilder.network(operation, { url, method, headers, body });
        
        try {
            const response = await this.rpcClient.send(intent);

            if (!response.success) {
                throw this._createErrorFromResponse(response, intent.requestId);
            }

            return response.result;
        } catch (error) {
            throw this._handleError(error, intent.requestId);
        }
    }

    async requestGitExec(params) {
        const { operation, args = [] } = params;
        
        if (!operation || typeof operation !== 'string') {
            throw new ValidationError('Git operation is required', 'MISSING_GIT_OPERATION', 'validation');
        }

        if (!Array.isArray(args)) {
            throw new ValidationError('Git args must be an array', 'INVALID_GIT_ARGS', 'validation');
        }

        const intent = this.intentBuilder.git(operation, { args });
        
        try {
            const response = await this.rpcClient.send(intent);

            if (!response.success) {
                throw this._createErrorFromResponse(response, intent.requestId);
            }

            return response.result;
        } catch (error) {
            throw this._handleError(error, intent.requestId);
        }
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

    async requestFileExists(path) {
        if (!path || typeof path !== 'string') {
            throw new ValidationError('File path is required', 'MISSING_FILE_PATH', 'validation');
        }

        try {
            await this.requestFileStat({ path });
            return true;
        } catch (error) {
            if (error.code === 'ENOENT' || (error.message && error.message.includes('ENOENT'))) {
                return false;
            }
            throw error;
        }
    }

    async requestFileReadJSON(path) {
        if (!path || typeof path !== 'string') {
            throw new ValidationError('File path is required', 'MISSING_FILE_PATH', 'validation');
        }

        const content = await this.requestFileRead({ path, encoding: 'utf8' });
        
        try {
            return JSON.parse(content);
        } catch (error) {
            throw new ValidationError(`Failed to parse JSON from ${path}: ${error.message}`, 'JSON_PARSE_ERROR', 'validation');
        }
    }

    async requestFileWriteJSON(path, object) {
        if (!path || typeof path !== 'string') {
            throw new ValidationError('File path is required', 'MISSING_FILE_PATH', 'validation');
        }

        if (object === undefined || object === null) {
            throw new ValidationError('Object is required', 'MISSING_OBJECT', 'validation');
        }

        let content;
        try {
            content = JSON.stringify(object, null, 2);
        } catch (error) {
            throw new ValidationError(`Failed to stringify object: ${error.message}`, 'JSON_STRINGIFY_ERROR', 'validation');
        }

        return await this.requestFileWrite({ path, content, encoding: 'utf8' });
    }

    async requestGitCurrentBranch() {
        const result = await this.requestGitExec({ 
            operation: 'symbolic-ref', 
            args: ['--short', 'HEAD'] 
        });
        
        if (result && result.stdout) {
            return result.stdout.trim();
        }
        
        throw new IntentError('Failed to get current branch', 'GIT_BRANCH_ERROR', 'execution');
    }

    async requestGitStagedFiles() {
        const result = await this.requestGitExec({ 
            operation: 'diff', 
            args: ['--cached', '--name-only'] 
        });
        
        if (result && result.stdout) {
            const files = result.stdout.trim();
            return files ? files.split('\n').map(f => f.trim()).filter(f => f.length > 0) : [];
        }
        
        return [];
    }

    async requestGitCommit(message, options = {}) {
        if (!message || typeof message !== 'string') {
            throw new ValidationError('Commit message is required', 'MISSING_COMMIT_MESSAGE', 'validation');
        }

        const args = [];
        
        if (options.all) {
            args.push('-a');
        }
        
        if (options.amend) {
            args.push('--amend');
        }
        
        if (options.noVerify) {
            args.push('--no-verify');
        }
        
        if (options.allowEmpty) {
            args.push('--allow-empty');
        }
        
        args.push('-m', message);
        
        if (options.author) {
            args.push('--author', options.author);
        }

        return await this.requestGitExec({ operation: 'commit', args });
    }

    async requestLog(params) {
        const { level = 'info', message, meta = {} } = params;
        
        if (!message || typeof message !== 'string') {
            throw new ValidationError('Log message is required', 'MISSING_LOG_MESSAGE', 'validation');
        }

        const intent = {
            type: 'log',
            operation: level.toLowerCase(),
            params: { message, meta }
        };
        
        return await this.emitIntent(intent);
    }

    async requestConfig() {
        return await this.emitIntent({
            type: 'filesystem',
            operation: 'read',
            params: { path: 'C:/Users/PRO/.ghost/config/ghostrc.json' }
        }).then(content => JSON.parse(content));
    }

    buildIntent() {
        return this.intentBuilder;
    }

    _generateRequestId() {
        return `${this.extensionId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    _createErrorFromResponse(response, requestId) {
        const errorMessage = response.error || 'Request failed';
        const errorCode = response.code;
        const errorStage = response.stage;
        const responseRequestId = response.requestId || requestId;

        if (errorCode === 'RATE_LIMIT_EXCEEDED' || errorStage === 'rate-limit') {
            return new RateLimitError(errorMessage, errorCode, errorStage, responseRequestId);
        }

        if (errorStage === 'validation' || errorCode && errorCode.includes('VALIDATION')) {
            return new ValidationError(errorMessage, errorCode, errorStage, responseRequestId);
        }

        return new IntentError(errorMessage, errorCode, errorStage, responseRequestId);
    }

    _handleError(error, requestId) {
        if (error instanceof IntentError || error instanceof ValidationError || error instanceof RateLimitError) {
            return error;
        }

        if (error.message === 'Request timeout') {
            return new IntentError('Request timeout', 'TIMEOUT', 'transport', requestId);
        }

        return new IntentError(error.message || 'Unknown error', 'UNKNOWN_ERROR', 'unknown', requestId);
    }
}

module.exports = { ExtensionSDK };
