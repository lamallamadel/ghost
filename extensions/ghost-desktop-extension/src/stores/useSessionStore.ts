import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type SessionState = {
  repoPath: string | null
  setRepoPath: (path: string | null) => void
  onboardingComplete: boolean
  setOnboardingComplete: (complete: boolean) => void
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      repoPath: null,
      setRepoPath: (repoPath) => set({ repoPath }),
      onboardingComplete: false,
      setOnboardingComplete: (onboardingComplete) => set({ onboardingComplete }),
    }),
    {
      name: 'ghost-console-session',
    },
  ),
)

