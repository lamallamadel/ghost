const crypto = require('crypto');
const http = require('http');
const { WebhookEventStore } = require('./webhook-event-store');
const { WebhookRouter } = require('./webhook-router');
const { WebhookTransformPipeline } = require('./webhook-transform-pipeline');
const { WebhookDeliveryQueue } = require('./webhook-delivery-queue');
const { AuditLogger } = require('../pipeline/audit');
const path = require('path');
const os = require('os');

class WebhookController {
    constructor(options = {}) {
        this.port = options.port || 3000;
        this.host = options.host || '0.0.0.0';
        this.auditLogger = options.auditLogger || new AuditLogger(
            path.join(os.homedir(), '.ghost', 'audit.log')
        );
        
        this.eventStore = new WebhookEventStore(options.dbPath);
        this.router = new WebhookRouter(options.routerConfig);
        this.transformPipeline = new WebhookTransformPipeline();
        this.deliveryQueue = new WebhookDeliveryQueue({
            auditLogger: this.auditLogger,
            eventStore: this.eventStore
        });
        
        this.server = null;
        this.providers = new Map();
        
        this._registerDefaultProviders();
    }
    
    _registerDefaultProviders() {
        this.registerProvider('github', {
            signatureHeader: 'x-hub-signature-256',
            signatureAlgorithm: 'sha256',
            signaturePrefix: 'sha256=',
            eventHeader: 'x-github-event',
            deliveryHeader: 'x-github-delivery'
        });
        
        this.registerProvider('gitlab', {
            signatureHeader: 'x-gitlab-token',
            signatureAlgorithm: 'plain',
            eventHeader: 'x-gitlab-event',
            deliveryHeader: 'x-gitlab-event-uuid'
        });
        
        this.registerProvider('bitbucket', {
            signatureHeader: 'x-hub-signature',
            signatureAlgorithm: 'sha256',
            signaturePrefix: 'sha256=',
            eventHeader: 'x-event-key',
            deliveryHeader: 'x-request-uuid'
        });
    }
    
    registerProvider(name, config) {
        this.providers.set(name, config);
    }
    
    start() {
        return new Promise((resolve, reject) => {
            this.server = http.createServer((req, res) => {
                this._handleRequest(req, res);
            });
            
            this.server.listen(this.port, this.host, (err) => {
                if (err) {
                    reject(err);
                } else {
                    console.log(`Webhook server listening on ${this.host}:${this.port}`);
                    resolve();
                }
            });
            
            this.server.on('error', (err) => {
                console.error('Webhook server error:', err);
            });
        });
    }
    
    stop() {
        return new Promise((resolve) => {
            if (this.server) {
                this.server.close(() => {
                    console.log('Webhook server stopped');
                    resolve();
                });
            } else {
                resolve();
            }
        });
    }
    
    async _handleRequest(req, res) {
        const urlParts = req.url.split('/');
        
        if (req.method !== 'POST') {
            this._sendResponse(res, 405, { error: 'Method not allowed' });
            return;
        }
        
        if (urlParts[1] !== 'api' || urlParts[2] !== 'webhooks' || !urlParts[3]) {
            this._sendResponse(res, 404, { error: 'Not found' });
            return;
        }
        
        const provider = urlParts[3];
        
        if (!this.providers.has(provider)) {
            this._sendResponse(res, 400, { error: `Unknown provider: ${provider}` });
            return;
        }
        
        try {
            const body = await this._readBody(req);
            const providerConfig = this.providers.get(provider);
            
            const verificationResult = await this._verifySignature(
                req,
                body,
                provider,
                providerConfig
            );
            
            if (!verificationResult.valid) {
                this.auditLogger.logSecurityEvent(
                    'webhook-controller',
                    'SIGNATURE_VERIFICATION_FAILED',
                    {
                        severity: 'high',
                        provider,
                        reason: verificationResult.reason,
                        headers: this._sanitizeHeaders(req.headers)
                    }
                );
                
                this._sendResponse(res, 401, { error: 'Signature verification failed' });
                return;
            }
            
            const eventType = req.headers[providerConfig.eventHeader];
            const deliveryId = req.headers[providerConfig.deliveryHeader] || this._generateId();
            
            let payload;
            try {
                payload = JSON.parse(body);
            } catch (error) {
                this._sendResponse(res, 400, { error: 'Invalid JSON payload' });
                return;
            }
            
            const webhookEvent = {
                id: deliveryId,
                provider,
                eventType,
                payload,
                headers: this._sanitizeHeaders(req.headers),
                receivedAt: new Date().toISOString()
            };
            
            await this.eventStore.saveEvent(webhookEvent);
            
            this.auditLogger.log({
                type: 'WEBHOOK_RECEIVED',
                provider,
                eventType,
                deliveryId,
                verified: true
            });
            
            setImmediate(() => {
                this._processWebhook(webhookEvent);
            });
            
            this._sendResponse(res, 202, { 
                message: 'Webhook accepted',
                id: deliveryId 
            });
            
        } catch (error) {
            console.error('Error handling webhook:', error);
            this.auditLogger.logSecurityEvent(
                'webhook-controller',
                'WEBHOOK_PROCESSING_ERROR',
                {
                    severity: 'medium',
                    error: error.message,
                    stack: error.stack
                }
            );
            
            this._sendResponse(res, 500, { error: 'Internal server error' });
        }
    }
    
    async _verifySignature(req, body, provider, providerConfig) {
        const secret = process.env[`GHOST_WEBHOOK_SECRET_${provider.toUpperCase()}`];
        
        if (!secret) {
            return {
                valid: false,
                reason: 'No webhook secret configured'
            };
        }
        
        const signatureHeader = req.headers[providerConfig.signatureHeader];
        
        if (!signatureHeader) {
            return {
                valid: false,
                reason: 'Missing signature header'
            };
        }
        
        if (providerConfig.signatureAlgorithm === 'plain') {
            return {
                valid: signatureHeader === secret,
                reason: signatureHeader === secret ? null : 'Invalid token'
            };
        }
        
        const expectedSignature = this._computeSignature(
            body,
            secret,
            providerConfig.signatureAlgorithm
        );
        
        const providedSignature = providerConfig.signaturePrefix
            ? signatureHeader.replace(providerConfig.signaturePrefix, '')
            : signatureHeader;
        
        const isValid = crypto.timingSafeEqual(
            Buffer.from(expectedSignature, 'hex'),
            Buffer.from(providedSignature, 'hex')
        );
        
        return {
            valid: isValid,
            reason: isValid ? null : 'Invalid signature'
        };
    }
    
    _computeSignature(payload, secret, algorithm) {
        return crypto
            .createHmac(algorithm, secret)
            .update(payload)
            .digest('hex');
    }
    
    async _processWebhook(webhookEvent) {
        try {
            const routingResult = this.router.route(webhookEvent);
            
            if (!routingResult || routingResult.length === 0) {
                this.auditLogger.log({
                    type: 'WEBHOOK_NO_ROUTE',
                    provider: webhookEvent.provider,
                    eventType: webhookEvent.eventType,
                    deliveryId: webhookEvent.id
                });
                return;
            }
            
            for (const route of routingResult) {
                const transformedPayload = await this.transformPipeline.transform(
                    webhookEvent,
                    route.transform
                );
                
                await this.deliveryQueue.enqueue({
                    webhookEventId: webhookEvent.id,
                    extensionId: route.extensionId,
                    command: route.command,
                    args: route.args || [],
                    payload: transformedPayload,
                    originalEvent: webhookEvent
                });
            }
            
        } catch (error) {
            console.error('Error processing webhook:', error);
            
            this.auditLogger.logSecurityEvent(
                'webhook-controller',
                'WEBHOOK_PROCESSING_ERROR',
                {
                    severity: 'medium',
                    webhookId: webhookEvent.id,
                    error: error.message,
                    stack: error.stack
                }
            );
        }
    }
    
    async _readBody(req) {
        return new Promise((resolve, reject) => {
            const chunks = [];
            
            req.on('data', (chunk) => {
                chunks.push(chunk);
            });
            
            req.on('end', () => {
                resolve(Buffer.concat(chunks).toString('utf8'));
            });
            
            req.on('error', (err) => {
                reject(err);
            });
        });
    }
    
    _sendResponse(res, statusCode, data) {
        res.writeHead(statusCode, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(data));
    }
    
    _sanitizeHeaders(headers) {
        const sanitized = { ...headers };
        const sensitiveHeaders = ['authorization', 'x-gitlab-token', 'x-hub-signature', 'x-hub-signature-256'];
        
        for (const key of Object.keys(sanitized)) {
            if (sensitiveHeaders.includes(key.toLowerCase())) {
                sanitized[key] = '[REDACTED]';
            }
        }
        
        return sanitized;
    }
    
    _generateId() {
        return crypto.randomBytes(16).toString('hex');
    }
    
    addRoute(config) {
        return this.router.addRoute(config);
    }
    
    addTransform(name, transformFunction) {
        return this.transformPipeline.addTransform(name, transformFunction);
    }
    
    getEventStore() {
        return this.eventStore;
    }
    
    getDeliveryQueue() {
        return this.deliveryQueue;
    }
}

module.exports = { WebhookController };
