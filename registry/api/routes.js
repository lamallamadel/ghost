'use strict';

const Joi = require('joi');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const crypto = require('crypto');
const sanitize = require('sanitize-filename');
const storage_client = require('../storage/minio-client');

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, '..', 'uploads');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueName = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}-${sanitize(file.originalname)}`;
        cb(null, uniqueName);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/gzip' || file.mimetype === 'application/x-tar' || file.originalname.endsWith('.tar.gz')) {
            cb(null, true);
        } else {
            cb(new Error('Only .tar.gz files are allowed'));
        }
    }
});

const extensionSearchSchema = Joi.object({
    q: Joi.string().max(200).optional(),
    category: Joi.string().valid('git', 'development', 'security', 'testing', 'utilities', 'api', 'data').optional(),
    verified: Joi.boolean().optional(),
    sort: Joi.string().valid('downloads', 'recent', 'name', 'rating').default('downloads'),
    limit: Joi.number().integer().min(1).max(100).default(50),
    offset: Joi.number().integer().min(0).default(0)
});

const publishExtensionSchema = Joi.object({
    id: Joi.string().pattern(/^[a-z0-9-]+$/).required(),
    name: Joi.string().min(1).max(200).required(),
    version: Joi.string().pattern(/^\d+\.\d+\.\d+$/).required(),
    description: Joi.string().max(500).optional(),
    author: Joi.string().required(),
    author_email: Joi.string().email().optional(),
    category: Joi.string().valid('git', 'development', 'security', 'testing', 'utilities', 'api', 'data').default('utilities'),
    homepage: Joi.string().uri().optional(),
    repository: Joi.string().uri().optional(),
    license: Joi.string().default('MIT'),
    tags: Joi.array().items(Joi.string().max(50)).max(10).optional(),
    manifest: Joi.object().required(),
    readme: Joi.string().max(50000).optional(),
    changelog: Joi.string().max(10000).optional()
});

const ratingSchema = Joi.object({
    rating: Joi.number().integer().min(1).max(5).required(),
    user_id: Joi.string().required()
});

const reviewSchema = Joi.object({
    user_id: Joi.string().required(),
    rating: Joi.number().integer().min(1).max(5).required(),
    title: Joi.string().max(200).optional(),
    comment: Joi.string().max(2000).required(),
    version: Joi.string().pattern(/^\d+\.\d+\.\d+$/).optional()
});

function validateManifest(manifest) {
    const requiredFields = ['id', 'name', 'version', 'main', 'capabilities'];
    for (const field of requiredFields) {
        if (!manifest[field]) {
            throw new Error(`Manifest missing required field: ${field}`);
        }
    }
    if (!/^[a-z0-9-]+$/.test(manifest.id)) {
        throw new Error('Manifest id must be lowercase alphanumeric with hyphens only');
    }
    if (!/^\d+\.\d+\.\d+$/.test(manifest.version)) {
        throw new Error('Manifest version must follow semver (x.y.z)');
    }
    return true;
}

function requireRegistryKey(req, res, next) {
    const authHeader = req.headers.authorization || '';
    const key = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!key || key !== process.env.REGISTRY_API_KEY) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
}

function requirePublishJWT(req, res, next) {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Publish token required' });

    const secret = process.env.JWT_SECRET;
    if (!secret) return res.status(500).json({ error: 'Server misconfigured: JWT_SECRET not set' });

    try {
        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(token, secret, {
            algorithms: ['HS256'],
            issuer: 'ghost-marketplace',
            audience: 'ghost-cli'
        });
        if (decoded.action !== 'publish') {
            return res.status(403).json({ error: 'Token not scoped for publish' });
        }
        req.publisherId = decoded.userId;
        next();
    } catch {
        return res.status(401).json({ error: 'Invalid or expired publish token' });
    }
}

function setupRoutes(app, registry, publisher) {
    app.get('/api/extensions', async (req, res, next) => {
        try {
            const { error, value } = extensionSearchSchema.validate(req.query);
            if (error) {
                return res.status(400).json({ error: error.details[0].message });
            }

            const query = {
                search: value.q,
                category: value.category,
                verified: value.verified,
                sort: value.sort,
                limit: value.limit,
                offset: value.offset
            };

            const result = await registry.searchExtensions(query);
            res.json(result);
        } catch (err) {
            next(err);
        }
    });

    app.get('/api/extensions/:id', async (req, res, next) => {
        try {
            const extension = await registry.getExtension(req.params.id);
            res.json(extension);
        } catch (err) {
            if (err.message.includes('not found')) {
                return res.status(404).json({ error: err.message });
            }
            next(err);
        }
    });

    app.get('/api/extensions/:id/versions', async (req, res, next) => {
        try {
            const versions = await registry.getVersions(req.params.id);
            res.json({ versions });
        } catch (err) {
            if (err.message.includes('not found')) {
                return res.status(404).json({ error: err.message });
            }
            next(err);
        }
    });

    app.post('/api/extensions/publish', requirePublishJWT, upload.single('tarball'), async (req, res, next) => {
        let tempFilePath = req.file ? req.file.path : null;
        try {
            const data = typeof req.body.data === 'string' ? JSON.parse(req.body.data) : req.body;

            const { error, value } = publishExtensionSchema.validate(data);
            if (error) {
                if (tempFilePath) fs.unlinkSync(tempFilePath);
                return res.status(400).json({ error: error.details[0].message });
            }

            validateManifest(value.manifest);

            if (value.id !== value.manifest.id) {
                if (tempFilePath) fs.unlinkSync(tempFilePath);
                return res.status(400).json({ error: 'Extension ID must match manifest ID' });
            }

            if (value.version !== value.manifest.version) {
                if (tempFilePath) fs.unlinkSync(tempFilePath);
                return res.status(400).json({ error: 'Version must match manifest version' });
            }

            if (!req.file) {
                return res.status(400).json({ error: 'Tarball file is required' });
            }

            const fileBuffer = fs.readFileSync(tempFilePath);
            const tarballHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');

            // Upload to MinIO (or local FS fallback)
            const objectKey = await storage_client.uploadPackage(value.id, value.version, fileBuffer);

            // Remove temp upload
            fs.unlinkSync(tempFilePath);
            tempFilePath = null;

            const result = await registry.publishExtension({
                ...value,
                tarball_url: objectKey,
                tarball_hash: tarballHash
            });

            publisher.publish('ghost.registry.extension.published', {
                extensionId: value.id,
                version: value.version,
                author: value.author,
                publisherId: req.publisherId
            });

            res.status(result.created ? 201 : 200).json(result);
        } catch (err) {
            if (tempFilePath && fs.existsSync(tempFilePath)) {
                fs.unlinkSync(tempFilePath);
            }
            if (err.message.includes('already exists')) {
                return res.status(409).json({ error: err.message });
            }
            next(err);
        }
    });

    // Redirect /packages/:file to MinIO presigned URL (or serve local file if not using MinIO)
    app.get('/packages/:file', async (req, res, next) => {
        try {
            const filename = req.params.file;
            // Derive the object key used when uploading
            const parts = filename.replace(/\.tar\.gz$/, '').match(/^(.+)-(\d+\.\d+\.\d+)$/);
            if (!parts) return res.status(404).json({ error: 'Not found' });

            const id = parts[1];
            const version = parts[2];
            const objectKey = `${id}/${filename}`;

            if (storage_client.isMinIO) {
                const url = await storage_client.getPackageUrl(objectKey);
                return res.redirect(302, url);
            }

            // Local FS fallback
            const localPath = path.join(__dirname, '..', 'packages', filename);
            if (!fs.existsSync(localPath)) return res.status(404).json({ error: 'Not found' });
            res.setHeader('Content-Type', 'application/gzip');
            fs.createReadStream(localPath).pipe(res);
        } catch (err) {
            next(err);
        }
    });

    app.post('/api/extensions/:id/download/:version', async (req, res, next) => {
        try {
            const metadata = {
                ip: req.ip || req.connection.remoteAddress,
                userAgent: req.headers['user-agent'],
                country: req.headers['cf-ipcountry'] || req.headers['x-country']
            };

            await registry.recordDownload(req.params.id, req.params.version, metadata);

            publisher.publish('ghost.registry.download.tracked', {
                extensionId: req.params.id,
                version: req.params.version
            });

            res.json({ success: true });
        } catch (err) {
            if (err.message.includes('not found')) {
                return res.status(404).json({ error: err.message });
            }
            next(err);
        }
    });

    app.get('/api/extensions/:id/stats', async (req, res, next) => {
        try {
            const options = {
                startDate: req.query.start ? parseInt(req.query.start) : undefined,
                endDate: req.query.end ? parseInt(req.query.end) : undefined,
                groupBy: req.query.groupBy || 'day'
            };

            const stats = await registry.getDownloadStats(req.params.id, options);
            res.json(stats);
        } catch (err) {
            if (err.message.includes('not found')) {
                return res.status(404).json({ error: err.message });
            }
            next(err);
        }
    });

    app.post('/api/extensions/:id/ratings', async (req, res, next) => {
        try {
            const { error, value } = ratingSchema.validate(req.body);
            if (error) {
                return res.status(400).json({ error: error.details[0].message });
            }

            const result = await registry.submitRating(req.params.id, value.user_id, value.rating);
            res.json(result);
        } catch (err) {
            if (err.message.includes('not found')) {
                return res.status(404).json({ error: err.message });
            }
            next(err);
        }
    });

    app.post('/api/extensions/:id/reviews', async (req, res, next) => {
        try {
            const { error, value } = reviewSchema.validate(req.body);
            if (error) {
                return res.status(400).json({ error: error.details[0].message });
            }

            const result = await registry.submitReview({
                extension_id: req.params.id,
                ...value
            });
            res.status(201).json(result);
        } catch (err) {
            if (err.message.includes('not found')) {
                return res.status(404).json({ error: err.message });
            }
            next(err);
        }
    });

    app.get('/api/extensions/:id/reviews', async (req, res, next) => {
        try {
            const options = {
                limit: parseInt(req.query.limit) || 20,
                offset: parseInt(req.query.offset) || 0,
                sort: req.query.sort || 'recent'
            };

            const reviews = await registry.getReviews(req.params.id, options);
            res.json({ reviews });
        } catch (err) {
            if (err.message.includes('not found')) {
                return res.status(404).json({ error: err.message });
            }
            next(err);
        }
    });

    app.get('/api/extensions/:id/security/:version', async (req, res, next) => {
        try {
            const scans = await registry.getSecurityScans(req.params.id, req.params.version);
            res.json({ scans });
        } catch (err) {
            next(err);
        }
    });

    app.get('/api/categories', (req, res) => {
        res.json({
            categories: [
                { id: 'git', name: 'Git Tools', description: 'Extensions for Git operations and workflows' },
                { id: 'development', name: 'Development', description: 'Code editing, formatting, and development tools' },
                { id: 'security', name: 'Security', description: 'Security scanning and vulnerability detection' },
                { id: 'testing', name: 'Testing', description: 'Testing frameworks and coverage tools' },
                { id: 'utilities', name: 'Utilities', description: 'General purpose utilities and helpers' },
                { id: 'api', name: 'API Integration', description: 'API clients and integrations' },
                { id: 'data', name: 'Data Processing', description: 'Data transformation and processing tools' }
            ]
        });
    });
}

module.exports = { setupRoutes };
