/**
 * Ghost Desktop E2E Test Suite Index
 * 
 * Comprehensive Playwright E2E tests for Ghost Console desktop Electron app.
 * 
 * Test Coverage:
 * - WebSocket telemetry integration (connection, reconnection, real-time updates)
 * - Pipeline visualization (4-stage animation, health indicators, metrics)
 * - Extension manager (enable/disable, metrics, metadata editing, restarts)
 * - Manual override dialog (justification validation, audit logging)
 * - Visual regression (UI consistency across views)
 * - Performance benchmarks (render times, 1000+ concurrent requests, memory usage)
 * 
 * @see e2e/README.md for detailed documentation
 * @see E2E_SETUP.md for setup instructions
 */

export * from './fixtures/electron';
export * from './helpers/websocket-mock';
export * from './helpers/screenshot-helpers';
export * from './utils/test-data-generator';
export * from './utils/performance-helpers';
