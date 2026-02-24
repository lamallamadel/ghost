export interface IntentParams {
    type: string;
    operation: string;
    params: Record<string, any>;
    extensionId: string;
    requestId: string;
}

export class IntentBuilder {
    constructor(extensionId: string);
    
    filesystem(operation: string, params: Record<string, any>): IntentParams;
    network(operation: string, params: Record<string, any>): IntentParams;
    git(operation: string, params: Record<string, any>): IntentParams;
    process(command: string, args?: string[]): IntentParams;
}
