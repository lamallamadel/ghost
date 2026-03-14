const http = require('http');
const url = require('url');
const querystring = require('querystring');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Database } = require('./database');
const { SecurityScanner } = require('./security-scanner');
const { ManifestValidator } = require('./manifest-validator');
const { RateLimiter } = require('./rate-limiter');
const { AuthManager } = require('./auth-manager');
const { AdminDashboard } = require('./admin-dashboard');
const { DownloadTracker } = require('./download-tracker');
const { HealthScorer } = require('./health-scorer');
const { CodeSigningManager } = require('./code-signing');

class MarketplaceServer {
    constructor(options = {}) {
        this.port = options.port || 3000;
        this.db = new Database(options.dbPath);
        this.scanner = new SecurityScanner();
        this.validator = new ManifestValidator();
        this.rateLimiter = new RateLimiter();
        this.authManager = new AuthManager();
        this.adminDashboard = new AdminDashboard(this.db);
        this.downloadTracker = new DownloadTracker(this.db);
        this.codeSigning = new CodeSigningManager();
        this.healthScorer = new HealthScorer({ 
            db: this.db, 
            codeSigning: this.codeSigning,
            extensionDir: options.extensionDir || path.join(__dirname, '..', '..', 'extensions')
        });
        this.uploadDir = options.uploadDir || process.env.UPLOAD_DIR || path.join(__dirname, 'uploads');
        this.healthScoreCache = new Map();
        this.healthScoreCacheTTL = 3600000;
        this.startTime = Date.now();
        this._ensureUploadDir();
    }

    _ensureUploadDir() {
        if (!fs.existsSync(this.uploadDir)) {
            fs.mkdirSync(this.uploadDir, { recursive: true });
        }
    }

    start() {
        this.server = http.createServer((req, res) => {
            this._handleRequest(req, res);
        });

        this.server.listen(this.port, () => {
            console.log(`[Marketplace] Server running on port ${this.port}`);
        });
    }

    stop() {
        if (this.server) {
            this.server.close();
        }
    }

    async _handleRequest(req, res) {
        const parsedUrl = url.parse(req.url);
        const pathname = parsedUrl.pathname;
        const method = req.method;

        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

        if (method === 'OPTIONS') {
            res.writeHead(200);
            res.end();
            return;
        }

        try {
            const token = req.headers.authorization?.replace('Bearer ', '');
            
            if (pathname.startsWith('/api/admin/')) {
                if (!token || !this.authManager.verifyToken(token)?.isAdmin) {
                    res.writeHead(403);
                    res.end(JSON.stringify({ error: 'Admin access required' }));
                    return;
                }
            }

            if (!this.rateLimiter.checkLimit(this._getClientIp(req))) {
                res.writeHead(429);
                res.end(JSON.stringify({ error: 'Rate limit exceeded' }));
                return;
            }

            if ((pathname === '/' || pathname === '') && method === 'GET') {
                const pkg = require('./package.json');
                res.writeHead(200);
                res.end(JSON.stringify({
                    name: 'Ghost Extension Marketplace',
                    version: pkg.version,
                    endpoints: {
                        health:    'GET  /api/health',
                        browse:    'GET  /api/extensions',
                        publish:   'POST /api/extensions',
                        extension: 'GET  /api/extensions/:id',
                        download:  'GET  /api/extensions/:id/versions/:version',
                        rate:      'POST /api/extensions/:id/rate',
                        reviews:   'GET  /api/extensions/:id/reviews',
                        login:     'POST /api/auth/login',
                        register:  'POST /api/auth/register',
                    }
                }, null, 2));
            } else if (pathname === '/api/health' && method === 'GET') {
                await this._handleHealth(req, res);
            } else if (pathname === '/api/extensions' && method === 'POST') {
                await this._handlePublish(req, res, token);
            } else if (pathname === '/api/extensions' && method === 'GET') {
                await this._handleSearch(req, res);
            } else if (pathname.match(/^\/api\/extensions\/[^\/]+$/) && method === 'GET') {
                await this._handleGetExtension(req, res);
            } else if (pathname.match(/^\/api\/extensions\/[^\/]+\/versions\/[^\/]+$/) && method === 'GET') {
                await this._handleDownloadVersion(req, res);
            } else if (pathname.match(/^\/api\/extensions\/[^\/]+\/rate$/) && method === 'POST') {
                await this._handleRate(req, res, token);
            } else if (pathname.match(/^\/api\/extensions\/[^\/]+\/reviews$/) && method === 'GET') {
                await this._handleGetReviews(req, res);
            } else if (pathname.startsWith('/api/admin/queue') && method === 'GET') {
                await this._handleAdminQueue(req, res);
            } else if (pathname.match(/^\/api\/admin\/extensions\/[^\/]+\/approve$/) && method === 'POST') {
                await this._handleAdminApprove(req, res);
            } else if (pathname.match(/^\/api\/admin\/extensions\/[^\/]+\/reject$/) && method === 'POST') {
                await this._handleAdminReject(req, res);
            } else if (pathname === '/api/auth/login' && method === 'POST') {
                await this._handleLogin(req, res);
            } else if (pathname === '/api/auth/register' && method === 'POST') {
                await this._handleRegister(req, res);
            } else {
                res.writeHead(404);
                res.end(JSON.stringify({ error: 'Not found' }));
            }
        } catch (error) {
            console.error('[Marketplace] Error:', error);
            res.writeHead(500);
            res.end(JSON.stringify({ error: error.message }));
        }
    }

    async _handleHealth(req, res) {
        const uptime = Date.now() - this.startTime;
        const health = {
            status: 'healthy',
            timestamp: new Date().toISOString(),
            uptime: Math.floor(uptime / 1000),
            version: require('./package.json').version || '1.0.0'
        };

        res.writeHead(200);
        res.end(JSON.stringify(health));
    }

    async _handlePublish(req, res, token) {
        if (!token) {
            res.writeHead(401);
            res.end(JSON.stringify({ error: 'Authentication required' }));
            return;
        }

        const user = this.authManager.verifyToken(token);
        if (!user) {
            res.writeHead(401);
            res.end(JSON.stringify({ error: 'Invalid token' }));
            return;
        }

        const { file, manifest } = await this._parseMultipartUpload(req);

        const validationResult = this.validator.validate(manifest);
        if (!validationResult.valid) {
            res.writeHead(400);
            res.end(JSON.stringify({ error: 'Invalid manifest', details: validationResult.errors }));
            return;
        }

        const scanResult = await this.scanner.scan(file, manifest);
        if (!scanResult.safe) {
            res.writeHead(400);
            res.end(JSON.stringify({ error: 'Security scan failed', details: scanResult.issues }));
            return;
        }

        const extensionId = manifest.id;
        const version = manifest.version;
        const filePath = path.join(this.uploadDir, `${extensionId}-${version}.tar.gz`);
        fs.writeFileSync(filePath, file);

        const extension = this.db.createExtension({
            id: extensionId,
            name: manifest.name,
            description: manifest.description || '',
            author: user.username,
            authorId: user.id,
            version,
            manifest,
            filePath,
            status: 'pending'
        });

        res.writeHead(201);
        res.end(JSON.stringify({ success: true, extension }));
    }

    async _handleSearch(req, res) {
        const parsedUrl = url.parse(req.url);
        const query = querystring.parse(parsedUrl.query);

        const filters = {
            category: query.category,
            tags: query.tags ? query.tags.split(',') : undefined,
            author: query.author,
            search: query.q
        };

        const pagination = {
            page: parseInt(query.page) || 1,
            limit: parseInt(query.limit) || 20
        };

        const sort = query.sort || 'recent';

        const results = await this.db.searchExtensions(filters, pagination, sort);

        const extensionsWithHealth = await Promise.all(
            results.extensions.map(async (ext) => {
                const healthData = await this._getHealthScore(ext.id);
                return {
                    ...ext,
                    healthScore: healthData.healthScore,
                    healthBadge: this.healthScorer.getHealthBadge(healthData.healthScore)
                };
            })
        );

        results.extensions = extensionsWithHealth;

        res.writeHead(200);
        res.end(JSON.stringify(results));
    }

    async _handleGetExtension(req, res) {
        const id = req.url.split('/')[3];
        const extension = await this.db.getExtensionById(id);

        if (!extension) {
            res.writeHead(404);
            res.end(JSON.stringify({ error: 'Extension not found' }));
            return;
        }

        const versions = await this.db.getExtensionVersions(id);
        const changelog = await this.db.getExtensionChangelog(id);
        const stats = await this.db.getExtensionStats(id);
        const healthData = await this._getHealthScore(id);

        res.writeHead(200);
        res.end(JSON.stringify({
            ...extension,
            versions,
            changelog,
            stats,
            healthScore: healthData.healthScore,
            healthBadge: this.healthScorer.getHealthBadge(healthData.healthScore),
            healthBreakdown: healthData.breakdown
        }));
    }

    async _handleDownloadVersion(req, res) {
        const parts = req.url.split('/');
        const id = parts[3];
        const version = parts[5];

        const extension = this.db.getExtensionVersion(id, version);
        if (!extension) {
            res.writeHead(404);
            res.end(JSON.stringify({ error: 'Version not found' }));
            return;
        }

        if (extension.status !== 'approved') {
            res.writeHead(403);
            res.end(JSON.stringify({ error: 'Extension not approved' }));
            return;
        }

        this.downloadTracker.recordDownload(id, version);

        res.setHeader('Content-Type', 'application/gzip');
        res.setHeader('Content-Disposition', `attachment; filename="${id}-${version}.tar.gz"`);
        
        const fileStream = fs.createReadStream(extension.filePath);
        fileStream.pipe(res);
    }

    async _handleRate(req, res, token) {
        if (!token) {
            res.writeHead(401);
            res.end(JSON.stringify({ error: 'Authentication required' }));
            return;
        }

        const user = this.authManager.verifyToken(token);
        if (!user) {
            res.writeHead(401);
            res.end(JSON.stringify({ error: 'Invalid token' }));
            return;
        }

        const id = req.url.split('/')[3];
        const body = await this._parseBody(req);

        if (!body.rating || body.rating < 1 || body.rating > 5) {
            res.writeHead(400);
            res.end(JSON.stringify({ error: 'Rating must be between 1 and 5' }));
            return;
        }

        const rating = this.db.createRating({
            extensionId: id,
            userId: user.id,
            rating: body.rating,
            review: body.review || '',
            version: body.version
        });

        res.writeHead(201);
        res.end(JSON.stringify({ success: true, rating }));
    }

    async _handleGetReviews(req, res) {
        const id = req.url.split('/')[3];
        const parsedUrl = url.parse(req.url);
        const query = querystring.parse(parsedUrl.query);

        const page = parseInt(query.page) || 1;
        const limit = parseInt(query.limit) || 10;

        const reviews = this.db.getReviews(id, { page, limit });

        res.writeHead(200);
        res.end(JSON.stringify(reviews));
    }

    async _handleAdminQueue(req, res) {
        const queue = this.adminDashboard.getApprovalQueue();
        res.writeHead(200);
        res.end(JSON.stringify(queue));
    }

    async _handleAdminApprove(req, res) {
        const id = req.url.split('/')[4];
        const body = await this._parseBody(req);
        
        this.db.updateExtensionStatus(id, body.version, 'approved');
        
        res.writeHead(200);
        res.end(JSON.stringify({ success: true }));
    }

    async _handleAdminReject(req, res) {
        const id = req.url.split('/')[4];
        const body = await this._parseBody(req);
        
        this.db.updateExtensionStatus(id, body.version, 'rejected', body.reason);
        
        res.writeHead(200);
        res.end(JSON.stringify({ success: true }));
    }

    async _handleLogin(req, res) {
        const body = await this._parseBody(req);
        const result = this.authManager.login(body.username, body.password);

        if (!result.success) {
            res.writeHead(401);
            res.end(JSON.stringify({ error: 'Invalid credentials' }));
            return;
        }

        res.writeHead(200);
        res.end(JSON.stringify(result));
    }

    async _handleRegister(req, res) {
        const body = await this._parseBody(req);
        const result = this.authManager.register(body.username, body.password, body.email);

        if (!result.success) {
            res.writeHead(400);
            res.end(JSON.stringify({ error: result.error }));
            return;
        }

        res.writeHead(201);
        res.end(JSON.stringify(result));
    }

    _getClientIp(req) {
        return req.headers['x-forwarded-for']?.split(',')[0] || 
               req.connection.remoteAddress || 
               req.socket.remoteAddress;
    }

    async _parseBody(req) {
        return new Promise((resolve, reject) => {
            let body = '';
            req.on('data', chunk => {
                body += chunk.toString();
            });
            req.on('end', () => {
                try {
                    resolve(JSON.parse(body));
                } catch (error) {
                    reject(error);
                }
            });
            req.on('error', reject);
        });
    }

    async _parseMultipartUpload(req) {
        return new Promise((resolve, reject) => {
            const boundary = req.headers['content-type']?.split('boundary=')[1];
            if (!boundary) {
                reject(new Error('No boundary found'));
                return;
            }

            let buffer = Buffer.alloc(0);
            req.on('data', chunk => {
                buffer = Buffer.concat([buffer, chunk]);
            });

            req.on('end', () => {
                try {
                    const parts = this._parseMultipartData(buffer, boundary);
                    const file = parts.file;
                    const manifest = JSON.parse(parts.manifest.toString());
                    resolve({ file, manifest });
                } catch (error) {
                    reject(error);
                }
            });

            req.on('error', reject);
        });
    }

    _parseMultipartData(buffer, boundary) {
        const boundaryBuffer = Buffer.from(`--${boundary}`);
        const parts = {};
        let offset = 0;

        while (offset < buffer.length) {
            const boundaryIndex = buffer.indexOf(boundaryBuffer, offset);
            if (boundaryIndex === -1) break;

            const headerEnd = buffer.indexOf('\r\n\r\n', boundaryIndex);
            if (headerEnd === -1) break;

            const headers = buffer.slice(boundaryIndex + boundaryBuffer.length, headerEnd).toString();
            const nameMatch = headers.match(/name="([^"]+)"/);
            if (!nameMatch) {
                offset = headerEnd + 4;
                continue;
            }

            const name = nameMatch[1];
            const contentStart = headerEnd + 4;
            const nextBoundary = buffer.indexOf(boundaryBuffer, contentStart);
            const contentEnd = nextBoundary === -1 ? buffer.length : nextBoundary - 2;

            parts[name] = buffer.slice(contentStart, contentEnd);
            offset = contentEnd;
        }

        return parts;
    }

    async _getHealthScore(extensionId) {
        const cached = this.healthScoreCache.get(extensionId);
        if (cached && Date.now() - cached.timestamp < this.healthScoreCacheTTL) {
            return cached.data;
        }

        const healthData = await this.healthScorer.calculateHealthScore(extensionId);
        this.healthScoreCache.set(extensionId, {
            data: healthData,
            timestamp: Date.now()
        });

        return healthData;
    }

    clearHealthScoreCache(extensionId) {
        if (extensionId) {
            this.healthScoreCache.delete(extensionId);
        } else {
            this.healthScoreCache.clear();
        }
    }
}

module.exports = { MarketplaceServer };
