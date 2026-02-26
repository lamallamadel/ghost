import { useState, useEffect, useCallback } from 'react';
import { Activity, Cpu, HardDrive, AlertTriangle, TrendingUp } from 'lucide-react';

interface ProfileMetrics {
  extensionId: string;
  uptime: number;
  cpu: {
    totalTimeMs: number;
    averageUsagePercent: number;
    samples: string;
  };
  memory: {
    current: {
      heapUsedMB: string;
      heapTotalMB: string;
      externalMB: string;
      rssMB: string;
    };
    history: Array<{
      heapUsed: number;
      heapTotal: number;
      external: number;
      rss: number;
      timestamp: number;
    }>;
  };
  execution: {
    totalCalls: number;
    averageDurationMs: string;
    maxDurationMs: number;
    recentExecutions: Array<{
      method: string;
      duration: number;
      success: boolean;
      timestamp: number;
    }>;
  };
  bottlenecks: Array<{
    method: string;
    duration: number;
    timestamp: number;
  }>;
}

interface FlamegraphNode {
  name: string;
  value: number;
  children?: FlamegraphNode[];
  callCount?: number;
  avgTime?: number;
}

export function ProfilingDashboard() {
  const [metrics, setMetrics] = useState<Record<string, ProfileMetrics>>({});
  const [selectedExtension, setSelectedExtension] = useState<string>('');
  const [flamegraph, setFlamegraph] = useState<FlamegraphNode | null>(null);

  const loadMetrics = useCallback(async () => {
    try {
      const response = await fetch('http://localhost:9876/api/profiling/metrics');
      if (response.ok) {
        const data = await response.json();
        setMetrics(data);
        
        if (!selectedExtension && Object.keys(data).length > 0) {
          setSelectedExtension(Object.keys(data)[0]);
        }
      }
    } catch (error) {
      console.error('Failed to load metrics:', error);
    }
  }, [selectedExtension]);

  useEffect(() => {
    loadMetrics();
    const interval = setInterval(loadMetrics, 1000);
    return () => clearInterval(interval);
  }, [loadMetrics]);

  const loadFlamegraph = async (extensionId: string) => {
    try {
      const response = await fetch(`http://localhost:9876/api/profiling/flamegraph/${extensionId}`);
      if (response.ok) {
        const data = await response.json();
        setFlamegraph(data);
      }
    } catch (error) {
      console.error('Failed to load flamegraph:', error);
    }
  };

  const handleResetMetrics = async (extensionId?: string) => {
    try {
      const url = extensionId
        ? `http://localhost:9876/api/profiling/reset/${extensionId}`
        : 'http://localhost:9876/api/profiling/reset';
      
      await fetch(url, { method: 'POST' });
      await loadMetrics();
    } catch (error) {
      console.error('Failed to reset metrics:', error);
    }
  };

  const selectedMetrics = selectedExtension ? metrics[selectedExtension] : null;

  const formatUptime = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  };

  const renderFlamegraph = (node: FlamegraphNode, level: number = 0) => {
    const width = node.value > 0 ? Math.max(10, (node.value / 10)) : 10;
    const color = level === 0 ? 'bg-cyan-600' : level === 1 ? 'bg-blue-600' : 'bg-purple-600';
    
    return (
      <div key={node.name} className="space-y-1">
        <div
          className={`${color} rounded px-2 py-1 text-white text-xs`}
          style={{ width: `${width}%` }}
          title={`${node.name}: ${node.value.toFixed(2)}ms${node.callCount ? ` (${node.callCount} calls)` : ''}`}
        >
          {node.name} ({node.value.toFixed(1)}ms)
        </div>
        {node.children && (
          <div className="ml-4 space-y-1">
            {node.children.map(child => renderFlamegraph(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  if (Object.keys(metrics).length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        <div className="text-center">
          <Activity className="w-12 h-12 mx-auto mb-2 opacity-50" />
          <p>No profiling data available</p>
          <p className="text-sm mt-1">Start extensions to see metrics</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white">Extension Profiling</h3>
          <button
            onClick={() => handleResetMetrics()}
            className="px-3 py-1 text-sm bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors"
          >
            Reset All
          </button>
        </div>

        <div className="flex gap-2 mb-4">
          {Object.keys(metrics).map(extId => (
            <button
              key={extId}
              onClick={() => {
                setSelectedExtension(extId);
                loadFlamegraph(extId);
              }}
              className={`px-3 py-1 rounded transition-colors ${
                selectedExtension === extId
                  ? 'bg-cyan-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              {extId}
            </button>
          ))}
        </div>
      </div>

      {selectedMetrics && (
        <>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
              <div className="flex items-center gap-2 mb-3">
                <Cpu className="w-5 h-5 text-cyan-400" />
                <h4 className="text-md font-semibold text-white">CPU Usage</h4>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Average:</span>
                  <span className="text-white">{selectedMetrics.cpu.averageUsagePercent.toFixed(2)}%</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Total Time:</span>
                  <span className="text-white">{selectedMetrics.cpu.totalTimeMs.toFixed(0)}ms</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Uptime:</span>
                  <span className="text-white">{formatUptime(selectedMetrics.uptime)}</span>
                </div>
              </div>
            </div>

            <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
              <div className="flex items-center gap-2 mb-3">
                <HardDrive className="w-5 h-5 text-purple-400" />
                <h4 className="text-md font-semibold text-white">Memory Usage</h4>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Heap Used:</span>
                  <span className="text-white">{selectedMetrics.memory.current.heapUsedMB} MB</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Heap Total:</span>
                  <span className="text-white">{selectedMetrics.memory.current.heapTotalMB} MB</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">RSS:</span>
                  <span className="text-white">{selectedMetrics.memory.current.rssMB} MB</span>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="w-5 h-5 text-green-400" />
              <h4 className="text-md font-semibold text-white">Execution Statistics</h4>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center p-3 bg-gray-900 rounded">
                <div className="text-2xl font-bold text-white">{selectedMetrics.execution.totalCalls}</div>
                <div className="text-xs text-gray-400 mt-1">Total Calls</div>
              </div>
              <div className="text-center p-3 bg-gray-900 rounded">
                <div className="text-2xl font-bold text-white">{selectedMetrics.execution.averageDurationMs}ms</div>
                <div className="text-xs text-gray-400 mt-1">Avg Duration</div>
              </div>
              <div className="text-center p-3 bg-gray-900 rounded">
                <div className="text-2xl font-bold text-white">{selectedMetrics.execution.maxDurationMs}ms</div>
                <div className="text-xs text-gray-400 mt-1">Max Duration</div>
              </div>
            </div>
          </div>

          {selectedMetrics.bottlenecks.length > 0 && (
            <div className="bg-gray-800 rounded-lg p-4 border border-yellow-600">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="w-5 h-5 text-yellow-400" />
                <h4 className="text-md font-semibold text-white">Performance Bottlenecks</h4>
              </div>
              <div className="space-y-2">
                {selectedMetrics.bottlenecks.map((bottleneck, idx) => (
                  <div key={idx} className="p-2 bg-yellow-900/20 rounded border border-yellow-800">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-white font-mono">{bottleneck.method}</span>
                      <span className="text-sm text-yellow-400">{bottleneck.duration.toFixed(0)}ms</span>
                    </div>
                    <div className="text-xs text-gray-400 mt-1">
                      {new Date(bottleneck.timestamp).toLocaleTimeString()}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {flamegraph && (
            <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
              <h4 className="text-md font-semibold text-white mb-3">Flamegraph</h4>
              <div className="bg-gray-900 p-4 rounded border border-gray-700 overflow-auto">
                {renderFlamegraph(flamegraph)}
              </div>
            </div>
          )}

          <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <h4 className="text-md font-semibold text-white mb-3">Recent Executions</h4>
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {selectedMetrics.execution.recentExecutions.map((exec, idx) => (
                <div key={idx} className="flex justify-between items-center p-2 bg-gray-900 rounded text-sm">
                  <span className="text-white font-mono">{exec.method}</span>
                  <span className={exec.success ? 'text-green-400' : 'text-red-400'}>
                    {exec.duration.toFixed(1)}ms
                  </span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
