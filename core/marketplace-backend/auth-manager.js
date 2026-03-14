const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');

class AuthManager {
    constructor(options = {}) {
        this.dataDir = options.dataDir || path.join(os.homedir(), '.ghost', 'marketplace');
        this.usersFile = path.join(this.dataDir, 'users.json');
        this.tokenExpiry = options.tokenExpiry || 24 * 60 * 60 * 1000;
        this.users = new Map();
        this._ensureDataDir();
        this.jwtSecret = options.jwtSecret || this._generateSecret();
        this._loadUsers();
    }

    _ensureDataDir() {
        if (!fs.existsSync(this.dataDir)) {
            fs.mkdirSync(this.dataDir, { recursive: true, mode: 0o700 });
        }
    }

    _generateSecret() {
        const secretFile = path.join(this.dataDir, 'jwt-secret.key');
        if (fs.existsSync(secretFile)) {
            return fs.readFileSync(secretFile, 'utf8');
        }
        
        const secret = crypto.randomBytes(64).toString('hex');
        fs.writeFileSync(secretFile, secret, { mode: 0o600 });
        return secret;
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

    register(username, password, email) {
        if (!username || !password || !email) {
            return { success: false, error: 'Missing required fields' };
        }

        for (const user of this.users.values()) {
            if (user.username === username) {
                return { success: false, error: 'Username already exists' };
            }
            if (user.email === email) {
                return { success: false, error: 'Email already exists' };
            }
        }

        const id = this.users.size + 1;
        const passwordHash = this._hashPassword(password);
        
        const user = {
            id,
            username,
            email,
            passwordHash,
            isAdmin: false,
            createdAt: Date.now(),
            updatedAt: Date.now()
        };

        this.users.set(id, user);
        this._saveUsers();

        const token = this._generateToken(user);

        return {
            success: true,
            user: this._sanitizeUser(user),
            token
        };
    }

    login(username, password) {
        let user = null;
        
        for (const u of this.users.values()) {
            if (u.username === username) {
                user = u;
                break;
            }
        }

        if (!user) {
            return { success: false, error: 'Invalid credentials' };
        }

        if (!this._verifyPassword(password, user.passwordHash)) {
            return { success: false, error: 'Invalid credentials' };
        }

        const token = this._generateToken(user);

        return {
            success: true,
            user: this._sanitizeUser(user),
            token
        };
    }

    verifyToken(token) {
        try {
            const parts = token.split('.');
            if (parts.length !== 3) {
                return null;
            }

            const header = JSON.parse(Buffer.from(parts[0], 'base64').toString());
            const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
            const signature = parts[2];

            if (payload.exp < Date.now()) {
                return null;
            }

            const expectedSignature = this._sign(parts[0] + '.' + parts[1]);
            if (signature !== expectedSignature) {
                return null;
            }

            return payload;
        } catch (error) {
            return null;
        }
    }

    promoteToAdmin(userId) {
        const user = this.users.get(userId);
        if (!user) {
            return { success: false, error: 'User not found' };
        }

        user.isAdmin = true;
        user.updatedAt = Date.now();
        this._saveUsers();

        return { success: true, user: this._sanitizeUser(user) };
    }

    _generateToken(user) {
        const header = {
            alg: 'HS256',
            typ: 'JWT'
        };

        const payload = {
            id: user.id,
            username: user.username,
            isAdmin: user.isAdmin,
            iat: Date.now(),
            exp: Date.now() + this.tokenExpiry
        };

        const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64');
        const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64');
        const signature = this._sign(headerB64 + '.' + payloadB64);

        return `${headerB64}.${payloadB64}.${signature}`;
    }

    _sign(data) {
        return crypto
            .createHmac('sha256', this.jwtSecret)
            .update(data)
            .digest('base64');
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
