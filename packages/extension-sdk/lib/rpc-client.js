class RPCClient {
    constructor(extensionId, options = {}) {
        this.extensionId = extensionId;
        this.pendingRequests = new Map();
        this.requestCounter = 0;
        this.timeout = options.timeout || 30000;
        this.coreHandler = options.coreHandler || null;
        
        if (process.send) {
            process.on('message', (message) => this._handleResponse(message));
        } else {
            // Listen on stdin for JSON-RPC messages from the core
            const readline = require('readline');
            const rl = readline.createInterface({
                input: process.stdin,
                terminal: false
            });

            rl.on('line', (line) => {
                if (!line.trim()) return;
                try {
                    const message = JSON.parse(line);
                    this._handleResponse(message);
                } catch (e) {
                    // Ignore non-JSON output from parent
                }
            });
        }
    }

    setCoreHandler(handler) {
        this.coreHandler = handler;
    }

    _sanitizeParams(params) {
        if (!params || typeof params !== 'object') return params;
        
        // Shallow copy to avoid mutating original
        const sanitized = Array.isArray(params) ? [...params] : { ...params };

        const maskSecret = (val) => {
            if (typeof val !== 'string') return val;
            if (val.length < 12) return val;
            return val.substring(0, 8) + '...' + val.substring(val.length - 4);
        };

        // Common sanitization logic
        for (const key in sanitized) {
            const lowKey = key.toLowerCase();
            
            // Mask common sensitive keys
            if (['apikey', 'api_key', 'token', 'secret', 'password', 'authorization'].some(k => lowKey.includes(k))) {
                sanitized[key] = maskSecret(sanitized[key]);
            } 
            // Mask keys in URLs
            else if (lowKey === 'url' && typeof sanitized[key] === 'string') {
                sanitized[key] = sanitized[key].replace(/(key=)([a-zA-Z0-9_\-]+)/g, (m, p1, p2) => p1 + maskSecret(p2));
            }
            // Recurse into objects
            else if (sanitized[key] && typeof sanitized[key] === 'object') {
                sanitized[key] = this._sanitizeParams(sanitized[key]);
            }
        }

        return sanitized;
    }

    async send(intent) {
        // Apply sanitization to intent parameters before emission
        const sanitizedIntent = {
            ...intent,
            params: this._sanitizeParams(intent.params)
        };

        if (this.coreHandler) {
            return await this._sendViaCoreHandler(sanitizedIntent);
        } else if (process.send) {
            return await this._sendViaIPC(sanitizedIntent);
        } else {
            return await this._sendViaStdio(sanitizedIntent);
        }
    }

    async _sendViaCoreHandler(intent) {
        return new Promise((resolve, reject) => {
            const requestId = intent.requestId || `${this.extensionId}-${++this.requestCounter}`;
            
            const message = {
                jsonrpc: '2.0',
                method: 'intent',
                params: intent,
                id: requestId
            };

            const timeout = setTimeout(() => {
                reject(new Error('Request timeout (CoreHandler)'));
            }, this.timeout);

            this.coreHandler(message)
                .then(response => {
                    clearTimeout(timeout);
                    if (response && response.error) {
                        reject(new Error(response.error.message || 'Request failed'));
                    } else if (response && typeof response === 'object' && 'result' in response) {
                        resolve(response.result);
                    } else {
                        resolve(response);
                    }
                })
                .catch(error => {
                    clearTimeout(timeout);
                    reject(error);
                });
        });
    }

    async sendBatch(intents) {
        const promises = intents.map(intent => this.send(intent));
        return await Promise.all(promises);
    }

    async _sendViaIPC(intent) {
        return new Promise((resolve, reject) => {
            const requestId = intent.requestId || `${this.extensionId}-${++this.requestCounter}`;
            
            this.pendingRequests.set(requestId, { resolve, reject });

            const timeout = setTimeout(() => {
                this.pendingRequests.delete(requestId);
                reject(new Error('Request timeout'));
            }, this.timeout);

            this.pendingRequests.get(requestId).timeout = timeout;

            process.send({
                jsonrpc: '2.0',
                method: 'intent',
                params: intent,
                id: requestId
            });
        });
    }

    async _sendViaStdio(intent) {
        return new Promise((resolve, reject) => {
            const requestId = intent.requestId || `${this.extensionId}-${++this.requestCounter}`;
            
            const message = {
                jsonrpc: '2.0',
                method: 'intent',
                params: intent,
                id: requestId
            };

            process.stdout.write(JSON.stringify(message) + '\n');

            const timeout = setTimeout(() => {
                reject(new Error('Request timeout'));
            }, this.timeout);

            const responseHandler = (data) => {
                try {
                    const lines = data.toString().split('\n');
                    for (const line of lines) {
                        if (!line.trim()) continue;
                        
                        const response = JSON.parse(line);
                        
                        if (response.id === requestId) {
                            clearTimeout(timeout);
                            process.stdin.removeListener('data', responseHandler);
                            
                            if (response.error) {
                                reject(new Error(response.error.message || 'Request failed'));
                            } else {
                                resolve(response.result);
                            }
                        }
                    }
                } catch (error) {
                    // Ignore parse errors for non-JSON data
                }
            };

            process.stdin.on('data', responseHandler);
        });
    }

    _handleResponse(message) {
        if (!message || !message.id) {
            return;
        }

        const pending = this.pendingRequests.get(message.id);
        
        if (!pending) {
            return;
        }

        clearTimeout(pending.timeout);
        this.pendingRequests.delete(message.id);

        if (message.error) {
            pending.reject(new Error(message.error.message || 'Request failed'));
        } else {
            pending.resolve(message.result);
        }
    }
}

module.exports = { RPCClient };
