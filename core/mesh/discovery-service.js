const { EventEmitter } = require('events');
const dgram = require('dgram');
const { networkInterfaces } = require('os');

class AgentDiscoveryService extends EventEmitter {
    constructor(options = {}) {
        super();
        this.agentId = options.agentId;
        this.port = options.port;
        this.capabilities = options.capabilities || [];
        this.metadata = options.metadata || {};
        
        this.multicastAddress = options.multicastAddress || '239.255.255.250';
        this.multicastPort = options.multicastPort || 5353;
        this.announceInterval = options.announceInterval || 30000;
        this.agentTTL = options.agentTTL || 90000;
        
        this.socket = null;
        this.announceTimer = null;
        this.discoveredAgents = new Map();
        this.state = 'STOPPED';
    }

    async start() {
        if (this.state === 'RUNNING') {
            throw new Error('Discovery service already running');
        }

        return new Promise((resolve, reject) => {
            this.socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });

            this.socket.on('error', (error) => {
                if (this.state !== 'RUNNING') {
                    reject(error);
                } else {
                    this.emit('error', { error: error.message });
                }
            });

            this.socket.on('message', (msg, rinfo) => {
                this._handleDiscoveryMessage(msg, rinfo);
            });

            this.socket.on('listening', () => {
                const address = this.socket.address();
                
                try {
                    this.socket.setBroadcast(true);
                    this.socket.setMulticastTTL(128);
                    this.socket.addMembership(this.multicastAddress);
                    
                    const interfaces = networkInterfaces();
                    for (const name of Object.keys(interfaces)) {
                        for (const iface of interfaces[name]) {
                            if (iface.family === 'IPv4' && !iface.internal) {
                                try {
                                    this.socket.setMulticastInterface(iface.address);
                                } catch (e) {
                                }
                            }
                        }
                    }
                } catch (error) {
                    this.emit('warning', { message: `Multicast setup warning: ${error.message}` });
                }

                this.state = 'RUNNING';
                this._startAnnouncing();
                this._startCleanup();
                
                this.emit('started', {
                    address: address.address,
                    port: address.port
                });

                resolve({
                    address: address.address,
                    port: address.port
                });
            });

            this.socket.bind(this.multicastPort);
        });
    }

    async stop() {
        if (this.state === 'STOPPED') {
            return;
        }

        this.state = 'STOPPING';

        if (this.announceTimer) {
            clearInterval(this.announceTimer);
            this.announceTimer = null;
        }

        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
            this.cleanupTimer = null;
        }

        this._announceLeave();

        if (this.socket) {
            await new Promise((resolve) => {
                this.socket.close(() => resolve());
            });
            this.socket = null;
        }

        this.discoveredAgents.clear();
        this.state = 'STOPPED';
        this.emit('stopped');
    }

    _startAnnouncing() {
        this._announce();
        
        this.announceTimer = setInterval(() => {
            this._announce();
        }, this.announceInterval);
    }

    _announce() {
        const announcement = {
            type: 'agent_announce',
            agentId: this.agentId,
            port: this.port,
            capabilities: this.capabilities,
            metadata: this.metadata,
            timestamp: Date.now()
        };

        this._sendDiscoveryMessage(announcement);
    }

    _announceLeave() {
        const announcement = {
            type: 'agent_leave',
            agentId: this.agentId,
            timestamp: Date.now()
        };

        this._sendDiscoveryMessage(announcement);
    }

    _sendDiscoveryMessage(message) {
        if (!this.socket) return;

        const buffer = Buffer.from(JSON.stringify(message));
        
        this.socket.send(buffer, 0, buffer.length, this.multicastPort, this.multicastAddress, (error) => {
            if (error) {
                this.emit('error', { error: `Failed to send discovery message: ${error.message}` });
            }
        });
    }

    _handleDiscoveryMessage(msg, rinfo) {
        try {
            const message = JSON.parse(msg.toString());
            
            if (message.agentId === this.agentId) {
                return;
            }

            if (message.type === 'agent_announce') {
                const agentInfo = {
                    id: message.agentId,
                    host: rinfo.address,
                    port: message.port,
                    capabilities: message.capabilities || [],
                    metadata: message.metadata || {},
                    lastSeen: Date.now(),
                    timestamp: message.timestamp
                };

                const isNew = !this.discoveredAgents.has(message.agentId);
                this.discoveredAgents.set(message.agentId, agentInfo);

                if (isNew) {
                    this.emit('agent-discovered', agentInfo);
                } else {
                    this.emit('agent-updated', agentInfo);
                }
            } else if (message.type === 'agent_leave') {
                if (this.discoveredAgents.has(message.agentId)) {
                    const agentInfo = this.discoveredAgents.get(message.agentId);
                    this.discoveredAgents.delete(message.agentId);
                    this.emit('agent-left', agentInfo);
                }
            }
        } catch (error) {
            this.emit('error', { error: `Failed to parse discovery message: ${error.message}` });
        }
    }

    _startCleanup() {
        this.cleanupTimer = setInterval(() => {
            const now = Date.now();
            
            for (const [agentId, agent] of this.discoveredAgents) {
                if (now - agent.lastSeen > this.agentTTL) {
                    this.discoveredAgents.delete(agentId);
                    this.emit('agent-timeout', agent);
                }
            }
        }, this.announceInterval);
    }

    getDiscoveredAgents() {
        return Array.from(this.discoveredAgents.values());
    }

    getAgentById(agentId) {
        return this.discoveredAgents.get(agentId);
    }

    getAgentsByCapability(capability) {
        const agents = [];
        for (const agent of this.discoveredAgents.values()) {
            if (agent.capabilities.includes(capability)) {
                agents.push(agent);
            }
        }
        return agents;
    }
}

module.exports = { AgentDiscoveryService };
