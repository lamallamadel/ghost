export interface IntentParams {
    type: string;
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

export class RPCClient {
    constructor(extensionId: string);
    
    send(intent: IntentParams): Promise<IntentResponse>;
    sendBatch(intents: IntentParams[]): Promise<IntentResponse[]>;
}
