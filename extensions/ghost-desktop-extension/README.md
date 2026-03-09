# Ghost Desktop Console Extension

Desktop UI and real-time monitoring dashboard for the Ghost CLI ecosystem.

## Features
- **Integrated Console**: Unified command to start the telemetry server and the Desktop UI.
- **Real-time Monitoring**: Visualizes Ghost I/O pipeline, spans, and metrics.
- **Headless Mode**: Support for `--no-ui` to run only the telemetry server.
- **Native Orchestration**: Built as a standard Ghost extension utilizing cross-layer intents.

## Commands
- `ghost console [start|stop]`: Manages the telemetry server and launches the Desktop UI.

## Installation
The desktop extension is bundled with Ghost CLI.
```bash
ghost extension install extensions/ghost-desktop-extension
```
