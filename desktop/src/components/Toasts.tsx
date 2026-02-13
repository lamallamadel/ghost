import { useToastsStore } from '@/stores/useToastsStore'

function toneClasses(tone: string | undefined) {
  if (tone === 'success') return 'border-emerald-400/30 bg-emerald-500/10 text-emerald-50'
  if (tone === 'warning') return 'border-amber-400/30 bg-amber-500/10 text-amber-50'
  if (tone === 'danger') return 'border-rose-400/30 bg-rose-500/10 text-rose-50'
  return 'border-white/10 bg-white/5 text-white'
}

export function Toasts() {
  const toasts = useToastsStore((s) => s.toasts)
  const remove = useToastsStore((s) => s.remove)

  return (
    <div className="pointer-events-none fixed right-4 top-4 z-50 flex w-[360px] flex-col gap-2">
      {toasts.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => remove(t.id)}
          className={`pointer-events-auto rounded-xl border px-3 py-2 text-left shadow-lg backdrop-blur ${toneClasses(t.tone)}`}
        >
          <div className="text-sm font-semibold">{t.title}</div>
          {t.message ? <div className="mt-0.5 text-xs opacity-90">{t.message}</div> : null}
        </button>
      ))}
    </div>
  )
}

