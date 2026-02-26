const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const http = require('http');

const SECRETS_DIR = path.join(os.homedir(), '.ghost', 'secrets');

class SecretsManager {
    constructor(options = {}) {
        this.secretsDir = options.secretsDir || SECRETS_DIR;
        this.vaultConfig = options.vault || null;
        this.awsConfig = options.aws || null;
        this.encryptionKey = this._loadOrGenerateKey();
        this.secrets = new Map();
        this._ensureSecretsDir();
        this._loadSecrets();
    }

    _ensureSecretsDir() {
        if (!fs.existsSync(this.secretsDir)) {
            fs.mkdirSync(this.secretsDir, { recursive: true, mode: 0o700 });
        }
    }

    _loadOrGenerateKey() {
        try {
            const keyFile = path.join(this.secretsDir, '.encryption-key');
            if (fs.existsSync(keyFile)) {
                return fs.readFileSync(keyFile);
            }

            const key = crypto.randomBytes(32);
            fs.writeFileSync(keyFile, key, { mode: 0o600 });
            return key;
        } catch (error) {
            return crypto.randomBytes(32);
        }
    }

    _loadSecrets() {
        try {
            const secretsFile = path.join(this.secretsDir, 'secrets.enc');
            if (fs.existsSync(secretsFile)) {
                const encrypted = fs.readFileSync(secretsFile);
                const decrypted = this._decrypt(encrypted);
                const secrets = JSON.parse(decrypted);
                
                for (const [key, value] of Object.entries(secrets)) {
                    this.secrets.set(key, value);
                }
            }
        } catch (error) {
            console.warn('[SecretsManager] Failed to load secrets:', error.message);
        }
    }

    _saveSecrets() {
        try {
            const secrets = Object.fromEntries(this.secrets);
            const json = JSON.stringify(secrets);
            const encrypted = this._encrypt(json);
            
            const secretsFile = path.join(this.secretsDir, 'secrets.enc');
            fs.writeFileSync(secretsFile, encrypted, { mode: 0o600 });
        } catch (error) {
            console.error('[SecretsManager] Failed to save secrets:', error.message);
        }
    }

    _encrypt(text) {
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv('aes-256-gcm', this.encryptionKey, iv);
        
        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        
        const authTag = cipher.getAuthTag();
        
        return Buffer.concat([
            iv,
            authTag,
            Buffer.from(encrypted, 'hex')
        ]);
    }

    _decrypt(buffer) {
        const iv = buffer.slice(0, 16);
        const authTag = buffer.slice(16, 32);
        const encrypted = buffer.slice(32).toString('hex');
        
        const decipher = crypto.createDecipheriv('aes-256-gcm', this.encryptionKey, iv);
        decipher.setAuthTag(authTag);
        
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        
        return decrypted;
    }

    async setSecret(key, value, options = {}) {
        const { extensionId, provider = 'local', metadata = {} } = options;

        if (provider === 'vault' && this.vaultConfig) {
            return await this._storeInVault(key, value, extensionId, metadata);
        } else if (provider === 'aws' && this.awsConfig) {
            return await this._storeInAWS(key, value, extensionId, metadata);
        }

        this.secrets.set(key, {
            value,
            extensionId,
            provider: 'local',
            createdAt: Date.now(),
            lastAccessed: null,
            accessCount: 0,
            metadata
        });

        this._saveSecrets();

        return { success: true, key, provider: 'local' };
    }

    async getSecret(key, extensionId) {
        const secret = this.secrets.get(key);

        if (!secret) {
            if (this.vaultConfig) {
                return await this._retrieveFromVault(key, extensionId);
            } else if (this.awsConfig) {
                return await this._retrieveFromAWS(key, extensionId);
            }
            return { success: false, error: 'Secret not found' };
        }

        if (secret.extensionId && secret.extensionId !== extensionId) {
            return { success: false, error: 'Access denied' };
        }

        secret.lastAccessed = Date.now();
        secret.accessCount++;
        this._saveSecrets();

        return { success: true, value: secret.value, metadata: secret.metadata };
    }

    deleteSecret(key, extensionId) {
        const secret = this.secrets.get(key);

        if (!secret) {
            return { success: false, error: 'Secret not found' };
        }

        if (secret.extensionId && secret.extensionId !== extensionId) {
            return { success: false, error: 'Access denied' };
        }

        this.secrets.delete(key);
        this._saveSecrets();

        return { success: true };
    }

    listSecrets(extensionId = null) {
        const secrets = [];

        for (const [key, secret] of this.secrets.entries()) {
            if (extensionId && secret.extensionId !== extensionId) {
                continue;
            }

            secrets.push({
                key,
                extensionId: secret.extensionId,
                provider: secret.provider,
                createdAt: secret.createdAt,
                lastAccessed: secret.lastAccessed,
                accessCount: secret.accessCount,
                metadata: secret.metadata
            });
        }

        return secrets;
    }

    rotateSecret(key, newValue, extensionId) {
        const secret = this.secrets.get(key);

        if (!secret) {
            return { success: false, error: 'Secret not found' };
        }

        if (secret.extensionId && secret.extensionId !== extensionId) {
            return { success: false, error: 'Access denied' };
        }

        secret.value = newValue;
        secret.rotatedAt = Date.now();
        this._saveSecrets();

        return { success: true };
    }

    async _storeInVault(key, value, extensionId, metadata) {
        try {
            const url = `${this.vaultConfig.address}/v1/${this.vaultConfig.mount}/data/${key}`;
            
            const data = {
                data: {
                    value,
                    extensionId,
                    metadata
                }
            };

            const response = await this._httpRequest('POST', url, data, {
                'X-Vault-Token': this.vaultConfig.token
            });

            if (response.statusCode >= 200 && response.statusCode < 300) {
                this.secrets.set(key, {
                    provider: 'vault',
                    extensionId,
                    createdAt: Date.now(),
                    metadata
                });
                this._saveSecrets();
                
                return { success: true, key, provider: 'vault' };
            }

            throw new Error(`Vault returned status ${response.statusCode}`);
        } catch (error) {
            console.error('[SecretsManager] Vault storage failed:', error.message);
            return await this.setSecret(key, value, { extensionId, provider: 'local', metadata });
        }
    }

    async _retrieveFromVault(key, extensionId) {
        try {
            const url = `${this.vaultConfig.address}/v1/${this.vaultConfig.mount}/data/${key}`;
            
            const response = await this._httpRequest('GET', url, null, {
                'X-Vault-Token': this.vaultConfig.token
            });

            if (response.statusCode === 200) {
                const data = JSON.parse(response.body);
                const secretData = data.data.data;

                if (secretData.extensionId && secretData.extensionId !== extensionId) {
                    return { success: false, error: 'Access denied' };
                }

                return { 
                    success: true, 
                    value: secretData.value, 
                    metadata: secretData.metadata 
                };
            }

            return { success: false, error: 'Secret not found' };
        } catch (error) {
            console.error('[SecretsManager] Vault retrieval failed:', error.message);
            return { success: false, error: error.message };
        }
    }

    async _storeInAWS(key, value, extensionId, metadata) {
        return await this.setSecret(key, value, { extensionId, provider: 'local', metadata });
    }

    async _retrieveFromAWS(key, extensionId) {
        return { success: false, error: 'AWS Secrets Manager not implemented' };
    }

    _httpRequest(method, url, data = null, headers = {}) {
        return new Promise((resolve, reject) => {
            const urlObj = new URL(url);
            const protocol = urlObj.protocol === 'https:' ? https : http;
            
            const options = {
                hostname: urlObj.hostname,
                port: urlObj.port,
                path: urlObj.pathname,
                method,
                headers: {
                    'Content-Type': 'application/json',
                    ...headers
                }
            };

            if (data) {
                const bodyStr = JSON.stringify(data);
                options.headers['Content-Length'] = Buffer.byteLength(bodyStr);
            }

            const req = protocol.request(options, (res) => {
                const chunks = [];
                res.on('data', chunk => chunks.push(chunk));
                res.on('end', () => {
                    const body = Buffer.concat(chunks).toString();
                    resolve({ statusCode: res.statusCode, body });
                });
            });

            req.on('error', reject);
            
            if (data) {
                req.write(JSON.stringify(data));
            }
            
            req.end();
        });
    }
}

module.exports = { SecretsManager };
