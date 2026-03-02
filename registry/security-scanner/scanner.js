const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { ManifestScanner } = require('./scanners/manifest-scanner');
const { CodeScanner } = require('./scanners/code-scanner');
const { DependencyScanner } = require('./scanners/dependency-scanner');
const { PermissionScanner } = require('./scanners/permission-scanner');

class SecurityScanner {
    constructor(options = {}) {
        this.manifestScanner = new ManifestScanner();
        this.codeScanner = new CodeScanner();
        this.dependencyScanner = new DependencyScanner();
        this.permissionScanner = new PermissionScanner();
        this.severityThreshold = options.severityThreshold || 'medium';
    }

    async scanExtension(extensionPath, options = {}) {
        const results = {
            extension_path: extensionPath,
            scan_timestamp: new Date().toISOString(),
            status: 'passed',
            severity: 'none',
            issues: [],
            summary: {
                critical: 0,
                high: 0,
                medium: 0,
                low: 0,
                info: 0
            }
        };

        try {
            const manifestPath = path.join(extensionPath, 'manifest.json');
            if (!fs.existsSync(manifestPath)) {
                results.status = 'failed';
                results.issues.push({
                    type: 'manifest_missing',
                    severity: 'critical',
                    message: 'Manifest file not found'
                });
                return results;
            }

            const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

            const manifestIssues = await this.manifestScanner.scan(manifest);
            results.issues.push(...manifestIssues);

            const codeIssues = await this.codeScanner.scan(extensionPath, manifest);
            results.issues.push(...codeIssues);

            const dependencyIssues = await this.dependencyScanner.scan(extensionPath, manifest);
            results.issues.push(...dependencyIssues);

            const permissionIssues = await this.permissionScanner.scan(manifest);
            results.issues.push(...permissionIssues);

            for (const issue of results.issues) {
                const severity = issue.severity.toLowerCase();
                if (results.summary[severity] !== undefined) {
                    results.summary[severity]++;
                }
            }

            if (results.summary.critical > 0) {
                results.status = 'failed';
                results.severity = 'critical';
            } else if (results.summary.high > 0) {
                results.status = this.severityThreshold === 'high' ? 'failed' : 'warning';
                results.severity = 'high';
            } else if (results.summary.medium > 0) {
                results.status = ['high', 'medium'].includes(this.severityThreshold) ? 'warning' : 'passed';
                results.severity = 'medium';
            } else if (results.summary.low > 0) {
                results.severity = 'low';
            }

            results.passed = results.status === 'passed';
            
        } catch (error) {
            results.status = 'error';
            results.error = error.message;
        }

        return results;
    }

    async scanTarball(tarballPath, extractPath) {
        const tar = require('tar');
        
        if (fs.existsSync(extractPath)) {
            fs.rmSync(extractPath, { recursive: true, force: true });
        }
        fs.mkdirSync(extractPath, { recursive: true });

        await tar.x({
            file: tarballPath,
            cwd: extractPath
        });

        const results = await this.scanExtension(extractPath);

        const hash = crypto.createHash('sha256')
            .update(fs.readFileSync(tarballPath))
            .digest('hex');
        
        results.tarball_hash = hash;

        return results;
    }

    generateReport(scanResults, format = 'json') {
        if (format === 'json') {
            return JSON.stringify(scanResults, null, 2);
        }

        if (format === 'text') {
            let report = `Security Scan Report\n`;
            report += `====================\n\n`;
            report += `Extension: ${scanResults.extension_path}\n`;
            report += `Scan Time: ${scanResults.scan_timestamp}\n`;
            report += `Status: ${scanResults.status.toUpperCase()}\n`;
            report += `Severity: ${scanResults.severity.toUpperCase()}\n\n`;

            report += `Summary:\n`;
            report += `  Critical: ${scanResults.summary.critical}\n`;
            report += `  High: ${scanResults.summary.high}\n`;
            report += `  Medium: ${scanResults.summary.medium}\n`;
            report += `  Low: ${scanResults.summary.low}\n`;
            report += `  Info: ${scanResults.summary.info}\n\n`;

            if (scanResults.issues.length > 0) {
                report += `Issues:\n`;
                for (const issue of scanResults.issues) {
                    report += `\n  [${issue.severity.toUpperCase()}] ${issue.type}\n`;
                    report += `  ${issue.message}\n`;
                    if (issue.file) {
                        report += `  File: ${issue.file}\n`;
                    }
                    if (issue.recommendation) {
                        report += `  Recommendation: ${issue.recommendation}\n`;
                    }
                }
            }

            return report;
        }

        throw new Error(`Unsupported format: ${format}`);
    }
}

module.exports = { SecurityScanner };
