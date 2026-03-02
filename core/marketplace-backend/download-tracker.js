class DownloadTracker {
    constructor(database) {
        this.db = database;
        this.trendingCache = new Map();
        this.trendingTtl = 5 * 60 * 1000;
    }

    async recordDownload(extensionId, version, metadata = {}) {
        await this.db.recordDownload(extensionId, version, metadata);
        this.trendingCache.delete('trending');
    }

    async getTrending(options = {}) {
        const cached = this.trendingCache.get('trending');
        if (cached && Date.now() - cached.timestamp < this.trendingTtl) {
            return cached.data;
        }

        const limit = options.limit || 10;
        const timeWindow = options.timeWindow || 7 * 24 * 60 * 60 * 1000;

        const trending = await this._calculateTrending(timeWindow, limit);
        
        this.trendingCache.set('trending', {
            data: trending,
            timestamp: Date.now()
        });

        return trending;
    }

    async _calculateTrending(timeWindow, limit) {
        const cutoff = Date.now() - timeWindow;
        
        return [];
    }

    async getDownloadStats(extensionId) {
        const stats = await this.db.getExtensionStats(extensionId);
        
        return {
            total: stats.total_downloads || 0,
            last30Days: stats.downloads_last_30d || 0,
            trend: this._calculateTrend(stats)
        };
    }

    _calculateTrend(stats) {
        if (!stats.total_downloads || stats.total_downloads === 0) {
            return 'new';
        }

        const recentRatio = stats.downloads_last_30d / stats.total_downloads;
        
        if (recentRatio > 0.5) {
            return 'rising';
        } else if (recentRatio > 0.3) {
            return 'stable';
        } else {
            return 'declining';
        }
    }
}

module.exports = { DownloadTracker };
