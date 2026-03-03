import { useState } from 'react';
import { AlertTriangle, TrendingUp, Info, Settings, Plus, X, Save } from 'lucide-react';

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

interface RegressionAlertsProps {
  alerts: RegressionAlert[];
}

interface AlertRule {
  id: string;
  enabled: boolean;
  metric: 'duration' | 'cpu' | 'memory' | 'errorRate';
  threshold: number;
  severity: 'critical' | 'high' | 'medium' | 'low';
  comparisonType: 'baseline' | 'anomaly';
  anomalyConfig?: {
    sensitivityFactor: number;
    minDataPoints: number;
  };
}

const DEFAULT_RULES: AlertRule[] = [
  {
    id: 'rule-p95-latency',
    enabled: true,
    metric: 'duration',
    threshold: 0.20,
    severity: 'high',
    comparisonType: 'baseline',
  },
  {
    id: 'rule-error-rate',
    enabled: true,
    metric: 'errorRate',
    threshold: 0.05,
    severity: 'critical',
    comparisonType: 'baseline',
  },
  {
    id: 'rule-cpu-usage',
    enabled: false,
    metric: 'cpu',
    threshold: 0.30,
    severity: 'medium',
    comparisonType: 'baseline',
  },
  {
    id: 'rule-memory-usage',
    enabled: false,
    metric: 'memory',
    threshold: 0.30,
    severity: 'medium',
    comparisonType: 'baseline',
  },
];

export function RegressionAlerts({ alerts }: RegressionAlertsProps) {
  const [showConfig, setShowConfig] = useState(false);
  const [rules, setRules] = useState<AlertRule[]>(DEFAULT_RULES);
  const [editingRule, setEditingRule] = useState<string | null>(null);

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical':
        return { bg: 'bg-red-900/30', border: 'border-red-600', text: 'text-red-400', icon: 'text-red-500' };
      case 'high':
        return { bg: 'bg-orange-900/30', border: 'border-orange-600', text: 'text-orange-400', icon: 'text-orange-500' };
      case 'medium':
        return { bg: 'bg-yellow-900/30', border: 'border-yellow-600', text: 'text-yellow-400', icon: 'text-yellow-500' };
      case 'low':
        return { bg: 'bg-blue-900/30', border: 'border-blue-600', text: 'text-blue-400', icon: 'text-blue-500' };
      default:
        return { bg: 'bg-gray-900/30', border: 'border-gray-600', text: 'text-gray-400', icon: 'text-gray-500' };
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'critical':
      case 'high':
        return AlertTriangle;
      case 'medium':
        return TrendingUp;
      case 'low':
        return Info;
      default:
        return Info;
    }
  };

  const formatMetricValue = (metric: string, value: number) => {
    if (metric.toLowerCase().includes('duration') || metric.toLowerCase().includes('time')) {
      if (value < 1) return `${(value * 1000).toFixed(0)}μs`;
      if (value < 1000) return `${value.toFixed(1)}ms`;
      return `${(value / 1000).toFixed(2)}s`;
    }
    if (metric.toLowerCase().includes('memory')) {
      return `${value.toFixed(2)} MB`;
    }
    if (metric.toLowerCase().includes('cpu')) {
      return `${value.toFixed(2)}%`;
    }
    if (metric.toLowerCase().includes('rate') || metric.toLowerCase().includes('error')) {
      return `${(value * 100).toFixed(2)}%`;
    }
    return value.toFixed(2);
  };

  const sortedAlerts = [...alerts].sort((a, b) => {
    const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    return severityOrder[a.severity] - severityOrder[b.severity];
  });

  const toggleRule = (ruleId: string) => {
    setRules(rules.map(rule => 
      rule.id === ruleId ? { ...rule, enabled: !rule.enabled } : rule
    ));
  };

  const updateRule = (ruleId: string, updates: Partial<AlertRule>) => {
    setRules(rules.map(rule => 
      rule.id === ruleId ? { ...rule, ...updates } : rule
    ));
    setEditingRule(null);
  };

  const addCustomRule = () => {
    const newRule: AlertRule = {
      id: `rule-custom-${Date.now()}`,
      enabled: true,
      metric: 'duration',
      threshold: 0.20,
      severity: 'medium',
      comparisonType: 'baseline',
    };
    setRules([...rules, newRule]);
    setEditingRule(newRule.id);
  };

  const deleteRule = (ruleId: string) => {
    setRules(rules.filter(rule => rule.id !== ruleId));
  };

  const getMetricLabel = (metric: string) => {
    switch (metric) {
      case 'duration':
        return 'P95 Latency';
      case 'cpu':
        return 'CPU Usage';
      case 'memory':
        return 'Memory Usage';
      case 'errorRate':
        return 'Error Rate';
      default:
        return metric;
    }
  };

  return (
    <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-md font-semibold text-white flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-yellow-400" />
          Performance Regression Alerts ({alerts.length})
        </h4>
        <button
          onClick={() => setShowConfig(!showConfig)}
          className={`flex items-center gap-2 px-3 py-1 rounded text-sm transition-colors ${
            showConfig
              ? 'bg-cyan-600 hover:bg-cyan-700 text-white'
              : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
          }`}
        >
          <Settings className="w-4 h-4" />
          {showConfig ? 'Hide Config' : 'Configure Rules'}
        </button>
      </div>

      {/* Alert Rules Configuration */}
      {showConfig && (
        <div className="mb-4 p-4 bg-gray-900 rounded-lg border border-gray-700">
          <div className="flex items-center justify-between mb-3">
            <h5 className="text-sm font-semibold text-white">Alert Rules Configuration</h5>
            <button
              onClick={addCustomRule}
              className="flex items-center gap-1 px-2 py-1 bg-cyan-600 hover:bg-cyan-700 text-white text-xs rounded transition-colors"
            >
              <Plus className="w-3 h-3" />
              Add Rule
            </button>
          </div>

          <div className="space-y-2">
            {rules.map(rule => (
              <div
                key={rule.id}
                className={`p-3 rounded border ${
                  rule.enabled 
                    ? 'bg-gray-800 border-gray-600' 
                    : 'bg-gray-900/50 border-gray-700 opacity-60'
                }`}
              >
                {editingRule === rule.id ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-gray-400 block mb-1">Metric</label>
                        <select
                          value={rule.metric}
                          onChange={(e) => updateRule(rule.id, { metric: e.target.value as 'duration' | 'cpu' | 'memory' | 'errorRate' })}
                          className="w-full px-2 py-1 text-sm bg-gray-700 border border-gray-600 text-white rounded"
                        >
                          <option value="duration">P95 Latency</option>
                          <option value="cpu">CPU Usage</option>
                          <option value="memory">Memory Usage</option>
                          <option value="errorRate">Error Rate</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-xs text-gray-400 block mb-1">Threshold (%)</label>
                        <input
                          type="number"
                          value={rule.threshold * 100}
                          onChange={(e) => updateRule(rule.id, { threshold: parseFloat(e.target.value) / 100 })}
                          className="w-full px-2 py-1 text-sm bg-gray-700 border border-gray-600 text-white rounded"
                          min="1"
                          max="100"
                          step="1"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-gray-400 block mb-1">Severity</label>
                        <select
                          value={rule.severity}
                          onChange={(e) => updateRule(rule.id, { severity: e.target.value as 'critical' | 'high' | 'medium' | 'low' })}
                          className="w-full px-2 py-1 text-sm bg-gray-700 border border-gray-600 text-white rounded"
                        >
                          <option value="critical">Critical</option>
                          <option value="high">High</option>
                          <option value="medium">Medium</option>
                          <option value="low">Low</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-xs text-gray-400 block mb-1">Detection Type</label>
                        <select
                          value={rule.comparisonType}
                          onChange={(e) => updateRule(rule.id, { comparisonType: e.target.value as 'baseline' | 'anomaly' })}
                          className="w-full px-2 py-1 text-sm bg-gray-700 border border-gray-600 text-white rounded"
                        >
                          <option value="baseline">Baseline Comparison</option>
                          <option value="anomaly">Anomaly Detection</option>
                        </select>
                      </div>
                    </div>
                    {rule.comparisonType === 'anomaly' && (
                      <div className="p-2 bg-gray-700 rounded">
                        <div className="text-xs text-gray-400 mb-2">Anomaly Detection Settings</div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-xs text-gray-500 block mb-1">Sensitivity Factor</label>
                            <input
                              type="number"
                              value={rule.anomalyConfig?.sensitivityFactor || 2.0}
                              onChange={(e) => updateRule(rule.id, {
                                anomalyConfig: {
                                  ...rule.anomalyConfig,
                                  sensitivityFactor: parseFloat(e.target.value),
                                  minDataPoints: rule.anomalyConfig?.minDataPoints || 20,
                                }
                              })}
                              className="w-full px-2 py-1 text-xs bg-gray-600 border border-gray-500 text-white rounded"
                              min="1"
                              max="5"
                              step="0.1"
                            />
                          </div>
                          <div>
                            <label className="text-xs text-gray-500 block mb-1">Min Data Points</label>
                            <input
                              type="number"
                              value={rule.anomalyConfig?.minDataPoints || 20}
                              onChange={(e) => updateRule(rule.id, {
                                anomalyConfig: {
                                  ...rule.anomalyConfig,
                                  sensitivityFactor: rule.anomalyConfig?.sensitivityFactor || 2.0,
                                  minDataPoints: parseInt(e.target.value),
                                }
                              })}
                              className="w-full px-2 py-1 text-xs bg-gray-600 border border-gray-500 text-white rounded"
                              min="5"
                              max="100"
                            />
                          </div>
                        </div>
                      </div>
                    )}
                    <div className="flex gap-2">
                      <button
                        onClick={() => setEditingRule(null)}
                        className="flex-1 flex items-center justify-center gap-1 px-2 py-1 bg-cyan-600 hover:bg-cyan-700 text-white text-xs rounded transition-colors"
                      >
                        <Save className="w-3 h-3" />
                        Save
                      </button>
                      <button
                        onClick={() => deleteRule(rule.id)}
                        className="px-2 py-1 bg-red-600 hover:bg-red-700 text-white text-xs rounded transition-colors"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={rule.enabled}
                        onChange={() => toggleRule(rule.id)}
                        className="w-4 h-4 rounded"
                      />
                      <div>
                        <div className="text-sm text-white font-medium">
                          {getMetricLabel(rule.metric)} &gt; {(rule.threshold * 100).toFixed(0)}%
                        </div>
                        <div className="text-xs text-gray-400 mt-0.5">
                          {rule.comparisonType === 'baseline' ? 'Baseline Comparison' : 'Anomaly Detection'}
                          {' • '}
                          <span className={getSeverityColor(rule.severity).text}>
                            {rule.severity}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {rule.comparisonType === 'anomaly' && (
                        <span className="text-xs px-2 py-0.5 bg-purple-900/30 text-purple-400 rounded">
                          σ×{rule.anomalyConfig?.sensitivityFactor || 2.0}
                        </span>
                      )}
                      <button
                        onClick={() => setEditingRule(rule.id)}
                        className="p-1 hover:bg-gray-700 rounded transition-colors"
                      >
                        <Settings className="w-4 h-4 text-gray-400" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="mt-3 p-2 bg-gray-800 rounded text-xs text-gray-400">
            <p className="mb-1"><strong>Baseline Comparison:</strong> Compares current metrics against a stored baseline version</p>
            <p><strong>Anomaly Detection:</strong> Uses statistical analysis (mean ± σ×factor) to detect unusual patterns</p>
          </div>
        </div>
      )}

      {/* Active Alerts */}
      <div className="space-y-2 max-h-96 overflow-y-auto">
        {sortedAlerts.map((alert, idx) => {
          const colors = getSeverityColor(alert.severity);
          const Icon = getSeverityIcon(alert.severity);
          const alertId = alert.alertId || alert.id || `alert-${idx}`;
          
          const firstRegression = alert.regressions?.[0];
          const metric = firstRegression?.metric || alert.metric || 'performance';
          const baselineValue = firstRegression?.baseline || alert.baselineValue || 0;
          const currentValue = firstRegression?.current || alert.currentValue || 0;
          const threshold = firstRegression?.threshold || alert.threshold || 0;
          const percentChange = firstRegression?.exceeded || alert.percentChange || 0;
          
          return (
            <div
              key={alertId}
              className={`${colors.bg} ${colors.border} border rounded-lg p-3`}
            >
              <div className="flex items-start gap-3">
                <Icon className={`w-5 h-5 ${colors.icon} flex-shrink-0 mt-0.5`} />
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm text-white">{alert.extensionId}</span>
                      <span className="text-xs text-gray-400">v{alert.version}</span>
                      <span className={`px-2 py-0.5 rounded text-xs font-semibold uppercase ${colors.bg} ${colors.text}`}>
                        {alert.severity}
                      </span>
                    </div>
                    <span className="text-xs text-gray-400">
                      {new Date(alert.timestamp).toLocaleTimeString()}
                    </span>
                  </div>

                  <div className="text-sm text-gray-300 mb-2">
                    <span className="font-semibold">{metric}</span> regression detected
                    {alert.baselineVersion && (
                      <span className="text-xs text-gray-500 ml-2">
                        (baseline: v{alert.baselineVersion})
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-3 text-xs">
                    <div>
                      <div className="text-gray-500">Baseline</div>
                      <div className="text-white font-mono mt-1">
                        {formatMetricValue(metric, baselineValue)}
                      </div>
                    </div>
                    <div>
                      <div className="text-gray-500">Current</div>
                      <div className={`font-mono mt-1 ${colors.text}`}>
                        {formatMetricValue(metric, currentValue)}
                      </div>
                    </div>
                    <div>
                      <div className="text-gray-500">Change</div>
                      <div className={`font-mono mt-1 font-bold ${colors.text}`}>
                        +{percentChange.toFixed(1)}%
                      </div>
                    </div>
                  </div>

                  {alert.regressions && alert.regressions.length > 1 && (
                    <div className="mt-2 pt-2 border-t border-gray-700/50">
                      <div className="text-xs text-gray-400 mb-1">Additional regressions:</div>
                      <div className="flex flex-wrap gap-2">
                        {alert.regressions.slice(1).map((reg, regIdx) => (
                          <span key={regIdx} className="px-2 py-1 bg-gray-800 border border-gray-600 text-gray-300 rounded text-xs">
                            {reg.metric}: +{reg.exceeded.toFixed(1)}%
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="mt-2 pt-2 border-t border-gray-700/50">
                    <div className="text-xs text-gray-400">
                      Threshold: {(threshold * 100).toFixed(0)}% • 
                      Exceeded by: {((percentChange / 100 / (threshold || 1)) * 100).toFixed(1)}%
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {sortedAlerts.length === 0 && (
        <div className="text-center py-8 text-gray-400">
          <Info className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No performance regressions detected</p>
          <p className="text-xs text-gray-500 mt-1">
            {rules.filter(r => r.enabled).length} rule{rules.filter(r => r.enabled).length !== 1 ? 's' : ''} active
          </p>
        </div>
      )}
    </div>
  );
}
