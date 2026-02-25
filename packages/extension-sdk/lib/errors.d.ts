export declare class IntentError extends Error {
    code?: string;
    stage?: string;
    requestId?: string;
    constructor(message: string, code?: string, stage?: string, requestId?: string);
}

export declare class ValidationError extends Error {
    code: string;
    stage: string;
    requestId?: string;
    constructor(message: string, code?: string, stage?: string, requestId?: string);
}

export declare class RateLimitError extends Error {
    code: string;
    stage: string;
    requestId?: string;
    constructor(message: string, code?: string, stage?: string, requestId?: string);
}
