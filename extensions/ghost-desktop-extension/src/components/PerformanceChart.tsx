import { useState, useEffect } from 'react';
import { TrendingUp } from 'lucide-react';

interface DurationDataPoint {
  timestamp: number;
  p50: number;
  p95: number;
  p99: number;
}

interface ExtensionMetrics {
  duration: {
    p50: number;
    p95: number;
    p99: number;
  };
}

interface PerformanceChartProps {
  extensionId: string;
  metrics: ExtensionMetrics;
  timeRange: string;
}

export function PerformanceChart({ extensionId, metrics, timeRange }: PerformanceChartProps) {
  const [history, setHistory] = useState<DurationDataPoint[]>([]);

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const response = await fetch(
          `http://localhost:9876/api/analytics/performance/${extensionId}?timeRange=${timeRange}`
        );
        if (response.ok) {
          const data = await response.json();
          setHistory(data.history || []);
        }
      } catch (error) {
        console.error('Failed to fetch performance history:', error);
      }
    };

    fetchHistory();
    const interval = setInterval(fetchHistory, 10000);
    return () => clearInterval(interval);
  }, [extensionId, timeRange]);

  if (history.length === 0) {
    return (
      <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
        <h4 className="text-md font-semibold text-white mb-3 flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-blue-400" />
          Performance Timeline (P50/P95/P99)
        </h4>
        <div className="text-sm text-gray-400 text-center py-8">
          No historical data available
        </div>
      </div>
    );
  }

  const maxValue = Math.max(
    ...history.flatMap(d => [d.p50, d.p95, d.p99])
  );
  const minValue = Math.min(
    ...history.flatMap(d => [d.p50, d.p95, d.p99])
  );
  const range = maxValue - minValue || 1;

  const createPath = (dataPoints: number[]) => {
    return dataPoints.map((value, idx) => {
      const x = (idx / (dataPoints.length - 1 || 1)) * 100;
      const normalizedValue = (value - minValue) / range;
      const y = 100 - (normalizedValue * 80 + 10);
      return `${idx === 0 ? 'M' : 'L'} ${x} ${y}`;
    }).join(' ');
  };

  const p50Path = createPath(history.map(d => d.p50));
  const p95Path = createPath(history.map(d => d.p95));
  const p99Path = createPath(history.map(d => d.p99));

  const formatDuration = (ms: number) => {
    if (ms < 1) return `${(ms * 1000).toFixed(0)}μs`;
    if (ms < 1000) return `${ms.toFixed(1)}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  return (
    <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
      <h4 className="text-md font-semibold text-white mb-3 flex items-center gap-2">
        <TrendingUp className="w-5 h-5 text-blue-400" />
        Performance Timeline
      </h4>

      <div className="flex items-center gap-4 mb-3 text-xs">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-blue-500"></div>
          <span className="text-gray-300">P50: {formatDuration(metrics.duration.p50)}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
          <span className="text-gray-300">P95: {formatDuration(metrics.duration.p95)}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-red-500"></div>
          <span className="text-gray-300">P99: {formatDuration(metrics.duration.p99)}</span>
        </div>
      </div>

      <div className="relative bg-gray-900 rounded p-3" style={{ height: '200px' }}>
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="h-full w-full"
        >
          <defs>
            <linearGradient id="grid-gradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.1" />
              <stop offset="100%" stopColor="#ffffff" stopOpacity="0.05" />
            </linearGradient>
          </defs>

          <g className="opacity-10">
            {[0, 25, 50, 75, 100].map(y => (
              <line
                key={y}
                x1="0"
                y1={y}
                x2="100"
                y2={y}
                stroke="currentColor"
                strokeWidth="0.5"
                className="text-white"
              />
            ))}
          </g>

          <path
            d={p50Path}
            fill="none"
            stroke="#3b82f6"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          <path
            d={p95Path}
            fill="none"
            stroke="#eab308"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          <path
            d={p99Path}
            fill="none"
            stroke="#ef4444"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      <div className="mt-2 flex justify-between text-[10px] text-gray-500">
        <span>{timeRange === '1h' ? '-60m' : timeRange === '6h' ? '-6h' : timeRange === '24h' ? '-24h' : '-7d'}</span>
        <span>Now</span>
      </div>
    </div>
  );
}
