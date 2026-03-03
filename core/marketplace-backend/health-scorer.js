const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

class HealthScorer {
    constructor(options = {}) {
        this.db = options.db;
        this.codeSigning = options.codeSigning;
        this.extensionDir = options.extensionDir || path.join(process.cwd(), 'extensions');
    }

    async calculateHealthScore(extensionId) {
        const scores = {
            codeQuality: await this._calculateCodeQualityScore(extensionId),
            security: await this._calculateSecurityScore(extensionId),
            userRatings: await this._calculateUserRatingsScore(extensionId),
            updateRecency: await this._calculateUpdateRecencyScore(extensionId),
            maintainerResponsiveness: await this._calculateMaintainerScore(extensionId)
        };

        const weights = {
            codeQuality: 0.25,
            security: 0.30,
            userRatings: 0.20,
            updateRecency: 0.15,
            maintainerResponsiveness: 0.10
        };

        const totalScore = Object.entries(scores).reduce((sum, [key, value]) => {
            return sum + (value * weights[key]);
        }, 0);

        return {
            healthScore: Math.round(totalScore),
            breakdown: scores,
            lastCalculated: Date.now()
        };
    }

    async _calculateCodeQualityScore(extensionId) {
        let score = 0;
        const extensionPath = path.join(this.extensionDir, extensionId);
        
        if (!fs.existsSync(extensionPath)) {
            return 0;
        }

        const testCoverage = await this._parseTestCoverage(extensionPath);
        score += testCoverage * 0.40;

        const hasDocumentation = this._checkDocumentation(extensionPath);
        score += hasDocumentation * 0.30;

        const dependencyFreshness = await this._checkDependencyFreshness(extensionPath);
        score += dependencyFreshness * 0.30;

        return Math.min(100, Math.round(score));
    }

    async _parseTestCoverage(extensionPath) {
        try {
            const readmePath = path.join(extensionPath, 'README.md');
            if (!fs.existsSync(readmePath)) {
                return 0;
            }

            const readmeContent = fs.readFileSync(readmePath, 'utf8');
            
            const badgePatterns = [
                /!\[Coverage\].*?(\d+)%/i,
                /coverage[:\s]+(\d+)%/i,
                /codecov\.io.*?\/(\d+)/i,
                /coveralls\.io.*?(\d+)%/i,
                /!\[.*coverage.*\].*?(\d+)%/i
            ];

            for (const pattern of badgePatterns) {
                const match = readmeContent.match(pattern);
                if (match && match[1]) {
                    const coverage = parseInt(match[1], 10);
                    return Math.min(100, coverage);
                }
            }

            const coveragePath = path.join(extensionPath, 'coverage', 'coverage-summary.json');
            if (fs.existsSync(coveragePath)) {
                const coverageData = JSON.parse(fs.readFileSync(coveragePath, 'utf8'));
                const total = coverageData.total;
                if (total && total.lines && total.lines.pct !== undefined) {
                    return Math.round(total.lines.pct);
                }
            }

            return 50;
        } catch (error) {
            return 0;
        }
    }

    _checkDocumentation(extensionPath) {
        const docsDir = path.join(extensionPath, 'docs');
        const hasDocsDir = fs.existsSync(docsDir) && fs.statSync(docsDir).isDirectory();
        
        const readmePath = path.join(extensionPath, 'README.md');
        const hasReadme = fs.existsSync(readmePath);
        
        const manifestPath = path.join(extensionPath, 'manifest.json');
        let hasDetailedManifest = false;
        if (fs.existsSync(manifestPath)) {
            try {
                const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
                hasDetailedManifest = !!(manifest.description && manifest.description.length > 50);
            } catch (e) {
                hasDetailedManifest = false;
            }
        }

        let score = 0;
        if (hasReadme) score += 40;
        if (hasDocsDir) {
            const docFiles = fs.readdirSync(docsDir);
            if (docFiles.length > 0) score += 40;
        }
        if (hasDetailedManifest) score += 20;

        return score;
    }

    async _checkDependencyFreshness(extensionPath) {
        try {
            const packageJsonPath = path.join(extensionPath, 'package.json');
            if (!fs.existsSync(packageJsonPath)) {
                return 100;
            }

            const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
            const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };
            
            if (Object.keys(dependencies).length === 0) {
                return 100;
            }

            let freshCount = 0;
            let totalDeps = Object.keys(dependencies).length;
            
            for (const [name, version] of Object.entries(dependencies)) {
                try {
                    const latestVersion = await this._fetchLatestNpmVersion(name);
                    const installedVersion = version.replace(/^[~^]/, '');
                    
                    if (this._compareVersions(installedVersion, latestVersion) >= 0) {
                        freshCount++;
                    } else {
                        const majorDiff = this._getMajorVersionDiff(installedVersion, latestVersion);
                        if (majorDiff <= 1) {
                            freshCount += 0.5;
                        }
                    }
                } catch (e) {
                    freshCount += 0.5;
                }
            }

            return Math.round((freshCount / totalDeps) * 100);
        } catch (error) {
            return 100;
        }
    }

    async _fetchLatestNpmVersion(packageName) {
        return new Promise((resolve, reject) => {
            const options = {
                hostname: 'registry.npmjs.org',
                path: `/${packageName}/latest`,
                method: 'GET',
                timeout: 5000
            };

            const req = https.request(options, (res) => {
                let data = '';
                res.on('data', (chunk) => { data += chunk; });
                res.on('end', () => {
                    try {
                        const json = JSON.parse(data);
                        resolve(json.version || '0.0.0');
                    } catch (e) {
                        resolve('0.0.0');
                    }
                });
            });

            req.on('error', () => resolve('0.0.0'));
            req.on('timeout', () => {
                req.destroy();
                resolve('0.0.0');
            });
            req.end();
        });
    }

    _compareVersions(v1, v2) {
        const parts1 = v1.split('.').map(n => parseInt(n, 10) || 0);
        const parts2 = v2.split('.').map(n => parseInt(n, 10) || 0);
        
        for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
            const num1 = parts1[i] || 0;
            const num2 = parts2[i] || 0;
            if (num1 > num2) return 1;
            if (num1 < num2) return -1;
        }
        return 0;
    }

    _getMajorVersionDiff(v1, v2) {
        const major1 = parseInt(v1.split('.')[0], 10) || 0;
        const major2 = parseInt(v2.split('.')[0], 10) || 0;
        return Math.abs(major2 - major1);
    }

    async _calculateSecurityScore(extensionId) {
        let score = 100;

        try {
            const extensionPath = path.join(this.extensionDir, extensionId);
            
            if (this.codeSigning && fs.existsSync(extensionPath)) {
                const verifyResult = this.codeSigning.verifyExtension(extensionPath);
                if (!verifyResult.valid) {
                    score -= 50;
                }
            }

            const scanResult = await this._getLatestSecurityScan(extensionId);
            if (scanResult) {
                if (!scanResult.safe) {
                    score = 0;
                } else if (scanResult.issues && scanResult.issues.length > 0) {
                    const criticalIssues = scanResult.issues.filter(i => i.severity === 'critical');
                    const highIssues = scanResult.issues.filter(i => i.severity === 'high');
                    const mediumIssues = scanResult.issues.filter(i => i.severity === 'medium');
                    
                    score -= (criticalIssues.length * 30);
                    score -= (highIssues.length * 15);
                    score -= (mediumIssues.length * 5);
                }
            }

            return Math.max(0, score);
        } catch (error) {
            return 50;
        }
    }

    async _getLatestSecurityScan(extensionId) {
        if (!this.db) return null;

        return new Promise((resolve) => {
            this.db.db.get(
                `SELECT ev.manifest FROM extension_versions ev
                 WHERE ev.extension_id = ?
                 ORDER BY ev.created_at DESC
                 LIMIT 1`,
                [extensionId],
                (err, row) => {
                    if (err || !row) {
                        resolve(null);
                        return;
                    }

                    try {
                        const manifest = JSON.parse(row.manifest);
                        resolve(manifest.securityScan || { safe: true, issues: [] });
                    } catch (e) {
                        resolve(null);
                    }
                }
            );
        });
    }

    async _calculateUserRatingsScore(extensionId) {
        if (!this.db) return 75;

        try {
            const stats = await this.db.getExtensionStats(extensionId);
            
            if (!stats || !stats.total_ratings || stats.total_ratings === 0) {
                return 50;
            }

            const avgRating = stats.avg_rating || 0;
            const ratingCount = stats.total_ratings || 0;

            let ratingScore = (avgRating / 5) * 100;

            const confidence = Math.min(1, ratingCount / 50);
            ratingScore = ratingScore * confidence + 50 * (1 - confidence);

            return Math.round(ratingScore);
        } catch (error) {
            return 50;
        }
    }

    async _calculateUpdateRecencyScore(extensionId) {
        if (!this.db) return 75;

        return new Promise((resolve) => {
            this.db.db.get(
                `SELECT MAX(created_at) as latest_update
                 FROM extension_versions
                 WHERE extension_id = ? AND status = 'approved'`,
                [extensionId],
                (err, row) => {
                    if (err || !row || !row.latest_update) {
                        resolve(50);
                        return;
                    }

                    const daysSinceUpdate = (Date.now() - row.latest_update) / (1000 * 60 * 60 * 24);

                    let score = 100;
                    if (daysSinceUpdate > 365) {
                        score = 20;
                    } else if (daysSinceUpdate > 180) {
                        score = 50;
                    } else if (daysSinceUpdate > 90) {
                        score = 70;
                    } else if (daysSinceUpdate > 30) {
                        score = 85;
                    }

                    resolve(score);
                }
            );
        });
    }

    async _calculateMaintainerScore(extensionId) {
        try {
            const manifestPath = path.join(this.extensionDir, extensionId, 'manifest.json');
            if (!fs.existsSync(manifestPath)) {
                return 50;
            }

            const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
            const repository = manifest.repository || (manifest.homepage && manifest.homepage.includes('github.com') ? manifest.homepage : null);
            
            if (!repository) {
                return 50;
            }

            const repoData = await this._fetchGitHubRepoData(repository);
            if (!repoData) {
                return 50;
            }

            let score = 50;

            if (repoData.open_issues_count !== undefined) {
                const issueRatio = repoData.open_issues_count / Math.max(1, repoData.stargazers_count || 1);
                if (issueRatio < 0.1) score += 20;
                else if (issueRatio < 0.3) score += 10;
            }

            if (repoData.updated_at) {
                const daysSinceUpdate = (Date.now() - new Date(repoData.updated_at).getTime()) / (1000 * 60 * 60 * 24);
                if (daysSinceUpdate < 30) score += 20;
                else if (daysSinceUpdate < 90) score += 10;
            }

            if (repoData.has_issues && repoData.stargazers_count > 10) {
                score += 10;
            }

            return Math.min(100, score);
        } catch (error) {
            return 50;
        }
    }

    async _fetchGitHubRepoData(repoUrl) {
        try {
            const match = repoUrl.match(/github\.com\/([^\/]+)\/([^\/\.]+)/);
            if (!match) return null;

            const [, owner, repo] = match;
            const apiUrl = `https://api.github.com/repos/${owner}/${repo}`;

            return new Promise((resolve) => {
                const options = {
                    hostname: 'api.github.com',
                    path: `/repos/${owner}/${repo}`,
                    method: 'GET',
                    headers: {
                        'User-Agent': 'ghost-cli-marketplace',
                        'Accept': 'application/vnd.github.v3+json'
                    },
                    timeout: 5000
                };

                const req = https.request(options, (res) => {
                    let data = '';
                    res.on('data', (chunk) => { data += chunk; });
                    res.on('end', () => {
                        try {
                            const json = JSON.parse(data);
                            resolve(json);
                        } catch (e) {
                            resolve(null);
                        }
                    });
                });

                req.on('error', () => resolve(null));
                req.on('timeout', () => {
                    req.destroy();
                    resolve(null);
                });
                req.end();
            });
        } catch (error) {
            return null;
        }
    }

    getHealthBadge(healthScore) {
        if (healthScore >= 80) {
            return { level: 'excellent', color: '#10b981', label: 'Excellent' };
        } else if (healthScore >= 60) {
            return { level: 'good', color: '#3b82f6', label: 'Good' };
        } else if (healthScore >= 40) {
            return { level: 'fair', color: '#f59e0b', label: 'Fair' };
        } else {
            return { level: 'poor', color: '#ef4444', label: 'Poor' };
        }
    }
}

module.exports = { HealthScorer };
