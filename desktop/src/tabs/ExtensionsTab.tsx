import { useCallback, useEffect, useState } from 'react'
import { Package, CheckCircle, XCircle, Clock, ShieldCheck, AlertTriangle, TrendingUp } from 'lucide-react'
import { ghost } from '@/ipc/ghost'
import type { GatewayState, TrafficPolicerState, ManualOverrideRequest } from '@/ipc/types'
import { useToastsStore } from '@/stores/useToastsStore'

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
