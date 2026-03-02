import { DollarSign } from 'lucide-react';

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

interface CostAttributionChartProps {
  costs: CostBreakdown;
}

export function CostAttributionChart({ costs }: CostAttributionChartProps) {
  const totalCost = costs.totalCost;
  
  const costItems = [
    { label: 'CPU', value: costs.resources.cpu, color: '#06b6d4' },
    { label: 'Memory', value: costs.resources.memory, color: '#a855f7' },
    { label: 'I/O', value: costs.resources.io, color: '#22c55e' },
    { label: 'Network', value: costs.resources.network, color: '#eab308' },
    { label: 'Storage', value: costs.resources.storage, color: '#f97316' },
  ].sort((a, b) => b.value - a.value);

  const formatCost = (cost: number) => {
    return `$${cost.toFixed(4)}`;
  };

  const getPercentage = (value: number) => {
    return totalCost > 0 ? (value / totalCost) * 100 : 0;
  };

  return (
    <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
      <h4 className="text-md font-semibold text-white mb-3 flex items-center gap-2">
        <DollarSign className="w-5 h-5 text-green-400" />
        Cost Attribution
      </h4>

      <div className="space-y-3">
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
                <div className="text-white font-mono">
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

      <div className="mt-4 pt-4 border-t border-gray-700">
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-400">Total Cost</span>
          <span className="text-lg font-bold text-green-400">{formatCost(totalCost)}</span>
        </div>
        <div className="text-xs text-gray-500 mt-1 text-right">
          {costs.billingPeriod}
        </div>
      </div>

      <div className="mt-4 bg-gray-900 rounded p-3">
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div>
            <div className="text-gray-400">Highest Cost</div>
            <div className="text-white font-semibold mt-1">
              {costItems[0].label}: {formatCost(costItems[0].value)}
            </div>
          </div>
          <div>
            <div className="text-gray-400">% of Total</div>
            <div className="text-white font-semibold mt-1">
              {getPercentage(costItems[0].value).toFixed(1)}%
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
