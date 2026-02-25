const { MessageInterceptor, Intent, IntentSchema } = require('./intercept');
const { AuthorizationLayer, PermissionChecker, RateLimitManager, TokenBucket, TrafficPolicer } = require('./auth');
const { AuditLayer, AuditLogger } = require('./audit');
const { ExecutionLayer, ExecutionError, CircuitBreaker, TimeoutManager } = require('./execute');
const { SingleRateThreeColorTokenBucket } = require('../qos/token-bucket');
const { instrumentPipeline, Telemetry } = require('../telemetry');

class IOPipeline {
    constructor(options = {}) {
        this.interceptor = new MessageInterceptor();
        this.authLayer = new AuthorizationLayer(options);
        this.auditLayer = new AuditLayer(options.auditLogPath);
        this.executionLayer = new ExecutionLayer();
        this.extensionManifests = new Map();
    }

    registerExtension(extensionId, manifest) {
        this.authLayer.registerExtension(extensionId, manifest);
        this.extensionManifests.set(extensionId, manifest);
    }

    unregisterExtension(extensionId) {
        this.authLayer.unregisterExtension(extensionId);
        this.extensionManifests.delete(extensionId);
    }

    async process(rawMessage) {
        let intent;

        try {
            intent = this.interceptor.intercept(rawMessage);
        } catch (error) {
            return {
                success: false,
                stage: 'INTERCEPT',
                error: error.message,
                code: 'PIPELINE_INTERCEPT_ERROR'
            };
        }

        const authResult = this.authLayer.authorize(intent);
        
        if (!authResult.authorized) {
            this.auditLayer.logSecurityEvent(
                intent.extensionId,
                'AUTHORIZATION_DENIED',
                { reason: authResult.reason, code: authResult.code, severity: 'high', rule: 'AUTHORIZATION' }
            );
            
            return {
                success: false,
                stage: 'AUTHORIZATION',
                error: authResult.reason,
                code: authResult.code,
                requestId: intent.requestId
            };
        }

        const manifest = this.extensionManifests.get(intent.extensionId);
        const manifestCapabilities = manifest ? manifest.capabilities : null;
        
        const auditLayerWithCapabilities = new AuditLayer(this.auditLayer.logger.logPath, manifestCapabilities);
        const auditResult = auditLayerWithCapabilities.audit(intent, authResult);
        
        if (!auditResult.passed) {
            return {
                success: false,
                stage: 'AUDIT',
                error: auditResult.reason,
                code: auditResult.code,
                violations: auditResult.violations,
                requestId: intent.requestId
            };
        }

        try {
            const result = await this.executionLayer.execute(intent);
            auditLayerWithCapabilities.logExecution(intent, result);
            
            return {
                success: true,
                result,
                requestId: intent.requestId,
                warnings: auditResult.warnings
            };
        } catch (error) {
            auditLayerWithCapabilities.logExecution(intent, null, error);
            
            return {
                success: false,
                stage: 'EXECUTION',
                error: error.message,
                code: error.code || 'PIPELINE_EXECUTION_ERROR',
                details: error.details,
                requestId: intent.requestId
            };
        }
    }

    processStream(stream, onResult, onError) {
        this.interceptor.processStream(
            stream,
            async (intent) => {
                const result = await this.process(intent);
                if (onResult) {
                    onResult(result);
                }
            },
            (error) => {
                if (onError) {
                    onError(error);
                }
            }
        );
    }

    getAuditLogs(options) {
        return this.auditLayer.getLogs(options);
    }

    getRateLimitState(extensionId) {
        return this.authLayer.getRateLimitState(extensionId);
    }

    resetRateLimit(extensionId) {
        this.authLayer.resetRateLimit(extensionId);
    }

    getCircuitBreakerState(type) {
        return this.executionLayer.getCircuitBreakerState(type);
    }

    resetCircuitBreaker(type) {
        this.executionLayer.resetCircuitBreaker(type);
    }

    getTrafficPolicerState(extensionId) {
        return this.authLayer.getTrafficPolicerState(extensionId);
    }

    getAllTrafficPolicerStates() {
        return this.authLayer.getAllTrafficPolicerStates();
    }

    resetTrafficPolicer(extensionId) {
        this.authLayer.resetTrafficPolicer(extensionId);
    }
}

module.exports = {
    IOPipeline,
    MessageInterceptor,
    Intent,
    IntentSchema,
    AuthorizationLayer,
    PermissionChecker,
    RateLimitManager,
    TokenBucket,
    TrafficPolicer,
    SingleRateThreeColorTokenBucket,
    AuditLayer,
    AuditLogger,
    ExecutionLayer,
    ExecutionError,
    CircuitBreaker,
    TimeoutManager,
    instrumentPipeline,
    Telemetry
};
