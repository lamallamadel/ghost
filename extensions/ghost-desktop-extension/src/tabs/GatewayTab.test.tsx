import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { GatewayTab } from './GatewayTab'
import type { GatewayState, PipelineRequest } from '@/ipc/types'

vi.mock('@/ipc/ghost', () => ({
  ghost: {
    gatewayState: vi.fn(),
    manualOverride: vi.fn(),
  },
}))

vi.mock('@/stores/useToastsStore', () => ({
  useToastsStore: vi.fn(() => vi.fn()),
}))

vi.mock('@/hooks/useTelemetryWebSocket', () => ({
  useTelemetryWebSocket: vi.fn(() => ({
    connectionState: 'disconnected',
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
    clearSubscriptions: vi.fn(),
    getCachedData: vi.fn(),
    eventCount: 0,
    droppedEvents: 0,
  })),
}))

const mockGatewayState: GatewayState = {
  extensions: [
    {
      manifest: {
        id: 'ghost-git-extension',
        name: 'Ghost Git Extension',
        version: '1.0.0',
        capabilities: {
          git: { read: true, write: true },
        },
      },
      stats: {
        requestsApproved: 42,
        requestsRejected: 3,
        requestsRateLimited: 1,
      },
    },
  ],
  recentRequests: [
    {
      requestId: 'req-001',
      extensionId: 'ghost-git-extension',
      type: 'git',
      operation: 'status',
      timestamp: Date.now() - 1000,
      stage: 'execute',
      status: 'completed',
    },
    {
      requestId: 'req-002',
      extensionId: 'ghost-git-extension',
      type: 'git',
      operation: 'commit',
      timestamp: Date.now() - 2000,
      stage: 'audit',
      status: 'pending',
    },
  ],
  trafficPolicerStates: {},
}

const mockDroppedRequest: PipelineRequest = {
  requestId: 'req-dropped-001',
  extensionId: 'ghost-git-extension',
  type: 'filesystem',
  operation: 'write',
  timestamp: Date.now() - 500,
  stage: 'auth',
  status: 'rejected',
  dropReason: 'Rate limit exceeded',
  dropLayer: 'auth',
}

describe('GatewayTab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.clearAllTimers()
  })

  it('renders with mock GatewayState data showing extensions and requests', async () => {
    const { ghost } = await import('@/ipc/ghost')
    vi.mocked(ghost.gatewayState).mockResolvedValue(mockGatewayState)

    render(<GatewayTab />)

    await waitFor(() => {
      expect(screen.getByText('Pipeline I/O')).toBeInTheDocument()
    })

    await waitFor(() => {
      expect(screen.getByText(/req-001/)).toBeInTheDocument()
      expect(screen.getByText(/req-002/)).toBeInTheDocument()
    })

    expect(screen.getAllByText(/ghost-git-extension/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/status/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/commit/).length).toBeGreaterThan(0)
  })

  it('renders pipeline stage boxes with correct colors and labels', async () => {
    const { ghost } = await import('@/ipc/ghost')
    vi.mocked(ghost.gatewayState).mockResolvedValue(mockGatewayState)

    render(<GatewayTab />)

    await waitFor(() => {
      expect(screen.getByText('Pipeline I/O')).toBeInTheDocument()
    })

    const stages = ['intercept', 'auth', 'audit', 'execute']
    stages.forEach(stage => {
      const elements = screen.getAllByText(stage)
      expect(elements.length).toBeGreaterThan(0)
    })

    const blueStageElements = document.querySelectorAll('.bg-blue-500\\/20')
    expect(blueStageElements.length).toBeGreaterThan(0)

    const yellowStageElements = document.querySelectorAll('.bg-yellow-500\\/20')
    expect(yellowStageElements.length).toBeGreaterThan(0)

    const purpleStageElements = document.querySelectorAll('.bg-purple-500\\/20')
    expect(purpleStageElements.length).toBeGreaterThan(0)

    const emeraldStageElements = document.querySelectorAll('.bg-emerald-500\\/20')
    expect(emeraldStageElements.length).toBeGreaterThan(0)
  })

  it('renders dropped requests with red styling and drop reason badges', async () => {
    const stateWithDropped: GatewayState = {
      ...mockGatewayState,
      recentRequests: [mockDroppedRequest],
    }

    const { ghost } = await import('@/ipc/ghost')
    vi.mocked(ghost.gatewayState).mockResolvedValue(stateWithDropped)

    render(<GatewayTab />)

    await waitFor(() => {
      expect(screen.getByText(/req-dropped-001/)).toBeInTheDocument()
    })

    const droppedRequestCardElements = document.querySelectorAll('.border-rose-500\\/30')
    expect(droppedRequestCardElements.length).toBeGreaterThan(0)

    expect(screen.getByText('QoS Violation')).toBeInTheDocument()
  })

  it('shows SI-10 violation badge for audit layer drops', async () => {
    const auditDropRequest: PipelineRequest = {
      ...mockDroppedRequest,
      requestId: 'req-audit-drop',
      dropLayer: 'audit',
      dropReason: 'Input validation failed',
    }

    const stateWithAuditDrop: GatewayState = {
      ...mockGatewayState,
      recentRequests: [auditDropRequest],
    }

    const { ghost } = await import('@/ipc/ghost')
    vi.mocked(ghost.gatewayState).mockResolvedValue(stateWithAuditDrop)

    render(<GatewayTab />)

    await waitFor(() => {
      expect(screen.getByText('SI-10 Violation')).toBeInTheDocument()
    })
  })

  it('expands dropped request to show detailed rejection information', async () => {
    const stateWithDropped: GatewayState = {
      ...mockGatewayState,
      recentRequests: [mockDroppedRequest],
    }

    const { ghost } = await import('@/ipc/ghost')
    vi.mocked(ghost.gatewayState).mockResolvedValue(stateWithDropped)

    const user = userEvent.setup()
    render(<GatewayTab />)

    await waitFor(() => {
      expect(screen.getByText(/req-dropped-001/)).toBeInTheDocument()
    })

    const expandButton = screen.getAllByRole('button').find(btn => 
      btn.querySelector('svg')
    )
    
    if (expandButton) {
      await user.click(expandButton)

      await waitFor(() => {
        expect(screen.getByText('Rejection Details')).toBeInTheDocument()
        expect(screen.getByText('Rate limit exceeded')).toBeInTheDocument()
      })
    }
  })

  it('displays dropped requests summary with layer and extension breakdowns', async () => {
    const stateWithMultipleDrops: GatewayState = {
      ...mockGatewayState,
      recentRequests: [
        mockDroppedRequest,
        {
          ...mockDroppedRequest,
          requestId: 'req-dropped-002',
          dropLayer: 'audit',
        },
        {
          ...mockDroppedRequest,
          requestId: 'req-dropped-003',
          dropLayer: 'auth',
        },
      ],
    }

    const { ghost } = await import('@/ipc/ghost')
    vi.mocked(ghost.gatewayState).mockResolvedValue(stateWithMultipleDrops)

    render(<GatewayTab />)

    await waitFor(() => {
      expect(screen.getByText('Dropped Requests Summary')).toBeInTheDocument()
    })

    expect(screen.getByText('Drops by Layer')).toBeInTheDocument()
    expect(screen.getByText('Drops by Extension')).toBeInTheDocument()

    const authDropsText = screen.getByText('Auth (QoS)')
    expect(authDropsText).toBeInTheDocument()
    
    const auditDropsText = screen.getByText('Audit (SI-10)')
    expect(auditDropsText).toBeInTheDocument()
  })

  it('shows WebSocket connected status indicator', async () => {
    const { useTelemetryWebSocket } = await import('@/hooks/useTelemetryWebSocket')
    vi.mocked(useTelemetryWebSocket).mockReturnValue({
      connectionState: 'connected',
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
      clearSubscriptions: vi.fn(),
      getCachedData: vi.fn(),
      eventCount: 0,
      droppedEvents: 0,
    })

    const { ghost } = await import('@/ipc/ghost')
    vi.mocked(ghost.gatewayState).mockResolvedValue(mockGatewayState)

    render(<GatewayTab />)

    await waitFor(() => {
      expect(screen.getByText('Live')).toBeInTheDocument()
    })
  })

  it('shows WebSocket disconnected status indicator', async () => {
    const { useTelemetryWebSocket } = await import('@/hooks/useTelemetryWebSocket')
    vi.mocked(useTelemetryWebSocket).mockReturnValue({
      connectionState: 'disconnected',
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
      clearSubscriptions: vi.fn(),
      getCachedData: vi.fn(),
      eventCount: 0,
      droppedEvents: 0,
    })

    const { ghost } = await import('@/ipc/ghost')
    vi.mocked(ghost.gatewayState).mockResolvedValue(mockGatewayState)

    render(<GatewayTab />)

    await waitFor(() => {
      expect(screen.getByText('Disconnected')).toBeInTheDocument()
    })
  })

  it('shows WebSocket reconnecting status indicator with animation', async () => {
    const { useTelemetryWebSocket } = await import('@/hooks/useTelemetryWebSocket')
    vi.mocked(useTelemetryWebSocket).mockReturnValue({
      connectionState: 'connecting',
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
      clearSubscriptions: vi.fn(),
      getCachedData: vi.fn(),
      eventCount: 0,
      droppedEvents: 0,
    })

    const { ghost } = await import('@/ipc/ghost')
    vi.mocked(ghost.gatewayState).mockResolvedValue(mockGatewayState)

    render(<GatewayTab />)

    await waitFor(() => {
      expect(screen.getByText('Reconnecting')).toBeInTheDocument()
    })

    const indicator = screen.getByText('Reconnecting').closest('div')
    const statusDot = indicator?.querySelector('.animate-pulse')
    expect(statusDot).toBeInTheDocument()
  })

  it('shows graceful degraded mode when data unavailable', async () => {
    const { ghost } = await import('@/ipc/ghost')
    vi.mocked(ghost.gatewayState).mockResolvedValue({
      extensions: [],
      recentRequests: [],
      trafficPolicerStates: {},
    })

    render(<GatewayTab />)

    await waitFor(() => {
      expect(screen.getByText('Pipeline I/O')).toBeInTheDocument()
    }, { timeout: 3000 })

    await waitFor(() => {
      const emptyState = screen.queryByText('Aucune requête récente')
      expect(emptyState || screen.getByText('Requêtes récentes')).toBeTruthy()
    }, { timeout: 3000 })
  })

  it('handles API error gracefully and shows toast notification', async () => {
    const mockPushToast = vi.fn()
    const { useToastsStore } = await import('@/stores/useToastsStore')
    vi.mocked(useToastsStore).mockReturnValue(mockPushToast)

    const { ghost } = await import('@/ipc/ghost')
    vi.mocked(ghost.gatewayState).mockRejectedValue(new Error('API Error'))

    render(<GatewayTab />)

    await waitFor(() => {
      expect(mockPushToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'État indisponible',
          tone: 'danger',
        })
      )
    })
  })

  it('refreshes data when actualiser button is clicked', async () => {
    const { ghost } = await import('@/ipc/ghost')
    vi.mocked(ghost.gatewayState).mockResolvedValue(mockGatewayState)

    const user = userEvent.setup()
    render(<GatewayTab />)

    await waitFor(() => {
      expect(screen.getByText('Actualiser')).toBeInTheDocument()
    })

    const refreshButton = screen.getByText('Actualiser')
    await user.click(refreshButton)

    expect(ghost.gatewayState).toHaveBeenCalledTimes(2)
  })

  it('displays stage health indicators based on error rates', async () => {
    const { ghost } = await import('@/ipc/ghost')
    vi.mocked(ghost.gatewayState).mockResolvedValue(mockGatewayState)

    render(<GatewayTab />)

    await waitFor(() => {
      expect(screen.getByText('Pipeline I/O')).toBeInTheDocument()
    })

    const healthIndicators = screen.getAllByText(/Healthy|Warning|Error/)
    expect(healthIndicators.length).toBeGreaterThan(0)
  })

  it('shows active request count on stage boxes', async () => {
    const stateWithPending: GatewayState = {
      ...mockGatewayState,
      recentRequests: [
        {
          requestId: 'req-pending-1',
          extensionId: 'ghost-git-extension',
          type: 'git',
          operation: 'push',
          timestamp: Date.now(),
          stage: 'auth',
          status: 'pending',
        },
        {
          requestId: 'req-pending-2',
          extensionId: 'ghost-git-extension',
          type: 'git',
          operation: 'pull',
          timestamp: Date.now(),
          stage: 'auth',
          status: 'pending',
        },
      ],
    }

    const { ghost } = await import('@/ipc/ghost')
    vi.mocked(ghost.gatewayState).mockResolvedValue(stateWithPending)

    render(<GatewayTab />)

    await waitFor(() => {
      expect(screen.getByText('Pipeline I/O')).toBeInTheDocument()
    })

    const badges = screen.getAllByText('2')
    expect(badges.length).toBeGreaterThan(0)
  })

  it('displays latency and throughput metrics for each stage', async () => {
    const { ghost } = await import('@/ipc/ghost')
    vi.mocked(ghost.gatewayState).mockResolvedValue(mockGatewayState)

    render(<GatewayTab />)

    await waitFor(() => {
      expect(screen.getByText('Pipeline I/O')).toBeInTheDocument()
    })

    const latencyElements = screen.getAllByText(/\d+ms/)
    expect(latencyElements.length).toBeGreaterThan(0)

    const throughputElements = screen.getAllByText(/req\/s/)
    expect(throughputElements.length).toBeGreaterThan(0)
  })

  it('formats timestamps correctly with milliseconds', async () => {
    const { ghost } = await import('@/ipc/ghost')
    vi.mocked(ghost.gatewayState).mockResolvedValue(mockGatewayState)

    render(<GatewayTab />)

    await waitFor(() => {
      expect(screen.getByText(/req-001/)).toBeInTheDocument()
    })

    const timestampElements = document.querySelectorAll('.font-mono.text-xs.text-white\\/60')
    const hasFormattedTime = Array.from(timestampElements).some(el => 
      /\d{2}:\d{2}:\d{2}\.\d{3}/.test(el.textContent || '')
    )
    expect(hasFormattedTime).toBe(true)
  })
})
