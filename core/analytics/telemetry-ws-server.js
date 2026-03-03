const http = require('http');
const { EventEmitter } = require('events');

class TelemetryWebSocketServer extends EventEmitter {
    constructor(options = {}) {
        super();
        this.options = {
            port: options.port || 9877,
            host: options.host || 'localhost',
            ...options
        };

        this.clients = new Set();
        this.subscriptions = new Map();
        this.server = null;
        this.httpServer = null;
    }

    async start() {
        this.httpServer = http.createServer((req, res) => {
            res.writeHead(200, { 'Content-Type': 'text/plain' });
            res.end('Ghost Telemetry WebSocket Server\n');
        });

        this.httpServer.on('upgrade', (request, socket, head) => {
            this._handleUpgrade(request, socket, head);
        });

        return new Promise((resolve, reject) => {
            this.httpServer.listen(this.options.port, this.options.host, (err) => {
                if (err) {
                    reject(err);
                } else {
                    console.log(`[TelemetryWS] Server listening on ws://${this.options.host}:${this.options.port}`);
                    resolve();
                }
            });
        });
    }

    async stop() {
        for (const client of this.clients) {
            client.close();
        }
        this.clients.clear();
        this.subscriptions.clear();

        if (this.httpServer) {
            return new Promise((resolve) => {
                this.httpServer.close(() => {
                    console.log('[TelemetryWS] Server stopped');
                    resolve();
                });
            });
        }
    }

    broadcast(message) {
        const data = JSON.stringify(message);
        for (const client of this.clients) {
            if (client.readyState === 1) {
                try {
                    client.send(data);
                } catch (error) {
                    console.error('[TelemetryWS] Error broadcasting to client:', error.message);
                }
            }
        }
    }

    broadcastToExtension(extensionId, message) {
        const subscribers = this.subscriptions.get(extensionId) || new Set();
        const data = JSON.stringify(message);
        
        for (const client of subscribers) {
            if (client.readyState === 1) {
                try {
                    client.send(data);
                } catch (error) {
                    console.error('[TelemetryWS] Error broadcasting to extension subscriber:', error.message);
                }
            }
        }
    }

    sendToClient(client, message) {
        if (client.readyState === 1) {
            try {
                client.send(JSON.stringify(message));
            } catch (error) {
                console.error('[TelemetryWS] Error sending to client:', error.message);
            }
        }
    }

    _handleUpgrade(request, socket, head) {
        const ws = this._createWebSocket(socket, head);
        
        ws.on('message', (data) => {
            this._handleMessage(ws, data);
        });

        ws.on('close', () => {
            this._handleClose(ws);
        });

        ws.on('error', (error) => {
            console.error('[TelemetryWS] WebSocket error:', error.message);
        });

        this.clients.add(ws);
        this.emit('client-connected', { clientCount: this.clients.size });

        this.sendToClient(ws, {
            type: 'connected',
            timestamp: Date.now(),
            message: 'Connected to Ghost Telemetry Stream'
        });
    }

    _createWebSocket(socket, head) {
        const key = socket.headers['sec-websocket-key'];
        const acceptKey = this._generateAcceptKey(key);

        socket.write(
            'HTTP/1.1 101 Switching Protocols\r\n' +
            'Upgrade: websocket\r\n' +
            'Connection: Upgrade\r\n' +
            `Sec-WebSocket-Accept: ${acceptKey}\r\n` +
            '\r\n'
        );

        const ws = {
            socket,
            readyState: 1,
            subscriptions: new Set(),
            send: (data) => {
                if (ws.readyState === 1) {
                    const frame = this._createFrame(data);
                    socket.write(frame);
                }
            },
            close: () => {
                ws.readyState = 3;
                socket.end();
            }
        };

        socket.on('data', (buffer) => {
            if (ws.readyState === 1) {
                const message = this._parseFrame(buffer);
                if (message) {
                    ws.emit('message', message);
                }
            }
        });

        socket.on('close', () => {
            ws.readyState = 3;
            ws.emit('close');
        });

        socket.on('error', (error) => {
            ws.emit('error', error);
        });

        ws.on = (event, handler) => {
            if (!ws._events) ws._events = {};
            if (!ws._events[event]) ws._events[event] = [];
            ws._events[event].push(handler);
        };

        ws.emit = (event, ...args) => {
            if (ws._events && ws._events[event]) {
                for (const handler of ws._events[event]) {
                    handler(...args);
                }
            }
        };

        return ws;
    }

    _generateAcceptKey(key) {
        const crypto = require('crypto');
        const magicString = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
        const hash = crypto.createHash('sha1');
        hash.update(key + magicString);
        return hash.digest('base64');
    }

    _createFrame(data) {
        const payload = Buffer.from(data, 'utf8');
        const length = payload.length;
        
        let frame;
        if (length < 126) {
            frame = Buffer.allocUnsafe(2 + length);
            frame[0] = 0x81;
            frame[1] = length;
            payload.copy(frame, 2);
        } else if (length < 65536) {
            frame = Buffer.allocUnsafe(4 + length);
            frame[0] = 0x81;
            frame[1] = 126;
            frame.writeUInt16BE(length, 2);
            payload.copy(frame, 4);
        } else {
            frame = Buffer.allocUnsafe(10 + length);
            frame[0] = 0x81;
            frame[1] = 127;
            frame.writeBigUInt64BE(BigInt(length), 2);
            payload.copy(frame, 10);
        }
        
        return frame;
    }

    _parseFrame(buffer) {
        if (buffer.length < 2) return null;

        const opcode = buffer[0] & 0x0F;
        if (opcode === 0x08) {
            return null;
        }

        const masked = (buffer[1] & 0x80) === 0x80;
        let payloadLength = buffer[1] & 0x7F;
        let offset = 2;

        if (payloadLength === 126) {
            if (buffer.length < 4) return null;
            payloadLength = buffer.readUInt16BE(2);
            offset = 4;
        } else if (payloadLength === 127) {
            if (buffer.length < 10) return null;
            payloadLength = Number(buffer.readBigUInt64BE(2));
            offset = 10;
        }

        if (masked) {
            if (buffer.length < offset + 4) return null;
            const maskingKey = buffer.slice(offset, offset + 4);
            offset += 4;

            if (buffer.length < offset + payloadLength) return null;
            const payload = Buffer.allocUnsafe(payloadLength);
            for (let i = 0; i < payloadLength; i++) {
                payload[i] = buffer[offset + i] ^ maskingKey[i % 4];
            }
            return payload.toString('utf8');
        } else {
            if (buffer.length < offset + payloadLength) return null;
            return buffer.slice(offset, offset + payloadLength).toString('utf8');
        }
    }

    _handleMessage(client, data) {
        try {
            const message = JSON.parse(data);
            
            if (message.type === 'subscribe' && message.extensionId) {
                if (!this.subscriptions.has(message.extensionId)) {
                    this.subscriptions.set(message.extensionId, new Set());
                }
                this.subscriptions.get(message.extensionId).add(client);
                client.subscriptions.add(message.extensionId);
                
                this.sendToClient(client, {
                    type: 'subscribed',
                    extensionId: message.extensionId,
                    timestamp: Date.now()
                });
                
                this.emit('subscription-added', { extensionId: message.extensionId });
            } else if (message.type === 'unsubscribe' && message.extensionId) {
                const subscribers = this.subscriptions.get(message.extensionId);
                if (subscribers) {
                    subscribers.delete(client);
                    if (subscribers.size === 0) {
                        this.subscriptions.delete(message.extensionId);
                    }
                }
                client.subscriptions.delete(message.extensionId);
                
                this.sendToClient(client, {
                    type: 'unsubscribed',
                    extensionId: message.extensionId,
                    timestamp: Date.now()
                });
            } else if (message.type === 'ping') {
                this.sendToClient(client, {
                    type: 'pong',
                    timestamp: Date.now()
                });
            }
        } catch (error) {
            console.error('[TelemetryWS] Error handling message:', error.message);
        }
    }

    _handleClose(client) {
        this.clients.delete(client);
        
        for (const extensionId of client.subscriptions) {
            const subscribers = this.subscriptions.get(extensionId);
            if (subscribers) {
                subscribers.delete(client);
                if (subscribers.size === 0) {
                    this.subscriptions.delete(extensionId);
                }
            }
        }
        
        this.emit('client-disconnected', { clientCount: this.clients.size });
    }
}

module.exports = TelemetryWebSocketServer;
