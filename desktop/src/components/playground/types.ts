export interface RPCMessage {
  id: string;
  timestamp: number;
  direction: 'request' | 'response';
  extensionId: string;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
  duration?: number;
  requestId?: number | string;
}

export interface PipelineStage {
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  duration?: number;
  timestamp?: number;
  details?: unknown;
  error?: string;
}

export interface PipelineExecution {
  id: string;
  extensionId: string;
  method: string;
  timestamp: number;
  status: 'running' | 'completed' | 'failed';
  stages: {
    gateway: PipelineStage;
    auth: PipelineStage;
    audit: PipelineStage;
    execute: PipelineStage;
  };
  totalDuration?: number;
}

export interface IntentTemplate {
  name: string;
  type: string;
  operation: string;
  params: Record<string, unknown>;
  description: string;
}

export interface ExecutionResult {
  success: boolean;
  result?: unknown;
  error?: string;
  duration?: number;
  timestamp?: number;
}

export interface ValidationError {
  field: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface ExtensionManifest {
  id: string;
  name: string;
  version: string;
  description?: string;
  main: string;
  author?: string;
  capabilities: {
    filesystem?: boolean;
    network?: boolean;
    git?: boolean;
  };
  permissions?: {
    read?: string[];
    write?: string[];
    execute?: string[];
  };
  config?: Record<string, unknown>;
}
