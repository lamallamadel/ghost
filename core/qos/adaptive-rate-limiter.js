const { SingleRateThreeColorTokenBucket } = require('./token-bucket');

class PIDController {
    constructor(options = {}) {
        this.kp = options.kp || 0.5;
        this.ki = options.ki || 0.1;
        this.kd = options.kd || 0.2;
        this.setpoint = options.setpoint || 0.95;
        this.minOutput = options.minOutput || 0.1;
        this.maxOutput = options.maxOutput || 2.0;
        
        this.integral = 0;
        this.lastError = 0;
        this.lastTime = Date.now();
    }

    compute(currentValue) {
        const now = Date.now();
        const dt = (now - this.lastTime) / 1000;
        
        if (dt <= 0) {
            return 1.0;
        }

        const error = this.setpoint - currentValue;
        
        this.integral += error * dt;
        this.integral = Math.max(-1, Math.min(1, this.integral));
        
        const derivative = (error - this.lastError) / dt;
        
        const output = (this.kp * error) + (this.ki * this.integral) + (this.kd * derivative);
        
        this.lastError = error;
        this.lastTime = now;
        
        return Math.max(this.minOutput, Math.min(this.maxOutput, 1.0 + output));
    }

    reset() {
        this.integral = 0;
        this.lastError = 0;
        this.lastTime = Date.now();
    }
}

class SystemLoadMonitor {
    constructor() {
        this.cpuUsage = 0;
        this.memoryUsage = 0;
        this.requestRate = 0;
        this.errorRate = 0;
        this.lastUpdate = Date.now();
        
        this.requestCount = 0;
        this.errorCount = 0;
        this.windowStart = Date.now();
        this.windowSize = 60000;
    }

    recordRequest(success) {
        this.requestCount++;
        if (!success) {
            this.errorCount++;
        }
        
        const now = Date.now();
        if (now - this.windowStart >= this.windowSize) {
            this.requestRate = this.requestCount / (this.windowSize / 1000);
            this.errorRate = this.errorCount / Math.max(1, this.requestCount);
            
            this.requestCount = 0;
            this.errorCount = 0;
            this.windowStart = now;
        }
    }

    updateSystemMetrics() {
        const usage = process.memoryUsage();
        this.memoryUsage = usage.heapUsed / usage.heapTotal;
        
        const cpuUsage = process.cpuUsage();
        this.cpuUsage = (cpuUsage.user + cpuUsage.system) / 1000000;
        
        this.lastUpdate = Date.now();
    }

    getLoad() {
        const memWeight = 0.3;
        const errorWeight = 0.5;
        const cpuWeight = 0.2;
        
        return (this.memoryUsage * memWeight) + 
               (this.errorRate * errorWeight) + 
               (Math.min(1, this.cpuUsage / 100) * cpuWeight);
    }

    getMetrics() {
        return {
            cpuUsage: this.cpuUsage,
            memoryUsage: this.memoryUsage,
            requestRate: this.requestRate,
            errorRate: this.errorRate,
            load: this.getLoad()
        };
    }
}

class AdaptiveRateLimiter {
    constructor(config) {
        this.baseCIR = config.cir;
        this.currentCIR = config.cir;
        this.bc = config.bc;
        this.be = config.be || config.bc;
        
        this.bucket = new SingleRateThreeColorTokenBucket({
            cir: this.currentCIR,
            bc: this.bc,
            be: this.be
        });
        
        this.pidController = new PIDController({
            kp: config.pidKp || 0.5,
            ki: config.pidKi || 0.1,
            kd: config.pidKd || 0.2,
            setpoint: config.targetLoad || 0.80,
            minOutput: config.minCirMultiplier || 0.1,
            maxOutput: config.maxCirMultiplier || 2.0
        });
        
        this.systemMonitor = new SystemLoadMonitor();
        this.adaptationInterval = config.adaptationInterval || 5000;
        this.adaptationTimer = null;
        this.enabled = config.enabled !== false;
        
        this.history = [];
        this.maxHistorySize = 100;
        
        if (this.enabled) {
            this._startAdaptation();
        }
    }

    classify(tokens = 1) {
        const result = this.bucket.classify(tokens);
        this.systemMonitor.recordRequest(result.allowed);
        return result;
    }

    _startAdaptation() {
        this.adaptationTimer = setInterval(() => {
            this._adapt();
        }, this.adaptationInterval);
    }

    _adapt() {
        this.systemMonitor.updateSystemMetrics();
        const load = this.systemMonitor.getLoad();
        
        const adjustment = this.pidController.compute(load);
        const newCIR = Math.round(this.baseCIR * adjustment);
        
        if (newCIR !== this.currentCIR) {
            this.currentCIR = newCIR;
            this.bucket.cir = newCIR;
            this.bucket._cirPerMs = newCIR / 60000;
            
            this.history.push({
                timestamp: Date.now(),
                load: load,
                adjustment: adjustment,
                oldCIR: this.bucket.cir / adjustment,
                newCIR: newCIR,
                metrics: this.systemMonitor.getMetrics()
            });
            
            if (this.history.length > this.maxHistorySize) {
                this.history.shift();
            }
        }
    }

    getState() {
        const bucketState = this.bucket.getState();
        return {
            ...bucketState,
            baseCIR: this.baseCIR,
            currentCIR: this.currentCIR,
            adjustment: this.currentCIR / this.baseCIR,
            systemLoad: this.systemMonitor.getLoad(),
            metrics: this.systemMonitor.getMetrics()
        };
    }

    getHistory() {
        return this.history;
    }

    stop() {
        if (this.adaptationTimer) {
            clearInterval(this.adaptationTimer);
            this.adaptationTimer = null;
        }
    }

    reset() {
        this.bucket.committedTokens = this.bc;
        this.bucket.excessTokens = this.be;
        this.bucket.lastRefill = Date.now();
        this.pidController.reset();
        this.history = [];
    }

    serialize() {
        return {
            baseCIR: this.baseCIR,
            currentCIR: this.currentCIR,
            bc: this.bc,
            be: this.be,
            committedTokens: this.bucket.committedTokens,
            excessTokens: this.bucket.excessTokens,
            lastRefill: this.bucket.lastRefill,
            pidState: {
                integral: this.pidController.integral,
                lastError: this.pidController.lastError
            }
        };
    }

    static deserialize(data) {
        const limiter = new AdaptiveRateLimiter({
            cir: data.baseCIR,
            bc: data.bc,
            be: data.be,
            enabled: false
        });
        
        limiter.currentCIR = data.currentCIR;
        limiter.bucket.cir = data.currentCIR;
        limiter.bucket._cirPerMs = data.currentCIR / 60000;
        limiter.bucket.committedTokens = data.committedTokens;
        limiter.bucket.excessTokens = data.excessTokens;
        limiter.bucket.lastRefill = data.lastRefill;
        
        if (data.pidState) {
            limiter.pidController.integral = data.pidState.integral;
            limiter.pidController.lastError = data.pidState.lastError;
        }
        
        limiter.enabled = true;
        limiter._startAdaptation();
        
        return limiter;
    }
}

module.exports = {
    AdaptiveRateLimiter,
    PIDController,
    SystemLoadMonitor
};
