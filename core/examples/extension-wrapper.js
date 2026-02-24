const readline = require('readline');

class ExtensionWrapper {
    constructor(extensionInstance) {
        this.extension = extensionInstance;
        this.rl = null;
        this.isShuttingDown = false;
    }

    start() {
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            terminal: false
        });

        this.rl.on('line', (line) => {
            this._handleRequest(line);
        });

        this.rl.on('close', () => {
            this._shutdown();
        });

        process.on('SIGTERM', () => {
            this._shutdown();
        });

        process.on('SIGINT', () => {
            this._shutdown();
        });
    }

    async _handleRequest(line) {
        let request;
        
        try {
            request = JSON.parse(line);
        } catch (error) {
            this._sendError(null, -32700, 'Parse error: Invalid JSON');
            return;
        }

        if (!request.jsonrpc || request.jsonrpc !== '2.0') {
            this._sendError(request.id, -32600, 'Invalid Request: Missing or invalid jsonrpc field');
            return;
        }

        if (!request.method || typeof request.method !== 'string') {
            this._sendError(request.id, -32600, 'Invalid Request: Missing or invalid method');
            return;
        }

        const params = request.params || {};

        try {
            let result;

            switch (request.method) {
                case 'init':
                    result = await this._handleInit(params);
                    break;
                case 'shutdown':
                    result = await this._handleShutdown(params);
                    break;
                case 'ping':
                    result = { pong: true };
                    break;
                default:
                    if (typeof this.extension[request.method] === 'function') {
                        result = await this.extension[request.method](params);
                    } else {
                        this._sendError(request.id, -32601, `Method not found: ${request.method}`);
                        return;
                    }
            }

            this._sendResult(request.id, result);
        } catch (error) {
            this._sendError(
                request.id,
                -32603,
                `Internal error: ${error.message}`,
                { stack: error.stack }
            );
        }
    }

    async _handleInit(params) {
        if (typeof this.extension.init === 'function') {
            await this.extension.init(params.config || {});
        }
        return { initialized: true };
    }

    async _handleShutdown(params) {
        if (typeof this.extension.cleanup === 'function') {
            await this.extension.cleanup();
        }
        this.isShuttingDown = true;
        setImmediate(() => {
            process.exit(0);
        });
        return { shutdown: true };
    }

    _sendResult(id, result) {
        const response = {
            jsonrpc: '2.0',
            id,
            result
        };
        this._send(response);
    }

    _sendError(id, code, message, data = null) {
        const response = {
            jsonrpc: '2.0',
            id,
            error: {
                code,
                message,
                ...(data && { data })
            }
        };
        this._send(response);
    }

    _send(message) {
        try {
            process.stdout.write(JSON.stringify(message) + '\n');
        } catch (error) {
            process.stderr.write(`Failed to send message: ${error.message}\n`);
        }
    }

    _shutdown() {
        if (this.isShuttingDown) {
            return;
        }
        this.isShuttingDown = true;

        if (typeof this.extension.cleanup === 'function') {
            try {
                this.extension.cleanup();
            } catch (error) {
                process.stderr.write(`Cleanup error: ${error.message}\n`);
            }
        }

        if (this.rl) {
            this.rl.close();
        }

        process.exit(0);
    }
}

module.exports = ExtensionWrapper;
