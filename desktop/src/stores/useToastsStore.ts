import { create } from 'zustand'

export type Toast = {
  id: string
  title: string
  message?: string
  tone?: 'info' | 'success' | 'warning' | 'danger'
}

type ToastsState = {
  toasts: Toast[]
  push: (t: Omit<Toast, 'id'>) => void
  remove: (id: string) => void
}

export const useToastsStore = create<ToastsState>((set, get) => ({
  toasts: [],
  push: (t) => {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`
    set({ toasts: [...get().toasts, { ...t, id }] })
    setTimeout(() => {
      set({ toasts: get().toasts.filter((x) => x.id !== id) })
    }, 3500)
  },
  remove: (id) => set({ toasts: get().toasts.filter((x) => x.id !== id) }),
}))

