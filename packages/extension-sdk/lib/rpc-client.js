class RPCClient {
    constructor(extensionId, options = {}) {
        this.extensionId = extensionId;
        this.pendingRequests = new Map();
        this.requestCounter = 0;
        this.timeout = options.timeout || 30000;
        
        if (process.send) {
            process.on('message', (message) => this._handleResponse(message));
        }
    }

    async send(intent) {
        if (process.send) {
            return await this._sendViaIPC(intent);
        } else {
            return await this._sendViaStdio(intent);
        }
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
