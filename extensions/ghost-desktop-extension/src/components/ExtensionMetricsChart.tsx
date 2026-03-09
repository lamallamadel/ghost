import type { ThroughputDataPoint } from '@/ipc/types'

type ExtensionMetricsChartProps = {
  data: ThroughputDataPoint[]
  title: string
  color?: string
  height?: number
  showGrid?: boolean
}

export function ExtensionMetricsChart({
  data,
  title,
  color = '#34d399',
  height = 80,
  showGrid = true,
}: ExtensionMetricsChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="rounded-lg border border-white/10 bg-black/30 p-4">
        <div className="mb-2 text-xs font-semibold text-white/60">{title}</div>
        <div className="text-xs text-white/40">No data available</div>
      </div>
    )
  }

  const maxValue = Math.max(...data.map(d => d.requestsPerMinute), 1)
  const minValue = Math.min(...data.map(d => d.requestsPerMinute), 0)
  const range = maxValue - minValue || 1

  const points = data.map((point, idx) => {
    const x = (idx / (data.length - 1 || 1)) * 100
    const normalizedValue = (point.requestsPerMinute - minValue) / range
    const y = 100 - (normalizedValue * 90 + 5)
    return { x, y, value: point.requestsPerMinute }
  })

  const pathData = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
  const areaData = `${pathData} L 100 100 L 0 100 Z`

  const now = Date.now()
  const timeLabels = [15, 10, 5, 0].map(minAgo => {
    const timestamp = now - minAgo * 60 * 1000
    const date = new Date(timestamp)
    return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`
  })

  return (
    <div className="rounded-lg border border-white/10 bg-black/30 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-xs font-semibold text-white/60">{title}</div>
        <div className="font-mono text-sm font-semibold" style={{ color }}>
          {data[data.length - 1]?.requestsPerMinute.toFixed(1) || '0.0'} req/min
        </div>
      </div>

      <div className="relative" style={{ height: `${height}px` }}>
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="h-full w-full"
        >
          {showGrid && (
            <g className="opacity-20">
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
          )}

          <defs>
            <linearGradient id={`gradient-${title}`} x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor={color} stopOpacity="0.3" />
              <stop offset="100%" stopColor={color} stopOpacity="0.05" />
            </linearGradient>
          </defs>

          <path
            d={areaData}
            fill={`url(#gradient-${title})`}
          />

          <path
            d={pathData}
            fill="none"
            stroke={color}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {points.map((point, idx) => (
            <circle
              key={idx}
              cx={point.x}
              cy={point.y}
              r="1.5"
              fill={color}
              className="opacity-80"
            />
          ))}
        </svg>
      </div>

      <div className="mt-2 flex justify-between text-[10px] text-white/40">
        {timeLabels.map((label, idx) => (
          <span key={idx}>{label}</span>
        ))}
      </div>
    </div>
  )
}
