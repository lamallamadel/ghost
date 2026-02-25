import { useCallback, useEffect, useState } from 'react'
import { Package, CheckCircle, XCircle, Clock, ShieldCheck, AlertTriangle, TrendingUp, Activity, Zap, Skull, RotateCw, Timer, History, Cpu, MemoryStick, BarChart3, Network, FileText, GitBranch, Terminal, Gauge, HardDrive } from 'lucide-react'
import { ghost } from '@/ipc/ghost'
import type { GatewayState, TrafficPolicerState, ManualOverrideRequest, RuntimeHealthState, ExtensionInfo } from '@/ipc/types'
import { useToastsStore } from '@/stores/useToastsStore'
import { ExtensionMetricsChart } from '@/components/ExtensionMetricsChart'

function HealthBadge({ health }: { health: RuntimeHealthState }) {
  const configs = {
    healthy: {
      icon: Zap,
      containerClass: 'border-emerald-500/30 bg-emerald-500/10',
      iconClass: 'text-emerald-400',
      textClass: 'text-emerald-300',
      label: 'Healthy',
    },
    degraded: {
      icon: AlertTriangle,
      containerClass: 'border-yellow-500/30 bg-yellow-500/10',
      iconClass: 'text-yellow-400',
      textClass: 'text-yellow-300',
      label: 'Degraded',
    },
    crashed: {
      icon: Skull,
      containerClass: 'border-rose-500/30 bg-rose-500/10',
      iconClass: 'text-rose-400',
      textClass: 'text-rose-300',
      label: 'Crashed',
    },
    restarting: {
      icon: RotateCw,
      containerClass: 'border-blue-500/30 bg-blue-500/10',
      iconClass: 'text-blue-400 animate-spin',
      textClass: 'text-blue-300',
      label: 'Restarting',
    },
  }

  const config = configs[health]
  const Icon = config.icon

  return (
    <div className={`flex items-center gap-1.5 rounded-md border px-2 py-1 ${config.containerClass}`}>
      <Icon size={12} className={config.iconClass} />
      <span className={`text-xs font-semibold ${config.textClass}`}>{config.label}</span>
    </div>
  )
}

function HealthTrendSparkline({ trend }: { trend: number[] }) {
  if (trend.length === 0) return null

  const max = Math.max(...trend, 1)
  const points = trend.map((val, idx) => {
    const x = (idx / (trend.length - 1 || 1)) * 100
    const y = 100 - (val / max) * 100
    return `${x},${y}`
  }).join(' ')

  const avgSuccessRate = trend.reduce((a, b) => a + b, 0) / trend.length
  
  const colorConfig = avgSuccessRate >= 95 
    ? { stroke: '#34d399', textClass: 'text-emerald-400' }
    : avgSuccessRate >= 80 
    ? { stroke: '#fbbf24', textClass: 'text-yellow-400' }
    : { stroke: '#fb7185', textClass: 'text-rose-400' }

  return (
    <div className="flex items-center gap-3">
      <svg width="80" height="24" viewBox="0 0 100 100" preserveAspectRatio="none" className="opacity-80">
        <polyline
          points={points}
          fill="none"
          stroke={colorConfig.stroke}
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className={`font-mono text-xs ${colorConfig.textClass}`}>{avgSuccessRate.toFixed(1)}%</span>
    </div>
  )
}

function formatUptime(uptimeMs: number): string {
  const seconds = Math.floor(uptimeMs / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (days > 0) return `${days}d ${hours % 24}h`
  if (hours > 0) return `${hours}h ${minutes % 60}m`
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`
  return `${seconds}s`
}

function RuntimeHealthSection({ ext }: { ext: ExtensionInfo }) {
  const runtime = ext.runtimeState
  if (!runtime) return null

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-2 text-xs font-semibold text-white/60">Runtime Health</div>
        <div className="space-y-3 rounded-lg border border-white/10 bg-black/30 p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-white/60">Status</span>
            <HealthBadge health={runtime.health} />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs text-white/60">
              <Timer size={14} />
              <span>Uptime</span>
            </div>
            <span className="font-mono text-sm text-emerald-400">{formatUptime(runtime.uptime)}</span>
          </div>

          {runtime.lastRestartTimestamp && (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs text-white/60">
                <History size={14} />
                <span>Last Restart</span>
              </div>
              <span className="text-xs text-white/60">
                {new Date(runtime.lastRestartTimestamp).toLocaleString('fr-FR')}
              </span>
            </div>
          )}

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs text-white/60">
              <Skull size={14} />
              <span>Crash Count</span>
            </div>
            <span className={`font-mono text-sm font-semibold ${runtime.crashCount > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
              {runtime.crashCount}
            </span>
          </div>

          <div className="border-t border-white/10 pt-3">
            <div className="mb-2 text-xs font-semibold text-white/60">Process Isolation</div>
            <div className="space-y-2">
              {runtime.processIsolation.pid && (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs text-white/60">
                    <Cpu size={14} />
                    <span>PID</span>
                  </div>
                  <span className="font-mono text-xs text-blue-400">{runtime.processIsolation.pid}</span>
                </div>
              )}
              {runtime.processIsolation.memoryUsageMB !== undefined && (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs text-white/60">
                    <MemoryStick size={14} />
                    <span>Memory</span>
                  </div>
                  <span className="font-mono text-xs text-purple-400">
                    {runtime.processIsolation.memoryUsageMB.toFixed(1)} MB
                  </span>
                </div>
              )}
            </div>
          </div>

          {runtime.healthTrend.length > 0 && (
            <div className="border-t border-white/10 pt-3">
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-white/60">
                <Activity size={14} />
                <span>Success Rate Trend</span>
              </div>
              <HealthTrendSparkline trend={runtime.healthTrend} />
            </div>
          )}

          {runtime.restartHistory.length > 0 && (
            <div className="border-t border-white/10 pt-3">
              <div className="mb-2 text-xs font-semibold text-white/60">Restart History</div>
              <div className="space-y-2">
                {runtime.restartHistory.slice(0, 5).map((restart, idx) => (
                  <div key={idx} className="rounded border border-white/10 bg-white/5 p-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-white/60">
                        {new Date(restart.timestamp).toLocaleString('fr-FR')}
                      </span>
                      {restart.exitCode !== undefined && (
                        <span className="font-mono text-xs text-rose-400">
                          Exit: {restart.exitCode}
                        </span>
                      )}
                    </div>
                    <div className="mt-1 text-xs text-white/80">{restart.reason}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function MetricsDashboard({ ext }: { ext: ExtensionInfo }) {
  const metrics = ext.stats.metrics
  if (!metrics) return null

  const hasAnyMetrics = metrics.latency || metrics.throughputHistory || metrics.intentBreakdown || metrics.rateLimitCompliance || metrics.requestSizeStats

  if (!hasAnyMetrics) return null

  return (
    <div className="space-y-4">
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-white/60">
        <BarChart3 size={14} />
        <span>I/O Performance Metrics</span>
      </div>

      {metrics.latency && (
        <div className="rounded-lg border border-white/10 bg-black/30 p-4">
          <div className="mb-3 text-xs font-semibold text-white/60">Average Latency</div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <div className="mb-1 text-xs text-white/40">p50 (Median)</div>
              <div className="font-mono text-lg font-semibold text-blue-400">
                {metrics.latency.p50.toFixed(1)}<span className="text-xs text-white/40">ms</span>
              </div>
            </div>
            <div>
              <div className="mb-1 text-xs text-white/40">p95</div>
              <div className="font-mono text-lg font-semibold text-yellow-400">
                {metrics.latency.p95.toFixed(1)}<span className="text-xs text-white/40">ms</span>
              </div>
            </div>
            <div>
              <div className="mb-1 text-xs text-white/40">p99</div>
              <div className="font-mono text-lg font-semibold text-rose-400">
                {metrics.latency.p99.toFixed(1)}<span className="text-xs text-white/40">ms</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {metrics.throughputHistory && metrics.throughputHistory.length > 0 && (
        <ExtensionMetricsChart
          data={metrics.throughputHistory}
          title="Request Throughput (Last 15 Minutes)"
          color="#3b82f6"
          height={100}
        />
      )}

      {metrics.intentBreakdown && (
        <div className="rounded-lg border border-white/10 bg-black/30 p-4">
          <div className="mb-3 text-xs font-semibold text-white/60">Intent Type Breakdown</div>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText size={14} className="text-purple-400" />
                <span className="text-xs text-white/60">Filesystem</span>
              </div>
              <span className="font-mono text-sm font-semibold text-purple-400">
                {metrics.intentBreakdown.filesystem}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Network size={14} className="text-blue-400" />
                <span className="text-xs text-white/60">Network</span>
              </div>
              <span className="font-mono text-sm font-semibold text-blue-400">
                {metrics.intentBreakdown.network}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <GitBranch size={14} className="text-orange-400" />
                <span className="text-xs text-white/60">Git</span>
              </div>
              <span className="font-mono text-sm font-semibold text-orange-400">
                {metrics.intentBreakdown.git}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Terminal size={14} className="text-cyan-400" />
                <span className="text-xs text-white/60">Process</span>
              </div>
              <span className="font-mono text-sm font-semibold text-cyan-400">
                {metrics.intentBreakdown.process}
              </span>
            </div>
          </div>
        </div>
      )}

      {metrics.rateLimitCompliance && (
        <div className="rounded-lg border border-white/10 bg-black/30 p-4">
          <div className="mb-3 flex items-center gap-2 text-xs font-semibold text-white/60">
            <Gauge size={14} />
            <span>Rate Limit Compliance</span>
          </div>
          <div className="space-y-3">
            <div>
              <div className="mb-2 flex items-center justify-between text-xs">
                <span className="text-emerald-400">Green (Normal)</span>
                <span className="font-mono text-emerald-400">
                  {((metrics.rateLimitCompliance.green / (metrics.rateLimitCompliance.green + metrics.rateLimitCompliance.yellow + metrics.rateLimitCompliance.red)) * 100 || 0).toFixed(1)}%
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-500"
                  style={{ 
                    width: `${((metrics.rateLimitCompliance.green / (metrics.rateLimitCompliance.green + metrics.rateLimitCompliance.yellow + metrics.rateLimitCompliance.red)) * 100 || 0)}%` 
                  }}
                />
              </div>
            </div>
            <div>
              <div className="mb-2 flex items-center justify-between text-xs">
                <span className="text-yellow-400">Yellow (Warning)</span>
                <span className="font-mono text-yellow-400">
                  {((metrics.rateLimitCompliance.yellow / (metrics.rateLimitCompliance.green + metrics.rateLimitCompliance.yellow + metrics.rateLimitCompliance.red)) * 100 || 0).toFixed(1)}%
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full bg-gradient-to-r from-yellow-500 to-yellow-400 transition-all duration-500"
                  style={{ 
                    width: `${((metrics.rateLimitCompliance.yellow / (metrics.rateLimitCompliance.green + metrics.rateLimitCompliance.yellow + metrics.rateLimitCompliance.red)) * 100 || 0)}%` 
                  }}
                />
              </div>
            </div>
            <div>
              <div className="mb-2 flex items-center justify-between text-xs">
                <span className="text-rose-400">Red (Throttled)</span>
                <span className="font-mono text-rose-400">
                  {((metrics.rateLimitCompliance.red / (metrics.rateLimitCompliance.green + metrics.rateLimitCompliance.yellow + metrics.rateLimitCompliance.red)) * 100 || 0).toFixed(1)}%
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full bg-gradient-to-r from-rose-500 to-rose-400 transition-all duration-500"
                  style={{ 
                    width: `${((metrics.rateLimitCompliance.red / (metrics.rateLimitCompliance.green + metrics.rateLimitCompliance.yellow + metrics.rateLimitCompliance.red)) * 100 || 0)}%` 
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {metrics.requestSizeStats && (
        <div className="rounded-lg border border-white/10 bg-black/30 p-4">
          <div className="mb-3 flex items-center gap-2 text-xs font-semibold text-white/60">
            <HardDrive size={14} />
            <span>Request Size Statistics</span>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="mb-1 text-xs text-white/40">Avg Request Size</div>
              <div className="font-mono text-lg font-semibold text-purple-400">
                {(metrics.requestSizeStats.avgRequestBytes / 1024).toFixed(2)}
                <span className="text-xs text-white/40"> KB</span>
              </div>
            </div>
            <div>
              <div className="mb-1 text-xs text-white/40">Avg Response Size</div>
              <div className="font-mono text-lg font-semibold text-cyan-400">
                {(metrics.requestSizeStats.avgResponseBytes / 1024).toFixed(2)}
                <span className="text-xs text-white/40"> KB</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function TokenBucketVisualization({ state }: { state: TrafficPolicerState }) {
  const committedPercent = (state.committedTokens / state.committedCapacity) * 100
  const excessPercent = (state.excessTokens / state.excessCapacity) * 100
  const cirDisplay = `${state.cir} req/min`

  return (
    <div className="space-y-3">
      <div>
        <div className="mb-1 flex items-center justify-between text-xs">
          <span className="text-white/60">Bc (Committed)</span>
          <span className="font-mono text-emerald-400">{Math.floor(state.committedTokens)}/{state.committedCapacity}</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-500"
            style={{ width: `${committedPercent}%` }}
          />
        </div>
      </div>
      <div>
        <div className="mb-1 flex items-center justify-between text-xs">
          <span className="text-white/60">Be (Excess)</span>
          <span className="font-mono text-yellow-400">{Math.floor(state.excessTokens)}/{state.excessCapacity}</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full bg-gradient-to-r from-yellow-500 to-yellow-400 transition-all duration-500"
            style={{ width: `${excessPercent}%` }}
          />
        </div>
      </div>
      <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-3 py-2">
        <div className="flex items-center gap-2 text-xs text-white/60">
          <TrendingUp size={14} />
          <span>CIR</span>
        </div>
        <span className="font-mono text-xs text-blue-400">{cirDisplay}</span>
      </div>
    </div>
  )
}

function ManualOverrideDialog({
  extensionId,
  onClose,
  onApprove,
}: {
  extensionId: string
  onClose: () => void
  onApprove: (req: ManualOverrideRequest) => void
}) {
  const [formData, setFormData] = useState({
    type: 'filesystem',
    operation: 'read',
    reason: '',
    params: '{}',
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    try {
      const params = JSON.parse(formData.params)
      onApprove({
        extensionId,
        type: formData.type,
        operation: formData.operation,
        reason: formData.reason,
        params,
      })
    } catch {
      alert('Params JSON invalide')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-2xl border border-white/20 bg-[rgb(var(--gc-bg))] p-6 shadow-2xl">
        <div className="mb-4 flex items-center gap-3">
          <ShieldCheck size={24} className="text-yellow-400" />
          <div>
            <div className="text-lg font-semibold">SI-10(1) Manual Override</div>
            <div className="text-xs text-white/60">Approbation exceptionnelle pour {extensionId}</div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs text-white/60">Type</label>
            <select
              value={formData.type}
              onChange={(e) => setFormData({ ...formData, type: e.target.value })}
              className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm"
            >
              <option value="filesystem">filesystem</option>
              <option value="network">network</option>
              <option value="git">git</option>
              <option value="process">process</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs text-white/60">Operation</label>
            <input
              type="text"
              value={formData.operation}
              onChange={(e) => setFormData({ ...formData, operation: e.target.value })}
              className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm"
              placeholder="read, write, http, etc."
            />
          </div>

          <div>
            <label className="mb-1 block text-xs text-white/60">Raison (audit)</label>
            <textarea
              value={formData.reason}
              onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
              className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm"
              rows={3}
              placeholder="Justification obligatoire pour l'audit SI-10(1)..."
              required
            />
          </div>

          <div>
            <label className="mb-1 block text-xs text-white/60">Params (JSON)</label>
            <textarea
              value={formData.params}
              onChange={(e) => setFormData({ ...formData, params: e.target.value })}
              className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 font-mono text-xs"
              rows={4}
              placeholder='{"path": "/example", "content": "..."}'
            />
          </div>

          <div className="flex items-center gap-3 rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3">
            <AlertTriangle size={20} className="text-yellow-400" />
            <div className="text-xs text-yellow-200">
              Cette action sera enregistrée dans l'audit trail avec votre justification.
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm hover:bg-white/10"
            >
              Annuler
            </button>
            <button
              type="submit"
              className="rounded-lg bg-yellow-500 px-4 py-2 text-sm font-semibold text-black hover:bg-yellow-400"
            >
              Approuver Override
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export function ExtensionsTab() {
  const pushToast = useToastsStore((s) => s.push)
  const [state, setState] = useState<GatewayState | null>(null)
  const [loading, setLoading] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [overrideExtId, setOverrideExtId] = useState<string | null>(null)

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
    const interval = setInterval(load, 3000)
    return () => clearInterval(interval)
  }, [load])

  async function handleManualOverride(req: ManualOverrideRequest) {
    try {
      const result = await ghost.manualOverride(req)
      if (result.approved) {
        pushToast({ title: 'Override approuvé', message: `Audit ID: ${result.auditLogId}`, tone: 'success' })
        setOverrideExtId(null)
        load()
      } else {
        pushToast({ title: 'Override refusé', message: result.reason || 'Erreur', tone: 'danger' })
      }
    } catch (e) {
      pushToast({ title: 'Erreur override', message: String(e), tone: 'danger' })
    }
  }

  const extensions = state?.extensions || []

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-white/10 bg-white/5 px-4 py-3 backdrop-blur">
        <div>
          <div className="text-sm font-semibold">Extensions chargées</div>
          <div className="text-xs text-white/60">Manifestes, stats I/O, et gouvernance QoS</div>
        </div>
        <div className="flex items-center gap-2">
          <div className="rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/60">
            {extensions.length} extension{extensions.length !== 1 ? 's' : ''}
          </div>
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

        <div className="space-y-3">
          {extensions.map((ext) => {
            const isExpanded = expandedId === ext.manifest.id
            const hasTrafficPolicer = !!ext.trafficPolicerState

            return (
              <div key={ext.manifest.id} className="rounded-xl border border-white/10 bg-black/20 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                      <Package size={20} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{ext.manifest.name}</span>
                        <span className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 font-mono text-xs text-white/60">
                          v{ext.manifest.version}
                        </span>
                        {ext.runtimeState && <HealthBadge health={ext.runtimeState.health} />}
                      </div>
                      <div className="mt-1 font-mono text-xs text-white/60">{ext.manifest.id}</div>

                      <div className="mt-3 flex items-center gap-4">
                        <div className="flex items-center gap-2">
                          <CheckCircle size={14} className="text-emerald-400" />
                          <span className="text-xs text-white/60">Approuvées:</span>
                          <span className="font-mono text-sm font-semibold text-emerald-400">{ext.stats.requestsApproved}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <XCircle size={14} className="text-rose-400" />
                          <span className="text-xs text-white/60">Rejetées:</span>
                          <span className="font-mono text-sm font-semibold text-rose-400">{ext.stats.requestsRejected}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Clock size={14} className="text-yellow-400" />
                          <span className="text-xs text-white/60">Rate-limited:</span>
                          <span className="font-mono text-sm font-semibold text-yellow-400">{ext.stats.requestsRateLimited}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setOverrideExtId(ext.manifest.id)}
                      className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-xs font-semibold text-yellow-300 hover:bg-yellow-500/20"
                    >
                      Manual Override
                    </button>
                    <button
                      type="button"
                      onClick={() => setExpandedId(isExpanded ? null : ext.manifest.id)}
                      className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs hover:bg-white/10"
                    >
                      {isExpanded ? 'Masquer' : 'Détails'}
                    </button>
                  </div>
                </div>

                {isExpanded ? (
                  <div className="mt-4 space-y-4 border-t border-white/10 pt-4">
                    <RuntimeHealthSection ext={ext} />

                    <MetricsDashboard ext={ext} />

                    <div>
                      <div className="mb-2 text-xs font-semibold text-white/60">Capabilities</div>
                      <div className="space-y-2">
                        {ext.manifest.capabilities?.filesystem ? (
                          <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                            <div className="mb-1 text-xs font-medium">Filesystem</div>
                            {ext.manifest.capabilities.filesystem.read?.length ? (
                              <div className="text-xs text-white/60">
                                Read: {ext.manifest.capabilities.filesystem.read.join(', ')}
                              </div>
                            ) : null}
                            {ext.manifest.capabilities.filesystem.write?.length ? (
                              <div className="text-xs text-white/60">
                                Write: {ext.manifest.capabilities.filesystem.write.join(', ')}
                              </div>
                            ) : null}
                          </div>
                        ) : null}

                        {ext.manifest.capabilities?.network ? (
                          <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                            <div className="mb-1 text-xs font-medium">Network</div>
                            {ext.manifest.capabilities.network.allowlist?.length ? (
                              <div className="text-xs text-white/60">
                                Allowlist: {ext.manifest.capabilities.network.allowlist.join(', ')}
                              </div>
                            ) : null}
                            {ext.manifest.capabilities.network.rateLimit ? (
                              <div className="text-xs text-white/60">
                                Rate Limit: CIR={ext.manifest.capabilities.network.rateLimit.cir}, BC={ext.manifest.capabilities.network.rateLimit.bc}
                              </div>
                            ) : null}
                          </div>
                        ) : null}

                        {ext.manifest.capabilities?.git ? (
                          <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                            <div className="mb-1 text-xs font-medium">Git</div>
                            <div className="text-xs text-white/60">
                              Read: {ext.manifest.capabilities.git.read ? '✓' : '✗'} | 
                              Write: {ext.manifest.capabilities.git.write ? '✓' : '✗'}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    </div>

                    {ext.manifest.permissions?.length ? (
                      <div>
                        <div className="mb-2 text-xs font-semibold text-white/60">Permissions</div>
                        <div className="flex flex-wrap gap-2">
                          {ext.manifest.permissions.map((perm) => (
                            <span key={perm} className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs">
                              {perm}
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {hasTrafficPolicer && ext.trafficPolicerState ? (
                      <div>
                        <div className="mb-2 text-xs font-semibold text-white/60">Traffic Policing (2r3c Token Bucket)</div>
                        <div className="rounded-lg border border-white/10 bg-black/30 p-4">
                          <TokenBucketVisualization state={ext.trafficPolicerState} />
                        </div>
                      </div>
                    ) : null}

                    {ext.stats.lastActivity ? (
                      <div className="text-xs text-white/40">
                        Dernière activité: {new Date(ext.stats.lastActivity).toLocaleString('fr-FR')}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            )
          })}

          {extensions.length === 0 && !loading ? (
            <div className="rounded-xl border border-white/10 bg-black/20 p-8 text-center text-sm text-white/60">
              Aucune extension chargée
            </div>
          ) : null}
        </div>
      </div>

      {overrideExtId ? (
        <ManualOverrideDialog
          extensionId={overrideExtId}
          onClose={() => setOverrideExtId(null)}
          onApprove={handleManualOverride}
        />
      ) : null}
    </div>
  )
}
