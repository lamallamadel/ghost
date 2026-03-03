const crypto = require('crypto');
const https = require('https');
const http = require('http');
const { URL } = require('url');

class S3StorageAdapter {
    constructor(options = {}) {
        this.endpoint = options.endpoint || process.env.S3_ENDPOINT || 's3.amazonaws.com';
        this.accessKey = options.accessKey || process.env.S3_ACCESS_KEY;
        this.secretKey = options.secretKey || process.env.S3_SECRET_KEY;
        this.bucket = options.bucket || process.env.S3_BUCKET || 'ghost-extensions';
        this.region = options.region || process.env.S3_REGION || 'us-east-1';
        this.useSSL = options.useSSL !== undefined ? options.useSSL : (process.env.S3_USE_SSL !== 'false');
        
        if (!this.accessKey || !this.secretKey) {
            throw new Error('S3 credentials (accessKey and secretKey) are required');
        }
    }

    async uploadExtension(extensionId, version, fileBuffer) {
        const key = `extensions/${extensionId}/${version}/${extensionId}-${version}.tar.gz`;
        const contentType = 'application/gzip';
        
        const result = await this._putObject(key, fileBuffer, contentType);
        
        return {
            success: result.success,
            key,
            bucket: this.bucket,
            url: `${this.useSSL ? 'https' : 'http'}://${this.endpoint}/${this.bucket}/${key}`,
            size: fileBuffer.length,
            etag: result.etag
        };
    }

    async deleteExtension(extensionId, version) {
        const key = `extensions/${extensionId}/${version}/${extensionId}-${version}.tar.gz`;
        return await this._deleteObject(key);
    }

    async getExtensionMetadata(extensionId, version) {
        const key = `extensions/${extensionId}/${version}/${extensionId}-${version}.tar.gz`;
        return await this._headObject(key);
    }

    generatePresignedUrl(extensionId, version, expiresInSeconds = 3600) {
        const key = `extensions/${extensionId}/${version}/${extensionId}-${version}.tar.gz`;
        return this._generatePresignedGetUrl(key, expiresInSeconds);
    }

    async listExtensionVersions(extensionId) {
        const prefix = `extensions/${extensionId}/`;
        const result = await this._listObjects(prefix);
        
        if (!result.success) {
            return { success: false, versions: [] };
        }
        
        const versions = result.objects
            .filter(obj => obj.key.endsWith('.tar.gz'))
            .map(obj => {
                const parts = obj.key.split('/');
                return {
                    version: parts[2],
                    key: obj.key,
                    size: obj.size,
                    lastModified: obj.lastModified
                };
            });
        
        return { success: true, versions };
    }

    async _putObject(key, data, contentType = 'application/octet-stream') {
        const url = this._buildUrl('PUT', key);
        const headers = this._signRequest('PUT', key, {
            'Content-Type': contentType,
            'Content-Length': data.length
        });

        return new Promise((resolve, reject) => {
            const req = (this.useSSL ? https : http).request(url, {
                method: 'PUT',
                headers
            }, (res) => {
                let responseData = '';
                res.on('data', chunk => responseData += chunk);
                res.on('end', () => {
                    if (res.statusCode === 200) {
                        resolve({
                            success: true,
                            etag: res.headers.etag
                        });
                    } else {
                        reject(new Error(`S3 PUT failed: ${res.statusCode} ${responseData}`));
                    }
                });
            });

            req.on('error', reject);
            req.write(data);
            req.end();
        });
    }

    async _deleteObject(key) {
        const url = this._buildUrl('DELETE', key);
        const headers = this._signRequest('DELETE', key, {});

        return new Promise((resolve, reject) => {
            const req = (this.useSSL ? https : http).request(url, {
                method: 'DELETE',
                headers
            }, (res) => {
                let responseData = '';
                res.on('data', chunk => responseData += chunk);
                res.on('end', () => {
                    if (res.statusCode === 204 || res.statusCode === 200) {
                        resolve({ success: true });
                    } else {
                        reject(new Error(`S3 DELETE failed: ${res.statusCode} ${responseData}`));
                    }
                });
            });

            req.on('error', reject);
            req.end();
        });
    }

    async _headObject(key) {
        const url = this._buildUrl('HEAD', key);
        const headers = this._signRequest('HEAD', key, {});

        return new Promise((resolve, reject) => {
            const req = (this.useSSL ? https : http).request(url, {
                method: 'HEAD',
                headers
            }, (res) => {
                if (res.statusCode === 200) {
                    resolve({
                        success: true,
                        contentLength: parseInt(res.headers['content-length']),
                        contentType: res.headers['content-type'],
                        lastModified: res.headers['last-modified'],
                        etag: res.headers.etag
                    });
                } else {
                    reject(new Error(`S3 HEAD failed: ${res.statusCode}`));
                }
            });

            req.on('error', reject);
            req.end();
        });
    }

    async _listObjects(prefix, maxKeys = 1000) {
        const url = this._buildUrl('GET', '', { prefix, 'max-keys': maxKeys });
        const headers = this._signRequest('GET', '', { prefix, 'max-keys': maxKeys });

        return new Promise((resolve, reject) => {
            const req = (this.useSSL ? https : http).request(url, {
                method: 'GET',
                headers
            }, (res) => {
                let responseData = '';
                res.on('data', chunk => responseData += chunk);
                res.on('end', () => {
                    if (res.statusCode === 200) {
                        const objects = this._parseListObjectsResponse(responseData);
                        resolve({ success: true, objects });
                    } else {
                        reject(new Error(`S3 LIST failed: ${res.statusCode} ${responseData}`));
                    }
                });
            });

            req.on('error', reject);
            req.end();
        });
    }

    _buildUrl(method, key, queryParams = {}) {
        const protocol = this.useSSL ? 'https' : 'http';
        let url = `${protocol}://${this.endpoint}/${this.bucket}`;
        
        if (key) {
            url += `/${encodeURIComponent(key).replace(/%2F/g, '/')}`;
        }
        
        const queryString = Object.keys(queryParams)
            .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(queryParams[k])}`)
            .join('&');
        
        if (queryString) {
            url += `?${queryString}`;
        }
        
        return url;
    }

    _signRequest(method, key, additionalHeaders = {}, queryParams = {}) {
        const timestamp = new Date().toUTCString();
        const contentMD5 = '';
        const contentType = additionalHeaders['Content-Type'] || '';
        
        const canonicalizedAmzHeaders = '';
        const canonicalizedResource = `/${this.bucket}/${key}`;
        
        const stringToSign = [
            method,
            contentMD5,
            contentType,
            timestamp,
            canonicalizedAmzHeaders + canonicalizedResource
        ].join('\n');
        
        const signature = crypto
            .createHmac('sha1', this.secretKey)
            .update(stringToSign)
            .digest('base64');
        
        return {
            'Host': this.endpoint,
            'Date': timestamp,
            'Authorization': `AWS ${this.accessKey}:${signature}`,
            ...additionalHeaders
        };
    }

    _generatePresignedGetUrl(key, expiresIn = 3600) {
        const expires = Math.floor(Date.now() / 1000) + expiresIn;
        const stringToSign = `GET\n\n\n${expires}\n/${this.bucket}/${key}`;
        
        const signature = crypto
            .createHmac('sha1', this.secretKey)
            .update(stringToSign)
            .digest('base64');
        
        const encodedSignature = encodeURIComponent(signature);
        const protocol = this.useSSL ? 'https' : 'http';
        
        return `${protocol}://${this.endpoint}/${this.bucket}/${key}?AWSAccessKeyId=${this.accessKey}&Expires=${expires}&Signature=${encodedSignature}`;
    }

    _parseListObjectsResponse(xml) {
        const objects = [];
        const keyRegex = /<Key>(.*?)<\/Key>/g;
        const sizeRegex = /<Size>(.*?)<\/Size>/g;
        const lastModifiedRegex = /<LastModified>(.*?)<\/LastModified>/g;
        
        const keys = [...xml.matchAll(keyRegex)].map(m => m[1]);
        const sizes = [...xml.matchAll(sizeRegex)].map(m => parseInt(m[1]));
        const lastModifieds = [...xml.matchAll(lastModifiedRegex)].map(m => m[1]);
        
        for (let i = 0; i < keys.length; i++) {
            objects.push({
                key: keys[i],
                size: sizes[i],
                lastModified: lastModifieds[i]
            });
        }
        
        return objects;
    }
}

class LocalStorageAdapter {
    constructor(options = {}) {
        const path = require('path');
        const fs = require('fs');
        this.baseDir = options.baseDir || path.join(process.cwd(), 'uploads');
        
        if (!fs.existsSync(this.baseDir)) {
            fs.mkdirSync(this.baseDir, { recursive: true });
        }
    }

    async uploadExtension(extensionId, version, fileBuffer) {
        const path = require('path');
        const fs = require('fs');
        
        const extensionDir = path.join(this.baseDir, extensionId, version);
        if (!fs.existsSync(extensionDir)) {
            fs.mkdirSync(extensionDir, { recursive: true });
        }
        
        const filename = `${extensionId}-${version}.tar.gz`;
        const filePath = path.join(extensionDir, filename);
        
        fs.writeFileSync(filePath, fileBuffer);
        
        return {
            success: true,
            key: path.relative(this.baseDir, filePath),
            path: filePath,
            size: fileBuffer.length
        };
    }

    async deleteExtension(extensionId, version) {
        const path = require('path');
        const fs = require('fs');
        
        const extensionDir = path.join(this.baseDir, extensionId, version);
        if (fs.existsSync(extensionDir)) {
            fs.rmSync(extensionDir, { recursive: true });
        }
        
        return { success: true };
    }

    async getExtensionMetadata(extensionId, version) {
        const path = require('path');
        const fs = require('fs');
        
        const filename = `${extensionId}-${version}.tar.gz`;
        const filePath = path.join(this.baseDir, extensionId, version, filename);
        
        if (!fs.existsSync(filePath)) {
            throw new Error('Extension not found');
        }
        
        const stats = fs.statSync(filePath);
        
        return {
            success: true,
            contentLength: stats.size,
            lastModified: stats.mtime
        };
    }

    generatePresignedUrl(extensionId, version, expiresInSeconds = 3600) {
        return `/api/extensions/${extensionId}/versions/${version}/download`;
    }

    async listExtensionVersions(extensionId) {
        const path = require('path');
        const fs = require('fs');
        
        const extensionDir = path.join(this.baseDir, extensionId);
        
        if (!fs.existsSync(extensionDir)) {
            return { success: true, versions: [] };
        }
        
        const versions = fs.readdirSync(extensionDir, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory())
            .map(dirent => {
                const versionDir = path.join(extensionDir, dirent.name);
                const filename = `${extensionId}-${dirent.name}.tar.gz`;
                const filePath = path.join(versionDir, filename);
                
                if (fs.existsSync(filePath)) {
                    const stats = fs.statSync(filePath);
                    return {
                        version: dirent.name,
                        path: filePath,
                        size: stats.size,
                        lastModified: stats.mtime
                    };
                }
                return null;
            })
            .filter(v => v !== null);
        
        return { success: true, versions };
    }
}

function createStorageAdapter(options = {}) {
    const storageType = options.type || process.env.STORAGE_TYPE || 's3';
    
    if (storageType === 's3') {
        return new S3StorageAdapter(options);
    } else if (storageType === 'local') {
        return new LocalStorageAdapter(options);
    } else {
        throw new Error(`Unknown storage type: ${storageType}`);
    }
}

module.exports = {
    S3StorageAdapter,
    LocalStorageAdapter,
    createStorageAdapter
};
