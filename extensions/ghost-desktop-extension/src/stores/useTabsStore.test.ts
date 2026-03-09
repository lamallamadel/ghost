import { describe, expect, it } from 'vitest'
import { useTabsStore } from './useTabsStore'

describe('useTabsStore', () => {
  it('opens a new commands session tab', () => {
    const store = useTabsStore.getState()
    const before = store.tabs.length
    store.openSession()
    const after = useTabsStore.getState().tabs.length
    expect(after).toBe(before + 1)
  })

  it('does not close the first commands tab', () => {
    const store = useTabsStore.getState()
    store.closeTab('commands-1')
    expect(useTabsStore.getState().tabs.some((t) => t.id === 'commands-1')).toBe(true)
  })
})

