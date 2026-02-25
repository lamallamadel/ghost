export interface IntentParams {
    type: 'filesystem' | 'network' | 'git' | 'process';
    operation: string;
    params: Record<string, any>;
    extensionId: string;
    requestId?: string;
}

export interface IntentResponse {
    success: boolean;
    result?: any;
    error?: string;
    code?: string;
    stage?: string;
    requestId?: string;
    warnings?: string[];
}

export interface FileReadParams {
    path: string;
    encoding?: string;
}

export interface FileWriteParams {
    path: string;
    content: string;
    encoding?: string;
}

export interface NetworkCallParams {
    url: string;
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD';
    headers?: Record<string, string>;
    body?: string;
}

export interface GitExecParams {
    operation: 'status' | 'log' | 'diff' | 'show' | 'ls-files' | 'commit' | 'branch' | 'tag' | 'push' | 'reset';
    args?: string[];
}

export interface SDKOptions {
    timeout?: number;
}

export class IntentError extends Error {
    code?: string;
    stage?: string;
    requestId?: string;
    constructor(message: string, code?: string, stage?: string, requestId?: string);
}

export class ValidationError extends Error {
    code: string;
    stage: string;
    requestId?: string;
    constructor(message: string, code?: string, stage?: string, requestId?: string);
}

export class RateLimitError extends Error {
    code: string;
    stage: string;
    requestId?: string;
    constructor(message: string, code?: string, stage?: string, requestId?: string);
}

export class IntentBuilder {
    constructor(extensionId: string);
    filesystem(operation: string, params: Record<string, any>): IntentParams;
    network(operation: string, params: Record<string, any>): IntentParams;
    git(operation: string, params: Record<string, any>): IntentParams;
    process(command: string, args?: string[]): IntentParams;
}

export class RPCClient {
    constructor(extensionId: string, options?: SDKOptions);
    send(intent: IntentParams): Promise<IntentResponse>;
    sendBatch(intents: IntentParams[]): Promise<IntentResponse[]>;
}

export class ExtensionSDK {
    constructor(extensionId: string, options?: SDKOptions);
    
    emitIntent(intent: IntentParams): Promise<IntentResponse>;
    
    requestBatch(requests: IntentParams[]): Promise<IntentResponse[]>;
    requestFileReadBatch(paths: string[]): Promise<string[]>;
    
    requestFileRead(params: FileReadParams): Promise<string>;
    requestFileWrite(params: FileWriteParams): Promise<void>;
    requestFileReadDir(params: { path: string }): Promise<string[]>;
    requestFileStat(params: { path: string }): Promise<any>;
    
    requestNetworkCall(params: NetworkCallParams): Promise<any>;
    
    requestGitExec(params: GitExecParams): Promise<string>;
    requestGitStatus(args?: string[]): Promise<string>;
    requestGitLog(args?: string[]): Promise<string>;
    requestGitDiff(args?: string[]): Promise<string>;
    
    buildIntent(): IntentBuilder;
}
