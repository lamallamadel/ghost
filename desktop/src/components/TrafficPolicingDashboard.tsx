import { useEffect, useState, useRef } from 'react'
import { Activity, TrendingUp, Gauge, Zap, AlertTriangle, Clock } from 'lucide-react'
import type { TrafficPolicerState } from '@/ipc/types'

type TrafficColor = 'green' | 'yellow' | 'red'

type TrafficDistributionPoint = {
  timestamp: number
  green: number
  yellow: number
  red: number
}

type ThroughputPoint = {
  timestamp: number
  bytesPerSec: number
}

type TrafficPolicingDashboardProps = {
  state: TrafficPolicerState
  recentTraffic?: {
    color: TrafficColor
    bytes: number
    timestamp: number
  }[]
}

const HISTORY_DURATION_MS = 5 * 60 * 1000
const MAX_HISTORY_POINTS = 150
const UPDATE_INTERVAL_MS = 1000

function useCircularBuffer<T>(maxSize: number) {
  const [buffer, setBuffer] = useState<T[]>([])

  const addPoint = (point: T) => {
    setBuffer(prev => {
      const updated = [...prev, point]
      if (updated.length > maxSize) {
        return updated.slice(updated.length - maxSize)
      }
      return updated
    })
  }

  const clearOldPoints = (cutoffTime: number) => {
    setBuffer(prev => prev.filter((p: T & { timestamp: number }) => p.timestamp >= cutoffTime))
  }

  return { buffer, addPoint, clearOldPoints }
}

function TokenGauge({ 
  label, 
  tokens, 
  capacity, 
  color, 
  icon: Icon 
}: { 
  label: string
  tokens: number
  capacity: number
  color: string
  icon: typeof Gauge
}) {
  const percent = Math.min((tokens / capacity) * 100, 100)
  const displayTokens = Math.floor(tokens)
  
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          <Icon size={14} className={color} />
          <span className="text-white/60">{label}</span>
        </div>
        <span className={`font-mono font-semibold ${color}`}>
          {displayTokens}/{capacity}
        </span>
      </div>
      
      <div className="relative h-8 overflow-hidden rounded-lg border border-white/10 bg-black/40">
        <div
          className={`h-full ${color} transition-all duration-500 ease-out`}
          style={{ 
            width: `${percent}%`,
            background: `linear-gradient(to right, ${color === 'text-emerald-400' ? '#10b981' : '#eab308'}, ${color === 'text-emerald-400' ? '#34d399' : '#fbbf24'})`
          }}
        />
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-xs font-semibold text-white drop-shadow-lg">
            {percent.toFixed(1)}%
          </span>
        </div>
      </div>
    </div>
  )
}

function ThroughputChart({ 
  throughputHistory, 
  cirTarget 
}: { 
  throughputHistory: ThroughputPoint[]
  cirTarget: number
}) {
  if (throughputHistory.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center rounded-lg border border-white/10 bg-black/30 text-xs text-white/40">
        Waiting for throughput data...
      </div>
    )
  }

  const maxValue = Math.max(...throughputHistory.map(d => d.bytesPerSec), cirTarget, 1)
  const targetY = 100 - ((cirTarget / maxValue) * 90 + 5)

  const points = throughputHistory.map((point, idx) => {
    const x = (idx / (throughputHistory.length - 1 || 1)) * 100
    const normalizedValue = point.bytesPerSec / maxValue
    const y = 100 - (normalizedValue * 90 + 5)
    return { x, y, value: point.bytesPerSec }
  })

  const pathData = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
  const areaData = `${pathData} L 100 100 L 0 100 Z`

  return (
    <div className="rounded-lg border border-white/10 bg-black/30 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-semibold text-white/60">
          <Activity size={14} />
          <span>Real-time Throughput</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="h-2 w-6 rounded bg-gradient-to-r from-blue-500 to-blue-400" />
            <span className="font-mono text-xs text-white/60">Actual</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-0.5 w-6 border-t-2 border-dashed border-rose-400" />
            <span className="font-mono text-xs text-white/60">CIR Target</span>
          </div>
        </div>
      </div>

      <div className="relative h-32">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full">
          <defs>
            <linearGradient id="throughput-gradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.05" />
            </linearGradient>
          </defs>

          <line
            x1="0"
            y1={targetY}
            x2="100"
            y2={targetY}
            stroke="#fb7185"
            strokeWidth="1"
            strokeDasharray="4 4"
            className="opacity-80"
          />

          <path d={areaData} fill="url(#throughput-gradient)" />

          <path
            d={pathData}
            fill="none"
            stroke="#3b82f6"
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
              fill="#3b82f6"
              className="opacity-80"
            />
          ))}
        </svg>
      </div>

      <div className="mt-2 flex justify-between text-xs">
        <span className="font-mono text-blue-400">
          {(points[points.length - 1]?.value || 0).toFixed(0)} B/s
        </span>
        <span className="font-mono text-rose-400">
          CIR: {cirTarget.toFixed(0)} B/s
        </span>
      </div>
    </div>
  )
}

function TrafficDistributionChart({ 
  distribution 
}: { 
  distribution: TrafficDistributionPoint[] 
}) {
  if (distribution.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center rounded-lg border border-white/10 bg-black/30 text-xs text-white/40">
        Waiting for traffic distribution data...
      </div>
    )
  }

  const maxTotal = Math.max(
    ...distribution.map(d => d.green + d.yellow + d.red),
    1
  )

  const greenPoints = distribution.map((point, idx) => {
    const x = (idx / (distribution.length - 1 || 1)) * 100
    const y = 100 - ((point.green / maxTotal) * 90 + 5)
    return `${x},${y}`
  }).join(' ')

  const yellowPoints = distribution.map((point, idx) => {
    const x = (idx / (distribution.length - 1 || 1)) * 100
    const y = 100 - (((point.green + point.yellow) / maxTotal) * 90 + 5)
    return `${x},${y}`
  }).join(' ')

  const redPoints = distribution.map((point, idx) => {
    const x = (idx / (distribution.length - 1 || 1)) * 100
    const y = 100 - (((point.green + point.yellow + point.red) / maxTotal) * 90 + 5)
    return `${x},${y}`
  }).join(' ')

  const greenArea = `${greenPoints} 100,100 0,100`
  const yellowArea = `${yellowPoints} ${greenPoints.split(' ').reverse().join(' ')}`
  const redArea = `${redPoints} ${yellowPoints.split(' ').reverse().join(' ')}`

  const latest = distribution[distribution.length - 1]
  const total = latest.green + latest.yellow + latest.red
  
  const greenPct = total > 0 ? (latest.green / total) * 100 : 0
  const yellowPct = total > 0 ? (latest.yellow / total) * 100 : 0
  const redPct = total > 0 ? (latest.red / total) * 100 : 0

  return (
    <div className="rounded-lg border border-white/10 bg-black/30 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-semibold text-white/60">
          <TrendingUp size={14} />
          <span>Traffic Distribution (5min)</span>
        </div>
      </div>

      <div className="relative h-40">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full">
          <polygon
            points={greenArea}
            fill="#10b981"
            className="opacity-60"
          />
          
          <polygon
            points={yellowArea}
            fill="#eab308"
            className="opacity-60"
          />
          
          <polygon
            points={redArea}
            fill="#ef4444"
            className="opacity-60"
          />

          <polyline
            points={redPoints}
            fill="none"
            stroke="#ef4444"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2">
          <div className="mb-1 text-xs text-emerald-400">Green (Normal)</div>
          <div className="font-mono text-lg font-semibold text-emerald-400">
            {greenPct.toFixed(1)}%
          </div>
        </div>
        <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-2">
          <div className="mb-1 text-xs text-yellow-400">Yellow (Warning)</div>
          <div className="font-mono text-lg font-semibold text-yellow-400">
            {yellowPct.toFixed(1)}%
          </div>
        </div>
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-2">
          <div className="mb-1 text-xs text-rose-400">Red (Throttled)</div>
          <div className="font-mono text-lg font-semibold text-rose-400">
            {redPct.toFixed(1)}%
          </div>
        </div>
      </div>
    </div>
  )
}

function BurstDetectionIndicator({ 
  excessTokens, 
  excessCapacity,
  isBursting 
}: { 
  excessTokens: number
  excessCapacity: number
  isBursting: boolean
}) {
  const consumptionPercent = excessCapacity > 0 
    ? ((excessCapacity - excessTokens) / excessCapacity) * 100 
    : 0

  return (
    <div className={`rounded-lg border p-4 transition-all duration-500 ${
      isBursting 
        ? 'border-yellow-500/50 bg-yellow-500/20 shadow-lg shadow-yellow-500/20' 
        : 'border-white/10 bg-black/30'
    }`}>
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-semibold text-white/60">
          <AlertTriangle size={14} className={isBursting ? 'text-yellow-400' : 'text-white/40'} />
          <span>Burst Detection</span>
        </div>
        {isBursting && (
          <div className="flex items-center gap-1.5 rounded-md border border-yellow-500/30 bg-yellow-500/20 px-2 py-1">
            <div className="h-2 w-2 animate-pulse rounded-full bg-yellow-400" />
            <span className="text-xs font-semibold text-yellow-300">BURSTING</span>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="text-white/60">Be Consumption</span>
          <span className={`font-mono font-semibold ${
            consumptionPercent > 75 ? 'text-rose-400' :
            consumptionPercent > 50 ? 'text-yellow-400' :
            'text-emerald-400'
          }`}>
            {consumptionPercent.toFixed(1)}%
          </span>
        </div>
        
        <div className="h-2 overflow-hidden rounded-full bg-white/10">
          <div
            className={`h-full transition-all duration-500 ${
              consumptionPercent > 75 ? 'bg-gradient-to-r from-rose-500 to-rose-400' :
              consumptionPercent > 50 ? 'bg-gradient-to-r from-yellow-500 to-yellow-400' :
              'bg-gradient-to-r from-emerald-500 to-emerald-400'
            }`}
            style={{ width: `${consumptionPercent}%` }}
          />
        </div>

        <div className="mt-3 flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-3 py-2">
          <span className="text-xs text-white/60">Available Be Tokens</span>
          <span className="font-mono text-sm font-semibold text-yellow-400">
            {Math.floor(excessTokens)}
          </span>
        </div>
      </div>
    </div>
  )
}

function TokenRefillVisualization({ 
  cir, 
  lastRefill 
}: { 
  cir: number
  lastRefill: number 
}) {
  const [timeSinceRefill, setTimeSinceRefill] = useState(0)
  const refillRate = cir / 60
  const msPerToken = refillRate > 0 ? 1000 / refillRate : 0

  useEffect(() => {
    const interval = setInterval(() => {
      setTimeSinceRefill(Date.now() - lastRefill)
    }, 100)
    return () => clearInterval(interval)
  }, [lastRefill])

  const tokensGenerated = msPerToken > 0 ? timeSinceRefill / msPerToken : 0
  const nextTokenProgress = msPerToken > 0 ? (timeSinceRefill % msPerToken) / msPerToken * 100 : 0

  return (
    <div className="rounded-lg border border-white/10 bg-black/30 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-semibold text-white/60">
          <Clock size={14} />
          <span>Token Refill Rate</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Zap size={14} className="text-blue-400" />
          <span className="font-mono text-xs text-blue-400">
            {refillRate.toFixed(2)} tokens/s
          </span>
        </div>
      </div>

      <div className="space-y-3">
        <div className="rounded-lg border border-white/10 bg-white/5 p-3">
          <div className="mb-2 text-xs text-white/60">Tokens Generated</div>
          <div className="font-mono text-2xl font-bold text-blue-400">
            {tokensGenerated.toFixed(2)}
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between text-xs">
            <span className="text-white/60">Next Token</span>
            <span className="font-mono text-blue-400">{nextTokenProgress.toFixed(0)}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full bg-gradient-to-r from-blue-500 to-blue-400 transition-all duration-100"
              style={{ width: `${nextTokenProgress}%` }}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="rounded border border-white/10 bg-white/5 p-2">
            <div className="mb-1 text-white/40">Time/Token</div>
            <div className="font-mono font-semibold text-white/80">
              {msPerToken.toFixed(0)}ms
            </div>
          </div>
          <div className="rounded border border-white/10 bg-white/5 p-2">
            <div className="mb-1 text-white/40">Since Refill</div>
            <div className="font-mono font-semibold text-white/80">
              {timeSinceRefill.toFixed(0)}ms
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export function TrafficPolicingDashboard({ 
  state, 
  recentTraffic = [] 
}: TrafficPolicingDashboardProps) {
  const { buffer: throughputHistory, addPoint: addThroughput } = useCircularBuffer<ThroughputPoint>(MAX_HISTORY_POINTS)
  const { buffer: distributionHistory, addPoint: addDistribution, clearOldPoints } = useCircularBuffer<TrafficDistributionPoint>(MAX_HISTORY_POINTS)
  const [isBursting, setIsBursting] = useState(false)
  const prevExcessTokensRef = useRef(state.excessTokens)

  useEffect(() => {
    if (prevExcessTokensRef.current - state.excessTokens > 1) {
      setIsBursting(true)
      const timer = setTimeout(() => setIsBursting(false), 2000)
      return () => clearTimeout(timer)
    }
    prevExcessTokensRef.current = state.excessTokens
  }, [state.excessTokens])

  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now()
      
      const recentBytes = recentTraffic
        .filter(t => now - t.timestamp < 1000)
        .reduce((sum, t) => sum + t.bytes, 0)
      
      addThroughput({
        timestamp: now,
        bytesPerSec: recentBytes
      })

      const windowTraffic = recentTraffic.filter(t => now - t.timestamp < 1000)
      const greenCount = windowTraffic.filter(t => t.color === 'green').length
      const yellowCount = windowTraffic.filter(t => t.color === 'yellow').length
      const redCount = windowTraffic.filter(t => t.color === 'red').length

      addDistribution({
        timestamp: now,
        green: greenCount,
        yellow: yellowCount,
        red: redCount
      })

      clearOldPoints(now - HISTORY_DURATION_MS)
    }, UPDATE_INTERVAL_MS)

    return () => clearInterval(interval)
  }, [recentTraffic, addThroughput, addDistribution, clearOldPoints])

  const cirBytesPerSec = (state.cir / 60) * 100

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <TokenGauge
          label="Bc (Committed Burst)"
          tokens={state.committedTokens}
          capacity={state.committedCapacity}
          color="text-emerald-400"
          icon={Gauge}
        />
        <TokenGauge
          label="Be (Excess Burst)"
          tokens={state.excessTokens}
          capacity={state.excessCapacity}
          color="text-yellow-400"
          icon={Gauge}
        />
      </div>

      <ThroughputChart 
        throughputHistory={throughputHistory} 
        cirTarget={cirBytesPerSec} 
      />

      <TrafficDistributionChart distribution={distributionHistory} />

      <BurstDetectionIndicator 
        excessTokens={state.excessTokens}
        excessCapacity={state.excessCapacity}
        isBursting={isBursting}
      />

      <TokenRefillVisualization 
        cir={state.cir} 
        lastRefill={state.lastRefill} 
      />
    </div>
  )
}
