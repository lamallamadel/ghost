import { useState, useEffect } from 'react';
import { Shield, Eye, Zap, CheckCircle2, XCircle, Clock, ArrowRight, Activity } from 'lucide-react';

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

export function PipelineVisualizer() {
  const [executions, setExecutions] = useState<PipelineExecution[]>([]);
  const [selectedExecution, setSelectedExecution] = useState<PipelineExecution | null>(null);
  const [liveMode, setLiveMode] = useState(true);

  useEffect(() => {
    if (!liveMode) return;

    let ws: WebSocket | null = null;
    let unsubscribe: (() => void) | null = null;

    const connectWebSocket = async () => {
      try {
        ws = new WebSocket('ws://localhost:9876/ws/pipeline');
        
        ws.onmessage = (event) => {
          const execution = JSON.parse(event.data);
          setExecutions(prev => {
            const existing = prev.find(e => e.id === execution.id);
            if (existing) {
              return prev.map(e => e.id === execution.id ? { ...e, ...execution } : e);
            }
            return [execution, ...prev].slice(0, 50);
          });
        };

        ws.onerror = async () => {
          const { mockPlaygroundServer } = await import('@/utils/mockPlaygroundServer');
          unsubscribe = mockPlaygroundServer.subscribe('pipeline-execution', (execution: unknown) => {
            setExecutions(prev => {
              const exec = execution as PipelineExecution;
              const existing = prev.find(e => e.id === exec.id);
              if (existing) {
                return prev.map(e => e.id === exec.id ? { ...e, ...exec } : e);
              }
              return [exec, ...prev].slice(0, 50);
            });
          });
        };
      } catch {
        const { mockPlaygroundServer } = await import('@/utils/mockPlaygroundServer');
        unsubscribe = mockPlaygroundServer.subscribe('pipeline-execution', (execution: unknown) => {
          setExecutions(prev => {
            const exec = execution as PipelineExecution;
            const existing = prev.find(e => e.id === exec.id);
            if (existing) {
              return prev.map(e => e.id === exec.id ? { ...e, ...exec } : e);
            }
            return [exec, ...prev].slice(0, 50);
          });
        });
      }
    };

    connectWebSocket();

    return () => {
      ws?.close();
      unsubscribe?.();
    };
  }, [liveMode]);

  const getStageIcon = (stage: string) => {
    switch (stage) {
      case 'gateway': return Shield;
      case 'auth': return Shield;
      case 'audit': return Eye;
      case 'execute': return Zap;
      default: return Activity;
    }
  };

  const getStageColor = (status: string) => {
    switch (status) {
      case 'running': return 'text-cyan-400 bg-cyan-600/20 border-cyan-500/50';
      case 'completed': return 'text-green-400 bg-green-600/20 border-green-500/50';
      case 'failed': return 'text-red-400 bg-red-600/20 border-red-500/50';
      default: return 'text-white/40 bg-white/5 border-white/10';
    }
  };

  const renderStageFlow = (execution: PipelineExecution) => {
    const stages = ['gateway', 'auth', 'audit', 'execute'] as const;
    
    return (
      <div className="flex items-center gap-2">
        {stages.map((stageName, idx) => {
          const stage = execution.stages[stageName];
          const Icon = getStageIcon(stageName);
          const colors = getStageColor(stage.status);
          
          return (
            <div key={stageName} className="flex items-center">
              <div
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${colors} transition-all`}
              >
                <Icon className="w-4 h-4" />
                <span className="text-xs font-medium capitalize">{stageName}</span>
                {stage.duration && (
                  <span className="text-xs opacity-60">{stage.duration}ms</span>
                )}
              </div>
              {idx < stages.length - 1 && (
                <ArrowRight className="w-4 h-4 mx-1 text-white/40" />
              )}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="flex h-full">
      <div className="flex-1 flex flex-col border-r border-white/10">
        <div className="bg-white/5 border-b border-white/10 p-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-cyan-400" />
              <h2 className="text-lg font-semibold text-white">Pipeline Executions</h2>
              <span className="px-2 py-1 bg-cyan-600/20 text-cyan-400 text-xs rounded-full">
                {executions.length} executions
              </span>
            </div>
            <button
              onClick={() => setLiveMode(!liveMode)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                liveMode
                  ? 'bg-green-600/20 text-green-400'
                  : 'bg-white/10 text-white/60'
              }`}
            >
              {liveMode ? 'Live' : 'Paused'}
            </button>
          </div>

          <div className="bg-black/40 rounded-lg border border-white/10 p-4">
            <div className="text-sm font-semibold text-white mb-3">Pipeline Stages</div>
            <div className="space-y-2 text-xs text-white/80">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-purple-400" />
                <span className="font-semibold">Gateway:</span>
                <span className="text-white/60">Intercepts and validates intent</span>
              </div>
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-blue-400" />
                <span className="font-semibold">Auth:</span>
                <span className="text-white/60">Checks permissions and capabilities</span>
              </div>
              <div className="flex items-center gap-2">
                <Eye className="w-4 h-4 text-yellow-400" />
                <span className="font-semibold">Audit:</span>
                <span className="text-white/60">Logs operation for compliance</span>
              </div>
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-green-400" />
                <span className="font-semibold">Execute:</span>
                <span className="text-white/60">Performs the actual operation</span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {executions.length === 0 ? (
            <div className="flex items-center justify-center h-full text-white/40">
              <div className="text-center">
                <Activity className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No pipeline executions yet</p>
                <p className="text-sm mt-1">Execute intents to see pipeline flow</p>
              </div>
            </div>
          ) : (
            executions.map((execution) => (
              <button
                key={execution.id}
                onClick={() => setSelectedExecution(execution)}
                className={`w-full text-left p-4 rounded-lg border transition-all ${
                  selectedExecution?.id === execution.id
                    ? 'bg-cyan-600/20 border-cyan-500/50'
                    : 'bg-white/5 border-white/10 hover:bg-white/10'
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    {execution.status === 'completed' ? (
                      <CheckCircle2 className="w-5 h-5 text-green-400" />
                    ) : execution.status === 'failed' ? (
                      <XCircle className="w-5 h-5 text-red-400" />
                    ) : (
                      <Activity className="w-5 h-5 text-cyan-400 animate-pulse" />
                    )}
                    <span className="font-mono text-sm text-white">
                      {execution.method}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-white/60">
                    <Clock className="w-3 h-3" />
                    {execution.totalDuration ? `${execution.totalDuration}ms` : 'Running...'}
                  </div>
                </div>
                
                <div className="text-xs text-white/60 mb-3">
                  {execution.extensionId} • {new Date(execution.timestamp).toLocaleTimeString()}
                </div>

                <div className="overflow-x-auto">
                  {renderStageFlow(execution)}
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      <div className="w-1/2 bg-black/20 flex flex-col">
        {selectedExecution ? (
          <>
            <div className="bg-white/5 border-b border-white/10 p-4">
              <h3 className="text-lg font-semibold text-white mb-2">Execution Details</h3>
              <div className="flex items-center gap-4 text-sm">
                <span className={`px-2 py-1 rounded ${
                  selectedExecution.status === 'completed'
                    ? 'bg-green-600/20 text-green-400'
                    : selectedExecution.status === 'failed'
                    ? 'bg-red-600/20 text-red-400'
                    : 'bg-cyan-600/20 text-cyan-400'
                }`}>
                  {selectedExecution.status}
                </span>
                <span className="text-white/60">
                  {new Date(selectedExecution.timestamp).toLocaleString()}
                </span>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <div className="bg-white/5 rounded-lg border border-white/10 p-4">
                <div className="text-sm font-semibold text-white mb-2">Method</div>
                <div className="text-sm font-mono text-cyan-400">
                  {selectedExecution.method}
                </div>
              </div>

              <div className="bg-white/5 rounded-lg border border-white/10 p-4">
                <div className="text-sm font-semibold text-white mb-2">Extension ID</div>
                <div className="text-sm font-mono text-cyan-400">
                  {selectedExecution.extensionId}
                </div>
              </div>

              {selectedExecution.totalDuration && (
                <div className="bg-white/5 rounded-lg border border-white/10 p-4">
                  <div className="text-sm font-semibold text-white mb-2">Total Duration</div>
                  <div className="text-sm text-cyan-400">
                    {selectedExecution.totalDuration}ms
                  </div>
                </div>
              )}

              <div className="space-y-3">
                <div className="text-sm font-semibold text-white">Stage Breakdown</div>
                
                {Object.entries(selectedExecution.stages).map(([stageName, stage]) => {
                  const Icon = getStageIcon(stageName);
                  
                  return (
                    <div
                      key={stageName}
                      className={`rounded-lg border p-4 ${
                        stage.status === 'failed'
                          ? 'bg-red-900/20 border-red-600/50'
                          : 'bg-white/5 border-white/10'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Icon className={`w-4 h-4 ${
                            stage.status === 'completed' ? 'text-green-400' :
                            stage.status === 'failed' ? 'text-red-400' :
                            stage.status === 'running' ? 'text-cyan-400' :
                            'text-white/40'
                          }`} />
                          <span className="text-sm font-semibold text-white capitalize">
                            {stageName}
                          </span>
                        </div>
                        <span className={`text-xs px-2 py-1 rounded ${getStageColor(stage.status)}`}>
                          {stage.status}
                        </span>
                      </div>

                      {stage.duration && (
                        <div className="text-xs text-white/60 mb-2">
                          Duration: {stage.duration}ms
                        </div>
                      )}

                      {stage.error && (
                        <div className="mt-2 p-2 bg-red-900/20 rounded border border-red-800/50">
                          <div className="text-xs text-red-300">
                            {stage.error}
                          </div>
                        </div>
                      )}

                      {stage.details && (
                        <div className="mt-2">
                          <pre className="text-xs text-white/60 font-mono overflow-auto max-h-32 p-2 bg-black/40 rounded">
                            {JSON.stringify(stage.details, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="bg-white/5 rounded-lg border border-white/10 p-4">
                <div className="text-sm font-semibold text-white mb-3">Performance Breakdown</div>
                <div className="space-y-2">
                  {Object.entries(selectedExecution.stages).map(([stageName, stage]) => (
                    stage.duration ? (
                      <div key={stageName} className="flex items-center gap-2">
                        <div className="w-24 text-xs text-white/60 capitalize">{stageName}</div>
                        <div className="flex-1 h-6 bg-black/40 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              stageName === 'gateway' ? 'bg-purple-500' :
                              stageName === 'auth' ? 'bg-blue-500' :
                              stageName === 'audit' ? 'bg-yellow-500' :
                              'bg-green-500'
                            }`}
                            style={{
                              width: `${(stage.duration / (selectedExecution.totalDuration || 1)) * 100}%`
                            }}
                          />
                        </div>
                        <div className="w-16 text-xs text-white/60 text-right">
                          {stage.duration}ms
                        </div>
                      </div>
                    ) : null
                  ))}
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center h-full text-white/40">
            <div className="text-center">
              <Activity className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>Select an execution to view details</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
