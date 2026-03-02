const { SecurityScanner } = require('../security-scanner/scanner');
const path = require('path');
const fs = require('fs');

class WebhookHandler {
    constructor(registry) {
        this.registry = registry;
        this.scanner = new SecurityScanner({ severityThreshold: 'high' });
    }

    async handlePublishEvent(extensionId, version) {
        console.log(`[Webhook] Extension published: ${extensionId}@${version}`);
        
        try {
            const versionData = this.registry.db.getVersion(extensionId, version);
            if (!versionData) {
                console.error(`[Webhook] Version not found: ${extensionId}@${version}`);
                return;
            }

            const tarballPath = path.join(__dirname, '..', 'packages', path.basename(versionData.tarball_url));
            
            if (!fs.existsSync(tarballPath)) {
                console.error(`[Webhook] Tarball not found: ${tarballPath}`);
                return;
            }

            console.log(`[Webhook] Starting security scan for ${extensionId}@${version}`);
            
            const extractPath = path.join(__dirname, '..', 'temp', `scan-${Date.now()}`);
            const scanResults = await this.scanner.scanTarball(tarballPath, extractPath);

            if (fs.existsSync(extractPath)) {
                fs.rmSync(extractPath, { recursive: true, force: true });
            }

            this.registry.recordSecurityScan(extensionId, version, 'automated', scanResults);

            console.log(`[Webhook] Security scan completed: ${scanResults.status} (${scanResults.summary.critical} critical, ${scanResults.summary.high} high)`);

            if (scanResults.status === 'failed' && scanResults.summary.critical > 0) {
                console.warn(`[Webhook] CRITICAL ISSUES FOUND in ${extensionId}@${version}`);
            }

        } catch (error) {
            console.error(`[Webhook] Error processing publish event:`, error);
        }
    }

    async handleDownloadMilestone(extensionId, milestone) {
        console.log(`[Webhook] Download milestone reached: ${extensionId} - ${milestone} downloads`);
    }

    async handleReviewSubmitted(extensionId, reviewId) {
        console.log(`[Webhook] New review submitted for ${extensionId}: review #${reviewId}`);
    }
}

module.exports = { WebhookHandler };
