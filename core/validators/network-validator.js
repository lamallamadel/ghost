const { URL } = require('url');
const dns = require('dns').promises;

class NetworkValidator {
    constructor(options = {}) {
        this.allowedSchemes = options.allowedSchemes || ['https'];
        this.allowedDomains = options.allowedDomains || [];
        this.allowedPorts = options.allowedPorts || [];
        this.deniedDomains = options.deniedDomains || [];
        this.deniedIPs = options.deniedIPs || [];
        this.requireTLS = options.requireTLS !== false;
        this.allowPrivateIPs = options.allowPrivateIPs || false;
        this.allowLocalhostIPs = options.allowLocalhostIPs || false;
    }

    addAllowedScheme(scheme) {
        const normalized = scheme.toLowerCase().replace(/:$/, '');
        if (normalized && !this.allowedSchemes.includes(normalized)) {
            this.allowedSchemes.push(normalized);
        }
    }

    addAllowedDomain(domain) {
        const normalized = this.normalizeDomain(domain);
        if (normalized && !this.allowedDomains.includes(normalized)) {
            this.allowedDomains.push(normalized);
        }
    }

    addDeniedDomain(domain) {
        const normalized = this.normalizeDomain(domain);
        if (normalized && !this.deniedDomains.includes(normalized)) {
            this.deniedDomains.push(normalized);
        }
    }

    addDeniedIP(ip) {
        if (ip && !this.deniedIPs.includes(ip)) {
            this.deniedIPs.push(ip);
        }
    }

    normalizeDomain(domain) {
        if (!domain || typeof domain !== 'string') {
            return null;
        }
        return domain.toLowerCase().trim();
    }

    parseURL(urlString) {
        if (!urlString || typeof urlString !== 'string') {
            return null;
        }

        try {
            return new URL(urlString);
        } catch (error) {
            return null;
        }
    }

    decodeURLEncodedString(str) {
        try {
            let decoded = str;
            let previous = '';
            while (decoded !== previous) {
                previous = decoded;
                decoded = decodeURIComponent(decoded);
            }
            return decoded;
        } catch (error) {
            return str;
        }
    }

    normalizeIPNotation(hostname) {
        if (!hostname || typeof hostname !== 'string') {
            return hostname;
        }

        if (/^0x[0-9a-fA-F]+$/i.test(hostname)) {
            const num = parseInt(hostname, 16);
            if (num <= 0xFFFFFFFF) {
                return this.decimalToIPv4(num);
            }
        }

        if (/^0[0-7]+$/.test(hostname)) {
            const num = parseInt(hostname, 8);
            if (num <= 0xFFFFFFFF) {
                return this.decimalToIPv4(num);
            }
        }

        if (/^\d+$/.test(hostname)) {
            const num = parseInt(hostname, 10);
            if (num <= 0xFFFFFFFF) {
                return this.decimalToIPv4(num);
            }
        }

        const dottedMixedPattern = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/;
        const match = hostname.match(dottedMixedPattern);
        if (match) {
            const octets = [
                parseInt(match[1], 10),
                parseInt(match[2], 10),
                parseInt(match[3], 10),
                parseInt(match[4], 10)
            ];
            if (octets.every(octet => octet >= 0 && octet <= 255)) {
                return hostname;
            }
        }

        return hostname;
    }

    decimalToIPv4(num) {
        return [
            (num >>> 24) & 0xFF,
            (num >>> 16) & 0xFF,
            (num >>> 8) & 0xFF,
            num & 0xFF
        ].join('.');
    }

    isPrivateIP(hostname) {
        const ipv4Patterns = [
            /^10\./,
            /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
            /^192\.168\./,
            /^169\.254\./
        ];

        const ipv6Patterns = [
            /^fe80:/i,
            /^fc00:/i,
            /^fd00:/i
        ];

        return ipv4Patterns.some(pattern => pattern.test(hostname)) ||
               ipv6Patterns.some(pattern => pattern.test(hostname));
    }

    isLocalhostIP(hostname) {
        const localhostPatterns = [
            'localhost',
            '127.0.0.1',
            '::1',
            '0.0.0.0'
        ];

        return localhostPatterns.includes(hostname.toLowerCase()) ||
               /^127\./.test(hostname) ||
               /^::1$/.test(hostname);
    }

    isIPAddress(hostname) {
        const ipv4Pattern = /^(\d{1,3}\.){3}\d{1,3}$/;
        const ipv6Pattern = /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/;
        
        return ipv4Pattern.test(hostname) || ipv6Pattern.test(hostname);
    }

    isCloudMetadataEndpoint(hostname) {
        const metadataEndpoints = [
            '169.254.169.254',
            '169.254.170.2',
            'metadata.google.internal',
            'metadata.azure.com'
        ];

        return metadataEndpoints.some(endpoint => 
            hostname === endpoint || hostname.endsWith('.' + endpoint)
        );
    }

    matchesDomain(hostname, pattern) {
        const normalizedHostname = this.normalizeDomain(hostname);
        const normalizedPattern = this.normalizeDomain(pattern);

        if (!normalizedHostname || !normalizedPattern) {
            return false;
        }

        if (normalizedPattern.startsWith('*.')) {
            const baseDomain = normalizedPattern.substring(2);
            return normalizedHostname === baseDomain || 
                   normalizedHostname.endsWith('.' + baseDomain);
        }

        return normalizedHostname === normalizedPattern;
    }

    matchesAnyDomain(hostname, domains) {
        return domains.some(domain => this.matchesDomain(hostname, domain));
    }

    isSSRFAttempt(hostname) {
        if (this.isLocalhostIP(hostname) && !this.allowLocalhostIPs) {
            return {
                isSSRF: true,
                reason: 'Localhost access not allowed (SSRF prevention)'
            };
        }

        if (this.isPrivateIP(hostname) && !this.allowPrivateIPs) {
            return {
                isSSRF: true,
                reason: 'Private IP access not allowed (SSRF prevention)'
            };
        }

        if (this.isCloudMetadataEndpoint(hostname)) {
            return {
                isSSRF: true,
                reason: 'Cloud metadata service access blocked (SSRF prevention)'
            };
        }

        return {
            isSSRF: false,
            reason: null
        };
    }

    async resolveAndValidate(urlString) {
        const decodedURL = this.decodeURLEncodedString(urlString);
        
        if (decodedURL !== urlString) {
            const urlEncodingCheck = this.detectURLEncodingObfuscation(urlString);
            if (urlEncodingCheck.detected) {
                return {
                    valid: false,
                    reason: `URL-encoding obfuscation detected: ${urlEncodingCheck.reason}`
                };
            }
        }

        const parsedURL = this.parseURL(urlString);
        
        if (!parsedURL) {
            return {
                valid: false,
                reason: 'Invalid URL format'
            };
        }

        let hostname = parsedURL.hostname.toLowerCase();

        const normalizedHostname = this.normalizeIPNotation(hostname);
        if (normalizedHostname !== hostname) {
            hostname = normalizedHostname;
            const ssrfCheck = this.isSSRFAttempt(hostname);
            if (ssrfCheck.isSSRF) {
                return {
                    valid: false,
                    reason: `IP notation obfuscation detected: ${ssrfCheck.reason}`
                };
            }
        }

        const initialValidation = this.validateURL(urlString);
        if (!initialValidation.valid) {
            return initialValidation;
        }

        if (!this.isIPAddress(hostname)) {
            try {
                const lookupResult = await dns.lookup(hostname);
                const resolvedIP = lookupResult.address;

                if (this.isLocalhostIP(resolvedIP) && !this.allowLocalhostIPs) {
                    return {
                        valid: false,
                        reason: `DNS resolves to localhost (${resolvedIP}) - potential DNS rebinding SSRF`
                    };
                }

                if (this.isPrivateIP(resolvedIP) && !this.allowPrivateIPs) {
                    return {
                        valid: false,
                        reason: `DNS resolves to private IP (${resolvedIP}) - potential DNS rebinding SSRF`
                    };
                }

                if (this.isCloudMetadataEndpoint(resolvedIP)) {
                    return {
                        valid: false,
                        reason: `DNS resolves to cloud metadata endpoint (${resolvedIP}) - DNS rebinding SSRF blocked`
                    };
                }

                return {
                    valid: true,
                    reason: 'URL validation passed with DNS resolution',
                    parsed: parsedURL,
                    resolvedIP: resolvedIP
                };
            } catch (error) {
                return {
                    valid: false,
                    reason: `DNS lookup failed: ${error.message}`
                };
            }
        }

        return {
            valid: true,
            reason: 'URL validation passed',
            parsed: parsedURL
        };
    }

    detectURLEncodingObfuscation(urlString) {
        const suspiciousPatterns = [
            { pattern: /%31%32%37/i, target: '127', description: '127 (localhost)' },
            { pattern: /%31%30\./i, target: '10.', description: '10. (private IP)' },
            { pattern: /%31%37%32\./i, target: '172.', description: '172. (private IP)' },
            { pattern: /%31%39%32\.%31%36%38/i, target: '192.168', description: '192.168 (private IP)' },
            { pattern: /%31%36%39\.%32%35%34/i, target: '169.254', description: '169.254 (link-local/metadata)' },
            { pattern: /%6c%6f%63%61%6c%68%6f%73%74/i, target: 'localhost', description: 'localhost' },
            { pattern: /%6d%65%74%61%64%61%74%61/i, target: 'metadata', description: 'metadata' }
        ];

        for (const { pattern, target, description } of suspiciousPatterns) {
            if (pattern.test(urlString)) {
                return {
                    detected: true,
                    reason: `URL-encoded ${description} detected (obfuscation attempt)`
                };
            }
        }

        return { detected: false };
    }

    validateURL(urlString) {
        const parsedURL = this.parseURL(urlString);
        
        if (!parsedURL) {
            return {
                valid: false,
                reason: 'Invalid URL format'
            };
        }

        const scheme = parsedURL.protocol.replace(/:$/, '').toLowerCase();
        
        if (!this.allowedSchemes.includes(scheme)) {
            return {
                valid: false,
                reason: `Scheme '${scheme}' not allowed. Allowed: ${this.allowedSchemes.join(', ')}`
            };
        }

        if (this.requireTLS && scheme !== 'https') {
            return {
                valid: false,
                reason: 'TLS/HTTPS required but URL uses non-secure protocol'
            };
        }

        const hostname = parsedURL.hostname.toLowerCase();

        const ssrfCheck = this.isSSRFAttempt(hostname);
        if (ssrfCheck.isSSRF) {
            return {
                valid: false,
                reason: ssrfCheck.reason
            };
        }

        if (this.deniedIPs.length > 0 && this.deniedIPs.includes(hostname)) {
            return {
                valid: false,
                reason: `IP address ${hostname} is explicitly denied`
            };
        }

        if (this.deniedDomains.length > 0) {
            if (this.matchesAnyDomain(hostname, this.deniedDomains)) {
                return {
                    valid: false,
                    reason: `Domain ${hostname} matches denied domain list`
                };
            }
        }

        if (this.allowedDomains.length > 0) {
            if (!this.matchesAnyDomain(hostname, this.allowedDomains)) {
                return {
                    valid: false,
                    reason: `Domain ${hostname} not in allowed domain list`
                };
            }
        }

        if (this.allowedPorts.length > 0 && parsedURL.port) {
            const port = parseInt(parsedURL.port, 10);
            if (!this.allowedPorts.includes(port)) {
                return {
                    valid: false,
                    reason: `Port ${port} not in allowed port list`
                };
            }
        }

        return {
            valid: true,
            reason: 'URL validation passed',
            parsed: parsedURL
        };
    }

    validateAndParse(urlString) {
        const result = this.validateURL(urlString);
        
        if (!result.valid) {
            throw new Error(`URL validation failed: ${result.reason}`);
        }

        return result.parsed;
    }

    isURLAllowed(urlString) {
        const result = this.validateURL(urlString);
        return result.valid;
    }

    static createDefault() {
        return new NetworkValidator({
            allowedSchemes: ['https'],
            allowedDomains: [],
            deniedDomains: [],
            requireTLS: true,
            allowPrivateIPs: false,
            allowLocalhostIPs: false
        });
    }

    static createForDevelopment() {
        return new NetworkValidator({
            allowedSchemes: ['http', 'https'],
            allowedDomains: [],
            deniedDomains: [],
            requireTLS: false,
            allowPrivateIPs: true,
            allowLocalhostIPs: true
        });
    }

    static createForAPI(allowedDomains) {
        return new NetworkValidator({
            allowedSchemes: ['https'],
            allowedDomains: allowedDomains || [],
            deniedDomains: [],
            requireTLS: true,
            allowPrivateIPs: false,
            allowLocalhostIPs: false
        });
    }

    static validateFromManifest(urlString, manifestAllowlist) {
        if (!manifestAllowlist || typeof manifestAllowlist !== 'object') {
            throw new Error('Invalid manifest allowlist');
        }

        const options = {
            allowedSchemes: manifestAllowlist.schemes || ['https'],
            allowedDomains: manifestAllowlist.domains || [],
            allowedPorts: manifestAllowlist.ports || [],
            deniedDomains: manifestAllowlist.deniedDomains || [],
            deniedIPs: manifestAllowlist.deniedIPs || [],
            requireTLS: manifestAllowlist.requireTLS !== false,
            allowPrivateIPs: manifestAllowlist.allowPrivateIPs || false,
            allowLocalhostIPs: manifestAllowlist.allowLocalhostIPs || false
        };

        const validator = new NetworkValidator(options);
        return validator.validateURL(urlString);
    }
}

module.exports = NetworkValidator;
