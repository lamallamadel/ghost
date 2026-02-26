const fs = require('fs');
const path = require('path');
const os = require('os');

class GlobalRateLimiter {
    constructor(options = {}) {
        this.globalCIR = options.globalCIR || 1000;
        this.globalBC = options.globalBC || 2000;
        
        this.globalTokens = this.globalBC;
        this.lastRefill = Date.now();
        this._cirPerMs = this.globalCIR / 60000;
        
        this.extensionQuotas = new Map();
        this.extensionUsage = new Map();
        
        this.sharingEnabled = options.sharingEnabled !== false;
        this.minReservedQuota = options.minReservedQuota || 0.1;
        
        this.persistencePath = options.persistencePath || 
            path.join(os.homedir(), '.ghost', 'global-rate-limits.json');
        
        this._ensurePersistenceDirectory();
        this._loadState();
        
        this.stats = {
            totalRequests: 0,
            totalAllowed: 0,
            totalDenied: 0,
            quotaTransfers: 0,
            perExtension: new Map()
        };
    }

    registerExtension(extensionId, config = {}) {
        const quota = config.quota || (this.globalCIR * 0.1);
        const weight = config.weight || 1;
        const canShareQuota = config.canShareQuota !== false;
        
        this.extensionQuotas.set(extensionId, {
            allocated: quota,
            weight: weight,
            canShareQuota: canShareQuota,
            minReserved: quota * this.minReservedQuota
        });
        
        this.extensionUsage.set(extensionId, {
            used: 0,
            borrowed: 0,
            lent: 0,
            denied: 0,
            lastReset: Date.now()
        });
        
        this.stats.perExtension.set(extensionId, {
            requests: 0,
            allowed: 0,
            denied: 0,
            borrowed: 0,
            lent: 0
        });
    }

    tryConsume(extensionId, tokens = 1) {
        this._refillGlobal();
        
        this.stats.totalRequests++;
        
        const extStats = this.stats.perExtension.get(extensionId);
        if (extStats) {
            extStats.requests++;
        }

        if (this.globalTokens < tokens) {
            this.stats.totalDenied++;
            if (extStats) {
                extStats.denied++;
            }
            
            return {
                allowed: false,
                reason: 'Global rate limit exceeded',
                code: 'GLOBAL_RATE_LIMIT',
                globalTokens: this.globalTokens,
                globalCapacity: this.globalBC
            };
        }

        const quota = this.extensionQuotas.get(extensionId);
        const usage = this.extensionUsage.get(extensionId);
        
        if (!quota || !usage) {
            return {
                allowed: false,
                reason: 'Extension not registered',
                code: 'NOT_REGISTERED'
            };
        }

        const available = quota.allocated - usage.used;
        
        if (available >= tokens) {
            this.globalTokens -= tokens;
            usage.used += tokens;
            
            this.stats.totalAllowed++;
            if (extStats) {
                extStats.allowed++;
            }
            
            this._saveState();
            
            return {
                allowed: true,
                source: 'allocated',
                tokensUsed: tokens,
                quotaRemaining: quota.allocated - usage.used,
                globalTokens: this.globalTokens
            };
        }

        if (this.sharingEnabled && quota.canShareQuota) {
            const borrowResult = this._tryBorrow(extensionId, tokens - available);
            
            if (borrowResult.success) {
                this.globalTokens -= tokens;
                usage.used += available;
                usage.borrowed += borrowResult.borrowed;
                
                this.stats.totalAllowed++;
                this.stats.quotaTransfers++;
                if (extStats) {
                    extStats.allowed++;
                    extStats.borrowed += borrowResult.borrowed;
                }
                
                this._saveState();
                
                return {
                    allowed: true,
                    source: 'borrowed',
                    tokensUsed: tokens,
                    borrowed: borrowResult.borrowed,
                    lenders: borrowResult.lenders,
                    quotaRemaining: 0,
                    globalTokens: this.globalTokens
                };
            }
        }

        this.stats.totalDenied++;
        const extUsage = this.extensionUsage.get(extensionId);
        if (extUsage) {
            extUsage.denied++;
        }
        if (extStats) {
            extStats.denied++;
        }
        
        return {
            allowed: false,
            reason: 'Extension quota exceeded',
            code: 'EXTENSION_QUOTA_EXCEEDED',
            quotaRemaining: available,
            globalTokens: this.globalTokens
        };
    }

    _tryBorrow(borrowerExtensionId, tokensNeeded) {
        const lenders = [];
        let totalBorrowed = 0;

        const sortedExtensions = Array.from(this.extensionQuotas.entries())
            .filter(([extId]) => extId !== borrowerExtensionId)
            .map(([extId, quota]) => {
                const usage = this.extensionUsage.get(extId);
                const available = quota.allocated - usage.used - quota.minReserved;
                return { extId, quota, usage, available };
            })
            .filter(ext => ext.available > 0 && ext.quota.canShareQuota)
            .sort((a, b) => b.available - a.available);

        for (const ext of sortedExtensions) {
            if (totalBorrowed >= tokensNeeded) {
                break;
            }

            const canLend = Math.min(ext.available, tokensNeeded - totalBorrowed);
            
            if (canLend > 0) {
                ext.usage.lent += canLend;
                totalBorrowed += canLend;
                
                lenders.push({
                    extensionId: ext.extId,
                    amount: canLend
                });
                
                const extStats = this.stats.perExtension.get(ext.extId);
                if (extStats) {
                    extStats.lent += canLend;
                }
            }
        }

        return {
            success: totalBorrowed >= tokensNeeded,
            borrowed: totalBorrowed,
            lenders: lenders
        };
    }

    _refillGlobal() {
        const now = Date.now();
        const elapsed = now - this.lastRefill;
        
        if (elapsed <= 0) {
            return;
        }
        
        const tokensToAdd = elapsed * this._cirPerMs;
        
        if (tokensToAdd > 0) {
            this.globalTokens = Math.min(this.globalBC, this.globalTokens + tokensToAdd);
            this.lastRefill = now;
        }
    }

    resetExtensionUsage(extensionId) {
        const usage = this.extensionUsage.get(extensionId);
        if (usage) {
            usage.used = 0;
            usage.borrowed = 0;
            usage.lent = 0;
            usage.denied = 0;
            usage.lastReset = Date.now();
            this._saveState();
        }
    }

    resetAllUsage() {
        for (const [extensionId] of this.extensionUsage) {
            this.resetExtensionUsage(extensionId);
        }
    }

    updateQuota(extensionId, newQuota) {
        const quota = this.extensionQuotas.get(extensionId);
        if (quota) {
            quota.allocated = newQuota;
            quota.minReserved = newQuota * this.minReservedQuota;
            this._saveState();
            return true;
        }
        return false;
    }

    getExtensionState(extensionId) {
        const quota = this.extensionQuotas.get(extensionId);
        const usage = this.extensionUsage.get(extensionId);
        const stats = this.stats.perExtension.get(extensionId);
        
        if (!quota || !usage) {
            return null;
        }

        return {
            extensionId: extensionId,
            quota: quota.allocated,
            used: usage.used,
            remaining: Math.max(0, quota.allocated - usage.used),
            borrowed: usage.borrowed,
            lent: usage.lent,
            denied: usage.denied,
            weight: quota.weight,
            canShareQuota: quota.canShareQuota,
            stats: stats
        };
    }

    getGlobalState() {
        this._refillGlobal();
        
        return {
            globalTokens: this.globalTokens,
            globalCapacity: this.globalBC,
            globalCIR: this.globalCIR,
            lastRefill: this.lastRefill,
            sharingEnabled: this.sharingEnabled,
            stats: {
                totalRequests: this.stats.totalRequests,
                totalAllowed: this.stats.totalAllowed,
                totalDenied: this.stats.totalDenied,
                quotaTransfers: this.stats.quotaTransfers,
                allowRate: this.stats.totalRequests > 0 ? 
                    this.stats.totalAllowed / this.stats.totalRequests : 0
            }
        };
    }

    getAllExtensionStates() {
        const states = {};
        for (const [extensionId] of this.extensionQuotas) {
            states[extensionId] = this.getExtensionState(extensionId);
        }
        return states;
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
                
                this.globalTokens = state.globalTokens || this.globalBC;
                this.lastRefill = state.lastRefill || Date.now();
                
                if (state.extensions) {
                    for (const [extId, extState] of Object.entries(state.extensions)) {
                        if (this.extensionQuotas.has(extId)) {
                            const usage = this.extensionUsage.get(extId);
                            if (usage && extState.usage) {
                                usage.used = extState.usage.used || 0;
                                usage.borrowed = extState.usage.borrowed || 0;
                                usage.lent = extState.usage.lent || 0;
                            }
                        }
                    }
                }
            }
        } catch (error) {
            console.error('[GlobalRateLimiter] Failed to load state:', error.message);
        }
    }

    _saveState() {
        try {
            const state = {
                globalTokens: this.globalTokens,
                globalCIR: this.globalCIR,
                globalBC: this.globalBC,
                lastRefill: this.lastRefill,
                extensions: {}
            };
            
            for (const [extId, quota] of this.extensionQuotas.entries()) {
                const usage = this.extensionUsage.get(extId);
                state.extensions[extId] = {
                    quota: quota,
                    usage: usage
                };
            }
            
            fs.writeFileSync(this.persistencePath, JSON.stringify(state, null, 2), 'utf8');
        } catch (error) {
            console.error('[GlobalRateLimiter] Failed to save state:', error.message);
        }
    }

    cleanup(extensionId) {
        this.extensionQuotas.delete(extensionId);
        this.extensionUsage.delete(extensionId);
        this.stats.perExtension.delete(extensionId);
        this._saveState();
    }
}

module.exports = {
    GlobalRateLimiter
};
