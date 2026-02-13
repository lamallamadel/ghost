import { create } from 'zustand'

export type OutputLine = {
  id: string
  ts: string
  stream: 'stdout' | 'stderr' | 'meta'
  text: string
}

type Session = {
  id: string
  mode: 'ghost' | 'git' | 'custom'
  input: string
  running: boolean
  output: OutputLine[]
}

type SessionsState = {
  sessions: Record<string, Session>
  ensure: (id: string) => void
  setInput: (id: string, input: string) => void
  setMode: (id: string, mode: Session['mode']) => void
  setRunning: (id: string, running: boolean) => void
  append: (id: string, line: Omit<OutputLine, 'id'>) => void
  clear: (id: string) => void
}

export const useCommandSessionsStore = create<SessionsState>((set, get) => ({
  sessions: {},
  ensure: (id) => {
    const s = get().sessions[id]
    if (s) return
    set({
      sessions: {
        ...get().sessions,
        [id]: { id, mode: 'ghost', input: '', running: false, output: [] },
      },
    })
  },
  setInput: (id, input) => set({ sessions: { ...get().sessions, [id]: { ...get().sessions[id], input } } }),
  setMode: (id, mode) => set({ sessions: { ...get().sessions, [id]: { ...get().sessions[id], mode } } }),
  setRunning: (id, running) => set({ sessions: { ...get().sessions, [id]: { ...get().sessions[id], running } } }),
  append: (id, line) => {
    const session = get().sessions[id]
    const next = {
      ...session,
      output: [...session.output, { ...line, id: `${Date.now()}-${Math.random().toString(16).slice(2)}` }].slice(-2000),
    }
    set({ sessions: { ...get().sessions, [id]: next } })
  },
  clear: (id) => set({ sessions: { ...get().sessions, [id]: { ...get().sessions[id], output: [] } } }),
}))

