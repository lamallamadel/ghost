const assert = require('assert');
const APIIntegrationExtension = require('../index');
const fs = require('fs');
const path = require('path');

describe('API Integration Extension', () => {
    let extension;
    const testConfigPath = path.join(__dirname, '.test-config.json');

    beforeEach(async () => {
        extension = new APIIntegrationExtension();
        extension.configPath = testConfigPath;
        await extension.init({});
    });

    afterEach(() => {
        if (fs.existsSync(testConfigPath)) {
            fs.unlinkSync(testConfigPath);
        }
    });

    describe('Configuration', () => {
        it('should initialize with default config', () => {
            assert.ok(extension.config);
            assert.strictEqual(extension.config.authType, 'bearer');
        });

        it('should save and load configuration', async () => {
            extension.config.token = 'test-token';
            extension.config.baseUrl = 'https://api.test.com';
            await extension.saveConfig();

            const newExtension = new APIIntegrationExtension();
            newExtension.configPath = testConfigPath;
            await newExtension.init({});

            assert.strictEqual(newExtension.config.token, 'test-token');
            assert.strictEqual(newExtension.config.baseUrl, 'https://api.test.com');
        });

        it('should update config via api-config command', async () => {
            const result = await extension['api-config']({
                flags: {
                    'set-token': 'new-token',
                    'set-base-url': 'https://new-api.com'
                }
            });

            assert.strictEqual(result.success, true);
            assert.strictEqual(extension.config.token, 'new-token');
            assert.strictEqual(extension.config.baseUrl, 'https://new-api.com');
        });
    });

    describe('Caching', () => {
        it('should cache responses', () => {
            const testData = { foo: 'bar' };
            extension.setCached('test-key', testData, 5000);
            
            const cached = extension.getCached('test-key');
            assert.deepStrictEqual(cached, testData);
        });

        it('should expire cached responses after TTL', (done) => {
            const testData = { foo: 'bar' };
            extension.setCached('test-key', testData, 100);
            
            setTimeout(() => {
                const cached = extension.getCached('test-key');
                assert.strictEqual(cached, null);
                done();
            }, 150);
        });

        it('should return null for non-existent cache keys', () => {
            const cached = extension.getCached('non-existent');
            assert.strictEqual(cached, null);
        });
    });

    describe('Retry Logic', () => {
        it('should calculate exponential backoff correctly', () => {
            const delay0 = extension.calculateRetryDelay(0);
            const delay1 = extension.calculateRetryDelay(1);
            const delay2 = extension.calculateRetryDelay(2);

            assert.strictEqual(delay0, 1000);
            assert.strictEqual(delay1, 2000);
            assert.strictEqual(delay2, 4000);
        });

        it('should cap retry delay at maxDelay', () => {
            const delay = extension.calculateRetryDelay(10);
            assert(delay <= extension.retryConfig.maxDelay);
        });

        it('should retry on network errors', () => {
            const error = new Error('Connection reset');
            error.code = 'ECONNRESET';
            
            const shouldRetry = extension.shouldRetry(error, 0);
            assert.strictEqual(shouldRetry, true);
        });

        it('should retry on 429 status code', () => {
            const error = new Error('Rate limited');
            error.statusCode = 429;
            
            const shouldRetry = extension.shouldRetry(error, 0);
            assert.strictEqual(shouldRetry, true);
        });

        it('should retry on 5xx errors', () => {
            const error = new Error('Server error');
            error.statusCode = 503;
            
            const shouldRetry = extension.shouldRetry(error, 0);
            assert.strictEqual(shouldRetry, true);
        });

        it('should not retry on 4xx client errors (except 429)', () => {
            const error = new Error('Not found');
            error.statusCode = 404;
            
            const shouldRetry = extension.shouldRetry(error, 0);
            assert.strictEqual(shouldRetry, false);
        });

        it('should not retry after max attempts', () => {
            const error = new Error('Connection reset');
            error.code = 'ECONNRESET';
            
            const shouldRetry = extension.shouldRetry(error, 3);
            assert.strictEqual(shouldRetry, false);
        });
    });

    describe('Rate Limit State', () => {
        it('should update rate limit state from headers', () => {
            const headers = {
                'x-ratelimit-remaining': '10',
                'x-ratelimit-reset': '1234567890'
            };

            extension.updateRateLimitState(headers);
            
            assert.strictEqual(extension.rateLimitState.remaining, 10);
            assert.strictEqual(extension.rateLimitState.reset, 1234567890);
        });

        it('should handle different header formats', () => {
            const headers = {
                'x-rate-limit-remaining': '5',
                'x-rate-limit-reset': '60'
            };

            const now = Date.now();
            extension.updateRateLimitState(headers);
            
            assert.strictEqual(extension.rateLimitState.remaining, 5);
            assert(extension.rateLimitState.reset > now);
        });
    });

    describe('API Calls', () => {
        it('should return error if URL is missing', async () => {
            const result = await extension['api-call']({ flags: {} });
            
            assert.strictEqual(result.success, false);
            assert(result.error.includes('URL is required'));
        });

        it('should construct full URL from base URL', async () => {
            extension.config.baseUrl = 'https://api.test.com';
            
            // Mock makeRequestWithRetry to test URL construction
            const originalMethod = extension.makeRequestWithRetry;
            let capturedUrl = null;
            
            extension.makeRequestWithRetry = async (url) => {
                capturedUrl = url;
                return { success: true, data: {} };
            };

            await extension['api-call']({ 
                flags: { 
                    url: '/endpoint',
                    method: 'GET'
                } 
            });

            assert.strictEqual(capturedUrl, 'https://api.test.com/endpoint');
            
            // Restore
            extension.makeRequestWithRetry = originalMethod;
        });
    });

    describe('Cleanup', () => {
        it('should clear cache on cleanup', async () => {
            extension.setCached('test', { data: 'test' }, 5000);
            assert.strictEqual(extension.cache.size, 1);
            
            await extension.cleanup();
            assert.strictEqual(extension.cache.size, 0);
        });
    });
});
