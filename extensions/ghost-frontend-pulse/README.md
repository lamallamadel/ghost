# Ghost Frontend-Pulse

Frontend performance and accessibility optimization assistant for the Ghost CLI ecosystem.

## Phase 1: Core Analysis (Completed)
This phase established the foundation for detecting common web performance and accessibility issues in source code.

### Features
- **Static Performance Audit**: Detects missing image `alt` tags, insecure external links, and missing lazy loading.
- **AI-Powered Deep-Dive**: Leverages expert web performance AI to analyze React, Next.js, and Vue components.
- **Core Web Vitals Focus**: Recommends optimizations to improve LCP, FID, and CLS scores.

### Commands
- `ghost fe analyze [file]`: Scans code for frontend anti-patterns and performance bottlenecks.

## Installation
```bash
ghost marketplace install ghost-frontend-pulse
```
