class AdminDashboard {
    constructor(database) {
        this.db = database;
    }

    async getApprovalQueue() {
        const pending = await this.db.getPendingExtensions();
        
        const enriched = await Promise.all(pending.map(async ext => {
            const stats = await this.db.getExtensionStats(ext.extensionId);
            return {
                ...ext,
                stats
            };
        }));

        return {
            total: enriched.length,
            extensions: enriched
        };
    }

    async getStatistics() {
        const stats = {
            totalExtensions: 0,
            approvedExtensions: 0,
            pendingExtensions: 0,
            rejectedExtensions: 0,
            totalDownloads: 0,
            totalRatings: 0,
            avgRating: 0
        };

        return stats;
    }

    async getModerationLog(options = {}) {
        const limit = options.limit || 50;
        const offset = options.offset || 0;

        return {
            log: [],
            total: 0
        };
    }

    async getFlaggedExtensions() {
        return {
            flagged: [],
            total: 0
        };
    }
}

module.exports = { AdminDashboard };
