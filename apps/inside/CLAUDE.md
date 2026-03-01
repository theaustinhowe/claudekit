# CLAUDE.md — Inside

## Overview

**Inside** is a **Next.js 16 App Router** local-first dev tool for multi-platform project creation, scaffolding, and design workspace management. Users choose an app type (Web, Mobile, Desktop, Game, or Tool), describe their idea, pick a platform (12 options across 5 categories) and configuration options, then Inside scaffolds it via Claude CLI. For platforms with dev servers, it launches a live preview; for others (Godot, Bevy, Pygame, CLI) it shows run instructions. The split-pane design workspace provides chat-driven AI iteration, live preview (iframe, iframe-web-mode, or run-instructions), auto-fix, screenshots, and upgrade workflows. All imports use the `@/` alias for `src/`.

## Port

**2150** -- `pnpm dev:inside` or `pnpm --filter inside dev`

## Commands

```bash
pnpm --filter inside dev        # Start dev server on port 2150
pnpm --filter inside build      # Production build
pnpm --filter inside typecheck  # TypeScript check
pnpm --filter inside test       # Run tests
pnpm --filter inside lint       # Biome check
pnpm --filter inside lint:fix   # Biome check with auto-fix
pnpm --filter inside format     # Biome format
pnpm --filter inside seed       # Re-seed built-in data (tsx src/lib/db/seed.ts)
pnpm --filter inside db:reset   # Delete ~/.inside/data.duckdb
pnpm --filter inside knip       # Detect unused exports/dependencies
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_DEFAULT_DIRECTORY` | No | Default directory for new projects (default: `~/Projects`) |
| `DATABASE_PATH` | No | Override DB path (default: `~/.inside/data.duckdb`) |

## Architecture

### Directory Layout

```
src/
├── app/                              # Next.js App Router
│   ├── layout.tsx                    # Root layout (force-dynamic, fonts, ThemeProvider, Toaster, LayoutShell)
│   ├── (main)/page.tsx              # Projects list (server component)
│   ├── (main)/loading.tsx           # Loading skeleton
│   ├── new/page.tsx                 # New project form (server component)
│   ├── [projectId]/
│   │   ├── layout.tsx               # Design workspace layout
│   │   └── page.tsx                 # Design workspace (server component)
│   ├── archived/page.tsx            # Archived projects list
│   ├── settings/
│   │   ├── page.tsx                 # Settings page (server component)
│   │   └── settings-client.tsx      # Settings client component
│   └── api/                         # 17 REST endpoints
│       ├── projects/                # Project CRUD
│       ├── projects/[projectId]/    # Single project operations
│       │   ├── raw/                 # Raw project data
│       │   ├── dev-server/          # Dev server start/stop
│       │   ├── auto-fix/            # Auto-fix enable/disable/status
│       │   ├── export/              # Spec export
│       │   ├── screenshots/         # Screenshot capture/list
│       │   ├── screenshots/[id]/    # Individual screenshot serving
│       │   ├── status/              # Project status check
│       │   └── upgrade/             # Upgrade workflow
│       ├── sessions/                # Session create/start
│       │   ├── [sessionId]/         # Session detail
│       │   ├── [sessionId]/stream/  # SSE event stream
│       │   ├── [sessionId]/cancel/  # Cancel session
│       │   └── cleanup/             # Session cleanup
│       ├── fs/browse/               # Filesystem browsing
│       └── dev-servers/cleanup/     # Dev server cleanup
├── components/
│   ├── layout/                      # App layout
│   │   ├── layout-shell.tsx         # LayoutShell (AppLayout + SessionProvider)
│   │   ├── layout-config.tsx        # Nav config (New, Projects, Archived, Settings)
│   │   └── nav-count-badge.tsx      # Active/archived project count badges
│   ├── generator/                   # Main workspace components (20 components)
│   │   ├── describe-step.tsx        # App type selection + new project form (idea, platform, services, constraints, vibes)
│   │   ├── features-input.tsx       # Feature selection chips
│   │   ├── vibes-selector.tsx       # Design vibe picker
│   │   ├── inspiration-input.tsx    # Inspiration URL input
│   │   ├── project-card.tsx         # Project list card
│   │   ├── design-workspace.tsx     # Split-pane design workspace (main client component)
│   │   ├── chat-panel.tsx           # Design chat interface
│   │   ├── preview-panel.tsx        # Live app preview + code browser + terminal + screenshots
│   │   ├── app-preview.tsx          # App preview (iframe, iframe-web-mode, or run-instructions strategy)
│   │   ├── run-instructions-preview.tsx # Static run instructions for non-server platforms (Godot, Bevy, Pygame, CLI)
│   │   ├── scaffold-terminal.tsx    # Real-time scaffolding log viewer
│   │   ├── scaffold-log-dialog.tsx  # Scaffold log review dialog
│   │   ├── dev-server-logs.tsx      # Dev server log output
│   │   ├── auto-fix-indicator.tsx   # Auto-fix status badge
│   │   ├── screenshot-timelapse.tsx # Screenshot history timelapse
│   │   ├── spec-files-tab.tsx       # Generated spec files viewer
│   │   ├── upgrade-banner.tsx       # Upgrade progress banner
│   │   ├── upgrade-dialog.tsx       # Upgrade confirmation dialog
│   │   ├── upgrade-chat-view.tsx    # Task-by-task upgrade execution
│   │   ├── upgrade-complete-view.tsx# Post-upgrade completion view
│   │   └── project-settings-dialog.tsx # Project settings editor
│   ├── sessions/                    # Session UI
│   │   ├── session-context.tsx      # Session provider context
│   │   ├── session-indicator.tsx    # Active session status indicator
│   │   └── session-panel.tsx        # Session detail slide-over panel
│   ├── code/
│   │   └── code-file-tree.tsx       # Code browser file tree
│   └── directory-picker.tsx         # Filesystem directory picker
└── lib/
    ├── types.ts                     # All domain types (GeneratorProject, UiSpec, DesignMessage, SessionType, etc.)
    ├── constants.ts                 # App constants (APP_TYPES (5 categories, 12 platforms), PLATFORMS, PLATFORM_PREVIEW_STRATEGY, PLATFORMS_WITH_DEV_SERVER, CONSTRAINTS, DESIGN_VIBES, BACKEND_OPTIONS, AUTH_OPTIONS, FEATURE_CATEGORIES, SESSION_TYPE_LABELS, etc.)
    ├── constants/tools.ts           # Tool definitions (19 tools incl. Rust, Cargo, Tauri CLI, Flutter, Dart, Godot) with `usedFor` descriptions
    ├── utils.ts                     # Re-exports from @claudekit/ui (expandTilde, generateId, nowTimestamp, removeDirectory, timeAgo)
    ├── db/
    │   ├── index.ts                 # DuckDB connection (createDatabase + runMigrations + session reconciliation + seed)
    │   ├── seed.ts                  # Built-in data seeding
    │   └── migrations/              # 1 migration file (001_initial.sql)
    ├── actions/                     # 9 Server Action files ("use server")
    │   ├── generator-projects.ts    # Project CRUD, specs, design messages
    │   ├── settings.ts              # Key-value settings
    │   ├── sessions.ts              # Session DB records
    │   ├── screenshots.ts           # Screenshot records
    │   ├── upgrade-tasks.ts         # Upgrade task management
    │   ├── auto-fix.ts              # Auto-fix run records
    │   ├── prototype-files.ts       # Prototype file access
    │   ├── code-browser.ts          # Code file reading
    │   └── claude-usage.ts          # Claude usage tracking
    └── services/
        ├── session-manager.ts       # Session lifecycle (create, start, subscribe, cancel) via @claudekit/session
        ├── session-runners/         # 5 session runner factories
        │   ├── index.ts             # Runner registry
        │   ├── scaffold.ts          # Project scaffolding via Claude CLI
        │   ├── chat.ts              # Design chat via Claude CLI
        │   ├── upgrade.ts           # Upgrade task execution via Claude CLI
        │   ├── upgrade-init.ts      # Upgrade plan generation via Claude CLI
        │   └── auto-fix.ts          # Auto-fix via Claude CLI
        ├── scaffold-prompt.ts       # Implementation prompt builder for scaffolding (handles 12 platforms: web, CLI, desktop, mobile, game engine)
        ├── interface-design.ts      # Design vibe traits and style configuration
        ├── dev-server-manager.ts    # Spawn/stop child dev servers (globalThis-cached) with adopt/recovery (port+pid persistence to DB), platform-aware start commands
        ├── auto-fix-engine.ts       # Automated error detection + fix via Claude
        ├── screenshot-service.ts    # Playwright screenshot capture (stored in ~/.inside/screenshots/)
        ├── spec-exporter.ts         # Generate export files from locked spec
        ├── generator.ts             # Template-based project generation
        ├── tool-checker.ts          # CLI tool detection and version checking (19 tools)
        ├── version-resolver.ts      # Latest version resolution (npm, GitHub, etc.)
        ├── language-detector.ts     # Programming language detection
        ├── task-mutation-parser.ts   # Parse upgrade task mutations from Claude output
        └── git-utils.ts             # Git initialization helpers
```

### Data Layer

- **DuckDB** via `@claudekit/duckdb` with `createDatabase()` + `runMigrations()`. DB file at `~/.inside/data.duckdb`.
- `src/lib/db/index.ts` -- singleton connection cached via `globalThis`. On startup: runs migrations, reconciles orphaned sessions, recovers projects stuck in `scaffolding` status, auto-seeds built-in data.
- 1 migration file: `001_initial.sql` (9 app tables + 2 session tables = 11 total).
- 11 tables: `templates`, `generator_projects` (incl. `app_type`, `tool_versions`, `dev_server_port`, `dev_server_pid` columns), `project_specs`, `design_messages`, `upgrade_tasks`, `auto_fix_runs`, `project_screenshots`, `generator_runs`, `settings`, `sessions`, `session_logs`.

### Session System

5 session types managed via `src/lib/services/session-manager.ts` (wraps `@claudekit/session`):
- `scaffold` -- Project scaffolding via Claude CLI
- `chat` -- Design chat iteration via Claude CLI
- `upgrade` -- Per-task upgrade execution via Claude CLI
- `upgrade_init` -- Upgrade plan generation (analyze project, generate task list)
- `auto_fix` -- Automated error detection and fix via Claude CLI

Session runners in `src/lib/services/session-runners/`. Runner factory signature: `(metadata: Record<string, unknown>, contextId?: string) => SessionRunner`.

### Server/Client Split

Every page follows the standard pattern:
1. **Server Component** (`page.tsx`) -- fetches data via Server Actions, passes as props
2. **Client Component** -- receives data via props, handles interactivity with `"use client"`

Key examples:
- `(main)/page.tsx` (server) -> `describe-step.tsx` + `project-card.tsx` (client)
- `[projectId]/page.tsx` (server) -> `design-workspace.tsx` (client -- main workspace)
- `settings/page.tsx` (server) -> `settings-client.tsx` (client)

### Server Actions (`src/lib/actions/`)

9 action files with `"use server"` functions:
- **`generator-projects.ts`** -- CRUD for projects, specs, design messages, path validation
- **`settings.ts`** -- Key-value settings (get/set)
- **`sessions.ts`** -- Session DB records (create, update, get, list, insert logs)
- **`screenshots.ts`** -- Screenshot records and file management
- **`upgrade-tasks.ts`** -- Upgrade task CRUD and status updates
- **`auto-fix.ts`** -- Auto-fix run records
- **`prototype-files.ts`** -- Read project files for code browser
- **`code-browser.ts`** -- File tree and content reading
- **`claude-usage.ts`** -- Claude API usage stats and rate limits

### Route Handlers (API)

17 REST endpoints under `src/app/api/`:
- `projects/` -- List/create projects
- `projects/[projectId]/` -- Get/delete project
- `projects/[projectId]/raw/` -- Raw project data
- `projects/[projectId]/dev-server/` -- Start (POST) / stop (DELETE) dev server
- `projects/[projectId]/auto-fix/` -- Enable/disable/status
- `projects/[projectId]/export/` -- Export spec to files
- `projects/[projectId]/screenshots/` -- Capture (POST) / list (GET) screenshots
- `projects/[projectId]/screenshots/[id]/` -- Serve screenshot image
- `projects/[projectId]/status/` -- Check project status
- `projects/[projectId]/upgrade/` -- Upgrade tasks and task logs
- `sessions/` -- Create and start sessions
- `sessions/[sessionId]/` -- Session detail
- `sessions/[sessionId]/stream/` -- SSE event stream
- `sessions/[sessionId]/cancel/` -- Cancel running session
- `sessions/cleanup/` -- Clean up stale sessions
- `fs/browse/` -- Filesystem browsing
- `dev-servers/cleanup/` -- Clean up orphaned dev servers

### Services (`src/lib/services/`)

Key service files:
- **`session-manager.ts`** -- Wraps `@claudekit/session` `createSessionManager()` with app-specific persistence callbacks. Creates sessions, starts runners, manages subscriptions.
- **`session-runners/`** -- 5 per-type runner factories: `scaffold`, `chat`, `upgrade`, `upgrade_init`, `auto_fix`
- **`scaffold-prompt.ts`** -- Builds implementation prompts from project config (platform, constraints, services, vibes)
- **`interface-design.ts`** -- Design vibe trait mapping (8 vibes: Technical, Cozy, Sophisticated, Bold, Minimal, Analytical, Retro, Playful)
- **`dev-server-manager.ts`** -- Spawns child dev server processes per project, tracks them in a `globalThis`-cached Map (`__inside_dev_servers__`). Monitors stdout/stderr for readiness detection. Ring buffer of last 500 log lines.
- **`auto-fix-engine.ts`** -- Monitors dev server logs for error patterns (15+ regex patterns). Debounces, deduplicates by error signature, retries up to 3 times, cooldown after 5 consecutive failures.
- **`screenshot-service.ts`** -- Captures screenshots via `@claudekit/playwright`. Screenshots stored in `~/.inside/screenshots/<projectId>/`.
- **`spec-exporter.ts`** -- Generates project files deterministically from a locked UI spec
- **`generator.ts`** -- Template-based project generation (legacy)
- **`tool-checker.ts`** -- Checks installed CLI tools and versions (19 tools defined in `constants/tools.ts`)
- **`version-resolver.ts`** -- Resolves latest versions from npm, GitHub releases, or custom URLs
- **`language-detector.ts`** -- Detects programming language from file extensions
- **`task-mutation-parser.ts`** -- Parses file mutations from Claude CLI output during upgrades
- **`git-utils.ts`** -- Git init helpers

## Key Patterns

### Project Lifecycle

1. **Describe** -- User selects app type (Web/Mobile/Desktop/Game/Tool), then fills in idea, platform, services, constraints, design vibes, features
2. **Scaffold** -- Claude CLI scaffolds the project (session type: `scaffold`)
3. **Design** -- Split-pane workspace: chat (left) + live preview/code browser/terminal (right)
4. **Upgrade** -- Optional: generate upgrade tasks, execute them one-by-one via Claude CLI
5. **Archive** -- Project marked as done, dev server can stay running

### Design Workspace

The main design workspace (`design-workspace.tsx`) is a large client component that manages:
- Resizable split pane (chat left, preview right)
- 3 preview strategies: `iframe` (web apps), `iframe-web-mode` (mobile/Flutter with web target), `run-instructions` (Godot, Bevy, Pygame, CLI — shows static run instructions instead of iframe)
- Dev server lifecycle (start, restart, stop on unmount)
- Auto-fix monitoring (toggle, status tracking)
- Screenshot capture (initial, after each assistant message, manual)
- Upgrade workflow (init -> tasks -> task-by-task execution -> completion)
- Message queue for upgrade mode (queues user messages while tasks execute)
- Scaffold terminal view (full-width during initial scaffolding)

### Auto-Fix System

When enabled, the auto-fix engine monitors the dev server log output for error patterns. On detecting an error:
1. Debounce for 2 seconds
2. Compute error signature (hash of pattern + context)
3. Skip if same signature was recently fixed
4. Create an `auto_fix` session to invoke Claude CLI with the error context
5. Retry up to 3 times per error
6. Cooldown for 5 minutes after 5 consecutive failures

### Dev Server Management

- Each project gets a child process spawned via `src/lib/services/dev-server-manager.ts`
- Servers are tracked in a `globalThis`-cached Map to survive HMR
- Port detection via stdout parsing or sequential port scanning
- Log lines stored in a ring buffer (last 500 lines)
- Adopt/recovery: persists `dev_server_port` and `dev_server_pid` to DB, reconnects on page reload via `adopt()` if the process is still alive
- Platform-aware start commands (e.g. `pnpm dev`, `cargo tauri dev`, `flutter run -d chrome`, `npx expo start --web`)
- Cleanup on project page unmount (DELETE `/api/projects/[id]/dev-server`)

## Theme System

- 9 color themes via `@claudekit/hooks` (`ThemeFOUCScript`)
- Mode switching via `next-themes` (light/dark/system, default: system)
- HSL CSS custom properties from `@claudekit/ui/styles/themes.css`
- **Tailwind CSS v4** -- CSS-based configuration (no `tailwind.config.*` file)
- Typography: Inter (sans-serif) + JetBrains Mono (monospace)
- Toast notifications via `sonner`

## Dependencies on @claudekit Packages

- `@claudekit/ui` -- Base UI primitives, shared layout (`AppLayout`), error boundary, sonner toaster
- `@claudekit/hooks` -- `ThemeFOUCScript`, `useSessionStream`
- `@claudekit/duckdb` -- Database connection factory, query helpers, migration runner
- `@claudekit/claude-runner` -- Claude CLI invocation for scaffolding, chat, upgrades, auto-fix
- `@claudekit/claude-usage` -- Claude API usage tracking + usage section widget
- `@claudekit/session` -- Session lifecycle management (`createSessionManager`, `reconcileSessionsOnInit`)
- `@claudekit/playwright` -- Browser automation for screenshots
