import { useState, useEffect, useRef, useCallback } from 'react';
import { Activity, Zap, TrendingUp } from 'lucide-react';
import { useTelemetryWebSocket } from '../hooks/useTelemetryWebSocket';

interface MetricDataPoint {
  timestamp: number;
  value: number;
  type: 'success' | 'failure';
}

interface RealTimeMetricsChartProps {
  extensionId: string;
  liveUpdates: boolean;
}

class CircularBuffer<T> {
  private buffer: (T | undefined)[];
  private head: number;
  private tail: number;
  private count: number;
  private capacity: number;

  constructor(capacity: number) {
    this.capacity = capacity;
    this.buffer = new Array(capacity);
    this.head = 0;
    this.tail = 0;
    this.count = 0;
  }

  push(item: T): void {
    this.buffer[this.tail] = item;
    this.tail = (this.tail + 1) % this.capacity;
    
    if (this.count < this.capacity) {
      this.count++;
    } else {
      this.head = (this.head + 1) % this.capacity;
    }
  }

  toArray(): T[] {
    const result: T[] = [];
    for (let i = 0; i < this.count; i++) {
      const idx = (this.head + i) % this.capacity;
      const item = this.buffer[idx];
      if (item !== undefined) {
        result.push(item);
      }
    }
    return result;
  }

  size(): number {
    return this.count;
  }

  clear(): void {
    this.buffer = new Array(this.capacity);
    this.head = 0;
    this.tail = 0;
    this.count = 0;
  }
}

function downsampleData(data: MetricDataPoint[], targetSize: number): MetricDataPoint[] {
  if (data.length <= targetSize) {
    return data;
  }

  const downsampled: MetricDataPoint[] = [];
  const bucketSize = Math.ceil(data.length / targetSize);

  for (let i = 0; i < data.length; i += bucketSize) {
    const bucket = data.slice(i, Math.min(i + bucketSize, data.length));
    
    const avgValue = bucket.reduce((sum, d) => sum + d.value, 0) / bucket.length;
    const successCount = bucket.filter(d => d.type === 'success').length;
    const type = successCount >= bucket.length / 2 ? 'success' : 'failure';
    
    downsampled.push({
      timestamp: bucket[Math.floor(bucket.length / 2)].timestamp,
      value: avgValue,
      type,
    });
  }

  return downsampled;
}

export function RealTimeMetricsChart({ extensionId, liveUpdates }: RealTimeMetricsChartProps) {
  const [currentRate, setCurrentRate] = useState(0);
  const [stats, setStats] = useState({
    successCount: 0,
    failureCount: 0,
    successRate: 0,
    avgDuration: 0,
    p95Duration: 0,
    minDuration: Infinity,
    maxDuration: 0,
  });

  const metricsBufferRef = useRef(new CircularBuffer<MetricDataPoint>(1000));
  const rateCounterRef = useRef(0);
  const lastRateResetRef = useRef(Date.now());
  const [displayData, setDisplayData] = useState<MetricDataPoint[]>([]);

  const { connectionState, subscribe } = useTelemetryWebSocket({
    port: 9877,
    autoReconnect: true,
    onEvent: (event) => {
      if (event.type === 'invocation-completed' && 
          'data' in event && 
          event.data.extensionId === extensionId) {
        const dataPoint: MetricDataPoint = {
          timestamp: event.data.timestamp || Date.now(),
          value: event.data.duration || 0,
          type: event.data.status === 'success' ? 'success' : 'failure',
        };
        
        metricsBufferRef.current.push(dataPoint);
        rateCounterRef.current++;
        
        updateStats();
        updateDisplayData();
      }
    },
  });

  const updateStats = useCallback(() => {
    const allMetrics = metricsBufferRef.current.toArray();
    if (allMetrics.length === 0) return;

    const successCount = allMetrics.filter(m => m.type === 'success').length;
    const failureCount = allMetrics.length - successCount;
    const successRate = (successCount / allMetrics.length) * 100;
    
    const durations = allMetrics.map(m => m.value).sort((a, b) => a - b);
    const avgDuration = durations.reduce((sum, d) => sum + d, 0) / durations.length;
    const p95Index = Math.floor(durations.length * 0.95);
    const p95Duration = durations[p95Index] || 0;
    const minDuration = durations[0] || 0;
    const maxDuration = durations[durations.length - 1] || 0;

    setStats({
      successCount,
      failureCount,
      successRate,
      avgDuration,
      p95Duration,
      minDuration,
      maxDuration,
    });
  }, []);

  const updateDisplayData = useCallback(() => {
    const allMetrics = metricsBufferRef.current.toArray();
    const downsampled = downsampleData(allMetrics, 200);
    setDisplayData(downsampled);
  }, []);

  useEffect(() => {
    if (liveUpdates && extensionId) {
      subscribe([extensionId]);
    }
  }, [liveUpdates, extensionId, subscribe]);

  useEffect(() => {
    const rateInterval = setInterval(() => {
      const now = Date.now();
      const timeDiff = (now - lastRateResetRef.current) / 1000;
      const rate = Math.round(rateCounterRef.current / timeDiff);
      
      setCurrentRate(rate);
      rateCounterRef.current = 0;
      lastRateResetRef.current = now;
    }, 1000);

    return () => clearInterval(rateInterval);
  }, []);

  useEffect(() => {
    const refreshInterval = setInterval(() => {
      updateDisplayData();
    }, 100);

    return () => clearInterval(refreshInterval);
  }, [updateDisplayData]);

  const formatDuration = (ms: number) => {
    if (ms < 1) return `${(ms * 1000).toFixed(0)}μs`;
    if (ms < 1000) return `${ms.toFixed(1)}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  const maxValue = displayData.length > 0 ? Math.max(...displayData.map(m => m.value), 1) : 1;
  const minValue = displayData.length > 0 ? Math.min(...displayData.map(m => m.value), 0) : 0;
  const range = maxValue - minValue || 1;

  const bufferSize = metricsBufferRef.current.size();
  const bufferCapacity = 1000;
  const bufferUsage = (bufferSize / bufferCapacity) * 100;

  return (
    <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-md font-semibold text-white flex items-center gap-2">
          <Activity className="w-5 h-5 text-green-400" />
          Real-Time Metrics Stream
        </h4>
        <div className="flex items-center gap-3">
          {liveUpdates && (
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${
                connectionState === 'connected' 
                  ? 'bg-green-500 animate-pulse' 
                  : 'bg-red-500'
              }`}></div>
              <span className="text-xs text-green-400">
                {connectionState === 'connected' ? 'Live' : 'Disconnected'}
              </span>
            </div>
          )}
          <div className="text-xs text-gray-400">
            Buffer: {bufferSize}/{bufferCapacity} ({bufferUsage.toFixed(1)}%)
          </div>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3 mb-3">
        <div className="bg-gray-900 rounded p-2">
          <div className="text-xs text-gray-400">Rate</div>
          <div className="text-lg font-bold text-cyan-400 flex items-center gap-1">
            <Zap className="w-4 h-4" />
            {currentRate} req/s
          </div>
        </div>
        <div className="bg-gray-900 rounded p-2">
          <div className="text-xs text-gray-400">Success Rate</div>
          <div className="text-lg font-bold text-green-400">
            {stats.successRate.toFixed(1)}%
          </div>
        </div>
        <div className="bg-gray-900 rounded p-2">
          <div className="text-xs text-gray-400">Avg Duration</div>
          <div className="text-lg font-bold text-purple-400">
            {formatDuration(stats.avgDuration)}
          </div>
        </div>
        <div className="bg-gray-900 rounded p-2">
          <div className="text-xs text-gray-400">P95 Duration</div>
          <div className="text-lg font-bold text-orange-400">
            {formatDuration(stats.p95Duration)}
          </div>
        </div>
      </div>

      <div className="relative bg-gray-900 rounded p-3" style={{ height: '200px' }}>
        {displayData.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-500 text-sm">
            <div className="text-center">
              <Activity className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p>Waiting for live telemetry data...</p>
              <p className="text-xs mt-1 text-gray-600">
                {liveUpdates ? 'Listening on port 9877' : 'Live updates paused'}
              </p>
            </div>
          </div>
        ) : (
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="h-full w-full"
          >
            <defs>
              <linearGradient id="success-gradient" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#22c55e" stopOpacity="0.3" />
                <stop offset="100%" stopColor="#22c55e" stopOpacity="0" />
              </linearGradient>
              <linearGradient id="failure-gradient" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#ef4444" stopOpacity="0.3" />
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
                  strokeWidth="0.3"
                  className="text-white"
                />
              ))}
            </g>

            {displayData.length > 1 && (
              <>
                <path
                  d={displayData.map((metric, idx) => {
                    const x = (idx / (displayData.length - 1)) * 100;
                    const normalizedValue = (metric.value - minValue) / range;
                    const y = 95 - (normalizedValue * 85);
                    return `${idx === 0 ? 'M' : 'L'} ${x} ${y}`;
                  }).join(' ')}
                  fill="none"
                  stroke="#06b6d4"
                  strokeWidth="1.5"
                  opacity="0.8"
                />

                <path
                  d={
                    displayData.map((metric, idx) => {
                      const x = (idx / (displayData.length - 1)) * 100;
                      const normalizedValue = (metric.value - minValue) / range;
                      const y = 95 - (normalizedValue * 85);
                      return `${idx === 0 ? 'M' : 'L'} ${x} ${y}`;
                    }).join(' ') + ` L 100 95 L 0 95 Z`
                  }
                  fill="url(#success-gradient)"
                  opacity="0.3"
                />
              </>
            )}

            {displayData.map((metric, idx) => {
              const x = (idx / Math.max(displayData.length - 1, 1)) * 100;
              const normalizedValue = (metric.value - minValue) / range;
              const y = 95 - (normalizedValue * 85);
              const color = metric.type === 'success' ? '#22c55e' : '#ef4444';
              
              return (
                <circle
                  key={idx}
                  cx={x}
                  cy={y}
                  r="1"
                  fill={color}
                  opacity="0.7"
                />
              );
            })}
          </svg>
        )}
      </div>

      <div className="mt-2 flex justify-between text-[10px] text-gray-500">
        <span>-{bufferSize > 0 ? Math.floor((Date.now() - displayData[0]?.timestamp) / 1000) : 0}s</span>
        <div className="flex gap-3">
          <span className="text-gray-400">Min: {formatDuration(stats.minDuration)}</span>
          <span className="text-gray-400">Max: {formatDuration(stats.maxDuration)}</span>
        </div>
        <span>Now</span>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
        <div className="flex items-center justify-between p-2 bg-green-900/20 border border-green-800 rounded">
          <span className="text-gray-400">Success</span>
          <span className="font-bold text-green-400">{stats.successCount}</span>
        </div>
        <div className="flex items-center justify-between p-2 bg-red-900/20 border border-red-800 rounded">
          <span className="text-gray-400">Failed</span>
          <span className="font-bold text-red-400">{stats.failureCount}</span>
        </div>
        <div className="flex items-center justify-between p-2 bg-blue-900/20 border border-blue-800 rounded">
          <span className="text-gray-400">Total</span>
          <span className="font-bold text-blue-400">{bufferSize}</span>
        </div>
      </div>

      <div className="mt-2 p-2 bg-gray-900 rounded">
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-3 h-3 text-cyan-400" />
            <span className="text-gray-400">Downsampled Display</span>
          </div>
          <span className="text-gray-500">
            {displayData.length} points (from {bufferSize})
          </span>
        </div>
      </div>
    </div>
  );
}
