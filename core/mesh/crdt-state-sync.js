const { EventEmitter } = require('events');

class CRDTStateSync extends EventEmitter {
    constructor(options = {}) {
        super();
        this.agentId = options.agentId;
        this.meshNetwork = options.meshNetwork;
        
        this.state = new Map();
        this.vectorClock = new Map();
        this.tombstones = new Map();
        this.syncInterval = options.syncInterval || 5000;
        this.syncTimer = null;
        
        this.running = false;
        this._initializeVectorClock();
    }

    _initializeVectorClock() {
        this.vectorClock.set(this.agentId, 0);
    }

    start() {
        if (this.running) {
            return;
        }

        this.running = true;
        
        if (this.meshNetwork) {
            this.meshNetwork.on('request', (event) => {
                if (event.method === 'crdt_sync') {
                    this._handleSyncRequest(event);
                } else if (event.method === 'crdt_update') {
                    this._handleUpdate(event);
                }
            });

            this.meshNetwork.on('peer-connected', (event) => {
                this._syncWithPeer(event.peerId);
            });
        }

        this._startPeriodicSync();
        this.emit('started');
    }

    stop() {
        if (!this.running) {
            return;
        }

        this.running = false;

        if (this.syncTimer) {
            clearInterval(this.syncTimer);
            this.syncTimer = null;
        }

        this.emit('stopped');
    }

    set(key, value) {
        const timestamp = this._incrementClock();
        const operation = {
            type: 'set',
            key,
            value,
            agentId: this.agentId,
            timestamp,
            clock: this._getClockSnapshot()
        };

        this._applyOperation(operation);
        this._broadcastUpdate(operation);

        this.emit('change', { key, value, operation: 'set' });
    }

    delete(key) {
        const timestamp = this._incrementClock();
        const operation = {
            type: 'delete',
            key,
            agentId: this.agentId,
            timestamp,
            clock: this._getClockSnapshot()
        };

        this._applyOperation(operation);
        this._broadcastUpdate(operation);

        this.emit('change', { key, operation: 'delete' });
    }

    get(key) {
        if (this.tombstones.has(key)) {
            return undefined;
        }
        const entry = this.state.get(key);
        return entry ? entry.value : undefined;
    }

    has(key) {
        return this.state.has(key) && !this.tombstones.has(key);
    }

    getAll() {
        const result = {};
        for (const [key, entry] of this.state) {
            if (!this.tombstones.has(key)) {
                result[key] = entry.value;
            }
        }
        return result;
    }

    _applyOperation(operation) {
        const { type, key, value, agentId, timestamp, clock } = operation;

        this._mergeVectorClock(clock);

        if (type === 'set') {
            const existing = this.state.get(key);
            
            if (!existing || this._shouldReplace(existing, operation)) {
                this.state.set(key, {
                    value,
                    agentId,
                    timestamp,
                    clock: { ...clock }
                });
                
                if (this.tombstones.has(key)) {
                    const tombstone = this.tombstones.get(key);
                    if (this._compareClocks(clock, tombstone.clock) > 0) {
                        this.tombstones.delete(key);
                    }
                }
            }
        } else if (type === 'delete') {
            const existing = this.state.get(key);
            const tombstone = this.tombstones.get(key);
            
            if (!tombstone || this._shouldReplace(tombstone, operation)) {
                this.tombstones.set(key, {
                    agentId,
                    timestamp,
                    clock: { ...clock }
                });
            }
        }
    }

    _shouldReplace(existing, incoming) {
        const clockComparison = this._compareClocks(incoming.clock, existing.clock);
        
        if (clockComparison > 0) {
            return true;
        } else if (clockComparison < 0) {
            return false;
        } else {
            return incoming.agentId > existing.agentId;
        }
    }

    _compareClocks(clock1, clock2) {
        let greater = false;
        let less = false;

        const allAgents = new Set([
            ...Object.keys(clock1 || {}),
            ...Object.keys(clock2 || {})
        ]);

        for (const agent of allAgents) {
            const val1 = clock1[agent] || 0;
            const val2 = clock2[agent] || 0;

            if (val1 > val2) {
                greater = true;
            } else if (val1 < val2) {
                less = true;
            }
        }

        if (greater && !less) return 1;
        if (less && !greater) return -1;
        return 0;
    }

    _mergeVectorClock(remoteClock) {
        for (const [agent, count] of Object.entries(remoteClock || {})) {
            const currentCount = this.vectorClock.get(agent) || 0;
            this.vectorClock.set(agent, Math.max(currentCount, count));
        }
    }

    _incrementClock() {
        const current = this.vectorClock.get(this.agentId) || 0;
        const next = current + 1;
        this.vectorClock.set(this.agentId, next);
        return Date.now();
    }

    _getClockSnapshot() {
        const snapshot = {};
        for (const [agent, count] of this.vectorClock) {
            snapshot[agent] = count;
        }
        return snapshot;
    }

    _broadcastUpdate(operation) {
        if (!this.meshNetwork || !this.running) {
            return;
        }

        const peers = this.meshNetwork.getPeers();
        for (const peer of peers) {
            this.meshNetwork.sendRequest(peer.id, 'crdt_update', {
                operation
            }).catch((error) => {
                this.emit('sync-error', {
                    peerId: peer.id,
                    error: error.message
                });
            });
        }
    }

    async _syncWithPeer(peerId) {
        if (!this.meshNetwork || !this.running) {
            return;
        }

        try {
            const response = await this.meshNetwork.sendRequest(peerId, 'crdt_sync', {
                clock: this._getClockSnapshot()
            });

            if (response.operations) {
                for (const operation of response.operations) {
                    this._applyOperation(operation);
                }
            }

            this.emit('synced', { peerId, operationCount: response.operations?.length || 0 });
        } catch (error) {
            this.emit('sync-error', {
                peerId,
                error: error.message
            });
        }
    }

    _handleSyncRequest(event) {
        const { clock } = event.params;
        const operations = [];

        for (const [key, entry] of this.state) {
            if (this._needsSync(entry.clock, clock)) {
                operations.push({
                    type: 'set',
                    key,
                    value: entry.value,
                    agentId: entry.agentId,
                    timestamp: entry.timestamp,
                    clock: entry.clock
                });
            }
        }

        for (const [key, tombstone] of this.tombstones) {
            if (this._needsSync(tombstone.clock, clock)) {
                operations.push({
                    type: 'delete',
                    key,
                    agentId: tombstone.agentId,
                    timestamp: tombstone.timestamp,
                    clock: tombstone.clock
                });
            }
        }

        event.reply({ operations });
    }

    _handleUpdate(event) {
        const { operation } = event.params;
        this._applyOperation(operation);
        
        this.emit('remote-change', {
            key: operation.key,
            value: operation.value,
            operation: operation.type,
            from: operation.agentId
        });

        event.reply({ success: true });
    }

    _needsSync(entryClock, remoteClock) {
        const comparison = this._compareClocks(entryClock, remoteClock);
        return comparison > 0;
    }

    _startPeriodicSync() {
        if (!this.meshNetwork) {
            return;
        }

        this.syncTimer = setInterval(() => {
            const peers = this.meshNetwork.getPeers();
            for (const peer of peers) {
                this._syncWithPeer(peer.id).catch(() => {});
            }
        }, this.syncInterval);
    }

    getState() {
        return {
            agentId: this.agentId,
            running: this.running,
            stateSize: this.state.size,
            tombstoneSize: this.tombstones.size,
            vectorClock: this._getClockSnapshot()
        };
    }
}

module.exports = { CRDTStateSync };
