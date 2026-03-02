class PermissionScanner {
    async scan(manifest) {
        const issues = [];

        if (!manifest.capabilities) {
            issues.push({
                type: 'missing_capabilities',
                severity: 'critical',
                message: 'No capabilities declared in manifest',
                recommendation: 'Declare required capabilities following Zero Trust principles'
            });
            return issues;
        }

        const caps = manifest.capabilities;

        if (caps.git && caps.git.write && !caps.git.read) {
            issues.push({
                type: 'suspicious_permission',
                severity: 'high',
                message: 'Extension has git write permission without read permission',
                recommendation: 'Extensions should request read permission if they need write access'
            });
        }

        if (caps.filesystem) {
            const { read = [], write = [] } = caps.filesystem;
            
            if (read.length === 0 && write.length > 0) {
                issues.push({
                    type: 'write_only_filesystem',
                    severity: 'medium',
                    message: 'Extension has filesystem write without read permissions',
                    recommendation: 'Verify this permission combination is intentional'
                });
            }

            const sensitivePatterns = [
                { pattern: '.env', severity: 'high', type: 'sensitive_file_access' },
                { pattern: '.git/config', severity: 'medium', type: 'git_config_access' },
                { pattern: '.ssh/', severity: 'high', type: 'ssh_access' },
                { pattern: 'id_rsa', severity: 'critical', type: 'private_key_access' },
                { pattern: '/etc/', severity: 'high', type: 'system_config_access' },
                { pattern: '~/.aws/', severity: 'high', type: 'aws_credentials_access' }
            ];

            for (const { pattern, severity, type } of sensitivePatterns) {
                if (read.some(p => p.includes(pattern)) || write.some(p => p.includes(pattern))) {
                    issues.push({
                        type,
                        severity,
                        message: `Extension requests access to sensitive path: ${pattern}`,
                        recommendation: 'Ensure access to sensitive files is necessary and document the reason'
                    });
                }
            }
        }

        if (caps.network) {
            const { allowlist = [], rateLimit } = caps.network;

            if (allowlist.length > 10) {
                issues.push({
                    type: 'excessive_network_allowlist',
                    severity: 'medium',
                    message: `Extension allowlists ${allowlist.length} network endpoints`,
                    recommendation: 'Limit network access to essential endpoints only'
                });
            }

            if (!rateLimit || !rateLimit.cir || !rateLimit.bc) {
                issues.push({
                    type: 'missing_rate_limit',
                    severity: 'medium',
                    message: 'Network capability declared without proper rate limiting',
                    recommendation: 'Configure rate limits to prevent resource exhaustion'
                });
            } else {
                if (rateLimit.cir > 1000) {
                    issues.push({
                        type: 'high_rate_limit',
                        severity: 'low',
                        message: `High committed rate: ${rateLimit.cir} requests/min`,
                        recommendation: 'Verify this rate limit is necessary'
                    });
                }
            }
        }

        if (caps.hooks && caps.hooks.length > 0) {
            const blockingHooks = ['pre-commit', 'pre-push', 'commit-msg', 'pre-rebase'];
            const hasBlockingHook = caps.hooks.some(h => blockingHooks.includes(h));
            
            if (hasBlockingHook) {
                issues.push({
                    type: 'blocking_git_hook',
                    severity: 'medium',
                    message: `Extension registers blocking git hooks: ${caps.hooks.filter(h => blockingHooks.includes(h)).join(', ')}`,
                    recommendation: 'Ensure blocking hooks complete quickly and handle errors gracefully'
                });
            }
        }

        const permissionCount = this._countPermissions(caps);
        if (permissionCount > 5) {
            issues.push({
                type: 'excessive_permissions',
                severity: 'low',
                message: `Extension requests ${permissionCount} different permission types`,
                recommendation: 'Follow principle of least privilege and request only necessary permissions'
            });
        }

        if (manifest.permissions) {
            if (manifest.permissions.includes('process:spawn')) {
                issues.push({
                    type: 'process_spawn_permission',
                    severity: 'high',
                    message: 'Extension requests process spawn permission',
                    recommendation: 'Ensure spawned processes are properly validated and sanitized'
                });
            }

            if (manifest.permissions.includes('env:read')) {
                issues.push({
                    type: 'env_read_permission',
                    severity: 'medium',
                    message: 'Extension can read environment variables',
                    recommendation: 'Document which environment variables are accessed and why'
                });
            }
        }

        return issues;
    }

    _countPermissions(capabilities) {
        let count = 0;
        
        if (capabilities.filesystem) count++;
        if (capabilities.network) count++;
        if (capabilities.git) {
            if (capabilities.git.read) count++;
            if (capabilities.git.write) count++;
        }
        if (capabilities.hooks && capabilities.hooks.length > 0) count++;
        
        return count;
    }
}

module.exports = { PermissionScanner };
