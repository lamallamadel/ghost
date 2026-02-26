const fs = require('fs');
const path = require('path');
const os = require('os');
const { SingleRateThreeColorTokenBucket } = require('./token-bucket');
const { AdaptiveRateLimiter } = require('./adaptive-rate-limiter');
const { WeightedFairQueuing } = require('./fair-queuing');
const { EnhancedCircuitBreaker } = require('./enhanced-circuit-breaker');
const { WarmupRateLimiter } = require('./warmup-limiter');
const { GlobalRateLimiter } = require('./global-rate-limiter');
const { RateLimitAnalytics } = require('./rate-limit-analytics');

class AdvancedRateLimitingManager {
    constructor(options = {}) {
        this.persistencePath = options.persistencePath || 
            path.join(os.homedir(), '.ghost', 'advanced-rate-limits.json');
        
        this.adaptiveEnabled = options.adaptive !== false;
        this.fairQueuingEnabled = options.fairQueuing !== false;
        this.warmupEnabled = options.warmup !== false;
        this.globalLimitingEnabled = options.globalLimiting !== false;
        this.analyticsEnabled = options.analytics !== false;
        
        this.limiters = new Map();
        this.circuitBreakers = new Map();
        
        this.fairQueue = this.fairQueuingEnabled ? 
            new WeightedFairQueuing(options.fairQueuing || {}) : null;
        
        this.globalLimiter = this.globalLimitingEnabled ? 
            new GlobalRateLimiter(options.global || {}) : null;
        
        this.analytics = this.analyticsEnabled ? 
            new RateLimitAnalytics(options.analytics || {}) : null;
        
        this.requestQueue = [];
        this.processingQueue = false;
        
        this._ensurePersistenceDirectory();
        this._loadState();
    }

    registerExtension(extensionId, config) {
        if (!config || !config.cir || !config.bc) {
            throw new Error(`Invalid rate limit config for ${extensionId}: requires cir and bc`);
        }

        let limiter;
        
        if (this.warmupEnabled && config.warmup) {
            limiter = new WarmupRateLimiter({
                cir: config.cir,
                bc: config.bc,
                be: config.be || config.bc,
                warmupDuration: config.warmupDuration || 30000,
                warmupStartCIR: config.warmupStartCIR || Math.floor(config.cir * 0.1),
                warmupCurve: config.warmupCurve || 'linear'
            });
            limiter.startWarmup();
        } else if (this.adaptiveEnabled && config.adaptive) {
            limiter = new AdaptiveRateLimiter({
                cir: config.cir,
                bc: config.bc,
                be: config.be || config.bc,
                pidKp: config.pidKp,
                pidKi: config.pidKi,
                pidKd: config.pidKd,
                targetLoad: config.targetLoad,
                adaptationInterval: config.adaptationInterval,
                enabled: true
            });
        } else {
            limiter = new SingleRateThreeColorTokenBucket({
                cir: config.cir,
                bc: config.bc,
                be: config.be || config.bc
            });
        }

        this.limiters.set(extensionId, limiter);

        const breaker = new EnhancedCircuitBreaker({
            failureThreshold: config.failureThreshold || 5,
            resetTimeout: config.resetTimeout || 60000,
            halfOpenMaxAttempts: config.halfOpenMaxAttempts || 3,
            halfOpenSuccessThreshold: config.halfOpenSuccessThreshold || 2
        });
        this.circuitBreakers.set(extensionId, breaker);

        if (this.fairQueue) {
            this.fairQueue.registerExtension(extensionId, {
                priority: config.priority || 1,
                weight: config.weight || 1
            });
        }

        if (this.globalLimiter) {
            this.globalLimiter.registerExtension(extensionId, {
                quota: config.globalQuota || (config.cir * 0.1),
                weight: config.weight || 1,
                canShareQuota: config.canShareQuota !== false
            });
        }

        this._saveState();
    }

    async executeWithRateLimiting(extensionId, requestFn, request = {}, tokens = 1) {
        if (this.fairQueuingEnabled) {
            return this._executeWithQueuing(extensionId, requestFn, request, tokens);
        } else {
            return this._executeDirect(extensionId, requestFn, tokens);
        }
    }

    async _executeWithQueuing(extensionId, requestFn, request, tokens) {
        const enqueueResult = this.fairQueue.enqueue(
            { fn: requestFn, tokens: tokens },
            extensionId
        );

        if (!enqueueResult.enqueued) {
            if (this.analytics) {
                this.analytics.recordConsumption(extensionId, tokens, false, {
                    reason: enqueueResult.reason,
                    code: enqueueResult.code
                });
            }
            
            return {
                success: false,
                reason: enqueueResult.reason,
                code: enqueueResult.code
            };
        }

        if (!this.processingQueue) {
            this._processQueue();
        }

        return new Promise((resolve) => {
            this.requestQueue.push({
                extensionId: extensionId,
                resolve: resolve
            });
        });
    }

    async _processQueue() {
        this.processingQueue = true;

        while (true) {
            const dequeued = this.fairQueue.dequeue();
            
            if (!dequeued) {
                break;
            }

            const { request, extensionId, waitTime } = dequeued;
            const { fn, tokens } = request;

            const result = await this._executeDirect(extensionId, fn, tokens, {
                queueWaitTime: waitTime
            });

            const pending = this.requestQueue.find(r => r.extensionId === extensionId);
            if (pending) {
                pending.resolve(result);
                this.requestQueue = this.requestQueue.filter(r => r !== pending);
            }
        }

        this.processingQueue = false;
    }

    async _executeDirect(extensionId, requestFn, tokens, metadata = {}) {
        const breaker = this.circuitBreakers.get(extensionId);
        if (!breaker) {
            return {
                success: false,
                reason: 'Extension not registered',
                code: 'NOT_REGISTERED'
            };
        }

        if (this.globalLimiter) {
            const globalResult = this.globalLimiter.tryConsume(extensionId, tokens);
            if (!globalResult.allowed) {
                if (this.analytics) {
                    this.analytics.recordConsumption(extensionId, tokens, false, {
                        ...metadata,
                        reason: globalResult.reason,
                        code: globalResult.code,
                        stage: 'global'
                    });
                }
                
                return {
                    success: false,
                    reason: globalResult.reason,
                    code: globalResult.code,
                    global: globalResult
                };
            }
        }

        const limiter = this.limiters.get(extensionId);
        if (!limiter) {
            return {
                success: false,
                reason: 'Rate limiter not found',
                code: 'LIMITER_NOT_FOUND'
            };
        }

        let classificationResult;
        
        if (limiter instanceof WarmupRateLimiter) {
            classificationResult = limiter.tryConsume(tokens);
        } else if (limiter instanceof AdaptiveRateLimiter) {
            classificationResult = limiter.classify(tokens);
        } else {
            classificationResult = limiter.classify(tokens);
        }

        if (!classificationResult.allowed) {
            if (this.analytics) {
                this.analytics.recordConsumption(extensionId, tokens, false, {
                    ...metadata,
                    classification: classificationResult.classification,
                    color: classificationResult.color,
                    stage: 'limiter'
                });
            }
            
            return {
                success: false,
                reason: 'Rate limit exceeded',
                code: 'RATE_LIMIT_EXCEEDED',
                classification: classificationResult
            };
        }

        try {
            const result = await breaker.execute(requestFn);
            
            if (this.analytics) {
                this.analytics.recordConsumption(extensionId, tokens, true, {
                    ...metadata,
                    classification: classificationResult.classification,
                    color: classificationResult.color
                });
            }

            return {
                success: true,
                result: result,
                classification: classificationResult,
                metadata: metadata
            };
        } catch (error) {
            if (this.analytics) {
                this.analytics.recordConsumption(extensionId, tokens, false, {
                    ...metadata,
                    error: error.message,
                    code: error.code,
                    stage: 'execution'
                });
            }

            return {
                success: false,
                reason: error.message,
                code: error.code || 'EXECUTION_ERROR',
                error: error
            };
        }
    }

    getExtensionState(extensionId) {
        const limiter = this.limiters.get(extensionId);
        const breaker = this.circuitBreakers.get(extensionId);
        
        let limiterState = null;
        if (limiter) {
            if (limiter instanceof WarmupRateLimiter || limiter instanceof AdaptiveRateLimiter) {
                limiterState = limiter.getState();
            } else {
                limiterState = limiter.getState();
            }
        }

        const state = {
            extensionId: extensionId,
            limiter: limiterState,
            circuitBreaker: breaker ? breaker.getState() : null
        };

        if (this.fairQueue) {
            state.queue = this.fairQueue.getQueueState(extensionId);
        }

        if (this.globalLimiter) {
            state.global = this.globalLimiter.getExtensionState(extensionId);
        }

        if (this.analytics) {
            state.analytics = {
                metrics: this.analytics.getPerformanceMetrics(extensionId),
                pattern: this.analytics.getConsumptionPattern(extensionId),
                anomalies: this.analytics.getAnomalies(extensionId)
            };
            
            if (state.global && state.global.quota) {
                state.analytics.prediction = this.analytics.predictQuotaExhaustion(
                    extensionId,
                    state.global.quota,
                    state.global.used
                );
            }
        }

        return state;
    }

    getAllExtensionStates() {
        const states = {};
        for (const [extensionId] of this.limiters) {
            states[extensionId] = this.getExtensionState(extensionId);
        }
        return states;
    }

    getGlobalState() {
        const state = {
            adaptiveEnabled: this.adaptiveEnabled,
            fairQueuingEnabled: this.fairQueuingEnabled,
            warmupEnabled: this.warmupEnabled,
            globalLimitingEnabled: this.globalLimitingEnabled,
            analyticsEnabled: this.analyticsEnabled,
            extensionCount: this.limiters.size
        };

        if (this.fairQueue) {
            state.fairQueuing = this.fairQueue.getGlobalStats();
        }

        if (this.globalLimiter) {
            state.global = this.globalLimiter.getGlobalState();
        }

        if (this.analytics) {
            state.analytics = this.analytics.generateDashboardData();
        }

        return state;
    }

    getDashboard() {
        const dashboard = {
            overview: this.getGlobalState(),
            extensions: this.getAllExtensionStates(),
            timestamp: Date.now()
        };

        return dashboard;
    }

    reset(extensionId) {
        const limiter = this.limiters.get(extensionId);
        if (limiter) {
            if (typeof limiter.reset === 'function') {
                limiter.reset();
            }
        }

        const breaker = this.circuitBreakers.get(extensionId);
        if (breaker) {
            breaker.reset();
        }

        if (this.fairQueue) {
            this.fairQueue.reset(extensionId);
        }

        if (this.globalLimiter) {
            this.globalLimiter.resetExtensionUsage(extensionId);
        }

        if (this.analytics) {
            this.analytics.reset(extensionId);
        }

        this._saveState();
    }

    cleanup(extensionId) {
        const limiter = this.limiters.get(extensionId);
        if (limiter && typeof limiter.stop === 'function') {
            limiter.stop();
        }

        this.limiters.delete(extensionId);
        this.circuitBreakers.delete(extensionId);

        if (this.fairQueue) {
            this.fairQueue.cleanup(extensionId);
        }

        if (this.globalLimiter) {
            this.globalLimiter.cleanup(extensionId);
        }

        if (this.analytics) {
            this.analytics.reset(extensionId);
        }

        this._saveState();
    }

    _ensurePersistenceDirectory() {
        const dir = path.dirname(this.persistencePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    }

    _loadState() {
        try {
            if (fs.existsSync(this.persistencePath)) {
                const data = fs.readFileSync(this.persistencePath, 'utf8');
                const state = JSON.parse(data);
                
                if (state.extensions) {
                    for (const [extId, extState] of Object.entries(state.extensions)) {
                        if (extState.limiterType === 'warmup' && extState.limiterState) {
                            const limiter = WarmupRateLimiter.deserialize(extState.limiterState);
                            this.limiters.set(extId, limiter);
                        } else if (extState.limiterType === 'adaptive' && extState.limiterState) {
                            const limiter = AdaptiveRateLimiter.deserialize(extState.limiterState);
                            this.limiters.set(extId, limiter);
                        }
                    }
                }
            }
        } catch (error) {
            console.error('[AdvancedRateLimitingManager] Failed to load state:', error.message);
        }
    }

    _saveState() {
        try {
            const state = {
                extensions: {}
            };
            
            for (const [extId, limiter] of this.limiters.entries()) {
                if (limiter instanceof WarmupRateLimiter) {
                    state.extensions[extId] = {
                        limiterType: 'warmup',
                        limiterState: limiter.serialize()
                    };
                } else if (limiter instanceof AdaptiveRateLimiter) {
                    state.extensions[extId] = {
                        limiterType: 'adaptive',
                        limiterState: limiter.serialize()
                    };
                } else {
                    state.extensions[extId] = {
                        limiterType: 'basic',
                        limiterState: limiter.serialize()
                    };
                }
            }
            
            fs.writeFileSync(this.persistencePath, JSON.stringify(state, null, 2), 'utf8');
        } catch (error) {
            console.error('[AdvancedRateLimitingManager] Failed to save state:', error.message);
        }
    }
}

module.exports = {
    AdvancedRateLimitingManager
};
