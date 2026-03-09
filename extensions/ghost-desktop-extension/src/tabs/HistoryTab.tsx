import { useCallback, useEffect, useMemo, useState } from 'react'
import { ghost } from '@/ipc/ghost'
import type { HistoryItem } from '@/ipc/types'
import { useSessionStore } from '@/stores/useSessionStore'
import { useToastsStore } from '@/stores/useToastsStore'

function formatMs(ms: number) {
  if (!Number.isFinite(ms)) return '—'
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

export function HistoryTab() {
  const repoPath = useSessionStore((s) => s.repoPath)
  const pushToast = useToastsStore((s) => s.push)
  const [q, setQ] = useState('')
  const [items, setItems] = useState<HistoryItem[]>([])
  const [loading, setLoading] = useState(false)

  const header = useMemo(() => (repoPath ? repoPath : '—'), [repoPath])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await ghost.historyList({ repoPath: repoPath || undefined, q, limit: 200, offset: 0 })
      setItems(res.items)
    } catch (e) {
      pushToast({ title: 'Historique indisponible', message: String(e), tone: 'danger' })
    } finally {
      setLoading(false)
    }
  }, [repoPath, q, pushToast])

  useEffect(() => {
    load()
  }, [load])

  async function replay(it: HistoryItem) {
    if (!repoPath) return
    try {
      const out = await ghost.commandRun({ repoPath, command: it.command, args: it.args })
      const code = out.result.exitCode
      pushToast({ title: code === 0 ? 'Rejoué (OK)' : 'Rejoué (Échec)', message: `${it.command} ${it.args.join(' ')}`, tone: code === 0 ? 'success' : 'danger' })
      load()
    } catch (e) {
      pushToast({ title: 'Rejeu échoué', message: String(e), tone: 'danger' })
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-white/10 bg-white/5 px-4 py-3 backdrop-blur">
        <div>
          <div className="text-sm font-semibold">Historique</div>
          <div className="text-xs text-white/60">{header}</div>
        </div>
        <div className="flex items-center gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') load()
            }}
            placeholder="Rechercher…"
            className="w-72 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={load}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm hover:bg-white/10"
          >
            Filtrer
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-4">
        {loading ? <div className="text-sm text-white/60">Chargement…</div> : null}
        <div className="overflow-hidden rounded-2xl border border-white/10">
          <table className="w-full text-left text-sm">
            <thead className="bg-white/5 text-xs text-white/60">
              <tr>
                <th className="px-3 py-2">Commande</th>
                <th className="px-3 py-2">Statut</th>
                <th className="px-3 py-2">Durée</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {items.map((it) => (
                <tr key={it.id} className="bg-black/10 hover:bg-white/5">
                  <td className="px-3 py-2 font-mono text-xs">
                    {it.command} {it.args.join(' ')}
                  </td>
                  <td className={`px-3 py-2 text-xs ${it.exitCode === 0 ? 'text-emerald-200' : 'text-rose-200'}`}>
                    {it.exitCode === 0 ? 'OK' : `KO (${it.exitCode})`}
                  </td>
                  <td className="px-3 py-2 text-xs text-white/60">{formatMs(it.durationMs)}</td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => replay(it)}
                      className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs hover:bg-white/10"
                    >
                      Rejouer
                    </button>
                  </td>
                </tr>
              ))}
              {items.length === 0 && !loading ? (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-sm text-white/60">
                    Aucun historique.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
