import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type SessionState = {
  repoPath: string | null
  setRepoPath: (path: string | null) => void
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      repoPath: null,
      setRepoPath: (repoPath) => set({ repoPath }),
    }),
    {
      name: 'ghost-console-session',
    },
  ),
)

