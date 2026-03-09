import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ghost } from '@/ipc/ghost'
import type { GitValidation } from '@/ipc/types'
import { useSessionStore } from '@/stores/useSessionStore'
import { useToastsStore } from '@/stores/useToastsStore'

function CheckRow({ name, ok, message }: { name: string; ok: boolean; message?: string }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2">
      <div className="text-sm font-medium">{name}</div>
      <div className={`text-xs ${ok ? 'text-emerald-200' : 'text-rose-200'}`}>{ok ? 'OK' : message || 'KO'}</div>
    </div>
  )
}

export default function RepoSelect() {
  const nav = useNavigate()
  const repoPath = useSessionStore((s) => s.repoPath)
  const setRepoPath = useSessionStore((s) => s.setRepoPath)
  const pushToast = useToastsStore((s) => s.push)

  const [validation, setValidation] = useState<GitValidation | null>(null)
  const [loading, setLoading] = useState(false)

  const canOpen = Boolean(repoPath && validation?.ok)

  useEffect(() => {
    if (!repoPath) return
    setLoading(true)
    ghost
      .repoValidate(repoPath)
      .then((v) => setValidation(v))
      .catch((e) => pushToast({ title: 'Validation échouée', message: String(e), tone: 'danger' }))
      .finally(() => setLoading(false))
  }, [repoPath, pushToast])

  const metaLine = useMemo(() => {
    const branch = validation?.meta?.branch
    const dirty = validation?.meta?.dirty
    if (!branch) return null
    return `${branch}${dirty ? ' • dirty' : ' • clean'}`
  }, [validation])

  async function pickRepo() {
    setLoading(true)
    try {
      const res = await ghost.repoSelect()
      if (res.canceled) return
      if (res.repoPath) setRepoPath(res.repoPath)
      if (res.validation) setValidation(res.validation)
      if (res.validation?.ok) pushToast({ title: 'Repo prêt', message: res.repoPath, tone: 'success' })
      else pushToast({ title: 'Repo invalide', message: res.repoPath, tone: 'warning' })
    } catch (e) {
      pushToast({ title: 'Sélection échouée', message: String(e), tone: 'danger' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="h-full p-6">
      <div className="mx-auto flex h-full max-w-5xl flex-col">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-2xl font-semibold">Ghost Console</div>
            <div className="mt-1 text-sm text-white/60">Choisis un dépôt Git local pour démarrer.</div>
          </div>
          <button
            type="button"
            onClick={() => nav('/settings')}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm hover:bg-white/10"
          >
            Paramètres
          </button>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur">
            <div className="text-sm font-semibold">Sélection</div>
            <div className="mt-3">
              <div className="text-xs text-white/60">Chemin</div>
              <div className="mt-1 rounded-lg border border-white/10 bg-black/20 px-3 py-2 font-mono text-xs">
                {repoPath || '—'}
              </div>
              {metaLine ? <div className="mt-2 text-xs text-white/60">{metaLine}</div> : null}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={pickRepo}
                disabled={loading}
                className="rounded-lg bg-[rgb(var(--gc-accent))] px-3 py-2 text-sm font-semibold text-black hover:opacity-90 disabled:opacity-60"
              >
                Choisir un dossier
              </button>
              <button
                type="button"
                onClick={() => nav('/console')}
                disabled={!canOpen}
                className="rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-sm hover:bg-white/15 disabled:opacity-50"
              >
                Ouvrir la console
              </button>
            </div>
            {loading ? <div className="mt-3 text-xs text-white/60">Validation…</div> : null}
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur">
            <div className="text-sm font-semibold">Validation</div>
            <div className="mt-3 space-y-2">
              {validation?.checks?.length ? (
                validation.checks.map((c) => <CheckRow key={c.name} name={c.name} ok={c.ok} message={c.message} />)
              ) : (
                <div className="text-sm text-white/60">Sélectionne un repo pour voir les checks.</div>
              )}
            </div>
          </div>
        </div>

        <div className="mt-auto pt-6 text-xs text-white/40">Astuce: utilise l’onglet Git pour les opérations amend/rebase/cherry-pick avec validations.</div>
      </div>
    </div>
  )
}

