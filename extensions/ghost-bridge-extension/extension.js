#!/usr/bin/env node

/**
 * Ghost Bridge Master
 * IDE Connector and RPC Bridge
 */

const { ExtensionSDK } = require('@ghost/extension-sdk');
const path = require('path');

const Colors = {
    GREEN: '\x1b[32m',
    CYAN: '\x1b[36m',
    BOLD: '\x1b[1m',
    FAIL: '\x1b[31m',
    ENDC: '\x1b[0m'
};

class BridgeExtension {
    constructor(sdk) {
        this.sdk = sdk;
        this.server = null;
        this.activeSessions = new Map();
    }

    async handleStart(params) {
        const port = params.flags?.port || 9877;
        const authRequired = !params.flags?.['no-auth'];
        
        await this.sdk.requestLog({ level: 'info', message: `Starting IDE Bridge on port ${port} (Auth: ${authRequired ? 'ON' : 'OFF'})...` });

        try {
            // Simulated Server Initialization
            this.server = { port, status: 'running', authRequired };
            
            let output = `\n${Colors.BOLD}GHOST IDE BRIDGE${Colors.ENDC}\n${'='.repeat(30)}\n`;
            output += `${Colors.GREEN}✓ Bridge is active${Colors.ENDC}\n`;
            output += `${Colors.CYAN}Endpoint:${Colors.ENDC} ws://localhost:${port}\n`;
            output += `${Colors.CYAN}Security:${Colors.ENDC} ${authRequired ? 'Token-based' : 'Open'}\n`;
            
            return { success: true, output };
        } catch (error) {
            return { success: false, output: `Bridge failed to start: ${error.message}` };
        }
    }

    async handleAuth(params) {
        const { token, editor } = params;
        if (!token) return { success: false, message: 'Authentication token required' };

        await this.sdk.requestLog({ level: 'info', message: `Auth attempt from ${editor || 'unknown IDE'}` });

        // Simulate token verification against ghostrc.json
        const isValid = token === 'ghost-dev-token-123'; // Mock validation
        
        if (isValid) {
            const sessionId = `sess_${Math.random().toString(36).substring(2, 10)}`;
            this.activeSessions.set(sessionId, { 
                editor: editor || 'Unknown', 
                connectedAt: new Date().toISOString(),
                lastHeartbeat: Date.now()
            });
            return { success: true, sessionId };
        }

        return { success: false, message: 'Invalid authentication token' };
    }

    async handleStatus(params) {
        let output = `\n${Colors.BOLD}BRIDGE STATUS${Colors.ENDC}\n${'='.repeat(30)}\n`;
        if (this.server) {
            output += `Status: ${Colors.GREEN}ONLINE${Colors.ENDC}\n`;
            output += `Port: ${this.server.port}\n`;
            output += `Sessions: ${this.activeSessions.size}\n\n`;
            
            if (this.activeSessions.size > 0) {
                output += `${Colors.BOLD}Active Editors:${Colors.ENDC}\n`;
                for (const [id, sess] of this.activeSessions) {
                    output += `  - ${sess.editor} (ID: ${id})\n`;
                }
            }
        } else {
            output += `Status: ${Colors.FAIL}OFFLINE${Colors.ENDC}\n`;
        }
        return { success: true, output };
    }

    async handleProxy(params) {
        const { sessionId, method, payload } = params;
        if (!this.activeSessions.has(sessionId)) {
            return { success: false, message: 'Invalid or expired session' };
        }

        await this.sdk.requestLog({ level: 'info', message: `Proxying IDE request: ${method}` });

        try {
            // ROUTING LOGIC: Determine which extension to call based on method prefix
            const [extPrefix, extMethod] = method.split('.');
            const targetExtension = `ghost-${extPrefix}-extension`;

            const result = await this.sdk.emitIntent({
                type: 'extension',
                operation: 'call',
                params: {
                    extensionId: targetExtension,
                    method: `${extPrefix}.${extMethod}`,
                    params: payload
                }
            });

            // Notify session of success (Simulated event emission)
            this._notifyIDE(sessionId, 'intent.success', { method });

            return { success: true, result };
        } catch (error) {
            this._notifyIDE(sessionId, 'intent.error', { method, error: error.message });
            return { success: false, error: error.message };
        }
    }

    _notifyIDE(sessionId, event, data) {
        const session = this.activeSessions.get(sessionId);
        if (session) {
            // In real WebSocket, we'd do: session.socket.send(JSON.stringify({ event, data }))
            console.log(`${Colors.CYAN}[Bridge Event]${Colors.ENDC} Notifying ${session.editor} of ${event}`);
        }
    }

    async handleRPCRequest(request) {
        const { method, params = {} } = request;
        try {
            switch (method) {
                case 'bridge.start': return await this.handleStart(params);
                case 'bridge.status': return await this.handleStatus(params);
                case 'bridge.auth': return await this.handleAuth(params);
                case 'bridge.proxy': return await this.handleProxy(params);
                case 'bridge.stop': 
                    this.server = null;
                    this.activeSessions.clear();
                    return { success: true, output: 'Bridge stopped.' };
                default: throw new Error(`Unknown method: ${method}`);
            }
        } catch (error) {
            return { error: { code: -32603, message: error.message } };
        }
    }
}

module.exports = { BridgeExtension };
