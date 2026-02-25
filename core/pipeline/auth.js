const path = require('path');
const { TrafficPolicer } = require('../qos/token-bucket');

class GlobMatcher {
    static match(str, pattern) {
        // Normalize separators to forward slashes for consistent matching
        const normalizedStr = str.replace(/\\/g, '/');
        const normalizedPattern = pattern.replace(/\\/g, '/');
        
        // Convert glob pattern to regex
        // ** matches any number of directories (including zero)
        // * matches any characters except /
        // ? matches exactly one character
        let regexPattern = normalizedPattern
            .replace(/\*\*/g, '<<<GLOBSTAR>>>')  // Mark globstars FIRST before escaping
            .replace(/\*/g, '<<<STAR>>>')  // Mark single stars
            .replace(/\?/g, '<<<QUESTION>>>')  // Mark questions
            .replace(/\./g, '\\.');  // Escape dots
        
        // Now replace the placeholders with regex
        // Handle globstar: ** can match zero or more path segments
        regexPattern = regexPattern
            .replace(/<<<GLOBSTAR>>>\//g, '(.*\/)?')  // **/ matches zero or more dirs
            .replace(/\/<<<GLOBSTAR>>>/g, '(\/.*)?')  // /** matches slash + anything (or nothing)
            .replace(/<<<GLOBSTAR>>>/g, '.*')        // ** remaining matches anything
            .replace(/<<<STAR>>>/g, '[^/]*')  // * matches any chars except /
            .replace(/<<<QUESTION>>>/g, '.');  // ? matches one char
        
        const regex = new RegExp(`^${regexPattern}$`);
        const result = regex.test(normalizedStr);
        // console.log(`GlobMatcher.match("${str}", "${pattern}") -> normalized:"${normalizedStr}" pattern:"${regexPattern}" result:${result}`);
        return result;
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

        // Normalize path separators without using path.normalize to avoid adding drive letters
        const normalizedPath = requestedPath.replace(/\\/g, '/');
        
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

        // Construct origin exactly: protocol + '//' + host (includes port if non-default)
        const urlOrigin = `${parsedUrl.protocol}//${parsedUrl.host}`;

        for (const allowedOrigin of allowlist) {
            // Parse the allowed origin to ensure it's valid
            let parsedAllowed;
            try {
                parsedAllowed = new URL(allowedOrigin);
            } catch (e) {
                continue; // Skip invalid allowlist entries
            }

            const allowedOriginStr = `${parsedAllowed.protocol}//${parsedAllowed.host}`;
            
            // Exact origin match required (protocol, domain, and port must match)
            if (urlOrigin === allowedOriginStr) {
                return { allowed: true, matchedUrl: allowedOrigin };
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
    constructor(options = {}) {
        this.rateLimitManager = new RateLimitManager();
        this.permissionCheckers = new Map();
        this.trafficPolicer = new TrafficPolicer(options);
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
            
            this.trafficPolicer.registerExtension(extensionId, {
                cir: networkCap.rateLimit.cir,
                bc: networkCap.rateLimit.bc,
                be: networkCap.rateLimit.be
            });
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
                    const policeResult = this.trafficPolicer.police(intent.extensionId);
                    
                    if (!policeResult.allowed) {
                        return {
                            authorized: false,
                            reason: policeResult.reason,
                            code: policeResult.code,
                            qos: {
                                classification: policeResult.classification,
                                color: policeResult.color,
                                state: policeResult.state
                            }
                        };
                    }
                    
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
        this.trafficPolicer.cleanup(extensionId);
    }

    getRateLimitState(extensionId) {
        return this.rateLimitManager.getState(extensionId);
    }

    resetRateLimit(extensionId) {
        this.rateLimitManager.reset(extensionId);
    }

    getTrafficPolicerState(extensionId) {
        return this.trafficPolicer.getState(extensionId);
    }

    getAllTrafficPolicerStates() {
        return this.trafficPolicer.getAllStates();
    }

    resetTrafficPolicer(extensionId) {
        this.trafficPolicer.reset(extensionId);
    }
}

module.exports = {
    AuthorizationLayer,
    PermissionChecker,
    RateLimitManager,
    TokenBucket,
    TrafficPolicer
};
