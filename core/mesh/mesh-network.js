const { EventEmitter } = require('events');
const WebSocket = require('ws');
const { randomBytes } = require('crypto');

class AgentMeshNetwork extends EventEmitter {
    constructor(options = {}) {
        super();
        this.agentId = options.agentId || this._generateAgentId();
        this.port = options.port || 0;
        this.capabilities = options.capabilities || [];
        this.metadata = options.metadata || {};
        
        this.peers = new Map();
        this.server = null;
        this.reconnectInterval = options.reconnectInterval || 5000;
        this.heartbeatInterval = options.heartbeatInterval || 10000;
        this.messageTimeout = options.messageTimeout || 30000;
        
        this.pendingRequests = new Map();
        this.nextRequestId = 1;
        this.heartbeatTimers = new Map();
        
        this.state = 'STOPPED';
    }

    _generateAgentId() {
        return `agent-${randomBytes(8).toString('hex')}`;
    }

    async start() {
        if (this.state === 'RUNNING') {
            throw new Error('Mesh network already running');
        }

        return new Promise((resolve, reject) => {
            this.server = new WebSocket.Server({ port: this.port }, () => {
                const address = this.server.address();
                this.port = address.port;
                this.state = 'RUNNING';
                
                this.emit('started', {
                    agentId: this.agentId,
                    port: this.port,
                    address: address.address
                });
                
                resolve({
                    agentId: this.agentId,
                    port: this.port,
                    address: address.address
                });
            });

            this.server.on('error', (error) => {
                if (this.state !== 'RUNNING') {
                    reject(error);
                } else {
                    this.emit('error', { error: error.message });
                }
            });

            this.server.on('connection', (ws, req) => {
                this._handleIncomingConnection(ws, req);
            });
        });
    }

    async stop() {
        if (this.state === 'STOPPED') {
            return;
        }

        this.state = 'STOPPING';

        for (const [peerId, peer] of this.peers) {
            this._disconnectPeer(peerId);
        }

        this.peers.clear();
        this.pendingRequests.clear();

        if (this.server) {
            await new Promise((resolve) => {
                this.server.close(() => resolve());
            });
            this.server = null;
        }

        this.state = 'STOPPED';
        this.emit('stopped', { agentId: this.agentId });
    }

    async connectToPeer(host, port, peerId = null) {
        const url = `ws://${host}:${port}`;
        
        return new Promise((resolve, reject) => {
            const ws = new WebSocket(url);
            const connectionTimeout = setTimeout(() => {
                ws.terminate();
                reject(new Error(`Connection timeout to ${url}`));
            }, 10000);

            ws.on('open', () => {
                clearTimeout(connectionTimeout);
                
                this._sendMessage(ws, {
                    type: 'handshake',
                    agentId: this.agentId,
                    capabilities: this.capabilities,
                    metadata: this.metadata
                });
            });

            ws.on('message', (data) => {
                try {
                    const message = JSON.parse(data);
                    
                    if (message.type === 'handshake_ack') {
                        const remotePeerId = message.agentId;
                        
                        this.peers.set(remotePeerId, {
                            id: remotePeerId,
                            ws,
                            capabilities: message.capabilities || [],
                            metadata: message.metadata || {},
                            host,
                            port,
                            lastHeartbeat: Date.now(),
                            state: 'CONNECTED'
                        });

                        this._startHeartbeat(remotePeerId);
                        
                        this.emit('peer-connected', {
                            peerId: remotePeerId,
                            capabilities: message.capabilities,
                            metadata: message.metadata
                        });

                        resolve(remotePeerId);
                    } else {
                        this._handleMessage(ws, message, peerId);
                    }
                } catch (error) {
                    this.emit('error', { error: `Message parse error: ${error.message}` });
                }
            });

            ws.on('error', (error) => {
                clearTimeout(connectionTimeout);
                if (!peerId) {
                    reject(error);
                } else {
                    this.emit('peer-error', { peerId, error: error.message });
                }
            });

            ws.on('close', () => {
                clearTimeout(connectionTimeout);
                if (peerId && this.peers.has(peerId)) {
                    this._handlePeerDisconnect(peerId);
                }
            });
        });
    }

    _handleIncomingConnection(ws, req) {
        let peerId = null;

        ws.on('message', (data) => {
            try {
                const message = JSON.parse(data);
                
                if (message.type === 'handshake') {
                    peerId = message.agentId;
                    
                    this.peers.set(peerId, {
                        id: peerId,
                        ws,
                        capabilities: message.capabilities || [],
                        metadata: message.metadata || {},
                        lastHeartbeat: Date.now(),
                        state: 'CONNECTED'
                    });

                    this._sendMessage(ws, {
                        type: 'handshake_ack',
                        agentId: this.agentId,
                        capabilities: this.capabilities,
                        metadata: this.metadata
                    });

                    this._startHeartbeat(peerId);
                    
                    this.emit('peer-connected', {
                        peerId,
                        capabilities: message.capabilities,
                        metadata: message.metadata
                    });
                } else if (peerId) {
                    this._handleMessage(ws, message, peerId);
                }
            } catch (error) {
                this.emit('error', { error: `Message parse error: ${error.message}` });
            }
        });

        ws.on('error', (error) => {
            if (peerId) {
                this.emit('peer-error', { peerId, error: error.message });
            }
        });

        ws.on('close', () => {
            if (peerId) {
                this._handlePeerDisconnect(peerId);
            }
        });
    }

    _handleMessage(ws, message, peerId) {
        const peer = this.peers.get(peerId);
        if (!peer) return;

        switch (message.type) {
            case 'request':
                this._handleRequest(ws, message, peerId);
                break;
            case 'response':
                this._handleResponse(message);
                break;
            case 'heartbeat':
                peer.lastHeartbeat = Date.now();
                this._sendMessage(ws, {
                    type: 'heartbeat_ack',
                    timestamp: Date.now()
                });
                break;
            case 'heartbeat_ack':
                peer.lastHeartbeat = Date.now();
                break;
            default:
                this.emit('message', { peerId, message });
        }
    }

    async _handleRequest(ws, message, peerId) {
        try {
            const { id, method, params } = message;
            
            const result = await new Promise((resolve, reject) => {
                this.emit('request', {
                    peerId,
                    method,
                    params,
                    reply: (result) => resolve(result),
                    error: (error) => reject(error)
                });
            });

            this._sendMessage(ws, {
                type: 'response',
                id,
                result
            });
        } catch (error) {
            this._sendMessage(ws, {
                type: 'response',
                id: message.id,
                error: {
                    code: -32603,
                    message: error.message
                }
            });
        }
    }

    _handleResponse(message) {
        const { id, result, error } = message;
        const pending = this.pendingRequests.get(id);
        
        if (!pending) return;

        clearTimeout(pending.timeout);
        this.pendingRequests.delete(id);

        if (error) {
            pending.reject(new Error(error.message));
        } else {
            pending.resolve(result);
        }
    }

    async sendRequest(peerId, method, params = {}) {
        const peer = this.peers.get(peerId);
        
        if (!peer || peer.state !== 'CONNECTED') {
            throw new Error(`Peer ${peerId} not connected`);
        }

        return new Promise((resolve, reject) => {
            const requestId = this.nextRequestId++;
            
            const timeout = setTimeout(() => {
                this.pendingRequests.delete(requestId);
                reject(new Error(`Request timeout to peer ${peerId}`));
            }, this.messageTimeout);

            this.pendingRequests.set(requestId, {
                resolve,
                reject,
                timeout
            });

            this._sendMessage(peer.ws, {
                type: 'request',
                id: requestId,
                method,
                params
            });
        });
    }

    broadcast(message) {
        for (const [peerId, peer] of this.peers) {
            if (peer.state === 'CONNECTED') {
                this._sendMessage(peer.ws, message);
            }
        }
    }

    _sendMessage(ws, message) {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(message));
        }
    }

    _startHeartbeat(peerId) {
        if (this.heartbeatTimers.has(peerId)) {
            clearInterval(this.heartbeatTimers.get(peerId));
        }

        const timer = setInterval(() => {
            const peer = this.peers.get(peerId);
            if (!peer) {
                clearInterval(timer);
                this.heartbeatTimers.delete(peerId);
                return;
            }

            const timeSinceHeartbeat = Date.now() - peer.lastHeartbeat;
            
            if (timeSinceHeartbeat > this.heartbeatInterval * 3) {
                this.emit('peer-timeout', { peerId });
                this._disconnectPeer(peerId);
                return;
            }

            this._sendMessage(peer.ws, {
                type: 'heartbeat',
                timestamp: Date.now()
            });
        }, this.heartbeatInterval);

        this.heartbeatTimers.set(peerId, timer);
    }

    _handlePeerDisconnect(peerId) {
        this._disconnectPeer(peerId);
        this.emit('peer-disconnected', { peerId });
        
        if (this.state === 'RUNNING') {
            const peer = this.peers.get(peerId);
            if (peer && peer.host && peer.port) {
                setTimeout(() => {
                    if (this.state === 'RUNNING' && !this.peers.has(peerId)) {
                        this.connectToPeer(peer.host, peer.port).catch(() => {});
                    }
                }, this.reconnectInterval);
            }
        }
    }

    _disconnectPeer(peerId) {
        const peer = this.peers.get(peerId);
        if (!peer) return;

        if (this.heartbeatTimers.has(peerId)) {
            clearInterval(this.heartbeatTimers.get(peerId));
            this.heartbeatTimers.delete(peerId);
        }

        if (peer.ws) {
            peer.ws.terminate();
        }

        this.peers.delete(peerId);
    }

    getPeers() {
        const peers = [];
        for (const [peerId, peer] of this.peers) {
            peers.push({
                id: peerId,
                capabilities: peer.capabilities,
                metadata: peer.metadata,
                state: peer.state,
                lastHeartbeat: peer.lastHeartbeat
            });
        }
        return peers;
    }

    getAgentInfo() {
        return {
            id: this.agentId,
            port: this.port,
            capabilities: this.capabilities,
            metadata: this.metadata,
            state: this.state,
            peerCount: this.peers.size
        };
    }
}

module.exports = { AgentMeshNetwork };
