const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

class Database {
    constructor(dbPath) {
        this.dbPath = dbPath || path.join(__dirname, 'registry.db');
        this._ensureDbDir();
        this.db = new sqlite3.Database(this.dbPath);
        this._init();
    }

    _ensureDbDir() {
        const dir = path.dirname(this.dbPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    }

    _init() {
        this.db.serialize(() => {
            this.db.run(`
                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    username TEXT UNIQUE NOT NULL,
                    email TEXT UNIQUE NOT NULL,
                    password_hash TEXT NOT NULL,
                    is_admin INTEGER DEFAULT 0,
                    created_at INTEGER NOT NULL,
                    updated_at INTEGER NOT NULL
                )
            `);

            this.db.run(`
                CREATE TABLE IF NOT EXISTS extensions (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    description TEXT,
                    author TEXT NOT NULL,
                    author_id INTEGER NOT NULL,
                    category TEXT,
                    tags TEXT,
                    created_at INTEGER NOT NULL,
                    updated_at INTEGER NOT NULL,
                    FOREIGN KEY (author_id) REFERENCES users(id)
                )
            `);

            this.db.run(`
                CREATE TABLE IF NOT EXISTS extension_versions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    extension_id TEXT NOT NULL,
                    version TEXT NOT NULL,
                    manifest TEXT NOT NULL,
                    file_path TEXT NOT NULL,
                    status TEXT DEFAULT 'pending',
                    rejection_reason TEXT,
                    changelog TEXT,
                    created_at INTEGER NOT NULL,
                    approved_at INTEGER,
                    FOREIGN KEY (extension_id) REFERENCES extensions(id),
                    UNIQUE(extension_id, version)
                )
            `);

            this.db.run(`
                CREATE TABLE IF NOT EXISTS ratings (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    extension_id TEXT NOT NULL,
                    user_id INTEGER NOT NULL,
                    rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5),
                    review TEXT,
                    version TEXT,
                    created_at INTEGER NOT NULL,
                    updated_at INTEGER NOT NULL,
                    FOREIGN KEY (extension_id) REFERENCES extensions(id),
                    FOREIGN KEY (user_id) REFERENCES users(id),
                    UNIQUE(extension_id, user_id)
                )
            `);

            this.db.run(`
                CREATE TABLE IF NOT EXISTS downloads (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    extension_id TEXT NOT NULL,
                    version TEXT NOT NULL,
                    ip_address TEXT,
                    user_agent TEXT,
                    downloaded_at INTEGER NOT NULL,
                    FOREIGN KEY (extension_id) REFERENCES extensions(id)
                )
            `);

            this.db.run(`
                CREATE INDEX IF NOT EXISTS idx_extensions_author ON extensions(author_id)
            `);

            this.db.run(`
                CREATE INDEX IF NOT EXISTS idx_extensions_category ON extensions(category)
            `);

            this.db.run(`
                CREATE INDEX IF NOT EXISTS idx_versions_extension ON extension_versions(extension_id)
            `);

            this.db.run(`
                CREATE INDEX IF NOT EXISTS idx_versions_status ON extension_versions(status)
            `);

            this.db.run(`
                CREATE INDEX IF NOT EXISTS idx_ratings_extension ON ratings(extension_id)
            `);

            this.db.run(`
                CREATE INDEX IF NOT EXISTS idx_downloads_extension ON downloads(extension_id)
            `);
        });
    }

    createExtension(data) {
        const now = Date.now();
        return new Promise((resolve, reject) => {
            this.db.run(
                `INSERT OR IGNORE INTO extensions (id, name, description, author, author_id, category, tags, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [data.id, data.name, data.description, data.author, data.authorId, data.category || '', 
                 data.tags ? data.tags.join(',') : '', now, now],
                function(err) {
                    if (err) {
                        reject(err);
                        return;
                    }

                    const versionData = {
                        extensionId: data.id,
                        version: data.version,
                        manifest: JSON.stringify(data.manifest),
                        filePath: data.filePath,
                        status: data.status || 'pending',
                        changelog: data.changelog || ''
                    };

                    resolve(this.createVersion(versionData));
                }.bind(this)
            );
        });
    }

    createVersion(data) {
        const now = Date.now();
        return new Promise((resolve, reject) => {
            this.db.run(
                `INSERT INTO extension_versions (extension_id, version, manifest, file_path, status, changelog, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [data.extensionId, data.version, data.manifest, data.filePath, data.status, data.changelog || '', now],
                function(err) {
                    if (err) {
                        reject(err);
                    } else {
                        resolve({ id: this.lastID, ...data });
                    }
                }
            );
        });
    }

    getExtensionById(id) {
        return new Promise((resolve, reject) => {
            this.db.get(
                `SELECT e.*, 
                        (SELECT COUNT(*) FROM downloads WHERE extension_id = e.id) as download_count,
                        (SELECT AVG(rating) FROM ratings WHERE extension_id = e.id) as avg_rating,
                        (SELECT COUNT(*) FROM ratings WHERE extension_id = e.id) as rating_count
                 FROM extensions e
                 WHERE e.id = ?`,
                [id],
                (err, row) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(row ? this._formatExtension(row) : null);
                    }
                }
            );
        });
    }

    getExtensionVersions(extensionId) {
        return new Promise((resolve, reject) => {
            this.db.all(
                `SELECT * FROM extension_versions WHERE extension_id = ? ORDER BY created_at DESC`,
                [extensionId],
                (err, rows) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(rows.map(r => this._formatVersion(r)));
                    }
                }
            );
        });
    }

    getExtensionVersion(extensionId, version) {
        return new Promise((resolve, reject) => {
            this.db.get(
                `SELECT * FROM extension_versions WHERE extension_id = ? AND version = ?`,
                [extensionId, version],
                (err, row) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(row ? this._formatVersion(row) : null);
                    }
                }
            );
        });
    }

    getExtensionChangelog(extensionId) {
        return new Promise((resolve, reject) => {
            this.db.all(
                `SELECT version, changelog, created_at FROM extension_versions 
                 WHERE extension_id = ? AND status = 'approved' 
                 ORDER BY created_at DESC`,
                [extensionId],
                (err, rows) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(rows);
                    }
                }
            );
        });
    }

    getExtensionStats(extensionId) {
        return new Promise((resolve, reject) => {
            this.db.get(
                `SELECT 
                    (SELECT COUNT(*) FROM downloads WHERE extension_id = ?) as total_downloads,
                    (SELECT COUNT(*) FROM downloads WHERE extension_id = ? AND downloaded_at > ?) as downloads_last_30d,
                    (SELECT AVG(rating) FROM ratings WHERE extension_id = ?) as avg_rating,
                    (SELECT COUNT(*) FROM ratings WHERE extension_id = ?) as total_ratings`,
                [extensionId, extensionId, Date.now() - 30 * 24 * 60 * 60 * 1000, extensionId, extensionId],
                (err, row) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(row);
                    }
                }
            );
        });
    }

    searchExtensions(filters, pagination, sort) {
        return new Promise((resolve, reject) => {
            let query = `
                SELECT e.*, 
                       (SELECT COUNT(*) FROM downloads WHERE extension_id = e.id) as download_count,
                       (SELECT AVG(rating) FROM ratings WHERE extension_id = e.id) as avg_rating,
                       (SELECT COUNT(*) FROM ratings WHERE extension_id = e.id) as rating_count
                FROM extensions e
                WHERE EXISTS (
                    SELECT 1 FROM extension_versions ev 
                    WHERE ev.extension_id = e.id AND ev.status = 'approved'
                )
            `;

            const params = [];

            if (filters.category) {
                query += ` AND e.category = ?`;
                params.push(filters.category);
            }

            if (filters.author) {
                query += ` AND e.author = ?`;
                params.push(filters.author);
            }

            if (filters.tags && filters.tags.length > 0) {
                const tagConditions = filters.tags.map(() => `e.tags LIKE ?`).join(' OR ');
                query += ` AND (${tagConditions})`;
                filters.tags.forEach(tag => params.push(`%${tag}%`));
            }

            if (filters.search) {
                query += ` AND (e.name LIKE ? OR e.description LIKE ?)`;
                params.push(`%${filters.search}%`, `%${filters.search}%`);
            }

            switch (sort) {
                case 'downloads':
                    query += ` ORDER BY download_count DESC`;
                    break;
                case 'rating':
                    query += ` ORDER BY avg_rating DESC, rating_count DESC`;
                    break;
                case 'recent':
                default:
                    query += ` ORDER BY e.updated_at DESC`;
                    break;
            }

            const limit = pagination.limit;
            const offset = (pagination.page - 1) * limit;
            query += ` LIMIT ? OFFSET ?`;
            params.push(limit, offset);

            this.db.all(query, params, (err, rows) => {
                if (err) {
                    reject(err);
                    return;
                }

                const countQuery = `SELECT COUNT(*) as total FROM extensions e WHERE EXISTS (
                    SELECT 1 FROM extension_versions ev 
                    WHERE ev.extension_id = e.id AND ev.status = 'approved'
                )`;
                
                this.db.get(countQuery, (err, countRow) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve({
                            extensions: rows.map(r => this._formatExtension(r)),
                            total: countRow.total,
                            page: pagination.page,
                            limit: pagination.limit,
                            pages: Math.ceil(countRow.total / pagination.limit)
                        });
                    }
                });
            });
        });
    }

    createRating(data) {
        const now = Date.now();
        return new Promise((resolve, reject) => {
            this.db.run(
                `INSERT OR REPLACE INTO ratings (extension_id, user_id, rating, review, version, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [data.extensionId, data.userId, data.rating, data.review, data.version, now, now],
                function(err) {
                    if (err) {
                        reject(err);
                    } else {
                        resolve({ id: this.lastID, ...data });
                    }
                }
            );
        });
    }

    getReviews(extensionId, pagination) {
        return new Promise((resolve, reject) => {
            const limit = pagination.limit;
            const offset = (pagination.page - 1) * limit;

            this.db.all(
                `SELECT r.*, u.username 
                 FROM ratings r
                 JOIN users u ON r.user_id = u.id
                 WHERE r.extension_id = ? AND r.review IS NOT NULL AND r.review != ''
                 ORDER BY r.created_at DESC
                 LIMIT ? OFFSET ?`,
                [extensionId, limit, offset],
                (err, rows) => {
                    if (err) {
                        reject(err);
                        return;
                    }

                    this.db.get(
                        `SELECT COUNT(*) as total FROM ratings WHERE extension_id = ? AND review IS NOT NULL AND review != ''`,
                        [extensionId],
                        (err, countRow) => {
                            if (err) {
                                reject(err);
                            } else {
                                resolve({
                                    reviews: rows,
                                    total: countRow.total,
                                    page: pagination.page,
                                    limit: pagination.limit,
                                    pages: Math.ceil(countRow.total / pagination.limit)
                                });
                            }
                        }
                    );
                }
            );
        });
    }

    recordDownload(extensionId, version, metadata = {}) {
        const now = Date.now();
        return new Promise((resolve, reject) => {
            this.db.run(
                `INSERT INTO downloads (extension_id, version, ip_address, user_agent, downloaded_at)
                 VALUES (?, ?, ?, ?, ?)`,
                [extensionId, version, metadata.ip || null, metadata.userAgent || null, now],
                function(err) {
                    if (err) {
                        reject(err);
                    } else {
                        resolve({ id: this.lastID });
                    }
                }
            );
        });
    }

    updateExtensionStatus(extensionId, version, status, reason = null) {
        const now = Date.now();
        return new Promise((resolve, reject) => {
            const updates = status === 'approved' 
                ? `status = ?, approved_at = ?`
                : `status = ?, rejection_reason = ?`;
            const params = status === 'approved'
                ? [status, now, extensionId, version]
                : [status, reason, extensionId, version];

            this.db.run(
                `UPDATE extension_versions SET ${updates} WHERE extension_id = ? AND version = ?`,
                params,
                function(err) {
                    if (err) {
                        reject(err);
                    } else {
                        resolve({ changes: this.changes });
                    }
                }
            );
        });
    }

    getPendingExtensions() {
        return new Promise((resolve, reject) => {
            this.db.all(
                `SELECT ev.*, e.name, e.description, e.author
                 FROM extension_versions ev
                 JOIN extensions e ON ev.extension_id = e.id
                 WHERE ev.status = 'pending'
                 ORDER BY ev.created_at ASC`,
                [],
                (err, rows) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(rows.map(r => this._formatVersion(r)));
                    }
                }
            );
        });
    }

    _formatExtension(row) {
        return {
            id: row.id,
            name: row.name,
            description: row.description,
            author: row.author,
            category: row.category,
            tags: row.tags ? row.tags.split(',') : [],
            downloadCount: row.download_count || 0,
            avgRating: row.avg_rating || 0,
            ratingCount: row.rating_count || 0,
            createdAt: row.created_at,
            updatedAt: row.updated_at
        };
    }

    _formatVersion(row) {
        return {
            id: row.id,
            extensionId: row.extension_id,
            version: row.version,
            manifest: row.manifest ? JSON.parse(row.manifest) : null,
            filePath: row.file_path,
            status: row.status,
            rejectionReason: row.rejection_reason,
            changelog: row.changelog,
            createdAt: row.created_at,
            approvedAt: row.approved_at
        };
    }

    close() {
        return new Promise((resolve, reject) => {
            this.db.close((err) => {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    }
}

module.exports = { Database };
