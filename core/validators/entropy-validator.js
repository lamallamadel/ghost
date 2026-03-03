const fs = require('fs');
const path = require('path');

class EntropyValidator {
    constructor(options = {}) {
        this.minEntropyThreshold = options.minEntropyThreshold || 4.5;
        this.maxEntropyThreshold = options.maxEntropyThreshold || 7.0;
        this.minLength = options.minLength || 16;
        this.maxLength = options.maxLength || 256;
        this.ignoredPatterns = options.ignoredPatterns || [];
        this.ghostIgnorePatterns = [];
        this.ghostIgnoreLoaded = false;
        this.secretRegexes = options.secretRegexes || this.getDefaultSecretRegexes();
        this.knownNonSecrets = options.knownNonSecrets || this.getDefaultNonSecrets();
    }

    getDefaultSecretRegexes() {
        return [
            { name: 'Groq API Key', regex: /gsk_[a-zA-Z0-9]{48,}/g, severity: 'critical' },
            { name: 'GitHub Token', regex: /gh[pous]_[a-zA-Z0-9]{36,}/g, severity: 'critical' },
            { name: 'GitHub Classic Token', regex: /ghp_[a-zA-Z0-9]{36,}/g, severity: 'critical' },
            { name: 'Slack Token', regex: /xox[baprs]-[0-9a-zA-Z]{10,48}/g, severity: 'high' },
            { name: 'AWS Access Key', regex: /AKIA[0-9A-Z]{16}/g, severity: 'critical' },
            { name: 'AWS Secret Key', regex: /[A-Za-z0-9/+=]{40}/g, severity: 'high' },
            { name: 'Private Key Header', regex: /-----BEGIN (RSA|EC|PGP|OPENSSH|DSA) PRIVATE KEY-----/g, severity: 'critical' },
            { name: 'Generic API Key', regex: /(?:key|api|token|secret|auth)[_-]?(?:key|api|token|secret|auth)?\s*[:=]\s*['"]([a-zA-Z0-9_\-]{16,})['"]?/gi, severity: 'medium' },
            { name: 'Bearer Token', regex: /bearer\s+[a-zA-Z0-9_\-\.]{20,}/gi, severity: 'high' },
            { name: 'Basic Auth', regex: /basic\s+[a-zA-Z0-9+/=]{20,}/gi, severity: 'high' },
            { name: 'OpenAI API Key', regex: /sk-[a-zA-Z0-9]{48,}/g, severity: 'critical' },
            { name: 'Anthropic API Key', regex: /sk-ant-[a-zA-Z0-9\-]{95,}/g, severity: 'critical' },
            { name: 'JWT Token', regex: /eyJ[a-zA-Z0-9_-]*\.eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*/g, severity: 'medium' },
            { name: 'Database Connection String', regex: /(mongodb|mysql|postgresql|postgres):\/\/[^:]+:[^@]+@[^\/]+/gi, severity: 'critical' },
            { name: 'Generic Secret Pattern', regex: /(?:secret|password|passwd|pwd)[_-]?\s*[:=]\s*['"]?([a-zA-Z0-9!@#$%^&*()_+\-=]{8,})['"]?/gi, severity: 'medium' },
            { name: 'Google Cloud Service Account Key', regex: /\{"type"\s*:\s*"service_account"[^}]*"private_key"\s*:\s*"[^"]+"/gi, severity: 'critical' },
            { name: 'Google Cloud Private Key ID', regex: /"private_key_id"\s*:\s*"[a-f0-9]{40}"/gi, severity: 'critical' },
            { name: 'Stripe Live Secret Key', regex: /sk_live_[a-zA-Z0-9]{24,}/g, severity: 'critical' },
            { name: 'Stripe Test Secret Key', regex: /sk_test_[a-zA-Z0-9]{24,}/g, severity: 'high' },
            { name: 'Stripe Live Restricted Key', regex: /rk_live_[a-zA-Z0-9]{24,}/g, severity: 'critical' },
            { name: 'Twilio API Key', regex: /SK[a-f0-9]{32}/g, severity: 'critical' },
            { name: 'Azure Storage Connection String', regex: /DefaultEndpointsProtocol=https?;.*AccountName=[^;]+;.*AccountKey=[a-zA-Z0-9+/=]{88}/gi, severity: 'critical' },
            { name: 'Azure Shared Access Signature', regex: /\?sv=\d{4}-\d{2}-\d{2}&[^\s"']+/g, severity: 'high' }
        ];
    }

    getDefaultNonSecrets() {
        return [
            'claude-3-5-sonnet',
            'claude-3-opus',
            'gemini-1.5-flash',
            'gemini-1.5-pro',
            'gemini-2.0-flash',
            'llama-3.3-70b',
            'llama-3.1-8b',
            'gpt-4',
            'gpt-3.5-turbo',
            'anthropic',
            'openai',
            'google',
            'groq',
            'ConfigManager',
            'AIEngine',
            'DEFAULT_MODEL',
            'getDashboardHTML',
            'GhostMonitor',
            'startConsoleServer',
            'example',
            'sample',
            'placeholder',
            'dummy',
            'fixture',
            'mock',
            'AKIAIOSFODNN7EXAMPLE',
            'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
            'base64',
            'encoding',
            'iVBORw0KGgo',
            'data:image'
        ];
    }

    addIgnoredPattern(pattern) {
        if (pattern && !this.ignoredPatterns.includes(pattern)) {
            this.ignoredPatterns.push(pattern);
        }
    }

    addSecretRegex(name, regex, severity = 'high') {
        if (name && regex) {
            this.secretRegexes.push({ name, regex, severity });
        }
    }

    loadGhostIgnore(repoRoot) {
        const ghostIgnorePath = path.join(repoRoot || process.cwd(), '.ghostignore');
        
        if (!fs.existsSync(ghostIgnorePath)) {
            this.ghostIgnorePatterns = [];
            this.ghostIgnoreLoaded = true;
            return;
        }

        try {
            const content = fs.readFileSync(ghostIgnorePath, 'utf8');
            this.ghostIgnorePatterns = content
                .split('\n')
                .map(line => line.trim())
                .filter(line => line && !line.startsWith('#'));
            this.ghostIgnoreLoaded = true;
        } catch (error) {
            this.ghostIgnorePatterns = [];
            this.ghostIgnoreLoaded = true;
        }
    }

    isIgnored(content) {
        if (!content || typeof content !== 'string') {
            return false;
        }

        for (const pattern of this.ignoredPatterns) {
            if (content.includes(pattern)) {
                return true;
            }
        }

        for (const pattern of this.ghostIgnorePatterns) {
            if (content.includes(pattern)) {
                return true;
            }
        }

        return false;
    }

    isKnownNonSecret(content) {
        if (!content || typeof content !== 'string') {
            return false;
        }

        const lowerContent = content.toLowerCase();

        for (const nonSecret of this.knownNonSecrets) {
            if (lowerContent.includes(nonSecret.toLowerCase())) {
                return true;
            }
        }

        if (/\b(example|test|sample|placeholder|dummy|fixture|mock)\b/i.test(content)) {
            return true;
        }

        if (/data:image\/[a-z]+;base64,/i.test(content)) {
            return true;
        }

        if (/^[A-Za-z0-9+/]{40,}={0,2}$/.test(content) && content.length % 4 === 0) {
            const alphaCount = (content.match(/[a-zA-Z]/g) || []).length;
            const digitCount = (content.match(/[0-9]/g) || []).length;
            if (alphaCount === 0 || digitCount === 0) {
                return true;
            }
        }

        return false;
    }

    calculateShannonEntropy(data) {
        if (!data || typeof data !== 'string' || data.length === 0) {
            return 0;
        }

        const frequencies = {};
        for (const char of data) {
            frequencies[char] = (frequencies[char] || 0) + 1;
        }

        let entropy = 0;
        const length = data.length;
        
        for (const char in frequencies) {
            const probability = frequencies[char] / length;
            entropy -= probability * Math.log2(probability);
        }

        return entropy;
    }

    hasHighEntropy(content) {
        if (!content || typeof content !== 'string') {
            return false;
        }

        if (content.length < this.minLength || content.length > this.maxLength) {
            return false;
        }

        if (this.isKnownNonSecret(content) || this.isIgnored(content)) {
            return false;
        }

        const entropy = this.calculateShannonEntropy(content);
        
        return entropy >= this.minEntropyThreshold && entropy <= this.maxEntropyThreshold;
    }

    extractCandidatesFromText(text) {
        if (!text || typeof text !== 'string') {
            return [];
        }

        const candidates = [];
        
        const patterns = [
            /(['"])(.*?)(\1)/g,
            /=\s*([^\s;,]+)/g,
            /:\s*([^\s;,\n]+)/g
        ];

        for (const pattern of patterns) {
            let match;
            while ((match = pattern.exec(text)) !== null) {
                const candidate = match[2] || match[1];
                if (candidate && candidate.length >= this.minLength && candidate.length <= this.maxLength) {
                    candidates.push(candidate);
                }
            }
        }

        return [...new Set(candidates)];
    }

    detectSecretsByRegex(content) {
        if (!content || typeof content !== 'string') {
            return [];
        }

        const detected = [];

        for (const { name, regex, severity } of this.secretRegexes) {
            const matches = content.match(regex);
            
            if (matches) {
                for (const match of matches) {
                    if (this.isKnownNonSecret(match) || this.isIgnored(match)) {
                        continue;
                    }

                    const display = match.length > 30 
                        ? match.substring(0, 30) + '...' 
                        : match;
                    
                    detected.push({
                        type: name,
                        value: match,
                        display: display,
                        method: 'regex',
                        severity: severity || 'high'
                    });
                }
            }
        }

        return detected;
    }

    detectSecretsByEntropy(content) {
        if (!content || typeof content !== 'string') {
            return [];
        }

        const candidates = this.extractCandidatesFromText(content);
        const detected = [];

        for (const candidate of candidates) {
            if (this.hasHighEntropy(candidate)) {
                const entropy = this.calculateShannonEntropy(candidate);
                const display = candidate.length > 30 
                    ? candidate.substring(0, 30) + '...' 
                    : candidate;

                detected.push({
                    type: 'High Entropy String',
                    value: candidate,
                    display: display,
                    method: 'entropy',
                    entropy: entropy.toFixed(2),
                    severity: entropy > 5.5 ? 'high' : 'medium'
                });
            }
        }

        return detected;
    }

    scanContent(content, options = {}) {
        if (!content || typeof content !== 'string') {
            return {
                hasSecrets: false,
                secrets: [],
                summary: {
                    total: 0,
                    byMethod: {},
                    bySeverity: {}
                }
            };
        }

        const useRegex = options.useRegex !== false;
        const useEntropy = options.useEntropy !== false;

        let allSecrets = [];

        if (useRegex) {
            const regexSecrets = this.detectSecretsByRegex(content);
            allSecrets = allSecrets.concat(regexSecrets);
        }

        if (useEntropy) {
            const entropySecrets = this.detectSecretsByEntropy(content);
            allSecrets = allSecrets.concat(entropySecrets);
        }

        const uniqueSecrets = [];
        const seen = new Set();

        for (const secret of allSecrets) {
            const key = `${secret.type}:${secret.value}`;
            if (!seen.has(key)) {
                seen.add(key);
                uniqueSecrets.push(secret);
            }
        }

        const summary = {
            total: uniqueSecrets.length,
            byMethod: {},
            bySeverity: {}
        };

        for (const secret of uniqueSecrets) {
            summary.byMethod[secret.method] = (summary.byMethod[secret.method] || 0) + 1;
            summary.bySeverity[secret.severity] = (summary.bySeverity[secret.severity] || 0) + 1;
        }

        return {
            hasSecrets: uniqueSecrets.length > 0,
            secrets: uniqueSecrets,
            summary: summary
        };
    }

    scanContentForIntent(content, ghostIgnorePath = null) {
        if (!this.ghostIgnoreLoaded && ghostIgnorePath) {
            const repoRoot = ghostIgnorePath ? path.dirname(ghostIgnorePath) : null;
            this.loadGhostIgnore(repoRoot);
        } else if (!this.ghostIgnoreLoaded) {
            this.loadGhostIgnore(process.cwd());
        }

        const scanResult = this.scanContent(content, { useRegex: true, useEntropy: true });

        if (!scanResult.hasSecrets) {
            return {
                valid: true,
                violations: []
            };
        }

        const violations = scanResult.secrets.map(secret => ({
            rule: 'SI-10-SECRET-DETECTION',
            message: `Potential secret detected: ${secret.type}`,
            severity: secret.severity,
            detail: secret.display,
            method: secret.method
        }));

        return {
            valid: false,
            violations: violations
        };
    }

    scanFile(filePath, options = {}) {
        if (!filePath || !fs.existsSync(filePath)) {
            throw new Error(`File does not exist: ${filePath}`);
        }

        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const result = this.scanContent(content, options);
            
            return {
                ...result,
                file: filePath
            };
        } catch (error) {
            throw new Error(`Failed to scan file ${filePath}: ${error.message}`);
        }
    }

    scanDirectory(dirPath, options = {}) {
        if (!dirPath || !fs.existsSync(dirPath)) {
            throw new Error(`Directory does not exist: ${dirPath}`);
        }

        const results = [];
        const extensions = options.extensions || ['.js', '.ts', '.json', '.env', '.yaml', '.yml', '.config'];
        const excludeDirs = options.excludeDirs || ['node_modules', '.git', 'dist', 'build'];

        const scanRecursive = (currentPath) => {
            const entries = fs.readdirSync(currentPath, { withFileTypes: true });

            for (const entry of entries) {
                const fullPath = path.join(currentPath, entry.name);

                if (entry.isDirectory()) {
                    if (!excludeDirs.includes(entry.name)) {
                        scanRecursive(fullPath);
                    }
                } else if (entry.isFile()) {
                    const ext = path.extname(entry.name);
                    if (extensions.includes(ext)) {
                        try {
                            const result = this.scanFile(fullPath, options);
                            if (result.hasSecrets) {
                                results.push(result);
                            }
                        } catch (error) {
                            // Skip files that can't be read
                        }
                    }
                }
            }
        };

        scanRecursive(dirPath);

        return {
            totalFiles: results.length,
            totalSecrets: results.reduce((sum, r) => sum + r.summary.total, 0),
            files: results
        };
    }

    static createDefault(repoRoot) {
        const validator = new EntropyValidator({
            minEntropyThreshold: 4.5,
            maxEntropyThreshold: 7.0,
            minLength: 16,
            maxLength: 256
        });
        validator.loadGhostIgnore(repoRoot);
        return validator;
    }

    static createStrict(repoRoot) {
        const validator = new EntropyValidator({
            minEntropyThreshold: 4.0,
            maxEntropyThreshold: 7.5,
            minLength: 12,
            maxLength: 512
        });
        validator.loadGhostIgnore(repoRoot);
        return validator;
    }

    static createLenient(repoRoot) {
        const validator = new EntropyValidator({
            minEntropyThreshold: 5.0,
            maxEntropyThreshold: 6.5,
            minLength: 20,
            maxLength: 200
        });
        validator.loadGhostIgnore(repoRoot);
        return validator;
    }
}

module.exports = EntropyValidator;
