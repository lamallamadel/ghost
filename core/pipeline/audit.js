const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');

class EntropyScanner {
    static ENTROPY_THRESHOLD = 4.5;
    static MIN_LENGTH_FOR_SCAN = 16;

    static calculateEntropy(data) {
        if (!data || data.length === 0) return 0;

        const freq = {};
        for (let i = 0; i < data.length; i++) {
            const char = data[i];
            freq[char] = (freq[char] || 0) + 1;
        }

        let entropy = 0;
        const len = data.length;

        for (const char in freq) {
            const p = freq[char] / len;
            entropy -= p * Math.log2(p);
        }

        return entropy;
    }

    static scanForSecrets(data) {
        if (!data || typeof data !== 'string') {
            return { hasSecrets: false, findings: [] };
        }

        const findings = [];

        const patterns = [
            { name: 'AWS_KEY', regex: /AKIA[0-9A-Z]{16}/, risk: 'high' },
            { name: 'PRIVATE_KEY', regex: /-----BEGIN [A-Z ]+PRIVATE KEY-----/, risk: 'critical' },
            { name: 'API_KEY', regex: /api[_-]?key['\s:=]+[a-zA-Z0-9]{16,}/, risk: 'high' },
            { name: 'TOKEN', regex: /token['\s:=]+[a-zA-Z0-9]{20,}/, risk: 'high' },
            { name: 'PASSWORD', regex: /password['\s:=]+[^\s]{8,}/, risk: 'medium' },
            { name: 'SECRET', regex: /secret['\s:=]+[a-zA-Z0-9]{16,}/, risk: 'high' }
        ];

        for (const pattern of patterns) {
            const matches = data.match(new RegExp(pattern.regex, 'gi'));
            if (matches) {
                findings.push({
                    type: pattern.name,
                    risk: pattern.risk,
                    count: matches.length
                });
            }
        }

        const words = data.split(/\s+/);
        for (const word of words) {
            if (word.length >= this.MIN_LENGTH_FOR_SCAN) {
                const entropy = this.calculateEntropy(word);
                if (entropy > this.ENTROPY_THRESHOLD) {
                    findings.push({
                        type: 'HIGH_ENTROPY',
                        risk: 'medium',
                        entropy: entropy.toFixed(2),
                        sample: word.substring(0, 20) + (word.length > 20 ? '...' : '')
                    });
                    break;
                }
            }
        }

        return {
            hasSecrets: findings.length > 0,
            findings
        };
    }

    static sanitize(data) {
        if (!data || typeof data !== 'string') return data;

        let sanitized = data;

        const patterns = [
            /AKIA[0-9A-Z]{16}/g,
            /-----BEGIN [A-Z ]+PRIVATE KEY-----[\s\S]*?-----END [A-Z ]+PRIVATE KEY-----/g,
            /(api[_-]?key['\s:=]+)[a-zA-Z0-9]{16,}/gi,
            /(token['\s:=]+)[a-zA-Z0-9]{20,}/gi,
            /(password['\s:=]+)[^\s]{8,}/gi,
            /(secret['\s:=]+)[a-zA-Z0-9]{16,}/gi
        ];

        for (const pattern of patterns) {
            sanitized = sanitized.replace(pattern, (match) => {
                return match.substring(0, Math.min(match.length, 10)) + '[REDACTED]';
            });
        }

        return sanitized;
    }
}

class NISTValidator {
    static ALLOWLIST_TYPES = {
        filesystem: {
            extensions: ['.js', '.json', '.md', '.txt', '.yml', '.yaml', '.xml', '.html', '.css', '.ts', '.tsx'],
            paths: ['src/', 'test/', 'docs/', 'config/', '.ghost/']
        },
        network: {
            protocols: ['https:', 'http:'],
            ports: [80, 443, 8080, 3000]
        },
        process: {
            commands: ['git', 'node', 'npm', 'yarn', 'pnpm']
        }
    };

    static validate(intent) {
        const result = {
            valid: true,
            violations: [],
            warnings: []
        };

        switch (intent.type) {
            case 'filesystem':
                this._validateFilesystem(intent, result);
                break;
            case 'network':
                this._validateNetwork(intent, result);
                break;
            case 'process':
                this._validateProcess(intent, result);
                break;
        }

        if (intent.params) {
            const secretScan = EntropyScanner.scanForSecrets(JSON.stringify(intent.params));
            if (secretScan.hasSecrets) {
                result.violations.push({
                    rule: 'SI-10-SECRET-DETECTION',
                    message: 'Potential secrets detected in parameters',
                    findings: secretScan.findings
                });
                result.valid = false;
            }
        }

        return result;
    }

    static _validateFilesystem(intent, result) {
        const requestedPath = intent.params.path;
        
        if (!requestedPath || typeof requestedPath !== 'string') {
            result.violations.push({
                rule: 'SI-10-PATH-VALIDATION',
                message: 'Invalid or missing path parameter'
            });
            result.valid = false;
            return;
        }

        if (requestedPath.includes('..')) {
            result.violations.push({
                rule: 'SI-10-PATH-TRAVERSAL',
                message: 'Path traversal detected'
            });
            result.valid = false;
        }

        const ext = path.extname(requestedPath);
        const isAllowedExt = this.ALLOWLIST_TYPES.filesystem.extensions.includes(ext);
        const isAllowedPath = this.ALLOWLIST_TYPES.filesystem.paths.some(p => 
            requestedPath.startsWith(p) || requestedPath.includes(`/${p}`)
        );

        if (!isAllowedExt && !isAllowedPath) {
            result.warnings.push({
                rule: 'SI-10-PATH-ALLOWLIST',
                message: `Path extension or location not in standard allowlist: ${requestedPath}`
            });
        }

        if (intent.operation === 'write' && intent.params.content) {
            const secretScan = EntropyScanner.scanForSecrets(intent.params.content);
            if (secretScan.hasSecrets) {
                result.violations.push({
                    rule: 'SI-10-CONTENT-SECRETS',
                    message: 'Secrets detected in write content',
                    findings: secretScan.findings
                });
                result.valid = false;
            }
        }
    }

    static _validateNetwork(intent, result) {
        const url = intent.params.url;
        
        try {
            const parsed = new URL(url);
            
            if (!this.ALLOWLIST_TYPES.network.protocols.includes(parsed.protocol)) {
                result.violations.push({
                    rule: 'SI-10-PROTOCOL-ALLOWLIST',
                    message: `Protocol not allowed: ${parsed.protocol}`
                });
                result.valid = false;
            }

            if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
                result.warnings.push({
                    rule: 'SI-10-LOCALHOST-ACCESS',
                    message: 'Access to localhost detected'
                });
            }
        } catch (e) {
            result.violations.push({
                rule: 'SI-10-URL-VALIDATION',
                message: `Invalid URL: ${url}`
            });
            result.valid = false;
        }
    }

    static _validateProcess(intent, result) {
        const command = intent.params.command;
        
        if (!command || typeof command !== 'string') {
            result.violations.push({
                rule: 'SI-10-COMMAND-VALIDATION',
                message: 'Invalid or missing command parameter'
            });
            result.valid = false;
            return;
        }

        const baseCommand = command.split(/\s+/)[0];
        const isAllowed = this.ALLOWLIST_TYPES.process.commands.includes(baseCommand);
        
        if (!isAllowed) {
            result.warnings.push({
                rule: 'SI-10-COMMAND-ALLOWLIST',
                message: `Command not in standard allowlist: ${baseCommand}`
            });
        }

        if (command.includes('&&') || command.includes('||') || command.includes(';') || command.includes('|')) {
            result.violations.push({
                rule: 'SI-10-COMMAND-INJECTION',
                message: 'Command chaining or piping detected'
            });
            result.valid = false;
        }
    }
}

class AuditLogger {
    constructor(logPath) {
        this.logPath = logPath || path.join(os.homedir(), '.ghost', 'audit.log');
        this._ensureLogDirectory();
    }

    _ensureLogDirectory() {
        const dir = path.dirname(this.logPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    }

    log(entry) {
        const immutableEntry = Object.freeze({
            timestamp: new Date().toISOString(),
            ...entry
        });

        const logLine = JSON.stringify(immutableEntry) + '\n';

        try {
            fs.appendFileSync(this.logPath, logLine, { encoding: 'utf8', flag: 'a' });
        } catch (error) {
            console.error('[AuditLogger] Failed to write audit log:', error.message);
        }

        return immutableEntry;
    }

    logIntent(intent, authResult, validationResult) {
        return this.log({
            type: 'INTENT',
            requestId: intent.requestId,
            extensionId: intent.extensionId,
            intentType: intent.type,
            operation: intent.operation,
            authorized: authResult.authorized,
            authCode: authResult.code,
            validated: validationResult.valid,
            violations: validationResult.violations,
            warnings: validationResult.warnings,
            params: this._sanitizeParams(intent.params)
        });
    }

    logExecution(intent, result, error = null) {
        return this.log({
            type: 'EXECUTION',
            requestId: intent.requestId,
            extensionId: intent.extensionId,
            intentType: intent.type,
            operation: intent.operation,
            success: !error,
            error: error ? {
                message: error.message,
                code: error.code
            } : null,
            resultSize: result ? JSON.stringify(result).length : 0
        });
    }

    logSecurityEvent(extensionId, eventType, details) {
        return this.log({
            type: 'SECURITY_EVENT',
            extensionId,
            eventType,
            details
        });
    }

    _sanitizeParams(params) {
        const sanitized = { ...params };
        
        if (sanitized.content) {
            sanitized.content = EntropyScanner.sanitize(sanitized.content);
        }
        
        if (sanitized.data) {
            sanitized.data = EntropyScanner.sanitize(JSON.stringify(sanitized.data));
        }

        return sanitized;
    }

    readLogs(options = {}) {
        const { limit = 100, filter = {} } = options;

        if (!fs.existsSync(this.logPath)) {
            return [];
        }

        try {
            const content = fs.readFileSync(this.logPath, 'utf8');
            const lines = content.trim().split('\n').filter(line => line);
            
            let logs = lines.map(line => {
                try {
                    return JSON.parse(line);
                } catch {
                    return null;
                }
            }).filter(log => log !== null);

            if (filter.extensionId) {
                logs = logs.filter(log => log.extensionId === filter.extensionId);
            }

            if (filter.type) {
                logs = logs.filter(log => log.type === filter.type);
            }

            if (filter.since) {
                logs = logs.filter(log => new Date(log.timestamp) >= new Date(filter.since));
            }

            return logs.slice(-limit);
        } catch (error) {
            console.error('[AuditLogger] Failed to read audit logs:', error.message);
            return [];
        }
    }
}

class AuditLayer {
    constructor(logPath) {
        this.logger = new AuditLogger(logPath);
    }

    audit(intent, authResult) {
        const validationResult = NISTValidator.validate(intent);

        this.logger.logIntent(intent, authResult, validationResult);

        if (!validationResult.valid) {
            return {
                passed: false,
                reason: 'NIST SI-10 validation failed',
                violations: validationResult.violations,
                code: 'AUDIT_VALIDATION_FAILED'
            };
        }

        if (validationResult.warnings.length > 0) {
            return {
                passed: true,
                warnings: validationResult.warnings
            };
        }

        return {
            passed: true
        };
    }

    logExecution(intent, result, error = null) {
        return this.logger.logExecution(intent, result, error);
    }

    logSecurityEvent(extensionId, eventType, details) {
        return this.logger.logSecurityEvent(extensionId, eventType, details);
    }

    getLogs(options) {
        return this.logger.readLogs(options);
    }
}

module.exports = {
    AuditLayer,
    AuditLogger,
    NISTValidator,
    EntropyScanner
};
