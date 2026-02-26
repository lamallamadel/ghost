const { EventEmitter } = require('events');

class WebhookDeliveryQueue extends EventEmitter {
    constructor(options = {}) {
        super();
        
        this.auditLogger = options.auditLogger;
        this.eventStore = options.eventStore;
        this.gateway = options.gateway;
        this.runtime = options.runtime;
        
        this.queue = [];
        this.processing = false;
        this.maxConcurrent = options.maxConcurrent || 5;
        this.currentlyProcessing = 0;
        
        this.retryStrategy = {
            maxAttempts: options.maxRetryAttempts || 5,
            initialDelay: options.initialRetryDelay || 1000,
            maxDelay: options.maxRetryDelay || 60000,
            backoffFactor: options.backoffFactor || 2
        };
        
        this._startProcessing();
    }
    
    async enqueue(delivery) {
        const deliveryRecord = await this.eventStore.saveDelivery({
            ...delivery,
            status: 'pending',
            attempts: 0,
            nextRetryAt: null,
            lastError: null
        });
        
        this.queue.push(deliveryRecord);
        
        this.emit('enqueued', deliveryRecord);
        
        this._processNext();
        
        return deliveryRecord;
    }
    
    _startProcessing() {
        setInterval(() => {
            this._processNext();
        }, 1000);
    }
    
    async _processNext() {
        if (this.currentlyProcessing >= this.maxConcurrent) {
            return;
        }
        
        const now = Date.now();
        
        const deliveryIndex = this.queue.findIndex(d => {
            if (d.status !== 'pending' && d.status !== 'retrying') {
                return false;
            }
            
            if (d.nextRetryAt && new Date(d.nextRetryAt).getTime() > now) {
                return false;
            }
            
            return true;
        });
        
        if (deliveryIndex === -1) {
            return;
        }
        
        const delivery = this.queue[deliveryIndex];
        this.queue.splice(deliveryIndex, 1);
        
        this.currentlyProcessing++;
        
        try {
            await this._processDelivery(delivery);
        } finally {
            this.currentlyProcessing--;
            
            setImmediate(() => this._processNext());
        }
    }
    
    async _processDelivery(delivery) {
        try {
            await this.eventStore.updateDelivery(delivery.id, {
                status: 'processing',
                attempts: delivery.attempts + 1,
                lastAttemptAt: new Date().toISOString()
            });
            
            this.auditLogger.log({
                type: 'WEBHOOK_DELIVERY_START',
                deliveryId: delivery.id,
                webhookEventId: delivery.webhookEventId,
                extensionId: delivery.extensionId,
                command: delivery.command,
                attempt: delivery.attempts + 1
            });
            
            const result = await this._executeExtensionCommand(delivery);
            
            await this.eventStore.updateDelivery(delivery.id, {
                status: 'delivered',
                completedAt: new Date().toISOString(),
                result: result
            });
            
            this.auditLogger.log({
                type: 'WEBHOOK_DELIVERY_SUCCESS',
                deliveryId: delivery.id,
                webhookEventId: delivery.webhookEventId,
                extensionId: delivery.extensionId,
                command: delivery.command,
                attempt: delivery.attempts + 1
            });
            
            this.emit('delivered', delivery, result);
            
        } catch (error) {
            console.error('Error processing webhook delivery:', error);
            
            const shouldRetry = delivery.attempts < this.retryStrategy.maxAttempts;
            
            if (shouldRetry) {
                const nextRetryDelay = this._calculateRetryDelay(delivery.attempts + 1);
                const nextRetryAt = new Date(Date.now() + nextRetryDelay);
                
                await this.eventStore.updateDelivery(delivery.id, {
                    status: 'retrying',
                    lastError: error.message,
                    nextRetryAt: nextRetryAt.toISOString()
                });
                
                this.queue.push({
                    ...delivery,
                    attempts: delivery.attempts + 1,
                    status: 'retrying',
                    nextRetryAt: nextRetryAt.toISOString(),
                    lastError: error.message
                });
                
                this.auditLogger.log({
                    type: 'WEBHOOK_DELIVERY_RETRY',
                    deliveryId: delivery.id,
                    webhookEventId: delivery.webhookEventId,
                    extensionId: delivery.extensionId,
                    command: delivery.command,
                    attempt: delivery.attempts + 1,
                    error: error.message,
                    nextRetryAt: nextRetryAt.toISOString()
                });
                
                this.emit('retry', delivery, error);
                
            } else {
                await this.eventStore.updateDelivery(delivery.id, {
                    status: 'failed',
                    lastError: error.message,
                    failedAt: new Date().toISOString()
                });
                
                this.auditLogger.logSecurityEvent(
                    delivery.extensionId,
                    'WEBHOOK_DELIVERY_FAILED',
                    {
                        severity: 'medium',
                        deliveryId: delivery.id,
                        webhookEventId: delivery.webhookEventId,
                        command: delivery.command,
                        attempts: delivery.attempts + 1,
                        error: error.message
                    }
                );
                
                this.emit('failed', delivery, error);
            }
        }
    }
    
    async _executeExtensionCommand(delivery) {
        if (!this.gateway || !this.runtime) {
            throw new Error('Gateway and runtime must be provided to execute extension commands');
        }
        
        const extension = this.gateway.getExtension(delivery.extensionId);
        
        if (!extension) {
            throw new Error(`Extension not found: ${delivery.extensionId}`);
        }
        
        if (!extension.instance) {
            throw new Error(`Extension instance not available: ${delivery.extensionId}`);
        }
        
        const commandMethod = extension.instance[delivery.command];
        
        if (typeof commandMethod !== 'function') {
            throw new Error(
                `Extension ${delivery.extensionId} does not have command: ${delivery.command}`
            );
        }
        
        const params = {
            webhookEvent: delivery.originalEvent,
            payload: delivery.payload,
            args: delivery.args || [],
            flags: {}
        };
        
        return await commandMethod.call(extension.instance, params);
    }
    
    _calculateRetryDelay(attemptNumber) {
        const delay = this.retryStrategy.initialDelay * 
            Math.pow(this.retryStrategy.backoffFactor, attemptNumber - 1);
        
        return Math.min(delay, this.retryStrategy.maxDelay);
    }
    
    setGateway(gateway) {
        this.gateway = gateway;
    }
    
    setRuntime(runtime) {
        this.runtime = runtime;
    }
    
    getQueueLength() {
        return this.queue.length;
    }
    
    getQueueStats() {
        const stats = {
            total: this.queue.length,
            pending: 0,
            retrying: 0,
            processing: this.currentlyProcessing
        };
        
        for (const delivery of this.queue) {
            if (delivery.status === 'pending') {
                stats.pending++;
            } else if (delivery.status === 'retrying') {
                stats.retrying++;
            }
        }
        
        return stats;
    }
}

module.exports = { WebhookDeliveryQueue };
