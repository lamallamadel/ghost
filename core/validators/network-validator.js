const { URL } = require('url');

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

        const metadataServices = [
            '169.254.169.254',
            'metadata.google.internal',
            'instance-data'
        ];

        if (metadataServices.some(service => hostname.includes(service))) {
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
}

module.exports = NetworkValidator;
