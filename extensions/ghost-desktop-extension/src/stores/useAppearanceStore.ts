import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type AppearanceState = {
  opacity: number
  fontSize: number
  accent: string
  lineHeight: number
  readingMode: boolean
  setOpacity: (opacity: number) => void
  setFontSize: (fontSize: number) => void
  setAccent: (accent: string) => void
  setLineHeight: (lineHeight: number) => void
  setReadingMode: (readingMode: boolean) => void
}

export const useAppearanceStore = create<AppearanceState>()(
  persist(
    (set) => ({
      opacity: 0.75,
      fontSize: 14,
      accent: '#7C5CFF',
      lineHeight: 1.7,
      readingMode: false,
      setOpacity: (opacity) => set({ opacity }),
      setFontSize: (fontSize) => set({ fontSize }),
      setAccent: (accent) => set({ accent }),
      setLineHeight: (lineHeight) => set({ lineHeight }),
      setReadingMode: (readingMode) => set({ readingMode }),
    }),
    { name: 'ghost-console-appearance' },
  ),
)

