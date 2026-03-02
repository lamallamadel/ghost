const Joi = require('joi');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const tar = require('tar');
const crypto = require('crypto');
const sanitize = require('sanitize-filename');

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

function setupRoutes(app, registry) {
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

            const result = registry.searchExtensions(query);
            res.json(result);
        } catch (err) {
            next(err);
        }
    });

    app.get('/api/extensions/:id', async (req, res, next) => {
        try {
            const extension = registry.getExtension(req.params.id);
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
            const versions = registry.getVersions(req.params.id);
            res.json({ versions });
        } catch (err) {
            if (err.message.includes('not found')) {
                return res.status(404).json({ error: err.message });
            }
            next(err);
        }
    });

    app.post('/api/extensions/publish', upload.single('tarball'), async (req, res, next) => {
        try {
            const data = typeof req.body.data === 'string' ? JSON.parse(req.body.data) : req.body;
            
            const { error, value } = publishExtensionSchema.validate(data);
            if (error) {
                if (req.file) fs.unlinkSync(req.file.path);
                return res.status(400).json({ error: error.details[0].message });
            }

            validateManifest(value.manifest);

            if (value.id !== value.manifest.id) {
                if (req.file) fs.unlinkSync(req.file.path);
                return res.status(400).json({ error: 'Extension ID must match manifest ID' });
            }

            if (value.version !== value.manifest.version) {
                if (req.file) fs.unlinkSync(req.file.path);
                return res.status(400).json({ error: 'Version must match manifest version' });
            }

            let tarballUrl = null;
            let tarballHash = null;

            if (req.file) {
                const packagesDir = path.join(__dirname, '..', 'packages');
                if (!fs.existsSync(packagesDir)) {
                    fs.mkdirSync(packagesDir, { recursive: true });
                }

                const packageName = `${value.id}-${value.version}.tar.gz`;
                const packagePath = path.join(packagesDir, packageName);
                
                fs.renameSync(req.file.path, packagePath);

                const fileBuffer = fs.readFileSync(packagePath);
                tarballHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
                tarballUrl = `/packages/${packageName}`;
            } else {
                if (req.file) fs.unlinkSync(req.file.path);
                return res.status(400).json({ error: 'Tarball file is required' });
            }

            const result = registry.publishExtension({
                ...value,
                tarball_url: tarballUrl,
                tarball_hash: tarballHash
            });

            res.status(result.created ? 201 : 200).json(result);
        } catch (err) {
            if (req.file && fs.existsSync(req.file.path)) {
                fs.unlinkSync(req.file.path);
            }
            
            if (err.message.includes('already exists')) {
                return res.status(409).json({ error: err.message });
            }
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

            registry.recordDownload(req.params.id, req.params.version, metadata);
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

            const stats = registry.getDownloadStats(req.params.id, options);
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

            const result = registry.submitRating(req.params.id, value.user_id, value.rating);
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

            const result = registry.submitReview({
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

            const reviews = registry.getReviews(req.params.id, options);
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
            const scans = registry.getSecurityScans(req.params.id, req.params.version);
            res.json({ scans });
        } catch (err) {
            next(err);
        }
    });

    app.use('/packages', require('express').static(path.join(__dirname, '..', 'packages')));

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
