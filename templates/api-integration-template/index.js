const https = require('https');
const http = require('http');
const { URL } = require('url');
const fs = require('fs');
const path = require('path');

/**
 * API Integration Extension Template
 * 
 * Features:
 * - REST and GraphQL API support
 * - Authentication header management (Bearer, API Key, Basic)
 * - Automatic retry with exponential backoff
 * - Rate limit detection and retry logic
 * - Response caching with TTL
 * - Request/response logging
 * 
 * Usage:
 *   ghost api-call --url https://api.example.com/endpoint --method GET
 *   ghost api-config --set-token YOUR_API_TOKEN
 */
class APIIntegrationExtension {
    constructor() {
        this.cache = new Map();
        this.retryConfig = {
            maxRetries: 3,
            initialDelay: 1000,
            maxDelay: 30000,
            backoffMultiplier: 2
        };
        this.rateLimitState = {
            remaining: Infinity,
            reset: null
        };
    }

    async init(context) {
        this.context = context;
        this.configPath = path.join(process.cwd(), '.ghost', 'api-config.json');
        this.config = await this.loadConfig();
        console.log('API Integration Extension initialized');
    }

    /**
     * Load API configuration from file
     */
    async loadConfig() {
        try {
            if (fs.existsSync(this.configPath)) {
                const data = fs.readFileSync(this.configPath, 'utf8');
                return JSON.parse(data);
            }
        } catch (error) {
            console.warn('Could not load API config:', error.message);
        }
        return {
            baseUrl: '',
            authType: 'bearer',
            token: '',
            headers: {},
            cacheTTL: 300000
        };
    }

    /**
     * Save API configuration to file
     */
    async saveConfig() {
        const dir = path.dirname(this.configPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
    }

    /**
     * Configure API settings
     * 
     * Flags:
     *   --set-token <token>        Set authentication token
     *   --set-base-url <url>       Set base URL for API calls
     *   --set-auth-type <type>     Set auth type (bearer|apikey|basic)
     *   --set-header <key:value>   Add custom header
     *   --cache-ttl <ms>           Set cache TTL in milliseconds
     *   --show                     Show current configuration
     */
    async 'api-config'(params) {
        const { flags } = params;

        if (flags.show) {
            console.log('Current API Configuration:');
            console.log(JSON.stringify(this.config, null, 2));
            return { success: true };
        }

        if (flags['set-token']) {
            this.config.token = flags['set-token'];
            console.log('✓ API token updated');
        }

        if (flags['set-base-url']) {
            this.config.baseUrl = flags['set-base-url'];
            console.log('✓ Base URL updated');
        }

        if (flags['set-auth-type']) {
            this.config.authType = flags['set-auth-type'];
            console.log('✓ Auth type updated');
        }

        if (flags['set-header']) {
            const [key, value] = flags['set-header'].split(':');
            if (key && value) {
                this.config.headers[key.trim()] = value.trim();
                console.log(`✓ Header ${key} added`);
            }
        }

        if (flags['cache-ttl']) {
            this.config.cacheTTL = parseInt(flags['cache-ttl']);
            console.log('✓ Cache TTL updated');
        }

        await this.saveConfig();
        return { success: true, message: 'Configuration updated' };
    }

    /**
     * Make an API call with retry logic and caching
     * 
     * Flags:
     *   --url <url>                API endpoint URL
     *   --method <method>          HTTP method (GET, POST, PUT, DELETE, etc.)
     *   --data <json>              Request body as JSON string
     *   --graphql                  Treat as GraphQL query
     *   --query <query>            GraphQL query string
     *   --variables <json>         GraphQL variables as JSON
     *   --no-cache                 Skip cache lookup
     *   --cache-key <key>          Custom cache key
     */
    async 'api-call'(params) {
        const { flags } = params;
        
        if (!flags.url) {
            return { 
                success: false, 
                error: 'URL is required. Use --url flag.' 
            };
        }

        const method = (flags.method || 'GET').toUpperCase();
        const url = flags.url.startsWith('http') ? flags.url : `${this.config.baseUrl}${flags.url}`;
        const noCache = flags['no-cache'];
        const cacheKey = flags['cache-key'] || `${method}:${url}`;

        // Check cache for GET requests
        if (method === 'GET' && !noCache) {
            const cached = this.getCached(cacheKey);
            if (cached) {
                console.log('✓ Cache hit');
                return { success: true, data: cached, cached: true };
            }
        }

        // Prepare request data
        let requestData = null;
        if (flags.graphql) {
            requestData = JSON.stringify({
                query: flags.query,
                variables: flags.variables ? JSON.parse(flags.variables) : {}
            });
        } else if (flags.data) {
            requestData = typeof flags.data === 'string' ? flags.data : JSON.stringify(flags.data);
        }

        // Make request with retry logic
        const result = await this.makeRequestWithRetry(url, {
            method,
            data: requestData,
            isGraphQL: flags.graphql
        });

        // Cache successful GET requests
        if (result.success && method === 'GET') {
            this.setCached(cacheKey, result.data, this.config.cacheTTL);
        }

        return result;
    }

    /**
     * Make HTTP request with retry logic
     */
    async makeRequestWithRetry(url, options, attempt = 0) {
        try {
            // Check rate limit state
            if (this.rateLimitState.remaining <= 0 && this.rateLimitState.reset) {
                const waitTime = this.rateLimitState.reset - Date.now();
                if (waitTime > 0) {
                    console.log(`⏳ Rate limit reached. Waiting ${Math.ceil(waitTime / 1000)}s...`);
                    await this.sleep(waitTime);
                }
            }

            const result = await this.makeRequest(url, options);
            
            // Update rate limit state from headers
            this.updateRateLimitState(result.headers);
            
            return { success: true, data: result.data, headers: result.headers };
        } catch (error) {
            // Check if we should retry
            const shouldRetry = this.shouldRetry(error, attempt);
            
            if (shouldRetry && attempt < this.retryConfig.maxRetries) {
                const delay = this.calculateRetryDelay(attempt);
                console.log(`⚠ Request failed. Retrying in ${delay}ms... (attempt ${attempt + 1}/${this.retryConfig.maxRetries})`);
                await this.sleep(delay);
                return this.makeRequestWithRetry(url, options, attempt + 1);
            }

            return {
                success: false,
                error: error.message,
                statusCode: error.statusCode
            };
        }
    }

    /**
     * Make HTTP/HTTPS request
     */
    async makeRequest(url, options) {
        return new Promise((resolve, reject) => {
            const parsedUrl = new URL(url);
            const isHttps = parsedUrl.protocol === 'https:';
            const client = isHttps ? https : http;

            // Build headers
            const headers = {
                'Content-Type': options.isGraphQL ? 'application/json' : 'application/json',
                ...this.config.headers
            };

            // Add authentication header
            if (this.config.token) {
                if (this.config.authType === 'bearer') {
                    headers['Authorization'] = `Bearer ${this.config.token}`;
                } else if (this.config.authType === 'apikey') {
                    headers['X-API-Key'] = this.config.token;
                } else if (this.config.authType === 'basic') {
                    headers['Authorization'] = `Basic ${Buffer.from(this.config.token).toString('base64')}`;
                }
            }

            if (options.data) {
                headers['Content-Length'] = Buffer.byteLength(options.data);
            }

            const requestOptions = {
                method: options.method,
                headers,
                hostname: parsedUrl.hostname,
                port: parsedUrl.port,
                path: parsedUrl.pathname + parsedUrl.search
            };

            const req = client.request(requestOptions, (res) => {
                let data = '';

                res.on('data', (chunk) => {
                    data += chunk;
                });

                res.on('end', () => {
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        try {
                            const parsed = JSON.parse(data);
                            resolve({ data: parsed, headers: res.headers });
                        } catch (e) {
                            resolve({ data, headers: res.headers });
                        }
                    } else {
                        const error = new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`);
                        error.statusCode = res.statusCode;
                        error.response = data;
                        reject(error);
                    }
                });
            });

            req.on('error', (error) => {
                reject(error);
            });

            if (options.data) {
                req.write(options.data);
            }

            req.end();
        });
    }

    /**
     * Determine if request should be retried
     */
    shouldRetry(error, attempt) {
        // Don't retry if we've exhausted attempts
        if (attempt >= this.retryConfig.maxRetries) {
            return false;
        }

        // Retry on network errors
        if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT' || error.code === 'ENOTFOUND') {
            return true;
        }

        // Retry on rate limit (429) or server errors (5xx)
        if (error.statusCode === 429 || (error.statusCode >= 500 && error.statusCode < 600)) {
            return true;
        }

        return false;
    }

    /**
     * Calculate retry delay with exponential backoff
     */
    calculateRetryDelay(attempt) {
        const delay = Math.min(
            this.retryConfig.initialDelay * Math.pow(this.retryConfig.backoffMultiplier, attempt),
            this.retryConfig.maxDelay
        );
        return delay;
    }

    /**
     * Update rate limit state from response headers
     */
    updateRateLimitState(headers) {
        // Common rate limit header patterns
        const remaining = headers['x-ratelimit-remaining'] || 
                         headers['x-rate-limit-remaining'] ||
                         headers['ratelimit-remaining'];
        
        const reset = headers['x-ratelimit-reset'] || 
                     headers['x-rate-limit-reset'] ||
                     headers['ratelimit-reset'];

        if (remaining !== undefined) {
            this.rateLimitState.remaining = parseInt(remaining);
        }

        if (reset !== undefined) {
            // Reset can be Unix timestamp or seconds until reset
            const resetValue = parseInt(reset);
            this.rateLimitState.reset = resetValue > 1e10 ? resetValue : Date.now() + (resetValue * 1000);
        }
    }

    /**
     * Get cached response
     */
    getCached(key) {
        const cached = this.cache.get(key);
        if (!cached) {
            return null;
        }

        if (Date.now() > cached.expiresAt) {
            this.cache.delete(key);
            return null;
        }

        return cached.data;
    }

    /**
     * Set cached response
     */
    setCached(key, data, ttl) {
        this.cache.set(key, {
            data,
            expiresAt: Date.now() + ttl
        });
    }

    /**
     * Sleep utility
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async cleanup() {
        this.cache.clear();
        console.log('API Integration Extension cleanup complete');
    }
}

module.exports = APIIntegrationExtension;
