const { EventEmitter } = require('events');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

class AgentAuthService extends EventEmitter {
    constructor(options = {}) {
        super();
        this.agentId = options.agentId;
        this.authMode = options.authMode || 'jwt';
        this.jwtSecret = options.jwtSecret || this._generateSecret();
        this.tokenExpiry = options.tokenExpiry || '1h';
        this.trustedAgents = new Map();
        this.authCache = new Map();
        this.cacheTimeout = options.cacheTimeout || 300000;
        this.tlsOptions = options.tlsOptions || null;
    }

    _generateSecret() {
        return crypto.randomBytes(32).toString('hex');
    }

    generateToken(agentId, capabilities = [], metadata = {}) {
        const payload = {
            agentId,
            capabilities,
            metadata,
            issuer: this.agentId,
            timestamp: Date.now()
        };

        return jwt.sign(payload, this.jwtSecret, {
            expiresIn: this.tokenExpiry,
            algorithm: 'HS256'
        });
    }

    verifyToken(token) {
        try {
            const decoded = jwt.verify(token, this.jwtSecret, {
                algorithms: ['HS256']
            });

            this.emit('token-verified', {
                agentId: decoded.agentId,
                capabilities: decoded.capabilities,
                issuer: decoded.issuer
            });

            return {
                valid: true,
                payload: decoded
            };
        } catch (error) {
            this.emit('token-verification-failed', {
                error: error.message
            });

            return {
                valid: false,
                error: error.message
            };
        }
    }

    async authenticateAgent(agentId, credentials) {
        const cacheKey = `${agentId}:${JSON.stringify(credentials)}`;
        
        if (this.authCache.has(cacheKey)) {
            const cached = this.authCache.get(cacheKey);
            if (Date.now() - cached.timestamp < this.cacheTimeout) {
                this.emit('auth-cache-hit', { agentId });
                return cached.result;
            }
            this.authCache.delete(cacheKey);
        }

        let result;

        if (this.authMode === 'jwt') {
            result = await this._authenticateJWT(agentId, credentials);
        } else if (this.authMode === 'shared-secret') {
            result = await this._authenticateSharedSecret(agentId, credentials);
        } else if (this.authMode === 'mutual-tls') {
            result = await this._authenticateMutualTLS(agentId, credentials);
        } else {
            result = { authenticated: false, error: 'Unknown auth mode' };
        }

        this.authCache.set(cacheKey, {
            result,
            timestamp: Date.now()
        });

        if (result.authenticated) {
            this.trustedAgents.set(agentId, {
                agentId,
                capabilities: result.capabilities || [],
                metadata: result.metadata || {},
                authenticatedAt: Date.now()
            });

            this.emit('agent-authenticated', {
                agentId,
                capabilities: result.capabilities,
                metadata: result.metadata
            });
        } else {
            this.emit('agent-authentication-failed', {
                agentId,
                error: result.error
            });
        }

        return result;
    }

    async _authenticateJWT(agentId, credentials) {
        if (!credentials.token) {
            return {
                authenticated: false,
                error: 'No token provided'
            };
        }

        const verification = this.verifyToken(credentials.token);
        
        if (!verification.valid) {
            return {
                authenticated: false,
                error: verification.error
            };
        }

        if (verification.payload.agentId !== agentId) {
            return {
                authenticated: false,
                error: 'Agent ID mismatch'
            };
        }

        return {
            authenticated: true,
            agentId: verification.payload.agentId,
            capabilities: verification.payload.capabilities,
            metadata: verification.payload.metadata
        };
    }

    async _authenticateSharedSecret(agentId, credentials) {
        if (!credentials.secret) {
            return {
                authenticated: false,
                error: 'No secret provided'
            };
        }

        const expectedSecret = this.trustedAgents.get(agentId)?.secret;
        
        if (!expectedSecret) {
            return {
                authenticated: false,
                error: 'Agent not registered'
            };
        }

        const hash = crypto.createHash('sha256').update(credentials.secret).digest('hex');
        const expectedHash = crypto.createHash('sha256').update(expectedSecret).digest('hex');

        if (hash !== expectedHash) {
            return {
                authenticated: false,
                error: 'Invalid secret'
            };
        }

        const agent = this.trustedAgents.get(agentId);
        return {
            authenticated: true,
            agentId,
            capabilities: agent.capabilities,
            metadata: agent.metadata
        };
    }

    async _authenticateMutualTLS(agentId, credentials) {
        if (!credentials.certificate || !this.tlsOptions) {
            return {
                authenticated: false,
                error: 'TLS configuration missing'
            };
        }

        try {
            const cert = crypto.createPublicKey(credentials.certificate);
            const fingerprint = crypto
                .createHash('sha256')
                .update(cert.export({ type: 'spki', format: 'der' }))
                .digest('hex');

            const trusted = this.trustedAgents.get(agentId);
            
            if (!trusted || trusted.certificateFingerprint !== fingerprint) {
                return {
                    authenticated: false,
                    error: 'Certificate not trusted'
                };
            }

            return {
                authenticated: true,
                agentId,
                capabilities: trusted.capabilities,
                metadata: trusted.metadata
            };
        } catch (error) {
            return {
                authenticated: false,
                error: `Certificate validation failed: ${error.message}`
            };
        }
    }

    registerTrustedAgent(agentId, options = {}) {
        this.trustedAgents.set(agentId, {
            agentId,
            capabilities: options.capabilities || [],
            metadata: options.metadata || {},
            secret: options.secret || null,
            certificateFingerprint: options.certificateFingerprint || null,
            registeredAt: Date.now()
        });

        this.emit('agent-registered', { agentId });
    }

    revokeTrust(agentId) {
        if (this.trustedAgents.has(agentId)) {
            this.trustedAgents.delete(agentId);
            
            for (const [key, cached] of this.authCache) {
                if (key.startsWith(`${agentId}:`)) {
                    this.authCache.delete(key);
                }
            }

            this.emit('agent-revoked', { agentId });
            return true;
        }
        return false;
    }

    isTrusted(agentId) {
        return this.trustedAgents.has(agentId);
    }

    getTrustedAgents() {
        return Array.from(this.trustedAgents.values()).map(agent => ({
            agentId: agent.agentId,
            capabilities: agent.capabilities,
            metadata: agent.metadata,
            registeredAt: agent.registeredAt
        }));
    }

    clearAuthCache() {
        this.authCache.clear();
        this.emit('cache-cleared');
    }

    getAuthStats() {
        return {
            trustedAgentCount: this.trustedAgents.size,
            cacheSize: this.authCache.size,
            authMode: this.authMode
        };
    }
}

module.exports = { AgentAuthService };
