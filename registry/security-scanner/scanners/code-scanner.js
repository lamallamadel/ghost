const fs = require('fs');
const path = require('path');

class CodeScanner {
    constructor() {
        this.dangerousPatterns = [
            { pattern: /eval\s*\(/g, type: 'dangerous_eval', severity: 'critical' },
            { pattern: /Function\s*\(/g, type: 'dangerous_function_constructor', severity: 'critical' },
            { pattern: /child_process\.exec\(/g, type: 'command_injection_risk', severity: 'high' },
            { pattern: /fs\.unlink.*\*\*/g, type: 'dangerous_file_deletion', severity: 'high' },
            { pattern: /fs\.rmSync.*recursive.*true/g, type: 'recursive_deletion', severity: 'medium' },
            { pattern: /process\.env\[['"][A-Z_]*SECRET/gi, type: 'secret_exposure', severity: 'high' },
            { pattern: /password\s*[:=]\s*['"][^'"]+['"]/gi, type: 'hardcoded_password', severity: 'critical' },
            { pattern: /api[_-]?key\s*[:=]\s*['"][^'"]+['"]/gi, type: 'hardcoded_api_key', severity: 'critical' },
            { pattern: /token\s*[:=]\s*['"][a-zA-Z0-9]{20,}['"]/gi, type: 'hardcoded_token', severity: 'critical' },
            { pattern: /\.\.\//g, type: 'path_traversal_risk', severity: 'medium' },
            { pattern: /require\s*\(\s*[^'"]/g, type: 'dynamic_require', severity: 'medium' },
            { pattern: /innerHTML\s*=/g, type: 'xss_risk', severity: 'high' },
            { pattern: /document\.write\(/g, type: 'xss_risk', severity: 'high' },
            { pattern: /crypto\.createCipheriv.*ecb/gi, type: 'weak_encryption', severity: 'high' }
        ];
    }

    async scan(extensionPath, manifest) {
        const issues = [];
        const jsFiles = this._findJsFiles(extensionPath);

        for (const file of jsFiles) {
            const content = fs.readFileSync(file, 'utf8');
            const relativePath = path.relative(extensionPath, file);

            for (const { pattern, type, severity } of this.dangerousPatterns) {
                const matches = content.match(pattern);
                if (matches) {
                    const lines = this._findLineNumbers(content, pattern);
                    issues.push({
                        type,
                        severity,
                        message: `Potentially dangerous code pattern detected: ${type.replace(/_/g, ' ')}`,
                        file: relativePath,
                        lines,
                        recommendation: this._getRecommendation(type)
                    });
                }
            }

            if (content.includes('process.exit') && !content.includes('graceful')) {
                issues.push({
                    type: 'ungraceful_exit',
                    severity: 'low',
                    message: 'Extension uses process.exit without graceful shutdown',
                    file: relativePath,
                    recommendation: 'Implement graceful shutdown handling'
                });
            }

            if (content.match(/console\.(log|error|warn|info)/g)) {
                const count = (content.match(/console\./g) || []).length;
                if (count > 20) {
                    issues.push({
                        type: 'excessive_logging',
                        severity: 'info',
                        message: `Excessive console logging detected (${count} instances)`,
                        file: relativePath,
                        recommendation: 'Consider using a proper logging framework with log levels'
                    });
                }
            }

            if (content.includes('TODO') || content.includes('FIXME') || content.includes('HACK')) {
                issues.push({
                    type: 'code_quality',
                    severity: 'info',
                    message: 'Code contains TODO/FIXME/HACK comments',
                    file: relativePath,
                    recommendation: 'Address pending issues before publishing'
                });
            }
        }

        return issues;
    }

    _findJsFiles(dir) {
        const files = [];
        const entries = fs.readdirSync(dir, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            
            if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== '.git') {
                files.push(...this._findJsFiles(fullPath));
            } else if (entry.isFile() && entry.name.endsWith('.js')) {
                files.push(fullPath);
            }
        }

        return files;
    }

    _findLineNumbers(content, pattern) {
        const lines = [];
        const contentLines = content.split('\n');
        
        for (let i = 0; i < contentLines.length; i++) {
            if (pattern.test(contentLines[i])) {
                lines.push(i + 1);
            }
        }

        return lines;
    }

    _getRecommendation(type) {
        const recommendations = {
            dangerous_eval: 'Avoid using eval(). Use safer alternatives like JSON.parse() or predefined functions',
            dangerous_function_constructor: 'Avoid Function constructor. Use regular functions instead',
            command_injection_risk: 'Use child_process.execFile or spawn with argument arrays to prevent injection',
            dangerous_file_deletion: 'Use explicit file paths instead of glob patterns for deletion',
            secret_exposure: 'Never expose secrets in code. Use environment variables properly',
            hardcoded_password: 'Remove hardcoded credentials. Use environment variables or secure vaults',
            hardcoded_api_key: 'Remove hardcoded API keys. Use environment variables',
            hardcoded_token: 'Remove hardcoded tokens. Use environment variables',
            path_traversal_risk: 'Validate and sanitize file paths to prevent traversal attacks',
            dynamic_require: 'Use static require statements to prevent code injection',
            xss_risk: 'Sanitize user input before inserting into DOM',
            weak_encryption: 'Use strong encryption algorithms like AES-GCM instead of ECB mode'
        };

        return recommendations[type] || 'Review and address this security concern';
    }
}

module.exports = { CodeScanner };
