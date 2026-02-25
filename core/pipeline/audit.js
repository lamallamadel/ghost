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
const os = require('os');
const PathValidator = require('../validators/path-validator');
const NetworkValidator = require('../validators/network-validator');
const CommandValidator = require('../validators/command-validator');
const EntropyValidator = require('../validators/entropy-validator');

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
        const entry = {
            type: 'SECURITY_EVENT',
            extensionId,
            eventType,
            details
        };

        if (details.severity) {
            entry.severity = details.severity;
        }

        if (details.rule) {
            entry.rule = details.rule;
        }

        return this.log(entry);
    }

    _sanitizeParams(params) {
        const entropyValidator = new EntropyValidator();
        const sanitized = { ...params };
        
        if (sanitized.content && typeof sanitized.content === 'string') {
            const scanResult = entropyValidator.scanContent(sanitized.content);
            if (scanResult.hasSecrets) {
                sanitized.content = '[CONTENT REDACTED - CONTAINS SECRETS]';
            }
        }
        
        if (sanitized.data && typeof sanitized.data === 'object') {
            const dataStr = JSON.stringify(sanitized.data);
            const scanResult = entropyValidator.scanContent(dataStr);
            if (scanResult.hasSecrets) {
                sanitized.data = '[DATA REDACTED - CONTAINS SECRETS]';
            }
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
 * Integrates standalone validators into the I/O pipeline.
 * 
 * NIST SI-10 Compliance:
 * - All intents are validated against security controls
 * - All validation results are logged immutably
 * - Violations block execution (passed: false)
 * - Warnings allow execution but are logged
 * - Execution results are logged for audit trail
 */
class AuditLayer {
    constructor(logPath, manifestCapabilities = null) {
        this.logger = new AuditLogger(logPath);
        this.manifestCapabilities = manifestCapabilities;
        this.pathValidator = null;
        this.networkValidator = null;
        this.commandValidator = null;
        this.entropyValidator = EntropyValidator.createDefault(process.cwd());
        
        this._initializeValidators();
    }

    _initializeValidators() {
        if (this.manifestCapabilities) {
            const fsCapabilities = this.manifestCapabilities.filesystem;
            if (fsCapabilities) {
                const patterns = [
                    ...(fsCapabilities.read || []),
                    ...(fsCapabilities.write || [])
                ];
                this.pathValidator = new PathValidator({
                    rootDirectory: process.cwd(),
                    allowedPatterns: patterns,
                    allowedPaths: [],
                    deniedPaths: []
                });
            }

            const networkCapabilities = this.manifestCapabilities.network;
            if (networkCapabilities && networkCapabilities.allowlist) {
                const allowedDomains = networkCapabilities.allowlist.map(url => {
                    try {
                        const parsed = new URL(url);
                        return parsed.hostname;
                    } catch {
                        return null;
                    }
                }).filter(d => d !== null);

                this.networkValidator = new NetworkValidator({
                    allowedSchemes: ['https', 'http'],
                    allowedDomains: allowedDomains,
                    requireTLS: false,
                    allowPrivateIPs: false,
                    allowLocalhostIPs: false
                });
            }

            const gitCapabilities = this.manifestCapabilities.git;
            if (gitCapabilities) {
                this.commandValidator = new CommandValidator({
                    allowedCommands: ['git'],
                    allowedGitSubcommands: this._getGitSubcommandsFromCapabilities(gitCapabilities),
                    deniedArguments: ['--exec', '-c', 'core.sshCommand', 'core.gitProxy'],
                    maxArgumentLength: 1000,
                    allowShellExpansion: false
                });
            }
        }
    }

    _getGitSubcommandsFromCapabilities(gitCapabilities) {
        const readCommands = [
            'status', 'diff', 'log', 'show', 'branch', 'tag', 'rev-parse',
            'describe', 'ls-files', 'ls-tree', 'cat-file', 'config', 'remote'
        ];

        const writeCommands = [
            'fetch', 'pull', 'push', 'checkout', 'add', 'commit',
            'merge', 'rebase', 'reset', 'stash', 'clean'
        ];

        const allowedSubcommands = [];

        if (gitCapabilities.read) {
            allowedSubcommands.push(...readCommands);
        }

        if (gitCapabilities.write) {
            allowedSubcommands.push(...writeCommands);
        }

        return allowedSubcommands;
    }

    /**
     * Validates intent against NIST SI-10 controls
     * @param {Object} intent - The intent to validate
     * @param {Object} authResult - Authorization result
     * @returns {Object} Audit result with passed/failed status
     */
    audit(intent, authResult) {
        const validationResult = this._validate(intent);

        this.logger.logIntent(intent, authResult, validationResult);

        if (!validationResult.valid) {
            for (const violation of validationResult.violations) {
                this.logger.logSecurityEvent(
                    intent.extensionId,
                    'VALIDATION_VIOLATION',
                    {
                        severity: violation.severity || 'high',
                        rule: violation.rule,
                        message: violation.message,
                        detail: violation.detail
                    }
                );
            }

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

    _validate(intent) {
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
            const paramsStr = typeof intent.params === 'string' 
                ? intent.params 
                : JSON.stringify(intent.params);
            
            const entropyResult = this.entropyValidator.scanContentForIntent(paramsStr);
            
            if (!entropyResult.valid && entropyResult.violations.length > 0) {
                result.violations.push(...entropyResult.violations);
                result.valid = false;
            }
        }

        return result;
    }

    _validateFilesystem(intent, result) {
        const requestedPath = intent.params.path;
        
        if (!requestedPath || typeof requestedPath !== 'string') {
            result.violations.push({
                rule: 'SI-10-PATH-VALIDATION',
                message: 'Invalid or missing path parameter',
                severity: 'high'
            });
            result.valid = false;
            return;
        }

        if (this.manifestCapabilities && this.manifestCapabilities.filesystem) {
            const fsCapabilities = this.manifestCapabilities.filesystem;
            const operation = intent.operation || 'read';
            const patterns = operation === 'write' 
                ? (fsCapabilities.write || []) 
                : (fsCapabilities.read || []);

            const pathValidation = PathValidator.validateFromManifest(
                requestedPath,
                patterns,
                process.cwd()
            );

            if (!pathValidation.allowed) {
                result.violations.push({
                    rule: 'SI-10-PATH-TRAVERSAL',
                    message: pathValidation.reason,
                    severity: 'high',
                    detail: `Path: ${requestedPath}`
                });
                result.valid = false;
                return;
            }
        }

        if (intent.operation === 'write' && intent.params.content) {
            const contentValidation = this.entropyValidator.scanContentForIntent(intent.params.content);
            
            if (!contentValidation.valid) {
                for (const violation of contentValidation.violations) {
                    result.violations.push({
                        rule: 'SI-10-CONTENT-SECRETS',
                        message: 'Secrets detected in write content',
                        severity: violation.severity || 'high',
                        detail: violation.detail,
                        method: violation.method
                    });
                }
                result.valid = false;
            }
        }
    }

    _validateNetwork(intent, result) {
        const url = intent.params.url;
        
        if (!url || typeof url !== 'string') {
            result.violations.push({
                rule: 'SI-10-URL-VALIDATION',
                message: 'Invalid or missing URL parameter',
                severity: 'high'
            });
            result.valid = false;
            return;
        }

        if (this.manifestCapabilities && this.manifestCapabilities.network) {
            const networkCap = this.manifestCapabilities.network;
            const allowedDomains = [];
            
            if (networkCap.allowlist && Array.isArray(networkCap.allowlist)) {
                for (const allowedUrl of networkCap.allowlist) {
                    try {
                        const parsed = new URL(allowedUrl);
                        allowedDomains.push(parsed.hostname);
                    } catch {
                        // Skip invalid URLs in allowlist
                    }
                }
            }

            const manifestForValidation = {
                schemes: ['https', 'http'],
                domains: allowedDomains,
                ports: [],
                deniedDomains: [],
                deniedIPs: [],
                requireTLS: false,
                allowPrivateIPs: false,
                allowLocalhostIPs: false
            };

            const networkValidation = NetworkValidator.validateFromManifest(
                url,
                manifestForValidation
            );

            if (!networkValidation.valid) {
                const severityMap = {
                    'SI-10-SSRF-LOCALHOST': 'critical',
                    'SI-10-SSRF-PRIVATE-IP': 'critical',
                    'SI-10-SSRF-METADATA': 'critical',
                    'SI-10-SSRF-ENCODED': 'critical',
                    'SI-10-PROTOCOL-ALLOWLIST': 'high',
                    'SI-10-URL-VALIDATION': 'high'
                };

                const rule = this._extractRuleFromNetworkReason(networkValidation.reason);
                const severity = severityMap[rule] || 'high';

                result.violations.push({
                    rule: rule,
                    message: networkValidation.reason,
                    severity: severity,
                    detail: `URL: ${url}`
                });
                result.valid = false;
            }
        }
    }

    _extractRuleFromNetworkReason(reason) {
        if (!reason) return 'SI-10-URL-VALIDATION';
        
        const reasonLower = reason.toLowerCase();
        
        if (reasonLower.includes('localhost') || reasonLower.includes('loopback')) {
            return 'SI-10-SSRF-LOCALHOST';
        }
        if (reasonLower.includes('private ip')) {
            return 'SI-10-SSRF-PRIVATE-IP';
        }
        if (reasonLower.includes('metadata')) {
            return 'SI-10-SSRF-METADATA';
        }
        if (reasonLower.includes('url encoding') || reasonLower.includes('obfuscation')) {
            return 'SI-10-SSRF-ENCODED';
        }
        if (reasonLower.includes('protocol') || reasonLower.includes('scheme')) {
            return 'SI-10-PROTOCOL-ALLOWLIST';
        }
        
        return 'SI-10-URL-VALIDATION';
    }

    _validateProcess(intent, result) {
        const command = intent.params.command;
        
        if (!command || typeof command !== 'string') {
            result.violations.push({
                rule: 'SI-10-COMMAND-VALIDATION',
                message: 'Invalid or missing command parameter',
                severity: 'high'
            });
            result.valid = false;
            return;
        }

        const commandParts = command.split(/\s+/);
        const baseCommand = commandParts[0];
        const args = commandParts.slice(1);

        if (this.manifestCapabilities) {
            const commandValidation = CommandValidator.validateFromManifest(
                baseCommand,
                args,
                this.manifestCapabilities
            );

            if (!commandValidation.valid) {
                const severityMap = {
                    'SI-10-COMMAND-INJECTION': 'critical',
                    'SI-10-DANGEROUS-COMMAND-ARG': 'critical',
                    'SI-10-COMMAND-VALIDATION': 'high',
                    'SI-10-COMMAND-ALLOWLIST': 'medium'
                };

                const rule = this._extractRuleFromCommandReason(commandValidation.reason);
                const severity = severityMap[rule] || 'high';

                result.violations.push({
                    rule: rule,
                    message: commandValidation.reason,
                    severity: severity,
                    detail: `Command: ${command}`
                });
                result.valid = false;
            }
        }
    }

    _extractRuleFromCommandReason(reason) {
        if (!reason) return 'SI-10-COMMAND-VALIDATION';
        
        const reasonLower = reason.toLowerCase();
        
        if (reasonLower.includes('injection')) {
            return 'SI-10-COMMAND-INJECTION';
        }
        if (reasonLower.includes('dangerous') || reasonLower.includes('denied argument')) {
            return 'SI-10-DANGEROUS-COMMAND-ARG';
        }
        if (reasonLower.includes('not in allowed') || reasonLower.includes('not allowed')) {
            return 'SI-10-COMMAND-ALLOWLIST';
        }
        
        return 'SI-10-COMMAND-VALIDATION';
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
    AuditLogger
};
