/**
 * NIST SI-10 Compliance: Input Validation Layer
 * 
 * This module implements NIST SP 800-53 SI-10 (Information Input Validation) controls:
 * - Path traversal detection (SI-10-PATH-TRAVERSAL)
 * - Command injection prevention (SI-10-COMMAND-INJECTION)
 * - SSRF protection (SI-10-SSRF-*)
 * - Secret pattern detection (SI-10-SECRET-DETECTION)
 * - Immutable audit logging with timestamps
 * 
 * All validation violations block execution to prevent security breaches.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');

/**
 * EntropyScanner - Detects high-entropy strings and secret patterns
 * 
 * NIST SI-10 Compliance:
 * - ENTROPY_THRESHOLD: 4.5 (Shannon entropy threshold for secret detection)
 * - MIN_LENGTH_FOR_SCAN: 16 characters (minimum string length for entropy analysis)
 */
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

/**
 * NISTValidator - NIST SP 800-53 SI-10 Input Validation
 * 
 * Validates all intents against NIST security controls:
 * 1. Path Traversal Detection (SI-10-PATH-TRAVERSAL)
 *    - Detects ../, ..\, URL-encoded variants, null bytes
 * 2. Command Injection Prevention (SI-10-COMMAND-INJECTION)
 *    - Blocks &&, ||, ;, |, backticks, $(), eval, etc.
 * 3. SSRF Protection (SI-10-SSRF-*)
 *    - Blocks localhost, private IPs, metadata services
 * 4. Secret Detection (SI-10-SECRET-DETECTION)
 *    - Scans for API keys, tokens, private keys, high-entropy strings
 * 
 * All violations result in blocking execution (valid: false).
 */
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

        // Enhanced path traversal detection
        const pathTraversalPatterns = [
            /\.\./,                    // Basic parent directory
            /\.\.\\/,                  // Windows parent directory
            /\.\.\//,                  // Unix parent directory
            /%2e%2e/i,                 // URL encoded ..
            /\.\.%2f/i,                // Mixed encoding
            /%252e%252e/i,             // Double URL encoded
            /\.\.\x00/,                // Null byte injection
            /\.\.\x2f/,                // Hex encoded slash
        ];

        for (const pattern of pathTraversalPatterns) {
            if (pattern.test(requestedPath)) {
                result.violations.push({
                    rule: 'SI-10-PATH-TRAVERSAL',
                    message: 'Path traversal attempt detected',
                    detail: `Pattern matched: ${pattern.toString()}`
                });
                result.valid = false;
                break;
            }
        }

        // Check for absolute paths pointing outside allowed directories
        if (path.isAbsolute(requestedPath)) {
            result.warnings.push({
                rule: 'SI-10-ABSOLUTE-PATH',
                message: 'Absolute path detected - verify it stays within allowed boundaries'
            });
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

            // Enhanced SSRF protection - check for private IP ranges
            // Note: parsed.hostname includes brackets for IPv6, e.g., "[::1]"
            let hostname = parsed.hostname.toLowerCase();
            
            // Remove brackets from IPv6 addresses
            if (hostname.startsWith('[') && hostname.endsWith(']')) {
                hostname = hostname.slice(1, -1);
            }
            
            // Check for localhost variations
            const localhostPatterns = [
                'localhost',
                '127.0.0.1',
                '::1',
                '0.0.0.0',
                '0000:0000:0000:0000:0000:0000:0000:0001'
            ];
            
            // Check for exact match or startsWith for IPv4 ranges
            const isLocalhost = localhostPatterns.some(pattern => {
                if (pattern.includes(':')) {
                    // For IPv6, do exact match or compressed form match
                    return hostname === pattern || hostname === pattern.replace(/0+/g, '0').replace(/:0:/g, '::');
                }
                return hostname === pattern || hostname.startsWith(pattern + '.');
            });
            
            if (isLocalhost) {
                result.violations.push({
                    rule: 'SI-10-SSRF-LOCALHOST',
                    message: 'Access to localhost/loopback addresses is blocked (SSRF prevention)'
                });
                result.valid = false;
            }

            // Check for private IP ranges (RFC 1918, RFC 4193)
            const privateIPPatterns = [
                /^10\./,                        // 10.0.0.0/8
                /^172\.(1[6-9]|2[0-9]|3[0-1])\./, // 172.16.0.0/12
                /^192\.168\./,                   // 192.168.0.0/16
                /^169\.254\./,                   // 169.254.0.0/16 (link-local)
                /^fc00:/i,                       // IPv6 Unique Local Addresses
                /^fd00:/i,                       // IPv6 Unique Local Addresses
                /^fe80:/i                        // IPv6 Link-Local
            ];

            for (const pattern of privateIPPatterns) {
                if (pattern.test(hostname)) {
                    result.violations.push({
                        rule: 'SI-10-SSRF-PRIVATE-IP',
                        message: 'Access to private IP addresses is blocked (SSRF prevention)',
                        detail: `Hostname: ${hostname}`
                    });
                    result.valid = false;
                    break;
                }
            }

            // Check for metadata service endpoints (cloud providers)
            const metadataEndpoints = [
                '169.254.169.254',  // AWS, Azure, GCP
                '169.254.170.2',    // AWS ECS
                'metadata.google.internal',
                'metadata.azure.com'
            ];

            if (metadataEndpoints.some(endpoint => hostname === endpoint || hostname.endsWith(endpoint))) {
                result.violations.push({
                    rule: 'SI-10-SSRF-METADATA',
                    message: 'Access to cloud metadata services is blocked (SSRF prevention)',
                    detail: `Hostname: ${hostname}`
                });
                result.valid = false;
            }

            // Check for suspicious URL encoding or obfuscation
            if (url.includes('%') && (url.toLowerCase().includes('%31%32%37') || url.toLowerCase().includes('%6c%6f%63%61%6c'))) {
                result.violations.push({
                    rule: 'SI-10-SSRF-ENCODED',
                    message: 'URL encoding of restricted addresses detected (SSRF prevention)'
                });
                result.valid = false;
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

        // Enhanced command injection detection
        const commandInjectionPatterns = [
            { pattern: /&&/, name: 'AND chain' },
            { pattern: /\|\|/, name: 'OR chain' },
            { pattern: /;/, name: 'semicolon separator' },
            { pattern: /\|(?!\|)/, name: 'pipe' },
            { pattern: /`/, name: 'backtick execution' },
            { pattern: /\$\(/, name: 'command substitution' },
            { pattern: />\s*[/\\]/, name: 'redirect to path' },
            { pattern: /<\s*[/\\]/, name: 'input from path' },
            { pattern: /\r|\n/, name: 'newline injection' },
            { pattern: /\x00/, name: 'null byte injection' },
            { pattern: /&\s*$/, name: 'background execution' }
        ];

        for (const { pattern, name } of commandInjectionPatterns) {
            if (pattern.test(command)) {
                result.violations.push({
                    rule: 'SI-10-COMMAND-INJECTION',
                    message: `Command injection pattern detected: ${name}`,
                    detail: `Pattern: ${pattern.toString()}`
                });
                result.valid = false;
                break;
            }
        }

        // Check for dangerous command arguments
        const dangerousArgs = [
            '--eval',
            '-e',
            'eval(',
            'exec(',
            'system(',
            'require(',
            '__import__'
        ];

        for (const dangerousArg of dangerousArgs) {
            if (command.includes(dangerousArg)) {
                result.violations.push({
                    rule: 'SI-10-DANGEROUS-COMMAND-ARG',
                    message: `Dangerous command argument detected: ${dangerousArg}`
                });
                result.valid = false;
                break;
            }
        }
    }
}

/**
 * AuditLogger - Immutable JSON audit logging
 * 
 * NIST SI-10 Compliance:
 * - Writes immutable (frozen) log entries
 * - All entries include ISO 8601 timestamps
 * - Logs stored as newline-delimited JSON
 * - Supports filtering and querying
 * - Sanitizes sensitive data before logging
 */
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

/**
 * AuditLayer - Pipeline layer for NIST SI-10 compliance
 * 
 * Integrates NISTValidator and AuditLogger into the I/O pipeline.
 * 
 * NIST SI-10 Compliance:
 * - All intents are validated against security controls
 * - All validation results are logged immutably
 * - Violations block execution (passed: false)
 * - Warnings allow execution but are logged
 * - Execution results are logged for audit trail
 */
class AuditLayer {
    constructor(logPath) {
        this.logger = new AuditLogger(logPath);
    }

    /**
     * Validates intent against NIST SI-10 controls
     * @param {Object} intent - The intent to validate
     * @param {Object} authResult - Authorization result
     * @returns {Object} Audit result with passed/failed status
     */
    audit(intent, authResult) {
        const validationResult = NISTValidator.validate(intent);

        this.logger.logIntent(intent, authResult, validationResult);

        // NIST SI-10: All violations block execution
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
