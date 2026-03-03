import { useCallback, useEffect, useState } from 'react'
import { Package, Power, RefreshCw, Edit2, X, Check, Shield } from 'lucide-react'
import { ghost } from '@/ipc/ghost'
import type { GatewayState, ExtensionInfo } from '@/ipc/types'
import { useToastsStore } from '@/stores/useToastsStore'

type EditableFields = {
  description?: string
  tags?: string[]
  category?: string
}

export function ExtensionManagerTab() {
  const pushToast = useToastsStore((s) => s.push)
  const [state, setState] = useState<GatewayState | null>(null)
  const [loading, setLoading] = useState(false)
  const [enabledExtensions, setEnabledExtensions] = useState<Set<string>>(new Set())
  const [editingExtension, setEditingExtension] = useState<string | null>(null)
  const [editedFields, setEditedFields] = useState<EditableFields>({})
  const [pendingEdits, setPendingEdits] = useState<Map<string, EditableFields>>(new Map())

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
      if (enabled) {
        updated.add(extensionId)
      } else {
        updated.delete(extensionId)
      }
      return updated
    })
    
    pushToast({
      title: enabled ? 'Extension activée' : 'Extension désactivée',
      message: extensionId,
      tone: 'info'
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
        pushToast({
          title: 'Extension rechargée',
          message: extensionId,
          tone: 'success'
        })
        await load()
      } else {
        pushToast({
          title: 'Échec du rechargement',
          message: result.error || 'Erreur inconnue',
          tone: 'danger'
        })
      }
    } catch (e) {
      pushToast({
        title: 'Erreur de rechargement',
        message: String(e),
        tone: 'danger'
      })
    }
  }

  async function reloadGateway() {
    try {
      pushToast({
        title: 'Rechargement du gateway',
        message: 'Toutes les extensions vont être rechargées...',
        tone: 'info'
      })
      
      await load()
      
      pushToast({
        title: 'Gateway rechargé',
        message: 'Toutes les extensions ont été rechargées',
        tone: 'success'
      })
    } catch (e) {
      pushToast({
        title: 'Erreur de rechargement du gateway',
        message: String(e),
        tone: 'danger'
      })
    }
  }

  const extensions = state?.extensions || []

  function renderHealthBadge(ext: ExtensionInfo) {
    if (!ext.healthScore || !ext.healthBadge) return null

    const badge = ext.healthBadge
    const score = ext.healthScore

    return (
      <div 
        className="flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium"
        style={{
          borderColor: `${badge.color}30`,
          backgroundColor: `${badge.color}15`,
          color: badge.color
        }}
        title={`Score de santé: ${score}/100`}
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
          <button
            type="button"
            onClick={load}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm hover:bg-white/10"
          >
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

      <div className="min-h-0 flex-1 overflow-auto p-4">
        {loading && !state ? (
          <div className="text-sm text-white/60">Chargement…</div>
        ) : null}

        <div className="space-y-3">
          {extensions.map((ext) => {
            const isEnabled = enabledExtensions.has(ext.manifest.id)
            const isEditing = editingExtension === ext.manifest.id
            const hasPendingEdits = pendingEdits.has(ext.manifest.id)
            const manifestWithMeta = ext.manifest as ExtensionInfo['manifest'] & { description?: string; tags?: string[]; category?: string }
            const currentFields = pendingEdits.get(ext.manifest.id) || {
              description: manifestWithMeta.description || '',
              tags: manifestWithMeta.tags || [],
              category: manifestWithMeta.category || ''
            }

            return (
              <div
                key={ext.manifest.id}
                className="rounded-xl border border-white/10 bg-black/20 p-4"
              >
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
                                <span
                                  key={idx}
                                  className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-xs"
                                >
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
                              onChange={(e) =>
                                setEditedFields({ ...editedFields, description: e.target.value })
                              }
                              className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm"
                              placeholder="Description de l'extension"
                            />
                          </div>
                          <div>
                            <label className="mb-1 block text-xs text-white/60">Catégorie</label>
                            <input
                              type="text"
                              value={editedFields.category || ''}
                              onChange={(e) =>
                                setEditedFields({ ...editedFields, category: e.target.value })
                              }
                              className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm"
                              placeholder="git, filesystem, network, etc."
                            />
                          </div>
                          <div>
                            <label className="mb-1 block text-xs text-white/60">
                              Tags (séparés par des virgules)
                            </label>
                            <input
                              type="text"
                              value={editedFields.tags?.join(', ') || ''}
                              onChange={(e) =>
                                setEditedFields({
                                  ...editedFields,
                                  tags: e.target.value
                                    .split(',')
                                    .map((t) => t.trim())
                                    .filter(Boolean)
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
                    <div className="text-xs text-white/40">Permissions</div>
                    <div className="mt-1 font-mono text-sm font-semibold">
                      {ext.manifest.permissions?.length || 0}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-white/40">Capabilities</div>
                    <div className="mt-1 font-mono text-sm font-semibold">
                      {Object.keys(ext.manifest.capabilities || {}).length}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-white/40">Requêtes approuvées</div>
                    <div className="mt-1 font-mono text-sm font-semibold text-emerald-400">
                      {ext.stats.requestsApproved}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-white/40">Score de santé</div>
                    <div className="mt-1 flex items-center gap-1.5">
                      {ext.healthScore !== undefined ? (
                        <>
                          <div 
                            className="font-mono text-sm font-semibold"
                            style={{ 
                              color: ext.healthBadge?.color || '#888' 
                            }}
                          >
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

          {extensions.length === 0 && !loading ? (
            <div className="rounded-xl border border-white/10 bg-black/20 p-8 text-center text-sm text-white/60">
              Aucune extension installée
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
