import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type AppearanceState = {
  opacity: number
  fontSize: number
  accent: string
  setOpacity: (opacity: number) => void
  setFontSize: (fontSize: number) => void
  setAccent: (accent: string) => void
}

export const useAppearanceStore = create<AppearanceState>()(
  persist(
    (set) => ({
      opacity: 0.75,
      fontSize: 14,
      accent: '#7C5CFF',
      setOpacity: (opacity) => set({ opacity }),
      setFontSize: (fontSize) => set({ fontSize }),
      setAccent: (accent) => set({ accent }),
    }),
    { name: 'ghost-console-appearance' },
  ),
)

