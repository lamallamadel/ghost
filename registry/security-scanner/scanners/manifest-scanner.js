class ManifestScanner {
    async scan(manifest) {
        const issues = [];

        if (!manifest.id || !/^[a-z0-9-]+$/.test(manifest.id)) {
            issues.push({
                type: 'invalid_id',
                severity: 'critical',
                message: 'Extension ID must be lowercase alphanumeric with hyphens only',
                recommendation: 'Update the id field to use only lowercase letters, numbers, and hyphens'
            });
        }

        if (!manifest.version || !/^\d+\.\d+\.\d+$/.test(manifest.version)) {
            issues.push({
                type: 'invalid_version',
                severity: 'critical',
                message: 'Version must follow semantic versioning (x.y.z)',
                recommendation: 'Update version to follow semver format (e.g., 1.0.0)'
            });
        }

        const requiredFields = ['id', 'name', 'version', 'main', 'capabilities'];
        for (const field of requiredFields) {
            if (!manifest[field]) {
                issues.push({
                    type: 'missing_required_field',
                    severity: 'critical',
                    message: `Missing required field: ${field}`,
                    recommendation: `Add the ${field} field to your manifest`
                });
            }
        }

        if (!manifest.author) {
            issues.push({
                type: 'missing_author',
                severity: 'medium',
                message: 'Author field is missing',
                recommendation: 'Add author information for transparency'
            });
        }

        if (!manifest.description) {
            issues.push({
                type: 'missing_description',
                severity: 'low',
                message: 'Description field is missing',
                recommendation: 'Add a description to help users understand the extension'
            });
        }

        if (manifest.capabilities) {
            if (manifest.capabilities.filesystem) {
                const { read = [], write = [] } = manifest.capabilities.filesystem;
                
                if (read.includes('**/*') || read.includes('**')) {
                    issues.push({
                        type: 'overly_permissive_filesystem_read',
                        severity: 'medium',
                        message: 'Extension requests read access to all files',
                        recommendation: 'Restrict filesystem read access to specific directories needed'
                    });
                }

                if (write.includes('**/*') || write.includes('**')) {
                    issues.push({
                        type: 'overly_permissive_filesystem_write',
                        severity: 'high',
                        message: 'Extension requests write access to all files',
                        recommendation: 'Restrict filesystem write access to specific output directories'
                    });
                }

                for (const pattern of write) {
                    if (pattern.includes('node_modules')) {
                        issues.push({
                            type: 'suspicious_write_pattern',
                            severity: 'high',
                            message: 'Extension requests write access to node_modules',
                            recommendation: 'Remove write access to node_modules directory'
                        });
                    }
                }
            }

            if (manifest.capabilities.network) {
                const { allowlist = [] } = manifest.capabilities.network;
                
                if (allowlist.length === 0) {
                    issues.push({
                        type: 'network_capability_unused',
                        severity: 'info',
                        message: 'Network capability declared but allowlist is empty',
                        recommendation: 'Remove network capability if not needed'
                    });
                }

                for (const url of allowlist) {
                    if (url.startsWith('http://') && !url.includes('localhost')) {
                        issues.push({
                            type: 'insecure_network_url',
                            severity: 'medium',
                            message: `Insecure HTTP URL in allowlist: ${url}`,
                            recommendation: 'Use HTTPS instead of HTTP for remote endpoints'
                        });
                    }
                }
            }
        }

        return issues;
    }
}

module.exports = { ManifestScanner };
