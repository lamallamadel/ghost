class CanaryRequest {
    constructor(fn, timestamp) {
        this.fn = fn;
        this.timestamp = timestamp;
        this.promise = null;
        this.resolved = false;
        this.success = false;
    }

    async execute() {
        if (!this.promise) {
            this.promise = this.fn();
        }
        
        try {
            const result = await this.promise;
            this.resolved = true;
            this.success = true;
            return result;
        } catch (error) {
            this.resolved = true;
            this.success = false;
            throw error;
        }
    }
}

class EnhancedCircuitBreaker {
    constructor(options = {}) {
        this.failureThreshold = options.failureThreshold || 5;
        this.resetTimeout = options.resetTimeout || 60000;
        this.halfOpenMaxAttempts = options.halfOpenMaxAttempts || 3;
        this.halfOpenSuccessThreshold = options.halfOpenSuccessThreshold || 2;
        this.canaryTestInterval = options.canaryTestInterval || 5000;
        
        this.failures = 0;
        this.successes = 0;
        this.state = 'CLOSED';
        this.nextAttempt = Date.now();
        this.halfOpenAttempts = 0;
        this.halfOpenSuccesses = 0;
        
        this.canaryQueue = [];
        this.canaryTimer = null;
        this.canaryTestInProgress = false;
        
        this.stats = {
            totalRequests: 0,
            totalFailures: 0,
            totalSuccesses: 0,
            stateTransitions: [],
            lastFailure: null,
            lastSuccess: null,
            openCount: 0,
            halfOpenCount: 0
        };
    }

    async execute(fn) {
        this.stats.totalRequests++;

        if (this.state === 'OPEN') {
            if (Date.now() < this.nextAttempt) {
                const error = new Error('Circuit breaker is OPEN');
                error.code = 'CIRCUIT_OPEN';
                error.nextAttempt = this.nextAttempt;
                throw error;
            }
            
            this._transitionTo('HALF_OPEN');
            this.halfOpenAttempts = 0;
            this.halfOpenSuccesses = 0;
        }

        if (this.state === 'HALF_OPEN') {
            if (this.halfOpenAttempts >= this.halfOpenMaxAttempts) {
                const error = new Error('Circuit breaker is HALF_OPEN - max attempts reached');
                error.code = 'CIRCUIT_HALF_OPEN';
                throw error;
            }
            
            this.halfOpenAttempts++;
            
            const canary = new CanaryRequest(fn, Date.now());
            this.canaryQueue.push(canary);
            
            if (!this.canaryTestInProgress) {
                this._startCanaryTesting();
            }

            try {
                const result = await canary.execute();
                this._onHalfOpenSuccess();
                return result;
            } catch (error) {
                this._onHalfOpenFailure();
                throw error;
            }
        }

        try {
            const result = await fn();
            this._onSuccess();
            return result;
        } catch (error) {
            this._onFailure();
            throw error;
        }
    }

    _startCanaryTesting() {
        this.canaryTestInProgress = true;
        
        this.canaryTimer = setInterval(() => {
            this._processCanaryQueue();
        }, this.canaryTestInterval);
    }

    _stopCanaryTesting() {
        if (this.canaryTimer) {
            clearInterval(this.canaryTimer);
            this.canaryTimer = null;
        }
        this.canaryTestInProgress = false;
        this.canaryQueue = [];
    }

    async _processCanaryQueue() {
        if (this.canaryQueue.length === 0) {
            return;
        }

        const pendingCanaries = this.canaryQueue.filter(c => !c.resolved);
        
        if (pendingCanaries.length === 0) {
            this.canaryQueue = [];
            return;
        }

        const canary = pendingCanaries[0];
        
        try {
            await canary.execute();
        } catch (error) {
        }
    }

    _onHalfOpenSuccess() {
        this.halfOpenSuccesses++;
        this.stats.totalSuccesses++;
        this.stats.lastSuccess = Date.now();

        if (this.halfOpenSuccesses >= this.halfOpenSuccessThreshold) {
            this._transitionTo('CLOSED');
            this._stopCanaryTesting();
        }
    }

    _onHalfOpenFailure() {
        this.stats.totalFailures++;
        this.stats.lastFailure = Date.now();
        this._transitionTo('OPEN');
        this._stopCanaryTesting();
        this.nextAttempt = Date.now() + this.resetTimeout;
    }

    _onSuccess() {
        this.failures = 0;
        this.successes++;
        this.stats.totalSuccesses++;
        this.stats.lastSuccess = Date.now();
        
        if (this.state !== 'CLOSED') {
            this._transitionTo('CLOSED');
        }
    }

    _onFailure() {
        this.failures++;
        this.stats.totalFailures++;
        this.stats.lastFailure = Date.now();
        
        if (this.failures >= this.failureThreshold) {
            this._transitionTo('OPEN');
            this.nextAttempt = Date.now() + this.resetTimeout;
        }
    }

    _transitionTo(newState) {
        const oldState = this.state;
        this.state = newState;
        
        this.stats.stateTransitions.push({
            from: oldState,
            to: newState,
            timestamp: Date.now()
        });

        if (newState === 'OPEN') {
            this.stats.openCount++;
        } else if (newState === 'HALF_OPEN') {
            this.stats.halfOpenCount++;
        }

        if (this.stats.stateTransitions.length > 100) {
            this.stats.stateTransitions.shift();
        }
    }

    getState() {
        return {
            state: this.state,
            failures: this.failures,
            successes: this.successes,
            nextAttempt: this.nextAttempt,
            halfOpenAttempts: this.halfOpenAttempts,
            halfOpenSuccesses: this.halfOpenSuccesses,
            canaryQueueSize: this.canaryQueue.length,
            stats: this.stats
        };
    }

    reset() {
        this.failures = 0;
        this.successes = 0;
        this.halfOpenAttempts = 0;
        this.halfOpenSuccesses = 0;
        this._transitionTo('CLOSED');
        this.nextAttempt = Date.now();
        this._stopCanaryTesting();
    }

    forceOpen() {
        this._transitionTo('OPEN');
        this.nextAttempt = Date.now() + this.resetTimeout;
        this._stopCanaryTesting();
    }

    forceHalfOpen() {
        this._transitionTo('HALF_OPEN');
        this.halfOpenAttempts = 0;
        this.halfOpenSuccesses = 0;
    }

    forceClosed() {
        this._transitionTo('CLOSED');
        this.failures = 0;
        this._stopCanaryTesting();
    }
}

module.exports = {
    EnhancedCircuitBreaker,
    CanaryRequest
};
