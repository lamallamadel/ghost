import { useCallback, useEffect, useState, useMemo } from 'react'
import { Activity, ArrowRight, CheckCircle, XCircle, AlertCircle, TrendingUp, X, ChevronDown, ChevronUp, Wifi, WifiOff } from 'lucide-react'
import { ghost } from '@/ipc/ghost'
import type { GatewayState, PipelineRequest } from '@/ipc/types'
import { useToastsStore } from '@/stores/useToastsStore'
import { useTelemetryWebSocket, type SpanEvent, type TelemetryEvent } from '@/hooks/useTelemetryWebSocket'

type StageMetrics = {
  latency: number
  errorRate: number
  throughput: number
  activeRequests: number
}

type AnimatedRequest = {
  id: string
  stage: number
  progress: number
}

const STAGES = ['intercept', 'auth', 'audit', 'execute'] as const

function ConnectionStatusIndicator({ status }: { status: 'connected' | 'connecting' | 'disconnected' | 'error' }) {
  const config = {
    connected: { color: 'bg-emerald-500', label: 'Live', icon: Wifi },
    connecting: { color: 'bg-yellow-500 animate-pulse', label: 'Reconnecting', icon: Wifi },
    disconnected: { color: 'bg-rose-500', label: 'Disconnected', icon: WifiOff },
    error: { color: 'bg-rose-500', label: 'Error', icon: WifiOff },
  }

  const { color, label, icon: Icon } = config[status]

  return (
    <div className="flex items-center gap-2 rounded-md border border-white/10 bg-white/5 px-2 py-1">
      <div className={`h-2 w-2 rounded-full ${color}`} />
      <Icon size={12} className="text-white/60" />
      <span className="text-xs text-white/60">{label}</span>
    </div>
  )
}

export function GatewayTab() {
  const pushToast = useToastsStore((s) => s.push)
  const [state, setState] = useState<GatewayState | null>(null)
  const [loading, setLoading] = useState(false)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [animatedRequests, setAnimatedRequests] = useState<AnimatedRequest[]>([])
  const [requestHistory, setRequestHistory] = useState<PipelineRequest[]>([])
  const [expandedRequest, setExpandedRequest] = useState<string | null>(null)

  const handleTelemetryEvent = useCallback((event: TelemetryEvent) => {
    if (event.type === 'span') {
      const spans = Array.isArray(event.data) ? event.data : [event.data]
      
      spans.forEach((span: SpanEvent) => {
        if (span.attributes.requestId && span.attributes.extensionId) {
          const stage = span.attributes.stage as string
          const status = span.attributes.status as string
          
          if (STAGES.includes(stage as typeof STAGES[number])) {
            const pipelineRequest: PipelineRequest = {
              requestId: span.attributes.requestId as string,
              extensionId: span.attributes.extensionId as string,
              type: span.attributes.type as string || 'unknown',
              operation: span.attributes.operation as string || 'unknown',
              timestamp: span.startTime,
              stage: stage as PipelineRequest['stage'],
              status: status as PipelineRequest['status'] || 'pending',
              dropReason: span.attributes.dropReason as string,
              dropLayer: span.attributes.dropLayer as 'auth' | 'audit',
            }

            setRequestHistory(prev => {
              const exists = prev.find(r => 
                r.requestId === pipelineRequest.requestId && 
                r.stage === pipelineRequest.stage
              )
              if (exists) return prev
              
              const updated = [...prev, pipelineRequest]
              return updated.slice(-100)
            })

            if (status === 'pending' || status === 'approved') {
              setAnimatedRequests(prev => {
                const stageIndex = STAGES.indexOf(stage as typeof STAGES[number])
                const existing = prev.find(ar => ar.id === pipelineRequest.requestId)
                if (existing) return prev
                
                return [...prev, {
                  id: pipelineRequest.requestId,
                  stage: stageIndex,
                  progress: 0
                }]
              })
            }
          }
        }
      })
    }
  }, [])

  const telemetry = useTelemetryWebSocket({
    autoReconnect: true,
    onEvent: handleTelemetryEvent,
  })

  useEffect(() => {
    telemetry.subscribe(['span'])
    return () => {
      telemetry.unsubscribe(['span'])
    }
  }, [telemetry])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await ghost.gatewayState()
      setState(res)
      
      setRequestHistory(prev => {
        const combined = [...prev, ...res.recentRequests]
        const unique = Array.from(
          new Map(combined.map(r => [r.requestId + r.stage, r])).values()
        )
        return unique.slice(-100)
      })
    } catch (e) {
      pushToast({ title: 'État indisponible', message: String(e), tone: 'danger' })
    } finally {
      setLoading(false)
    }
  }, [pushToast])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (!autoRefresh || telemetry.connectionState === 'connected') return
    const interval = setInterval(load, 2000)
    return () => clearInterval(interval)
  }, [autoRefresh, load, telemetry.connectionState])

  useEffect(() => {
    if (!state) return

    setAnimatedRequests(prev => {
      const newAnimatedRequests: AnimatedRequest[] = []
      
      state.recentRequests.forEach(req => {
        if (req.status === 'pending' || req.status === 'approved') {
          const stageIndex = STAGES.indexOf(req.stage)
          if (stageIndex !== -1) {
            const existingReq = prev.find(ar => ar.id === req.requestId)
            if (existingReq) {
              newAnimatedRequests.push(existingReq)
            } else {
              newAnimatedRequests.push({
                id: req.requestId,
                stage: stageIndex,
                progress: 0
              })
            }
          }
        }
      })

      return newAnimatedRequests
    })
  }, [state])

  useEffect(() => {
    const interval = setInterval(() => {
      setAnimatedRequests(prev => 
        prev.map(req => {
          let newProgress = req.progress + 0.05
          let newStage = req.stage
          
          if (newProgress >= 1) {
            newProgress = 0
            newStage = req.stage + 1
          }
          
          if (newStage >= STAGES.length) {
            return null
          }
          
          return { ...req, progress: newProgress, stage: newStage }
        }).filter((r): r is AnimatedRequest => r !== null)
      )
    }, 50)
    
    return () => clearInterval(interval)
  }, [])

  const stageMetrics = useMemo(() => {
    const now = Date.now()
    const recentWindow = 60000
    const recentReqs = requestHistory.filter(r => now - r.timestamp < recentWindow)
    
    const metrics: Record<string, StageMetrics> = {}
    
    STAGES.forEach(stage => {
      const stageReqs = recentReqs.filter(r => r.stage === stage)
      const completed = stageReqs.filter(r => r.status === 'completed' || r.status === 'approved')
      const failed = stageReqs.filter(r => r.status === 'failed' || r.status === 'rejected')
      const active = state?.recentRequests.filter(r => r.stage === stage && r.status === 'pending') || []
      
      const latencies: number[] = []
      completed.forEach(req => {
        const nextStageReqs = recentReqs.filter(r => 
          r.requestId === req.requestId && 
          STAGES.indexOf(r.stage) > STAGES.indexOf(stage)
        )
        if (nextStageReqs.length > 0) {
          const latency = nextStageReqs[0].timestamp - req.timestamp
          if (latency > 0 && latency < 10000) {
            latencies.push(latency)
          }
        }
      })
      
      const avgLatency = latencies.length > 0 
        ? latencies.reduce((a, b) => a + b, 0) / latencies.length 
        : 0
      
      const errorRate = stageReqs.length > 0 
        ? failed.length / stageReqs.length 
        : 0
      
      const throughput = (completed.length / (recentWindow / 1000))
      
      metrics[stage] = {
        latency: avgLatency,
        errorRate,
        throughput,
        activeRequests: active.length
      }
    })
    
    return metrics
  }, [requestHistory, state])

  function getStageColor(stage: string) {
    switch (stage) {
      case 'intercept': return 'bg-blue-500/20 text-blue-300 border-blue-500/30'
      case 'auth': return 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30'
      case 'audit': return 'bg-purple-500/20 text-purple-300 border-purple-500/30'
      case 'execute': return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
      default: return 'bg-white/10 text-white/60 border-white/20'
    }
  }

  function getHealthColor(errorRate: number): string {
    if (errorRate === 0) return 'bg-emerald-500'
    if (errorRate < 0.1) return 'bg-yellow-500'
    return 'bg-rose-500'
  }

  function getHealthIndicatorClass(errorRate: number): string {
    if (errorRate === 0) return 'text-emerald-400 border-emerald-500/50'
    if (errorRate < 0.1) return 'text-yellow-400 border-yellow-500/50'
    return 'text-rose-400 border-rose-500/50'
  }

  function getStatusIcon(status: string, isDropped: boolean = false) {
    if (isDropped) {
      return <X size={16} className="text-rose-400" />
    }
    switch (status) {
      case 'completed': return <CheckCircle size={16} className="text-emerald-400" />
      case 'approved': return <CheckCircle size={16} className="text-emerald-400" />
      case 'rejected': return <XCircle size={16} className="text-rose-400" />
      case 'failed': return <XCircle size={16} className="text-rose-400" />
      case 'pending': return <Activity size={16} className="animate-pulse text-blue-400" />
      default: return <AlertCircle size={16} className="text-white/60" />
    }
  }

  function formatTime(timestamp: number) {
    const date = new Date(timestamp)
    const timeStr = date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    const ms = date.getMilliseconds().toString().padStart(3, '0')
    return `${timeStr}.${ms}`
  }

  function getDropLayerBadge(dropLayer?: 'auth' | 'audit') {
    if (!dropLayer) return null
    
    const isQoS = dropLayer === 'auth'
    const isSI10 = dropLayer === 'audit'
    
    return (
      <span className={`rounded-md border px-2 py-0.5 text-xs font-medium ${
        isQoS 
          ? 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30' 
          : isSI10 
          ? 'bg-rose-500/20 text-rose-300 border-rose-500/30'
          : 'bg-white/10 text-white/60 border-white/20'
      }`}>
        {isQoS ? 'QoS Violation' : 'SI-10 Violation'}
      </span>
    )
  }

  const recentRequests = state?.recentRequests || []
  
  const droppedRequests = useMemo(() => {
    return requestHistory.filter(r => r.status === 'rejected' && r.dropLayer)
  }, [requestHistory])
  
  const dropsByLayer = useMemo(() => {
    const counts = { auth: 0, audit: 0 }
    droppedRequests.forEach(req => {
      if (req.dropLayer) {
        counts[req.dropLayer]++
      }
    })
    return counts
  }, [droppedRequests])
  
  const dropsByExtension = useMemo(() => {
    const counts: Record<string, number> = {}
    droppedRequests.forEach(req => {
      counts[req.extensionId] = (counts[req.extensionId] || 0) + 1
    })
    return counts
  }, [droppedRequests])

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-white/10 bg-white/5 px-4 py-3 backdrop-blur">
        <div className="flex items-center gap-3">
          <div>
            <div className="text-sm font-semibold">Pipeline I/O</div>
            <div className="text-xs text-white/60">Flux en temps réel: Extension → Intercept → Auth → Audit → Execute</div>
          </div>
          <ConnectionStatusIndicator status={telemetry.connectionState} />
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-xs text-white/60">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded"
            />
            Auto-refresh
          </label>
          <button
            type="button"
            onClick={load}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm hover:bg-white/10"
          >
            Actualiser
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-4">
        {loading && !state ? (
          <div className="text-sm text-white/60">Chargement…</div>
        ) : null}

        <div className="mb-6">
          <div className="mb-3 text-sm font-semibold">Pipeline visuel</div>
          <div className="relative rounded-xl border border-white/10 bg-black/20 p-6">
            <div className="flex items-start justify-between gap-6">
              {STAGES.map((stage, idx) => {
                const metrics = stageMetrics[stage] || { latency: 0, errorRate: 0, throughput: 0, activeRequests: 0 }
                const healthColor = getHealthColor(metrics.errorRate)
                const healthClass = getHealthIndicatorClass(metrics.errorRate)
                
                return (
                  <div key={stage} className="flex flex-1 items-center gap-6">
                    <div className="relative flex flex-1 flex-col items-center gap-2">
                      <div className={`relative flex h-24 w-24 items-center justify-center rounded-xl border-2 transition-all duration-300 ${getStageColor(stage)}`}>
                        <Activity 
                          size={32} 
                          className={metrics.activeRequests > 0 ? 'animate-pulse' : ''} 
                        />
                        {metrics.activeRequests > 0 && (
                          <div className="absolute -top-2 -right-2 flex h-6 w-6 items-center justify-center rounded-full bg-blue-500 text-xs font-bold animate-pulse">
                            {metrics.activeRequests}
                          </div>
                        )}
                        <div className={`absolute -bottom-1 -right-1 h-3 w-3 rounded-full ${healthColor} transition-all duration-500`} />
                      </div>
                      
                      <div className="text-xs font-semibold capitalize">{stage}</div>
                      
                      <div className={`flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] transition-colors duration-300 ${healthClass}`}>
                        <div className={`h-1.5 w-1.5 rounded-full ${healthColor}`} />
                        <span>
                          {metrics.errorRate === 0 ? 'Healthy' : 
                           metrics.errorRate < 0.1 ? 'Warning' : 'Error'}
                        </span>
                      </div>
                      
                      <div className="mt-1 space-y-0.5 text-center">
                        <div className="flex items-center gap-1 text-[11px] text-white/60 transition-all duration-300">
                          <span className="font-mono">{metrics.latency.toFixed(0)}ms</span>
                          <span className="text-white/40">latency</span>
                        </div>
                        <div className="flex items-center gap-1 text-[11px] text-white/60 transition-all duration-300">
                          <TrendingUp size={10} className="text-emerald-400" />
                          <span className="font-mono">{metrics.throughput.toFixed(2)}</span>
                          <span className="text-white/40">req/s</span>
                        </div>
                        <div className="text-[11px] text-white/40 transition-all duration-300">
                          {(metrics.errorRate * 100).toFixed(1)}% err
                        </div>
                      </div>
                    </div>
                    
                    {idx < STAGES.length - 1 && (
                      <div className="relative flex-shrink-0">
                        <ArrowRight size={24} className="text-white/30" />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
            
            <svg 
              className="absolute top-0 left-0 h-full w-full pointer-events-none" 
              style={{ zIndex: 10 }}
            >
              {animatedRequests.map((req) => {
                const stageWidth = 100 / STAGES.length
                const startX = req.stage * stageWidth + stageWidth / 2
                const endX = (req.stage + 1) * stageWidth + stageWidth / 2
                const currentX = startX + (endX - startX) * req.progress
                
                return (
                  <g key={req.id}>
                    <circle
                      cx={`${currentX}%`}
                      cy="50%"
                      r="6"
                      fill="#3b82f6"
                      opacity="0.8"
                      className="animate-pulse"
                    >
                      <animate
                        attributeName="r"
                        values="6;8;6"
                        dur="1s"
                        repeatCount="indefinite"
                      />
                    </circle>
                    <circle
                      cx={`${currentX}%`}
                      cy="50%"
                      r="12"
                      fill="none"
                      stroke="#3b82f6"
                      strokeWidth="2"
                      opacity="0.3"
                    >
                      <animate
                        attributeName="r"
                        values="12;16;12"
                        dur="1s"
                        repeatCount="indefinite"
                      />
                      <animate
                        attributeName="opacity"
                        values="0.3;0.1;0.3"
                        dur="1s"
                        repeatCount="indefinite"
                      />
                    </circle>
                  </g>
                )
              })}
            </svg>
          </div>
        </div>

        {droppedRequests.length > 0 && (
          <div className="mb-6">
            <div className="mb-3 text-sm font-semibold">Dropped Requests Summary</div>
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4">
                <div className="text-xs text-white/60 mb-2">Drops by Layer</div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Auth (QoS)</span>
                    <span className="font-mono text-lg font-bold text-yellow-300">{dropsByLayer.auth}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Audit (SI-10)</span>
                    <span className="font-mono text-lg font-bold text-rose-300">{dropsByLayer.audit}</span>
                  </div>
                </div>
              </div>
              
              <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4">
                <div className="text-xs text-white/60 mb-2">Drops by Extension</div>
                <div className="space-y-2 max-h-20 overflow-y-auto">
                  {Object.entries(dropsByExtension).map(([extId, count]) => (
                    <div key={extId} className="flex items-center justify-between">
                      <span className="text-sm truncate flex-1">{extId}</span>
                      <span className="font-mono text-sm font-bold text-rose-300 ml-2">{count}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="mb-3 flex items-center justify-between">
          <div className="text-sm font-semibold">Requêtes récentes</div>
          <div className="text-xs text-white/60">{recentRequests.length} requêtes</div>
        </div>

        <div className="space-y-2">
          {recentRequests.map((req) => {
            const isDropped = req.status === 'rejected' && !!req.dropLayer
            const isExpanded = expandedRequest === req.requestId
            
            return (
              <div 
                key={req.requestId} 
                className={`rounded-xl border p-4 transition-all ${
                  isDropped 
                    ? 'border-rose-500/30 bg-rose-500/5 hover:border-rose-500/50' 
                    : 'border-white/10 bg-black/20 hover:border-white/20'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      {getStatusIcon(req.status, isDropped)}
                      <span className="font-mono text-xs text-white/60">{req.requestId}</span>
                      <span className={`rounded-md border px-2 py-0.5 text-xs ${getStageColor(req.stage)}`}>
                        {req.stage}
                      </span>
                      {isDropped && getDropLayerBadge(req.dropLayer)}
                    </div>
                    <div className="mt-2 flex items-center gap-3 text-sm">
                      <span className="font-medium">{req.extensionId}</span>
                      <span className="text-white/40">→</span>
                      <span className="rounded-md bg-white/5 px-2 py-0.5 font-mono text-xs">{req.type}</span>
                      <span className="text-white/40">.</span>
                      <span className="rounded-md bg-white/5 px-2 py-0.5 font-mono text-xs">{req.operation}</span>
                    </div>
                  </div>
                  <div className="text-right flex items-start gap-2">
                    <div>
                      <div className="font-mono text-xs text-white/60">{formatTime(req.timestamp)}</div>
                      <div className={`mt-1 text-xs font-medium ${
                        req.status === 'completed' || req.status === 'approved' ? 'text-emerald-400' :
                        req.status === 'rejected' || req.status === 'failed' ? 'text-rose-400' :
                        'text-blue-400'
                      }`}>
                        {req.status}
                      </div>
                    </div>
                    {isDropped && (
                      <button
                        type="button"
                        onClick={() => setExpandedRequest(isExpanded ? null : req.requestId)}
                        className="rounded-md border border-white/10 bg-white/5 p-1 hover:bg-white/10 transition-colors"
                      >
                        {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </button>
                    )}
                  </div>
                </div>
                
                {isDropped && isExpanded && (
                  <div className="mt-4 pt-4 border-t border-rose-500/20">
                    <div className="text-xs font-semibold mb-2 text-rose-300">Rejection Details</div>
                    <div className="space-y-2">
                      <div className="flex items-start gap-2">
                        <span className="text-xs text-white/40 w-24">Drop Layer:</span>
                        <span className="text-xs font-mono text-white/80 capitalize">{req.dropLayer}</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="text-xs text-white/40 w-24">Reason:</span>
                        <span className="text-xs font-mono text-white/80 flex-1">{req.dropReason || 'No reason provided'}</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="text-xs text-white/40 w-24">Timestamp:</span>
                        <span className="text-xs font-mono text-white/80">{new Date(req.timestamp).toISOString()}</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="text-xs text-white/40 w-24">Request ID:</span>
                        <span className="text-xs font-mono text-white/80">{req.requestId}</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="text-xs text-white/40 w-24">Extension:</span>
                        <span className="text-xs font-mono text-white/80">{req.extensionId}</span>
                      </div>
                      {req.dropLayer === 'auth' && (
                        <div className="mt-3 rounded-md bg-yellow-500/10 border border-yellow-500/30 p-2">
                          <div className="text-xs text-yellow-300">
                            <strong>QoS Violation:</strong> Request exceeded rate limit defined in extension capabilities.
                          </div>
                        </div>
                      )}
                      {req.dropLayer === 'audit' && (
                        <div className="mt-3 rounded-md bg-rose-500/10 border border-rose-500/30 p-2">
                          <div className="text-xs text-rose-300">
                            <strong>SI-10 Violation:</strong> Request violated input validation or security policy checks.
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
          {recentRequests.length === 0 && !loading ? (
            <div className="rounded-xl border border-white/10 bg-black/20 p-8 text-center text-sm text-white/60">
              Aucune requête récente
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
