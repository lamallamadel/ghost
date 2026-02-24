1→# Ghost CLI - Agent Guide
2→
3→## Setup & Commands
4→
5→**Initial Setup:** `npm install` (root), `cd desktop && npm install` (desktop app)
6→
7→**Build:** `npm run build` (desktop only, creates production build)
8→
9→**Lint:** `npm run lint` (desktop only, runs ESLint on TypeScript/React files)
10→
11→**Test:** `npm test` (root runs test.js + integration tests in test/)
12→
13→**Dev Server:** `cd desktop && npm run desktop:dev` (Electron app with Vite HMR on :5173)
14→
15→## Tech Stack
16→
17→- **Root:** Pure Node.js CLI (no deps), zero-install design for global NPM package
18→- **Desktop:** Electron + React 18 + TypeScript + Vite + TailwindCSS + Zustand (state)
19→- **Testing:** Node assert (root), Vitest (desktop)
20→
21→## Architecture
22→
23→- `ghost.js`: Main CLI entry with AI-powered Git assistant (Groq/Anthropic/Gemini)
24→- `desktop/`: Electron monitoring console (React SPA) - dev-only, not published to NPM
25→- `test/`: Integration tests for version hooks, merge resolution, and audit features
26→
27→## Code Style
28→
29→- Root: Node.js CommonJS, minimal comments, ANSI color output
30→- Desktop: ESLint flat config, React hooks, TypeScript strict mode, functional components
31→