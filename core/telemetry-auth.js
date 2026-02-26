const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');

const CONFIG_DIR = path.join(os.homedir(), '.ghost', 'config');
const AUTH_CONFIG_FILE = path.join(CONFIG_DIR, 'telemetry-auth.json');

class TelemetryAuthManager {
    constructor(options = {}) {
        this.jwtSecret = options.jwtSecret || this._loadOrGenerateSecret();
        this.apiKeys = new Map();
        this.sessionTokens = new Map();
        this.tokenExpiry = options.tokenExpiry || 3600000;
        this.refreshTokenExpiry = options.refreshTokenExpiry || 604800000;
        this._loadAuthConfig();
    }

    _loadOrGenerateSecret() {
        try {
            if (!fs.existsSync(CONFIG_DIR)) {
                fs.mkdirSync(CONFIG_DIR, { recursive: true });
            }

            const secretFile = path.join(CONFIG_DIR, '.jwt-secret');
            if (fs.existsSync(secretFile)) {
                return fs.readFileSync(secretFile, 'utf8');
            }

            const secret = crypto.randomBytes(64).toString('hex');
            fs.writeFileSync(secretFile, secret, { mode: 0o600 });
            return secret;
        } catch (error) {
            return crypto.randomBytes(64).toString('hex');
        }
    }

    _loadAuthConfig() {
        try {
            if (fs.existsSync(AUTH_CONFIG_FILE)) {
                const config = JSON.parse(fs.readFileSync(AUTH_CONFIG_FILE, 'utf8'));
                if (config.apiKeys) {
                    for (const [key, data] of Object.entries(config.apiKeys)) {
                        this.apiKeys.set(key, data);
                    }
                }
            }
        } catch (error) {
            console.warn('[TelemetryAuth] Failed to load auth config:', error.message);
        }
    }

    _saveAuthConfig() {
        try {
            if (!fs.existsSync(CONFIG_DIR)) {
                fs.mkdirSync(CONFIG_DIR, { recursive: true });
            }

            const config = {
                apiKeys: Object.fromEntries(this.apiKeys),
                updatedAt: new Date().toISOString()
            };

            fs.writeFileSync(AUTH_CONFIG_FILE, JSON.stringify(config, null, 2), { mode: 0o600 });
        } catch (error) {
            console.error('[TelemetryAuth] Failed to save auth config:', error.message);
        }
    }

    generateJWT(payload, expiresIn = null) {
        const header = {
            alg: 'HS256',
            typ: 'JWT'
        };

        const now = Date.now();
        const jwtPayload = {
            ...payload,
            iat: Math.floor(now / 1000),
            exp: Math.floor((now + (expiresIn || this.tokenExpiry)) / 1000),
            jti: crypto.randomBytes(16).toString('hex')
        };

        const encodedHeader = this._base64UrlEncode(JSON.stringify(header));
        const encodedPayload = this._base64UrlEncode(JSON.stringify(jwtPayload));
        const signature = crypto
            .createHmac('sha256', this.jwtSecret)
            .update(`${encodedHeader}.${encodedPayload}`)
            .digest('base64url');

        return `${encodedHeader}.${encodedPayload}.${signature}`;
    }

    verifyJWT(token) {
        try {
            const parts = token.split('.');
            if (parts.length !== 3) {
                return { valid: false, error: 'Invalid token format' };
            }

            const [encodedHeader, encodedPayload, signature] = parts;
            
            const expectedSignature = crypto
                .createHmac('sha256', this.jwtSecret)
                .update(`${encodedHeader}.${encodedPayload}`)
                .digest('base64url');

            if (signature !== expectedSignature) {
                return { valid: false, error: 'Invalid signature' };
            }

            const payload = JSON.parse(this._base64UrlDecode(encodedPayload));
            const now = Math.floor(Date.now() / 1000);

            if (payload.exp && payload.exp < now) {
                return { valid: false, error: 'Token expired' };
            }

            return { valid: true, payload };
        } catch (error) {
            return { valid: false, error: error.message };
        }
    }

    generateRefreshToken(userId) {
        const token = crypto.randomBytes(32).toString('hex');
        const expiresAt = Date.now() + this.refreshTokenExpiry;
        
        this.sessionTokens.set(token, {
            userId,
            expiresAt,
            createdAt: Date.now()
        });

        return token;
    }

    verifyRefreshToken(token) {
        const session = this.sessionTokens.get(token);
        if (!session) {
            return { valid: false, error: 'Invalid refresh token' };
        }

        if (session.expiresAt < Date.now()) {
            this.sessionTokens.delete(token);
            return { valid: false, error: 'Refresh token expired' };
        }

        return { valid: true, userId: session.userId };
    }

    revokeRefreshToken(token) {
        return this.sessionTokens.delete(token);
    }

    generateAPIKey(name, permissions = []) {
        const key = `gak_${crypto.randomBytes(32).toString('hex')}`;
        const keyHash = this._hashAPIKey(key);

        this.apiKeys.set(keyHash, {
            name,
            permissions,
            createdAt: Date.now(),
            lastUsed: null,
            usageCount: 0
        });

        this._saveAuthConfig();

        return key;
    }

    verifyAPIKey(key) {
        const keyHash = this._hashAPIKey(key);
        const keyData = this.apiKeys.get(keyHash);

        if (!keyData) {
            return { valid: false, error: 'Invalid API key' };
        }

        keyData.lastUsed = Date.now();
        keyData.usageCount++;

        return {
            valid: true,
            permissions: keyData.permissions,
            name: keyData.name
        };
    }

    revokeAPIKey(key) {
        const keyHash = this._hashAPIKey(key);
        const deleted = this.apiKeys.delete(keyHash);
        if (deleted) {
            this._saveAuthConfig();
        }
        return deleted;
    }

    listAPIKeys() {
        const keys = [];
        for (const [hash, data] of this.apiKeys.entries()) {
            keys.push({
                hash: hash.substring(0, 16) + '...',
                name: data.name,
                permissions: data.permissions,
                createdAt: data.createdAt,
                lastUsed: data.lastUsed,
                usageCount: data.usageCount
            });
        }
        return keys;
    }

    _hashAPIKey(key) {
        return crypto.createHash('sha256').update(key).digest('hex');
    }

    _base64UrlEncode(str) {
        return Buffer.from(str)
            .toString('base64')
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=/g, '');
    }

    _base64UrlDecode(str) {
        str = str.replace(/-/g, '+').replace(/_/g, '/');
        while (str.length % 4) {
            str += '=';
        }
        return Buffer.from(str, 'base64').toString();
    }

    authenticateRequest(req) {
        const authHeader = req.headers.authorization;
        
        if (!authHeader) {
            return { authenticated: false, error: 'No authorization header' };
        }

        const parts = authHeader.split(' ');
        if (parts.length !== 2) {
            return { authenticated: false, error: 'Invalid authorization header format' };
        }

        const [scheme, token] = parts;

        if (scheme === 'Bearer') {
            const result = this.verifyJWT(token);
            if (result.valid) {
                return {
                    authenticated: true,
                    type: 'jwt',
                    user: result.payload
                };
            }
            return { authenticated: false, error: result.error };
        } else if (scheme === 'ApiKey') {
            const result = this.verifyAPIKey(token);
            if (result.valid) {
                return {
                    authenticated: true,
                    type: 'apiKey',
                    permissions: result.permissions,
                    name: result.name
                };
            }
            return { authenticated: false, error: result.error };
        }

        return { authenticated: false, error: 'Unsupported authentication scheme' };
    }

    cleanupExpiredTokens() {
        const now = Date.now();
        for (const [token, session] of this.sessionTokens.entries()) {
            if (session.expiresAt < now) {
                this.sessionTokens.delete(token);
            }
        }
    }
}

module.exports = { TelemetryAuthManager };
