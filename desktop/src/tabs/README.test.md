# UI Component Tests for GatewayTab and ExtensionsTab

This directory contains comprehensive UI component tests using Vitest and React Testing Library.

## Test Files

### GatewayTab.test.tsx
Tests for the Gateway Pipeline visualization tab, covering:
- Rendering with mock GatewayState data showing extensions and requests
- Pipeline stage boxes with correct colors (blue/yellow/purple/emerald) and labels
- Dropped requests rendering with red styling and drop reason badges (QoS/SI-10)
- Expanding dropped requests to show detailed rejection information
- Dropped requests summary with layer and extension breakdowns
- WebSocket connection state transitions (connected→disconnected→reconnecting)
- Stage health indicators based on error rates
- Active request count badges on stage boxes
- Latency and throughput metrics display
- Timestamp formatting with milliseconds
- Graceful degraded mode when data unavailable
- API error handling with toast notifications

### ExtensionsTab.test.tsx
Tests for the Extensions management tab, covering:
- Extension list rendering with health indicators and I/O stats
- Runtime health display with uptime, crash count, PID, and memory usage
- Health badges for all states (healthy/degraded/crashed/restarting)
- TokenBucketVisualization gauges with committed/excess tokens
- TokenBucketVisualization updates when TrafficPolicerState props change
- I/O performance metrics with latency percentiles (p50/p95/p99)
- Intent type breakdown (filesystem/network/git/process)
- Rate limit compliance percentages (green/yellow/red)
- Request size statistics
- ManualOverrideDialog form validation (minimum reason length)
- ManualOverrideDialog confirmation checkbox requirement
- ManualOverrideDialog submission with audit confirmation
- ManualOverrideDialog error handling
- WebSocket connection states and fallback to polling
- Capabilities display (filesystem/network/git)
- Permissions list display
- Health trend sparkline visualization
- Restart history when available
- Extension count badge
- Graceful degraded mode when no extensions available

## Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm test -- --watch

# Run tests with UI
npm test -- --ui

# Run tests with coverage
npm test -- --coverage
```

## Test Infrastructure

- **Testing Framework**: Vitest 3.2.4
- **React Testing**: @testing-library/react 16.1.0
- **User Interactions**: @testing-library/user-event 14.5.2
- **DOM Matchers**: @testing-library/jest-dom 6.6.3
- **DOM Environment**: happy-dom 16.11.0

## Mock Strategy

All tests use comprehensive mocking:
- `@/ipc/ghost` - Mocked for API calls
- `@/stores/useToastsStore` - Mocked for toast notifications
- `@/hooks/useTelemetryWebSocket` - Mocked for WebSocket state
- `@/components/ExtensionMetricsChart` - Simple mock component

## Coverage Areas

### WebSocket Connection States
- ✅ Connected (Live status)
- ✅ Disconnected (Disconnected status)
- ✅ Connecting/Reconnecting (with pulse animation)
- ✅ Error state

### Request States
- ✅ Pending requests
- ✅ Approved/Completed requests
- ✅ Rejected/Failed requests
- ✅ Dropped requests (auth layer - QoS)
- ✅ Dropped requests (audit layer - SI-10)

### Health States
- ✅ Healthy (emerald badge)
- ✅ Degraded (yellow badge)
- ✅ Crashed (rose badge)
- ✅ Restarting (blue badge with spinning icon)

### Form Validation
- ✅ Minimum character count (50 chars)
- ✅ Required fields (password, confirmation checkbox)
- ✅ JSON validation for params field
- ✅ Scope limitations (paths/URLs)
- ✅ Duration selection

### Degraded Mode
- ✅ No extensions loaded
- ✅ No recent requests
- ✅ API errors with toast notifications
- ✅ Missing data handled gracefully

## Test Patterns

### Async Testing
```typescript
await waitFor(() => {
  expect(screen.getByText('Expected Text')).toBeInTheDocument()
})
```

### User Events
```typescript
const user = userEvent.setup()
await user.click(button)
await user.type(input, 'text')
```

### Mock Returns
```typescript
vi.mocked(ghost.gatewayState).mockResolvedValue(mockData)
vi.mocked(ghost.manualOverride).mockRejectedValue(new Error('Failed'))
```

### Component Queries
```typescript
screen.getByText() // throws if not found
screen.queryByText() // returns null if not found
within(element).getByText() // scoped queries
```
