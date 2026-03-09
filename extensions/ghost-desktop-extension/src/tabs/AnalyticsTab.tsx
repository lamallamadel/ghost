import { useState, useEffect, useCallback } from 'react';
import { Activity, TrendingUp, AlertTriangle, Clock, Zap, DollarSign, GitBranch } from 'lucide-react';
import { PerformanceChart } from '@/components/PerformanceChart';
import { CostAttributionChart } from '@/components/CostAttributionChart';
import { DistributedTracingGraph } from '@/components/DistributedTracingGraph';
import { RegressionAlerts } from '@/components/RegressionAlerts';
import { BehaviorAnalyticsPanel } from '@/components/BehaviorAnalyticsPanel';
import { RecommendationEnginePanel } from '@/components/RecommendationEnginePanel';
import { RealTimeMetricsChart } from '@/components/RealTimeMetricsChart';

interface ExtensionMetrics {
  invocationCount: number;
  successCount: number;
  failureCount: number;
  successRate: number;
  duration: {
    average: number;
    total: number;
    p50: number;
    p95: number;
    p99: number;
    min?: number;
    max?: number;
  };
  resources: {
    cpu: { avg: number; total: number; min?: number; max?: number; p95?: number };
    memory: { avg: number; total: number; min?: number; max?: number; p95?: number };
    io: { avg: number; total: number; min?: number; max?: number; p95?: number };
    network: { avg: number; total: number; min?: number; max?: number; p95?: number };
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
}

interface RegressionAlert {
  id?: string;
  alertId?: string;
  extensionId: string;
  version: string;
  baselineVersion?: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  metric?: string;
  regressions?: Array<{
    metric: string;
    baseline: number;
    current: number;
    threshold: number;
    exceeded: number;
  }>;
  baselineValue?: number;
  currentValue?: number;
  percentChange?: number;
  threshold?: number;
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

interface BehaviorData {
  mostUsedCommands: Array<{
    command: string;
    count: number;
    byExtension: Record<string, number>;
  }>;
  mostUsedExtensions: Array<{
    extensionId: string;
    commandCount: number;
    commands: Array<{ command: string; count: number }>;
  }>;
  commonWorkflows: Array<{
    pattern: string;
    commands: string[];
    count: number;
    avgDuration: number;
  }>;
  session: {
    commandCount: number;
    uniqueCommands: number;
    uniqueExtensions: number;
    duration: number;
    durationFormatted: string;
  };
}

interface Recommendation {
  extensionId: string;
  reason: string;
  category: string;
  confidence: number;
  score: number;
}

interface AnalyticsDashboardData {
  timestamp: number;
  timestampISO?: string;
  metrics: Record<string, ExtensionMetrics>;
  behavior?: BehaviorData;
  cost?: {
    period: string;
    extensions: CostBreakdown[];
    totalCost: number;
  };
  performance?: {
    alerts: RegressionAlert[];
  };
  tracing?: {
    crossExtensionCalls: Array<{
      traceId: string;
      extensions: string[];
      calls: Array<{
        from: string;
        to: string;
        operation: string;
        duration: number;
        status: string;
      }>;
    }>;
    extensionInteractions: Array<{
      from: string;
      to: string;
      callCount: number;
      avgDuration: number;
      operations: Array<{ operation: string; count: number }>;
    }>;
  };
}

export function AnalyticsTab() {
  const [data, setData] = useState<AnalyticsDashboardData | null>(null);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [selectedExtension, setSelectedExtension] = useState<string>('');
  const [timeRange, setTimeRange] = useState<'1h' | '6h' | '24h' | '7d'>('6h');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [liveUpdates, setLiveUpdates] = useState(true);

  const loadAnalytics = useCallback(async () => {
    try {
      const metricsResponse = await window.ghost.analyticsGetMetrics({ timeRange });
      const dashboardResponse = await window.ghost.analyticsGetDashboard({ timeRange });
      
      if (metricsResponse && dashboardResponse) {
        const combinedData: AnalyticsDashboardData = {
          timestamp: Date.now(),
          metrics: metricsResponse.metrics || {},
          behavior: dashboardResponse.behavior,
          cost: dashboardResponse.cost,
          performance: dashboardResponse.performance,
          tracing: dashboardResponse.tracing
        };
        
        setData(combinedData);
        
        if (!selectedExtension && Object.keys(combinedData.metrics || {}).length > 0) {
          setSelectedExtension(Object.keys(combinedData.metrics)[0]);
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

  const loadRecommendations = useCallback(async () => {
    try {
      const response = await window.ghost.analyticsGetRecommendations();
      if (response && response.recommendations) {
        setRecommendations(response.recommendations.slice(0, 10));
      }
    } catch (err) {
      console.error('Failed to load recommendations:', err);
    }
  }, []);

  useEffect(() => {
    loadAnalytics();
    loadRecommendations();
    
    const interval = setInterval(() => {
      if (liveUpdates) {
        loadAnalytics();
      }
    }, 5000);
    
    return () => clearInterval(interval);
  }, [loadAnalytics, loadRecommendations, liveUpdates]);

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
  const selectedCosts = data.cost?.extensions?.find((c: CostBreakdown) => c.extensionId === selectedExtension);
  const alerts = data.performance?.alerts || [];
  const criticalAlerts = alerts.filter((a: RegressionAlert) => a.severity === 'critical' || a.severity === 'high');
  
  const callGraph: CallGraph = {
    nodes: [],
    edges: []
  };

  if (data.tracing?.extensionInteractions) {
    const nodeMap = new Map<string, CallGraphNode>();
    
    data.tracing.extensionInteractions.forEach(interaction => {
      const fromKey = `${interaction.from}:primary`;
      const toKey = `${interaction.to}:primary`;
      
      if (!nodeMap.has(fromKey)) {
        nodeMap.set(fromKey, {
          extensionId: interaction.from,
          operation: 'primary',
          callCount: 0,
          totalDuration: interaction.avgDuration * interaction.callCount,
          avgDuration: interaction.avgDuration
        });
      }
      
      if (!nodeMap.has(toKey)) {
        nodeMap.set(toKey, {
          extensionId: interaction.to,
          operation: 'primary',
          callCount: 0,
          totalDuration: interaction.avgDuration * interaction.callCount,
          avgDuration: interaction.avgDuration
        });
      }
      
      const fromNode = nodeMap.get(fromKey)!;
      const toNode = nodeMap.get(toKey)!;
      
      fromNode.callCount += interaction.callCount;
      toNode.callCount += interaction.callCount;
      
      callGraph.edges.push({
        from: fromKey,
        to: toKey,
        callCount: interaction.callCount
      });
    });
    
    callGraph.nodes = Array.from(nodeMap.values());
  }

  return (
    <div className="space-y-4">
      <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <Activity className="w-5 h-5 text-cyan-400" />
            Analytics Dashboard
          </h3>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-gray-300">
              <input
                type="checkbox"
                checked={liveUpdates}
                onChange={(e) => setLiveUpdates(e.target.checked)}
                className="rounded"
              />
              Live Updates
            </label>
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

      {criticalAlerts.length > 0 && (
        <div className="bg-red-900/30 border border-red-600 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-5 h-5 text-red-400" />
            <h4 className="text-md font-semibold text-red-300">
              {criticalAlerts.length} Critical Performance Alert{criticalAlerts.length > 1 ? 's' : ''}
            </h4>
          </div>
          <div className="space-y-1">
            {criticalAlerts.slice(0, 3).map((alert, idx) => {
              const firstRegression = alert.regressions?.[0];
              const metric = firstRegression?.metric || alert.metric || 'performance';
              const percentChange = firstRegression?.exceeded || alert.percentChange || 0;
              const threshold = firstRegression?.threshold || alert.threshold || 0;
              
              return (
                <div key={alert.alertId || alert.id || idx} className="text-sm text-red-200">
                  <span className="font-mono">{alert.extensionId}</span>: {metric} increased by{' '}
                  {percentChange.toFixed(1)}% (threshold: {(threshold * 100).toFixed(0)}%)
                </div>
              );
            })}
          </div>
        </div>
      )}

      {selectedMetrics && (
        <>
          <div className="grid grid-cols-4 gap-4">
            <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
              <div className="flex items-center gap-2 mb-2">
                <Zap className="w-4 h-4 text-yellow-400" />
                <div className="text-xs text-gray-400">Total Invocations</div>
              </div>
              <div className="text-2xl font-bold text-white">{selectedMetrics.invocationCount}</div>
              <div className="text-xs text-gray-400 mt-1">
                Success Rate: {formatPercent(selectedMetrics.successRate / 100)}
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
                Max: {formatDuration(selectedMetrics.duration.max || 0)}
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
                {selectedCosts?.billingPeriod || data.cost?.period || 'This period'}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <PerformanceChart
              extensionId={selectedExtension}
              metrics={selectedMetrics}
              timeRange={timeRange}
            />
            
            {selectedCosts && (
              <CostAttributionChart
                costs={selectedCosts}
              />
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <RealTimeMetricsChart
              extensionId={selectedExtension}
              liveUpdates={liveUpdates}
            />

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
                    {formatPercent(selectedMetrics.successRate / 100)}
                  </div>
                  <div className="text-xs text-gray-400 mt-1">Success Rate</div>
                </div>
              </div>
            </div>
          </div>

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

      {alerts.length > 0 && (
        <RegressionAlerts alerts={alerts} />
      )}

      {callGraph && callGraph.nodes.length > 0 && (
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <h4 className="text-md font-semibold text-white mb-3 flex items-center gap-2">
            <GitBranch className="w-5 h-5 text-cyan-400" />
            Extension Call Graph
          </h4>
          <DistributedTracingGraph callGraph={callGraph} />
        </div>
      )}

      {data.behavior && (
        <BehaviorAnalyticsPanel behavior={data.behavior} />
      )}

      {recommendations.length > 0 && (
        <RecommendationEnginePanel recommendations={recommendations} />
      )}
    </div>
  );
}
