const { EventEmitter } = require('events');
const http = require('http');

class HotReloadWebSocketServer extends EventEmitter {
    constructor(hotReload, options = {}) {
        super();
        this.hotReload = hotReload;
        this.options = options;
        
        this.port = options.port || 9876;
        this.host = options.host || 'localhost';
        
        this.server = null;
        this.clients = new Set();
        this.isRunning = false;
        
        this._setupHotReloadListeners();
    }

    _setupHotReloadListeners() {
        const events = [
            'reload-started',
            'reload-completed',
            'reload-failed',
            'watch-enabled',
            'watch-disabled',
            'shutdown-started',
            'shutdown-completed',
            'extension-loaded',
            'state-restored',
            'state-capture-error',
            'state-restore-error',
            'cache-cleared',
            'retry-started',
            'retry-completed',
            'retry-failed'
        ];

        events.forEach(event => {
            this.hotReload.on(event, (data) => {
                this._broadcast({
                    type: 'hot-reload',
                    event,
                    data,
                    timestamp: Date.now()
                });
            });
        });
    }

    async start() {
        if (this.isRunning) {
            return;
        }

        return new Promise((resolve, reject) => {
            this.server = http.createServer((req, res) => {
                if (req.url === '/health') {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ 
                        status: 'ok', 
                        clients: this.clients.size,
                        timestamp: Date.now()
                    }));
                    return;
                }

                if (req.url === '/status') {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        reloadStatus: this.hotReload.getAllReloadStatus(),
                        clients: this.clients.size,
                        timestamp: Date.now()
                    }));
                    return;
                }

                res.writeHead(404);
                res.end();
            });

            this.server.on('upgrade', (request, socket, head) => {
                if (request.url !== '/ws') {
                    socket.destroy();
                    return;
                }

                this._handleWebSocketUpgrade(socket, head);
            });

            this.server.listen(this.port, this.host, () => {
                this.isRunning = true;
                
                this.emit('started', {
                    port: this.port,
                    host: this.host,
                    timestamp: Date.now()
                });

                resolve({
                    port: this.port,
                    host: this.host,
                    url: `ws://${this.host}:${this.port}/ws`
                });
            });

            this.server.on('error', (error) => {
                this.emit('error', { error: error.message });
                reject(error);
            });
        });
    }

    _handleWebSocketUpgrade(socket, head) {
        const client = this._createWebSocketClient(socket);
        
        this.clients.add(client);
        
        this.emit('client-connected', {
            clientId: client.id,
            clientCount: this.clients.size,
            timestamp: Date.now()
        });

        client.send({
            type: 'connection',
            event: 'connected',
            data: {
                clientId: client.id,
                reloadStatus: this.hotReload.getAllReloadStatus()
            }
        });

        client.on('close', () => {
            this.clients.delete(client);
            
            this.emit('client-disconnected', {
                clientId: client.id,
                clientCount: this.clients.size,
                timestamp: Date.now()
            });
        });

        client.on('error', (error) => {
            this.emit('client-error', {
                clientId: client.id,
                error: error.message,
                timestamp: Date.now()
            });
        });

        client.on('message', (message) => {
            this._handleClientMessage(client, message);
        });
    }

    _createWebSocketClient(socket) {
        const clientId = `client-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        
        const client = {
            id: clientId,
            socket,
            isOpen: true,
            
            send(data) {
                if (!this.isOpen) {
                    return;
                }

                try {
                    const payload = JSON.stringify(data);
                    const frame = this._encodeWebSocketFrame(payload);
                    this.socket.write(frame);
                } catch (error) {
                    this.emit('error', error);
                }
            },

            close() {
                if (!this.isOpen) {
                    return;
                }

                this.isOpen = false;
                this.socket.end();
            },

            _encodeWebSocketFrame(payload) {
                const payloadBuffer = Buffer.from(payload, 'utf8');
                const payloadLength = payloadBuffer.length;
                
                let frameBuffer;
                let offset = 2;

                if (payloadLength < 126) {
                    frameBuffer = Buffer.allocUnsafe(2 + payloadLength);
                    frameBuffer[1] = payloadLength;
                } else if (payloadLength < 65536) {
                    frameBuffer = Buffer.allocUnsafe(4 + payloadLength);
                    frameBuffer[1] = 126;
                    frameBuffer.writeUInt16BE(payloadLength, 2);
                    offset = 4;
                } else {
                    frameBuffer = Buffer.allocUnsafe(10 + payloadLength);
                    frameBuffer[1] = 127;
                    frameBuffer.writeUInt32BE(0, 2);
                    frameBuffer.writeUInt32BE(payloadLength, 6);
                    offset = 10;
                }

                frameBuffer[0] = 0x81;
                payloadBuffer.copy(frameBuffer, offset);

                return frameBuffer;
            },

            _decodeWebSocketFrame(buffer) {
                if (buffer.length < 2) {
                    return null;
                }

                const firstByte = buffer[0];
                const secondByte = buffer[1];
                
                const isFinal = (firstByte & 0x80) !== 0;
                const opcode = firstByte & 0x0F;
                const isMasked = (secondByte & 0x80) !== 0;
                let payloadLength = secondByte & 0x7F;
                
                let offset = 2;
                
                if (payloadLength === 126) {
                    if (buffer.length < 4) return null;
                    payloadLength = buffer.readUInt16BE(2);
                    offset = 4;
                } else if (payloadLength === 127) {
                    if (buffer.length < 10) return null;
                    payloadLength = buffer.readUInt32BE(6);
                    offset = 10;
                }
                
                let maskKey;
                if (isMasked) {
                    if (buffer.length < offset + 4) return null;
                    maskKey = buffer.slice(offset, offset + 4);
                    offset += 4;
                }
                
                if (buffer.length < offset + payloadLength) {
                    return null;
                }
                
                let payload = buffer.slice(offset, offset + payloadLength);
                
                if (isMasked) {
                    for (let i = 0; i < payload.length; i++) {
                        payload[i] ^= maskKey[i % 4];
                    }
                }
                
                return {
                    opcode,
                    payload: payload.toString('utf8'),
                    frameLength: offset + payloadLength
                };
            }
        };

        Object.setPrototypeOf(client, EventEmitter.prototype);
        EventEmitter.call(client);

        let buffer = Buffer.alloc(0);

        socket.on('data', (data) => {
            buffer = Buffer.concat([buffer, data]);

            while (buffer.length > 0) {
                const frame = client._decodeWebSocketFrame(buffer);
                
                if (!frame) {
                    break;
                }

                buffer = buffer.slice(frame.frameLength);

                if (frame.opcode === 0x8) {
                    client.close();
                    break;
                } else if (frame.opcode === 0x9) {
                    client.send({ type: 'pong' });
                } else if (frame.opcode === 0x1) {
                    try {
                        const message = JSON.parse(frame.payload);
                        client.emit('message', message);
                    } catch (error) {
                        client.emit('error', error);
                    }
                }
            }
        });

        socket.on('close', () => {
            client.isOpen = false;
            client.emit('close');
        });

        socket.on('error', (error) => {
            client.emit('error', error);
        });

        const key = socket.headers?.['sec-websocket-key'];
        if (key) {
            const crypto = require('crypto');
            const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
            const acceptKey = crypto
                .createHash('sha1')
                .update(key + GUID)
                .digest('base64');

            socket.write(
                'HTTP/1.1 101 Switching Protocols\r\n' +
                'Upgrade: websocket\r\n' +
                'Connection: Upgrade\r\n' +
                `Sec-WebSocket-Accept: ${acceptKey}\r\n` +
                '\r\n'
            );
        }

        return client;
    }

    _handleClientMessage(client, message) {
        if (message.type === 'ping') {
            client.send({ type: 'pong', timestamp: Date.now() });
            return;
        }

        if (message.type === 'reload-request') {
            const { extensionId, options } = message.data || {};
            
            if (!extensionId) {
                client.send({
                    type: 'error',
                    error: 'extensionId is required',
                    timestamp: Date.now()
                });
                return;
            }

            this.hotReload.reloadExtension(extensionId, options)
                .then((result) => {
                    client.send({
                        type: 'reload-response',
                        data: result,
                        timestamp: Date.now()
                    });
                })
                .catch((error) => {
                    client.send({
                        type: 'reload-error',
                        error: error.message,
                        timestamp: Date.now()
                    });
                });
            
            return;
        }

        if (message.type === 'status-request') {
            client.send({
                type: 'status-response',
                data: this.hotReload.getAllReloadStatus(),
                timestamp: Date.now()
            });
            return;
        }

        if (message.type === 'enable-watch') {
            const { extensionId } = message.data || {};
            
            if (!extensionId) {
                client.send({
                    type: 'error',
                    error: 'extensionId is required',
                    timestamp: Date.now()
                });
                return;
            }

            this.hotReload.enableHotReload(extensionId)
                .then(() => {
                    client.send({
                        type: 'watch-enabled-response',
                        data: { extensionId },
                        timestamp: Date.now()
                    });
                })
                .catch((error) => {
                    client.send({
                        type: 'watch-error',
                        error: error.message,
                        timestamp: Date.now()
                    });
                });
            
            return;
        }

        if (message.type === 'disable-watch') {
            const { extensionId } = message.data || {};
            
            if (!extensionId) {
                client.send({
                    type: 'error',
                    error: 'extensionId is required',
                    timestamp: Date.now()
                });
                return;
            }

            this.hotReload.disableHotReload(extensionId);
            
            client.send({
                type: 'watch-disabled-response',
                data: { extensionId },
                timestamp: Date.now()
            });
            
            return;
        }
    }

    _broadcast(data) {
        for (const client of this.clients) {
            client.send(data);
        }
    }

    async stop() {
        if (!this.isRunning) {
            return;
        }

        for (const client of this.clients) {
            client.close();
        }

        this.clients.clear();

        return new Promise((resolve) => {
            if (this.server) {
                this.server.close(() => {
                    this.isRunning = false;
                    
                    this.emit('stopped', {
                        timestamp: Date.now()
                    });

                    resolve();
                });
            } else {
                resolve();
            }
        });
    }

    getStatus() {
        return {
            isRunning: this.isRunning,
            port: this.port,
            host: this.host,
            clientCount: this.clients.size,
            url: this.isRunning ? `ws://${this.host}:${this.port}/ws` : null
        };
    }
}

module.exports = HotReloadWebSocketServer;
