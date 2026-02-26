const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');

const CERT_DIR = path.join(os.homedir(), '.ghost', 'certificates');

class CodeSigningManager {
    constructor(options = {}) {
        this.certDir = options.certDir || CERT_DIR;
        this.trustedCerts = new Map();
        this.revocationList = new Set();
        this._ensureCertDir();
        this._loadTrustedCerts();
        this._loadRevocationList();
    }

    _ensureCertDir() {
        if (!fs.existsSync(this.certDir)) {
            fs.mkdirSync(this.certDir, { recursive: true, mode: 0o700 });
        }
    }

    _loadTrustedCerts() {
        try {
            const certsFile = path.join(this.certDir, 'trusted.json');
            if (fs.existsSync(certsFile)) {
                const certs = JSON.parse(fs.readFileSync(certsFile, 'utf8'));
                for (const [id, cert] of Object.entries(certs)) {
                    this.trustedCerts.set(id, cert);
                }
            }
        } catch (error) {
            console.warn('[CodeSigning] Failed to load trusted certs:', error.message);
        }
    }

    _loadRevocationList() {
        try {
            const crlFile = path.join(this.certDir, 'revoked.json');
            if (fs.existsSync(crlFile)) {
                const revoked = JSON.parse(fs.readFileSync(crlFile, 'utf8'));
                for (const certId of revoked) {
                    this.revocationList.add(certId);
                }
            }
        } catch (error) {
            console.warn('[CodeSigning] Failed to load revocation list:', error.message);
        }
    }

    _saveTrustedCerts() {
        try {
            const certsFile = path.join(this.certDir, 'trusted.json');
            const certs = Object.fromEntries(this.trustedCerts);
            fs.writeFileSync(certsFile, JSON.stringify(certs, null, 2), { mode: 0o600 });
        } catch (error) {
            console.error('[CodeSigning] Failed to save trusted certs:', error.message);
        }
    }

    _saveRevocationList() {
        try {
            const crlFile = path.join(this.certDir, 'revoked.json');
            const revoked = Array.from(this.revocationList);
            fs.writeFileSync(crlFile, JSON.stringify(revoked, null, 2), { mode: 0o600 });
        } catch (error) {
            console.error('[CodeSigning] Failed to save revocation list:', error.message);
        }
    }

    generateKeyPair(developerId) {
        const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
            modulusLength: 4096,
            publicKeyEncoding: {
                type: 'spki',
                format: 'pem'
            },
            privateKeyEncoding: {
                type: 'pkcs8',
                format: 'pem',
                cipher: 'aes-256-cbc',
                passphrase: crypto.randomBytes(32).toString('hex')
            }
        });

        const certId = crypto.randomBytes(16).toString('hex');
        const fingerprint = this._generateFingerprint(publicKey);

        const cert = {
            certId,
            developerId,
            publicKey,
            fingerprint,
            createdAt: Date.now(),
            expiresAt: Date.now() + (365 * 24 * 60 * 60 * 1000),
            status: 'active'
        };

        this.trustedCerts.set(certId, cert);
        this._saveTrustedCerts();

        const privateKeyFile = path.join(this.certDir, `${certId}.key`);
        fs.writeFileSync(privateKeyFile, privateKey, { mode: 0o600 });

        return {
            certId,
            fingerprint,
            publicKey,
            privateKeyFile
        };
    }

    signExtension(extensionPath, privateKeyFile, passphrase) {
        try {
            const manifest = this._loadManifest(extensionPath);
            const extensionHash = this._hashExtension(extensionPath);

            const privateKey = fs.readFileSync(privateKeyFile, 'utf8');
            const sign = crypto.createSign('RSA-SHA256');
            
            const signatureData = JSON.stringify({
                extensionId: manifest.id,
                version: manifest.version,
                hash: extensionHash,
                timestamp: Date.now()
            });

            sign.update(signatureData);
            sign.end();

            const signature = sign.sign({
                key: privateKey,
                passphrase
            }, 'base64');

            const signatureFile = path.join(extensionPath, 'signature.json');
            fs.writeFileSync(signatureFile, JSON.stringify({
                signature,
                data: signatureData,
                algorithm: 'RSA-SHA256'
            }, null, 2));

            return {
                success: true,
                signature,
                hash: extensionHash
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    verifyExtension(extensionPath) {
        try {
            const signatureFile = path.join(extensionPath, 'signature.json');
            
            if (!fs.existsSync(signatureFile)) {
                return {
                    valid: false,
                    error: 'Extension not signed',
                    requiresSigning: true
                };
            }

            const signatureData = JSON.parse(fs.readFileSync(signatureFile, 'utf8'));
            const { signature, data, algorithm } = signatureData;

            const parsedData = JSON.parse(data);
            const currentHash = this._hashExtension(extensionPath);

            if (parsedData.hash !== currentHash) {
                return {
                    valid: false,
                    error: 'Extension has been modified since signing',
                    tampering: true
                };
            }

            const certId = this._findCertForExtension(parsedData.extensionId);
            if (!certId) {
                return {
                    valid: false,
                    error: 'No trusted certificate found for this extension'
                };
            }

            if (this.revocationList.has(certId)) {
                return {
                    valid: false,
                    error: 'Certificate has been revoked',
                    certId
                };
            }

            const cert = this.trustedCerts.get(certId);
            if (Date.now() > cert.expiresAt) {
                return {
                    valid: false,
                    error: 'Certificate has expired',
                    certId
                };
            }

            const verify = crypto.createVerify(algorithm);
            verify.update(data);
            verify.end();

            const isValid = verify.verify(cert.publicKey, signature, 'base64');

            return {
                valid: isValid,
                certId,
                developerId: cert.developerId,
                timestamp: parsedData.timestamp
            };
        } catch (error) {
            return {
                valid: false,
                error: error.message
            };
        }
    }

    trustCertificate(certId, publicKey, developerId) {
        const fingerprint = this._generateFingerprint(publicKey);

        const cert = {
            certId,
            developerId,
            publicKey,
            fingerprint,
            createdAt: Date.now(),
            expiresAt: Date.now() + (365 * 24 * 60 * 60 * 1000),
            status: 'active'
        };

        this.trustedCerts.set(certId, cert);
        this._saveTrustedCerts();

        return { success: true, fingerprint };
    }

    revokeCertificate(certId, reason = 'unspecified') {
        if (!this.trustedCerts.has(certId)) {
            return { success: false, error: 'Certificate not found' };
        }

        const cert = this.trustedCerts.get(certId);
        cert.status = 'revoked';
        cert.revokedAt = Date.now();
        cert.revocationReason = reason;

        this.revocationList.add(certId);
        this._saveTrustedCerts();
        this._saveRevocationList();

        return { success: true, certId };
    }

    listCertificates() {
        const certs = [];
        for (const [certId, cert] of this.trustedCerts.entries()) {
            certs.push({
                certId,
                developerId: cert.developerId,
                fingerprint: cert.fingerprint,
                createdAt: cert.createdAt,
                expiresAt: cert.expiresAt,
                status: cert.status,
                revoked: this.revocationList.has(certId)
            });
        }
        return certs;
    }

    _loadManifest(extensionPath) {
        const manifestFile = path.join(extensionPath, 'manifest.json');
        return JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
    }

    _hashExtension(extensionPath) {
        const hash = crypto.createHash('sha256');
        const files = this._getExtensionFiles(extensionPath);
        
        for (const file of files.sort()) {
            if (file.endsWith('signature.json')) continue;
            
            const content = fs.readFileSync(path.join(extensionPath, file));
            hash.update(file);
            hash.update(content);
        }

        return hash.digest('hex');
    }

    _getExtensionFiles(dir, baseDir = null) {
        if (!baseDir) baseDir = dir;
        const files = [];
        const entries = fs.readdirSync(dir, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            const relativePath = path.relative(baseDir, fullPath);

            if (entry.isDirectory()) {
                if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
                    files.push(...this._getExtensionFiles(fullPath, baseDir));
                }
            } else {
                files.push(relativePath);
            }
        }

        return files;
    }

    _generateFingerprint(publicKey) {
        return crypto.createHash('sha256').update(publicKey).digest('hex').substring(0, 40);
    }

    _findCertForExtension(extensionId) {
        for (const [certId, cert] of this.trustedCerts.entries()) {
            if (cert.status === 'active' && !this.revocationList.has(certId)) {
                return certId;
            }
        }
        return null;
    }
}

module.exports = { CodeSigningManager };
