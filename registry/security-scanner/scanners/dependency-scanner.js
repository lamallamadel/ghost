const fs = require('fs');
const path = require('path');

class DependencyScanner {
    constructor() {
        this.knownVulnerabilities = {
            'lodash': {
                versions: ['<4.17.21'],
                severity: 'high',
                cve: 'CVE-2020-8203',
                description: 'Prototype pollution vulnerability'
            },
            'minimist': {
                versions: ['<1.2.6'],
                severity: 'medium',
                cve: 'CVE-2021-44906',
                description: 'Prototype pollution vulnerability'
            },
            'node-fetch': {
                versions: ['<2.6.7'],
                severity: 'high',
                cve: 'CVE-2022-0235',
                description: 'Exposure of sensitive information'
            },
            'axios': {
                versions: ['<0.21.2'],
                severity: 'medium',
                cve: 'CVE-2021-3749',
                description: 'Server-side request forgery'
            }
        };

        this.deprecatedPackages = [
            'request',
            'node-uuid',
            'colors',
            'faker'
        ];
    }

    async scan(extensionPath, manifest) {
        const issues = [];

        const packageJsonPath = path.join(extensionPath, 'package.json');
        if (fs.existsSync(packageJsonPath)) {
            try {
                const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
                const allDeps = {
                    ...packageJson.dependencies,
                    ...packageJson.devDependencies
                };

                for (const [name, version] of Object.entries(allDeps)) {
                    if (this.knownVulnerabilities[name]) {
                        const vuln = this.knownVulnerabilities[name];
                        const cleanVersion = version.replace(/[\^~>=<]*/g, '');
                        
                        if (this._isVulnerableVersion(cleanVersion, vuln.versions)) {
                            issues.push({
                                type: 'vulnerable_dependency',
                                severity: vuln.severity,
                                message: `Vulnerable dependency: ${name}@${version}`,
                                package: name,
                                cve: vuln.cve,
                                description: vuln.description,
                                recommendation: `Update ${name} to a patched version`
                            });
                        }
                    }

                    if (this.deprecatedPackages.includes(name)) {
                        issues.push({
                            type: 'deprecated_dependency',
                            severity: 'medium',
                            message: `Deprecated package: ${name}`,
                            package: name,
                            recommendation: `Replace ${name} with a maintained alternative`
                        });
                    }

                    if (version === '*' || version === 'latest') {
                        issues.push({
                            type: 'unpinned_dependency',
                            severity: 'low',
                            message: `Unpinned dependency version: ${name}@${version}`,
                            package: name,
                            recommendation: 'Use specific version ranges for better reproducibility'
                        });
                    }
                }

                const depCount = Object.keys(allDeps).length;
                if (depCount > 50) {
                    issues.push({
                        type: 'excessive_dependencies',
                        severity: 'info',
                        message: `Extension has ${depCount} dependencies`,
                        recommendation: 'Consider reducing dependencies to minimize attack surface'
                    });
                }

            } catch (error) {
                issues.push({
                    type: 'invalid_package_json',
                    severity: 'medium',
                    message: 'Unable to parse package.json',
                    error: error.message
                });
            }
        }

        if (manifest.dependencies) {
            for (const [name, version] of Object.entries(manifest.dependencies)) {
                if (!/^[\^~]?\d+\.\d+\.\d+$/.test(version) && version !== '*' && version !== 'latest') {
                    issues.push({
                        type: 'invalid_dependency_version',
                        severity: 'medium',
                        message: `Invalid version specifier for ${name}: ${version}`,
                        recommendation: 'Use valid semver version ranges'
                    });
                }
            }
        }

        return issues;
    }

    _isVulnerableVersion(version, vulnerableVersions) {
        for (const vulnRange of vulnerableVersions) {
            if (vulnRange.startsWith('<')) {
                const maxVersion = vulnRange.substring(1);
                if (this._compareVersions(version, maxVersion) < 0) {
                    return true;
                }
            } else if (vulnRange.startsWith('>')) {
                const minVersion = vulnRange.substring(1);
                if (this._compareVersions(version, minVersion) > 0) {
                    return true;
                }
            } else if (vulnRange === version) {
                return true;
            }
        }
        return false;
    }

    _compareVersions(v1, v2) {
        const parts1 = v1.split('.').map(Number);
        const parts2 = v2.split('.').map(Number);

        for (let i = 0; i < 3; i++) {
            if (parts1[i] > parts2[i]) return 1;
            if (parts1[i] < parts2[i]) return -1;
        }

        return 0;
    }
}

module.exports = { DependencyScanner };
