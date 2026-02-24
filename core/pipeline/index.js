const { MessageInterceptor, Intent, IntentSchema } = require('./intercept');
const { AuthorizationLayer, PermissionChecker, RateLimitManager, TokenBucket, TrafficPolicer } = require('./auth');
const { AuditLayer, AuditLogger, NISTValidator, EntropyScanner } = require('./audit');
const { ExecutionLayer, ExecutionError, CircuitBreaker, TimeoutManager } = require('./execute');
const { TwoRateThreeColorTokenBucket } = require('../qos/token-bucket');

class IOPipeline {
    constructor(options = {}) {
        this.interceptor = new MessageInterceptor();
        this.authLayer = new AuthorizationLayer(options);
        this.auditLayer = new AuditLayer(options.auditLogPath);
        this.executionLayer = new ExecutionLayer();
    }

    registerExtension(extensionId, manifest) {
        this.authLayer.registerExtension(extensionId, manifest);
    }

    unregisterExtension(extensionId) {
        this.authLayer.unregisterExtension(extensionId);
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
                { reason: authResult.reason, code: authResult.code }
            );
            
            return {
                success: false,
                stage: 'AUTHORIZATION',
                error: authResult.reason,
                code: authResult.code,
                requestId: intent.requestId
            };
        }

        const auditResult = this.auditLayer.audit(intent, authResult);
        
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
            this.auditLayer.logExecution(intent, result);
            
            return {
                success: true,
                result,
                requestId: intent.requestId,
                warnings: auditResult.warnings
            };
        } catch (error) {
            this.auditLayer.logExecution(intent, null, error);
            
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
    TwoRateThreeColorTokenBucket,
    AuditLayer,
    AuditLogger,
    NISTValidator,
    EntropyScanner,
    ExecutionLayer,
    ExecutionError,
    CircuitBreaker,
    TimeoutManager
};
