import React, { useState, useEffect } from 'react';

interface ExtensionMetrics {
  avgRequestRate: number;
  avgAllowRate: number;
  avgDenyRate: number;
  avgTokensPerRequest: number;
  totalRequests: number;
  totalAllowed: number;
  totalDenied: number;
  totalTokensConsumed: number;
}

interface ConsumptionPattern {
  extensionId: string;
  period: string;
  hourlyDistribution: Array<{
    requests: number;
    allowed: number;
    denied: number;
    tokens: number;
  }>;
  peakHour: number;
  peakRequests: number;
  quietHour: number;
  quietRequests: number;
  totalRequests: number;
  avgRequestsPerHour: number;
}

interface QuotaPrediction {
  prediction: number | null;
  timeToExhaustion: number;
  exhaustionTimeFormatted: string;
  confidence: number;
  avgConsumptionRate: number;
  remaining: number;
  currentUsage: number;
  currentQuota: number;
}

interface Anomaly {
  timestamp: number;
  type: string;
  requestRate: number;
  expectedRate: number;
  deviation: number;
  requests: number;
  allowed: number;
  denied: number;
}

interface ExtensionAnalytics {
  metrics: ExtensionMetrics | null;
  pattern: ConsumptionPattern | null;
  anomalies: Anomaly[];
  prediction?: QuotaPrediction;
}

interface ExtensionState {
  extensionId: string;
  limiter: any;
  circuitBreaker: any;
  queue?: any;
  global?: any;
  analytics?: ExtensionAnalytics;
}

interface DashboardData {
  overview: any;
  extensions: { [key: string]: ExtensionState };
  timestamp: number;
}

const RateLimitDashboard: React.FC = () => {
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [selectedExtension, setSelectedExtension] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);

  useEffect(() => {
    fetchDashboard();
    
    if (autoRefresh) {
      const interval = setInterval(fetchDashboard, 5000);
      return () => clearInterval(interval);
    }
  }, [autoRefresh]);

  const fetchDashboard = async () => {
    try {
      const response = await fetch('http://localhost:9876/rate-limiting/dashboard');
      const data = await response.json();
      setDashboardData(data);
      setLoading(false);
    } catch (error) {
      console.error('Failed to fetch dashboard:', error);
      setLoading(false);
    }
  };

  const formatTime = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  };

  const formatRate = (rate: number) => {
    return rate.toFixed(2);
  };

  const getColorForRate = (rate: number) => {
    if (rate >= 0.9) return 'text-green-600';
    if (rate >= 0.7) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getColorForLoad = (load: number) => {
    if (load <= 0.7) return 'text-green-600';
    if (load <= 0.85) return 'text-yellow-600';
    return 'text-red-600';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg">Loading dashboard...</div>
      </div>
    );
  }

  if (!dashboardData) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg text-red-600">Failed to load dashboard</div>
      </div>
    );
  }

  const selectedExtState = selectedExtension ? dashboardData.extensions[selectedExtension] : null;

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="mb-6 flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900">Rate Limit Analytics Dashboard</h1>
        <div className="flex items-center space-x-4">
          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded"
            />
            <span className="text-sm">Auto-refresh</span>
          </label>
          <button
            onClick={fetchDashboard}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Global Overview */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Global Overview</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <div className="text-sm text-gray-600">Extensions</div>
            <div className="text-2xl font-bold">{dashboardData.overview.extensionCount || 0}</div>
          </div>
          {dashboardData.overview.global && (
            <>
              <div>
                <div className="text-sm text-gray-600">Global Allow Rate</div>
                <div className={`text-2xl font-bold ${getColorForRate(dashboardData.overview.global.stats.allowRate)}`}>
                  {(dashboardData.overview.global.stats.allowRate * 100).toFixed(1)}%
                </div>
              </div>
              <div>
                <div className="text-sm text-gray-600">Total Requests</div>
                <div className="text-2xl font-bold">{dashboardData.overview.global.stats.totalRequests}</div>
              </div>
              <div>
                <div className="text-sm text-gray-600">Quota Transfers</div>
                <div className="text-2xl font-bold">{dashboardData.overview.global.stats.quotaTransfers}</div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Extensions List */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Extensions</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Object.entries(dashboardData.extensions).map(([extId, extState]) => (
            <div
              key={extId}
              onClick={() => setSelectedExtension(extId)}
              className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                selectedExtension === extId ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'
              }`}
            >
              <div className="font-semibold mb-2">{extId}</div>
              
              {extState.analytics?.metrics && (
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Allow Rate:</span>
                    <span className={getColorForRate(extState.analytics.metrics.avgAllowRate)}>
                      {(extState.analytics.metrics.avgAllowRate * 100).toFixed(1)}%
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Requests:</span>
                    <span>{extState.analytics.metrics.totalRequests}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Request Rate:</span>
                    <span>{formatRate(extState.analytics.metrics.avgRequestRate)}/s</span>
                  </div>
                </div>
              )}

              {extState.limiter && (
                <div className="mt-2 space-y-1 text-sm">
                  {extState.limiter.currentCIR && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Current CIR:</span>
                      <span>{extState.limiter.currentCIR}/min</span>
                    </div>
                  )}
                  {extState.limiter.isWarming !== undefined && extState.limiter.isWarming && (
                    <div className="flex items-center space-x-2">
                      <span className="text-orange-600 text-xs">⚡ Warming up</span>
                      <span className="text-xs">{(extState.limiter.warmupProgress * 100).toFixed(0)}%</span>
                    </div>
                  )}
                </div>
              )}

              {extState.circuitBreaker && extState.circuitBreaker.state !== 'CLOSED' && (
                <div className="mt-2">
                  <span className={`text-xs px-2 py-1 rounded ${
                    extState.circuitBreaker.state === 'OPEN' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'
                  }`}>
                    {extState.circuitBreaker.state}
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Selected Extension Details */}
      {selectedExtState && (
        <div className="space-y-6">
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4">{selectedExtension} - Details</h2>
            
            {/* Limiter State */}
            {selectedExtState.limiter && (
              <div className="mb-6">
                <h3 className="text-lg font-semibold mb-3">Rate Limiter</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {selectedExtState.limiter.currentCIR && (
                    <>
                      <div>
                        <div className="text-sm text-gray-600">Current CIR</div>
                        <div className="text-xl font-bold">{selectedExtState.limiter.currentCIR}/min</div>
                      </div>
                      <div>
                        <div className="text-sm text-gray-600">Base CIR</div>
                        <div className="text-xl font-bold">{selectedExtState.limiter.baseCIR}/min</div>
                      </div>
                      <div>
                        <div className="text-sm text-gray-600">Adjustment</div>
                        <div className="text-xl font-bold">{selectedExtState.limiter.adjustment?.toFixed(2)}x</div>
                      </div>
                    </>
                  )}
                  {selectedExtState.limiter.committedTokens !== undefined && (
                    <div>
                      <div className="text-sm text-gray-600">Tokens Available</div>
                      <div className="text-xl font-bold">
                        {Math.floor(selectedExtState.limiter.committedTokens)}/{selectedExtState.limiter.committedCapacity}
                      </div>
                    </div>
                  )}
                  {selectedExtState.limiter.systemLoad !== undefined && (
                    <div>
                      <div className="text-sm text-gray-600">System Load</div>
                      <div className={`text-xl font-bold ${getColorForLoad(selectedExtState.limiter.systemLoad)}`}>
                        {(selectedExtState.limiter.systemLoad * 100).toFixed(1)}%
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Circuit Breaker */}
            {selectedExtState.circuitBreaker && (
              <div className="mb-6">
                <h3 className="text-lg font-semibold mb-3">Circuit Breaker</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <div className="text-sm text-gray-600">State</div>
                    <div className={`text-xl font-bold ${
                      selectedExtState.circuitBreaker.state === 'CLOSED' ? 'text-green-600' :
                      selectedExtState.circuitBreaker.state === 'HALF_OPEN' ? 'text-yellow-600' : 'text-red-600'
                    }`}>
                      {selectedExtState.circuitBreaker.state}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-600">Failures</div>
                    <div className="text-xl font-bold">{selectedExtState.circuitBreaker.failures}</div>
                  </div>
                  {selectedExtState.circuitBreaker.stats && (
                    <>
                      <div>
                        <div className="text-sm text-gray-600">Total Requests</div>
                        <div className="text-xl font-bold">{selectedExtState.circuitBreaker.stats.totalRequests}</div>
                      </div>
                      <div>
                        <div className="text-sm text-gray-600">Success Rate</div>
                        <div className="text-xl font-bold">
                          {selectedExtState.circuitBreaker.stats.totalRequests > 0 ?
                            ((selectedExtState.circuitBreaker.stats.totalSuccesses / selectedExtState.circuitBreaker.stats.totalRequests) * 100).toFixed(1) : 0}%
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Global Quota */}
            {selectedExtState.global && (
              <div className="mb-6">
                <h3 className="text-lg font-semibold mb-3">Global Quota</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <div className="text-sm text-gray-600">Quota</div>
                    <div className="text-xl font-bold">{selectedExtState.global.quota}</div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-600">Used</div>
                    <div className="text-xl font-bold">{selectedExtState.global.used}</div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-600">Borrowed</div>
                    <div className="text-xl font-bold text-orange-600">{selectedExtState.global.borrowed}</div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-600">Lent</div>
                    <div className="text-xl font-bold text-blue-600">{selectedExtState.global.lent}</div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Analytics */}
          {selectedExtState.analytics && (
            <>
              {/* Quota Exhaustion Prediction */}
              {selectedExtState.analytics.prediction && selectedExtState.analytics.prediction.prediction && (
                <div className="bg-white rounded-lg shadow p-6">
                  <h3 className="text-lg font-semibold mb-3">Quota Exhaustion Prediction</h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <div>
                      <div className="text-sm text-gray-600">Time to Exhaustion</div>
                      <div className="text-xl font-bold text-red-600">
                        {formatTime(selectedExtState.analytics.prediction.timeToExhaustion)}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm text-gray-600">Confidence</div>
                      <div className="text-xl font-bold">
                        {(selectedExtState.analytics.prediction.confidence * 100).toFixed(1)}%
                      </div>
                    </div>
                    <div>
                      <div className="text-sm text-gray-600">Consumption Rate</div>
                      <div className="text-xl font-bold">
                        {selectedExtState.analytics.prediction.avgConsumptionRate.toFixed(2)}/s
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Consumption Pattern */}
              {selectedExtState.analytics.pattern && (
                <div className="bg-white rounded-lg shadow p-6">
                  <h3 className="text-lg font-semibold mb-3">24-Hour Consumption Pattern</h3>
                  <div className="mb-4">
                    <div className="flex justify-between text-sm mb-2">
                      <span>Peak: Hour {selectedExtState.analytics.pattern.peakHour} ({selectedExtState.analytics.pattern.peakRequests} req)</span>
                      <span>Quiet: Hour {selectedExtState.analytics.pattern.quietHour} ({selectedExtState.analytics.pattern.quietRequests} req)</span>
                    </div>
                  </div>
                  <div className="flex items-end space-x-1 h-32">
                    {selectedExtState.analytics.pattern.hourlyDistribution.map((hour, idx) => {
                      const maxRequests = Math.max(...selectedExtState.analytics.pattern!.hourlyDistribution.map(h => h.requests));
                      const height = maxRequests > 0 ? (hour.requests / maxRequests) * 100 : 0;
                      const allowRate = hour.requests > 0 ? (hour.allowed / hour.requests) : 1;
                      
                      return (
                        <div
                          key={idx}
                          className="flex-1 relative group"
                          title={`Hour ${idx}: ${hour.requests} requests (${(allowRate * 100).toFixed(1)}% allowed)`}
                        >
                          <div
                            className={`w-full rounded-t ${
                              allowRate >= 0.9 ? 'bg-green-500' :
                              allowRate >= 0.7 ? 'bg-yellow-500' : 'bg-red-500'
                            } hover:opacity-75 transition-opacity`}
                            style={{ height: `${height}%` }}
                          ></div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex justify-between text-xs text-gray-500 mt-2">
                    <span>0h</span>
                    <span>6h</span>
                    <span>12h</span>
                    <span>18h</span>
                    <span>24h</span>
                  </div>
                </div>
              )}

              {/* Anomalies */}
              {selectedExtState.analytics.anomalies && selectedExtState.analytics.anomalies.length > 0 && (
                <div className="bg-white rounded-lg shadow p-6">
                  <h3 className="text-lg font-semibold mb-3">Anomalies Detected</h3>
                  <div className="space-y-2">
                    {selectedExtState.analytics.anomalies.slice(0, 5).map((anomaly, idx) => (
                      <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 rounded">
                        <div>
                          <div className="flex items-center space-x-2">
                            <span className={`px-2 py-1 rounded text-xs font-semibold ${
                              anomaly.type === 'spike' ? 'bg-red-100 text-red-800' : 'bg-blue-100 text-blue-800'
                            }`}>
                              {anomaly.type.toUpperCase()}
                            </span>
                            <span className="text-sm">{new Date(anomaly.timestamp).toLocaleString()}</span>
                          </div>
                          <div className="text-sm text-gray-600 mt-1">
                            Rate: {anomaly.requestRate.toFixed(2)}/s (expected: {anomaly.expectedRate.toFixed(2)}/s)
                            - Deviation: {anomaly.deviation.toFixed(2)}σ
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-semibold">{anomaly.requests} req</div>
                          <div className="text-xs text-gray-600">{anomaly.denied} denied</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default RateLimitDashboard;
