import { create } from 'zustand'

export type TabKind = 'commands' | 'history' | 'git' | 'logs' | 'settings'

export type Tab = {
  id: string
  kind: TabKind
  title: string
}

type TabsState = {
  tabs: Tab[]
  activeId: string
  openSession: () => void
  closeTab: (id: string) => void
  setActive: (id: string) => void
}

function defaultTabs(): Tab[] {
  return [
    { id: 'commands-1', kind: 'commands', title: 'Commandes' },
    { id: 'history', kind: 'history', title: 'Historique' },
    { id: 'git', kind: 'git', title: 'Git' },
    { id: 'logs', kind: 'logs', title: 'Logs' },
  ]
}

export const useTabsStore = create<TabsState>((set, get) => ({
  tabs: defaultTabs(),
  activeId: 'commands-1',
  openSession: () => {
    const idx = get().tabs.filter((t) => t.kind === 'commands').length + 1
    const id = `commands-${idx}`
    set({ tabs: [...get().tabs, { id, kind: 'commands', title: `Session ${idx}` }], activeId: id })
  },
  closeTab: (id) => {
    if (id === 'commands-1') return
    const tabs = get().tabs
    const t = tabs.find((x) => x.id === id)
    if (!t) return
    if (t.kind !== 'commands' || tabs.filter((x) => x.kind === 'commands').length <= 1) return
    const nextTabs = tabs.filter((x) => x.id !== id)
    const nextActive = get().activeId === id ? nextTabs[0].id : get().activeId
    set({ tabs: nextTabs, activeId: nextActive })
  },
  setActive: (id) => set({ activeId: id }),
}))
