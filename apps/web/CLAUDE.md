# Web Dashboard App

Next.js 16 app serving as the ClaudeKit landing page and control center.

## Port: 2000

## Features

- Dashboard with health status for all ClaudeKit apps (Inside, Gadget, GoGo Web, GoGo Orchestrator, B4U, Inspector, Storybook, DuckTails)
- App maturity tracking (Alpha/Beta/Stable) with editable percentage overrides
- Live app status polling (running/stopped indicators) with debounced transitions
- Log file listing with links to per-app log viewer
- Per-app log viewer with virtual scrolling (@tanstack/react-virtual)
- Real-time log tailing via SSE
- Filtering by level (TRACE, DEBUG, INFO, WARN, ERROR, FATAL), text search
- Color-coded log levels with row highlighting for WARN/ERROR/FATAL
- Per-app todo lists with file-based persistence
- App management (start/stop/restart) via daemon proxy
- Toolbox — dev tool version checker (Node.js, pnpm, Homebrew, Claude, etc.) with update detection
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
│       ├── apps/maturity/route.ts    # App maturity percentage overrides
│       ├── apps/[id]/restart/route.ts
│       ├── apps/[id]/stop/route.ts
│       ├── todos/[app]/route.ts      # CRUD for per-app todos
│       └── toolbox/
│           ├── check/route.ts        # Check installed tool versions
│           ├── run/route.ts          # Run tool update commands
│           └── settings/route.ts     # Toolbox tool selection settings
├── components/
│   ├── header.tsx
│   ├── header-actions.tsx            # Setup wizard + toolbox trigger buttons
│   ├── log-viewer-client.tsx         # Virtual scrolling + SSE log viewer
│   ├── dashboard/
│   │   ├── dashboard-client.tsx      # Health cards + todo indicators
│   │   └── maturity-popover.tsx      # Editable maturity percentage
│   ├── todos/
│   │   ├── use-todos.ts              # Hook with optimistic updates + rollback
│   │   ├── todo-sheet.tsx            # Sheet drawer per app
│   │   ├── todo-item.tsx             # Inline editing, keyboard shortcuts
│   │   ├── todo-add-form.tsx
│   │   └── todo-empty-state.tsx
│   ├── toolbox/
│   │   └── toolbox-dialog.tsx        # Dev tool version checker dialog
│   └── setup-wizard/                 # Multi-step env configuration
└── lib/
    ├── todos.ts                      # File-based persistence (~/.claudekit/todos/)
    ├── app-settings.ts               # Per-app settings (~/.claudekit/app-settings.json)
    ├── app-definitions.ts            # App registry (IDs, ports, icons, maturity)
    ├── maturity.ts                   # Maturity overrides (~/.claudekit/maturity.json)
    ├── toolbox-settings.ts           # Toolbox tool selection (~/.claudekit/toolbox-settings.json)
    ├── env-parser.ts
    ├── actions/setup-wizard.ts
    ├── constants/tools.ts            # Default tool definitions (Homebrew, Node, pnpm, etc.)
    ├── types/toolbox.ts              # Tool checker types
    └── services/
        ├── tool-checker.ts           # Version detection + update check logic
        ├── version-resolver.ts       # Latest version resolution (npm, GitHub, URLs)
        └── process-runner.ts         # Safe command execution wrapper
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
- `GET|PUT /api/apps/maturity` — App maturity percentage overrides
- `POST /api/apps/[id]/restart` — Proxy restart to daemon
- `POST /api/apps/[id]/stop` — Proxy stop to daemon
- `GET|POST|PATCH|DELETE /api/todos/[app]` — Todo CRUD with UUID IDs
- `POST /api/toolbox/check` — Check installed versions for selected tools
- `POST /api/toolbox/run` — Execute tool update commands
- `GET|PUT /api/toolbox/settings` — Toolbox tool selection preferences

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
