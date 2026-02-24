import { IntentBuilder } from './intent-builder';
import { RPCClient } from './rpc-client';

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

export class ExtensionSDK {
    constructor(extensionId: string);
    
    emitIntent(intent: IntentParams): Promise<IntentResponse>;
    
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
