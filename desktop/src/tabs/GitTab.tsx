import { useEffect, useMemo, useState } from 'react'
import { ghost } from '@/ipc/ghost'
import type { GitOperationRequest, GitValidation } from '@/ipc/types'
import { useSessionStore } from '@/stores/useSessionStore'
import { useToastsStore } from '@/stores/useToastsStore'

type Kind = 'amend' | 'rebase' | 'cherry-pick'

function CheckBadge({ ok, text }: { ok: boolean; text: string }) {
  return (
    <div className={`rounded-lg border px-2 py-1 text-xs ${ok ? 'border-emerald-400/20 bg-emerald-500/10 text-emerald-100' : 'border-rose-400/20 bg-rose-500/10 text-rose-100'}`}>
      {text}
    </div>
  )
}

function Confirm({
  open,
  title,
  summary,
  confirmWord,
  onCancel,
  onConfirm,
}: {
  open: boolean
  title: string
  summary: string
  confirmWord: string
  onCancel: () => void
  onConfirm: () => void
}) {
  const [value, setValue] = useState('')

  useEffect(() => {
    if (open) setValue('')
  }, [open])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#0b0f14]/90 p-4 backdrop-blur">
        <div className="text-lg font-semibold">{title}</div>
        <div className="mt-2 whitespace-pre-wrap rounded-xl border border-white/10 bg-black/30 p-3 font-mono text-xs text-white/80">{summary}</div>
        <div className="mt-3 text-sm text-white/70">Tape <span className="font-mono text-white">{confirmWord}</span> pour confirmer.</div>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="mt-2 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 font-mono text-sm"
        />
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm hover:bg-white/10">
            Annuler
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={value.trim() !== confirmWord}
            className="rounded-lg bg-[rgb(var(--gc-accent))] px-3 py-2 text-sm font-semibold text-black hover:opacity-90 disabled:opacity-50"
          >
            Confirmer
          </button>
        </div>
      </div>
    </div>
  )
}

export function GitTab() {
  const repoPath = useSessionStore((s) => s.repoPath)
  const pushToast = useToastsStore((s) => s.push)
  const [kind, setKind] = useState<Kind>('amend')
  const [validation, setValidation] = useState<GitValidation | null>(null)
  const [running, setRunning] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const [amendMessage, setAmendMessage] = useState('')
  const [amendStageAll, setAmendStageAll] = useState(false)

  const [rebaseUpstream, setRebaseUpstream] = useState('HEAD~5')
  const [rebaseInteractive, setRebaseInteractive] = useState(true)

  const [cherryCommits, setCherryCommits] = useState('')
  const [cherryMainline, setCherryMainline] = useState('')

  const request: GitOperationRequest | null = useMemo(() => {
    if (!repoPath) return null
    if (kind === 'amend') return { kind: 'amend', repoPath, message: amendMessage.trim() ? amendMessage.trim() : undefined, stageAll: amendStageAll }
    if (kind === 'rebase') return { kind: 'rebase', repoPath, upstream: rebaseUpstream.trim(), interactive: rebaseInteractive }
    const commits = cherryCommits
      .split(/[,\s]+/)
      .map((c) => c.trim())
      .filter(Boolean)
    const mainline = cherryMainline.trim() ? Number(cherryMainline.trim()) : undefined
    return { kind: 'cherry-pick', repoPath, commits, mainline: Number.isFinite(mainline || 0) ? mainline : undefined }
  }, [repoPath, kind, amendMessage, amendStageAll, rebaseUpstream, rebaseInteractive, cherryCommits, cherryMainline])

  async function validate() {
    if (!request) return
    setRunning(true)
    try {
      const v = await ghost.gitValidateBefore(request)
      setValidation(v)
      pushToast({ title: v.ok ? 'Validation OK' : 'Validation KO', message: request.kind, tone: v.ok ? 'success' : 'warning' })
    } catch (e) {
      pushToast({ title: 'Validation échouée', message: String(e), tone: 'danger' })
    } finally {
      setRunning(false)
    }
  }

  async function execute() {
    if (!request) return
    setConfirmOpen(false)
    setRunning(true)
    try {
      const res = await ghost.gitExecute(request)
      if (res.ok) pushToast({ title: 'Git OK', message: request.kind, tone: 'success' })
      else pushToast({ title: 'Git KO', message: res.result.stderr || 'Erreur', tone: 'danger' })
      setValidation(res.validation)
    } catch (e) {
      pushToast({ title: 'Exécution échouée', message: String(e), tone: 'danger' })
    } finally {
      setRunning(false)
    }
  }

  useEffect(() => {
    setValidation(null)
  }, [kind])

  const confirmWord = kind === 'amend' ? 'AMEND' : kind === 'rebase' ? 'REBASE' : 'CHERRY'
  const summary = request ? JSON.stringify(request, null, 2) : ''

  return (
    <div className="flex h-full flex-col">
      <Confirm
        open={confirmOpen}
        title="Commande Git critique"
        summary={summary}
        confirmWord={confirmWord}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={execute}
      />

      <div className="flex items-center justify-between gap-3 border-b border-white/10 bg-white/5 px-4 py-3 backdrop-blur">
        <div>
          <div className="text-sm font-semibold">Git</div>
          <div className="text-xs text-white/60">Amend / Rebase / Cherry-pick avec validations</div>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={validate}
            disabled={!request || running}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm hover:bg-white/10 disabled:opacity-50"
          >
            Valider
          </button>
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            disabled={!request || running}
            className="rounded-lg bg-[rgb(var(--gc-accent))] px-3 py-2 text-sm font-semibold text-black hover:opacity-90 disabled:opacity-50"
          >
            Exécuter
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-4">
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setKind('amend')} className={`rounded-lg border px-3 py-2 text-sm ${kind === 'amend' ? 'border-white/15 bg-white/10' : 'border-white/10 bg-white/5 hover:bg-white/10'}`}>Amend</button>
          <button type="button" onClick={() => setKind('rebase')} className={`rounded-lg border px-3 py-2 text-sm ${kind === 'rebase' ? 'border-white/15 bg-white/10' : 'border-white/10 bg-white/5 hover:bg-white/10'}`}>Rebase</button>
          <button type="button" onClick={() => setKind('cherry-pick')} className={`rounded-lg border px-3 py-2 text-sm ${kind === 'cherry-pick' ? 'border-white/15 bg-white/10' : 'border-white/10 bg-white/5 hover:bg-white/10'}`}>Cherry-pick</button>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur">
            <div className="text-sm font-semibold">Paramètres</div>

            {kind === 'amend' ? (
              <div className="mt-3 space-y-3">
                <div>
                  <div className="text-xs text-white/60">Message (optionnel)</div>
                  <textarea
                    value={amendMessage}
                    onChange={(e) => setAmendMessage(e.target.value)}
                    rows={3}
                    className="mt-1 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm"
                    placeholder="Laisser vide pour --no-edit"
                  />
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={amendStageAll} onChange={(e) => setAmendStageAll(e.target.checked)} />
                  Stage all (git add -A)
                </label>
              </div>
            ) : null}

            {kind === 'rebase' ? (
              <div className="mt-3 space-y-3">
                <div>
                  <div className="text-xs text-white/60">Upstream</div>
                  <input
                    value={rebaseUpstream}
                    onChange={(e) => setRebaseUpstream(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 font-mono text-sm"
                  />
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={rebaseInteractive} onChange={(e) => setRebaseInteractive(e.target.checked)} />
                  Mode interactif
                </label>
                <div className="text-xs text-white/60">Note: le mode interactif dépend de Git (éditeur). Pour un MVP, la commande est exécutée telle quelle.</div>
              </div>
            ) : null}

            {kind === 'cherry-pick' ? (
              <div className="mt-3 space-y-3">
                <div>
                  <div className="text-xs text-white/60">Commits (SHA séparés par espaces ou virgules)</div>
                  <textarea
                    value={cherryCommits}
                    onChange={(e) => setCherryCommits(e.target.value)}
                    rows={3}
                    className="mt-1 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 font-mono text-sm"
                  />
                </div>
                <div>
                  <div className="text-xs text-white/60">Mainline (optionnel)</div>
                  <input
                    value={cherryMainline}
                    onChange={(e) => setCherryMainline(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 font-mono text-sm"
                    placeholder="Ex: 1"
                  />
                </div>
              </div>
            ) : null}
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold">Validations</div>
              {validation ? <CheckBadge ok={validation.ok} text={validation.ok ? 'OK' : 'KO'} /> : <div className="text-xs text-white/50">—</div>}
            </div>
            <div className="mt-3 space-y-2">
              {validation?.checks?.length ? (
                validation.checks.map((c) => (
                  <div key={c.name} className="flex items-start justify-between gap-3 rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                    <div className="text-sm">{c.name}</div>
                    <div className={`text-xs ${c.ok ? 'text-emerald-200' : 'text-rose-200'}`}>{c.ok ? 'OK' : c.message || 'KO'}</div>
                  </div>
                ))
              ) : (
                <div className="text-sm text-white/60">Clique sur “Valider” pour analyser l’état du repo.</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

