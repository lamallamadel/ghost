const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const REGISTRY_URL = process.env.GHOST_REGISTRY_URL || 'https://registry.ghost-cli.dev/api';

class RegistryClient {
    constructor(options = {}) {
        this.registryUrl = options.registryUrl || REGISTRY_URL;
        this.cacheDir = path.join(os.homedir(), '.ghost', 'registry-cache');
        this.cacheTTL = options.cacheTTL || 3600000;
        this._ensureCacheDir();
    }

    _ensureCacheDir() {
        if (!fs.existsSync(this.cacheDir)) {
            fs.mkdirSync(this.cacheDir, { recursive: true });
        }
    }

    async search(query = {}) {
        const params = new URLSearchParams();
        if (query.search) params.append('q', query.search);
        if (query.category) params.append('category', query.category);
        if (query.verified !== undefined) params.append('verified', query.verified);
        if (query.sort) params.append('sort', query.sort);
        if (query.limit) params.append('limit', query.limit);
        if (query.offset) params.append('offset', query.offset);

        const url = `/extensions?${params.toString()}`;
        return this._request('GET', url);
    }

    async getExtension(id) {
        const cached = this._getCache(`extension-${id}`);
        if (cached) return cached;

        const data = await this._request('GET', `/extensions/${id}`);
        this._setCache(`extension-${id}`, data);
        return data;
    }

    async getVersions(id) {
        return this._request('GET', `/extensions/${id}/versions`);
    }

    async downloadExtension(id, version, targetDir) {
        const extension = await this.getExtension(id);
        const versionData = extension.versions.find(v => v.version === version);
        
        if (!versionData) {
            throw new Error(`Version ${version} not found for ${id}`);
        }

        const downloadUrl = this.registryUrl.replace('/api', '') + versionData.tarball_url;
        const tarballData = await this._downloadFile(downloadUrl);

        if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
        }

        const tarballPath = path.join(targetDir, `${id}-${version}.tar.gz`);
        fs.writeFileSync(tarballPath, tarballData);

        await this.recordDownload(id, version);

        return {
            tarballPath,
            hash: versionData.tarball_hash,
            manifest: versionData.manifest
        };
    }

    async recordDownload(id, version) {
        try {
            await this._request('POST', `/extensions/${id}/download/${version}`);
        } catch (error) {
            console.warn(`[Registry] Failed to record download: ${error.message}`);
        }
    }

    async submitRating(id, userId, rating) {
        if (rating < 1 || rating > 5) {
            throw new Error('Rating must be between 1 and 5');
        }

        return this._request('POST', `/extensions/${id}/ratings`, {
            user_id: userId,
            rating
        });
    }

    async submitReview(id, reviewData) {
        if (reviewData.rating < 1 || reviewData.rating > 5) {
            throw new Error('Rating must be between 1 and 5');
        }

        return this._request('POST', `/extensions/${id}/reviews`, reviewData);
    }

    async getReviews(id, options = {}) {
        const params = new URLSearchParams();
        if (options.limit) params.append('limit', options.limit);
        if (options.offset) params.append('offset', options.offset);
        if (options.sort) params.append('sort', options.sort);

        const url = `/extensions/${id}/reviews?${params.toString()}`;
        return this._request('GET', url);
    }

    async getSecurityScans(id, version) {
        return this._request('GET', `/extensions/${id}/security/${version}`);
    }

    async getCategories() {
        const cached = this._getCache('categories');
        if (cached) return cached;

        const data = await this._request('GET', '/categories');
        this._setCache('categories', data, 86400000);
        return data;
    }

    async getStats(id, options = {}) {
        const params = new URLSearchParams();
        if (options.start) params.append('start', options.start);
        if (options.end) params.append('end', options.end);
        if (options.groupBy) params.append('groupBy', options.groupBy);

        const url = `/extensions/${id}/stats?${params.toString()}`;
        return this._request('GET', url);
    }

    _request(method, path, body = null) {
        return new Promise((resolve, reject) => {
            const url = new URL(this.registryUrl + path);
            const protocol = url.protocol === 'https:' ? https : http;

            const options = {
                hostname: url.hostname,
                port: url.port,
                path: url.pathname + url.search,
                method,
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': `ghost-cli/${require('../package.json').version}`
                }
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
                        const error = new Error(`HTTP ${res.statusCode}: ${responseBody}`);
                        error.statusCode = res.statusCode;
                        reject(error);
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

    _downloadFile(url) {
        return new Promise((resolve, reject) => {
            const parsedUrl = new URL(url);
            const protocol = parsedUrl.protocol === 'https:' ? https : http;

            protocol.get(url, (res) => {
                if (res.statusCode === 302 || res.statusCode === 301) {
                    return this._downloadFile(res.headers.location).then(resolve).catch(reject);
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

    _getCache(key) {
        const cachePath = path.join(this.cacheDir, `${this._hash(key)}.json`);

        if (!fs.existsSync(cachePath)) return null;

        try {
            const cached = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
            if (Date.now() - cached.timestamp > (cached.ttl || this.cacheTTL)) {
                fs.unlinkSync(cachePath);
                return null;
            }
            return cached.data;
        } catch {
            return null;
        }
    }

    _setCache(key, data, ttl = null) {
        const cachePath = path.join(this.cacheDir, `${this._hash(key)}.json`);

        try {
            fs.writeFileSync(cachePath, JSON.stringify({
                timestamp: Date.now(),
                ttl: ttl || this.cacheTTL,
                data
            }));
        } catch (error) {
        }
    }

    _hash(str) {
        const crypto = require('crypto');
        return crypto.createHash('sha256').update(str).digest('hex').substring(0, 16);
    }

    clearCache() {
        if (fs.existsSync(this.cacheDir)) {
            const files = fs.readdirSync(this.cacheDir);
            for (const file of files) {
                fs.unlinkSync(path.join(this.cacheDir, file));
            }
        }
    }
}

module.exports = { RegistryClient };
