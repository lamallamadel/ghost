import { useState, useEffect, useCallback } from 'react';
import { Activity, TrendingUp, AlertTriangle, Clock, Zap, DollarSign, GitBranch } from 'lucide-react';
import { PerformanceChart } from './PerformanceChart';
import { CostAttributionChart } from './CostAttributionChart';
import { DistributedTracingGraph } from './DistributedTracingGraph';
import { RegressionAlerts } from './RegressionAlerts';
import { RealTimeMetricsChart } from './RealTimeMetricsChart';
import { useTelemetryWebSocket } from '../hooks/useTelemetryWebSocket';

interface ExtensionMetrics {
  invocationCount: number;
  successCount: number;
  failureCount: number;
  successRate: number;
  duration: {
    avg: number;
    p50: number;
    p95: number;
    p99: number;
    min: number;
    max: number;
  };
  resources: {
    cpu: { avg: number; total: number };
    memory: { avg: number; total: number };
    io: { avg: number; total: number };
    network: { avg: number; total: number };
  };
}

interface CostBreakdown {
  extensionId: string;
  totalCost: number;
  resources: {
    cpu: number;
    memory: number;
    io: number;
    network: number;
    storage: number;
  };
  billingPeriod: string;
  projectedMonthlyCost?: number;
  invocations?: number;
}

interface RegressionAlert {
  id: string;
  extensionId: string;
  version: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  metric: string;
  baselineValue: number;
  currentValue: number;
  percentChange: number;
  threshold: number;
  timestamp: number;
}

interface CallGraphNode {
  extensionId: string;
  operation: string;
  callCount: number;
  totalDuration: number;
  avgDuration: number;
}

interface CallGraphEdge {
  from: string;
  to: string;
  callCount: number;
}

interface CallGraph {
  nodes: CallGraphNode[];
  edges: CallGraphEdge[];
}

interface AnalyticsDashboardData {
  metrics: Record<string, ExtensionMetrics>;
  costs: CostBreakdown[];
  alerts: RegressionAlert[];
  callGraph: CallGraph;
  timestamp: number;
}

export function AnalyticsDashboard() {
  const [data, setData] = useState<AnalyticsDashboardData | null>(null);
  const [selectedExtension, setSelectedExtension] = useState<string>('');
  const [timeRange, setTimeRange] = useState<'1h' | '6h' | '24h' | '7d'>('6h');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [liveUpdatesEnabled, setLiveUpdatesEnabled] = useState(true);

  const { connectionState, subscribe } = useTelemetryWebSocket({
    port: 9877,
    autoReconnect: true,
    onEvent: (event) => {
      if (event.type === 'invocation-completed' || 
          event.type === 'cost-recorded' || 
          event.type === 'regression-detected') {
        loadAnalytics();
      }
    },
  });

  const loadAnalytics = useCallback(async () => {
    try {
      const response = await fetch(`http://localhost:9876/api/analytics/dashboard?timeRange=${timeRange}`);
      if (response.ok) {
        const analyticsData = await response.json();
        setData(analyticsData);
        
        if (!selectedExtension && Object.keys(analyticsData.metrics || {}).length > 0) {
          setSelectedExtension(Object.keys(analyticsData.metrics)[0]);
        }
        setError(null);
      } else {
        setError('Failed to load analytics data');
      }
    } catch (err) {
      console.error('Failed to load analytics:', err);
      setError('Unable to connect to analytics service');
    } finally {
      setLoading(false);
    }
  }, [timeRange, selectedExtension]);

  useEffect(() => {
    loadAnalytics();
    const interval = setInterval(loadAnalytics, 5000);
    return () => clearInterval(interval);
  }, [loadAnalytics]);

  useEffect(() => {
    if (selectedExtension && connectionState === 'connected') {
      subscribe([selectedExtension]);
    }
  }, [selectedExtension, connectionState, subscribe]);

  const formatDuration = (ms: number) => {
    if (ms < 1) return `${(ms * 1000).toFixed(0)}μs`;
    if (ms < 1000) return `${ms.toFixed(1)}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  const formatCost = (cost: number) => {
    return `$${cost.toFixed(4)}`;
  };

  const formatPercent = (value: number) => {
    return `${(value * 100).toFixed(1)}%`;
  };

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        <div className="text-center">
          <Activity className="w-12 h-12 mx-auto mb-2 opacity-50 animate-pulse" />
          <p>Loading analytics data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64 text-red-400">
        <div className="text-center">
          <AlertTriangle className="w-12 h-12 mx-auto mb-2" />
          <p>{error}</p>
          <button
            onClick={loadAnalytics}
            className="mt-4 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!data || Object.keys(data.metrics || {}).length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        <div className="text-center">
          <Activity className="w-12 h-12 mx-auto mb-2 opacity-50" />
          <p>No analytics data available</p>
          <p className="text-sm mt-1">Extension invocations will appear here</p>
        </div>
      </div>
    );
  }

  const selectedMetrics = selectedExtension ? data.metrics[selectedExtension] : null;
  const selectedCosts = data.costs.find(c => c.extensionId === selectedExtension);
  const criticalAlerts = data.alerts.filter(a => a.severity === 'critical' || a.severity === 'high');

  return (
    <div className="space-y-4">
      {/* Header Controls */}
      <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <Activity className="w-5 h-5 text-cyan-400" />
            Analytics Dashboard
          </h3>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400">WebSocket:</span>
              <div className={`flex items-center gap-1 px-2 py-1 rounded text-xs ${
                connectionState === 'connected' 
                  ? 'bg-green-900/30 text-green-400' 
                  : connectionState === 'connecting'
                  ? 'bg-yellow-900/30 text-yellow-400'
                  : 'bg-red-900/30 text-red-400'
              }`}>
                <div className={`w-2 h-2 rounded-full ${
                  connectionState === 'connected' 
                    ? 'bg-green-500 animate-pulse' 
                    : connectionState === 'connecting'
                    ? 'bg-yellow-500 animate-pulse'
                    : 'bg-red-500'
                }`}></div>
                <span className="capitalize">{connectionState}</span>
              </div>
            </div>
            <button
              onClick={() => setLiveUpdatesEnabled(!liveUpdatesEnabled)}
              className={`px-3 py-1 text-sm rounded transition-colors ${
                liveUpdatesEnabled
                  ? 'bg-green-600 hover:bg-green-700 text-white'
                  : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
              }`}
            >
              {liveUpdatesEnabled ? 'Live' : 'Paused'}
            </button>
            <select
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value as '1h' | '6h' | '24h' | '7d')}
              className="px-3 py-1 text-sm bg-gray-700 border border-gray-600 text-white rounded"
            >
              <option value="1h">Last Hour</option>
              <option value="6h">Last 6 Hours</option>
              <option value="24h">Last 24 Hours</option>
              <option value="7d">Last 7 Days</option>
            </select>
            <button
              onClick={loadAnalytics}
              className="px-3 py-1 text-sm bg-cyan-600 hover:bg-cyan-700 text-white rounded transition-colors"
            >
              Refresh
            </button>
          </div>
        </div>

        {/* Extension Selector */}
        <div className="flex gap-2 overflow-x-auto">
          {Object.keys(data.metrics).map(extId => (
            <button
              key={extId}
              onClick={() => setSelectedExtension(extId)}
              className={`px-3 py-1 rounded whitespace-nowrap transition-colors ${
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

      {/* Critical Alerts Banner */}
      {criticalAlerts.length > 0 && (
        <div className="bg-red-900/30 border border-red-600 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-5 h-5 text-red-400" />
            <h4 className="text-md font-semibold text-red-300">
              {criticalAlerts.length} Critical Performance Alert{criticalAlerts.length > 1 ? 's' : ''}
            </h4>
          </div>
          <div className="space-y-1">
            {criticalAlerts.slice(0, 3).map(alert => (
              <div key={alert.id} className="text-sm text-red-200">
                <span className="font-mono">{alert.extensionId}</span>: {alert.metric} increased by{' '}
                {alert.percentChange.toFixed(1)}% (threshold: {alert.threshold * 100}%)
              </div>
            ))}
          </div>
        </div>
      )}

      {selectedMetrics && (
        <>
          {/* Key Metrics Overview */}
          <div className="grid grid-cols-4 gap-4">
            <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
              <div className="flex items-center gap-2 mb-2">
                <Zap className="w-4 h-4 text-yellow-400" />
                <div className="text-xs text-gray-400">Total Invocations</div>
              </div>
              <div className="text-2xl font-bold text-white">{selectedMetrics.invocationCount}</div>
              <div className="text-xs text-gray-400 mt-1">
                Success Rate: {formatPercent(selectedMetrics.successRate)}
              </div>
            </div>

            <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="w-4 h-4 text-blue-400" />
                <div className="text-xs text-gray-400">P50 Duration</div>
              </div>
              <div className="text-2xl font-bold text-white">{formatDuration(selectedMetrics.duration.p50)}</div>
              <div className="text-xs text-gray-400 mt-1">
                P95: {formatDuration(selectedMetrics.duration.p95)}
              </div>
            </div>

            <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="w-4 h-4 text-purple-400" />
                <div className="text-xs text-gray-400">P99 Duration</div>
              </div>
              <div className="text-2xl font-bold text-white">{formatDuration(selectedMetrics.duration.p99)}</div>
              <div className="text-xs text-gray-400 mt-1">
                Max: {formatDuration(selectedMetrics.duration.max)}
              </div>
            </div>

            <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
              <div className="flex items-center gap-2 mb-2">
                <DollarSign className="w-4 h-4 text-green-400" />
                <div className="text-xs text-gray-400">Total Cost</div>
              </div>
              <div className="text-2xl font-bold text-white">
                {selectedCosts ? formatCost(selectedCosts.totalCost) : '$0.00'}
              </div>
              <div className="text-xs text-gray-400 mt-1">
                {selectedCosts?.billingPeriod || 'This period'}
              </div>
            </div>
          </div>

          {/* Real-Time Metrics and Cost */}
          <div className="grid grid-cols-2 gap-4">
            <RealTimeMetricsChart
              extensionId={selectedExtension}
              liveUpdates={liveUpdatesEnabled && connectionState === 'connected'}
            />
            
            {selectedCosts && (
              <CostAttributionChart
                costs={selectedCosts}
              />
            )}
          </div>

          {/* Performance Charts */}
          <div className="grid grid-cols-2 gap-4">
            <PerformanceChart
              extensionId={selectedExtension}
              metrics={selectedMetrics}
              timeRange={timeRange}
            />
          </div>

          {/* Success/Failure Breakdown */}
          <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <h4 className="text-md font-semibold text-white mb-3 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-green-400" />
              Success & Failure Analysis
            </h4>
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center p-3 bg-green-900/20 border border-green-800 rounded">
                <div className="text-3xl font-bold text-green-400">{selectedMetrics.successCount}</div>
                <div className="text-xs text-gray-400 mt-1">Successful</div>
              </div>
              <div className="text-center p-3 bg-red-900/20 border border-red-800 rounded">
                <div className="text-3xl font-bold text-red-400">{selectedMetrics.failureCount}</div>
                <div className="text-xs text-gray-400 mt-1">Failed</div>
              </div>
              <div className="text-center p-3 bg-blue-900/20 border border-blue-800 rounded">
                <div className="text-3xl font-bold text-blue-400">
                  {formatPercent(selectedMetrics.successRate)}
                </div>
                <div className="text-xs text-gray-400 mt-1">Success Rate</div>
              </div>
            </div>
          </div>

          {/* Resource Usage */}
          <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <h4 className="text-md font-semibold text-white mb-3">Resource Consumption</h4>
            <div className="grid grid-cols-4 gap-4">
              <div className="p-3 bg-gray-900 rounded">
                <div className="text-sm text-gray-400 mb-1">CPU</div>
                <div className="text-xl font-bold text-cyan-400">
                  {selectedMetrics.resources.cpu.avg.toFixed(2)}%
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  Total: {selectedMetrics.resources.cpu.total.toFixed(2)}ms
                </div>
              </div>
              <div className="p-3 bg-gray-900 rounded">
                <div className="text-sm text-gray-400 mb-1">Memory</div>
                <div className="text-xl font-bold text-purple-400">
                  {selectedMetrics.resources.memory.avg.toFixed(2)} MB
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  Total: {selectedMetrics.resources.memory.total.toFixed(2)} MB
                </div>
              </div>
              <div className="p-3 bg-gray-900 rounded">
                <div className="text-sm text-gray-400 mb-1">I/O</div>
                <div className="text-xl font-bold text-green-400">
                  {(selectedMetrics.resources.io.avg / 1024).toFixed(2)} KB
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  Total: {(selectedMetrics.resources.io.total / 1024).toFixed(2)} KB
                </div>
              </div>
              <div className="p-3 bg-gray-900 rounded">
                <div className="text-sm text-gray-400 mb-1">Network</div>
                <div className="text-xl font-bold text-yellow-400">
                  {(selectedMetrics.resources.network.avg / 1024).toFixed(2)} KB
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  Total: {(selectedMetrics.resources.network.total / 1024).toFixed(2)} KB
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Regression Alerts */}
      {data.alerts.length > 0 && (
        <RegressionAlerts alerts={data.alerts} />
      )}

      {/* Distributed Tracing Call Graph */}
      {data.callGraph && data.callGraph.nodes.length > 0 && (
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <h4 className="text-md font-semibold text-white mb-3 flex items-center gap-2">
            <GitBranch className="w-5 h-5 text-cyan-400" />
            Extension Call Graph
          </h4>
          <DistributedTracingGraph callGraph={data.callGraph} />
        </div>
      )}
    </div>
  );
}
