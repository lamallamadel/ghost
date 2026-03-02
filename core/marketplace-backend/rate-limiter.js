class RateLimiter {
    constructor(options = {}) {
        this.windowMs = options.windowMs || 60000;
        this.maxRequests = options.maxRequests || 100;
        this.clients = new Map();
        this._startCleanup();
    }

    checkLimit(clientId) {
        const now = Date.now();
        
        if (!this.clients.has(clientId)) {
            this.clients.set(clientId, {
                requests: [],
                blocked: false,
                blockedUntil: 0
            });
        }

        const client = this.clients.get(clientId);

        if (client.blocked && now < client.blockedUntil) {
            return false;
        }

        if (client.blocked && now >= client.blockedUntil) {
            client.blocked = false;
            client.requests = [];
        }

        client.requests = client.requests.filter(timestamp => 
            now - timestamp < this.windowMs
        );

        if (client.requests.length >= this.maxRequests) {
            client.blocked = true;
            client.blockedUntil = now + this.windowMs;
            return false;
        }

        client.requests.push(now);
        return true;
    }

    resetClient(clientId) {
        this.clients.delete(clientId);
    }

    getClientStatus(clientId) {
        const client = this.clients.get(clientId);
        if (!client) {
            return {
                requests: 0,
                remaining: this.maxRequests,
                blocked: false
            };
        }

        const now = Date.now();
        const activeRequests = client.requests.filter(timestamp => 
            now - timestamp < this.windowMs
        ).length;

        return {
            requests: activeRequests,
            remaining: Math.max(0, this.maxRequests - activeRequests),
            blocked: client.blocked && now < client.blockedUntil,
            blockedUntil: client.blockedUntil
        };
    }

    _startCleanup() {
        setInterval(() => {
            const now = Date.now();
            for (const [clientId, client] of this.clients.entries()) {
                const activeRequests = client.requests.filter(timestamp => 
                    now - timestamp < this.windowMs
                );

                if (activeRequests.length === 0 && (!client.blocked || now >= client.blockedUntil)) {
                    this.clients.delete(clientId);
                }
            }
        }, this.windowMs);
    }
}

module.exports = { RateLimiter };
