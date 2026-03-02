const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

class RegistryDatabase {
    constructor(dbPath) {
        const dbDir = path.dirname(dbPath);
        if (!fs.existsSync(dbDir)) {
            fs.mkdirSync(dbDir, { recursive: true });
        }
        
        this.db = new Database(dbPath);
        this.db.pragma('journal_mode = WAL');
        this.db.pragma('foreign_keys = ON');
    }

    initialize() {
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

        console.log('Database initialized successfully');
    }

    close() {
        this.db.close();
    }

    createExtension(data) {
        const now = Date.now();
        const stmt = this.db.prepare(`
            INSERT INTO extensions (id, name, description, author, author_email, category, homepage, repository, license, verified, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        
        return stmt.run(
            data.id,
            data.name,
            data.description,
            data.author,
            data.author_email || null,
            data.category,
            data.homepage || null,
            data.repository || null,
            data.license || 'MIT',
            data.verified ? 1 : 0,
            now,
            now
        );
    }

    getExtension(id) {
        return this.db.prepare('SELECT * FROM extensions WHERE id = ?').get(id);
    }

    searchExtensions(query) {
        const { search, category, verified, sort = 'downloads', limit = 50, offset = 0 } = query;
        
        let sql = 'SELECT * FROM extensions WHERE 1=1';
        const params = [];

        if (search) {
            sql += ' AND (name LIKE ? OR description LIKE ? OR id LIKE ?)';
            const searchPattern = `%${search}%`;
            params.push(searchPattern, searchPattern, searchPattern);
        }

        if (category) {
            sql += ' AND category = ?';
            params.push(category);
        }

        if (verified !== undefined) {
            sql += ' AND verified = ?';
            params.push(verified ? 1 : 0);
        }

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

    countExtensions(query) {
        const { search, category, verified } = query;
        
        let sql = 'SELECT COUNT(*) as count FROM extensions WHERE 1=1';
        const params = [];

        if (search) {
            sql += ' AND (name LIKE ? OR description LIKE ? OR id LIKE ?)';
            const searchPattern = `%${search}%`;
            params.push(searchPattern, searchPattern, searchPattern);
        }

        if (category) {
            sql += ' AND category = ?';
            params.push(category);
        }

        if (verified !== undefined) {
            sql += ' AND verified = ?';
            params.push(verified ? 1 : 0);
        }

        return this.db.prepare(sql).get(...params).count;
    }

    createVersion(extensionId, data) {
        const now = Date.now();
        const stmt = this.db.prepare(`
            INSERT INTO extension_versions (
                extension_id, version, published_at, manifest, tarball_url, 
                tarball_hash, signature, readme, changelog
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        
        const result = stmt.run(
            extensionId,
            data.version,
            now,
            JSON.stringify(data.manifest),
            data.tarball_url,
            data.tarball_hash,
            data.signature || null,
            data.readme || null,
            data.changelog || null
        );

        this.db.prepare('UPDATE extensions SET updated_at = ? WHERE id = ?').run(now, extensionId);

        return result;
    }

    getVersions(extensionId) {
        return this.db.prepare(`
            SELECT * FROM extension_versions 
            WHERE extension_id = ? AND yanked = 0
            ORDER BY published_at DESC
        `).all(extensionId);
    }

    getVersion(extensionId, version) {
        return this.db.prepare(`
            SELECT * FROM extension_versions 
            WHERE extension_id = ? AND version = ?
        `).get(extensionId, version);
    }

    setTags(extensionId, tags) {
        const deleteStmt = this.db.prepare('DELETE FROM extension_tags WHERE extension_id = ?');
        const insertStmt = this.db.prepare('INSERT INTO extension_tags (extension_id, tag) VALUES (?, ?)');

        this.db.transaction(() => {
            deleteStmt.run(extensionId);
            for (const tag of tags) {
                insertStmt.run(extensionId, tag);
            }
        })();
    }

    getTags(extensionId) {
        return this.db.prepare('SELECT tag FROM extension_tags WHERE extension_id = ?')
            .all(extensionId)
            .map(row => row.tag);
    }

    recordDownload(extensionId, version, metadata = {}) {
        const now = Date.now();
        
        this.db.transaction(() => {
            this.db.prepare(`
                INSERT INTO download_stats (extension_id, version, timestamp, ip_hash, user_agent, country)
                VALUES (?, ?, ?, ?, ?, ?)
            `).run(
                extensionId,
                version,
                now,
                metadata.ip_hash || null,
                metadata.user_agent || null,
                metadata.country || null
            );

            this.db.prepare(`
                UPDATE extension_versions 
                SET downloads = downloads + 1 
                WHERE extension_id = ? AND version = ?
            `).run(extensionId, version);

            this.db.prepare(`
                UPDATE extensions 
                SET total_downloads = total_downloads + 1 
                WHERE id = ?
            `).run(extensionId);
        })();
    }

    getDownloadStats(extensionId, options = {}) {
        const { startDate, endDate, groupBy = 'day' } = options;
        
        let sql = `
            SELECT 
                strftime('%Y-%m-%d', timestamp / 1000, 'unixepoch') as date,
                COUNT(*) as downloads
            FROM download_stats
            WHERE extension_id = ?
        `;
        const params = [extensionId];

        if (startDate) {
            sql += ' AND timestamp >= ?';
            params.push(startDate);
        }

        if (endDate) {
            sql += ' AND timestamp <= ?';
            params.push(endDate);
        }

        sql += ' GROUP BY date ORDER BY date DESC';

        return this.db.prepare(sql).all(...params);
    }

    createRating(extensionId, userId, rating) {
        const now = Date.now();
        
        const stmt = this.db.prepare(`
            INSERT INTO ratings (extension_id, user_id, rating, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(extension_id, user_id) 
            DO UPDATE SET rating = ?, updated_at = ?
        `);
        
        return stmt.run(extensionId, userId, rating, now, now, rating, now);
    }

    getRatingStats(extensionId) {
        return this.db.prepare(`
            SELECT 
                AVG(rating) as average,
                COUNT(*) as count,
                SUM(CASE WHEN rating = 5 THEN 1 ELSE 0 END) as five_star,
                SUM(CASE WHEN rating = 4 THEN 1 ELSE 0 END) as four_star,
                SUM(CASE WHEN rating = 3 THEN 1 ELSE 0 END) as three_star,
                SUM(CASE WHEN rating = 2 THEN 1 ELSE 0 END) as two_star,
                SUM(CASE WHEN rating = 1 THEN 1 ELSE 0 END) as one_star
            FROM ratings
            WHERE extension_id = ?
        `).get(extensionId);
    }

    createReview(data) {
        const now = Date.now();
        
        const stmt = this.db.prepare(`
            INSERT INTO reviews (
                extension_id, version, user_id, rating, title, comment,
                verified_purchase, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        
        return stmt.run(
            data.extension_id,
            data.version || null,
            data.user_id,
            data.rating,
            data.title || null,
            data.comment,
            data.verified_purchase ? 1 : 0,
            now,
            now
        );
    }

    getReviews(extensionId, options = {}) {
        const { limit = 20, offset = 0, sort = 'recent' } = options;
        
        const sortMap = {
            recent: 'created_at DESC',
            helpful: 'helpful_count DESC',
            rating_high: 'rating DESC',
            rating_low: 'rating ASC'
        };

        return this.db.prepare(`
            SELECT * FROM reviews
            WHERE extension_id = ?
            ORDER BY ${sortMap[sort] || sortMap.recent}
            LIMIT ? OFFSET ?
        `).all(extensionId, limit, offset);
    }

    updateReviewHelpful(reviewId, increment = true) {
        const stmt = this.db.prepare(`
            UPDATE reviews 
            SET helpful_count = helpful_count + ?
            WHERE id = ?
        `);
        
        return stmt.run(increment ? 1 : -1, reviewId);
    }

    recordSecurityScan(extensionId, version, scanType, findings) {
        const now = Date.now();
        
        const stmt = this.db.prepare(`
            INSERT INTO security_scans (
                extension_id, version, scan_type, status, severity, findings, started_at, completed_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);
        
        return stmt.run(
            extensionId,
            version,
            scanType,
            findings.status || 'completed',
            findings.severity || null,
            JSON.stringify(findings),
            now,
            now
        );
    }

    updateVersionScanStatus(extensionId, version, status, result = null) {
        const now = Date.now();
        
        const stmt = this.db.prepare(`
            UPDATE extension_versions 
            SET security_scan_status = ?, security_scan_result = ?, security_scan_at = ?
            WHERE extension_id = ? AND version = ?
        `);
        
        return stmt.run(status, result ? JSON.stringify(result) : null, now, extensionId, version);
    }

    getSecurityScans(extensionId, version) {
        return this.db.prepare(`
            SELECT * FROM security_scans
            WHERE extension_id = ? AND version = ?
            ORDER BY started_at DESC
        `).all(extensionId, version);
    }
}

module.exports = { RegistryDatabase };
