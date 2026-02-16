# Architecture

This document describes Gadget's system architecture, component design, data flow, and key technical decisions.

## Overview

Gadget is a **local-first developer tool** built on **Next.js 16 App Router**. It audits repositories against configurable policies, manages AI integrations (Claude skills, MCP servers, agents), generates fix diffs, scaffolds new projects with Claude, and provides upgrade task management with screenshot capture.

It is not a SaaS — it runs entirely on the developer's machine, with an embedded DuckDB database stored at `~/.gadget/data.duckdb`.

### High-Level Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                         Browser (React 19)                       │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────────┐ │
│  │  Pages        │  │  Client      │  │  Hooks                 │ │
│  │  (Server)     │──│  Components  │──│  useSessionStream      │ │
│  │              │  │  ("use client")│  │  useAutoScroll         │ │
│  └──────┬───────┘  └──────┬───────┘  └───────────┬────────────┘ │
└─────────┼──────────────────┼─────────────────────┼──────────────┘
          │ props            │ fetch/SSE            │ SSE
          ▼                  ▼                      ▼
┌──────────────────────────────────────────────────────────────────┐
│                       Next.js Server                             │
│  ┌──────────────┐  ┌──────────────────┐  ┌───────────────────┐  │
│  │  Server       │  │  API Routes       │  │  Session Manager  │  │
│  │  Actions      │  │  /api/sessions/*  │  │  (globalThis)     │  │
│  │  ("use server")│  │  /api/scans/*    │  │                   │  │
│  │  22 files     │  │  /api/repos/*     │  │  12 Runners       │  │
│  └──────┬───────┘  └────────┬─────────┘  └────────┬──────────┘  │
│         │                   │                      │             │
│         ▼                   ▼                      ▼             │
│  ┌──────────────────────────────────────────────────────────────┐│
│  │                     Services Layer                           ││
│  │  Claude Runner · Scanner · Auditors · Fix Planner           ││
│  │  Apply Engine · Auto-Fix Engine · Generator                 ││
│  │  Dev Server Manager · Screenshot Service · Process Runner   ││
│  └──────────────────────────┬──────────────────────────────────┘│
│                             │                                    │
│                             ▼                                    │
│  ┌──────────────────────────────────────────────────────────────┐│
│  │                      Data Layer                              ││
│  │  DuckDB (embedded) · 32 tables · globalThis singleton       ││
│  │  Async mutex · WAL auto-recovery · Auto-seeding             ││
│  └──────────────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────────┘
          │                                           │
          ▼                                           ▼
   ┌──────────────┐                          ┌──────────────┐
   │  Claude CLI   │                          │  Filesystem   │
   │  (stream-json)│                          │  (repos, git) │
   └──────────────┘                          └──────────────┘
```

## Technology Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Framework | Next.js 16 (App Router) | `force-dynamic` — no static prerendering |
| Runtime | Node.js 22+ | Required for native DuckDB bindings |
| Language | TypeScript (strict mode) | All imports use `@/` alias for `src/` |
| Database | DuckDB via `@duckdb/node-api` | Embedded, file-based at `~/.gadget/data.duckdb` |
| UI Components | shadcn/ui + Radix primitives | 24 components in `src/components/ui/` |
| Styling | Tailwind CSS v4 | `@tailwindcss/postcss` plugin, HSL design tokens |
| Animation | Motion (Framer Motion v12) | Dynamic imports with `ssr: false` |
| Icons | Lucide React | |
| Syntax Highlighting | Shiki | |
| Markdown | react-markdown + remark-gfm | |
| Linting/Formatting | Biome | Replaces ESLint + Prettier |
| Testing | Vitest | |
| Package Manager | pnpm | Native dependencies via `onlyBuiltDependencies` |
| AI | Claude CLI | Invoked as subprocess with `--output-format stream-json` |
| Screenshots | Playwright | Optional — installed on demand |

## Directory Structure

```
src/
├── app/                              # Next.js App Router
│   ├── layout.tsx                    # Root layout (force-dynamic, fonts, theme)
│   ├── page.tsx                      # Dashboard
│   ├── repos/                        # Repository listing + detail
│   ├── scans/                        # Scan history + new scan wizard
│   ├── policies/                     # Policy management
│   ├── projects/                     # Project creation, scaffolding, chat, archived
│   ├── ai-integrations/              # Skills, MCP servers, agents
│   ├── patterns/                     # Patterns library
│   ├── concepts/                     # Concept management + sources
│   ├── toolbox/                      # CLI tool checker
│   ├── settings/                     # App settings
│   └── api/                          # 27 REST endpoints
│       ├── sessions/                 # Session CRUD + SSE streaming + cancel
│       ├── scans/                    # Streaming scan execution
│       ├── repos/                    # Repo CRUD + raw data
│       ├── projects/                 # Projects, auto-fix, screenshots, upgrades
│       ├── findings/, fixes/         # Audit data + fix lifecycle
│       ├── policies/, reports/       # Policy CRUD + report export
│       ├── discover/, fs/browse/     # Repo discovery + filesystem browsing
│       ├── claude-usage/             # Claude API usage tracking
│       └── toolbox/check/            # CLI tool checking
├── components/
│   ├── ui/                           # shadcn/ui primitives (24 components)
│   ├── layout/                       # Shell, sidebar, header, nav
│   ├── sessions/                     # Terminal, panel, badge, indicator, context
│   ├── generator/                    # Scaffolding, chat, design workspace, upgrades
│   ├── repos/                        # Repo detail tabs, Claude config editor
│   ├── scans/                        # Scan wizard
│   ├── code/                         # Code browser, file viewer, diff, syntax
│   ├── dashboard/                    # Dashboard client
│   ├── policies/                     # Policy form + listing
│   ├── concepts/                     # Concept sources, install dialogs
│   ├── patterns/                     # Patterns library
│   ├── settings/                     # Settings tabs, API keys
│   └── toolbox/                      # Toolbox client
├── lib/
│   ├── db/                           # DuckDB connection, schema, helpers, seed
│   │   ├── index.ts                  # Singleton init, WAL recovery, orphan cleanup
│   │   ├── schema.ts                 # 32 tables (CREATE IF NOT EXISTS)
│   │   ├── helpers.ts                # queryAll, queryOne, execute, buildUpdate
│   │   └── seed.ts                   # Built-in policies, templates, rules
│   ├── actions/                      # 22 Server Action files ("use server")
│   ├── services/                     # Business logic
│   │   ├── session-manager.ts        # Unified session lifecycle (globalThis singleton)
│   │   ├── session-runners/          # 12 per-type runner factories + registry
│   │   ├── claude-runner.ts          # Claude CLI invocation with stream-json parsing
│   │   ├── process-runner.ts         # Generic bash process spawning
│   │   ├── scanner.ts               # Filesystem traversal and repo discovery
│   │   ├── auditors/                 # 4 auditors: dependencies, ai-files, structure, custom-rules
│   │   ├── fix-planner.ts           # Finding → fix action conversion
│   │   ├── apply-engine.ts          # Atomic fix application with snapshots
│   │   ├── auto-fix-engine.ts       # Dev server error detection + auto-fix
│   │   ├── generator.ts             # Project scaffolding from templates
│   │   ├── dev-server-manager.ts    # Project dev server lifecycle
│   │   ├── screenshot-service.ts    # Playwright screenshot capture
│   │   └── ...                       # Config parsers, concept scanners, etc.
│   ├── types.ts                      # All domain type definitions
│   ├── constants.ts                  # Sentinel IDs, discovery patterns, session config
│   └── utils.ts                      # cn(), generateId(), nowTimestamp(), parsePolicy()
└── hooks/
    ├── use-session-stream.ts         # SSE hook for session event streaming
    ├── use-auto-scroll.ts            # Auto-scroll for terminal output
    ├── use-mobile.ts                 # Mobile detection (768px breakpoint)
    ├── use-color-scheme.ts           # System color scheme detection
    └── use-tab-navigation.ts         # Tab navigation state
```

## Data Layer

### DuckDB Embedded Database

Gadget uses DuckDB as an embedded analytical database. The database file lives at `~/.gadget/data.duckdb` (configurable via `DB_PATH` env var).

**Connection model:**

```
getDb() → globalThis cache → DuckDBInstance → DuckDBConnection
                                  │
                            Async mutex
                        (one prepared stmt at a time)
```

- A single `DuckDBInstance` + `DuckDBConnection` is cached on `globalThis` to survive Next.js HMR reloads.
- An async mutex in `helpers.ts` serializes all prepared statement execution — DuckDB's node-api doesn't support concurrent prepared statements on one connection.
- `?` placeholder syntax is auto-converted to DuckDB's positional `$1, $2, ...` format by the helpers layer.

**Startup sequence** (in `src/lib/db/index.ts`):

1. Create `~/.gadget/` directory if missing
2. Open DuckDB file (with WAL corruption auto-recovery)
3. Set `wal_autocheckpoint = '256KB'` (lower than default 16MB for a local tool)
4. Run `initSchema()` — 32 `CREATE TABLE IF NOT EXISTS` statements
5. Recover orphaned scans/sessions stuck in `running`/`pending` → mark `error`
6. Prune session logs >7 days and completed sessions >30 days
7. Auto-seed built-in data if not yet seeded
8. Register SIGINT/SIGTERM shutdown handlers

**Schema management:** No incremental migration system. All tables use `CREATE TABLE IF NOT EXISTS`. Additive changes (new tables/indexes) apply on next startup. Breaking changes require `pnpm db:reset`.

### DB Helpers API

| Function | Returns | Purpose |
|----------|---------|---------|
| `queryAll<T>(conn, sql, params?)` | `T[]` | Execute query, return all rows |
| `queryOne<T>(conn, sql, params?)` | `T \| undefined` | Execute query, return first row |
| `execute(conn, sql, params?)` | `void` | Execute statement (INSERT, UPDATE, DELETE) |
| `checkpoint(conn)` | `void` | Force WAL checkpoint |
| `withTransaction(conn, fn)` | `T` | BEGIN/COMMIT with automatic ROLLBACK on error |
| `buildUpdate(table, id, data, jsonFields?)` | `{sql, params} \| null` | Build dynamic UPDATE from partial object |

### Server Actions

All database access goes through 22 `"use server"` files in `src/lib/actions/`. Each file calls `await getDb()` then uses the helpers above. This layer is the **only** code that touches the database directly.

Key action files and their domains:

| File | Domain |
|------|--------|
| `sessions.ts` | Session CRUD, log persistence |
| `repos.ts` | Repository CRUD with severity counts |
| `scans.ts` | Scan root directory management |
| `findings.ts` | Audit findings, AI file queries |
| `fixes.ts` | Fix snapshot restore |
| `policies.ts` | Policy CRUD (JSON fields for versions, banned deps) |
| `generator-projects.ts` | Project scaffolding records |
| `concepts.ts` | Concept discovery and management |
| `concept-sources.ts` | GitHub, MCP, and curated concept sources |
| `claude-usage.ts` | Claude API usage stats from `~/.claude/stats-cache.json` |
| `settings.ts` | App settings, dashboard stats, cleanup config |
| `upgrade-tasks.ts` | Upgrade task breakdown records |
| `code-browser.ts` | GitHub-sourced code browsing with caching |
| `custom-rules.ts` | Custom audit rules CRUD |
| `screenshots.ts` | Project screenshot tracking |

## Server/Client Component Split

Every page follows the same pattern:

```
src/app/<route>/page.tsx          (Server Component — fetches data)
        │
        │  passes data as props
        ▼
src/components/<feature>/<name>-client.tsx   (Client Component — "use client")
```

**Server Components** (`page.tsx` files) call Server Actions to fetch data from DuckDB and pass it as props. No interactivity, no hooks, no browser APIs.

**Client Components** (`*-client.tsx` files) receive data via props and handle all user interaction, state, and effects. They use hooks for streaming, scrolling, and navigation.

This split keeps data fetching on the server (avoiding waterfalls) while enabling rich client-side interactivity.

## Session System

The session system is the central abstraction for all long-running operations. Every streaming operation in Gadget goes through sessions — there are no standalone streaming API routes.

### Architecture

```
POST /api/sessions                     GET /api/sessions/{id}/stream
     │                                          │
     ▼                                          ▼
┌──────────────────────────────────────────────────────┐
│                  Session Manager                      │
│              (globalThis singleton)                    │
│                                                       │
│  ┌─────────────┐   ┌──────────────┐   ┌───────────┐ │
│  │ LiveSession  │   │ Event Buffer │   │ Subscribers│ │
│  │ (in-memory)  │   │ (ring, 500)  │   │ (SSE set) │ │
│  └──────┬──────┘   └──────────────┘   └───────────┘ │
│         │                                             │
│         ▼  dispatch by SessionType                    │
│  ┌──────────────────────────────────────────────────┐│
│  │              Runner Registry                      ││
│  │  scan · chat · scaffold · upgrade · auto_fix      ││
│  │  quick_improve · finding_fix · fix_apply          ││
│  │  upgrade_init · ai_file_gen · cleanup             ││
│  │  toolbox_command                                  ││
│  └──────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────┘
```

### Session Lifecycle

1. **Create** — `POST /api/sessions` creates a DB record (status=`pending`) and an in-memory `LiveSession`
2. **Start** — Runner factory is selected by `SessionType`, executed with an `AbortController`
3. **Progress** — Runner calls `onProgress()` → events fan out to SSE subscribers + batch to DB logs
4. **Complete** — Runner resolves → status transitions to `done`, `error`, or `cancelled`
5. **Cancel** — `POST /api/sessions/{id}/cancel` → abort signal fires → cleanup function runs

### Runner Pattern

Each runner is a factory function that returns an async executor:

```typescript
// Factory: receives metadata + optional context ID
type RunnerFactory = (metadata: Record<string, unknown>, contextId?: string) => SessionRunner;

// Runner: receives context, returns result
type SessionRunner = (ctx: {
  onProgress: (event: SessionEvent) => void;
  signal: AbortSignal;
  sessionId: string;
}) => Promise<{ result?: Record<string, unknown> }>;
```

### Session Types and Their Runners

| Type | Runner | Purpose |
|------|--------|---------|
| `scan` | `scan.ts` | Discover repos, run auditors, plan fixes |
| `chat` | `chat.ts` | Design workspace chat with Claude |
| `scaffold` | `scaffold.ts` | Generate project from template with Claude |
| `upgrade` | `upgrade.ts` | Execute multi-step upgrade tasks |
| `upgrade_init` | `upgrade-init.ts` | Generate upgrade task breakdown |
| `auto_fix` | `auto-fix.ts` | Detect and fix dev server errors |
| `quick_improve` | `quick-improve.ts` | AI-driven repo improvements via PR |
| `finding_fix` | `finding-fix.ts` | Batch-fix audit findings |
| `fix_apply` | `fix-apply.ts` | Apply planned fix actions atomically |
| `ai_file_gen` | `ai-file-gen.ts` | Generate documentation files |
| `cleanup` | `cleanup.ts` | Remove invalid files, run knip |
| `toolbox_command` | `toolbox-command.ts` | Install/update CLI tools |

### SSE Streaming

The client consumes session events via the `useSessionStream` hook:

```
useSessionStream(sessionId)
  → fetch(/api/sessions/{id}/stream)
    → ReadableStream of SSE events
      → { type, message?, progress?, phase?, log?, logType?, data? }
```

Event types: `init`, `progress`, `log`, `done`, `error`, `cancelled`, `heartbeat`

Log types: `status`, `tool`, `thinking`

Constants: buffer size = 500 events, log flush interval = 2s, heartbeat interval = 15s.

## Services Layer

### Claude Runner (`claude-runner.ts`)

The standard interface for invoking Claude CLI as a subprocess:

```
runClaude(prompt, options)
  → spawn: claude -p --verbose --output-format stream-json
  → parse stream-json events in real-time
  → emit progress callbacks (tool_use, text, result)
  → return { stdout, stderr, exitCode }
```

- **Tool allowlisting**: Default allows `Write`, disallows `Edit,Bash` (configurable per runner)
- **Abort support**: SIGTERM on AbortSignal from session cancellation
- **PID tracking**: `onPid` callback allows the session manager to track and kill processes
- **Timeout**: Default 10 minutes, configurable per invocation
- **Keepalive**: 3-second heartbeat while waiting for output

### Process Runner (`process-runner.ts`)

Generic bash process spawning for non-Claude operations (git commands, `npx knip`, tool installs):

```
runProcess({ command, signal, onStdout, onStderr })
  → spawn: bash -l -c "command"
  → stream stdout/stderr via callbacks
  → return { exitCode }
```

### Scanner (`scanner.ts`)

Filesystem traversal for repo discovery:

```
discoverRepos(roots, excludePatterns)
  → walk directories, find .git dirs
  → detectPackageManager (lockfile → pnpm/npm/yarn/bun)
  → detectMonorepo (pnpm-workspace.yaml, package.json workspaces)
  → detectRepoType (Next.js, React, Node, Python, etc.)
  → return DiscoveredRepo[]
```

### Auditors (`auditors/`)

Four auditors produce `AuditFinding[]` arrays, orchestrated by `runAudit()` in `auditors/index.ts`:

| Auditor | Checks |
|---------|--------|
| **Dependencies** (`dependencies.ts`) | Expected version ranges via semver, banned dependency flagging |
| **AI Files** (`ai-files.ts`) | README quality scoring (0-100), presence of CLAUDE.md, AGENTS.md, CONTRIBUTING, ARCHITECTURE.md |
| **Structure** (`structure.ts`) | Expected directory layout per framework type, workspace package resolution |
| **Custom Rules** (`custom-rules.ts`) | User-defined rules: `file_exists`, `file_missing`, `file_contains`, `json_field` |

The orchestrator also discovers Claude Code concepts and stores them. Monorepo support resolves workspace packages and audits each individually.

### Fix Pipeline

```
AuditFinding[]
  → Fix Planner (planFixes)
    → FixAction[] with before/after diffs
      → Apply Engine (applyFixes)
        → Snapshot files → write to temp → atomic rename
        → Restore available via snapshot ID
```

### Auto-Fix Engine (`auto-fix-engine.ts`)

Watches dev server logs for error patterns and automatically creates fix sessions:

```
Dev Server Manager
  → onLog() callback
    → Auto-Fix Engine detects error (18 regex patterns)
      → Debounce (2s) + dedup by error signature
        → Create auto_fix session → Claude Runner
          → Hot reload picks up file changes
```

State management per project: cooldown (5 min), max retries (3), failure tolerance.

### Dev Server Manager (`dev-server-manager.ts`)

Manages project dev servers with process lifecycle:

- `start()` — Spawn dev server, find available port, wait for ready (regex detection for Next.js/Vite)
- `stop()` — Kill process tree
- `getLogs()` — Ring buffer of last 500 log lines
- `onLog()` — Register callbacks (used by auto-fix engine)

### Screenshot Service (`screenshot-service.ts`)

Captures project screenshots via Playwright:

- Viewport: 1280x800
- Wait strategy: `networkidle` + 2s for animations
- Output: PNG to `~/.gadget/screenshots/{projectId}/{timestamp}.png`
- Graceful degradation: returns null if Playwright not installed

## UI Layer

### Layout Architecture

```
RootLayout (server)
  └─ ThemeProvider (next-themes)
      └─ LayoutShell (client, dynamic import ssr:false)
          ├─ AppSidebar (desktop collapsible + mobile bottom nav)
          ├─ AppHeader (Claude usage widget + session indicator)
          ├─ main (page content)
          └─ SessionPanel (slide-over for active sessions)
              └─ SessionProvider (context, 5s polling)
```

`LayoutShell`, `AppSidebar`, and `AppHeader` use `next/dynamic` with `ssr: false` to avoid hydration mismatches from Motion animations.

### Session UI Components

| Component | Role |
|-----------|------|
| `SessionProvider` (`session-context.tsx`) | Global state, 5s polling, toast on completion |
| `SessionPanel` | Slide-over sheet showing all sessions with controls |
| `SessionTerminal` | Log viewer with auto-scroll, progress bar, elapsed time |
| `SessionBadge` | Inline status indicator with animated pulse for running |
| `SessionIndicator` | Header badge showing active session count |

### Design System

- **Tokens**: HSL CSS custom properties in `globals.css` for light/dark themes
- **Semantic colors**: `primary`, `secondary`, `destructive`, `muted`, `accent`, `success`, `warning`, `info`
- **Themes**: Amethyst (default), Sapphire, Emerald, Ruby, Amber, Slate — switched via `localStorage`
- **Fonts**: Inter (sans), JetBrains Mono (monospace)
- **Animations**: Custom keyframes for accordion, fade-in, slide-in, pulse-glow

## Data Flow Examples

### Scan Workflow

```
1. User clicks "New Scan" in UI
2. ScanWizard → POST /api/sessions { type: "scan", metadata: { scanRoots, policyId } }
3. Session Manager creates DB record + in-memory LiveSession
4. Dispatches scan runner:
   a. Discovery phase (10%) → Scanner.discoverRepos()
   b. Auditing phase (50%) → runAudit() per repo (4 auditors)
   c. Fix planning (75%) → planFixes() per repo
   d. Completion (100%) → stores findings + fix actions
5. Each phase emits onProgress() → fans out to SSE subscribers
6. Client connects: GET /api/sessions/{id}/stream → useSessionStream hook
7. SessionTerminal renders live logs, progress bar, phase text
```

### Chat Workflow (Design Workspace)

```
1. User sends message in ChatPanel
2. POST /api/sessions { type: "chat", metadata: { message, projectId } }
3. Chat runner:
   a. Loads project context (vibes, colors, inspiration)
   b. Saves user message to design_messages table
   c. Calls runClaude() with design context + message
   d. Parses suggestions from HTML comments in response
   e. Saves assistant message with suggestions
4. Client streams response chunks in real-time
```

### Auto-Fix Workflow

```
1. Dev server emits error log
2. DevServerManager.onLog() → pushes to subscribers
3. AutoFixEngine detects error pattern (18 regex matchers)
4. Debounce 2s, deduplicate by error signature hash
5. Creates auto_fix session with error context
6. Runner calls runClaude() with error + recent dev server logs
7. Claude edits files → hot reload picks up changes
8. If error clears → success; if persists → retry (max 3)
```

### Quick-Improve Workflow

```
1. User selects improvement type on repo detail
2. POST /api/sessions { type: "quick_improve", metadata: { repoId, persona } }
3. Runner:
   a. Verifies gh CLI auth + clean working tree
   b. Creates git worktree + feature branch
   c. Calls runClaude() with persona-specific prompt
   d. Commits changes on worktree
   e. Pushes branch + creates PR via gh CLI
   f. Cleans up worktree
4. Returns { prUrl } on success
5. On cancel/error: cleanup function removes worktree
```

## Design Decisions

### DuckDB as the Data Store

DuckDB provides analytical query performance, native boolean support, and an async Node.js API. For a local tool that audits many repos and aggregates findings, DuckDB's columnar storage is a good fit. The trade-off is stricter concurrency constraints (single prepared statement at a time), worked around with an async mutex.

### Unified Session System

Before the session system, each streaming operation had its own API route with duplicated SSE logic. The unified system provides:

- **Consistent lifecycle**: Every operation follows create → start → progress → complete
- **Centralized cancellation**: One abort mechanism for all operation types
- **Observable state**: All running operations visible in one panel
- **Log persistence**: Automatic batched writes to DB for audit trails
- **Resource cleanup**: Registered cleanup functions run on cancel/error

### `globalThis` Singleton Caching

Next.js HMR re-executes module scope on every file change. Without `globalThis` caching, each hot reload would open a new DuckDB connection (risking WAL corruption), create a new session manager (orphaning running sessions), and lose in-memory state. Caching on `globalThis` ensures singletons survive HMR while still being cleaned up on process shutdown.

### `force-dynamic` Root Layout

DuckDB pages require server-side data fetching on every request. Static prerendering would fail because DuckDB needs a Node.js runtime. `force-dynamic` ensures all pages are server-rendered on demand.

### Dynamic Imports with `ssr: false` for Layout

Motion (Framer Motion) components cause hydration mismatches when server-rendered because they inject inline styles that differ between server and client. `next/dynamic` with `ssr: false` avoids this — layout components only render on the client.

### No Migration System

For a local-first tool, a migration system adds complexity without proportional benefit. `CREATE TABLE IF NOT EXISTS` handles additive changes automatically. Breaking changes are handled by `pnpm db:reset` — acceptable for a development tool where data can be regenerated by re-scanning repos.

### Git Worktrees for Quick Improve

The quick-improve runner uses git worktrees to create feature branches without disturbing the user's working directory. This allows Claude to make changes on a separate branch, commit, push, and create a PR — all without touching the user's current checkout. The worktree is cleaned up on completion or error via the session cleanup function.

### Ring Buffer + Batch Log Persistence

Session events use a ring buffer (500 events max in memory) for real-time SSE fan-out, with a separate batch persistence path that flushes logs to DuckDB every 2 seconds. This balances real-time streaming performance with durable storage, avoiding per-event DB writes that would bottleneck high-throughput operations like scanning.

## Security

- **Security headers** in `next.config.ts`: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (camera, microphone, geolocation disabled)
- **Server-external packages**: `@duckdb/node-api`, `@duckdb/node-bindings`, `playwright` excluded from Next.js bundling
- **Encryption**: AES-256-GCM for stored GitHub PATs (`src/lib/services/encryption.ts`)
- **SQL injection prevention**: Parameterized queries via prepared statements; `buildUpdate()` validates identifiers against `^[a-zA-Z_][a-zA-Z0-9_]*$`
- **MCP API token**: Bearer token auth for programmatic API access
- **Process isolation**: Claude CLI runs as a subprocess with configurable tool allowlists/disallowlists
