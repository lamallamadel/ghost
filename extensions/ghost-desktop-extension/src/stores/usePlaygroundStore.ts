import { create } from 'zustand';

interface RPCMessage {
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

interface PipelineStage {
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  duration?: number;
  timestamp?: number;
  details?: unknown;
  error?: string;
}

interface PipelineExecution {
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

interface PlaygroundState {
  rpcMessages: RPCMessage[];
  pipelineExecutions: PipelineExecution[];
  addRPCMessage: (message: Omit<RPCMessage, 'id'>) => void;
  addPipelineExecution: (execution: PipelineExecution) => void;
  updatePipelineExecution: (id: string, execution: Partial<PipelineExecution>) => void;
  clearRPCMessages: () => void;
  clearPipelineExecutions: () => void;
}

export const usePlaygroundStore = create<PlaygroundState>((set) => ({
  rpcMessages: [],
  pipelineExecutions: [],
  
  addRPCMessage: (message) => set((state) => ({
    rpcMessages: [
      ...state.rpcMessages,
      {
        ...message,
        id: `${message.timestamp}-${Math.random()}`
      }
    ]
  })),
  
  addPipelineExecution: (execution) => set((state) => ({
    pipelineExecutions: [execution, ...state.pipelineExecutions].slice(0, 50)
  })),
  
  updatePipelineExecution: (id, updates) => set((state) => ({
    pipelineExecutions: state.pipelineExecutions.map((exec) =>
      exec.id === id ? { ...exec, ...updates } : exec
    )
  })),
  
  clearRPCMessages: () => set({ rpcMessages: [] }),
  
  clearPipelineExecutions: () => set({ pipelineExecutions: [] })
}));
