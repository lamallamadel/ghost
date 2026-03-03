import { AlertTriangle, TrendingUp, Info } from 'lucide-react';

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

export function RegressionAlerts({ alerts }: RegressionAlertsProps) {
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

  return (
    <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
      <h4 className="text-md font-semibold text-white mb-3 flex items-center gap-2">
        <AlertTriangle className="w-5 h-5 text-yellow-400" />
        Performance Regression Alerts ({alerts.length})
      </h4>

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
        </div>
      )}
    </div>
  );
}
