import { useState, useEffect, useRef } from 'react';
import { Activity, Zap } from 'lucide-react';

interface MetricDataPoint {
  timestamp: number;
  value: number;
  type: 'success' | 'failure';
}

interface RealTimeMetricsChartProps {
  extensionId: string;
  liveUpdates: boolean;
}

export function RealTimeMetricsChart({ extensionId, liveUpdates }: RealTimeMetricsChartProps) {
  const [metrics, setMetrics] = useState<MetricDataPoint[]>([]);
  const [currentRate, setCurrentRate] = useState(0);
  const maxPoints = 60;
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!liveUpdates) return;

    const connectWebSocket = () => {
      try {
        const ws = new WebSocket('ws://localhost:9877/telemetry');
        
        ws.onopen = () => {
          console.log('[Analytics] WebSocket connected');
          ws.send(JSON.stringify({
            type: 'subscribe',
            extensionId
          }));
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            
            if (data.type === 'invocation-completed' && data.extensionId === extensionId) {
              setMetrics(prev => {
                const newMetrics: MetricDataPoint[] = [...prev, {
                  timestamp: Date.now(),
                  value: data.duration || 0,
                  type: (data.status === 'success' ? 'success' : 'failure') as 'success' | 'failure'
                }];
                
                return newMetrics.slice(-maxPoints);
              });
              
              setCurrentRate(prev => prev + 1);
            }
          } catch (err) {
            console.error('[Analytics] Error parsing WebSocket message:', err);
          }
        };

        ws.onerror = (error) => {
          console.error('[Analytics] WebSocket error:', error);
        };

        ws.onclose = () => {
          console.log('[Analytics] WebSocket disconnected');
          setTimeout(connectWebSocket, 5000);
        };

        wsRef.current = ws;
      } catch (err) {
        console.error('[Analytics] Failed to connect WebSocket:', err);
      }
    };

    connectWebSocket();

    const rateResetInterval = setInterval(() => {
      setCurrentRate(0);
    }, 1000);

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      clearInterval(rateResetInterval);
    };
  }, [extensionId, liveUpdates]);

  const formatDuration = (ms: number) => {
    if (ms < 1) return `${(ms * 1000).toFixed(0)}μs`;
    if (ms < 1000) return `${ms.toFixed(1)}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  const maxValue = Math.max(...metrics.map(m => m.value), 1);
  const minValue = Math.min(...metrics.map(m => m.value), 0);
  const range = maxValue - minValue || 1;

  const successCount = metrics.filter(m => m.type === 'success').length;
  const failureCount = metrics.filter(m => m.type === 'failure').length;
  const successRate = metrics.length > 0 ? (successCount / metrics.length) * 100 : 0;

  return (
    <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-md font-semibold text-white flex items-center gap-2">
          <Activity className="w-5 h-5 text-green-400" />
          Real-Time Metrics
        </h4>
        {liveUpdates && (
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
            <span className="text-xs text-green-400">Live</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3 mb-3">
        <div className="bg-gray-900 rounded p-2">
          <div className="text-xs text-gray-400">Rate (req/s)</div>
          <div className="text-lg font-bold text-cyan-400 flex items-center gap-1">
            <Zap className="w-4 h-4" />
            {currentRate}
          </div>
        </div>
        <div className="bg-gray-900 rounded p-2">
          <div className="text-xs text-gray-400">Success Rate</div>
          <div className="text-lg font-bold text-green-400">
            {successRate.toFixed(1)}%
          </div>
        </div>
        <div className="bg-gray-900 rounded p-2">
          <div className="text-xs text-gray-400">Active Points</div>
          <div className="text-lg font-bold text-purple-400">
            {metrics.length}
          </div>
        </div>
      </div>

      <div className="relative bg-gray-900 rounded p-3" style={{ height: '150px' }}>
        {metrics.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-500 text-sm">
            Waiting for live data...
          </div>
        ) : (
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="h-full w-full"
          >
            <defs>
              <linearGradient id="success-gradient" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#22c55e" stopOpacity="0.4" />
                <stop offset="100%" stopColor="#22c55e" stopOpacity="0" />
              </linearGradient>
              <linearGradient id="failure-gradient" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#ef4444" stopOpacity="0.4" />
                <stop offset="100%" stopColor="#ef4444" stopOpacity="0" />
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

            {metrics.map((metric, idx) => {
              const x = (idx / (maxPoints - 1)) * 100;
              const normalizedValue = (metric.value - minValue) / range;
              const y = 95 - (normalizedValue * 85);
              const color = metric.type === 'success' ? '#22c55e' : '#ef4444';
              
              return (
                <circle
                  key={idx}
                  cx={x}
                  cy={y}
                  r="1.5"
                  fill={color}
                  opacity="0.8"
                />
              );
            })}

            {metrics.length > 1 && (
              <>
                <path
                  d={metrics.map((metric, idx) => {
                    const x = (idx / (maxPoints - 1)) * 100;
                    const normalizedValue = (metric.value - minValue) / range;
                    const y = 95 - (normalizedValue * 85);
                    return `${idx === 0 ? 'M' : 'L'} ${x} ${y}`;
                  }).join(' ')}
                  fill="none"
                  stroke="#06b6d4"
                  strokeWidth="1"
                  opacity="0.6"
                />
              </>
            )}
          </svg>
        )}
      </div>

      <div className="mt-2 flex justify-between text-[10px] text-gray-500">
        <span>-{maxPoints}s</span>
        <span className="text-gray-400">
          {metrics.length > 0 && `Latest: ${formatDuration(metrics[metrics.length - 1].value)}`}
        </span>
        <span>Now</span>
      </div>

      <div className="mt-2 flex items-center justify-center gap-4 text-xs">
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-green-500"></div>
          <span className="text-gray-400">Success: {successCount}</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-red-500"></div>
          <span className="text-gray-400">Failed: {failureCount}</span>
        </div>
      </div>
    </div>
  );
}
