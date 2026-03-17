#!/usr/bin/env node

/**
 * Ghost Bridge Master
 * IDE Connector — real WebSocket server, JSON-RPC protocol, bi-directional proxy
 */

const { ExtensionSDK } = require('@ghost/extension-sdk');
const WebSocket = require('ws');
const http = require('http');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const Colors = {
    GREEN: '\x1b[32m',
    CYAN: '\x1b[36m',
    BOLD: '\x1b[1m',
    WARNING: '\x1b[33m',
    FAIL: '\x1b[31m',
    DIM: '\x1b[2m',
    ENDC: '\x1b[0m'
};

// ── JSON-RPC helpers ──────────────────────────────────────────────────────────

function rpcResult(id, result) {
    return JSON.stringify({ jsonrpc: '2.0', id, result });
}

function rpcError(id, code, message) {
    return JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } });
}

function rpcNotification(method, params) {
    return JSON.stringify({ jsonrpc: '2.0', method, params });
}

// ── Session ───────────────────────────────────────────────────────────────────

class Session {
    constructor(ws, sessionId) {
        this.ws = ws;
        this.id = sessionId;
        this.editor = 'Unknown';
        this.authenticated = false;
        this.connectedAt = new Date().toISOString();
        this.lastHeartbeat = Date.now();
    }

    send(payload) {
        if (this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(payload);
        }
    }

    notify(event, data) {
        this.send(rpcNotification('ghost.event', { event, data, sessionId: this.id }));
    }

    isAlive() {
        return this.ws.readyState === WebSocket.OPEN;
    }
}

// ── BridgeExtension ───────────────────────────────────────────────────────────

class BridgeExtension {
    constructor(sdk) {
        this.sdk = sdk;
        this.httpServer = null;
        this.wss = null;
        this.sessions = new Map();       // sessionId → Session
        this.heartbeatTimer = null;
        this.HEARTBEAT_INTERVAL = 30000; // 30s
        this.PROXY_TIMEOUT = 15000;      // 15s per proxied intent
    }

    // ── start / stop ──────────────────────────────────────────────────────────

    async handleStart(params) {
        const port = parseInt(params.flags?.port) || 9877;
        const authRequired = !params.flags?.['no-auth'];

        if (this.httpServer) {
            return {
                success: false,
                output: `${Colors.WARNING}Bridge is already running on port ${this.httpServer.address()?.port}.${Colors.ENDC}`
            };
        }

        await this.sdk.requestLog({ level: 'info', message: `Starting IDE Bridge on port ${port}...` });

        return new Promise((resolve) => {
            this.httpServer = http.createServer();
            this.wss = new WebSocket.Server({ server: this.httpServer });

            this.wss.on('connection', (ws, req) => {
                this._onConnection(ws, req, authRequired);
            });

            this.wss.on('error', (err) => {
                this.sdk.requestLog({ level: 'error', message: `WSS error: ${err.message}` });
            });

            this.httpServer.listen(port, '127.0.0.1', () => {
                this._startHeartbeat();
                const addr = this.httpServer.address();
                let output = `\n${Colors.BOLD}GHOST IDE BRIDGE${Colors.ENDC}\n${'='.repeat(30)}\n`;
                output += `${Colors.GREEN}✓ Bridge listening${Colors.ENDC}\n`;
                output += `${Colors.CYAN}Endpoint:${Colors.ENDC}  ws://127.0.0.1:${addr.port}\n`;
                output += `${Colors.CYAN}Auth:${Colors.ENDC}      ${authRequired ? 'Token-based (run ghost bridge auth to get a token)' : 'Open (no-auth mode)'}\n`;
                output += `${Colors.DIM}Connect from your IDE plugin with the above endpoint.${Colors.ENDC}\n`;
                resolve({ success: true, output, port: addr.port });
            });

            this.httpServer.on('error', (err) => {
                this.httpServer = null;
                this.wss = null;
                resolve({ success: false, output: `${Colors.FAIL}Failed to start bridge: ${err.message}${Colors.ENDC}` });
            });
        });
    }

    async handleStop(params) {
        if (!this.httpServer) {
            return { success: false, output: `${Colors.WARNING}Bridge is not running.${Colors.ENDC}` };
        }

        // Notify and force-close all connected IDEs before closing the server.
        // wss.close() only stops accepting new connections — it won't call its
        // callback until all existing connections are gone, so we must terminate them.
        for (const session of this.sessions.values()) {
            session.notify('bridge.shutdown', { reason: 'Server stopping' });
            session.ws.terminate();
        }

        this._stopHeartbeat();

        return new Promise((resolve) => {
            this.wss.close(() => {
                this.httpServer.close(() => {
                    this.sessions.clear();
                    this.httpServer = null;
                    this.wss = null;
                    resolve({ success: true, output: `${Colors.GREEN}✓ Bridge stopped.${Colors.ENDC}` });
                });
            });
        });
    }

    // ── status ────────────────────────────────────────────────────────────────

    async handleStatus(params) {
        let output = `\n${Colors.BOLD}BRIDGE STATUS${Colors.ENDC}\n${'='.repeat(30)}\n`;

        if (this.httpServer && this.httpServer.address()) {
            const addr = this.httpServer.address();
            output += `Status:   ${Colors.GREEN}ONLINE${Colors.ENDC}\n`;
            output += `Endpoint: ws://127.0.0.1:${addr.port}\n`;
            output += `Sessions: ${this.sessions.size}\n\n`;

            if (this.sessions.size > 0) {
                output += `${Colors.BOLD}Connected Editors:${Colors.ENDC}\n`;
                for (const [id, sess] of this.sessions) {
                    const authFlag = sess.authenticated ? Colors.GREEN + '✓' : Colors.WARNING + '⏳';
                    output += `  ${authFlag}${Colors.ENDC} ${sess.editor.padEnd(20)} connected ${sess.connectedAt}\n`;
                }
            }
        } else {
            output += `Status: ${Colors.FAIL}OFFLINE${Colors.ENDC}\n`;
            output += `Run "ghost bridge start" to start the IDE bridge.\n`;
        }

        return { success: true, output, sessions: this.sessions.size };
    }

    // ── WebSocket connection handler ──────────────────────────────────────────

    _onConnection(ws, req, authRequired) {
        const sessionId = `sess_${crypto.randomBytes(6).toString('hex')}`;
        const session = new Session(ws, sessionId);
        this.sessions.set(sessionId, session);

        this.sdk.requestLog({ level: 'info', message: `New IDE connection: ${sessionId} from ${req.socket.remoteAddress}` });

        // Send welcome — tells the IDE the session ID and whether auth is required
        session.send(rpcNotification('ghost.connected', {
            sessionId,
            authRequired,
            version: '1.0',
            capabilities: ['proxy', 'events']
        }));

        ws.on('message', async (data) => {
            await this._onMessage(session, data, authRequired);
        });

        ws.on('close', (code, reason) => {
            this.sessions.delete(sessionId);
            this.sdk.requestLog({ level: 'info', message: `Session closed: ${sessionId} (${code})` });
        });

        ws.on('error', (err) => {
            this.sdk.requestLog({ level: 'warn', message: `Session error ${sessionId}: ${err.message}` });
            this.sessions.delete(sessionId);
        });

        ws.on('pong', () => {
            session.lastHeartbeat = Date.now();
        });
    }

    async _onMessage(session, rawData, authRequired) {
        let msg;
        try {
            msg = JSON.parse(rawData.toString());
        } catch (e) {
            session.send(rpcError(null, -32700, 'Parse error'));
            return;
        }

        if (!msg.jsonrpc || !msg.method) {
            session.send(rpcError(msg.id ?? null, -32600, 'Invalid Request'));
            return;
        }

        const { id, method, params = {} } = msg;

        // Auth gate — only ghost.auth is allowed before authentication
        if (authRequired && !session.authenticated && method !== 'ghost.auth') {
            session.send(rpcError(id, -32001, 'Not authenticated. Call ghost.auth first.'));
            return;
        }

        try {
            const result = await this._dispatch(session, method, params);
            session.send(rpcResult(id, result));
        } catch (err) {
            session.send(rpcError(id, -32603, err.message));
        }
    }

    async _dispatch(session, method, params) {
        // ── Built-in bridge methods ──
        if (method === 'ghost.auth') {
            return await this._authSession(session, params);
        }
        if (method === 'ghost.ping') {
            session.lastHeartbeat = Date.now();
            return { pong: true, time: Date.now() };
        }
        if (method === 'ghost.sessions') {
            return {
                count: this.sessions.size,
                current: session.id
            };
        }

        // ── Proxy to Ghost extensions ──
        // Convention: method = "<prefix>.<verb>" → extensionId = "ghost-<prefix>-extension"
        const dot = method.indexOf('.');
        if (dot === -1) {
            throw new Error(`Unknown method: ${method}. Format: <extension-prefix>.<command>`);
        }

        return await this._proxyToExtension(session, method, params);
    }

    async _authSession(session, params) {
        const { token, editor } = params;
        if (!token) throw new Error('token is required');

        const valid = await this._verifyToken(token);
        if (!valid) throw new Error('Invalid authentication token');

        session.authenticated = true;
        session.editor = editor || 'Unknown IDE';

        await this.sdk.requestLog({ level: 'info', message: `Session authenticated: ${session.id} (${session.editor})` });

        // Broadcast to other sessions that a new editor connected
        this._broadcast('ghost.event', {
            type: 'editor.connected',
            editor: session.editor,
            sessionId: session.id
        }, session.id);

        return { sessionId: session.id, authenticated: true };
    }

    async _proxyToExtension(session, method, params) {
        const [prefix, ...rest] = method.split('.');
        const extensionId = `ghost-${prefix}-extension`;
        const extMethod = `${prefix}.${rest.join('.')}`;

        await this.sdk.requestLog({
            level: 'info',
            message: `Proxying ${session.editor} → ${extensionId}::${extMethod}`
        });

        // Notify the IDE that we're working on it
        session.send(rpcNotification('ghost.progress', { method, status: 'dispatching', extensionId }));

        const result = await Promise.race([
            this.sdk.emitIntent({
                type: 'extension',
                operation: 'call',
                params: {
                    extensionId,
                    method: extMethod,
                    params
                }
            }),
            new Promise((_, reject) =>
                setTimeout(() => reject(new Error(`Proxy timeout (${this.PROXY_TIMEOUT}ms) for ${extMethod}`)),
                    this.PROXY_TIMEOUT)
            )
        ]);

        // Notify on completion
        session.send(rpcNotification('ghost.progress', { method, status: 'done', extensionId }));

        // Broadcast the result as an event to all authenticated sessions (so other IDEs see it)
        this._broadcast('ghost.intent.result', { method, extensionId, success: result?.success }, session.id);

        return result;
    }

    // ── Token verification ────────────────────────────────────────────────────

    async _verifyToken(token) {
        try {
            const configPath = path.join(os.homedir(), '.ghost', 'config', 'ghostrc.json');
            const content = await this.sdk.requestFileRead({ path: configPath });
            const config = JSON.parse(content);
            const bridgeToken = config.bridge?.token || config.marketplace?.token;
            if (bridgeToken && token === bridgeToken) return true;
        } catch (e) { /* config unreadable */ }
        if (process.env.GHOST_BRIDGE_TOKEN && token === process.env.GHOST_BRIDGE_TOKEN) return true;
        return false;
    }

    // ── Heartbeat ─────────────────────────────────────────────────────────────

    _startHeartbeat() {
        this.heartbeatTimer = setInterval(() => {
            const now = Date.now();
            for (const [id, session] of this.sessions) {
                if (!session.isAlive()) {
                    this.sessions.delete(id);
                    continue;
                }
                // Terminate sessions that haven't responded to pings in 2× the interval
                if (now - session.lastHeartbeat > this.HEARTBEAT_INTERVAL * 2) {
                    session.ws.terminate();
                    this.sessions.delete(id);
                    this.sdk.requestLog({ level: 'warn', message: `Session timed out: ${id}` });
                    continue;
                }
                session.ws.ping();
            }
        }, this.HEARTBEAT_INTERVAL);

        if (this.heartbeatTimer.unref) this.heartbeatTimer.unref(); // don't block process exit
    }

    _stopHeartbeat() {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }
    }

    // ── Broadcast ─────────────────────────────────────────────────────────────

    _broadcast(method, params, excludeSessionId = null) {
        const payload = rpcNotification(method, params);
        for (const [id, session] of this.sessions) {
            if (id !== excludeSessionId && session.authenticated) {
                session.send(payload);
            }
        }
    }

    // ── RPC dispatch (CLI commands) ───────────────────────────────────────────

    async handleRPCRequest(request) {
        const { method, params = {} } = request;
        try {
            switch (method) {
                case 'bridge.start':  return await this.handleStart(params);
                case 'bridge.stop':   return await this.handleStop(params);
                case 'bridge.status': return await this.handleStatus(params);
                default: throw new Error(`Unknown method: ${method}`);
            }
        } catch (error) {
            return { error: { code: -32603, message: error.message } };
        }
    }
}

module.exports = { BridgeExtension };
