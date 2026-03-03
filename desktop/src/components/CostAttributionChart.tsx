import { DollarSign, TrendingUp, Calendar, AlertCircle } from 'lucide-react';
import { useState, useEffect } from 'react';

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

interface CostAttributionChartProps {
  costs: CostBreakdown;
}

interface CostProjection {
  daily: number;
  weekly: number;
  monthly: number;
  daysInPeriod: number;
  confidence: 'high' | 'medium' | 'low';
}

function calculateProjection(costs: CostBreakdown): CostProjection {
  const now = new Date();
  const currentDay = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  
  const dailyAvgCost = currentDay > 0 ? costs.totalCost / currentDay : costs.totalCost;
  const weeklyProjection = dailyAvgCost * 7;
  const monthlyProjection = dailyAvgCost * daysInMonth;
  
  let confidence: 'high' | 'medium' | 'low' = 'low';
  if (currentDay >= 15) {
    confidence = 'high';
  } else if (currentDay >= 7) {
    confidence = 'medium';
  }
  
  return {
    daily: dailyAvgCost,
    weekly: weeklyProjection,
    monthly: monthlyProjection,
    daysInPeriod: currentDay,
    confidence,
  };
}

export function CostAttributionChart({ costs }: CostAttributionChartProps) {
  const [projection, setProjection] = useState<CostProjection | null>(null);
  const [showProjection, setShowProjection] = useState(true);

  useEffect(() => {
    const proj = calculateProjection(costs);
    setProjection(proj);
  }, [costs]);

  const totalCost = costs.totalCost;
  
  const costItems = [
    { label: 'CPU', value: costs.resources.cpu, color: '#06b6d4', icon: '🔵' },
    { label: 'Memory', value: costs.resources.memory, color: '#a855f7', icon: '🟣' },
    { label: 'I/O', value: costs.resources.io, color: '#22c55e', icon: '🟢' },
    { label: 'Network', value: costs.resources.network, color: '#eab308', icon: '🟡' },
    { label: 'Storage', value: costs.resources.storage, color: '#f97316', icon: '🟠' },
  ].sort((a, b) => b.value - a.value);

  const formatCost = (cost: number) => {
    if (cost >= 1) return `$${cost.toFixed(2)}`;
    if (cost >= 0.01) return `$${cost.toFixed(4)}`;
    return `$${cost.toFixed(6)}`;
  };

  const getPercentage = (value: number) => {
    return totalCost > 0 ? (value / totalCost) * 100 : 0;
  };

  const getConfidenceColor = (confidence: string) => {
    switch (confidence) {
      case 'high':
        return 'text-green-400';
      case 'medium':
        return 'text-yellow-400';
      case 'low':
        return 'text-red-400';
      default:
        return 'text-gray-400';
    }
  };

  const getConfidenceBackground = (confidence: string) => {
    switch (confidence) {
      case 'high':
        return 'bg-green-900/30 border-green-600';
      case 'medium':
        return 'bg-yellow-900/30 border-yellow-600';
      case 'low':
        return 'bg-red-900/30 border-red-600';
      default:
        return 'bg-gray-900/30 border-gray-600';
    }
  };

  return (
    <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-md font-semibold text-white flex items-center gap-2">
          <DollarSign className="w-5 h-5 text-green-400" />
          Cost Attribution & Projection
        </h4>
        <button
          onClick={() => setShowProjection(!showProjection)}
          className="text-xs px-2 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition-colors"
        >
          {showProjection ? 'Hide' : 'Show'} Projection
        </button>
      </div>

      {/* Current Cost Breakdown */}
      <div className="space-y-3 mb-4">
        {costItems.map((item) => {
          const percentage = getPercentage(item.value);
          return (
            <div key={item.label}>
              <div className="flex items-center justify-between mb-1 text-sm">
                <div className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: item.color }}
                  ></div>
                  <span className="text-gray-300">{item.label}</span>
                </div>
                <div className="text-white font-mono text-xs">
                  {formatCost(item.value)} ({percentage.toFixed(1)}%)
                </div>
              </div>
              <div className="w-full bg-gray-900 rounded-full h-2 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${percentage}%`,
                    backgroundColor: item.color,
                  }}
                ></div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Current Period Summary */}
      <div className="mb-4 p-3 bg-gray-900 rounded border border-gray-700">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-gray-400">Current Period Cost</span>
          <span className="text-xl font-bold text-green-400">{formatCost(totalCost)}</span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-500">{costs.billingPeriod}</span>
          {costs.invocations !== undefined && (
            <span className="text-gray-500">
              {costs.invocations.toLocaleString()} invocations
            </span>
          )}
        </div>
        {costs.invocations !== undefined && costs.invocations > 0 && (
          <div className="mt-2 pt-2 border-t border-gray-800">
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-400">Cost per Invocation</span>
              <span className="text-cyan-400 font-mono">
                {formatCost(totalCost / costs.invocations)}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Cost Projection */}
      {showProjection && projection && (
        <div className={`border rounded-lg p-3 ${getConfidenceBackground(projection.confidence)}`}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <TrendingUp className={`w-4 h-4 ${getConfidenceColor(projection.confidence)}`} />
              <span className="text-sm font-semibold text-white">Projected Monthly Spend</span>
            </div>
            <div className={`text-xs px-2 py-0.5 rounded ${getConfidenceColor(projection.confidence)} bg-gray-900/50`}>
              {projection.confidence} confidence
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between p-2 bg-gray-900/50 rounded">
              <div className="flex items-center gap-2">
                <Calendar className="w-3 h-3 text-cyan-400" />
                <span className="text-xs text-gray-300">Daily Avg</span>
              </div>
              <span className="text-sm font-bold text-cyan-400">
                {formatCost(projection.daily)}
              </span>
            </div>

            <div className="flex items-center justify-between p-2 bg-gray-900/50 rounded">
              <div className="flex items-center gap-2">
                <Calendar className="w-3 h-3 text-purple-400" />
                <span className="text-xs text-gray-300">Weekly Est</span>
              </div>
              <span className="text-sm font-bold text-purple-400">
                {formatCost(projection.weekly)}
              </span>
            </div>

            <div className="flex items-center justify-between p-2 bg-gradient-to-r from-green-900/30 to-emerald-900/30 rounded border border-green-700/50">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-green-400" />
                <span className="text-sm font-semibold text-gray-200">Monthly Projection</span>
              </div>
              <span className="text-lg font-bold text-green-400">
                {formatCost(projection.monthly)}
              </span>
            </div>
          </div>

          <div className="mt-3 flex items-start gap-2 p-2 bg-gray-900/50 rounded">
            <AlertCircle className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
            <div className="text-xs text-gray-400">
              <p className="mb-1">
                Based on {projection.daysInPeriod} day{projection.daysInPeriod !== 1 ? 's' : ''} of data.
              </p>
              {projection.confidence === 'low' && (
                <p className="text-yellow-400">
                  ⚠️ Limited data - projection accuracy may be low
                </p>
              )}
              {projection.confidence === 'medium' && (
                <p className="text-blue-400">
                  📊 Moderate data - projection is reasonably accurate
                </p>
              )}
              {projection.confidence === 'high' && (
                <p className="text-green-400">
                  ✓ Sufficient data - projection is highly reliable
                </p>
              )}
            </div>
          </div>

          {projection.monthly > totalCost * 1.5 && (
            <div className="mt-2 p-2 bg-yellow-900/20 border border-yellow-700/50 rounded">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-yellow-400" />
                <span className="text-xs text-yellow-300">
                  Projected spend is {((projection.monthly / totalCost) * 100).toFixed(0)}% higher than current
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Cost Insights */}
      <div className="mt-4 bg-gray-900 rounded p-3">
        <div className="text-xs text-gray-400 mb-2">Cost Insights</div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-xs text-gray-500">Highest Cost</div>
            <div className="text-sm text-white font-semibold mt-1">
              {costItems[0].label}
            </div>
            <div className="text-xs text-gray-400 mt-0.5">
              {formatCost(costItems[0].value)} ({getPercentage(costItems[0].value).toFixed(1)}%)
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-500">Optimization Target</div>
            <div className="text-sm text-yellow-400 font-semibold mt-1">
              {costItems[0].label}
            </div>
            <div className="text-xs text-gray-400 mt-0.5">
              Potential {(getPercentage(costItems[0].value) * 0.3).toFixed(1)}% savings
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
