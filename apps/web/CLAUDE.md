# Web Dashboard App

Next.js 16 app serving as the ClaudeKit landing page and control center.

## Port: 2000

## Features

- Dashboard with health status for all ClaudeKit apps (Gadget, GoGo Web, GoGo Orchestrator, B4U, Inspector, Inside)
- Live app status polling (running/stopped indicators) with debounced transitions
- Log file listing with links to per-app log viewer
- Per-app log viewer with virtual scrolling (@tanstack/react-virtual)
- Real-time log tailing via SSE
- Filtering by level (TRACE, DEBUG, INFO, WARN, ERROR, FATAL), text search
- Color-coded log levels with row highlighting for WARN/ERROR/FATAL
- Per-app todo lists with file-based persistence
- App management (start/stop/restart) via daemon proxy
- Setup wizard for configuring app environment variables
- Theme support via @claudekit/hooks (9 color themes + light/dark/system)

## Directory Layout

```
src/
├── app/
│   ├── layout.tsx                    # Root layout (theme + header)
│   ├── page.tsx                      # Dashboard server component
│   ├── logs/[app]/page.tsx           # Log viewer server component
│   └── api/
│       ├── health/apps/route.ts      # Health probes for all apps
│       ├── logs/route.ts             # List log files
│       ├── logs/[app]/route.ts       # Read/search log entries
│       ├── logs/[app]/stream/route.ts # SSE real-time tail
│       ├── apps/settings/route.ts    # Per-app settings (auto-start/restart)
│       ├── apps/[id]/restart/route.ts
│       ├── apps/[id]/stop/route.ts
│       └── todos/[app]/route.ts      # CRUD for per-app todos
├── components/
│   ├── header.tsx
│   ├── log-viewer-client.tsx         # Virtual scrolling + SSE log viewer
│   ├── dashboard/
│   │   └── dashboard-client.tsx      # Health cards + todo indicators
│   ├── todos/
│   │   ├── use-todos.ts              # Hook with optimistic updates + rollback
│   │   ├── todo-sheet.tsx            # Sheet drawer per app
│   │   ├── todo-item.tsx             # Inline editing, keyboard shortcuts
│   │   ├── todo-add-form.tsx
│   │   └── todo-empty-state.tsx
│   └── setup-wizard/                 # Multi-step env configuration
└── lib/
    ├── todos.ts                      # File-based persistence (~/.claudekit/todos/)
    ├── app-settings.ts               # Per-app settings (~/.claudekit/app-settings.json)
    ├── env-parser.ts
    └── actions/setup-wizard.ts
```

## Data Layer

This app has **no DuckDB** — it reads log files via `@claudekit/logger` and probes other apps via HTTP health checks. Todos are stored as JSON files in `~/.claudekit/todos/[appId].json`.

## Routes

- `/` — Dashboard with app health cards + log file listing
- `/logs/[app]` — Per-app log viewer with date picker

## API Routes

- `GET /api/health/apps` — Probe all app ports (2s timeout each), optionally checks daemon at `:2999`
- `GET /api/logs` — List all log files with stats
- `GET /api/logs/[app]` — Search/read log entries (query params: level, q, since, limit)
- `GET /api/logs/[app]/stream` — SSE real-time tail (sends last 50 lines, then watches for changes)
- `GET|PUT /api/apps/settings` — Per-app auto-start/auto-restart settings
- `POST /api/apps/[id]/restart` — Proxy restart to daemon
- `POST /api/apps/[id]/stop` — Proxy stop to daemon
- `GET|POST|PATCH|DELETE /api/todos/[app]` — Todo CRUD with UUID IDs

## Key Patterns

### Health Polling

Dashboard polls `/api/health/apps` every 10 seconds. Status transitions are **debounced** — an app must maintain its status for 2 consecutive polls before moving between active/inactive sections. This prevents UI flashing during restarts.

### Virtual Scrolling (Log Viewer)

Uses `@tanstack/react-virtual` with 32px estimated row size and 20-row overscan. Buffer limited to 5000 lines. Strict `contain` CSS for performance.

### SSE Log Tailing

Enabled only for today's logs. Watches the log file for size changes, sends new lines as SSE events. Auto-reconnects on connection loss. Heartbeat every 15s. User can pause/resume tailing; auto-scrolls only if user hasn't manually scrolled.

### Todos (Optimistic Updates)

`use-todos.ts` hook applies state changes immediately, then syncs to the API. On error, rolls back optimistic state and shows a toast. Inline editing uses double-rAF focus management to work within Sheet dialog focus traps.

## Dependencies

- `@claudekit/ui` — shadcn components
- `@claudekit/hooks` — Theme system (useAppTheme)
- `@claudekit/logger` — Log file discovery, reading, filtering
- `@tanstack/react-virtual` — Virtual scrolling
- `sonner` — Toast notifications
