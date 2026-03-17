'use strict';

/**
 * Redis-backed sliding-window rate limiter.
 *
 * Activated when REDIS_URL is set. Falls back to in-memory limiter otherwise.
 *
 * Window: 60 seconds, default limit: 60 requests.
 */
class RedisRateLimiter {
    constructor(options = {}) {
        this._limit = options.limit || 60;
        this._windowSec = options.windowSec || 60;

        const Redis = require('ioredis');
        this._redis = new Redis(process.env.REDIS_URL);

        this._redis.on('error', err => {
            console.warn('[RedisRateLimiter] Redis error:', err.message);
        });
    }

    /**
     * Check and increment rate limit for an IP.
     * @param {string} ip  Client IP address
     * @returns {boolean}  true = within limit, false = exceeded
     */
    async checkLimit(ip) {
        const key = `ghost:ratelimit:${ip}`;
        try {
            const count = await this._redis.incr(key);
            if (count === 1) {
                // First request in window — set expiry
                await this._redis.expire(key, this._windowSec);
            }
            return count <= this._limit;
        } catch (err) {
            // On Redis error, allow the request rather than blocking
            console.warn('[RedisRateLimiter] checkLimit error, allowing request:', err.message);
            return true;
        }
    }

    async close() {
        await this._redis.quit();
    }
}

module.exports = { RedisRateLimiter };
