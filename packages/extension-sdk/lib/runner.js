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
        this.rl.on('line', async (line) => {
            if (!line.trim()) return;

            try {
                const request = JSON.parse(line);
                
                // Special handling for lifecycle methods
                if (request.method === 'init') {
                    const result = await this.wrapper.init(request.params);
                    this._sendResponse(request.id, result);
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
                            process.stdout.write(JSON.stringify(response) + '\n');
                        }
                    } else {
                        this._sendError(request.id, -32601, `Method not found: ${request.method}`);
                    }
                }
            } catch (error) {
                this._sendError(null, -32700, 'Parse error: ' + error.message);
            }
        });

        // Error handling for the process
        process.on('uncaughtException', (error) => {
            this._sendError(null, -32603, 'Internal error: ' + error.message);
        });
    }

    _sendResponse(id, result) {
        process.stdout.write(JSON.stringify({
            jsonrpc: "2.0",
            id,
            result
        }) + '\n');
    }

    _sendError(id, code, message) {
        process.stdout.write(JSON.stringify({
            jsonrpc: "2.0",
            id,
            error: { code, message }
        }) + '\n');
    }
}

module.exports = { ExtensionRunner };
