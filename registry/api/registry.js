'use strict';

const crypto = require('crypto');

class ExtensionRegistry {
    constructor(database) {
        this.db = database;
    }

    async searchExtensions(query) {
        const [extensions, total] = await Promise.all([
            this.db.searchExtensions(query),
            this.db.countExtensions(query)
        ]);

        const enriched = await Promise.all(extensions.map(ext => this._enrichExtension(ext)));

        return {
            extensions: enriched,
            total,
            limit: query.limit || 50,
            offset: query.offset || 0
        };
    }

    async getExtension(id) {
        const extension = await this.db.getExtension(id);
        if (!extension) {
            throw new Error(`Extension ${id} not found`);
        }
        return this._enrichExtension(extension);
    }

    async publishExtension(data) {
        const existing = await this.db.getExtension(data.id);

        if (existing) {
            const versions = await this.db.getVersions(data.id);
            if (versions.some(v => v.version === data.version)) {
                throw new Error(`Version ${data.version} already exists for ${data.id}`);
            }

            await this.db.createVersion(data.id, {
                version: data.version,
                manifest: data.manifest,
                tarball_url: data.tarball_url,
                tarball_hash: data.tarball_hash,
                signature: data.signature,
                readme: data.readme,
                changelog: data.changelog
            });

            if (data.tags && data.tags.length > 0) {
                const existingTags = await this.db.getTags(data.id);
                const mergedTags = [...new Set([...existingTags, ...data.tags])];
                await this.db.setTags(data.id, mergedTags);
            }

            return { extensionId: data.id, version: data.version, created: false };
        }

        await this.db.createExtension({
            id: data.id,
            name: data.name,
            description: data.description,
            author: data.author,
            author_email: data.author_email,
            category: data.category || 'utilities',
            homepage: data.homepage,
            repository: data.repository,
            license: data.license,
            verified: false
        });

        await this.db.createVersion(data.id, {
            version: data.version,
            manifest: data.manifest,
            tarball_url: data.tarball_url,
            tarball_hash: data.tarball_hash,
            signature: data.signature,
            readme: data.readme,
            changelog: data.changelog
        });

        if (data.tags && data.tags.length > 0) {
            await this.db.setTags(data.id, data.tags);
        }

        return { extensionId: data.id, version: data.version, created: true };
    }

    async getVersions(extensionId) {
        const extension = await this.db.getExtension(extensionId);
        if (!extension) {
            throw new Error(`Extension ${extensionId} not found`);
        }

        const versions = await this.db.getVersions(extensionId);
        return versions.map(v => ({
            version: v.version,
            published_at: new Date(v.published_at).toISOString(),
            deprecated: Boolean(v.deprecated),
            downloads: v.downloads,
            tarball_url: v.tarball_url,
            tarball_hash: v.tarball_hash,
            signature: v.signature,
            security_scan_status: v.security_scan_status,
            manifest: typeof v.manifest === 'string' ? JSON.parse(v.manifest) : v.manifest
        }));
    }

    async recordDownload(extensionId, version, metadata) {
        const [ext, ver] = await Promise.all([
            this.db.getExtension(extensionId),
            this.db.getVersion(extensionId, version)
        ]);

        if (!ext) throw new Error(`Extension ${extensionId} not found`);
        if (!ver) throw new Error(`Version ${version} not found for ${extensionId}`);

        const ipHash = metadata.ip
            ? crypto.createHash('sha256').update(metadata.ip).digest('hex').substring(0, 16)
            : null;

        await this.db.recordDownload(extensionId, version, {
            ip_hash: ipHash,
            user_agent: metadata.userAgent,
            country: metadata.country
        });

        return { success: true };
    }

    async getDownloadStats(extensionId, options) {
        const extension = await this.db.getExtension(extensionId);
        if (!extension) {
            throw new Error(`Extension ${extensionId} not found`);
        }

        const stats = await this.db.getDownloadStats(extensionId, options);
        return {
            extension_id: extensionId,
            total_downloads: extension.total_downloads,
            stats
        };
    }

    async submitRating(extensionId, userId, rating) {
        if (rating < 1 || rating > 5) throw new Error('Rating must be between 1 and 5');

        const extension = await this.db.getExtension(extensionId);
        if (!extension) throw new Error(`Extension ${extensionId} not found`);

        await this.db.createRating(extensionId, userId, rating);
        const stats = await this.db.getRatingStats(extensionId);

        return {
            success: true,
            average: Math.round((stats.average || 0) * 10) / 10,
            count: stats.count
        };
    }

    async submitReview(data) {
        if (data.rating < 1 || data.rating > 5) throw new Error('Rating must be between 1 and 5');

        const extension = await this.db.getExtension(data.extension_id);
        if (!extension) throw new Error(`Extension ${data.extension_id} not found`);

        if (data.version) {
            const version = await this.db.getVersion(data.extension_id, data.version);
            if (!version) throw new Error(`Version ${data.version} not found`);
        }

        const [result] = await Promise.all([
            this.db.createReview(data),
            this.db.createRating(data.extension_id, data.user_id, data.rating)
        ]);

        return { success: true, review_id: result.lastInsertRowid };
    }

    async getReviews(extensionId, options) {
        const extension = await this.db.getExtension(extensionId);
        if (!extension) throw new Error(`Extension ${extensionId} not found`);

        const reviews = await this.db.getReviews(extensionId, options);
        return reviews.map(r => ({
            id: r.id,
            version: r.version,
            user_id: r.user_id,
            rating: r.rating,
            title: r.title,
            comment: r.comment,
            helpful_count: r.helpful_count,
            verified_purchase: Boolean(r.verified_purchase),
            created_at: new Date(r.created_at).toISOString(),
            updated_at: new Date(r.updated_at).toISOString()
        }));
    }

    async recordSecurityScan(extensionId, version, scanType, findings) {
        const [ext, ver] = await Promise.all([
            this.db.getExtension(extensionId),
            this.db.getVersion(extensionId, version)
        ]);

        if (!ext) throw new Error(`Extension ${extensionId} not found`);
        if (!ver) throw new Error(`Version ${version} not found`);

        await this.db.recordSecurityScan(extensionId, version, scanType, findings);
        const status = findings.issues && findings.issues.length > 0 ? 'issues_found' : 'passed';
        await this.db.updateVersionScanStatus(extensionId, version, status, findings);

        return { success: true };
    }

    async getSecurityScans(extensionId, version) {
        const scans = await this.db.getSecurityScans(extensionId, version);
        return scans.map(s => ({
            id: s.id,
            scan_type: s.scan_type,
            status: s.status,
            severity: s.severity,
            findings: typeof s.findings === 'string' ? JSON.parse(s.findings) : s.findings,
            started_at: new Date(s.started_at).toISOString(),
            completed_at: s.completed_at ? new Date(s.completed_at).toISOString() : null
        }));
    }

    async _enrichExtension(extension) {
        const [versions, tags, ratingStats] = await Promise.all([
            this.db.getVersions(extension.id),
            this.db.getTags(extension.id),
            this.db.getRatingStats(extension.id)
        ]);

        const latestVersion = versions.length > 0 ? versions[0] : null;

        return {
            id: extension.id,
            name: extension.name,
            description: extension.description,
            author: extension.author,
            category: extension.category,
            homepage: extension.homepage,
            repository: extension.repository,
            license: extension.license,
            verified: Boolean(extension.verified),
            featured: Boolean(extension.featured),
            tags,
            ratings: {
                average: ratingStats.average ? Math.round(ratingStats.average * 10) / 10 : 0,
                count: ratingStats.count || 0,
                distribution: {
                    5: ratingStats.five_star || 0,
                    4: ratingStats.four_star || 0,
                    3: ratingStats.three_star || 0,
                    2: ratingStats.two_star || 0,
                    1: ratingStats.one_star || 0
                }
            },
            downloads: extension.total_downloads,
            latest_version: latestVersion ? latestVersion.version : null,
            created_at: new Date(extension.created_at).toISOString(),
            updated_at: new Date(extension.updated_at).toISOString(),
            versions: versions.map(v => ({
                version: v.version,
                published_at: new Date(v.published_at).toISOString(),
                downloads: v.downloads,
                security_scan_status: v.security_scan_status
            }))
        };
    }
}

module.exports = { ExtensionRegistry };
