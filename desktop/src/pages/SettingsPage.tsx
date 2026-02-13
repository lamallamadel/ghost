import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTheme } from '@/hooks/useTheme'
import { useAppearanceStore } from '@/stores/useAppearanceStore'
import { useSessionStore } from '@/stores/useSessionStore'
import { ghost } from '@/ipc/ghost'
import { useToastsStore } from '@/stores/useToastsStore'

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n))
}

export default function SettingsPage() {
  const nav = useNavigate()
  const { theme, toggleTheme, isDark } = useTheme()
  const repoPath = useSessionStore((s) => s.repoPath)
  const { opacity, fontSize, accent, setOpacity, setFontSize, setAccent } = useAppearanceStore()
  const pushToast = useToastsStore((s) => s.push)

  useEffect(() => {
    document.documentElement.style.setProperty('--gc-opacity', String(opacity))
    document.documentElement.style.setProperty('--gc-font-size', `${fontSize}px`)
    const rgb = accent.startsWith('#') && accent.length === 7
      ? `${parseInt(accent.slice(1, 3), 16)} ${parseInt(accent.slice(3, 5), 16)} ${parseInt(accent.slice(5, 7), 16)}`
      : '124 92 255'
    document.documentElement.style.setProperty('--gc-accent', rgb)
    document.body.style.background = `rgba(var(--gc-bg) / ${0.25 + opacity * 0.55})`
  }, [opacity, fontSize, accent])

  async function exportLogs() {
    try {
      const res = await ghost.logsExport({ format: 'jsonl' })
      if (!res.canceled) pushToast({ title: 'Logs exportés', message: res.filePath, tone: 'success' })
    } catch (e) {
      pushToast({ title: 'Export échoué', message: String(e), tone: 'danger' })
    }
  }

  return (
    <div className="h-full p-6">
      <div className="mx-auto max-w-5xl">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-2xl font-semibold">Paramètres</div>
            <div className="mt-1 text-sm text-white/60">Thème, transparence, rendu et diagnostics.</div>
          </div>
          <button
            type="button"
            onClick={() => nav(repoPath ? '/console' : '/')}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm hover:bg-white/10"
          >
            Retour
          </button>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur">
            <div className="text-sm font-semibold">Apparence</div>

            <div className="mt-4 flex items-center justify-between gap-3">
              <div>
                <div className="text-sm">Thème</div>
                <div className="text-xs text-white/60">Actuel: {theme}</div>
              </div>
              <button
                type="button"
                onClick={toggleTheme}
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm hover:bg-white/10"
              >
                Basculer
              </button>
            </div>

            <div className="mt-4">
              <div className="flex items-center justify-between">
                <div className="text-sm">Transparence</div>
                <div className="text-xs text-white/60">{Math.round(opacity * 100)}%</div>
              </div>
              <input
                type="range"
                min={0.35}
                max={0.95}
                step={0.01}
                value={opacity}
                onChange={(e) => setOpacity(clamp(Number(e.target.value), 0.35, 0.95))}
                className="mt-2 w-full"
              />
            </div>

            <div className="mt-4">
              <div className="flex items-center justify-between">
                <div className="text-sm">Taille police</div>
                <div className="text-xs text-white/60">{fontSize}px</div>
              </div>
              <input
                type="range"
                min={12}
                max={18}
                step={1}
                value={fontSize}
                onChange={(e) => setFontSize(clamp(Number(e.target.value), 12, 18))}
                className="mt-2 w-full"
              />
            </div>

            <div className="mt-4">
              <div className="text-sm">Accent</div>
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="color"
                  value={accent}
                  onChange={(e) => setAccent(e.target.value)}
                  className="h-10 w-10 rounded-lg border border-white/10 bg-transparent"
                  aria-label="Couleur accent"
                />
                <input
                  value={accent}
                  onChange={(e) => setAccent(e.target.value)}
                  className="flex-1 rounded-lg border border-white/10 bg-black/20 px-3 py-2 font-mono text-xs"
                />
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-3">
              <div className="text-xs text-white/60">Aperçu</div>
              <div className="mt-1 font-mono text-sm">ghost audit --verbose</div>
              <div className={`mt-1 text-xs ${isDark ? 'text-white/70' : 'text-black/70'}`}>Sortie console • logs • validations</div>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur">
            <div className="text-sm font-semibold">Diagnostics</div>
            <div className="mt-4 space-y-3">
              <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                <div className="text-xs text-white/60">Repo courant</div>
                <div className="mt-1 font-mono text-xs">{repoPath || '—'}</div>
              </div>
              <button
                type="button"
                onClick={exportLogs}
                className="w-full rounded-lg bg-[rgb(var(--gc-accent))] px-3 py-2 text-sm font-semibold text-black hover:opacity-90"
              >
                Exporter les logs
              </button>
              <div className="text-xs text-white/60">Les logs incluent commandes, validations, et opérations Git exécutées via l’UI.</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

