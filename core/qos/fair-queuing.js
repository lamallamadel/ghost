class WeightedRequest {
    constructor(request, extensionId, priority, timestamp) {
        this.request = request;
        this.extensionId = extensionId;
        this.priority = priority;
        this.timestamp = timestamp;
        this.virtualFinishTime = 0;
    }
}

class ExtensionQueue {
    constructor(extensionId, weight) {
        this.extensionId = extensionId;
        this.weight = weight;
        this.queue = [];
        this.virtualStartTime = 0;
        this.sentBytes = 0;
        this.lastServed = 0;
    }

    enqueue(request) {
        this.queue.push(request);
    }

    dequeue() {
        return this.queue.shift();
    }

    peek() {
        return this.queue[0];
    }

    isEmpty() {
        return this.queue.length === 0;
    }

    size() {
        return this.queue.length;
    }
}

class WeightedFairQueuing {
    constructor(options = {}) {
        this.extensionQueues = new Map();
        this.defaultWeight = options.defaultWeight || 1;
        this.maxQueueSize = options.maxQueueSize || 1000;
        this.virtualTime = 0;
        this.lastUpdate = Date.now();
        
        this.stats = {
            totalServed: 0,
            totalDropped: 0,
            perExtension: new Map()
        };
    }

    registerExtension(extensionId, config = {}) {
        const weight = config.priority || config.weight || this.defaultWeight;
        
        if (!this.extensionQueues.has(extensionId)) {
            this.extensionQueues.set(extensionId, new ExtensionQueue(extensionId, weight));
            this.stats.perExtension.set(extensionId, {
                served: 0,
                dropped: 0,
                queueSize: 0,
                avgWaitTime: 0,
                totalWaitTime: 0
            });
        }
    }

    enqueue(request, extensionId, priority = null) {
        let queue = this.extensionQueues.get(extensionId);
        
        if (!queue) {
            this.registerExtension(extensionId, { priority: priority || this.defaultWeight });
            queue = this.extensionQueues.get(extensionId);
        }

        if (queue.size() >= this.maxQueueSize) {
            this.stats.totalDropped++;
            const extStats = this.stats.perExtension.get(extensionId);
            if (extStats) {
                extStats.dropped++;
            }
            
            return {
                enqueued: false,
                reason: 'Queue full',
                code: 'QUEUE_FULL'
            };
        }

        const timestamp = Date.now();
        const weightedReq = new WeightedRequest(request, extensionId, priority || queue.weight, timestamp);
        
        const packetSize = this._estimatePacketSize(request);
        weightedReq.virtualFinishTime = Math.max(this.virtualTime, queue.virtualStartTime) + (packetSize / queue.weight);
        
        queue.enqueue(weightedReq);
        queue.virtualStartTime = weightedReq.virtualFinishTime;
        
        const extStats = this.stats.perExtension.get(extensionId);
        if (extStats) {
            extStats.queueSize = queue.size();
        }

        return {
            enqueued: true,
            queuePosition: queue.size(),
            estimatedWait: this._estimateWaitTime(extensionId)
        };
    }

    dequeue() {
        let selectedQueue = null;
        let minVirtualFinishTime = Infinity;

        for (const [extensionId, queue] of this.extensionQueues) {
            if (!queue.isEmpty()) {
                const nextReq = queue.peek();
                if (nextReq.virtualFinishTime < minVirtualFinishTime) {
                    minVirtualFinishTime = nextReq.virtualFinishTime;
                    selectedQueue = queue;
                }
            }
        }

        if (!selectedQueue) {
            return null;
        }

        const weightedReq = selectedQueue.dequeue();
        this.virtualTime = weightedReq.virtualFinishTime;
        
        const now = Date.now();
        const waitTime = now - weightedReq.timestamp;
        
        this.stats.totalServed++;
        selectedQueue.sentBytes += this._estimatePacketSize(weightedReq.request);
        selectedQueue.lastServed = now;
        
        const extStats = this.stats.perExtension.get(weightedReq.extensionId);
        if (extStats) {
            extStats.served++;
            extStats.queueSize = selectedQueue.size();
            extStats.totalWaitTime += waitTime;
            extStats.avgWaitTime = extStats.totalWaitTime / extStats.served;
        }

        return {
            request: weightedReq.request,
            extensionId: weightedReq.extensionId,
            waitTime: waitTime,
            virtualFinishTime: weightedReq.virtualFinishTime
        };
    }

    _estimatePacketSize(request) {
        try {
            return JSON.stringify(request).length;
        } catch {
            return 1024;
        }
    }

    _estimateWaitTime(extensionId) {
        const queue = this.extensionQueues.get(extensionId);
        if (!queue || queue.isEmpty()) {
            return 0;
        }

        const extStats = this.stats.perExtension.get(extensionId);
        if (extStats && extStats.served > 0) {
            return extStats.avgWaitTime * queue.size();
        }

        return queue.size() * 100;
    }

    updateWeight(extensionId, newWeight) {
        const queue = this.extensionQueues.get(extensionId);
        if (queue) {
            queue.weight = newWeight;
            return true;
        }
        return false;
    }

    getQueueState(extensionId) {
        const queue = this.extensionQueues.get(extensionId);
        if (!queue) {
            return null;
        }

        return {
            extensionId: extensionId,
            weight: queue.weight,
            queueSize: queue.size(),
            virtualStartTime: queue.virtualStartTime,
            sentBytes: queue.sentBytes,
            lastServed: queue.lastServed,
            stats: this.stats.perExtension.get(extensionId)
        };
    }

    getAllQueueStates() {
        const states = {};
        for (const [extensionId] of this.extensionQueues) {
            states[extensionId] = this.getQueueState(extensionId);
        }
        return states;
    }

    getGlobalStats() {
        return {
            totalServed: this.stats.totalServed,
            totalDropped: this.stats.totalDropped,
            virtualTime: this.virtualTime,
            activeQueues: this.extensionQueues.size,
            totalQueued: Array.from(this.extensionQueues.values()).reduce((sum, q) => sum + q.size(), 0)
        };
    }

    reset(extensionId) {
        if (extensionId) {
            const queue = this.extensionQueues.get(extensionId);
            if (queue) {
                queue.queue = [];
                queue.virtualStartTime = 0;
                queue.sentBytes = 0;
            }
            const stats = this.stats.perExtension.get(extensionId);
            if (stats) {
                stats.served = 0;
                stats.dropped = 0;
                stats.queueSize = 0;
                stats.avgWaitTime = 0;
                stats.totalWaitTime = 0;
            }
        } else {
            for (const queue of this.extensionQueues.values()) {
                queue.queue = [];
                queue.virtualStartTime = 0;
                queue.sentBytes = 0;
            }
            this.virtualTime = 0;
            this.stats.totalServed = 0;
            this.stats.totalDropped = 0;
            for (const stats of this.stats.perExtension.values()) {
                stats.served = 0;
                stats.dropped = 0;
                stats.queueSize = 0;
                stats.avgWaitTime = 0;
                stats.totalWaitTime = 0;
            }
        }
    }

    cleanup(extensionId) {
        this.extensionQueues.delete(extensionId);
        this.stats.perExtension.delete(extensionId);
    }
}

module.exports = {
    WeightedFairQueuing,
    ExtensionQueue,
    WeightedRequest
};
