import { useCallback, useEffect, useState } from 'react'
import { ghost } from '@/ipc/ghost'
import type { LogEvent, LogLevel, LogScope } from '@/ipc/types'
import { useToastsStore } from '@/stores/useToastsStore'

export function LogsTab() {
  const pushToast = useToastsStore((s) => s.push)
  const [items, setItems] = useState<LogEvent[]>([])
  const [level, setLevel] = useState<LogLevel | ''>('')
  const [scope, setScope] = useState<LogScope | ''>('')
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await ghost.logsList({ level: level || undefined, scope: scope || undefined, limit: 500 })
      setItems(res.items)
    } catch (e) {
      pushToast({ title: 'Logs indisponibles', message: String(e), tone: 'danger' })
    } finally {
      setLoading(false)
    }
  }, [level, scope, pushToast])

  useEffect(() => {
    load()
  }, [load])

  async function exportLogs() {
    try {
      const res = await ghost.logsExport({ format: 'jsonl' })
      if (!res.canceled) pushToast({ title: 'Export OK', message: res.filePath, tone: 'success' })
    } catch (e) {
      pushToast({ title: 'Export KO', message: String(e), tone: 'danger' })
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-white/10 bg-white/5 px-4 py-3 backdrop-blur">
        <div>
          <div className="text-sm font-semibold">Logs</div>
          <div className="text-xs text-white/60">Trace toutes les modifications et validations.</div>
        </div>
        <div className="flex items-center gap-2">
          <select value={level} onChange={(e) => setLevel(e.target.value as LogLevel | '')} className="rounded-lg border border-white/10 bg-black/20 px-2 py-2 text-sm">
            <option value="">Niveau</option>
            <option value="debug">debug</option>
            <option value="info">info</option>
            <option value="warn">warn</option>
            <option value="error">error</option>
          </select>
          <select value={scope} onChange={(e) => setScope(e.target.value as LogScope | '')} className="rounded-lg border border-white/10 bg-black/20 px-2 py-2 text-sm">
            <option value="">Scope</option>
            <option value="command">command</option>
            <option value="git">git</option>
            <option value="validation">validation</option>
            <option value="storage">storage</option>
          </select>
          <button type="button" onClick={load} className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm hover:bg-white/10">
            Filtrer
          </button>
          <button type="button" onClick={exportLogs} className="rounded-lg bg-[rgb(var(--gc-accent))] px-3 py-2 text-sm font-semibold text-black hover:opacity-90">
            Export
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-4">
        {loading ? <div className="text-sm text-white/60">Chargement…</div> : null}
        <div className="space-y-2">
          {items.map((l) => (
            <div key={l.id || `${l.ts}-${l.message}`} className="rounded-xl border border-white/10 bg-black/20 p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="font-mono text-xs text-white/60">{l.ts}</div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5">{l.level}</span>
                  <span className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5">{l.scope}</span>
                </div>
              </div>
              <div className="mt-2 text-sm">{l.message}</div>
              {l.data ? (
                <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg border border-white/10 bg-black/30 p-2 font-mono text-xs text-white/70">
                  {JSON.stringify(l.data, null, 2)}
                </pre>
              ) : null}
            </div>
          ))}
          {items.length === 0 && !loading ? <div className="text-sm text-white/60">Aucun log.</div> : null}
        </div>
      </div>
    </div>
  )
}
