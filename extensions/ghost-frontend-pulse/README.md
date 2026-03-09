# Ghost Frontend-Pulse

Frontend performance and accessibility optimization assistant for the Ghost CLI ecosystem.

## Phase 2: Component Optimization & Accessibility (Completed)
This phase introduced deep analysis of UI components for better performance and inclusion.

### New Features
- **Component Memoization**: Detects large components that could benefit from `React.memo` or `useMemo`.
- **Interactive A11y Checks**: Identifies non-semantic interactive elements (e.g., `<div>` with `onClick`) lacking proper roles.
- **Framework-Specific Advice**: Suggests Next.js optimized components (like `next/image`) where applicable.
- **Bundle Size Optimization**: Detects excessive inline styles that impact initial load performance.

### New Commands
- `ghost fe optimize [path]`: Performs a semantic and performance optimization audit on a specific component file.

## Installation
```bash
ghost marketplace install ghost-frontend-pulse
```
