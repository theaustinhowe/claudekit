# Web Dashboard App

Next.js 16 app serving as the claudekit landing page and control center.

## Port: 2000

## Features

- Dashboard with health status for all claudekit apps (Gadget, GoGo Web, GoGo Orchestrator, B4U, Inspector)
- Live app status polling (running/stopped indicators)
- Log file listing with links to per-app log viewer
- Per-app log viewer with virtual scrolling (@tanstack/react-virtual)
- Real-time log tailing via SSE
- Filtering by level (TRACE, DEBUG, INFO, WARN, ERROR, FATAL), text search
- Color-coded log levels with row highlighting for WARN/ERROR/FATAL
- Theme support via @claudekit/hooks (9 color themes + light/dark/system)
- Uses @claudekit/logger for log file discovery

## Routes

- `/` — Dashboard with app health cards + log file listing
- `/logs/[app]` — Per-app log viewer

## API Routes

- `GET /api/health/apps` — Health check for all claudekit apps (probes each port)
- `GET /api/logs` — List all log files with stats
- `GET /api/logs/[app]` — Search/read log entries (query params: level, q, since, limit)
- `GET /api/logs/[app]/stream` — SSE real-time tail
