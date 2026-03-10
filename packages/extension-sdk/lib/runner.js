const readline = require('readline');

/**
 * ExtensionRunner
 * 
 * Orchestrates the execution of an extension in a standalone process.
 * Handles JSON-RPC communication over stdin/stdout.
 */
class ExtensionRunner {
    constructor(wrapper) {
        this.wrapper = wrapper;
        this.rl = readline.createInterface({
            input: process.stdin,
            terminal: false
        });
    }

    start() {
        // 1. Listen via IPC if available (used by interactive extensions)
        if (process.send) {
            process.on('message', async (message) => {
                await this._processRequest(message);
            });
        }

        // 2. Listen via stdin (used by standard piped extensions)
        this.rl.on('line', async (line) => {
            if (!line.trim()) return;
            try {
                const request = JSON.parse(line);
                await this._processRequest(request);
            } catch (error) {
                this._sendError(null, -32700, 'Parse error: ' + error.message);
            }
        });

        // Error handling for the process
        process.on('uncaughtException', (error) => {
            this._sendError(null, -32603, 'Internal error: ' + error.message);
        });
    }

    async _processRequest(request) {
        try {
            // Special handling for lifecycle methods
            if (request.method === 'init') {
                if (typeof this.wrapper.init === 'function') {
                    const result = await this.wrapper.init(request.params);
                    this._sendResponse(request.id, result);
                } else {
                    this._sendResponse(request.id, { success: true });
                }
                return;
            }

            // Delegate to wrapper method directly
            if (typeof this.wrapper[request.method] === 'function') {
                const result = await this.wrapper[request.method](request.params);
                this._sendResponse(request.id, result);
            } else {
                // Fallback to generic RPC handler if implemented
                if (typeof this.wrapper.handleRPCRequest === 'function') {
                    const response = await this.wrapper.handleRPCRequest(request);
                    if (response && !response.jsonrpc) {
                        this._sendResponse(request.id, response);
                    } else if (response) {
                        this._writeOutput(JSON.stringify(response));
                    }
                } else {
                    this._sendError(request.id, -32601, `Method not found: ${request.method}`);
                }
            }
        } catch (error) {
            this._sendError(request.id, -32603, error.message);
        }
    }

    _sendResponse(id, result) {
        const envelope = { jsonrpc: "2.0", id, result };
        if (process.send) {
            process.send(envelope);
        } else {
            this._writeOutput(JSON.stringify(envelope));
        }
    }

    _sendError(id, code, message) {
        const envelope = { jsonrpc: "2.0", id, error: { code, message } };
        if (process.send) {
            process.send(envelope);
        } else {
            this._writeOutput(JSON.stringify(envelope));
        }
    }

    _writeOutput(str) {
        // Only write to stdout if we are not in an interactive TTY where stdout is inherited
        // Actually, if process.send exists, we shouldn't spam stdout with JSON
        if (!process.send) {
            process.stdout.write(str + '\n');
        }
    }
}

module.exports = { ExtensionRunner };
