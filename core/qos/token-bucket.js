const fs = require('fs');
const path = require('path');
const os = require('os');

class TwoRateThreeColorTokenBucket {
    constructor(config) {
        this.cir = config.cir;
        this.bc = config.bc;
        this.be = config.be || config.bc;
        
        this.committedTokens = config.committedTokens !== undefined ? config.committedTokens : this.bc;
        this.excessTokens = config.excessTokens !== undefined ? config.excessTokens : this.be;
        this.lastRefill = config.lastRefill || Date.now();
    }

    classify(tokens = 1) {
        this._refill();
        
        if (this.committedTokens >= tokens) {
            this.committedTokens -= tokens;
            return {
                color: 'green',
                classification: 'Conforming',
                allowed: true,
                state: this.getState()
            };
        }
        
        if (this.excessTokens >= tokens) {
            this.excessTokens -= tokens;
            return {
                color: 'yellow',
                classification: 'Exceeding',
                allowed: true,
                state: this.getState()
            };
        }
        
        return {
            color: 'red',
            classification: 'Violating',
            allowed: false,
            state: this.getState()
        };
    }

    _refill() {
        const now = Date.now();
        const elapsed = (now - this.lastRefill) / 1000;
        const tokensToAdd = (elapsed * this.cir) / 60;
        
        if (tokensToAdd > 0) {
            this.committedTokens = Math.min(this.bc, this.committedTokens + tokensToAdd);
            this.excessTokens = Math.min(this.be, this.excessTokens + tokensToAdd);
            this.lastRefill = now;
        }
    }

    getState() {
        this._refill();
        return {
            committedTokens: this.committedTokens,
            excessTokens: this.excessTokens,
            committedCapacity: this.bc,
            excessCapacity: this.be,
            cir: this.cir,
            lastRefill: this.lastRefill
        };
    }

    serialize() {
        return {
            cir: this.cir,
            bc: this.bc,
            be: this.be,
            committedTokens: this.committedTokens,
            excessTokens: this.excessTokens,
            lastRefill: this.lastRefill
        };
    }
}

class TrafficPolicer {
    constructor(options = {}) {
        this.persistencePath = options.persistencePath || 
            path.join(os.homedir(), '.ghost', 'rate-limits.json');
        this.buckets = new Map();
        this.dropViolating = options.dropViolating !== undefined ? options.dropViolating : true;
        
        this._ensurePersistenceDirectory();
        this._loadState();
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
                
                for (const [extensionId, config] of Object.entries(state)) {
                    this.buckets.set(extensionId, new TwoRateThreeColorTokenBucket(config));
                }
            }
        } catch (error) {
            console.error('[TrafficPolicer] Failed to load state:', error.message);
        }
    }

    _saveState() {
        try {
            const state = {};
            for (const [extensionId, bucket] of this.buckets.entries()) {
                state[extensionId] = bucket.serialize();
            }
            
            fs.writeFileSync(
                this.persistencePath, 
                JSON.stringify(state, null, 2), 
                'utf8'
            );
        } catch (error) {
            console.error('[TrafficPolicer] Failed to save state:', error.message);
        }
    }

    registerExtension(extensionId, config) {
        if (!config || !config.cir || !config.bc) {
            throw new Error(`Invalid rate limit config for ${extensionId}: requires cir and bc`);
        }

        if (!this.buckets.has(extensionId)) {
            this.buckets.set(extensionId, new TwoRateThreeColorTokenBucket({
                cir: config.cir,
                bc: config.bc,
                be: config.be || config.bc
            }));
            this._saveState();
        }
    }

    police(extensionId, tokens = 1) {
        const bucket = this.buckets.get(extensionId);
        
        if (!bucket) {
            return {
                allowed: false,
                classification: 'Violating',
                color: 'red',
                reason: 'No traffic policing configuration found',
                code: 'QOS_NOT_CONFIGURED'
            };
        }

        const result = bucket.classify(tokens);
        
        if (!result.allowed && this.dropViolating) {
            this._saveState();
            return {
                allowed: false,
                classification: result.classification,
                color: result.color,
                reason: 'Traffic violating rate limits - request dropped',
                code: 'QOS_VIOLATING',
                state: result.state
            };
        }

        this._saveState();
        
        return {
            allowed: result.allowed,
            classification: result.classification,
            color: result.color,
            state: result.state
        };
    }

    getState(extensionId) {
        const bucket = this.buckets.get(extensionId);
        return bucket ? bucket.getState() : null;
    }

    reset(extensionId) {
        const bucket = this.buckets.get(extensionId);
        if (bucket) {
            bucket.committedTokens = bucket.bc;
            bucket.excessTokens = bucket.be;
            bucket.lastRefill = Date.now();
            this._saveState();
        }
    }

    cleanup(extensionId) {
        this.buckets.delete(extensionId);
        this._saveState();
    }

    getAllStates() {
        const states = {};
        for (const [extensionId, bucket] of this.buckets.entries()) {
            states[extensionId] = bucket.getState();
        }
        return states;
    }
}

module.exports = {
    TwoRateThreeColorTokenBucket,
    TrafficPolicer
};
