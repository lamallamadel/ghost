'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');
const jwt = require('jsonwebtoken');

class AuthManager {
    constructor(options = {}) {
        this.dataDir = options.dataDir || path.join(os.homedir(), '.ghost', 'marketplace');
        this.usersFile = path.join(this.dataDir, 'users.json');
        this.tokenExpiry = options.tokenExpiry || 24 * 60 * 60 * 1000;
        this.users = new Map();

        if (!process.env.JWT_SECRET) {
            throw new Error('[AuthManager] JWT_SECRET environment variable is required');
        }
        this.jwtSecret = process.env.JWT_SECRET;

        // Keycloak mode: opt-in via KEYCLOAK_URL env var
        if (process.env.KEYCLOAK_URL) {
            const { KeycloakAdapter } = require('./keycloak-adapter');
            this._keycloak = new KeycloakAdapter();
            console.log('[AuthManager] Keycloak mode enabled');
        } else {
            this._keycloak = null;
            this._ensureDataDir();
            this._loadUsers();
        }
    }

    _ensureDataDir() {
        if (!fs.existsSync(this.dataDir)) {
            fs.mkdirSync(this.dataDir, { recursive: true, mode: 0o700 });
        }
    }

    _loadUsers() {
        try {
            if (fs.existsSync(this.usersFile)) {
                const data = JSON.parse(fs.readFileSync(this.usersFile, 'utf8'));
                for (const [id, user] of Object.entries(data)) {
                    this.users.set(parseInt(id), user);
                }
            }
        } catch (error) {
            console.warn('[AuthManager] Failed to load users:', error.message);
        }
    }

    _saveUsers() {
        try {
            const data = Object.fromEntries(this.users);
            fs.writeFileSync(this.usersFile, JSON.stringify(data, null, 2), { mode: 0o600 });
        } catch (error) {
            console.error('[AuthManager] Failed to save users:', error.message);
        }
    }

    /**
     * Register a new user.
     * In Keycloak mode, registration is not supported via the marketplace — use Keycloak directly.
     */
    async register(username, password, email) {
        if (this._keycloak) {
            return { success: false, error: 'User registration must be performed via Keycloak' };
        }

        if (!username || !password || !email) {
            return { success: false, error: 'Missing required fields' };
        }

        for (const user of this.users.values()) {
            if (user.username === username) return { success: false, error: 'Username already exists' };
            if (user.email === email) return { success: false, error: 'Email already exists' };
        }

        const id = this.users.size + 1;
        const user = {
            id,
            username,
            email,
            passwordHash: this._hashPassword(password),
            isAdmin: false,
            createdAt: Date.now(),
            updatedAt: Date.now()
        };

        this.users.set(id, user);
        this._saveUsers();

        return {
            success: true,
            user: this._sanitizeUser(user),
            token: this._createToken(user.id, user.isAdmin)
        };
    }

    /**
     * Login with username/password.
     * Keycloak mode: proxies credentials to Keycloak ROPC, returns Keycloak access token.
     * Local mode: verifies against local PBKDF2 store, returns HS256 JWT.
     */
    async login(username, password) {
        if (this._keycloak) {
            const result = await this._keycloak.loginWithKeycloak(username, password);
            if (!result.success) return { success: false, error: 'Invalid credentials' };
            return {
                success: true,
                user: {
                    id: result.user.id,
                    username: result.user.username,
                    email: result.user.email,
                    isAdmin: result.user.isAdmin
                },
                token: result.token
            };
        }

        let user = null;
        for (const u of this.users.values()) {
            if (u.username === username) { user = u; break; }
        }
        if (!user || !this._verifyPassword(password, user.passwordHash)) {
            return { success: false, error: 'Invalid credentials' };
        }
        return {
            success: true,
            user: this._sanitizeUser(user),
            token: this._createToken(user.id, user.isAdmin)
        };
    }

    _createToken(userId, isAdmin) {
        return jwt.sign({ userId, isAdmin }, this.jwtSecret, {
            algorithm: 'HS256',
            expiresIn: Math.floor(this.tokenExpiry / 1000),
            issuer: 'ghost-marketplace',
            audience: 'ghost-cli'
        });
    }

    /**
     * Verify a token.
     * Tries local HS256 JWT first; if that fails and Keycloak mode is active,
     * falls back to Keycloak JWKS verification.
     */
    async verifyToken(token) {
        if (!token) return null;

        // Try local JWT first
        try {
            return jwt.verify(token, this.jwtSecret, {
                algorithms: ['HS256'],
                issuer: 'ghost-marketplace',
                audience: 'ghost-cli'
            });
        } catch {
            // fall through
        }

        // Keycloak fallback
        if (this._keycloak) {
            return this._keycloak.verifyKeycloakToken(token);
        }

        return null;
    }

    createPublishToken(userId) {
        return jwt.sign(
            { userId, action: 'publish' },
            this.jwtSecret,
            {
                algorithm: 'HS256',
                expiresIn: 3600,
                issuer: 'ghost-marketplace',
                audience: 'ghost-cli'
            }
        );
    }

    promoteToAdmin(userId) {
        if (this._keycloak) {
            return { success: false, error: 'Role management is handled via Keycloak' };
        }
        const user = this.users.get(userId);
        if (!user) return { success: false, error: 'User not found' };
        user.isAdmin = true;
        user.updatedAt = Date.now();
        this._saveUsers();
        return { success: true, user: this._sanitizeUser(user) };
    }

    _hashPassword(password) {
        const salt = crypto.randomBytes(16).toString('hex');
        const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
        return `${salt}:${hash}`;
    }

    _verifyPassword(password, storedHash) {
        const [salt, hash] = storedHash.split(':');
        const verifyHash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
        return hash === verifyHash;
    }

    _sanitizeUser(user) {
        return {
            id: user.id,
            username: user.username,
            email: user.email,
            isAdmin: user.isAdmin,
            createdAt: user.createdAt
        };
    }
}

module.exports = { AuthManager };
