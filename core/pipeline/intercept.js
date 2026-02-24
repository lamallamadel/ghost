const { Readable } = require('stream');

class Intent {
    constructor(data) {
        this._type = data.type;
        this._operation = data.operation;
        this._params = Object.freeze({ ...data.params });
        this._extensionId = data.extensionId;
        this._timestamp = Date.now();
        this._requestId = data.requestId || this._generateRequestId();
        Object.freeze(this);
    }

    get type() { return this._type; }
    get operation() { return this._operation; }
    get params() { return this._params; }
    get extensionId() { return this._extensionId; }
    get timestamp() { return this._timestamp; }
    get requestId() { return this._requestId; }

    _generateRequestId() {
        return `${this._extensionId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    toJSON() {
        return {
            type: this._type,
            operation: this._operation,
            params: this._params,
            extensionId: this._extensionId,
            timestamp: this._timestamp,
            requestId: this._requestId
        };
    }
}

class IntentSchema {
    static VALID_TYPES = ['filesystem', 'network', 'git', 'process'];
    
    static VALID_OPERATIONS = {
        filesystem: ['read', 'write', 'stat', 'readdir', 'mkdir', 'unlink', 'rmdir'],
        network: ['http', 'https'],
        git: ['status', 'log', 'diff', 'show', 'ls-files', 'commit', 'branch', 'tag', 'push', 'reset'],
        process: ['spawn', 'exec']
    };

    static validate(intent) {
        const errors = [];

        if (!intent.type || typeof intent.type !== 'string') {
            errors.push('Missing or invalid "type" field');
        } else if (!this.VALID_TYPES.includes(intent.type)) {
            errors.push(`Invalid type: ${intent.type}. Must be one of: ${this.VALID_TYPES.join(', ')}`);
        }

        if (!intent.operation || typeof intent.operation !== 'string') {
            errors.push('Missing or invalid "operation" field');
        } else if (intent.type && this.VALID_OPERATIONS[intent.type]) {
            if (!this.VALID_OPERATIONS[intent.type].includes(intent.operation)) {
                errors.push(`Invalid operation "${intent.operation}" for type "${intent.type}"`);
            }
        }

        if (!intent.params || typeof intent.params !== 'object' || Array.isArray(intent.params)) {
            errors.push('Missing or invalid "params" field (must be object)');
        } else {
            this._validateParams(intent, errors);
        }

        if (!intent.extensionId || typeof intent.extensionId !== 'string') {
            errors.push('Missing or invalid "extensionId" field');
        }

        return { valid: errors.length === 0, errors };
    }

    static _validateParams(intent, errors) {
        const { type, operation, params } = intent;

        if (type === 'filesystem') {
            if (!params.path || typeof params.path !== 'string') {
                errors.push('filesystem operations require valid "params.path"');
            }
            if (operation === 'write' && params.content === undefined) {
                errors.push('write operation requires "params.content"');
            }
            if (operation === 'mkdir' && params.recursive !== undefined && typeof params.recursive !== 'boolean') {
                errors.push('mkdir "params.recursive" must be boolean');
            }
        }

        if (type === 'network') {
            if (!params.url || typeof params.url !== 'string') {
                errors.push('network operations require valid "params.url"');
            }
            try {
                new URL(params.url);
            } catch (e) {
                errors.push(`Invalid URL format: ${params.url}`);
            }
            if (params.method && !['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD'].includes(params.method)) {
                errors.push(`Invalid HTTP method: ${params.method}`);
            }
        }

        if (type === 'git') {
            if (params.args && !Array.isArray(params.args)) {
                errors.push('git "params.args" must be an array');
            }
        }

        if (type === 'process') {
            if (!params.command || typeof params.command !== 'string') {
                errors.push('process operations require valid "params.command"');
            }
            if (params.args && !Array.isArray(params.args)) {
                errors.push('process "params.args" must be an array');
            }
        }
    }
}

class MessageInterceptor {
    constructor() {
        this.buffer = '';
    }

    deserialize(rawMessage) {
        try {
            const message = typeof rawMessage === 'string' ? JSON.parse(rawMessage) : rawMessage;
            
            if (!message || typeof message !== 'object') {
                throw new Error('Message must be a JSON object');
            }

            return message;
        } catch (error) {
            throw new Error(`JSON-RPC deserialization failed: ${error.message}`);
        }
    }

    normalize(message) {
        const intentData = {
            type: message.type || message.capability,
            operation: message.operation || message.method,
            params: message.params || message.parameters || {},
            extensionId: message.extensionId || message.extension_id || message.ext_id,
            requestId: message.requestId || message.id
        };

        const validation = IntentSchema.validate(intentData);
        
        if (!validation.valid) {
            throw new Error(`Schema validation failed:\n  - ${validation.errors.join('\n  - ')}`);
        }

        return new Intent(intentData);
    }

    processStream(stream, onIntent, onError) {
        if (!(stream instanceof Readable)) {
            throw new Error('Stream must be a Readable stream');
        }

        stream.on('data', (chunk) => {
            this.buffer += chunk.toString();
            
            let newlineIndex;
            while ((newlineIndex = this.buffer.indexOf('\n')) !== -1) {
                const line = this.buffer.slice(0, newlineIndex).trim();
                this.buffer = this.buffer.slice(newlineIndex + 1);
                
                if (!line) continue;

                try {
                    const message = this.deserialize(line);
                    const intent = this.normalize(message);
                    onIntent(intent);
                } catch (error) {
                    if (onError) {
                        onError(error);
                    }
                }
            }
        });

        stream.on('error', (error) => {
            if (onError) {
                onError(new Error(`Stream error: ${error.message}`));
            }
        });

        return stream;
    }

    intercept(rawMessage) {
        const message = this.deserialize(rawMessage);
        const intent = this.normalize(message);
        return intent;
    }
}

module.exports = {
    Intent,
    IntentSchema,
    MessageInterceptor
};
