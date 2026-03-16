const https = require('https');
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');

const DEFAULT_REGISTRY_URL = 'https://registry.ghost-cli.dev/api';
const GHOSTRC_PATH = path.join(os.homedir(), '.ghost', 'config', 'ghostrc.json');
const DEFAULT_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAw8+JBKqK5vHxqD8xhN2K
-----END PUBLIC KEY-----`;

function resolveRegistryUrl() {
    try {
        const rc = JSON.parse(fs.readFileSync(GHOSTRC_PATH, 'utf8'));
        if (rc?.marketplace?.registryUrl) return rc.marketplace.registryUrl;
    } catch {}
    return process.env.GHOST_MARKETPLACE_URL || DEFAULT_REGISTRY_URL;
}

function readAuthToken() {
    try {
        const rc = JSON.parse(fs.readFileSync(GHOSTRC_PATH, 'utf8'));
        const token = rc?.marketplace?.token;
        const expiresAt = rc?.marketplace?.expiresAt;
        if (token && (!expiresAt || Date.now() < expiresAt)) {
            return token;
        }
    } catch {}
    return null;
}

class MarketplaceService {
    constructor(options = {}) {
        this.registryUrl = options.registryUrl || resolveRegistryUrl();
        this.publicKey = options.publicKey || DEFAULT_PUBLIC_KEY;
        this.cacheDir = path.join(os.homedir(), '.ghost', 'marketplace-cache');
        this.cacheTTL = options.cacheTTL || 3600000;
        this._ensureCacheDir();
    }

    _ensureCacheDir() {
        if (!fs.existsSync(this.cacheDir)) {
            fs.mkdirSync(this.cacheDir, { recursive: true });
        }
    }

    async fetchExtensions(options = {}) {
        const { category, search, sort = 'downloads', limit = 50, offset = 0 } = options;
        
        const cacheKey = `extensions-${JSON.stringify({ category, search, sort, limit, offset })}`;
        const cached = this._getCached(cacheKey);
        if (cached) return cached;

        const queryParams = new URLSearchParams();
        if (category) queryParams.append('category', category);
        if (search) queryParams.append('q', search);
        queryParams.append('sort', sort);
        queryParams.append('limit', String(limit));
        queryParams.append('offset', String(offset));

        try {
            const data = await this._httpRequest('GET', `/marketplace/extensions?${queryParams.toString()}`);
            this._setCached(cacheKey, data);
            return data;
        } catch (error) {
            const fallback = this._loadLocalRegistry();
            return { extensions: fallback.extensions || [], total: fallback.extensions?.length || 0 };
        }
    }

    async fetchExtensionById(extensionId) {
        const cacheKey = `extension-${extensionId}`;
        const cached = this._getCached(cacheKey);
        if (cached) return cached;

        try {
            const data = await this._httpRequest('GET', `/marketplace/extensions/${extensionId}`);
            this._setCached(cacheKey, data);
            return data;
        } catch (error) {
            const fallback = this._loadLocalRegistry();
            const extension = fallback.extensions?.find(e => e.id === extensionId);
            if (!extension) throw new Error(`Extension ${extensionId} not found`);
            return extension;
        }
    }

    async installExtension(extensionId, options = {}) {
        const { version, targetDir, codeSigningManager, requireSigning = false, autoInstallDeps = false } = options;
        
        const extension = await this.fetchExtensionById(extensionId);
        const versionData = version 
            ? extension.versions.find(v => v.version === version)
            : extension.versions[0];

        if (!versionData) {
            throw new Error(`Version ${version || 'latest'} not found for ${extensionId}`);
        }

        const manifest = JSON.parse(versionData.manifest || '{}');
        const dependencies = manifest.dependencies || {};
        
        // Auto-install dependencies if requested
        if (autoInstallDeps && Object.keys(dependencies).length > 0) {
            console.log(`[Marketplace] Installing ${Object.keys(dependencies).length} dependencies...`);
            const installed = [];
            
            for (const [depId, constraint] of Object.entries(dependencies)) {
                try {
                    const depResult = await this.installExtension(depId, { 
                        version: constraint.replace(/^[\^~]/, ''), 
                        autoInstallDeps: true 
                    });
                    installed.push(depResult);
                    console.log(`[Marketplace] ✓ Installed dependency: ${depId}@${depResult.version}`);
                } catch (error) {
                    console.warn(`[Marketplace] Warning: Failed to install dependency ${depId}: ${error.message}`);
                }
            }
        }

        const extensionData = await this._downloadExtension(versionData.downloadUrl);
        
        if (versionData.signature) {
            const isValid = this._verifySignature(extensionData, versionData.signature);
            if (!isValid) {
                throw new Error('Signature verification failed - extension may be compromised');
            }
        }

        const installPath = targetDir || path.join(os.homedir(), '.ghost', 'extensions', extensionId);
        await this._extractExtension(extensionData, installPath, versionData);

        if (codeSigningManager) {
            const signatureResult = codeSigningManager.verifyExtension(installPath);
            if (!signatureResult.valid) {
                if (requireSigning) {
                    fs.rmSync(installPath, { recursive: true, force: true });
                    throw new Error(`Extension signature verification failed: ${signatureResult.error}`);
                } else {
                    console.warn(`[Marketplace] Warning: Extension ${extensionId} is not properly signed`);
                }
            }
        }

        const resolvedDeps = await this._resolveDependencies(dependencies);
        
        return {
            success: true,
            extensionId,
            version: versionData.version,
            installPath,
            dependencies: resolvedDeps,
            signed: versionData.signature ? true : false
        };
    }

    async _downloadExtension(downloadUrl) {
        return new Promise((resolve, reject) => {
            const protocol = downloadUrl.startsWith('https') ? https : http;
            
            protocol.get(downloadUrl, (res) => {
                if (res.statusCode === 302 || res.statusCode === 301) {
                    return this._downloadExtension(res.headers.location).then(resolve).catch(reject);
                }

                if (res.statusCode !== 200) {
                    return reject(new Error(`Download failed with status ${res.statusCode}`));
                }

                const chunks = [];
                res.on('data', chunk => chunks.push(chunk));
                res.on('end', () => resolve(Buffer.concat(chunks)));
                res.on('error', reject);
            }).on('error', reject);
        });
    }

    async _extractExtension(data, installPath, versionData) {
        if (fs.existsSync(installPath)) {
            fs.rmSync(installPath, { recursive: true, force: true });
        }
        fs.mkdirSync(installPath, { recursive: true });

        if (versionData.format === 'tarball' || versionData.downloadUrl.endsWith('.tar.gz')) {
            throw new Error('Tarball extraction requires tar binary - use directory format');
        }

        const manifest = JSON.parse(versionData.manifest || '{}');
        fs.writeFileSync(path.join(installPath, 'manifest.json'), JSON.stringify(manifest, null, 2));
        
        const indexContent = versionData.mainFile || this._generateDefaultIndex(manifest);
        fs.writeFileSync(path.join(installPath, manifest.main || 'index.js'), indexContent);

        if (versionData.files) {
            for (const [fileName, content] of Object.entries(versionData.files)) {
                const filePath = path.join(installPath, fileName);
                const fileDir = path.dirname(filePath);
                if (!fs.existsSync(fileDir)) {
                    fs.mkdirSync(fileDir, { recursive: true });
                }
                fs.writeFileSync(filePath, content);
            }
        }
    }

    _generateDefaultIndex(manifest) {
        return `const { ExtensionSDK } = require('@ghost/extension-sdk');

class ${this._toPascalCase(manifest.id)}Extension {
    constructor() {
        this.sdk = new ExtensionSDK('${manifest.id}');
    }

    async initialize() {
        console.log('${manifest.name} extension initialized');
    }

    async shutdown() {
        console.log('${manifest.name} extension shutting down');
    }
}

module.exports = ${this._toPascalCase(manifest.id)}Extension;
`;
    }

    _toPascalCase(str) {
        return str.split(/[-_]/).map(word => 
            word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
        ).join('');
    }

    async _resolveDependencies(dependencies) {
        const resolved = [];
        
        for (const [depId, versionConstraint] of Object.entries(dependencies)) {
            const extension = await this.fetchExtensionById(depId);
            const matchingVersion = this._findMatchingVersion(extension.versions, versionConstraint);
            
            if (!matchingVersion) {
                throw new Error(`No matching version found for dependency ${depId}@${versionConstraint}`);
            }

            resolved.push({
                id: depId,
                version: matchingVersion.version,
                satisfied: false
            });
        }

        return resolved;
    }

    _findMatchingVersion(versions, constraint) {
        if (constraint === '*' || constraint === 'latest') {
            return versions[0];
        }

        const match = constraint.match(/^([~^]?)(\d+\.\d+\.\d+)$/);
        if (!match) return null;

        const [, modifier, version] = match;
        const [major, minor, patch] = version.split('.').map(Number);

        for (const v of versions) {
            const [vMajor, vMinor, vPatch] = v.version.split('.').map(Number);
            
            if (modifier === '^') {
                if (vMajor === major && (vMinor > minor || (vMinor === minor && vPatch >= patch))) {
                    return v;
                }
            } else if (modifier === '~') {
                if (vMajor === major && vMinor === minor && vPatch >= patch) {
                    return v;
                }
            } else {
                if (vMajor === major && vMinor === minor && vPatch === patch) {
                    return v;
                }
            }
        }

        return null;
    }

    _verifySignature(data, signature) {
        try {
            const verify = crypto.createVerify('RSA-SHA256');
            verify.update(data);
            verify.end();
            
            return verify.verify(this.publicKey, signature, 'base64');
        } catch (error) {
            console.error('Signature verification error:', error);
            return false;
        }
    }

    _httpRequest(method, path, body = null) {
        return new Promise((resolve, reject) => {
            const url = new URL(this.registryUrl + path);
            const protocol = url.protocol === 'https:' ? https : http;
            
            const headers = {
                'Content-Type': 'application/json',
                'User-Agent': 'ghost-cli-marketplace/1.0'
            };
            const authToken = readAuthToken();
            if (authToken) {
                headers['Authorization'] = `Bearer ${authToken}`;
            }

            const options = {
                hostname: url.hostname,
                port: url.port,
                path: url.pathname + url.search,
                method,
                headers
            };

            if (body) {
                const bodyStr = JSON.stringify(body);
                options.headers['Content-Length'] = Buffer.byteLength(bodyStr);
            }

            const req = protocol.request(options, (res) => {
                const chunks = [];
                res.on('data', chunk => chunks.push(chunk));
                res.on('end', () => {
                    const responseBody = Buffer.concat(chunks).toString();
                    
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        try {
                            resolve(JSON.parse(responseBody));
                        } catch {
                            resolve(responseBody);
                        }
                    } else {
                        reject(new Error(`HTTP ${res.statusCode}: ${responseBody}`));
                    }
                });
            });

            req.on('error', reject);
            
            if (body) {
                req.write(JSON.stringify(body));
            }
            
            req.end();
        });
    }

    _getCached(key) {
        const cachePath = path.join(this.cacheDir, `${this._hash(key)}.json`);
        
        if (!fs.existsSync(cachePath)) return null;

        try {
            const cached = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
            if (Date.now() - cached.timestamp > this.cacheTTL) {
                fs.unlinkSync(cachePath);
                return null;
            }
            return cached.data;
        } catch {
            return null;
        }
    }

    _setCached(key, data) {
        const cachePath = path.join(this.cacheDir, `${this._hash(key)}.json`);
        
        try {
            fs.writeFileSync(cachePath, JSON.stringify({
                timestamp: Date.now(),
                data
            }));
        } catch (error) {
        }
    }

    _hash(str) {
        return crypto.createHash('sha256').update(str).digest('hex').substring(0, 16);
    }

    _loadLocalRegistry() {
        const registryPath = path.join(__dirname, '..', 'marketplace-registry.json');
        
        if (fs.existsSync(registryPath)) {
            try {
                const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
                if (registry.extensions) {
                    registry.extensions = registry.extensions.map(ext => ({
                        ...ext,
                        healthScore: ext.healthScore || this._estimateHealthScore(ext),
                        healthBadge: ext.healthBadge || this._getHealthBadge(ext.healthScore || this._estimateHealthScore(ext))
                    }));
                }
                return registry;
            } catch {
                return { extensions: [] };
            }
        }

        return {
            extensions: [
                {
                    id: 'example-extension',
                    name: 'Example Extension',
                    description: 'A sample extension for demonstration',
                    author: 'Ghost Team',
                    category: 'utilities',
                    tags: ['example', 'demo'],
                    ratings: { average: 4.5, count: 10 },
                    downloads: 150,
                    verified: true,
                    healthScore: 75,
                    healthBadge: { level: 'good', color: '#3b82f6', label: 'Good' },
                    versions: [
                        {
                            version: '1.0.0',
                            publishedAt: new Date().toISOString(),
                            compatibility: { ghostCli: '>=1.0.0' },
                            downloadUrl: 'https://example.com/extensions/example-extension-1.0.0.tar.gz',
                            signature: null,
                            securityScan: {
                                scannedAt: new Date().toISOString(),
                                vulnerabilities: 0,
                                malwareClean: true,
                                codeAnalysis: {
                                    suspiciousPatterns: 0,
                                    obfuscatedCode: false,
                                    networkCalls: 0
                                }
                            },
                            manifest: JSON.stringify({
                                id: 'example-extension',
                                name: 'Example Extension',
                                version: '1.0.0',
                                main: 'index.js',
                                capabilities: {
                                    filesystem: { read: ['**/*.md'], write: [] },
                                    network: { allowlist: [], rateLimit: { cir: 60, bc: 100, be: 204800 } }
                                }
                            })
                        }
                    ]
                }
            ]
        };
    }

    async submitRating(extensionId, rating, comment = '') {
        if (rating < 1 || rating > 5) {
            throw new Error('Rating must be between 1 and 5');
        }

        const payload = {
            extensionId,
            rating,
            comment,
            timestamp: new Date().toISOString()
        };

        try {
            const result = await this._httpRequest('POST', `/marketplace/extensions/${extensionId}/ratings`, payload);
            return result;
        } catch (error) {
            const ratingsFile = path.join(this.cacheDir, 'local-ratings.json');
            let ratings = [];
            
            if (fs.existsSync(ratingsFile)) {
                try {
                    ratings = JSON.parse(fs.readFileSync(ratingsFile, 'utf8'));
                } catch (e) {
                    ratings = [];
                }
            }
            
            ratings.push(payload);
            fs.writeFileSync(ratingsFile, JSON.stringify(ratings, null, 2));
            
            return {
                success: true,
                cached: true,
                message: 'Rating saved locally and will be synced when registry is available'
            };
        }
    }

    clearCache() {
        if (fs.existsSync(this.cacheDir)) {
            const files = fs.readdirSync(this.cacheDir);
            for (const file of files) {
                fs.unlinkSync(path.join(this.cacheDir, file));
            }
        }
    }

    _estimateHealthScore(extension) {
        let score = 50;
        
        if (extension.ratings && extension.ratings.average) {
            score += (extension.ratings.average / 5) * 20;
        }
        
        if (extension.verified) {
            score += 15;
        }
        
        if (extension.downloads > 1000) {
            score += 10;
        } else if (extension.downloads > 100) {
            score += 5;
        }
        
        if (extension.versions && extension.versions.length > 0) {
            const latestVersion = extension.versions[0];
            if (latestVersion.publishedAt) {
                const daysSinceUpdate = (Date.now() - new Date(latestVersion.publishedAt).getTime()) / (1000 * 60 * 60 * 24);
                if (daysSinceUpdate < 30) score += 5;
            }
        }
        
        return Math.min(100, Math.round(score));
    }

    _getHealthBadge(healthScore) {
        if (healthScore >= 80) {
            return { level: 'excellent', color: '#10b981', label: 'Excellent' };
        } else if (healthScore >= 60) {
            return { level: 'good', color: '#3b82f6', label: 'Good' };
        } else if (healthScore >= 40) {
            return { level: 'fair', color: '#f59e0b', label: 'Fair' };
        } else {
            return { level: 'poor', color: '#ef4444', label: 'Poor' };
        }
    }
}

module.exports = { MarketplaceService, resolveRegistryUrl };
