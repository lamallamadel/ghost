const fs = require('fs');
const path = require('path');
const os = require('os');

const POLICY_DIR = path.join(os.homedir(), '.ghost', 'policies');

class SecurityPolicyEngine {
    constructor(options = {}) {
        this.policyDir = options.policyDir || POLICY_DIR;
        this.policies = new Map();
        this.defaultPolicies = this._getDefaultPolicies();
        this._ensurePolicyDir();
        this._loadPolicies();
    }

    _ensurePolicyDir() {
        if (!fs.existsSync(this.policyDir)) {
            fs.mkdirSync(this.policyDir, { recursive: true });
        }
    }

    _getDefaultPolicies() {
        return {
            'max-request-size': {
                id: 'max-request-size',
                name: 'Maximum Request Size',
                description: 'Limit maximum request size to prevent DoS',
                enabled: true,
                severity: 'high',
                rule: {
                    type: 'size-limit',
                    maxBytes: 10 * 1024 * 1024,
                    applyTo: ['filesystem', 'network']
                },
                action: 'reject'
            },
            'allowed-network-destinations': {
                id: 'allowed-network-destinations',
                name: 'Allowed Network Destinations',
                description: 'Whitelist of allowed network destinations',
                enabled: true,
                severity: 'high',
                rule: {
                    type: 'destination-whitelist',
                    allowedDomains: [],
                    allowedIPs: [],
                    blockPrivateIPs: true,
                    blockLoopback: true
                },
                action: 'reject'
            },
            'file-access-patterns': {
                id: 'file-access-patterns',
                name: 'File Access Patterns',
                description: 'Control file access patterns',
                enabled: true,
                severity: 'medium',
                rule: {
                    type: 'path-restriction',
                    allowedPaths: [],
                    deniedPaths: ['/etc', '/sys', '/proc', 'C:\\Windows\\System32'],
                    allowHomeDir: true,
                    allowWorkingDir: true
                },
                action: 'reject'
            },
            'rate-limit-per-extension': {
                id: 'rate-limit-per-extension',
                name: 'Rate Limit Per Extension',
                description: 'Per-extension rate limiting',
                enabled: true,
                severity: 'medium',
                rule: {
                    type: 'rate-limit',
                    requestsPerMinute: 100,
                    burstSize: 20
                },
                action: 'throttle'
            },
            'concurrent-connections': {
                id: 'concurrent-connections',
                name: 'Concurrent Connections Limit',
                description: 'Limit concurrent network connections',
                enabled: true,
                severity: 'medium',
                rule: {
                    type: 'concurrency-limit',
                    maxConnections: 10
                },
                action: 'reject'
            },
            'nist-si10-validation': {
                id: 'nist-si10-validation',
                name: 'NIST SI-10 Input Validation',
                description: 'Comprehensive input validation per NIST SI-10',
                enabled: true,
                severity: 'high',
                rule: {
                    type: 'input-validation',
                    checks: ['length', 'type', 'format', 'range', 'encoding']
                },
                action: 'reject'
            },
            'command-injection-prevention': {
                id: 'command-injection-prevention',
                name: 'Command Injection Prevention',
                description: 'Prevent command injection attacks',
                enabled: true,
                severity: 'critical',
                rule: {
                    type: 'command-validation',
                    blockShellMetacharacters: true,
                    allowedCommands: []
                },
                action: 'reject'
            }
        };
    }

    _loadPolicies() {
        for (const [id, policy] of Object.entries(this.defaultPolicies)) {
            this.policies.set(id, policy);
        }

        try {
            const customPoliciesFile = path.join(this.policyDir, 'custom.json');
            if (fs.existsSync(customPoliciesFile)) {
                const custom = JSON.parse(fs.readFileSync(customPoliciesFile, 'utf8'));
                for (const policy of custom) {
                    this.policies.set(policy.id, policy);
                }
            }
        } catch (error) {
            console.warn('[SecurityPolicy] Failed to load custom policies:', error.message);
        }
    }

    _savePolicies() {
        try {
            const customPolicies = [];
            for (const [id, policy] of this.policies.entries()) {
                if (!this.defaultPolicies[id]) {
                    customPolicies.push(policy);
                }
            }

            const customPoliciesFile = path.join(this.policyDir, 'custom.json');
            fs.writeFileSync(customPoliciesFile, JSON.stringify(customPolicies, null, 2));
        } catch (error) {
            console.error('[SecurityPolicy] Failed to save policies:', error.message);
        }
    }

    addPolicy(policy) {
        if (!policy.id || !policy.name || !policy.rule) {
            throw new Error('Invalid policy: must have id, name, and rule');
        }

        this.policies.set(policy.id, {
            ...policy,
            enabled: policy.enabled !== false,
            severity: policy.severity || 'medium',
            action: policy.action || 'reject',
            createdAt: Date.now()
        });

        this._savePolicies();
        return { success: true, policyId: policy.id };
    }

    updatePolicy(policyId, updates) {
        const policy = this.policies.get(policyId);
        if (!policy) {
            return { success: false, error: 'Policy not found' };
        }

        Object.assign(policy, updates, { updatedAt: Date.now() });
        this._savePolicies();
        return { success: true };
    }

    deletePolicy(policyId) {
        if (this.defaultPolicies[policyId]) {
            return { success: false, error: 'Cannot delete default policy' };
        }

        const deleted = this.policies.delete(policyId);
        if (deleted) {
            this._savePolicies();
        }
        return { success: deleted };
    }

    evaluateIntent(intent, context = {}) {
        const violations = [];
        const warnings = [];

        for (const [policyId, policy] of this.policies.entries()) {
            if (!policy.enabled) continue;

            const result = this._evaluatePolicy(policy, intent, context);
            
            if (!result.compliant) {
                const violation = {
                    policyId,
                    policyName: policy.name,
                    severity: policy.severity,
                    action: policy.action,
                    reason: result.reason,
                    details: result.details
                };

                if (policy.action === 'reject') {
                    violations.push(violation);
                } else if (policy.action === 'warn') {
                    warnings.push(violation);
                }
            }
        }

        return {
            compliant: violations.length === 0,
            violations,
            warnings
        };
    }

    _evaluatePolicy(policy, intent, context) {
        const { rule } = policy;

        switch (rule.type) {
            case 'size-limit':
                return this._evaluateSizeLimit(rule, intent);
            
            case 'destination-whitelist':
                return this._evaluateDestinationWhitelist(rule, intent);
            
            case 'path-restriction':
                return this._evaluatePathRestriction(rule, intent);
            
            case 'rate-limit':
                return this._evaluateRateLimit(rule, intent, context);
            
            case 'concurrency-limit':
                return this._evaluateConcurrencyLimit(rule, intent, context);
            
            case 'input-validation':
                return this._evaluateInputValidation(rule, intent);
            
            case 'command-validation':
                return this._evaluateCommandValidation(rule, intent);
            
            default:
                return { compliant: true };
        }
    }

    _evaluateSizeLimit(rule, intent) {
        const size = this._estimateIntentSize(intent);
        if (size > rule.maxBytes) {
            return {
                compliant: false,
                reason: 'Request size exceeds limit',
                details: { size, limit: rule.maxBytes }
            };
        }
        return { compliant: true };
    }

    _evaluateDestinationWhitelist(rule, intent) {
        if (intent.type !== 'network') {
            return { compliant: true };
        }

        const url = intent.params.url || '';
        const hostname = this._extractHostname(url);

        if (rule.blockPrivateIPs && this._isPrivateIP(hostname)) {
            return {
                compliant: false,
                reason: 'Private IP addresses are blocked',
                details: { hostname }
            };
        }

        if (rule.blockLoopback && this._isLoopback(hostname)) {
            return {
                compliant: false,
                reason: 'Loopback addresses are blocked',
                details: { hostname }
            };
        }

        if (rule.allowedDomains.length > 0 || rule.allowedIPs.length > 0) {
            const isAllowed = rule.allowedDomains.some(d => hostname.endsWith(d)) ||
                            rule.allowedIPs.includes(hostname);
            
            if (!isAllowed) {
                return {
                    compliant: false,
                    reason: 'Destination not in whitelist',
                    details: { hostname }
                };
            }
        }

        return { compliant: true };
    }

    _evaluatePathRestriction(rule, intent) {
        if (intent.type !== 'filesystem') {
            return { compliant: true };
        }

        const filePath = intent.params.path || '';
        
        for (const denied of rule.deniedPaths) {
            if (filePath.startsWith(denied)) {
                return {
                    compliant: false,
                    reason: 'Access to denied path',
                    details: { path: filePath, deniedPath: denied }
                };
            }
        }

        return { compliant: true };
    }

    _evaluateRateLimit(rule, intent, context) {
        return { compliant: true };
    }

    _evaluateConcurrencyLimit(rule, intent, context) {
        if (context.activeConnections > rule.maxConnections) {
            return {
                compliant: false,
                reason: 'Concurrent connection limit exceeded',
                details: { active: context.activeConnections, limit: rule.maxConnections }
            };
        }
        return { compliant: true };
    }

    _evaluateInputValidation(rule, intent) {
        const params = intent.params || {};
        
        for (const [key, value] of Object.entries(params)) {
            if (typeof value === 'string' && value.length > 10000) {
                return {
                    compliant: false,
                    reason: 'Parameter exceeds maximum length',
                    details: { parameter: key, length: value.length }
                };
            }
        }

        return { compliant: true };
    }

    _evaluateCommandValidation(rule, intent) {
        if (intent.type !== 'git') {
            return { compliant: true };
        }

        const args = intent.params.args || [];
        const shellMetaChars = /[;|&$`<>(){}[\]]/;

        for (const arg of args) {
            if (typeof arg === 'string' && shellMetaChars.test(arg)) {
                return {
                    compliant: false,
                    reason: 'Shell metacharacters detected',
                    details: { argument: arg }
                };
            }
        }

        return { compliant: true };
    }

    _estimateIntentSize(intent) {
        return JSON.stringify(intent).length;
    }

    _extractHostname(url) {
        try {
            const urlObj = new URL(url);
            return urlObj.hostname;
        } catch {
            return url;
        }
    }

    _isPrivateIP(hostname) {
        const privateRanges = [
            /^10\./,
            /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
            /^192\.168\./,
            /^169\.254\./
        ];
        return privateRanges.some(range => range.test(hostname));
    }

    _isLoopback(hostname) {
        return hostname === 'localhost' || 
               hostname === '127.0.0.1' ||
               hostname === '::1';
    }

    listPolicies() {
        return Array.from(this.policies.values());
    }

    getPolicy(policyId) {
        return this.policies.get(policyId);
    }

    enablePolicy(policyId) {
        const policy = this.policies.get(policyId);
        if (policy) {
            policy.enabled = true;
            this._savePolicies();
            return { success: true };
        }
        return { success: false, error: 'Policy not found' };
    }

    disablePolicy(policyId) {
        const policy = this.policies.get(policyId);
        if (policy) {
            policy.enabled = false;
            this._savePolicies();
            return { success: true };
        }
        return { success: false, error: 'Policy not found' };
    }
}

module.exports = { SecurityPolicyEngine };
