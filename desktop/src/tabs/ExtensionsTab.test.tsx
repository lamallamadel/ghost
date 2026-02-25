import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ExtensionsTab } from './ExtensionsTab'
import type { GatewayState, ExtensionInfo, TrafficPolicerState } from '@/ipc/types'

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

vi.mock('@/components/ExtensionMetricsChart', () => ({
  ExtensionMetricsChart: ({ title }: { title: string }) => <div>{title}</div>,
}))

const mockTrafficPolicerState: TrafficPolicerState = {
  committedTokens: 75,
  excessTokens: 30,
  committedCapacity: 100,
  excessCapacity: 50,
  cir: 120,
  lastRefill: Date.now(),
}

const mockExtension: ExtensionInfo = {
  manifest: {
    id: 'ghost-git-extension',
    name: 'Ghost Git Extension',
    version: '1.0.0',
    capabilities: {
      git: { read: true, write: true },
      filesystem: {
        read: ['/project/**'],
        write: ['/project/.git/**'],
      },
      network: {
        allowlist: ['github.com', 'gitlab.com'],
        rateLimit: { cir: 120, bc: 100, be: 50 },
      },
    },
    permissions: ['git:read', 'git:write', 'fs:read'],
  },
  stats: {
    requestsApproved: 150,
    requestsRejected: 5,
    requestsRateLimited: 3,
    lastActivity: new Date().toISOString(),
    metrics: {
      latency: { p50: 12.5, p95: 45.3, p99: 89.7 },
      throughputHistory: [
        { timestamp: Date.now() - 60000, requestsPerMinute: 50 },
        { timestamp: Date.now() - 30000, requestsPerMinute: 60 },
        { timestamp: Date.now(), requestsPerMinute: 55 },
      ],
      intentBreakdown: {
        filesystem: 45,
        network: 30,
        git: 70,
        process: 5,
      },
      rateLimitCompliance: {
        green: 140,
        yellow: 8,
        red: 2,
      },
      requestSizeStats: {
        avgRequestBytes: 2048,
        avgResponseBytes: 4096,
      },
    },
  },
  trafficPolicerState: mockTrafficPolicerState,
  runtimeState: {
    health: 'healthy',
    uptime: 3600000,
    crashCount: 0,
    restartHistory: [],
    processIsolation: {
      pid: 12345,
      memoryUsageMB: 45.2,
    },
    healthTrend: [98, 99, 97, 100, 99, 98],
  },
}

const mockGatewayState: GatewayState = {
  extensions: [mockExtension],
  recentRequests: [],
  trafficPolicerStates: {
    'ghost-git-extension': mockTrafficPolicerState,
  },
}

describe('ExtensionsTab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.clearAllTimers()
  })

  it('renders extension list with health indicators and I/O stats', async () => {
    const { ghost } = await import('@/ipc/ghost')
    vi.mocked(ghost.gatewayState).mockResolvedValue(mockGatewayState)

    render(<ExtensionsTab />)

    await waitFor(() => {
      expect(screen.getByText('Extensions chargées')).toBeInTheDocument()
    })

    expect(screen.getByText('Ghost Git Extension')).toBeInTheDocument()
    expect(screen.getByText('v1.0.0')).toBeInTheDocument()
    expect(screen.getByText('Healthy')).toBeInTheDocument()

    expect(screen.getByText('150')).toBeInTheDocument()
    expect(screen.getByText('5')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
  })

  it('displays runtime health with uptime and crash count', async () => {
    const { ghost } = await import('@/ipc/ghost')
    vi.mocked(ghost.gatewayState).mockResolvedValue(mockGatewayState)

    const user = userEvent.setup()
    render(<ExtensionsTab />)

    await waitFor(() => {
      expect(screen.getByText('Ghost Git Extension')).toBeInTheDocument()
    })

    const detailsButton = screen.getByText('Détails')
    await user.click(detailsButton)

    await waitFor(() => {
      expect(screen.getByText('Runtime Health')).toBeInTheDocument()
      expect(screen.getByText('1h')).toBeInTheDocument()
      expect(screen.getByText('0')).toBeInTheDocument()
      expect(screen.getByText('12345')).toBeInTheDocument()
      expect(screen.getByText('45.2 MB')).toBeInTheDocument()
    })
  })

  it('shows degraded health badge with warning styling', async () => {
    const degradedExtension: ExtensionInfo = {
      ...mockExtension,
      runtimeState: {
        ...mockExtension.runtimeState!,
        health: 'degraded',
        crashCount: 2,
      },
    }

    const { ghost } = await import('@/ipc/ghost')
    vi.mocked(ghost.gatewayState).mockResolvedValue({
      ...mockGatewayState,
      extensions: [degradedExtension],
    })

    render(<ExtensionsTab />)

    await waitFor(() => {
      expect(screen.getByText('Degraded')).toBeInTheDocument()
    })

    const badge = screen.getByText('Degraded').closest('div')
    expect(badge).toHaveClass('border-yellow-500/30', 'bg-yellow-500/10')
  })

  it('shows crashed health badge with error styling', async () => {
    const crashedExtension: ExtensionInfo = {
      ...mockExtension,
      runtimeState: {
        ...mockExtension.runtimeState!,
        health: 'crashed',
        crashCount: 5,
      },
    }

    const { ghost } = await import('@/ipc/ghost')
    vi.mocked(ghost.gatewayState).mockResolvedValue({
      ...mockGatewayState,
      extensions: [crashedExtension],
    })

    render(<ExtensionsTab />)

    await waitFor(() => {
      expect(screen.getByText('Crashed')).toBeInTheDocument()
    })

    const badge = screen.getByText('Crashed').closest('div')
    expect(badge).toHaveClass('border-rose-500/30', 'bg-rose-500/10')
  })

  it('shows restarting health badge with spinning icon', async () => {
    const restartingExtension: ExtensionInfo = {
      ...mockExtension,
      runtimeState: {
        ...mockExtension.runtimeState!,
        health: 'restarting',
      },
    }

    const { ghost } = await import('@/ipc/ghost')
    vi.mocked(ghost.gatewayState).mockResolvedValue({
      ...mockGatewayState,
      extensions: [restartingExtension],
    })

    render(<ExtensionsTab />)

    await waitFor(() => {
      expect(screen.getByText('Restarting')).toBeInTheDocument()
    })

    const badge = screen.getByText('Restarting').closest('div')
    expect(badge).toHaveClass('border-blue-500/30', 'bg-blue-500/10')
  })

  it('displays TokenBucketVisualization gauges with correct values', async () => {
    const { ghost } = await import('@/ipc/ghost')
    vi.mocked(ghost.gatewayState).mockResolvedValue(mockGatewayState)

    const user = userEvent.setup()
    render(<ExtensionsTab />)

    await waitFor(() => {
      expect(screen.getByText('Ghost Git Extension')).toBeInTheDocument()
    })

    const detailsButton = screen.getByText('Détails')
    await user.click(detailsButton)

    await waitFor(() => {
      expect(screen.getByText('Traffic Policing (2r3c Token Bucket)')).toBeInTheDocument()
    })

    expect(screen.getByText('75/100')).toBeInTheDocument()
    expect(screen.getByText('30/50')).toBeInTheDocument()
    expect(screen.getByText('120 req/min')).toBeInTheDocument()
  })

  it('updates TokenBucketVisualization when TrafficPolicerState props change', async () => {
    const { ghost } = await import('@/ipc/ghost')
    
    const initialState = mockGatewayState
    vi.mocked(ghost.gatewayState).mockResolvedValue(initialState)

    const { rerender } = render(<ExtensionsTab />)

    const user = userEvent.setup()
    
    await waitFor(() => {
      expect(screen.getByText('Ghost Git Extension')).toBeInTheDocument()
    })

    const detailsButton = screen.getByText('Détails')
    await user.click(detailsButton)

    await waitFor(() => {
      expect(screen.getByText('75/100')).toBeInTheDocument()
    })

    const updatedState: GatewayState = {
      ...mockGatewayState,
      extensions: [{
        ...mockExtension,
        trafficPolicerState: {
          ...mockTrafficPolicerState,
          committedTokens: 50,
          excessTokens: 10,
        },
      }],
    }

    vi.mocked(ghost.gatewayState).mockResolvedValue(updatedState)
    
    rerender(<ExtensionsTab />)

    await waitFor(() => {
      expect(screen.getByText('50/100')).toBeInTheDocument()
      expect(screen.getByText('10/50')).toBeInTheDocument()
    })
  })

  it('displays I/O performance metrics with latency percentiles', async () => {
    const { ghost } = await import('@/ipc/ghost')
    vi.mocked(ghost.gatewayState).mockResolvedValue(mockGatewayState)

    const user = userEvent.setup()
    render(<ExtensionsTab />)

    await waitFor(() => {
      expect(screen.getByText('Ghost Git Extension')).toBeInTheDocument()
    })

    const detailsButton = screen.getByText('Détails')
    await user.click(detailsButton)

    await waitFor(() => {
      expect(screen.getByText('I/O Performance Metrics')).toBeInTheDocument()
      expect(screen.getByText('12.5')).toBeInTheDocument()
      expect(screen.getByText('45.3')).toBeInTheDocument()
      expect(screen.getByText('89.7')).toBeInTheDocument()
    })
  })

  it('displays intent type breakdown with counts', async () => {
    const { ghost } = await import('@/ipc/ghost')
    vi.mocked(ghost.gatewayState).mockResolvedValue(mockGatewayState)

    const user = userEvent.setup()
    render(<ExtensionsTab />)

    await waitFor(() => {
      expect(screen.getByText('Ghost Git Extension')).toBeInTheDocument()
    })

    const detailsButton = screen.getByText('Détails')
    await user.click(detailsButton)

    await waitFor(() => {
      expect(screen.getByText('Intent Type Breakdown')).toBeInTheDocument()
      expect(screen.getByText('45')).toBeInTheDocument()
      expect(screen.getByText('30')).toBeInTheDocument()
      expect(screen.getByText('70')).toBeInTheDocument()
      expect(screen.getByText('5')).toBeInTheDocument()
    })
  })

  it('displays rate limit compliance with percentages', async () => {
    const { ghost } = await import('@/ipc/ghost')
    vi.mocked(ghost.gatewayState).mockResolvedValue(mockGatewayState)

    const user = userEvent.setup()
    render(<ExtensionsTab />)

    await waitFor(() => {
      expect(screen.getByText('Ghost Git Extension')).toBeInTheDocument()
    })

    const detailsButton = screen.getByText('Détails')
    await user.click(detailsButton)

    await waitFor(() => {
      expect(screen.getByText('Rate Limit Compliance')).toBeInTheDocument()
    })

    const greenPercent = (140 / 150 * 100).toFixed(1)
    const yellowPercent = (8 / 150 * 100).toFixed(1)
    const redPercent = (2 / 150 * 100).toFixed(1)

    expect(screen.getByText(`${greenPercent}%`)).toBeInTheDocument()
    expect(screen.getByText(`${yellowPercent}%`)).toBeInTheDocument()
    expect(screen.getByText(`${redPercent}%`)).toBeInTheDocument()
  })

  it('displays request size statistics', async () => {
    const { ghost } = await import('@/ipc/ghost')
    vi.mocked(ghost.gatewayState).mockResolvedValue(mockGatewayState)

    const user = userEvent.setup()
    render(<ExtensionsTab />)

    await waitFor(() => {
      expect(screen.getByText('Ghost Git Extension')).toBeInTheDocument()
    })

    const detailsButton = screen.getByText('Détails')
    await user.click(detailsButton)

    await waitFor(() => {
      expect(screen.getByText('Request Size Statistics')).toBeInTheDocument()
      expect(screen.getByText('2.00')).toBeInTheDocument()
      expect(screen.getByText('4.00')).toBeInTheDocument()
    })
  })

  it('opens ManualOverrideDialog when button clicked', async () => {
    const { ghost } = await import('@/ipc/ghost')
    vi.mocked(ghost.gatewayState).mockResolvedValue(mockGatewayState)

    const user = userEvent.setup()
    render(<ExtensionsTab />)

    await waitFor(() => {
      expect(screen.getByText('Ghost Git Extension')).toBeInTheDocument()
    })

    const overrideButton = screen.getByText('Manual Override')
    await user.click(overrideButton)

    await waitFor(() => {
      expect(screen.getByText('SI-10(1) Manual Override')).toBeInTheDocument()
      expect(screen.getByText('AVERTISSEMENT : Action Exceptionnelle')).toBeInTheDocument()
    })
  })

  it('validates ManualOverrideDialog form with minimum reason length', async () => {
    const { ghost } = await import('@/ipc/ghost')
    vi.mocked(ghost.gatewayState).mockResolvedValue(mockGatewayState)

    const user = userEvent.setup()
    render(<ExtensionsTab />)

    await waitFor(() => {
      expect(screen.getByText('Ghost Git Extension')).toBeInTheDocument()
    })

    const overrideButton = screen.getByText('Manual Override')
    await user.click(overrideButton)

    await waitFor(() => {
      expect(screen.getByText('SI-10(1) Manual Override')).toBeInTheDocument()
    })

    const reasonTextarea = screen.getByPlaceholderText(/JUSTIFICATION TEMPLATE/)
    await user.type(reasonTextarea, 'Short reason')

    const submitButton = screen.getByText('Approuver Override')
    expect(submitButton).toBeDisabled()

    expect(screen.getByText(/Justification insuffisante/)).toBeInTheDocument()
  })

  it('validates ManualOverrideDialog requires confirmation checkbox', async () => {
    const { ghost } = await import('@/ipc/ghost')
    vi.mocked(ghost.gatewayState).mockResolvedValue(mockGatewayState)

    const user = userEvent.setup()
    render(<ExtensionsTab />)

    await waitFor(() => {
      expect(screen.getByText('Ghost Git Extension')).toBeInTheDocument()
    })

    const overrideButton = screen.getByText('Manual Override')
    await user.click(overrideButton)

    await waitFor(() => {
      expect(screen.getByText('SI-10(1) Manual Override')).toBeInTheDocument()
    })

    const longReason = 'This is a very detailed justification that exceeds the minimum required character count for the manual override form submission'
    const reasonTextarea = screen.getByPlaceholderText(/JUSTIFICATION TEMPLATE/)
    await user.type(reasonTextarea, longReason)

    const password = screen.getByPlaceholderText(/Entrez votre mot de passe/)
    await user.type(password, 'test-password')

    const submitButton = screen.getByText('Approuver Override')
    expect(submitButton).toBeDisabled()

    const checkbox = screen.getByRole('checkbox')
    await user.click(checkbox)

    expect(submitButton).not.toBeDisabled()
  })

  it('submits ManualOverrideDialog with valid form data and shows audit confirmation', async () => {
    const mockPushToast = vi.fn()
    const { useToastsStore } = await import('@/stores/useToastsStore')
    vi.mocked(useToastsStore).mockReturnValue(mockPushToast)

    const { ghost } = await import('@/ipc/ghost')
    vi.mocked(ghost.gatewayState).mockResolvedValue(mockGatewayState)
    vi.mocked(ghost.manualOverride).mockResolvedValue({
      approved: true,
      auditLogId: 'audit-123',
    })

    const user = userEvent.setup()
    render(<ExtensionsTab />)

    await waitFor(() => {
      expect(screen.getByText('Ghost Git Extension')).toBeInTheDocument()
    })

    const overrideButton = screen.getByText('Manual Override')
    await user.click(overrideButton)

    await waitFor(() => {
      expect(screen.getByText('SI-10(1) Manual Override')).toBeInTheDocument()
    })

    const longReason = 'This is a very detailed justification that exceeds the minimum required character count for the manual override form submission. Business need is critical for production deployment.'
    const reasonTextarea = screen.getByPlaceholderText(/JUSTIFICATION TEMPLATE/)
    await user.clear(reasonTextarea)
    await user.type(reasonTextarea, longReason)

    const password = screen.getByPlaceholderText(/Entrez votre mot de passe/)
    await user.type(password, 'test-password')

    const checkbox = screen.getByRole('checkbox')
    await user.click(checkbox)

    const submitButton = screen.getByText('Approuver Override')
    await user.click(submitButton)

    await waitFor(() => {
      expect(ghost.manualOverride).toHaveBeenCalledWith(
        expect.objectContaining({
          extensionId: 'ghost-git-extension',
          reason: longReason,
        })
      )
    })

    await waitFor(() => {
      expect(mockPushToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Override approuvé',
          message: 'Audit ID: audit-123',
          tone: 'success',
        })
      )
    })
  })

  it('shows error toast when ManualOverrideDialog submission fails', async () => {
    const mockPushToast = vi.fn()
    const { useToastsStore } = await import('@/stores/useToastsStore')
    vi.mocked(useToastsStore).mockReturnValue(mockPushToast)

    const { ghost } = await import('@/ipc/ghost')
    vi.mocked(ghost.gatewayState).mockResolvedValue(mockGatewayState)
    vi.mocked(ghost.manualOverride).mockResolvedValue({
      approved: false,
      reason: 'Security policy violation',
    })

    const user = userEvent.setup()
    render(<ExtensionsTab />)

    await waitFor(() => {
      expect(screen.getByText('Ghost Git Extension')).toBeInTheDocument()
    })

    const overrideButton = screen.getByText('Manual Override')
    await user.click(overrideButton)

    await waitFor(() => {
      expect(screen.getByText('SI-10(1) Manual Override')).toBeInTheDocument()
    })

    const longReason = 'This is a very detailed justification that exceeds the minimum required character count for the manual override form submission. Business need is critical.'
    const reasonTextarea = screen.getByPlaceholderText(/JUSTIFICATION TEMPLATE/)
    await user.clear(reasonTextarea)
    await user.type(reasonTextarea, longReason)

    const password = screen.getByPlaceholderText(/Entrez votre mot de passe/)
    await user.type(password, 'test-password')

    const checkbox = screen.getByRole('checkbox')
    await user.click(checkbox)

    const submitButton = screen.getByText('Approuver Override')
    await user.click(submitButton)

    await waitFor(() => {
      expect(mockPushToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Override refusé',
          message: 'Security policy violation',
          tone: 'danger',
        })
      )
    })
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

    render(<ExtensionsTab />)

    await waitFor(() => {
      expect(screen.getByText('Live')).toBeInTheDocument()
    })
  })

  it('shows WebSocket disconnected status and falls back to polling', async () => {
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

    render(<ExtensionsTab />)

    await waitFor(() => {
      expect(screen.getByText('Disconnected')).toBeInTheDocument()
    })
  })

  it('shows graceful degraded mode when no extensions available', async () => {
    const { ghost } = await import('@/ipc/ghost')
    vi.mocked(ghost.gatewayState).mockResolvedValue({
      extensions: [],
      recentRequests: [],
      trafficPolicerStates: {},
    })

    render(<ExtensionsTab />)

    await waitFor(() => {
      expect(screen.getByText('Aucune extension chargée')).toBeInTheDocument()
    })
  })

  it('displays capabilities section with filesystem, network, and git permissions', async () => {
    const { ghost } = await import('@/ipc/ghost')
    vi.mocked(ghost.gatewayState).mockResolvedValue(mockGatewayState)

    const user = userEvent.setup()
    render(<ExtensionsTab />)

    await waitFor(() => {
      expect(screen.getByText('Ghost Git Extension')).toBeInTheDocument()
    })

    const detailsButton = screen.getByText('Détails')
    await user.click(detailsButton)

    await waitFor(() => {
      expect(screen.getByText('Capabilities')).toBeInTheDocument()
      expect(screen.getByText('Filesystem')).toBeInTheDocument()
      expect(screen.getByText('Network')).toBeInTheDocument()
      expect(screen.getByText('Git')).toBeInTheDocument()
    })

    expect(screen.getByText(/\/project\/\*\*/)).toBeInTheDocument()
    expect(screen.getByText(/github\.com/)).toBeInTheDocument()
  })

  it('displays permissions list', async () => {
    const { ghost } = await import('@/ipc/ghost')
    vi.mocked(ghost.gatewayState).mockResolvedValue(mockGatewayState)

    const user = userEvent.setup()
    render(<ExtensionsTab />)

    await waitFor(() => {
      expect(screen.getByText('Ghost Git Extension')).toBeInTheDocument()
    })

    const detailsButton = screen.getByText('Détails')
    await user.click(detailsButton)

    await waitFor(() => {
      expect(screen.getByText('Permissions')).toBeInTheDocument()
      expect(screen.getByText('git:read')).toBeInTheDocument()
      expect(screen.getByText('git:write')).toBeInTheDocument()
      expect(screen.getByText('fs:read')).toBeInTheDocument()
    })
  })

  it('displays health trend sparkline', async () => {
    const { ghost } = await import('@/ipc/ghost')
    vi.mocked(ghost.gatewayState).mockResolvedValue(mockGatewayState)

    const user = userEvent.setup()
    render(<ExtensionsTab />)

    await waitFor(() => {
      expect(screen.getByText('Ghost Git Extension')).toBeInTheDocument()
    })

    const detailsButton = screen.getByText('Détails')
    await user.click(detailsButton)

    await waitFor(() => {
      expect(screen.getByText('Success Rate Trend')).toBeInTheDocument()
    })

    const svgElements = document.querySelectorAll('svg polyline')
    expect(svgElements.length).toBeGreaterThan(0)
  })

  it('displays restart history when available', async () => {
    const extensionWithRestarts: ExtensionInfo = {
      ...mockExtension,
      runtimeState: {
        ...mockExtension.runtimeState!,
        crashCount: 2,
        restartHistory: [
          {
            timestamp: new Date(Date.now() - 3600000).toISOString(),
            reason: 'Crash detected',
            exitCode: 1,
          },
          {
            timestamp: new Date(Date.now() - 7200000).toISOString(),
            reason: 'Manual restart',
            exitCode: 0,
          },
        ],
      },
    }

    const { ghost } = await import('@/ipc/ghost')
    vi.mocked(ghost.gatewayState).mockResolvedValue({
      ...mockGatewayState,
      extensions: [extensionWithRestarts],
    })

    const user = userEvent.setup()
    render(<ExtensionsTab />)

    await waitFor(() => {
      expect(screen.getByText('Ghost Git Extension')).toBeInTheDocument()
    })

    const detailsButton = screen.getByText('Détails')
    await user.click(detailsButton)

    await waitFor(() => {
      expect(screen.getByText('Restart History')).toBeInTheDocument()
      expect(screen.getByText('Crash detected')).toBeInTheDocument()
      expect(screen.getByText('Manual restart')).toBeInTheDocument()
      expect(screen.getByText('Exit: 1')).toBeInTheDocument()
      expect(screen.getByText('Exit: 0')).toBeInTheDocument()
    })
  })

  it('refreshes data when actualiser button is clicked', async () => {
    const { ghost } = await import('@/ipc/ghost')
    vi.mocked(ghost.gatewayState).mockResolvedValue(mockGatewayState)

    const user = userEvent.setup()
    render(<ExtensionsTab />)

    await waitFor(() => {
      expect(screen.getByText('Actualiser')).toBeInTheDocument()
    })

    const refreshButton = screen.getByText('Actualiser')
    await user.click(refreshButton)

    expect(ghost.gatewayState).toHaveBeenCalledTimes(2)
  })

  it('displays extension count badge', async () => {
    const { ghost } = await import('@/ipc/ghost')
    vi.mocked(ghost.gatewayState).mockResolvedValue(mockGatewayState)

    render(<ExtensionsTab />)

    await waitFor(() => {
      expect(screen.getByText('1 extension')).toBeInTheDocument()
    })
  })

  it('handles API error gracefully and shows toast notification', async () => {
    const mockPushToast = vi.fn()
    const { useToastsStore } = await import('@/stores/useToastsStore')
    vi.mocked(useToastsStore).mockReturnValue(mockPushToast)

    const { ghost } = await import('@/ipc/ghost')
    vi.mocked(ghost.gatewayState).mockRejectedValue(new Error('API Error'))

    render(<ExtensionsTab />)

    await waitFor(() => {
      expect(mockPushToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'État indisponible',
          tone: 'danger',
        })
      )
    })
  })
})
