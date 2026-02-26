class WarmupRateLimiter {
    constructor(config) {
        this.targetCIR = config.cir;
        this.bc = config.bc;
        this.be = config.be || config.bc;
        
        this.warmupDuration = config.warmupDuration || 30000;
        this.warmupStartCIR = config.warmupStartCIR || Math.floor(config.cir * 0.1);
        this.warmupCurve = config.warmupCurve || 'linear';
        
        this.isWarming = false;
        this.warmupStartTime = null;
        this.currentCIR = this.warmupStartCIR;
        
        this.tokens = this.bc;
        this.lastRefill = Date.now();
        this._cirPerMs = this.currentCIR / 60000;
        
        this.restartCount = 0;
        this.lastRestartTime = null;
    }

    startWarmup() {
        this.isWarming = true;
        this.warmupStartTime = Date.now();
        this.currentCIR = this.warmupStartCIR;
        this._cirPerMs = this.currentCIR / 60000;
        this.restartCount++;
        this.lastRestartTime = Date.now();
    }

    tryConsume(tokens = 1) {
        this._updateWarmup();
        this._refill();
        
        if (this.tokens >= tokens) {
            this.tokens -= tokens;
            return {
                allowed: true,
                tokensRemaining: this.tokens,
                currentCIR: this.currentCIR,
                isWarming: this.isWarming,
                warmupProgress: this._getWarmupProgress()
            };
        }
        
        return {
            allowed: false,
            reason: 'Rate limit exceeded',
            tokensRemaining: this.tokens,
            currentCIR: this.currentCIR,
            isWarming: this.isWarming,
            warmupProgress: this._getWarmupProgress()
        };
    }

    _updateWarmup() {
        if (!this.isWarming) {
            return;
        }

        const now = Date.now();
        const elapsed = now - this.warmupStartTime;

        if (elapsed >= this.warmupDuration) {
            this.isWarming = false;
            this.currentCIR = this.targetCIR;
            this._cirPerMs = this.currentCIR / 60000;
            return;
        }

        const progress = elapsed / this.warmupDuration;
        const cirRange = this.targetCIR - this.warmupStartCIR;
        
        let adjustedProgress;
        switch (this.warmupCurve) {
            case 'exponential':
                adjustedProgress = Math.pow(progress, 2);
                break;
            case 'logarithmic':
                adjustedProgress = Math.log(1 + progress * (Math.E - 1)) / Math.log(Math.E);
                break;
            case 'sigmoid':
                const sigmoid = (x) => 1 / (1 + Math.exp(-10 * (x - 0.5)));
                adjustedProgress = sigmoid(progress);
                break;
            case 'linear':
            default:
                adjustedProgress = progress;
                break;
        }

        this.currentCIR = Math.round(this.warmupStartCIR + (cirRange * adjustedProgress));
        this._cirPerMs = this.currentCIR / 60000;
    }

    _refill() {
        const now = Date.now();
        const elapsed = now - this.lastRefill;
        
        if (elapsed <= 0) {
            return;
        }
        
        const tokensToAdd = elapsed * this._cirPerMs;
        
        if (tokensToAdd > 0) {
            this.tokens = Math.min(this.bc, this.tokens + tokensToAdd);
            this.lastRefill = now;
        }
    }

    _getWarmupProgress() {
        if (!this.isWarming) {
            return 1.0;
        }

        const elapsed = Date.now() - this.warmupStartTime;
        return Math.min(1.0, elapsed / this.warmupDuration);
    }

    getState() {
        this._updateWarmup();
        this._refill();
        
        return {
            tokens: this.tokens,
            capacity: this.bc,
            currentCIR: this.currentCIR,
            targetCIR: this.targetCIR,
            isWarming: this.isWarming,
            warmupProgress: this._getWarmupProgress(),
            warmupTimeRemaining: this.isWarming ? 
                Math.max(0, this.warmupDuration - (Date.now() - this.warmupStartTime)) : 0,
            restartCount: this.restartCount,
            lastRestartTime: this.lastRestartTime,
            lastRefill: this.lastRefill
        };
    }

    reset() {
        this.tokens = this.bc;
        this.lastRefill = Date.now();
        this.isWarming = false;
        this.warmupStartTime = null;
        this.currentCIR = this.targetCIR;
        this._cirPerMs = this.currentCIR / 60000;
    }

    serialize() {
        return {
            targetCIR: this.targetCIR,
            bc: this.bc,
            be: this.be,
            warmupDuration: this.warmupDuration,
            warmupStartCIR: this.warmupStartCIR,
            warmupCurve: this.warmupCurve,
            tokens: this.tokens,
            lastRefill: this.lastRefill,
            isWarming: this.isWarming,
            warmupStartTime: this.warmupStartTime,
            currentCIR: this.currentCIR,
            restartCount: this.restartCount,
            lastRestartTime: this.lastRestartTime
        };
    }

    static deserialize(data) {
        const limiter = new WarmupRateLimiter({
            cir: data.targetCIR,
            bc: data.bc,
            be: data.be,
            warmupDuration: data.warmupDuration,
            warmupStartCIR: data.warmupStartCIR,
            warmupCurve: data.warmupCurve
        });
        
        limiter.tokens = data.tokens;
        limiter.lastRefill = data.lastRefill;
        limiter.isWarming = data.isWarming;
        limiter.warmupStartTime = data.warmupStartTime;
        limiter.currentCIR = data.currentCIR;
        limiter._cirPerMs = data.currentCIR / 60000;
        limiter.restartCount = data.restartCount;
        limiter.lastRestartTime = data.lastRestartTime;
        
        return limiter;
    }
}

module.exports = {
    WarmupRateLimiter
};
