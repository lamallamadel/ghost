const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

class MarketplaceClient {
    constructor(baseUrl, token = null) {
        this.baseUrl = baseUrl;
        this.token = token;
    }

    async register(username, password, email) {
        const response = await this._request('/api/auth/register', 'POST', {
            username,
            password,
            email
        });
        
        if (response.success) {
            this.token = response.token;
        }
        
        return response;
    }

    async login(username, password) {
        const response = await this._request('/api/auth/login', 'POST', {
            username,
            password
        });
        
        if (response.success) {
            this.token = response.token;
        }
        
        return response;
    }

    async searchExtensions(options = {}) {
        const params = new URLSearchParams();
        if (options.q) params.append('q', options.q);
        if (options.category) params.append('category', options.category);
        if (options.tags) params.append('tags', options.tags.join(','));
        if (options.author) params.append('author', options.author);
        if (options.sort) params.append('sort', options.sort);
        if (options.page) params.append('page', options.page);
        if (options.limit) params.append('limit', options.limit);

        const query = params.toString();
        return await this._request(`/api/extensions${query ? '?' + query : ''}`);
    }

    async getExtension(id) {
        return await this._request(`/api/extensions/${id}`);
    }

    async publishExtension(filePath, manifestPath) {
        const file = fs.readFileSync(filePath);
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

        const boundary = '----WebKitFormBoundary' + Math.random().toString(36);
        const parts = [
            `--${boundary}`,
            'Content-Disposition: form-data; name="file"; filename="extension.tar.gz"',
            'Content-Type: application/gzip',
            '',
            file.toString('binary'),
            `--${boundary}`,
            'Content-Disposition: form-data; name="manifest"',
            'Content-Type: application/json',
            '',
            JSON.stringify(manifest),
            `--${boundary}--`
        ];

        const body = Buffer.from(parts.join('\r\n'), 'binary');

        return await this._request('/api/extensions', 'POST', body, {
            'Content-Type': `multipart/form-data; boundary=${boundary}`
        });
    }

    async rateExtension(id, rating, review = '', version = '') {
        return await this._request(`/api/extensions/${id}/rate`, 'POST', {
            rating,
            review,
            version
        });
    }

    async getReviews(id, page = 1, limit = 10) {
        return await this._request(`/api/extensions/${id}/reviews?page=${page}&limit=${limit}`);
    }

    async downloadExtension(id, version, outputPath) {
        const url = `${this.baseUrl}/api/extensions/${id}/versions/${version}`;
        const parsedUrl = new URL(url);
        const protocol = parsedUrl.protocol === 'https:' ? https : http;

        return new Promise((resolve, reject) => {
            protocol.get(url, (response) => {
                if (response.statusCode !== 200) {
                    reject(new Error(`Failed to download: ${response.statusCode}`));
                    return;
                }

                const file = fs.createWriteStream(outputPath);
                response.pipe(file);

                file.on('finish', () => {
                    file.close();
                    resolve(outputPath);
                });

                file.on('error', (err) => {
                    fs.unlink(outputPath, () => {});
                    reject(err);
                });
            }).on('error', reject);
        });
    }

    async getApprovalQueue() {
        return await this._request('/api/admin/queue');
    }

    async approveExtension(id, version) {
        return await this._request(`/api/admin/extensions/${id}/approve`, 'POST', { version });
    }

    async rejectExtension(id, version, reason) {
        return await this._request(`/api/admin/extensions/${id}/reject`, 'POST', { version, reason });
    }

    async _request(path, method = 'GET', body = null, customHeaders = {}) {
        const url = new URL(path, this.baseUrl);
        const isHttps = url.protocol === 'https:';
        const protocol = isHttps ? https : http;

        const headers = {
            'Content-Type': 'application/json',
            ...customHeaders
        };

        if (this.token) {
            headers['Authorization'] = `Bearer ${this.token}`;
        }

        let requestBody = null;
        if (body && !Buffer.isBuffer(body)) {
            requestBody = JSON.stringify(body);
            headers['Content-Length'] = Buffer.byteLength(requestBody);
        } else if (Buffer.isBuffer(body)) {
            requestBody = body;
            headers['Content-Length'] = body.length;
        }

        return new Promise((resolve, reject) => {
            const options = {
                hostname: url.hostname,
                port: url.port || (isHttps ? 443 : 80),
                path: url.pathname + url.search,
                method,
                headers
            };

            const req = protocol.request(options, (res) => {
                let data = '';

                res.on('data', chunk => {
                    data += chunk;
                });

                res.on('end', () => {
                    try {
                        const response = JSON.parse(data);
                        if (res.statusCode >= 400) {
                            reject(new Error(response.error || `HTTP ${res.statusCode}`));
                        } else {
                            resolve(response);
                        }
                    } catch (error) {
                        reject(new Error('Invalid JSON response'));
                    }
                });
            });

            req.on('error', reject);

            if (requestBody) {
                req.write(requestBody);
            }

            req.end();
        });
    }
}

module.exports = { MarketplaceClient };

if (require.main === module) {
    const client = new MarketplaceClient('http://localhost:3000');
    
    (async () => {
        try {
            console.log('Searching extensions...');
            const results = await client.searchExtensions({ q: 'git', sort: 'downloads' });
            console.log(`Found ${results.total} extensions`);
            
            if (results.extensions.length > 0) {
                const ext = results.extensions[0];
                console.log(`\nTop result: ${ext.name} by ${ext.author}`);
                console.log(`Downloads: ${ext.downloadCount}, Rating: ${ext.avgRating.toFixed(1)}`);
            }
        } catch (error) {
            console.error('Error:', error.message);
        }
    })();
}
