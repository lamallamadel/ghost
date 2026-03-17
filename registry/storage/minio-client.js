'use strict';

const path = require('path');
const fs = require('fs');

/**
 * MinIO/S3 package storage adapter.
 *
 * Active when MINIO_ENDPOINT is set; falls back to local filesystem otherwise.
 *
 * Env vars:
 *   MINIO_ENDPOINT  - required to activate (e.g. object-storage.platform-shared.svc.cluster.local)
 *   MINIO_PORT      - default 9000
 *   MINIO_ACCESS_KEY
 *   MINIO_SECRET_KEY
 *   MINIO_BUCKET    - default ghost-extensions
 *   MINIO_USE_SSL   - default false
 */
class MinioStorageClient {
    constructor() {
        this._useMinIO = Boolean(process.env.MINIO_ENDPOINT);

        if (this._useMinIO) {
            const Minio = require('minio');
            this._client = new Minio.Client({
                endPoint: process.env.MINIO_ENDPOINT,
                port: parseInt(process.env.MINIO_PORT || '9000', 10),
                useSSL: process.env.MINIO_USE_SSL === 'true',
                accessKey: process.env.MINIO_ACCESS_KEY || '',
                secretKey: process.env.MINIO_SECRET_KEY || ''
            });
            this._bucket = process.env.MINIO_BUCKET || 'ghost-extensions';
        } else {
            this._localDir = path.join(__dirname, '..', 'packages');
        }
    }

    async ensureBucket() {
        if (!this._useMinIO) return;
        const exists = await this._client.bucketExists(this._bucket);
        if (!exists) {
            await this._client.makeBucket(this._bucket);
            console.log(`[MinIO] Created bucket: ${this._bucket}`);
        }
    }

    /**
     * Upload a package tarball buffer.
     * @param {string} id       Extension id
     * @param {string} version  Semver string
     * @param {Buffer} buffer   Tarball contents
     * @returns {string}        Object key (MinIO) or local path fragment
     */
    async uploadPackage(id, version, buffer) {
        const filename = `${id}-${version}.tar.gz`;

        if (this._useMinIO) {
            const objectKey = `${id}/${filename}`;
            await this._client.putObject(this._bucket, objectKey, buffer, buffer.length, {
                'Content-Type': 'application/gzip'
            });
            return objectKey;
        }

        // Local FS fallback
        if (!fs.existsSync(this._localDir)) {
            fs.mkdirSync(this._localDir, { recursive: true });
        }
        const localPath = path.join(this._localDir, filename);
        fs.writeFileSync(localPath, buffer);
        return `/packages/${filename}`;
    }

    /**
     * Return a presigned GET URL (MinIO) or the local static path.
     * @param {string} objectKeyOrPath  Value returned by uploadPackage
     * @returns {string|null}           URL (presigned for MinIO) or local path
     */
    async getPackageUrl(objectKeyOrPath) {
        if (this._useMinIO) {
            // 1-hour presigned URL
            return this._client.presignedGetObject(this._bucket, objectKeyOrPath, 3600);
        }
        // Local: objectKeyOrPath is already a /packages/... path
        return objectKeyOrPath;
    }

    get isMinIO() {
        return this._useMinIO;
    }
}

// Singleton
const client = new MinioStorageClient();
module.exports = client;
