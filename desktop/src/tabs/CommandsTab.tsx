import { useEffect, useMemo, useState } from 'react'
import { ghost } from '@/ipc/ghost'
import type { AppInfo } from '@/ipc/types'
import { useSessionStore } from '@/stores/useSessionStore'
import { useCommandSessionsStore } from '@/stores/useCommandSessionsStore'
import { useToastsStore } from '@/stores/useToastsStore'
import { tokenize } from '@/utils/tokenize'

export function CommandsTab({ tabId }: { tabId: string }) {
  const pushToast = useToastsStore((s) => s.push)
  const repoPath = useSessionStore((s) => s.repoPath)

  const ensure = useCommandSessionsStore((s) => s.ensure)
  const session = useCommandSessionsStore((s) => s.sessions[tabId])
  const setInput = useCommandSessionsStore((s) => s.setInput)
  const setMode = useCommandSessionsStore((s) => s.setMode)
  const setRunning = useCommandSessionsStore((s) => s.setRunning)
  const append = useCommandSessionsStore((s) => s.append)
  const clear = useCommandSessionsStore((s) => s.clear)

  const [appInfo, setAppInfo] = useState<AppInfo | null>(null)

  useEffect(() => {
    ensure(tabId)
  }, [ensure, tabId])

  useEffect(() => {
    ghost.appInfo().then(setAppInfo).catch(() => null)
  }, [])

  const canRun = Boolean(repoPath) && Boolean(session?.input.trim()) && !session?.running

  const hint = useMemo(() => {
    if (!session) return ''
    if (session.mode === 'ghost') return 'Ex: audit --verbose'
    if (session.mode === 'git') return 'Ex: status -sb'
    return 'Ex: node -v'
  }, [session])

  async function run() {
    if (!repoPath || !session) return
    const raw = session.input.trim()
    if (!raw) return

    const tokens = tokenize(raw)
    let command = ''
    let args: string[] = []

    if (session.mode === 'ghost') {
      if (!appInfo?.ghostCliPath) {
        pushToast({ title: 'Ghost CLI introuvable', message: 'Chemin non disponible', tone: 'danger' })
        return
      }
      command = 'node'
      args = [appInfo.ghostCliPath, ...tokens]
    } else if (session.mode === 'git') {
      command = 'git'
      args = tokens
    } else {
      command = tokens[0]
      args = tokens.slice(1)
    }

    setRunning(tabId, true)
    append(tabId, { ts: new Date().toISOString(), stream: 'meta', text: `$ ${command} ${args.join(' ')}` })
    try {
      const res = await ghost.commandRun({ repoPath, command, args })
      const result = res.result
      if (result.stdout) append(tabId, { ts: new Date().toISOString(), stream: 'stdout', text: result.stdout.trimEnd() })
      if (result.stderr) append(tabId, { ts: new Date().toISOString(), stream: 'stderr', text: result.stderr.trimEnd() })
      const code = result.exitCode
      pushToast({ title: code === 0 ? 'OK' : 'Échec', message: `exitCode=${code}`, tone: code === 0 ? 'success' : 'danger' })
    } catch (e) {
      pushToast({ title: 'Exécution échouée', message: String(e), tone: 'danger' })
    } finally {
      setRunning(tabId, false)
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-white/10 bg-white/5 px-4 py-3 backdrop-blur">
        <div className="flex items-center gap-2">
          <select
            value={session?.mode || 'ghost'}
            onChange={(e) => setMode(tabId, e.target.value as 'ghost' | 'git' | 'custom')}
            className="rounded-lg border border-white/10 bg-black/20 px-2 py-1 text-sm"
          >
            <option value="ghost">ghost</option>
            <option value="git">git</option>
            <option value="custom">custom</option>
          </select>
          <div className="text-xs text-white/60">Repo: {repoPath || '—'}</div>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => clear(tabId)}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm hover:bg-white/10"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={run}
            disabled={!canRun}
            className="rounded-lg bg-[rgb(var(--gc-accent))] px-3 py-2 text-sm font-semibold text-black hover:opacity-90 disabled:opacity-50"
          >
            Run
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto bg-black/10 p-4">
        <div className="space-y-2 font-mono text-xs">
          {(session?.output || []).map((l) => (
            <pre
              key={l.id}
              className={`whitespace-pre-wrap rounded-lg border px-3 py-2 ${
                l.stream === 'stderr'
                  ? 'border-rose-400/20 bg-rose-500/10 text-rose-50'
                  : l.stream === 'meta'
                    ? 'border-white/10 bg-white/5 text-white'
                    : 'border-emerald-400/10 bg-emerald-500/5 text-emerald-50'
              }`}
            >
              {l.text}
            </pre>
          ))}
        </div>
      </div>

      <div className="border-t border-white/10 bg-white/5 p-3 backdrop-blur">
        <div className="flex items-center gap-2">
          <input
            value={session?.input || ''}
            onChange={(e) => setInput(tabId, e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) run()
            }}
            placeholder={hint}
            className="flex-1 rounded-lg border border-white/10 bg-black/20 px-3 py-2 font-mono text-sm outline-none focus:border-white/20"
          />
          <div className="text-[11px] text-white/50">Ctrl+Enter</div>
        </div>
      </div>
    </div>
  )
}
