class IntentError extends Error {
    constructor(message, code, stage, requestId) {
        super(message);
        this.name = 'IntentError';
        this.code = code;
        this.stage = stage;
        this.requestId = requestId;
        Error.captureStackTrace(this, this.constructor);
    }
}

class ValidationError extends Error {
    constructor(message, code, stage, requestId) {
        super(message);
        this.name = 'ValidationError';
        this.code = code || 'VALIDATION_ERROR';
        this.stage = stage || 'validation';
        this.requestId = requestId;
        Error.captureStackTrace(this, this.constructor);
    }
}

class RateLimitError extends Error {
    constructor(message, code, stage, requestId) {
        super(message);
        this.name = 'RateLimitError';
        this.code = code || 'RATE_LIMIT_EXCEEDED';
        this.stage = stage || 'gateway';
        this.requestId = requestId;
        Error.captureStackTrace(this, this.constructor);
    }
}

module.exports = { IntentError, ValidationError, RateLimitError };
