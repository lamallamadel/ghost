'use strict';

const path = require('path');
const fs = require('fs');

/**
 * RegistryDatabase — supports two backends:
 *   - PostgreSQL  when DATABASE_URL env var is set
 *   - SQLite (better-sqlite3) otherwise (fallback / local dev)
 *
 * All public methods return Promises in both modes.
 */
class RegistryDatabase {
    constructor(dbPath) {
        if (process.env.DATABASE_URL) {
            this._mode = 'pg';
            const { Pool } = require('pg');
            this.pool = new Pool({ connectionString: process.env.DATABASE_URL });
        } else {
            this._mode = 'sqlite';
            const dbDir = path.dirname(dbPath);
            if (!fs.existsSync(dbDir)) {
                fs.mkdirSync(dbDir, { recursive: true });
            }
            const Database = require('better-sqlite3');
            this.db = new Database(dbPath);
            this.db.pragma('journal_mode = WAL');
            this.db.pragma('foreign_keys = ON');
        }
    }

    async initialize() {
        if (this._mode === 'pg') {
            await this._pgInit();
        } else {
            this._sqliteInit();
        }
        console.log('Database initialized successfully');
    }

    async close() {
        if (this._mode === 'pg') {
            await this.pool.end();
        } else {
            this.db.close();
        }
    }

    // ─── PostgreSQL DDL ───────────────────────────────────────────────────────

    async _pgInit() {
        await this.pool.query(`
            CREATE TABLE IF NOT EXISTS extensions (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT,
                author TEXT NOT NULL,
                author_email TEXT,
                category TEXT NOT NULL,
                homepage TEXT,
                repository TEXT,
                license TEXT,
                verified BOOLEAN DEFAULT FALSE,
                featured BOOLEAN DEFAULT FALSE,
                total_downloads INTEGER DEFAULT 0,
                created_at BIGINT NOT NULL,
                updated_at BIGINT NOT NULL,
                UNIQUE(id)
            );

            CREATE TABLE IF NOT EXISTS extension_versions (
                id BIGSERIAL PRIMARY KEY,
                extension_id TEXT NOT NULL,
                version TEXT NOT NULL,
                published_at BIGINT NOT NULL,
                deprecated BOOLEAN DEFAULT FALSE,
                yanked BOOLEAN DEFAULT FALSE,
                downloads INTEGER DEFAULT 0,
                readme TEXT,
                changelog TEXT,
                manifest JSONB NOT NULL,
                tarball_url TEXT NOT NULL,
                tarball_hash TEXT NOT NULL,
                signature TEXT,
                security_scan_status TEXT DEFAULT 'pending',
                security_scan_result JSONB,
                security_scan_at BIGINT,
                FOREIGN KEY(extension_id) REFERENCES extensions(id) ON DELETE CASCADE,
                UNIQUE(extension_id, version)
            );

            CREATE TABLE IF NOT EXISTS extension_tags (
                extension_id TEXT NOT NULL,
                tag TEXT NOT NULL,
                FOREIGN KEY(extension_id) REFERENCES extensions(id) ON DELETE CASCADE,
                PRIMARY KEY(extension_id, tag)
            );

            CREATE TABLE IF NOT EXISTS extension_dependencies (
                version_id BIGINT NOT NULL,
                dependency_id TEXT NOT NULL,
                version_constraint TEXT NOT NULL,
                FOREIGN KEY(version_id) REFERENCES extension_versions(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS extension_compatibility (
                version_id BIGINT NOT NULL,
                ghost_cli_version TEXT,
                node_version TEXT,
                FOREIGN KEY(version_id) REFERENCES extension_versions(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS ratings (
                id BIGSERIAL PRIMARY KEY,
                extension_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5),
                created_at BIGINT NOT NULL,
                updated_at BIGINT NOT NULL,
                FOREIGN KEY(extension_id) REFERENCES extensions(id) ON DELETE CASCADE,
                UNIQUE(extension_id, user_id)
            );

            CREATE TABLE IF NOT EXISTS reviews (
                id BIGSERIAL PRIMARY KEY,
                extension_id TEXT NOT NULL,
                version TEXT,
                user_id TEXT NOT NULL,
                rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5),
                title TEXT,
                comment TEXT,
                helpful_count INTEGER DEFAULT 0,
                verified_purchase BOOLEAN DEFAULT FALSE,
                created_at BIGINT NOT NULL,
                updated_at BIGINT NOT NULL,
                FOREIGN KEY(extension_id) REFERENCES extensions(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS review_responses (
                id BIGSERIAL PRIMARY KEY,
                review_id BIGINT NOT NULL,
                user_id TEXT NOT NULL,
                response TEXT NOT NULL,
                created_at BIGINT NOT NULL,
                FOREIGN KEY(review_id) REFERENCES reviews(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS download_stats (
                id BIGSERIAL PRIMARY KEY,
                extension_id TEXT NOT NULL,
                version TEXT NOT NULL,
                timestamp BIGINT NOT NULL,
                ip_hash TEXT,
                user_agent TEXT,
                country TEXT,
                FOREIGN KEY(extension_id) REFERENCES extensions(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS security_scans (
                id BIGSERIAL PRIMARY KEY,
                extension_id TEXT NOT NULL,
                version TEXT NOT NULL,
                scan_type TEXT NOT NULL,
                status TEXT NOT NULL,
                severity TEXT,
                findings JSONB,
                started_at BIGINT NOT NULL,
                completed_at BIGINT,
                FOREIGN KEY(extension_id) REFERENCES extensions(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_extensions_category ON extensions(category);
            CREATE INDEX IF NOT EXISTS idx_extensions_verified ON extensions(verified);
            CREATE INDEX IF NOT EXISTS idx_extensions_downloads ON extensions(total_downloads DESC);
            CREATE INDEX IF NOT EXISTS idx_extension_versions_ext_id ON extension_versions(extension_id);
            CREATE INDEX IF NOT EXISTS idx_extension_tags_ext_id ON extension_tags(extension_id);
            CREATE INDEX IF NOT EXISTS idx_extension_tags_tag ON extension_tags(tag);
            CREATE INDEX IF NOT EXISTS idx_ratings_ext_id ON ratings(extension_id);
            CREATE INDEX IF NOT EXISTS idx_reviews_ext_id ON reviews(extension_id);
            CREATE INDEX IF NOT EXISTS idx_download_stats_ext_id ON download_stats(extension_id);
            CREATE INDEX IF NOT EXISTS idx_download_stats_timestamp ON download_stats(timestamp);
            CREATE INDEX IF NOT EXISTS idx_security_scans_ext_version ON security_scans(extension_id, version);
        `);
    }

    // ─── SQLite DDL ───────────────────────────────────────────────────────────

    _sqliteInit() {
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS extensions (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT,
                author TEXT NOT NULL,
                author_email TEXT,
                category TEXT NOT NULL,
                homepage TEXT,
                repository TEXT,
                license TEXT,
                verified INTEGER DEFAULT 0,
                featured INTEGER DEFAULT 0,
                total_downloads INTEGER DEFAULT 0,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                UNIQUE(id)
            );

            CREATE TABLE IF NOT EXISTS extension_versions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                extension_id TEXT NOT NULL,
                version TEXT NOT NULL,
                published_at INTEGER NOT NULL,
                deprecated INTEGER DEFAULT 0,
                yanked INTEGER DEFAULT 0,
                downloads INTEGER DEFAULT 0,
                readme TEXT,
                changelog TEXT,
                manifest TEXT NOT NULL,
                tarball_url TEXT NOT NULL,
                tarball_hash TEXT NOT NULL,
                signature TEXT,
                security_scan_status TEXT DEFAULT 'pending',
                security_scan_result TEXT,
                security_scan_at INTEGER,
                FOREIGN KEY(extension_id) REFERENCES extensions(id) ON DELETE CASCADE,
                UNIQUE(extension_id, version)
            );

            CREATE TABLE IF NOT EXISTS extension_tags (
                extension_id TEXT NOT NULL,
                tag TEXT NOT NULL,
                FOREIGN KEY(extension_id) REFERENCES extensions(id) ON DELETE CASCADE,
                PRIMARY KEY(extension_id, tag)
            );

            CREATE TABLE IF NOT EXISTS extension_dependencies (
                version_id INTEGER NOT NULL,
                dependency_id TEXT NOT NULL,
                version_constraint TEXT NOT NULL,
                FOREIGN KEY(version_id) REFERENCES extension_versions(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS extension_compatibility (
                version_id INTEGER NOT NULL,
                ghost_cli_version TEXT,
                node_version TEXT,
                FOREIGN KEY(version_id) REFERENCES extension_versions(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS ratings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                extension_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5),
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                FOREIGN KEY(extension_id) REFERENCES extensions(id) ON DELETE CASCADE,
                UNIQUE(extension_id, user_id)
            );

            CREATE TABLE IF NOT EXISTS reviews (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                extension_id TEXT NOT NULL,
                version TEXT,
                user_id TEXT NOT NULL,
                rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5),
                title TEXT,
                comment TEXT,
                helpful_count INTEGER DEFAULT 0,
                verified_purchase INTEGER DEFAULT 0,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                FOREIGN KEY(extension_id) REFERENCES extensions(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS review_responses (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                review_id INTEGER NOT NULL,
                user_id TEXT NOT NULL,
                response TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                FOREIGN KEY(review_id) REFERENCES reviews(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS download_stats (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                extension_id TEXT NOT NULL,
                version TEXT NOT NULL,
                timestamp INTEGER NOT NULL,
                ip_hash TEXT,
                user_agent TEXT,
                country TEXT,
                FOREIGN KEY(extension_id) REFERENCES extensions(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS security_scans (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                extension_id TEXT NOT NULL,
                version TEXT NOT NULL,
                scan_type TEXT NOT NULL,
                status TEXT NOT NULL,
                severity TEXT,
                findings TEXT,
                started_at INTEGER NOT NULL,
                completed_at INTEGER,
                FOREIGN KEY(extension_id) REFERENCES extensions(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_extensions_category ON extensions(category);
            CREATE INDEX IF NOT EXISTS idx_extensions_verified ON extensions(verified);
            CREATE INDEX IF NOT EXISTS idx_extensions_downloads ON extensions(total_downloads DESC);
            CREATE INDEX IF NOT EXISTS idx_extension_versions_ext_id ON extension_versions(extension_id);
            CREATE INDEX IF NOT EXISTS idx_extension_tags_ext_id ON extension_tags(extension_id);
            CREATE INDEX IF NOT EXISTS idx_extension_tags_tag ON extension_tags(tag);
            CREATE INDEX IF NOT EXISTS idx_ratings_ext_id ON ratings(extension_id);
            CREATE INDEX IF NOT EXISTS idx_reviews_ext_id ON reviews(extension_id);
            CREATE INDEX IF NOT EXISTS idx_download_stats_ext_id ON download_stats(extension_id);
            CREATE INDEX IF NOT EXISTS idx_download_stats_timestamp ON download_stats(timestamp);
            CREATE INDEX IF NOT EXISTS idx_security_scans_ext_version ON security_scans(extension_id, version);
        `);
    }

    // ─── createExtension ─────────────────────────────────────────────────────

    async createExtension(data) {
        const now = Date.now();
        if (this._mode === 'pg') {
            await this.pool.query(`
                INSERT INTO extensions (id, name, description, author, author_email, category, homepage, repository, license, verified, created_at, updated_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            `, [
                data.id, data.name, data.description || null, data.author,
                data.author_email || null, data.category, data.homepage || null,
                data.repository || null, data.license || 'MIT',
                data.verified || false, now, now
            ]);
            return { id: data.id };
        }
        const stmt = this.db.prepare(`
            INSERT INTO extensions (id, name, description, author, author_email, category, homepage, repository, license, verified, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        return stmt.run(
            data.id, data.name, data.description || null, data.author,
            data.author_email || null, data.category, data.homepage || null,
            data.repository || null, data.license || 'MIT',
            data.verified ? 1 : 0, now, now
        );
    }

    // ─── getExtension ─────────────────────────────────────────────────────────

    async getExtension(id) {
        if (this._mode === 'pg') {
            const { rows } = await this.pool.query('SELECT * FROM extensions WHERE id = $1', [id]);
            return rows[0] || null;
        }
        return this.db.prepare('SELECT * FROM extensions WHERE id = ?').get(id) || null;
    }

    // ─── searchExtensions ────────────────────────────────────────────────────

    async searchExtensions(query) {
        const { search, category, verified, sort = 'downloads', limit = 50, offset = 0 } = query;

        if (this._mode === 'pg') {
            const params = [];
            let p = 0;
            const next = (val) => { params.push(val); return `$${++p}`; };

            let sql = 'SELECT * FROM extensions WHERE 1=1';

            if (search) {
                const sp = `%${search}%`;
                sql += ` AND (name ILIKE ${next(sp)} OR description ILIKE ${next(sp)} OR id ILIKE ${next(sp)})`;
            }
            if (category) sql += ` AND category = ${next(category)}`;
            if (verified !== undefined) sql += ` AND verified = ${next(verified)}`;

            const sortMap = {
                downloads: 'total_downloads DESC',
                recent: 'updated_at DESC',
                name: 'name ASC',
                rating: 'id ASC'
            };
            sql += ` ORDER BY ${sortMap[sort] || sortMap.downloads}`;
            sql += ` LIMIT ${next(limit)} OFFSET ${next(offset)}`;

            const { rows } = await this.pool.query(sql, params);
            return rows;
        }

        let sql = 'SELECT * FROM extensions WHERE 1=1';
        const params = [];

        if (search) {
            sql += ' AND (name LIKE ? OR description LIKE ? OR id LIKE ?)';
            const sp = `%${search}%`;
            params.push(sp, sp, sp);
        }
        if (category) { sql += ' AND category = ?'; params.push(category); }
        if (verified !== undefined) { sql += ' AND verified = ?'; params.push(verified ? 1 : 0); }

        const sortMap = {
            downloads: 'total_downloads DESC',
            recent: 'updated_at DESC',
            name: 'name ASC',
            rating: 'id ASC'
        };
        sql += ` ORDER BY ${sortMap[sort] || sortMap.downloads}`;
        sql += ' LIMIT ? OFFSET ?';
        params.push(limit, offset);

        return this.db.prepare(sql).all(...params);
    }

    // ─── countExtensions ─────────────────────────────────────────────────────

    async countExtensions(query) {
        const { search, category, verified } = query;

        if (this._mode === 'pg') {
            const params = [];
            let p = 0;
            const next = (val) => { params.push(val); return `$${++p}`; };

            let sql = 'SELECT COUNT(*)::int as count FROM extensions WHERE 1=1';
            if (search) {
                const sp = `%${search}%`;
                sql += ` AND (name ILIKE ${next(sp)} OR description ILIKE ${next(sp)} OR id ILIKE ${next(sp)})`;
            }
            if (category) sql += ` AND category = ${next(category)}`;
            if (verified !== undefined) sql += ` AND verified = ${next(verified)}`;

            const { rows } = await this.pool.query(sql, params);
            return rows[0].count;
        }

        let sql = 'SELECT COUNT(*) as count FROM extensions WHERE 1=1';
        const params = [];
        if (search) {
            sql += ' AND (name LIKE ? OR description LIKE ? OR id LIKE ?)';
            const sp = `%${search}%`;
            params.push(sp, sp, sp);
        }
        if (category) { sql += ' AND category = ?'; params.push(category); }
        if (verified !== undefined) { sql += ' AND verified = ?'; params.push(verified ? 1 : 0); }

        return this.db.prepare(sql).get(...params).count;
    }

    // ─── createVersion ────────────────────────────────────────────────────────

    async createVersion(extensionId, data) {
        const now = Date.now();
        if (this._mode === 'pg') {
            const { rows } = await this.pool.query(`
                INSERT INTO extension_versions (
                    extension_id, version, published_at, manifest, tarball_url,
                    tarball_hash, signature, readme, changelog
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                RETURNING id
            `, [
                extensionId, data.version, now,
                typeof data.manifest === 'string' ? JSON.parse(data.manifest) : data.manifest,
                data.tarball_url, data.tarball_hash,
                data.signature || null, data.readme || null, data.changelog || null
            ]);
            await this.pool.query('UPDATE extensions SET updated_at = $1 WHERE id = $2', [now, extensionId]);
            return { id: rows[0].id };
        }
        const stmt = this.db.prepare(`
            INSERT INTO extension_versions (
                extension_id, version, published_at, manifest, tarball_url,
                tarball_hash, signature, readme, changelog
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        const result = stmt.run(
            extensionId, data.version, now,
            typeof data.manifest === 'string' ? data.manifest : JSON.stringify(data.manifest),
            data.tarball_url, data.tarball_hash,
            data.signature || null, data.readme || null, data.changelog || null
        );
        this.db.prepare('UPDATE extensions SET updated_at = ? WHERE id = ?').run(now, extensionId);
        return result;
    }

    // ─── getVersions ──────────────────────────────────────────────────────────

    async getVersions(extensionId) {
        if (this._mode === 'pg') {
            const { rows } = await this.pool.query(`
                SELECT * FROM extension_versions
                WHERE extension_id = $1 AND yanked = FALSE
                ORDER BY published_at DESC
            `, [extensionId]);
            return rows;
        }
        return this.db.prepare(`
            SELECT * FROM extension_versions
            WHERE extension_id = ? AND yanked = 0
            ORDER BY published_at DESC
        `).all(extensionId);
    }

    // ─── getVersion ───────────────────────────────────────────────────────────

    async getVersion(extensionId, version) {
        if (this._mode === 'pg') {
            const { rows } = await this.pool.query(`
                SELECT * FROM extension_versions WHERE extension_id = $1 AND version = $2
            `, [extensionId, version]);
            return rows[0] || null;
        }
        return this.db.prepare(`
            SELECT * FROM extension_versions WHERE extension_id = ? AND version = ?
        `).get(extensionId, version) || null;
    }

    // ─── setTags ──────────────────────────────────────────────────────────────

    async setTags(extensionId, tags) {
        if (this._mode === 'pg') {
            const client = await this.pool.connect();
            try {
                await client.query('BEGIN');
                await client.query('DELETE FROM extension_tags WHERE extension_id = $1', [extensionId]);
                for (const tag of tags) {
                    await client.query(
                        'INSERT INTO extension_tags (extension_id, tag) VALUES ($1, $2) ON CONFLICT DO NOTHING',
                        [extensionId, tag]
                    );
                }
                await client.query('COMMIT');
            } catch (e) {
                await client.query('ROLLBACK');
                throw e;
            } finally {
                client.release();
            }
            return;
        }
        const del = this.db.prepare('DELETE FROM extension_tags WHERE extension_id = ?');
        const ins = this.db.prepare('INSERT INTO extension_tags (extension_id, tag) VALUES (?, ?)');
        this.db.transaction(() => {
            del.run(extensionId);
            for (const tag of tags) ins.run(extensionId, tag);
        })();
    }

    // ─── getTags ──────────────────────────────────────────────────────────────

    async getTags(extensionId) {
        if (this._mode === 'pg') {
            const { rows } = await this.pool.query(
                'SELECT tag FROM extension_tags WHERE extension_id = $1', [extensionId]
            );
            return rows.map(r => r.tag);
        }
        return this.db.prepare('SELECT tag FROM extension_tags WHERE extension_id = ?')
            .all(extensionId)
            .map(r => r.tag);
    }

    // ─── recordDownload ───────────────────────────────────────────────────────

    async recordDownload(extensionId, version, metadata = {}) {
        const now = Date.now();
        if (this._mode === 'pg') {
            const client = await this.pool.connect();
            try {
                await client.query('BEGIN');
                await client.query(`
                    INSERT INTO download_stats (extension_id, version, timestamp, ip_hash, user_agent, country)
                    VALUES ($1, $2, $3, $4, $5, $6)
                `, [extensionId, version, now, metadata.ip_hash || null, metadata.user_agent || null, metadata.country || null]);
                await client.query(`
                    UPDATE extension_versions SET downloads = downloads + 1
                    WHERE extension_id = $1 AND version = $2
                `, [extensionId, version]);
                await client.query(
                    'UPDATE extensions SET total_downloads = total_downloads + 1 WHERE id = $1',
                    [extensionId]
                );
                await client.query('COMMIT');
            } catch (e) {
                await client.query('ROLLBACK');
                throw e;
            } finally {
                client.release();
            }
            return;
        }
        this.db.transaction(() => {
            this.db.prepare(`
                INSERT INTO download_stats (extension_id, version, timestamp, ip_hash, user_agent, country)
                VALUES (?, ?, ?, ?, ?, ?)
            `).run(extensionId, version, now, metadata.ip_hash || null, metadata.user_agent || null, metadata.country || null);
            this.db.prepare(`
                UPDATE extension_versions SET downloads = downloads + 1 WHERE extension_id = ? AND version = ?
            `).run(extensionId, version);
            this.db.prepare(
                'UPDATE extensions SET total_downloads = total_downloads + 1 WHERE id = ?'
            ).run(extensionId);
        })();
    }

    // ─── getDownloadStats ─────────────────────────────────────────────────────

    async getDownloadStats(extensionId, options = {}) {
        const { startDate, endDate } = options;

        if (this._mode === 'pg') {
            const params = [extensionId];
            let p = 1;
            let sql = `
                SELECT
                    to_char(to_timestamp(timestamp / 1000.0), 'YYYY-MM-DD') as date,
                    COUNT(*)::int as downloads
                FROM download_stats
                WHERE extension_id = $${p++}
            `;
            if (startDate) { sql += ` AND timestamp >= $${p++}`; params.push(startDate); }
            if (endDate)   { sql += ` AND timestamp <= $${p++}`; params.push(endDate); }
            sql += ' GROUP BY date ORDER BY date DESC';
            const { rows } = await this.pool.query(sql, params);
            return rows;
        }

        let sql = `
            SELECT
                strftime('%Y-%m-%d', timestamp / 1000, 'unixepoch') as date,
                COUNT(*) as downloads
            FROM download_stats
            WHERE extension_id = ?
        `;
        const params = [extensionId];
        if (startDate) { sql += ' AND timestamp >= ?'; params.push(startDate); }
        if (endDate)   { sql += ' AND timestamp <= ?'; params.push(endDate); }
        sql += ' GROUP BY date ORDER BY date DESC';
        return this.db.prepare(sql).all(...params);
    }

    // ─── createRating ─────────────────────────────────────────────────────────

    async createRating(extensionId, userId, rating) {
        const now = Date.now();
        if (this._mode === 'pg') {
            await this.pool.query(`
                INSERT INTO ratings (extension_id, user_id, rating, created_at, updated_at)
                VALUES ($1, $2, $3, $4, $5)
                ON CONFLICT (extension_id, user_id) DO UPDATE SET rating = $6, updated_at = $7
            `, [extensionId, userId, rating, now, now, rating, now]);
            return;
        }
        this.db.prepare(`
            INSERT INTO ratings (extension_id, user_id, rating, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(extension_id, user_id)
            DO UPDATE SET rating = ?, updated_at = ?
        `).run(extensionId, userId, rating, now, now, rating, now);
    }

    // ─── getRatingStats ───────────────────────────────────────────────────────

    async getRatingStats(extensionId) {
        const sql = `
            SELECT
                AVG(rating) as average,
                COUNT(*) as count,
                SUM(CASE WHEN rating = 5 THEN 1 ELSE 0 END) as five_star,
                SUM(CASE WHEN rating = 4 THEN 1 ELSE 0 END) as four_star,
                SUM(CASE WHEN rating = 3 THEN 1 ELSE 0 END) as three_star,
                SUM(CASE WHEN rating = 2 THEN 1 ELSE 0 END) as two_star,
                SUM(CASE WHEN rating = 1 THEN 1 ELSE 0 END) as one_star
            FROM ratings
            WHERE extension_id = ${this._mode === 'pg' ? '$1' : '?'}
        `;
        if (this._mode === 'pg') {
            const { rows } = await this.pool.query(sql, [extensionId]);
            const r = rows[0];
            return {
                average: r.average ? parseFloat(r.average) : null,
                count: parseInt(r.count, 10),
                five_star: parseInt(r.five_star, 10) || 0,
                four_star: parseInt(r.four_star, 10) || 0,
                three_star: parseInt(r.three_star, 10) || 0,
                two_star: parseInt(r.two_star, 10) || 0,
                one_star: parseInt(r.one_star, 10) || 0
            };
        }
        return this.db.prepare(sql).get(extensionId);
    }

    // ─── createReview ─────────────────────────────────────────────────────────

    async createReview(data) {
        const now = Date.now();
        if (this._mode === 'pg') {
            const { rows } = await this.pool.query(`
                INSERT INTO reviews (
                    extension_id, version, user_id, rating, title, comment,
                    verified_purchase, created_at, updated_at
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                RETURNING id
            `, [
                data.extension_id, data.version || null, data.user_id,
                data.rating, data.title || null, data.comment,
                data.verified_purchase || false, now, now
            ]);
            return { lastInsertRowid: rows[0].id };
        }
        return this.db.prepare(`
            INSERT INTO reviews (
                extension_id, version, user_id, rating, title, comment,
                verified_purchase, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            data.extension_id, data.version || null, data.user_id,
            data.rating, data.title || null, data.comment,
            data.verified_purchase ? 1 : 0, now, now
        );
    }

    // ─── getReviews ───────────────────────────────────────────────────────────

    async getReviews(extensionId, options = {}) {
        const { limit = 20, offset = 0, sort = 'recent' } = options;
        const sortMap = {
            recent: 'created_at DESC',
            helpful: 'helpful_count DESC',
            rating_high: 'rating DESC',
            rating_low: 'rating ASC'
        };
        const orderBy = sortMap[sort] || sortMap.recent;

        if (this._mode === 'pg') {
            const { rows } = await this.pool.query(`
                SELECT * FROM reviews
                WHERE extension_id = $1
                ORDER BY ${orderBy}
                LIMIT $2 OFFSET $3
            `, [extensionId, limit, offset]);
            return rows;
        }
        return this.db.prepare(`
            SELECT * FROM reviews
            WHERE extension_id = ?
            ORDER BY ${orderBy}
            LIMIT ? OFFSET ?
        `).all(extensionId, limit, offset);
    }

    // ─── updateReviewHelpful ──────────────────────────────────────────────────

    async updateReviewHelpful(reviewId, increment = true) {
        const delta = increment ? 1 : -1;
        if (this._mode === 'pg') {
            await this.pool.query(
                'UPDATE reviews SET helpful_count = helpful_count + $1 WHERE id = $2',
                [delta, reviewId]
            );
            return;
        }
        this.db.prepare('UPDATE reviews SET helpful_count = helpful_count + ? WHERE id = ?').run(delta, reviewId);
    }

    // ─── recordSecurityScan ───────────────────────────────────────────────────

    async recordSecurityScan(extensionId, version, scanType, findings) {
        const now = Date.now();
        if (this._mode === 'pg') {
            await this.pool.query(`
                INSERT INTO security_scans (
                    extension_id, version, scan_type, status, severity, findings, started_at, completed_at
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            `, [
                extensionId, version, scanType,
                findings.status || 'completed', findings.severity || null,
                findings, now, now
            ]);
            return;
        }
        this.db.prepare(`
            INSERT INTO security_scans (
                extension_id, version, scan_type, status, severity, findings, started_at, completed_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            extensionId, version, scanType,
            findings.status || 'completed', findings.severity || null,
            JSON.stringify(findings), now, now
        );
    }

    // ─── updateVersionScanStatus ──────────────────────────────────────────────

    async updateVersionScanStatus(extensionId, version, status, result = null) {
        const now = Date.now();
        if (this._mode === 'pg') {
            await this.pool.query(`
                UPDATE extension_versions
                SET security_scan_status = $1, security_scan_result = $2, security_scan_at = $3
                WHERE extension_id = $4 AND version = $5
            `, [status, result || null, now, extensionId, version]);
            return;
        }
        this.db.prepare(`
            UPDATE extension_versions
            SET security_scan_status = ?, security_scan_result = ?, security_scan_at = ?
            WHERE extension_id = ? AND version = ?
        `).run(status, result ? JSON.stringify(result) : null, now, extensionId, version);
    }

    // ─── getSecurityScans ─────────────────────────────────────────────────────

    async getSecurityScans(extensionId, version) {
        if (this._mode === 'pg') {
            const { rows } = await this.pool.query(`
                SELECT * FROM security_scans
                WHERE extension_id = $1 AND version = $2
                ORDER BY started_at DESC
            `, [extensionId, version]);
            return rows;
        }
        return this.db.prepare(`
            SELECT * FROM security_scans
            WHERE extension_id = ? AND version = ?
            ORDER BY started_at DESC
        `).all(extensionId, version);
    }
}

module.exports = { RegistryDatabase };
