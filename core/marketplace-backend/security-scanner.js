const { IntrusionDetectionSystem } = require('./intrusion-detection');
const { CodeSigningManager } = require('./code-signing');
const zlib = require('zlib');
const tar = require('tar-stream');

class SecurityScanner {
    constructor() {
        this.ids = new IntrusionDetectionSystem();
        this.codeSigning = new CodeSigningManager();
        this.maliciousPatterns = [
            /eval\s*\(/gi,
            /new\s+Function\s*\(/gi,
            /child_process\.exec/gi,
            /\.system\(/gi,
            /require\s*\(\s*['"]fs['"]\s*\).*\.unlink/gi,
            /require\s*\(\s*['"]child_process['"]\s*\)/gi,
            /process\.env\./gi,
            /crypto\.createCipher/gi,
            /Buffer\.from\s*\(.*base64/gi,
            /\.btoa\(/gi,
            /\.atob\(/gi,
            /XMLHttpRequest/gi,
            /fetch\s*\(/gi,
            /WebSocket/gi,
            /document\.cookie/gi,
            /localStorage/gi,
            /sessionStorage/gi
        ];
        this.suspiciousKeywords = [
            'password', 'token', 'apikey', 'secret', 'credential',
            'bitcoin', 'wallet', 'mining', 'cryptocurrency',
            'obfuscate', 'deobfuscate', 'shellcode', 'payload',
            'backdoor', 'trojan', 'malware', 'exploit'
        ];
    }

    async scan(fileBuffer, manifest) {
        const issues = [];
        
        const signatureCheck = await this._verifySignature(fileBuffer, manifest);
        if (!signatureCheck.valid) {
            issues.push({
                severity: 'critical',
                type: 'signature',
                message: signatureCheck.error || 'Invalid or missing signature'
            });
        }

        const codeAnalysis = await this._analyzeCode(fileBuffer);
        if (codeAnalysis.issues.length > 0) {
            issues.push(...codeAnalysis.issues);
        }

        const permissionCheck = this._checkPermissions(manifest);
        if (permissionCheck.issues.length > 0) {
            issues.push(...permissionCheck.issues);
        }

        const entropyCheck = this._checkEntropy(fileBuffer);
        if (entropyCheck.suspicious) {
            issues.push({
                severity: 'medium',
                type: 'entropy',
                message: 'High entropy detected, possible obfuscated code',
                score: entropyCheck.score
            });
        }

        const criticalIssues = issues.filter(i => i.severity === 'critical');
        const safe = criticalIssues.length === 0;

        this.ids.recordEvent(manifest.id, {
            type: 'security-scan',
            safe,
            issueCount: issues.length,
            criticalIssues: criticalIssues.length,
            suspiciousPattern: !safe
        });

        return {
            safe,
            issues,
            scanTime: Date.now()
        };
    }

    async _verifySignature(fileBuffer, manifest) {
        try {
            const files = await this._extractTarGz(fileBuffer);
            const signatureFile = files['signature.json'];
            
            if (!signatureFile) {
                return { valid: false, error: 'No signature found' };
            }

            return { valid: true };
        } catch (error) {
            return { valid: false, error: error.message };
        }
    }

    async _analyzeCode(fileBuffer) {
        const issues = [];
        
        try {
            const files = await this._extractTarGz(fileBuffer);
            
            for (const [filename, content] of Object.entries(files)) {
                if (!this._isCodeFile(filename)) continue;

                const fileContent = content.toString('utf8');
                
                for (const pattern of this.maliciousPatterns) {
                    const matches = fileContent.match(pattern);
                    if (matches) {
                        issues.push({
                            severity: 'high',
                            type: 'malicious-pattern',
                            file: filename,
                            pattern: pattern.toString(),
                            matches: matches.length
                        });
                    }
                }

                const lowerContent = fileContent.toLowerCase();
                for (const keyword of this.suspiciousKeywords) {
                    if (lowerContent.includes(keyword)) {
                        issues.push({
                            severity: 'medium',
                            type: 'suspicious-keyword',
                            file: filename,
                            keyword
                        });
                    }
                }

                if (this._detectObfuscation(fileContent)) {
                    issues.push({
                        severity: 'medium',
                        type: 'obfuscation',
                        file: filename,
                        message: 'Possible code obfuscation detected'
                    });
                }
            }
        } catch (error) {
            issues.push({
                severity: 'high',
                type: 'scan-error',
                message: `Failed to analyze code: ${error.message}`
            });
        }

        return { issues };
    }

    _checkPermissions(manifest) {
        const issues = [];
        const capabilities = manifest.capabilities || {};

        if (capabilities.filesystem?.write) {
            const dangerousPaths = capabilities.filesystem.write.filter(p => 
                p.includes('~') || p.includes('/etc') || p.includes('C:') || 
                p === '**' || p === '**/*'
            );
            
            if (dangerousPaths.length > 0) {
                issues.push({
                    severity: 'high',
                    type: 'dangerous-permissions',
                    message: 'Extension requests write access to sensitive paths',
                    paths: dangerousPaths
                });
            }
        }

        if (capabilities.network?.allowlist) {
            const suspiciousDomains = capabilities.network.allowlist.filter(url => {
                const lower = url.toLowerCase();
                return lower.includes('torproject') || 
                       lower.includes('.onion') ||
                       lower.match(/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/);
            });

            if (suspiciousDomains.length > 0) {
                issues.push({
                    severity: 'medium',
                    type: 'suspicious-network',
                    message: 'Extension requests access to suspicious domains',
                    domains: suspiciousDomains
                });
            }
        }

        const permissions = manifest.permissions || [];
        if (permissions.includes('process:spawn')) {
            issues.push({
                severity: 'medium',
                type: 'process-spawn',
                message: 'Extension can spawn processes'
            });
        }

        return { issues };
    }

    _checkEntropy(buffer) {
        const bytes = new Uint8Array(buffer);
        const frequency = new Array(256).fill(0);
        
        for (const byte of bytes) {
            frequency[byte]++;
        }

        let entropy = 0;
        for (const count of frequency) {
            if (count > 0) {
                const p = count / bytes.length;
                entropy -= p * Math.log2(p);
            }
        }

        const maxEntropy = 8;
        const normalizedEntropy = entropy / maxEntropy;

        return {
            suspicious: normalizedEntropy > 0.9,
            score: normalizedEntropy
        };
    }

    _detectObfuscation(code) {
        const longVarNames = code.match(/\b[a-zA-Z_$][a-zA-Z0-9_$]{50,}\b/g);
        if (longVarNames && longVarNames.length > 5) return true;

        const hexStrings = code.match(/['"]\\x[0-9a-fA-F]{2}/g);
        if (hexStrings && hexStrings.length > 10) return true;

        const charCodePattern = /String\.fromCharCode/g;
        const charCodeMatches = code.match(charCodePattern);
        if (charCodeMatches && charCodeMatches.length > 5) return true;

        return false;
    }

    _isCodeFile(filename) {
        return filename.endsWith('.js') || 
               filename.endsWith('.json') || 
               filename.endsWith('.ts') ||
               filename.endsWith('.mjs');
    }

    async _extractTarGz(buffer) {
        return new Promise((resolve, reject) => {
            const files = {};
            const extract = tar.extract();

            extract.on('entry', (header, stream, next) => {
                const chunks = [];
                stream.on('data', chunk => chunks.push(chunk));
                stream.on('end', () => {
                    files[header.name] = Buffer.concat(chunks);
                    next();
                });
                stream.resume();
            });

            extract.on('finish', () => resolve(files));
            extract.on('error', reject);

            const gunzip = zlib.createGunzip();
            gunzip.on('error', reject);
            gunzip.pipe(extract);
            gunzip.end(buffer);
        });
    }
}

module.exports = { SecurityScanner };
