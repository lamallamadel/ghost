import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Plus, Settings as SettingsIcon, SidebarClose, SidebarOpen,
  Terminal, FlaskConical, Network, Puzzle, Settings2, Store,
  BarChart2, Code2, Clock, GitCommit, FileText
} from 'lucide-react'
import { useSessionStore } from '@/stores/useSessionStore'
import { useTabsStore } from '@/stores/useTabsStore'
import { useAppearanceStore } from '@/stores/useAppearanceStore'
import { ghost } from '@/ipc/ghost'
import type { AppInfo } from '@/ipc/types'
import { CommandsTab } from '@/tabs/CommandsTab'
import { HistoryTab } from '@/tabs/HistoryTab'
import { GitTab } from '@/tabs/GitTab'
import { LogsTab } from '@/tabs/LogsTab'
import { GatewayTab } from '@/tabs/GatewayTab'
import { ExtensionsTab } from '@/tabs/ExtensionsTab'
import { ExtensionManagerTab } from '@/tabs/ExtensionManagerTab'
import { MarketplaceTab } from '@/tabs/MarketplaceTab'
import { DeveloperTab } from '@/tabs/DeveloperTab'
import { AnalyticsTab } from '@/tabs/AnalyticsTab'
import { PlaygroundTab } from '@/tabs/PlaygroundTab'
import { useToastsStore } from '@/stores/useToastsStore'
import { OnboardingWalkthrough } from '@/components/OnboardingWalkthrough'
import type { TabKind } from '@/stores/useTabsStore'
import type { LucideIcon } from 'lucide-react'

const TAB_ICONS: Partial<Record<TabKind, LucideIcon>> = {
  commands: Terminal,
  playground: FlaskConical,
  gateway: Network,
  extensions: Puzzle,
  'extension-manager': Settings2,
  marketplace: Store,
  analytics: BarChart2,
  developer: Code2,
  history: Clock,
  git: GitCommit,
  logs: FileText,
}

function TabButton({
  active,
  title,
  icon: Icon,
  onClick,
  onClose,
  closable,
  shortcut,
}: {
  active: boolean
  title: string
  icon?: LucideIcon
  onClick: () => void
  onClose?: () => void
  closable?: boolean
  shortcut?: string
}) {
  return (
    <div
      className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${active ? 'border-white/15 bg-white/10' : 'border-white/10 bg-white/5 hover:bg-white/10'}`}
      title={shortcut}
    >
      <button type="button" onClick={onClick} className="flex items-center gap-1.5 truncate">
        {Icon && <Icon size={14} />}
        {title}
      </button>
      {closable ? (
        <button type="button" onClick={onClose} className="text-xs text-white/60 hover:text-white">
          ×
        </button>
      ) : null}
    </div>
  )
}

export default function ConsolePage() {
  const nav = useNavigate()
  const pushToast = useToastsStore((s) => s.push)
  const repoPath = useSessionStore((s) => s.repoPath)
  const setRepoPath = useSessionStore((s) => s.setRepoPath)
  const onboardingComplete = useSessionStore((s) => s.onboardingComplete)
  const tabs = useTabsStore((s) => s.tabs)
  const activeId = useTabsStore((s) => s.activeId)
  const setActive = useTabsStore((s) => s.setActive)
  const openSession = useTabsStore((s) => s.openSession)
  const closeTab = useTabsStore((s) => s.closeTab)
  const readingMode = useAppearanceStore((s) => s.readingMode)

  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null)
  const [showWalkthrough, setShowWalkthrough] = useState(false)

  useEffect(() => {
    ghost
      .appInfo()
      .then(setAppInfo)
      .catch(() => null)
  }, [])

  useEffect(() => {
    if (!repoPath) nav('/')
  }, [repoPath, nav])

  useEffect(() => {
    if (repoPath && !onboardingComplete) {
      setShowWalkthrough(true)
    }
  }, [repoPath, onboardingComplete])

  // Keyboard shortcuts: Ctrl/Cmd+1-9 switch tabs
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey) {
        const idx = parseInt(e.key) - 1
        if (!isNaN(idx) && idx >= 0 && idx < tabs.length) {
          e.preventDefault()
          setActive(tabs[idx].id)
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [tabs, setActive])

  const activeTab = useMemo(() => tabs.find((t) => t.id === activeId) || tabs[0], [tabs, activeId])

  // Unique-kind tabs for the icon rail (one per kind, first occurrence)
  const uniqueKindTabs = useMemo(() =>
    tabs.filter((t, i, arr) => arr.findIndex(x => x.kind === t.kind) === i),
    [tabs]
  )

  async function revalidate() {
    if (!repoPath) return
    const v = await ghost.repoValidate(repoPath)
    if (!v.ok) pushToast({ title: 'Repo invalide', message: 'Reviens à la sélection', tone: 'warning' })
  }

  return (
    <div className="h-full">
      {showWalkthrough && <OnboardingWalkthrough onClose={() => setShowWalkthrough(false)} repoPath={repoPath || undefined} />}
      <div className="flex h-full">
        <div
          className={`shrink-0 border-r border-white/10 bg-black/20 backdrop-blur transition-[width] duration-200 ${
            readingMode ? 'w-0 overflow-hidden' : sidebarOpen ? 'w-72' : 'w-14'
          }`}
        >
          <div className="flex h-full flex-col p-3">
            <div className="flex items-center justify-between gap-2">
              <div className={`text-sm font-semibold ${sidebarOpen ? '' : 'hidden'}`}>Ghost Console</div>
              <button
                type="button"
                onClick={() => setSidebarOpen((s) => !s)}
                className="rounded-lg border border-white/10 bg-white/5 p-2 hover:bg-white/10"
                aria-label="Basculer la barre latérale"
              >
                {sidebarOpen ? <SidebarClose size={16} /> : <SidebarOpen size={16} />}
              </button>
            </div>

            <div className={`mt-4 ${sidebarOpen ? '' : 'hidden'}`}>
              <div className="text-xs text-white/60">Repo</div>
              <div className="mt-1 rounded-lg border border-white/10 bg-black/20 px-3 py-2 font-mono text-[11px]">
                {repoPath}
              </div>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={revalidate}
                  className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs hover:bg-white/10"
                >
                  Revalider
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setRepoPath(null)
                    nav('/')
                  }}
                  className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs hover:bg-white/10"
                >
                  Changer
                </button>
              </div>
            </div>

            {/* Icon rail when collapsed */}
            {!sidebarOpen && (
              <div className="mt-4 flex flex-col gap-1">
                {uniqueKindTabs.map((t, i) => {
                  const Icon = TAB_ICONS[t.kind]
                  return Icon ? (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => {
                        setActive(t.id)
                        if (!readingMode) setSidebarOpen(true)
                      }}
                      title={`${t.title}${i < 9 ? ` (Ctrl+${i + 1})` : ''}`}
                      className={`rounded-lg border p-2 text-white/60 transition-colors hover:bg-white/10 hover:text-white ${t.id === activeId ? 'border-white/15 bg-white/10 text-white' : 'border-transparent'}`}
                    >
                      <Icon size={16} />
                    </button>
                  ) : null
                })}
              </div>
            )}

            <div className="mt-auto">
              <button
                type="button"
                onClick={() => nav('/settings')}
                className={`flex w-full items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm hover:bg-white/10 ${sidebarOpen ? '' : 'px-0'}`}
              >
                <SettingsIcon size={16} />
                <span className={`${sidebarOpen ? '' : 'hidden'}`}>Paramètres</span>
              </button>
              {sidebarOpen && appInfo ? (
                <div className="mt-3 text-[11px] text-white/40">{appInfo.platform}/{appInfo.arch}</div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center justify-between gap-3 border-b border-white/10 bg-white/5 px-4 py-3 backdrop-blur">
            <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto">
              {tabs.map((t, i) => (
                <TabButton
                  key={t.id}
                  active={t.id === activeTab.id}
                  title={t.title}
                  icon={TAB_ICONS[t.kind]}
                  onClick={() => setActive(t.id)}
                  closable={t.kind === 'commands' && t.id !== 'commands-1'}
                  onClose={() => closeTab(t.id)}
                  shortcut={i < 9 ? `Ctrl+${i + 1}` : undefined}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={openSession}
              className="rounded-lg bg-[rgb(var(--gc-accent))] p-2 text-black hover:opacity-90"
              aria-label="Nouvelle session"
              title="Nouvelle session"
            >
              <Plus size={16} />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-hidden">
            {activeTab.kind === 'commands' ? <CommandsTab tabId={activeTab.id} /> : null}
            {activeTab.kind === 'playground' ? <PlaygroundTab /> : null}
            {activeTab.kind === 'gateway' ? <GatewayTab /> : null}
            {activeTab.kind === 'extensions' ? <ExtensionsTab /> : null}
            {activeTab.kind === 'extension-manager' ? <ExtensionManagerTab /> : null}
            {activeTab.kind === 'marketplace' ? <MarketplaceTab /> : null}
            {activeTab.kind === 'analytics' ? <AnalyticsTab /> : null}
            {activeTab.kind === 'history' ? <HistoryTab /> : null}
            {activeTab.kind === 'git' ? <GitTab /> : null}
            {activeTab.kind === 'logs' ? <LogsTab /> : null}
            {activeTab.kind === 'developer' ? <DeveloperTab extensions={[]} /> : null}
          </div>
        </div>
      </div>
    </div>
  )
}
