# Logs Viewer App

Next.js 16 app for viewing structured logs from all devkit applications.

## Port: 2300

## Features

- Dashboard listing all log files with metadata
- Per-app log viewer with virtual scrolling (@tanstack/react-virtual)
- Real-time log tailing via SSE
- Filtering by level, text search
- Uses @devkit/logger for log file discovery

## API Routes

- `GET /api/logs` — list all log files with stats
- `GET /api/logs/[app]` — search/read log entries (query params: level, q, since, limit)
- `GET /api/logs/[app]/stream` — SSE real-time tail
