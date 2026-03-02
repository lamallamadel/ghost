export class MockPlaygroundServer {
  private static instance: MockPlaygroundServer | null = null;
  private listeners: Map<string, Set<(data: unknown) => void>> = new Map();

  static getInstance(): MockPlaygroundServer {
    if (!MockPlaygroundServer.instance) {
      MockPlaygroundServer.instance = new MockPlaygroundServer();
    }
    return MockPlaygroundServer.instance;
  }

  subscribe(channel: string, callback: (data: unknown) => void): () => void {
    if (!this.listeners.has(channel)) {
      this.listeners.set(channel, new Set());
    }
    this.listeners.get(channel)!.add(callback);

    return () => {
      this.listeners.get(channel)?.delete(callback);
    };
  }

  emit(channel: string, data: unknown): void {
    const listeners = this.listeners.get(channel);
    if (listeners) {
      listeners.forEach(callback => callback(data));
    }
  }

  async executeIntent(extensionId: string, intent: {
    jsonrpc: string;
    method: string;
    params: unknown;
    id: number;
  }): Promise<{ success: boolean; result?: unknown; error?: string; duration?: number }> {
    const startTime = Date.now();
    
    const requestMessage = {
      timestamp: Date.now(),
      direction: 'request' as const,
      extensionId,
      method: intent.method,
      params: intent.params,
      requestId: intent.id
    };
    this.emit('rpc-message', requestMessage);

    const executionId = `exec-${Date.now()}`;
    const pipelineExecution = {
      id: executionId,
      extensionId,
      method: intent.method,
      timestamp: Date.now(),
      status: 'running' as const,
      stages: {
        gateway: { name: 'gateway', status: 'running' as const, timestamp: Date.now() },
        auth: { name: 'auth', status: 'pending' as const },
        audit: { name: 'audit', status: 'pending' as const },
        execute: { name: 'execute', status: 'pending' as const }
      }
    };
    this.emit('pipeline-execution', pipelineExecution);

    await this.simulateStage(executionId, 'gateway', 50);
    await this.simulateStage(executionId, 'auth', 30);
    await this.simulateStage(executionId, 'audit', 20);
    
    try {
      const result = await this.simulateExecution(intent);
      await this.simulateStage(executionId, 'execute', 100);

      const duration = Date.now() - startTime;
      
      const responseMessage = {
        timestamp: Date.now(),
        direction: 'response' as const,
        extensionId,
        result,
        requestId: intent.id,
        duration
      };
      this.emit('rpc-message', responseMessage);

      const completedExecution = {
        id: executionId,
        status: 'completed' as const,
        totalDuration: duration,
        stages: {
          gateway: { ...pipelineExecution.stages.gateway, status: 'completed' as const, duration: 50 },
          auth: { ...pipelineExecution.stages.auth, status: 'completed' as const, duration: 30 },
          audit: { ...pipelineExecution.stages.audit, status: 'completed' as const, duration: 20 },
          execute: { ...pipelineExecution.stages.execute, status: 'completed' as const, duration: 100 }
        }
      };
      this.emit('pipeline-execution', { ...pipelineExecution, ...completedExecution });

      return { success: true, result, duration };
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Execution failed';

      const errorResponse = {
        timestamp: Date.now(),
        direction: 'response' as const,
        extensionId,
        error: {
          code: -32603,
          message: errorMessage
        },
        requestId: intent.id,
        duration
      };
      this.emit('rpc-message', errorResponse);

      const failedExecution = {
        id: executionId,
        status: 'failed' as const,
        totalDuration: duration,
        stages: {
          ...pipelineExecution.stages,
          execute: {
            ...pipelineExecution.stages.execute,
            status: 'failed' as const,
            error: errorMessage
          }
        }
      };
      this.emit('pipeline-execution', { ...pipelineExecution, ...failedExecution });

      return { success: false, error: errorMessage, duration };
    }
  }

  private async simulateStage(executionId: string, stage: string, duration: number): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, duration));
  }

  private async simulateExecution(intent: {
    method: string;
    params: unknown;
  }): Promise<unknown> {
    const [type, operation] = intent.method.split(':');

    switch (type) {
      case 'filesystem':
        return this.simulateFilesystem(operation, intent.params);
      case 'network':
        return this.simulateNetwork(operation, intent.params);
      case 'git':
        return this.simulateGit(operation, intent.params);
      default:
        throw new Error(`Unknown intent type: ${type}`);
    }
  }

  private simulateFilesystem(operation: string, params: unknown): unknown {
    const p = params as Record<string, unknown>;
    
    switch (operation) {
      case 'read':
        return {
          content: `# Mock File Content\n\nThis is a simulated file read for: ${p.path}`,
          encoding: 'utf8'
        };
      case 'write':
        return { success: true, bytesWritten: 42 };
      case 'readdir':
        return {
          files: ['file1.js', 'file2.ts', 'README.md', 'package.json'],
          directories: ['src', 'test', 'docs']
        };
      case 'stat':
        return {
          size: 1024,
          isFile: true,
          isDirectory: false,
          mtime: new Date().toISOString(),
          ctime: new Date().toISOString()
        };
      default:
        throw new Error(`Unknown filesystem operation: ${operation}`);
    }
  }

  private simulateNetwork(_operation: string, params: unknown): unknown {
    const p = params as Record<string, unknown>;
    
    return {
      status: 200,
      statusText: 'OK',
      headers: { 'content-type': 'application/json' },
      body: {
        message: 'Mock network response',
        url: p.url,
        method: p.method || 'GET',
        timestamp: new Date().toISOString()
      }
    };
  }

  private simulateGit(operation: string, _params: unknown): unknown {
    switch (operation) {
      case 'status':
        return {
          branch: 'main',
          ahead: 0,
          behind: 0,
          staged: ['src/newfile.ts'],
          unstaged: ['src/modified.ts'],
          untracked: ['temp.log']
        };
      case 'log':
        return {
          commits: [
            {
              hash: 'abc123',
              author: 'John Doe',
              date: new Date().toISOString(),
              message: 'feat: add new feature'
            },
            {
              hash: 'def456',
              author: 'Jane Smith',
              date: new Date(Date.now() - 86400000).toISOString(),
              message: 'fix: resolve bug'
            }
          ]
        };
      case 'diff':
        return {
          files: [
            {
              path: 'src/modified.ts',
              additions: 10,
              deletions: 5,
              diff: '+++ added lines\n--- removed lines'
            }
          ]
        };
      default:
        throw new Error(`Unknown git operation: ${operation}`);
    }
  }
}

export const mockPlaygroundServer = MockPlaygroundServer.getInstance();
