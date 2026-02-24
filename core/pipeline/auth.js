const path = require('path');

class GlobMatcher {
    static match(str, pattern) {
        const regexPattern = pattern
            .replace(/\./g, '\\.')
            .replace(/\*\*/g, '<<<GLOBSTAR>>>')
            .replace(/\*/g, '[^/]*')
            .replace(/<<<GLOBSTAR>>>/g, '.*')
            .replace(/\?/g, '.');
        
        const regex = new RegExp(`^${regexPattern}$`);
        return regex.test(str);
    }
}

class TokenBucket {
    constructor(cir, bc) {
        this.cir = cir;
        this.bc = bc;
        this.tokens = bc;
        this.lastRefill = Date.now();
    }

    tryConsume(tokens = 1) {
        this._refill();
        
        if (this.tokens >= tokens) {
            this.tokens -= tokens;
            return true;
        }
        
        return false;
    }

    _refill() {
        const now = Date.now();
        const elapsed = (now - this.lastRefill) / 1000;
        const tokensToAdd = Math.floor((elapsed * this.cir) / 60);
        
        if (tokensToAdd > 0) {
            this.tokens = Math.min(this.bc, this.tokens + tokensToAdd);
            this.lastRefill = now;
        }
    }

    getState() {
        this._refill();
        return {
            available: this.tokens,
            capacity: this.bc,
            cir: this.cir,
            lastRefill: this.lastRefill
        };
    }
}

class RateLimitManager {
    constructor() {
        this.buckets = new Map();
    }

    initBucket(extensionId, cir, bc) {
        if (!this.buckets.has(extensionId)) {
            this.buckets.set(extensionId, new TokenBucket(cir, bc));
        }
    }

    checkLimit(extensionId, tokens = 1) {
        const bucket = this.buckets.get(extensionId);
        
        if (!bucket) {
            return { allowed: false, reason: 'No rate limit configuration found' };
        }

        const allowed = bucket.tryConsume(tokens);
        
        return {
            allowed,
            reason: allowed ? null : 'Rate limit exceeded',
            state: bucket.getState()
        };
    }

    getState(extensionId) {
        const bucket = this.buckets.get(extensionId);
        return bucket ? bucket.getState() : null;
    }

    reset(extensionId) {
        const bucket = this.buckets.get(extensionId);
        if (bucket) {
            bucket.tokens = bucket.bc;
            bucket.lastRefill = Date.now();
        }
    }

    cleanup(extensionId) {
        this.buckets.delete(extensionId);
    }
}

class PermissionChecker {
    constructor(manifest) {
        this.manifest = manifest;
    }

    checkFilesystemAccess(operation, requestedPath) {
        const capabilities = this.manifest.capabilities?.filesystem;
        
        if (!capabilities) {
            return { 
                allowed: false, 
                reason: 'No filesystem capabilities declared' 
            };
        }

        const patterns = operation === 'read' ? capabilities.read : capabilities.write;
        
        if (!patterns || !Array.isArray(patterns) || patterns.length === 0) {
            return { 
                allowed: false, 
                reason: `No ${operation} patterns declared in manifest` 
            };
        }

        const normalizedPath = path.normalize(requestedPath).replace(/\\/g, '/');
        
        for (const pattern of patterns) {
            if (GlobMatcher.match(normalizedPath, pattern)) {
                return { allowed: true, matchedPattern: pattern };
            }
        }

        return { 
            allowed: false, 
            reason: `Path "${requestedPath}" does not match any declared patterns` 
        };
    }

    checkNetworkAccess(url) {
        const capabilities = this.manifest.capabilities?.network;
        
        if (!capabilities) {
            return { 
                allowed: false, 
                reason: 'No network capabilities declared' 
            };
        }

        const allowlist = capabilities.allowlist;
        
        if (!allowlist || !Array.isArray(allowlist) || allowlist.length === 0) {
            return { 
                allowed: false, 
                reason: 'No network allowlist declared in manifest' 
            };
        }

        let parsedUrl;
        try {
            parsedUrl = new URL(url);
        } catch (e) {
            return { 
                allowed: false, 
                reason: `Invalid URL: ${url}` 
            };
        }

        const urlOrigin = `${parsedUrl.protocol}//${parsedUrl.host}`;

        for (const allowedUrl of allowlist) {
            if (urlOrigin === allowedUrl || urlOrigin.startsWith(allowedUrl)) {
                return { allowed: true, matchedUrl: allowedUrl };
            }
        }

        return { 
            allowed: false, 
            reason: `URL "${url}" not in allowlist` 
        };
    }

    checkGitAccess(operation) {
        const capabilities = this.manifest.capabilities?.git;
        
        if (!capabilities) {
            return { 
                allowed: false, 
                reason: 'No git capabilities declared' 
            };
        }

        const writeOps = ['commit', 'branch', 'tag', 'push', 'reset'];
        const isWrite = writeOps.includes(operation);

        if (isWrite && !capabilities.write) {
            return { 
                allowed: false, 
                reason: 'Git write operations not permitted' 
            };
        }

        if (!isWrite && !capabilities.read) {
            return { 
                allowed: false, 
                reason: 'Git read operations not permitted' 
            };
        }

        return { allowed: true };
    }

    checkProcessAccess() {
        const permissions = this.manifest.permissions || [];
        
        if (!permissions.includes('process:spawn')) {
            return { 
                allowed: false, 
                reason: 'process:spawn permission not granted' 
            };
        }

        return { allowed: true };
    }

    checkPermission(permission) {
        const permissions = this.manifest.permissions || [];
        return permissions.includes(permission);
    }
}

class AuthorizationLayer {
    constructor() {
        this.rateLimitManager = new RateLimitManager();
        this.permissionCheckers = new Map();
    }

    registerExtension(extensionId, manifest) {
        this.permissionCheckers.set(extensionId, new PermissionChecker(manifest));
        
        const networkCap = manifest.capabilities?.network;
        if (networkCap?.rateLimit) {
            this.rateLimitManager.initBucket(
                extensionId, 
                networkCap.rateLimit.cir, 
                networkCap.rateLimit.bc
            );
        }
    }

    authorize(intent) {
        const checker = this.permissionCheckers.get(intent.extensionId);
        
        if (!checker) {
            return {
                authorized: false,
                reason: 'Extension not registered',
                code: 'AUTH_NOT_REGISTERED'
            };
        }

        let permissionCheck;

        switch (intent.type) {
            case 'filesystem':
                const isWrite = ['write', 'mkdir', 'unlink', 'rmdir'].includes(intent.operation);
                const fsOperation = isWrite ? 'write' : 'read';
                permissionCheck = checker.checkFilesystemAccess(fsOperation, intent.params.path);
                break;

            case 'network':
                permissionCheck = checker.checkNetworkAccess(intent.params.url);
                
                if (permissionCheck.allowed) {
                    const rateLimitCheck = this.rateLimitManager.checkLimit(intent.extensionId);
                    if (!rateLimitCheck.allowed) {
                        return {
                            authorized: false,
                            reason: rateLimitCheck.reason,
                            code: 'AUTH_RATE_LIMIT',
                            state: rateLimitCheck.state
                        };
                    }
                }
                break;

            case 'git':
                permissionCheck = checker.checkGitAccess(intent.operation);
                break;

            case 'process':
                permissionCheck = checker.checkProcessAccess();
                break;

            default:
                return {
                    authorized: false,
                    reason: `Unknown intent type: ${intent.type}`,
                    code: 'AUTH_UNKNOWN_TYPE'
                };
        }

        if (!permissionCheck.allowed) {
            return {
                authorized: false,
                reason: permissionCheck.reason,
                code: 'AUTH_PERMISSION_DENIED'
            };
        }

        return {
            authorized: true,
            metadata: {
                matchedPattern: permissionCheck.matchedPattern,
                matchedUrl: permissionCheck.matchedUrl
            }
        };
    }

    unregisterExtension(extensionId) {
        this.permissionCheckers.delete(extensionId);
        this.rateLimitManager.cleanup(extensionId);
    }

    getRateLimitState(extensionId) {
        return this.rateLimitManager.getState(extensionId);
    }

    resetRateLimit(extensionId) {
        this.rateLimitManager.reset(extensionId);
    }
}

module.exports = {
    AuthorizationLayer,
    PermissionChecker,
    RateLimitManager,
    TokenBucket
};
