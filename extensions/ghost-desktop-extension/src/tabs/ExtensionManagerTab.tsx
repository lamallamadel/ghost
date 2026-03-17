import { useCallback, useEffect, useMemo, useState } from 'react'
import { Package, Power, RefreshCw, Edit2, X, Check, Shield, Info, Trash2, Search, ChevronDown } from 'lucide-react'
import { ghost } from '@/ipc/ghost'
import type { GatewayState, ExtensionInfo } from '@/ipc/types'
import { useToastsStore } from '@/stores/useToastsStore'

type EditableFields = {
  description?: string
  tags?: string[]
  category?: string
}

type CliModal = { command: string; title: string } | null

function CliSnippetModal({ command, title, onClose }: { command: string; title: string; onClose: () => void }) {
  function copy() {
    navigator.clipboard.writeText(command).catch(() => null)
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-white/20 bg-[rgb(var(--gc-bg))] p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="mb-4 text-sm font-semibold">{title}</div>
        <div className="mb-4 text-xs text-white/60">Exécuter dans votre terminal :</div>
        <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/30 px-3 py-2">
          <code className="flex-1 font-mono text-sm text-emerald-300 break-all">{command}</code>
          <button type="button" onClick={copy} className="shrink-0 text-xs text-white/60 hover:text-white">Copier</button>
        </div>
        <div className="mt-4 flex justify-end">
          <button type="button" onClick={onClose} className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm hover:bg-white/10">Fermer</button>
        </div>
      </div>
    </div>
  )
}

function UninstallConfirmModal({ name, onConfirm, onCancel }: { name: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={onCancel}>
      <div className="w-full max-w-md rounded-2xl border border-rose-500/20 bg-[rgb(var(--gc-bg))] p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="mb-2 text-sm font-semibold text-rose-400">Désinstaller {name} ?</div>
        <div className="mb-4 text-xs text-white/60">Cette action est irréversible.</div>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm hover:bg-white/10">Annuler</button>
          <button type="button" onClick={onConfirm} className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-sm font-semibold text-rose-300 hover:bg-rose-500/20">Désinstaller</button>
        </div>
      </div>
    </div>
  )
}

export function ExtensionManagerTab() {
  const pushToast = useToastsStore((s) => s.push)
  const [state, setState] = useState<GatewayState | null>(null)
  const [loading, setLoading] = useState(false)
  const [enabledExtensions, setEnabledExtensions] = useState<Set<string>>(new Set())
  const [editingExtension, setEditingExtension] = useState<string | null>(null)
  const [editedFields, setEditedFields] = useState<EditableFields>({})
  const [pendingEdits, setPendingEdits] = useState<Map<string, EditableFields>>(new Map())

  const [searchQuery, setSearchQuery] = useState('')
  const [cliModal, setCliModal] = useState<CliModal>(null)
  const [uninstallConfirm, setUninstallConfirm] = useState<string | null>(null)
  const [expandedPerms, setExpandedPerms] = useState<Set<string>>(new Set())
  const [expandedCaps, setExpandedCaps] = useState<Set<string>>(new Set())

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await ghost.gatewayState()
      setState(res)
      const enabled = new Set<string>()
      res.extensions.forEach(ext => enabled.add(ext.manifest.id))
      setEnabledExtensions(enabled)
    } catch (e) {
      pushToast({ title: 'État indisponible', message: String(e), tone: 'danger' })
    } finally {
      setLoading(false)
    }
  }, [pushToast])

  useEffect(() => {
    load()
  }, [load])

  function toggleExtension(extensionId: string, enabled: boolean) {
    setEnabledExtensions(prev => {
      const updated = new Set(prev)
      if (enabled) updated.add(extensionId)
      else updated.delete(extensionId)
      return updated
    })
    setCliModal({
      command: `ghost extension ${enabled ? 'enable' : 'disable'} ${extensionId}`,
      title: enabled ? 'Activer l\'extension' : 'Désactiver l\'extension',
    })
  }

  function startEditing(ext: ExtensionInfo) {
    setEditingExtension(ext.manifest.id)
    const existingEdits = pendingEdits.get(ext.manifest.id)
    const manifestWithMeta = ext.manifest as ExtensionInfo['manifest'] & { description?: string; tags?: string[]; category?: string }
    setEditedFields(existingEdits || {
      description: manifestWithMeta.description || '',
      tags: manifestWithMeta.tags || [],
      category: manifestWithMeta.category || ''
    })
  }

  function cancelEditing() {
    setEditingExtension(null)
    setEditedFields({})
  }

  function saveEditing() {
    if (!editingExtension) return
    setPendingEdits(prev => {
      const updated = new Map(prev)
      updated.set(editingExtension, { ...editedFields })
      return updated
    })
    pushToast({
      title: 'Modifications enregistrées',
      message: `Métadonnées de ${editingExtension} mises à jour`,
      tone: 'success'
    })
    setEditingExtension(null)
    setEditedFields({})
  }

  async function reloadExtension(extensionId: string) {
    try {
      const result = await ghost.reloadExtension(extensionId)
      if (result.success) {
        pushToast({ title: 'Extension rechargée', message: extensionId, tone: 'success' })
        await load()
      } else {
        pushToast({ title: 'Échec du rechargement', message: result.error || 'Erreur inconnue', tone: 'danger' })
      }
    } catch (e) {
      pushToast({ title: 'Erreur de rechargement', message: String(e), tone: 'danger' })
    }
  }

  async function reloadGateway() {
    try {
      pushToast({ title: 'Rechargement du gateway', message: 'Toutes les extensions vont être rechargées...', tone: 'info' })
      await load()
      pushToast({ title: 'Gateway rechargé', message: 'Toutes les extensions ont été rechargées', tone: 'success' })
    } catch (e) {
      pushToast({ title: 'Erreur de rechargement du gateway', message: String(e), tone: 'danger' })
    }
  }

  function confirmUninstall(extensionId: string) {
    setUninstallConfirm(extensionId)
  }

  function doUninstall() {
    if (!uninstallConfirm) return
    const id = uninstallConfirm
    setUninstallConfirm(null)
    setCliModal({ command: `ghost uninstall ${id}`, title: 'Désinstaller l\'extension' })
  }

  function toggleExpanded(id: string, type: 'perms' | 'caps') {
    const setter = type === 'perms' ? setExpandedPerms : setExpandedCaps
    setter(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const extensions = state?.extensions ?? []

  const filteredExtensions = useMemo(() => {
    const exts = state?.extensions ?? []
    if (!searchQuery.trim()) return exts
    const q = searchQuery.toLowerCase()
    return exts.filter(ext =>
      ext.manifest.name.toLowerCase().includes(q) ||
      ext.manifest.id.toLowerCase().includes(q) ||
      ((ext.manifest as ExtensionInfo['manifest'] & { category?: string }).category || '').toLowerCase().includes(q)
    )
  }, [state, searchQuery])

  function renderHealthBadge(ext: ExtensionInfo) {
    if (!ext.healthScore || !ext.healthBadge) return null
    const badge = ext.healthBadge
    const score = ext.healthScore
    return (
      <div
        className="flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium"
        style={{ borderColor: `${badge.color}30`, backgroundColor: `${badge.color}15`, color: badge.color }}
      >
        <Shield size={12} />
        <span>{badge.label}</span>
        <span className="opacity-70">{score}</span>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-white/10 bg-white/5 px-4 py-3 backdrop-blur">
        <div>
          <div className="text-sm font-semibold">Gestion des extensions</div>
          <div className="text-xs text-white/60">Configuration et état des extensions installées</div>
        </div>
        <div className="flex items-center gap-2">
          <div className="rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/60">
            {extensions.length} extension{extensions.length !== 1 ? 's' : ''}
          </div>
          <button type="button" onClick={load} className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm hover:bg-white/10">
            Actualiser
          </button>
          <button
            type="button"
            onClick={reloadGateway}
            className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm font-semibold text-emerald-300 hover:bg-emerald-500/20"
          >
            <RefreshCw size={14} />
            Reload Gateway
          </button>
        </div>
      </div>

      <div className="border-b border-white/10 bg-white/5 px-4 py-2">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Rechercher une extension..."
            className="w-full rounded-lg border border-white/10 bg-black/20 py-2 pl-9 pr-4 text-sm placeholder:text-white/40"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-4">
        {loading && !state ? (
          <div className="text-sm text-white/60">Chargement…</div>
        ) : null}

        <div className="space-y-3">
          {filteredExtensions.map((ext) => {
            const isEnabled = enabledExtensions.has(ext.manifest.id)
            const isEditing = editingExtension === ext.manifest.id
            const hasPendingEdits = pendingEdits.has(ext.manifest.id)
            const manifestWithMeta = ext.manifest as ExtensionInfo['manifest'] & { description?: string; tags?: string[]; category?: string }
            const currentFields = pendingEdits.get(ext.manifest.id) || {
              description: manifestWithMeta.description || '',
              tags: manifestWithMeta.tags || [],
              category: manifestWithMeta.category || ''
            }
            const isPermsExpanded = expandedPerms.has(ext.manifest.id)
            const isCapsExpanded = expandedCaps.has(ext.manifest.id)
            const permsList = ext.manifest.permissions || []
            const capsList = Object.keys(ext.manifest.capabilities || {})

            return (
              <div key={ext.manifest.id} className="rounded-xl border border-white/10 bg-black/20 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 flex-1">
                    <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                      <Package size={20} />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{ext.manifest.name}</span>
                        <span className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 font-mono text-xs text-white/60">
                          v{ext.manifest.version}
                        </span>
                        {hasPendingEdits && (
                          <span className="rounded-md border border-yellow-500/30 bg-yellow-500/10 px-2 py-0.5 text-xs text-yellow-300">
                            Modifié
                          </span>
                        )}
                        {renderHealthBadge(ext)}
                      </div>
                      <div className="mt-1 font-mono text-xs text-white/60">{ext.manifest.id}</div>

                      {!isEditing ? (
                        <div className="mt-3 space-y-2">
                          {currentFields.description && (
                            <div className="text-sm text-white/80">{currentFields.description}</div>
                          )}
                          {currentFields.category && (
                            <div className="text-xs text-white/60">
                              <span className="font-medium">Catégorie:</span> {currentFields.category}
                            </div>
                          )}
                          {currentFields.tags && currentFields.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {currentFields.tags.map((tag, idx) => (
                                <span key={idx} className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-xs">
                                  {tag}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="mt-3 space-y-3">
                          <div>
                            <label className="mb-1 block text-xs text-white/60">Description</label>
                            <input
                              type="text"
                              value={editedFields.description || ''}
                              onChange={(e) => setEditedFields({ ...editedFields, description: e.target.value })}
                              className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm"
                              placeholder="Description de l'extension"
                            />
                          </div>
                          <div>
                            <label className="mb-1 block text-xs text-white/60">Catégorie</label>
                            <input
                              type="text"
                              value={editedFields.category || ''}
                              onChange={(e) => setEditedFields({ ...editedFields, category: e.target.value })}
                              className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm"
                              placeholder="git, filesystem, network, etc."
                            />
                          </div>
                          <div>
                            <label className="mb-1 block text-xs text-white/60">Tags (séparés par des virgules)</label>
                            <input
                              type="text"
                              value={editedFields.tags?.join(', ') || ''}
                              onChange={(e) =>
                                setEditedFields({
                                  ...editedFields,
                                  tags: e.target.value.split(',').map(t => t.trim()).filter(Boolean)
                                })
                              }
                              className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm"
                              placeholder="tag1, tag2, tag3"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-start gap-2">
                    {!isEditing ? (
                      <>
                        <button
                          type="button"
                          onClick={() => toggleExtension(ext.manifest.id, !isEnabled)}
                          className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${
                            isEnabled
                              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20'
                              : 'border-white/20 bg-white/5 text-white/60 hover:bg-white/10'
                          }`}
                          title={isEnabled ? 'Désactiver' : 'Activer'}
                        >
                          <Power size={14} />
                          {isEnabled ? 'Activé' : 'Désactivé'}
                        </button>
                        <button
                          type="button"
                          onClick={() => startEditing(ext)}
                          className="rounded-lg border border-white/10 bg-white/5 p-2 text-xs hover:bg-white/10"
                          title="Modifier"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => reloadExtension(ext.manifest.id)}
                          className="rounded-lg border border-blue-500/30 bg-blue-500/10 p-2 text-xs text-blue-300 hover:bg-blue-500/20"
                          title="Recharger cette extension"
                        >
                          <RefreshCw size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => confirmUninstall(ext.manifest.id)}
                          className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-2 text-xs text-rose-300 hover:bg-rose-500/20"
                          title="Désinstaller"
                        >
                          <Trash2 size={14} />
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={saveEditing}
                          className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/20"
                        >
                          <Check size={14} />
                          Enregistrer
                        </button>
                        <button
                          type="button"
                          onClick={cancelEditing}
                          className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs hover:bg-white/10"
                        >
                          <X size={14} />
                          Annuler
                        </button>
                      </>
                    )}
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-4 gap-4 border-t border-white/10 pt-4">
                  <div>
                    <button
                      type="button"
                      onClick={() => toggleExpanded(ext.manifest.id, 'perms')}
                      className="flex w-full items-center gap-1 text-left text-xs text-white/40 hover:text-white/70 transition-colors"
                      title="Cliquer pour voir les permissions"
                    >
                      <span>Permissions · {permsList.length}</span>
                      <ChevronDown size={10} className={`transition-transform ${isPermsExpanded ? 'rotate-180' : ''}`} />
                    </button>
                    <div className="mt-1 font-mono text-sm font-semibold">{permsList.length}</div>
                    {isPermsExpanded && (
                      <ul className="mt-2 space-y-1">
                        {permsList.length > 0 ? permsList.map((p, i) => (
                          <li key={i} className="rounded bg-white/5 px-2 py-0.5 font-mono text-xs text-white/70">{p}</li>
                        )) : (
                          <li className="text-xs text-white/40">Aucune permission</li>
                        )}
                      </ul>
                    )}
                  </div>

                  <div>
                    <button
                      type="button"
                      onClick={() => toggleExpanded(ext.manifest.id, 'caps')}
                      className="flex w-full items-center gap-1 text-left text-xs text-white/40 hover:text-white/70 transition-colors"
                      title="Cliquer pour voir les capacités"
                    >
                      <span>Capacités · {capsList.length}</span>
                      <ChevronDown size={10} className={`transition-transform ${isCapsExpanded ? 'rotate-180' : ''}`} />
                    </button>
                    <div className="mt-1 font-mono text-sm font-semibold">{capsList.length}</div>
                    {isCapsExpanded && (
                      <ul className="mt-2 space-y-1">
                        {capsList.length > 0 ? capsList.map(key => (
                          <li key={key} className="rounded bg-white/5 px-2 py-0.5 font-mono text-xs text-white/70">{key}</li>
                        )) : (
                          <li className="text-xs text-white/40">Aucune capacité</li>
                        )}
                      </ul>
                    )}
                  </div>

                  <div>
                    <div className="text-xs text-white/40">Requêtes approuvées</div>
                    <div className="mt-1 font-mono text-sm font-semibold text-emerald-400">
                      {ext.stats.requestsApproved}
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center gap-1 text-xs text-white/40">
                      Score de santé
                      <span title="Score de santé basé sur : scan de sécurité, activité récente, note utilisateurs, compatibilité de version" className="cursor-help">
                        <Info size={11} className="opacity-60" />
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-1.5">
                      {ext.healthScore !== undefined ? (
                        <>
                          <div className="font-mono text-sm font-semibold" style={{ color: ext.healthBadge?.color || '#888' }}>
                            {ext.healthScore}
                          </div>
                          <div className="text-xs text-white/40">/100</div>
                        </>
                      ) : (
                        <div className="font-mono text-sm text-white/40">N/A</div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}

          {filteredExtensions.length === 0 && !loading ? (
            <div className="rounded-xl border border-white/10 bg-black/20 p-8 text-center text-sm text-white/60">
              {extensions.length === 0 ? 'Aucune extension installée' : 'Aucun résultat pour cette recherche'}
            </div>
          ) : null}
        </div>
      </div>

      {cliModal && (
        <CliSnippetModal command={cliModal.command} title={cliModal.title} onClose={() => setCliModal(null)} />
      )}

      {uninstallConfirm && (() => {
        const ext = extensions.find(e => e.manifest.id === uninstallConfirm)
        return ext ? (
          <UninstallConfirmModal
            name={ext.manifest.name}
            onConfirm={doUninstall}
            onCancel={() => setUninstallConfirm(null)}
          />
        ) : null
      })()}
    </div>
  )
}
