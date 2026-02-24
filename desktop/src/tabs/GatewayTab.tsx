import { useCallback, useEffect, useState } from 'react'
import { Activity, ArrowRight, CheckCircle, XCircle, AlertCircle } from 'lucide-react'
import { ghost } from '@/ipc/ghost'
import type { GatewayState } from '@/ipc/types'
import { useToastsStore } from '@/stores/useToastsStore'

export function GatewayTab() {
  const pushToast = useToastsStore((s) => s.push)
  const [state, setState] = useState<GatewayState | null>(null)
  const [loading, setLoading] = useState(false)
  const [autoRefresh, setAutoRefresh] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await ghost.gatewayState()
      setState(res)
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
    if (!autoRefresh) return
    const interval = setInterval(load, 2000)
    return () => clearInterval(interval)
  }, [autoRefresh, load])

  function getStageColor(stage: string) {
    switch (stage) {
      case 'intercept': return 'bg-blue-500/20 text-blue-300 border-blue-500/30'
      case 'auth': return 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30'
      case 'audit': return 'bg-purple-500/20 text-purple-300 border-purple-500/30'
      case 'execute': return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
      default: return 'bg-white/10 text-white/60 border-white/20'
    }
  }

  function getStatusIcon(status: string) {
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

  const recentRequests = state?.recentRequests || []

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-white/10 bg-white/5 px-4 py-3 backdrop-blur">
        <div>
          <div className="text-sm font-semibold">Pipeline I/O</div>
          <div className="text-xs text-white/60">Flux en temps réel: Extension → Intercept → Auth → Audit → Execute</div>
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
          <div className="flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-black/20 p-6">
            {['Extension', 'Intercept', 'Auth', 'Audit', 'Execute'].map((stage, idx) => (
              <div key={stage} className="flex items-center gap-4">
                <div className="flex flex-col items-center gap-2">
                  <div className={`flex h-16 w-16 items-center justify-center rounded-xl border ${getStageColor(stage.toLowerCase())}`}>
                    <Activity size={24} className={idx === 0 || recentRequests.some(r => r.stage === stage.toLowerCase()) ? 'animate-pulse' : ''} />
                  </div>
                  <div className="text-xs font-medium">{stage}</div>
                  <div className="text-[11px] text-white/40">
                    {stage === 'Extension' ? `${state?.extensions.length || 0} ext` : 
                     recentRequests.filter(r => r.stage === stage.toLowerCase()).length}
                  </div>
                </div>
                {idx < 4 ? (
                  <ArrowRight size={20} className="text-white/30" />
                ) : null}
              </div>
            ))}
          </div>
        </div>

        <div className="mb-3 flex items-center justify-between">
          <div className="text-sm font-semibold">Requêtes récentes</div>
          <div className="text-xs text-white/60">{recentRequests.length} requêtes</div>
        </div>

        <div className="space-y-2">
          {recentRequests.map((req) => (
            <div key={req.requestId} className="rounded-xl border border-white/10 bg-black/20 p-4 transition-all hover:border-white/20">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    {getStatusIcon(req.status)}
                    <span className="font-mono text-xs text-white/60">{req.requestId}</span>
                    <span className={`rounded-md border px-2 py-0.5 text-xs ${getStageColor(req.stage)}`}>
                      {req.stage}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center gap-3 text-sm">
                    <span className="font-medium">{req.extensionId}</span>
                    <span className="text-white/40">→</span>
                    <span className="rounded-md bg-white/5 px-2 py-0.5 font-mono text-xs">{req.type}</span>
                    <span className="text-white/40">.</span>
                    <span className="rounded-md bg-white/5 px-2 py-0.5 font-mono text-xs">{req.operation}</span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-xs text-white/60">{formatTime(req.timestamp)}</div>
                  <div className={`mt-1 text-xs font-medium ${
                    req.status === 'completed' || req.status === 'approved' ? 'text-emerald-400' :
                    req.status === 'rejected' || req.status === 'failed' ? 'text-rose-400' :
                    'text-blue-400'
                  }`}>
                    {req.status}
                  </div>
                </div>
              </div>
            </div>
          ))}
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
