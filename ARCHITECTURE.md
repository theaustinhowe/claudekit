# ClaudeKit Architecture

This document describes the system architecture, component responsibilities, data flow, and design decisions of the ClaudeKit monorepo.

## Table of Contents

- [Overview](#overview)
- [Technology Stack](#technology-stack)
- [Directory Structure](#directory-structure)
- [System Architecture](#system-architecture)
- [Applications](#applications)
- [Shared Packages](#shared-packages)
- [Data Flow](#data-flow)
- [Key Architectural Patterns](#key-architectural-patterns)
- [Design Decisions and Trade-offs](#design-decisions-and-trade-offs)
- [Development Infrastructure](#development-infrastructure)

---

## Overview

ClaudeKit is a **local-first developer tool ecosystem** built as a pnpm workspace monorepo. It contains 8 applications and 12 shared packages that provide repository auditing, AI-powered code analysis, job orchestration, project scaffolding, PR inspection, and database administration — all running locally without cloud dependencies.

The system is designed around three core principles:

1. **Local-first** — All tools run on the developer's machine with DuckDB for persistence. No external services required (optional integrations available).
2. **Session-oriented** — Long-running operations (scans, AI analysis, code generation) are managed through a unified session abstraction with real-time streaming.
3. **Claude-integrated** — Deep integration with Claude CLI for AI-powered analysis, code generation, and automated workflows.

---

## Technology Stack

### Core

| Layer | Technology | Version |
|-------|-----------|---------|
| Runtime | Node.js | 20+ |
| Language | TypeScript | 5.9 (strict mode) |
| Package Manager | pnpm | 9.15 |
| Linting/Formatting | Biome | 2.4 |

### Frontend

| Technology | Purpose |
|-----------|---------|
| Next.js 16 | App Router, React Server Components, Server Actions |
| React 19 | UI rendering |
| Tailwind CSS v4 | Utility-first styling with `@tailwindcss/postcss` |
| Base UI (`@base-ui/react`) | Unstyled component primitives (not Radix) |
| class-variance-authority | Component variant definitions |
| Framer Motion v12 (`motion`) | Animations |
| TanStack React Query 5 | Server state management (GoGo Web) |
| TanStack React Virtual | Virtualized scrolling (Web log viewer) |
| lucide-react | Icons |
| nuqs | URL state management |

### Backend

| Technology | Purpose |
|-----------|---------|
| Fastify 5 | HTTP server (GoGo Orchestrator) |
| DuckDB (`@duckdb/node-api`) | Embedded database for all persistent apps |
| Pino | Structured logging with daily-rotating NDJSON files |
| Octokit 4.1 | GitHub API client |

### Testing & Tooling

| Technology | Purpose |
|-----------|---------|
| Vitest 4 | Unit and integration tests |
| Playwright 1.58 | Browser automation and E2E testing |
| @testing-library/react | Component testing |
| Storybook 10.2 | Component development (port 6006) |
| knip | Unused dependency detection |

---

## Directory Structure

```
claudekit/
├── apps/
│   ├── web/                    # Dashboard & control center (port 2000)
│   ├── gadget/                 # Repository auditor (port 2100)
│   ├── inside/                 # Project scaffolding & design (port 2150)
│   ├── gogo-web/               # Job orchestration dashboard (port 2200)
│   ├── gogo-orchestrator/      # Fastify job execution backend (port 2201)
│   ├── b4u/                    # Video walkthrough generator (port 2300)
│   ├── inspector/              # GitHub PR analysis (port 2400)
│   └── ducktails/              # DuckDB admin UI (port 2050)
│
├── packages/
│   ├── duckdb/                 # Connection factory, query helpers, migrations
│   ├── session/                # Session lifecycle, ring buffer, SSE streaming
│   ├── claude-runner/          # Claude CLI spawn, stream-JSON parsing
│   ├── ui/                     # 54 shadcn/ui components, shared layouts
│   ├── hooks/                  # useAppTheme, useAutoScroll, useSessionStream
│   ├── logger/                 # Pino logging, daily rotation, log querying
│   ├── gogo-shared/            # GoGo types, state machine, WebSocket protocol
│   ├── github/                 # Octokit wrapper, rate limit tracking
│   ├── claude-usage/           # Usage tracking, pricing, UI widgets
│   ├── playwright/             # Browser automation, E2E test infrastructure
│   ├── mcp-logs/               # MCP server exposing 5 log query tools
│   └── validation/             # Zod schema utilities
│
├── scripts/
│   ├── dev.ts                  # Foreground dev runner (colored output)
│   ├── dev-start.ts            # Background daemon launcher
│   ├── dev-stop.ts             # Daemon shutdown
│   ├── dev-daemon.ts           # Background process runner
│   ├── dev-apps.ts             # App definitions, PID management
│   ├── dev-settings.ts         # Per-app auto-start/restart settings
│   ├── test.ts                 # Test runner with coverage aggregation
│   ├── db-reset.ts             # Database reset for all apps
│   └── clean.ts                # Build artifact cleanup
│
├── .github/workflows/ci.yml   # CI: typecheck → lint → test → build
├── .mcp.json                   # MCP server configuration
├── biome.json                  # Code style (2-space, 120 chars, double quotes)
├── knip.json                   # Unused code detection config
├── pnpm-workspace.yaml         # Workspace: apps/* + packages/*
├── tsconfig.json               # Root TypeScript config (ES2022, strict)
└── CLAUDE.md                   # AI assistant guidance
```

### App Internal Structure

All Next.js apps follow a consistent layout:

```
apps/<app>/
├── src/app/                    # Next.js App Router pages
│   ├── layout.tsx              # Root layout (theme providers, fonts)
│   ├── page.tsx                # Server Component (data fetching)
│   ├── api/                    # Route handlers (SSE, REST)
│   └── <feature>/             # Feature routes
├── src/components/
│   ├── layout/                 # Shell, sidebar, header
│   ├── <feature>/             # Feature-specific components
│   └── *-client.tsx           # Client components ("use client")
├── src/lib/
│   ├── db/                     # DuckDB connection, schema, migrations/
│   ├── actions/                # Server Actions
│   ├── services/               # Business logic, session runners
│   ├── types.ts                # Domain types
│   └── constants.ts            # App constants
├── src/hooks/                  # App-specific React hooks
├── package.json
├── tsconfig.json
└── CLAUDE.md                   # App-specific AI guidance
```

---

## System Architecture

### High-Level Diagram

```
┌──────────────────────────────────────────────────────────────────────────┐
│                          Developer's Machine                             │
│                                                                          │
│  ┌─────────┐  ┌─────────┐  ┌──────────┐  ┌─────────┐  ┌──────────┐   │
│  │   Web   │  │ Gadget  │  │  Inside  │  │Inspector│  │   B4U    │   │
│  │  :2000  │  │  :2100  │  │  :2150   │  │  :2400  │  │  :2300   │   │
│  │ Next.js │  │ Next.js │  │ Next.js  │  │ Next.js │  │ Next.js  │   │
│  └────┬────┘  └────┬────┘  └────┬─────┘  └────┬────┘  └────┬─────┘   │
│       │            │            │              │             │          │
│       │     ┌──────┴─────┬──────┴──────┬───────┴─────┬──────┘          │
│       │     │            │             │             │                  │
│       │     ▼            ▼             ▼             ▼                  │
│       │  ┌──────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐          │
│       │  │DuckDB│  │ Session  │  │  Claude   │  │  Logger  │          │
│       │  │  pkg │  │   pkg    │  │  Runner   │  │   pkg    │          │
│       │  └──┬───┘  └────┬─────┘  └────┬─────┘  └────┬─────┘          │
│       │     │           │             │              │                  │
│       │     ▼           │             ▼              ▼                  │
│       │  ~/.app/        │         Claude CLI    ~/.claudekit/           │
│       │  data.duckdb    │         (spawned)     logs/*.ndjson           │
│       │                 │                                               │
│  ┌────┴─────────────────┴──────────────────────────────────────────┐   │
│  │                    Shared Packages Layer                         │   │
│  │  ┌────┐ ┌───────┐ ┌────────┐ ┌────────┐ ┌──────┐ ┌──────────┐│   │
│  │  │ UI │ │ Hooks │ │ GitHub │ │Validatn│ │ MCP  │ │Playwright││   │
│  │  │ 54 │ │Theme, │ │Octokit │ │  Zod   │ │ Logs │ │ Browser  ││   │
│  │  │comp│ │Stream │ │RateLmt │ │schemas │ │5tools│ │ automate ││   │
│  │  └────┘ └───────┘ └────────┘ └────────┘ └──────┘ └──────────┘│   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ┌──────────┐  ┌────────────┐                                          │
│  │ GoGo Web │◄─┤   REST +   │  ┌──────────────────┐                   │
│  │  :2200   │  │  WebSocket │  │GoGo Orchestrator │                   │
│  │ Next.js  │◄─┤            ├──┤     :2201        │                   │
│  └──────────┘  └────────────┘  │   Fastify 5      │                   │
│                                 │   DuckDB         │                   │
│  ┌──────────┐                  │   State Machine   │                   │
│  │DuckTails │──reads──────────►│   Agent Executor  │                   │
│  │  :2050   │  all DBs         └──────────────────┘                   │
│  │ DuckDB   │                                                          │
│  │  Admin   │                                                          │
│  └──────────┘                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

### Component Roles

| Component | Role |
|-----------|------|
| **Web** | Central dashboard. Monitors health of all apps, tails log files, manages todos. No database — reads files and polls ports. |
| **Gadget** | Repository auditor. Walks filesystems, runs dependency/structure/AI-file auditors, generates findings, applies AI-powered fixes. |
| **Inside** | Project creation and scaffolding. Phase-driven chat workflow for generating, upgrading, and designing projects. |
| **GoGo Web** | Job orchestration dashboard. Kanban board for AI agent jobs. Communicates with GoGo Orchestrator via REST + WebSocket. |
| **GoGo Orchestrator** | Backend engine. State machine for job lifecycle, spawns Claude CLI agents, polls GitHub, manages worktrees, creates PRs. |
| **Inspector** | PR analysis tool. Syncs GitHub PRs, categorizes review comments into skills, generates AI-powered split plans and comment fixes. |
| **B4U** | Video walkthrough prototype. Chat-driven UI for generating automated repository walkthroughs using Playwright for browser capture. |
| **DuckTails** | DuckDB admin UI. Connects to all app databases for browsing tables, running SQL queries, and editing data. |

---

## Applications

### apps/web — Dashboard & Control Center

**Purpose**: Central hub for monitoring and managing all ClaudeKit applications.

**Key Features**:
- **Health monitoring**: Polls all app ports every few seconds with debounced state transitions (2 consecutive polls required before status change)
- **Log viewer**: Virtual scrolling via TanStack React Virtual (32px rows, 20-row overscan) for 5000+ log lines, with SSE real-time tailing
- **Todo management**: Per-app todo lists with optimistic updates and rollback on error
- **App management**: Start/stop/restart via daemon proxy, per-app auto-start/restart settings

**Storage**: File-based only (no DuckDB). Todos in `~/.claudekit/todos/`, settings in `~/.claudekit/app-settings.json`, logs read from `~/.claudekit/logs/`.

### apps/gadget — Repository Auditor

**Purpose**: Multi-layer repository analysis with AI-powered improvements.

**Audit System** (4 auditors run per scan):
1. **Dependencies** — Version conflicts, unused packages, duplicated dependencies
2. **AI Files** — `.clauderc` and Claude configuration analysis
3. **Structure** — Monorepo patterns, package managers, repo type classification
4. **Custom Rules** — User-defined policy-based findings

**Session Runners** (6 types): `scan`, `quick-improve`, `finding-fix`, `fix-apply`, `ai-file-gen`, `cleanup`

**Database**: DuckDB at `~/.gadget/data.duckdb` with 17 tables covering sessions, repos, scans, findings, fixes, policies, concepts, and configuration.

### apps/gogo-web + apps/gogo-orchestrator — Job Orchestration

**Purpose**: Multi-repo AI agent job orchestration system. GoGo Web is the dashboard; GoGo Orchestrator is the execution engine.

**Communication**:
- **REST API** (web → orchestrator): Job CRUD, repository management, GitHub operations, settings
- **WebSocket** (orchestrator → web): Real-time job updates, log streaming, issue sync events
- Bearer token authentication via localStorage

**State Machine** (11 states defined in `@claudekit/gogo-shared`):

```
queued → planning → awaiting_plan_approval → running → ready_to_pr → pr_opened → pr_reviewing → done
                         ↕                     ↕
                     needs_info             (test retry)

Any state → paused | failed
paused → queued | running | planning
failed → queued (retry)
```

**Orchestrator Architecture**:
- **Polling loop** (60s default): GitHub issue sync, auto-start queued jobs, check stale jobs, manage rate limits
- **Agent executor**: Spawns Claude CLI with structured prompts, tracks PIDs, handles timeouts (1.1x agent timeout)
- **Crash recovery**: On startup — pauses running jobs, kills orphaned PIDs, recovers orphaned PRs
- **Ring buffer**: 500-entry in-memory buffer per job with 2s batch flush to DuckDB; WebSocket broadcasts immediately

### apps/inside — Project Scaffolding

**Purpose**: Chat-driven project creation, scaffolding, and design workspace.

**7-Phase Workflow**: Input → Generation → Preview → Scaffold → Upgrade → Design → Completion

**Session Types**: `scaffold`, `upgrade`, `auto_fix`, `upgrade_init`, `chat`

**Database**: DuckDB at `~/.inside/data.duckdb` with 11 tables.

### apps/inspector — PR Analysis

**Purpose**: GitHub PR analysis tool with skill building and AI-powered comment resolution.

**Workflows**:
1. **Dashboard** — PR metrics, size classification, skill gap analysis
2. **Skill Builder** — Categorize review comments into learnable patterns
3. **PR Splitter** — AI-generated plans to decompose large PRs
4. **Comment Resolver** — AI-generated code fixes for review comments

**Database**: DuckDB at `~/.inspector/data.duckdb` with tables for repos, PRs, comments, skills, split plans, and fixes.

### apps/b4u — Video Walkthrough Generator

**Purpose**: Prototype for automated repository walkthrough video generation.

**Architecture**: Single-page app with chat interface, `useReducer` + Context state management, phase controller for 7-phase workflow. Uses `@claudekit/playwright` for browser automation and video capture.

### apps/ducktails — DuckDB Admin UI

**Purpose**: Browse, query, and edit all ClaudeKit databases from one interface.

**Database Registry** (static mapping):

| Key | Path |
|-----|------|
| gadget | `~/.gadget/data.duckdb` |
| inspector | `~/.inspector/data.duckdb` |
| inside | `~/.inside/data.duckdb` |
| b4u | `apps/b4u/data/b4u.duckdb` |
| gogo | `apps/gogo-orchestrator/data/gogo.duckdb` |

**Features**: Table browsing with pagination, column schema inspection, custom SQL execution, inline data editing, query history (localStorage).

---

## Shared Packages

### Package Dependency Graph

```
Independent Base Layer (no internal deps)
├── @claudekit/duckdb
├── @claudekit/claude-runner
├── @claudekit/logger
├── @claudekit/validation
├── @claudekit/github
├── @claudekit/playwright
└── @claudekit/gogo-shared

Composition Layer
├── @claudekit/session          (no internal deps, uses DI)
├── @claudekit/hooks            (peer: react)
├── @claudekit/ui               → hooks, session
├── @claudekit/claude-usage     → hooks, ui
└── @claudekit/mcp-logs         → logger
```

### @claudekit/duckdb — Database Layer

Provides a unified database interface for all DuckDB-backed apps.

**Key exports**: `createDatabase`, `queryAll<T>`, `queryOne<T>`, `execute`, `withTransaction`, `buildUpdate`, `buildInClause`, `runMigrations`

**Patterns**:
- **Async mutex**: Serializes all prepared statement execution (DuckDB node-api limitation)
- **globalThis caching**: Optional connection caching to survive Next.js HMR reloads
- **WAL recovery**: Auto-removes corrupt `.wal` files and retries connection
- **Parameter binding**: Converts `?` placeholders to DuckDB's `$1, $2, ...` format with type inference
- **Type conversion**: Auto-converts DuckDB wrapper types (UUID, Timestamp, BigInt) to JS primitives
- **Migration runner**: Numbered SQL files tracked in `_migrations` table, idempotent execution

### @claudekit/session — Session Lifecycle

Manages long-running operations across all apps with dependency-injected persistence.

**Key exports**: `createSessionManager`, `createSessionSSEResponse`, `createStreamHandler`, `createCancelHandler`

**Architecture**:
- **Dependency injection**: Apps provide `SessionPersistence` callbacks (`loadSession`, `updateSession`, `persistLogs`)
- **Ring buffer**: Fixed-size event buffer (default 500) for late subscriber replay
- **Batch flushing**: Logs collected in pending array, flushed to persistence every 2000ms
- **SSE streaming**: Server-Sent Events response with heartbeat (15s) and DB replay on reconnection
- **Event types**: `init`, `progress`, `log`, `chunk`, `done`, `error`, `cancelled`, `heartbeat`

**Session runner signature**:
```typescript
(ctx: { onProgress, signal, sessionId }) => Promise<{ result? }>
```

### @claudekit/claude-runner — CLI Integration

Spawns Claude CLI processes with stream-JSON output parsing.

**Key exports**: `runClaude`, `spawnClaude`, `isClaudeCliAvailable`, `parseStreamJsonEvent`

**Capabilities**: PID tracking for kill/cancel, AbortSignal support, configurable tool allow/disallow lists, session ID for continuity, timeout management with health checks.

### @claudekit/ui — Component Library

54 shadcn/ui-style components built on Base UI primitives, plus 6 shared layout components.

**Categories**:
- **Form**: input, textarea, checkbox, switch, select, slider, label
- **Layout**: card, separator, tabs, scroll-area, split-panel, collapsible, sheet, dialog
- **Display**: badge, progress, skeleton, table, tooltip
- **Specialty**: markdown-renderer, syntax-highlighter, diff-viewer, file-tree, file-viewer, directory-picker, session-terminal
- **Shared layouts**: AppLayout, SharedHeader, SharedSidebar, SharedFooter

**Utilities**: `cn()` (clsx + tailwind-merge), `Slot` component for asChild pattern, `formatBytes`, `formatElapsed`, `timeAgo`, `generateId`

### @claudekit/hooks — React Hooks

**Hooks** (5 hooks + ThemeFOUCScript):
- `useAppTheme(options?)` — 9 color themes, localStorage persistence, CSS class switching on `<html>`
- `useAutoScroll(enabled?)` — MutationObserver-based auto-scroll with user intent detection
- `useIsMobile()` — 768px breakpoint
- `useSessionStream(options)` — SSE consumer with reconnection (3 retries, exponential backoff), log accumulation (max 500)
- `useClaudeUsageRefresh(options)` — Rate limit and usage polling
- `ThemeFOUCScript` — Inline script component to prevent flash of unstyled content during hydration

### @claudekit/logger — Structured Logging

Pino-based logging with dual transport (console + file).

**File format**: Daily-rotating NDJSON at `~/.claudekit/logs/{app}.{YYYY-MM-DD}.ndjson`

**Log querying**: `readLogEntries`, `filterLogEntries`, `listLogFiles`, `pruneOldLogs` (14-day retention)

Server-only — must be added to `serverExternalPackages` in Next.js config.

### @claudekit/gogo-shared — GoGo Domain Types

Pure TypeScript types and constants (no runtime dependencies) defining the contract between GoGo Web and Orchestrator.

**Exports**: `Job`, `JobEvent`, `JobLog`, `Repository`, `Issue`, `VALID_TRANSITIONS`, `JOB_STATUS_LABELS`, `ARCHIVABLE_STATUSES`, WebSocket message types

### @claudekit/github — GitHub API Client

Octokit wrapper with built-in rate limit tracking.

**Rate limit handling**: In-memory cache keyed by hashed tokens, auto-updates from response headers, warning threshold at 20% remaining (5s delay), critical at 10% (delay until reset, capped 60s).

**Error hierarchy**: `GitHubApiError` → `GitHubAuthError`, `GitHubRateLimitError`, `RepositoryNotFoundError`, `GitHubCredentialsError`

### @claudekit/mcp-logs — MCP Log Server

Model Context Protocol server providing 5 tools for Claude to query application logs:

1. `list_log_files` — List NDJSON files with metadata
2. `search_logs` — Full-text search with level/time filters
3. `tail_logs` — Last N lines from an app's log
4. `get_recent_errors` — Error/fatal entries across all apps
5. `get_log_context` — Entries around a specific timestamp

### @claudekit/playwright — Browser Automation

Browser session management, navigation, screenshot capture, and video recording for B4U and Inside apps. Also provides E2E testing infrastructure with config factory, fixtures, and page objects.

### @claudekit/claude-usage — Usage Tracking

Claude API usage monitoring with pricing calculations, rate limit polling, and UI components (`ClaudeUsageDialog`, `HeaderUsageWidget`). Server subpath parses Claude JSONL session files for cost aggregation.

### @claudekit/validation — Schema Utilities

Lightweight Zod-based request/response parsing: `parseBody`, `parseQuery`, `ParseResult<T>`.

---

## Data Flow

### 1. Session-Based Operations (Gadget, Inside, Inspector, B4U)

```
User action (e.g. "Start Scan")
  │
  ▼
Server Action (Next.js)
  │
  ├─► createSessionManager.startSession(id, runner)
  │     │
  │     ├─► runner(ctx) executes            ◄── Business logic
  │     │     │
  │     │     ├─► ctx.onProgress(event)     ◄── Emits events
  │     │     │     │
  │     │     │     ├─► Ring buffer (500)   ◄── In-memory
  │     │     │     ├─► Subscribers          ◄── Real-time push
  │     │     │     └─► Pending logs         ◄── Batch flush (2s) → DuckDB
  │     │     │
  │     │     └─► Claude CLI (optional)     ◄── @claudekit/claude-runner
  │     │           │
  │     │           └─► Stream-JSON parsing → onProgress
  │     │
  │     └─► session.done / session.error
  │
  ▼
Client subscribes via SSE
  │
  ├─► GET /api/sessions/{id} (SSE endpoint)
  │     │
  │     ├─► Replay buffered events from ring buffer
  │     └─► Stream new events in real-time
  │
  └─► useSessionStream() hook
        │
        └─► Updates UI (logs, progress, status)
```

### 2. GoGo Job Lifecycle

```
GitHub Issue (labeled)
  │
  ▼
Orchestrator Polling Loop (60s)
  │
  ├─► Sync issues from GitHub
  ├─► Auto-create jobs for new issues
  │
  ▼
Job Queue
  │
  ├─► State: queued → planning
  │     │
  │     ▼
  │   Agent Executor spawns Claude CLI
  │     │
  │     ├─► Claude generates plan
  │     ├─► Posts plan to GitHub issue
  │     └─► State: awaiting_plan_approval
  │
  ├─► GitHub approval comment detected
  │     │
  │     └─► State: running
  │           │
  │           ├─► Agent executes in git worktree
  │           ├─► Logs stream via ring buffer → WebSocket → GoGo Web
  │           └─► State: ready_to_pr
  │
  ├─► Test execution
  │     │
  │     ├─► Pass → Create PR → State: pr_opened
  │     └─► Fail → Retry with agent → State: running
  │
  └─► PR merge → State: done

GoGo Web (Dashboard)
  │
  ├─► REST polling (5–30s) for data freshness
  ├─► WebSocket subscription for real-time job logs
  └─► TanStack React Query for client-side caching
```

### 3. Health Monitoring (Web Dashboard)

```
Web Dashboard
  │
  ├─► Health Poller (every few seconds)
  │     │
  │     ├─► HTTP request to each app port
  │     │     2000, 2050, 2100, 2150, 2200, 2201, 2300, 2400
  │     │
  │     └─► Debounced state transitions
  │           (2 consecutive polls before status change)
  │
  ├─► Log Tailing (SSE)
  │     │
  │     ├─► Watches ~/.claudekit/logs/{app}.{date}.ndjson
  │     ├─► Sends new lines when file size changes
  │     └─► Virtual scrolling renders 5000+ lines
  │
  └─► App Management
        │
        └─► Start/stop/restart via daemon proxy
```

### 4. DuckTails Cross-Database Access

```
DuckTails (port 2050)
  │
  ├─► Connection Manager
  │     │
  │     ├─► ~/.gadget/data.duckdb
  │     ├─► ~/.inspector/data.duckdb
  │     ├─► ~/.inside/data.duckdb
  │     ├─► apps/b4u/data/b4u.duckdb
  │     └─► apps/gogo-orchestrator/data/gogo.duckdb
  │
  ├─► globalThis connection cache per path
  │
  └─► Server Actions for all operations
        ├─► List tables, view schema
        ├─► Browse data with pagination
        ├─► Execute custom SQL
        └─► Insert/update/delete rows
```

---

## Key Architectural Patterns

### Server/Client Component Split

All Next.js apps enforce a strict two-tier pattern per page:

1. **Server Component** (`page.tsx`) — Fetches data via Server Actions, passes as props
2. **Client Component** (`*-client.tsx`) — Receives data, handles interactivity with `"use client"`

This prevents hydration mismatches and keeps data fetching on the server while interactivity stays client-side.

### Dependency Injection for Persistence

`@claudekit/session` uses DI rather than direct database coupling. Apps inject their own persistence callbacks:

```typescript
createSessionManager({
  persistence: {
    loadSession: (id) => /* app-specific DB query */,
    updateSession: (id, updates) => /* app-specific DB update */,
    persistLogs: (id, logs) => /* app-specific batch insert */,
  }
});
```

This allows the session package to remain database-agnostic while each app controls its own schema.

### HMR-Safe Global Caching

DuckDB connections and session managers are optionally cached on `globalThis` to survive Next.js hot module reloads during development:

```typescript
const cache = useGlobalCache ? (globalThis as GlobalCache) : {};
```

### Async Mutex for DuckDB

DuckDB's Node API doesn't support concurrent prepared statements on a single connection. All query operations are serialized through a promise-chain mutex:

```typescript
let _lock = Promise.resolve();
function withLock<T>(fn: () => Promise<T>): Promise<T> {
  _lock = _lock.then(fn, fn);
  return _lock;
}
```

### Ring Buffer with Batch Flushing

Session events use a fixed-size ring buffer (500 entries) for in-memory retention and late-subscriber replay. Logs are accumulated and flushed to the database every 2 seconds to reduce write amplification.

### Stream-JSON Parsing

Claude CLI outputs newline-delimited JSON. `@claudekit/claude-runner` parses this stream in real-time, emitting structured events (log chunks, tool output, status) that feed into session progress callbacks.

### Atomic State Transitions

GoGo Orchestrator wraps all job status changes in `withTransaction()` to ensure the status update and corresponding event record are created atomically. No direct status updates outside the state machine.

### Crash Recovery

Apps reconcile state on startup:
- **GoGo Orchestrator**: Pauses running/planning jobs, kills orphaned PIDs, recovers orphaned PRs, prunes old data
- **DuckDB apps**: Mark stuck sessions as errored, clean orphaned resources

### Theme System

9 HSL-based color themes (Amethyst default) applied via CSS classes on `<html>`:
- `useAppTheme()` manages theme state with localStorage persistence
- `ThemeFOUCScript` prevents flash of unstyled content during hydration
- Themes define CSS custom properties (`--background`, `--foreground`, `--primary`, etc.)
- Tailwind uses semantic tokens: `bg-background`, `text-primary`, etc.

---

## Design Decisions and Trade-offs

### DuckDB over SQLite

**Decision**: Use DuckDB as the embedded database for all apps.

**Rationale**: DuckDB provides columnar storage optimized for analytical queries (log aggregation, scan statistics), native JSON support, and a richer SQL dialect. It handles the read-heavy, append-heavy workloads of audit logs and session data well.

**Trade-off**: DuckDB's Node API requires single-threaded prepared statement execution (hence the async mutex), and WAL corruption can occur on unclean shutdowns (mitigated with auto-recovery).

### Local-First Architecture

**Decision**: All tools run entirely on the developer's machine with no cloud backend.

**Rationale**: Developer tools handle sensitive data (code, credentials, API tokens). Local-first eliminates data privacy concerns, network latency, and service availability dependencies.

**Trade-off**: No multi-device sync, no team collaboration features, no centralized dashboards. Each developer runs their own instance.

### Biome over ESLint + Prettier

**Decision**: Single tool (Biome) for both linting and formatting.

**Rationale**: Biome is significantly faster than ESLint + Prettier, provides consistent behavior, and eliminates configuration conflicts between separate linting and formatting tools.

**Trade-off**: Smaller ecosystem of rules compared to ESLint. Some niche rules may not be available.

### Base UI over Radix

**Decision**: Use `@base-ui/react` instead of Radix UI for component primitives.

**Rationale**: Base UI provides simpler data attribute APIs (`data-[open]` vs Radix's `data-[state=open]`), better composition patterns, and is actively developed by the MUI team.

**Trade-off**: Smaller community and fewer third-party resources compared to Radix.

### Unified Session Package with DI

**Decision**: Single `@claudekit/session` package used by all apps, with dependency-injected persistence rather than direct database coupling.

**Rationale**: Avoids duplicating session management logic across 5+ apps while allowing each app to control its own database schema and table structure.

**Trade-off**: Adds indirection. Debugging session issues requires understanding both the generic session manager and the app-specific persistence layer.

### Fastify for GoGo Orchestrator (Not Next.js)

**Decision**: GoGo Orchestrator uses Fastify instead of Next.js API routes.

**Rationale**: The orchestrator is a pure backend service with no UI, needs WebSocket support, runs long-lived polling loops, and manages background processes. Fastify provides better control over server lifecycle, WebSocket handling, and process management than Next.js serverless-oriented API routes.

**Trade-off**: Different framework from the rest of the monorepo. Developers need to understand both Next.js and Fastify patterns.

### Numbered Migration Files

**Decision**: All DuckDB apps use numbered `.sql` migration files (e.g., `001_initial.sql`, `002_add_column.sql`) tracked via `runMigrations()` from `@claudekit/duckdb`.

**Rationale**: Numbered migrations provide a consistent, trackable way to evolve database schemas across all apps. The `_migrations` table in each database records which migrations have been applied, enabling idempotent execution.

**Trade-off**: Migration files are additive-only. Destructive schema changes still require `pnpm db:reset` during development. Each app manages its own migration directory independently.

### REST + WebSocket Hybrid (GoGo)

**Decision**: GoGo Web uses REST polling (5–30s) for data freshness combined with WebSocket for real-time event streaming.

**Rationale**: REST polling ensures data consistency and handles reconnection gracefully. WebSocket provides immediate feedback for job logs and status changes. The hybrid approach is more resilient than WebSocket-only.

**Trade-off**: Higher server load from polling. More complex client-side data management (TanStack React Query + WebSocket event merging).

---

## Development Infrastructure

### Dev Orchestration

The `scripts/` directory provides two development modes:

**Foreground** (`pnpm dev:fg`): Runs all apps in the current terminal with color-coded output per app. Good for debugging.

**Background Daemon** (`pnpm dev`): Spawns a detached daemon process that manages all apps. Features:
- PID tracking in `~/.claudekit/pids/dev.pid`
- Per-app auto-start/auto-restart settings in `~/.claudekit/app-settings.json`
- Crash recovery with exponential backoff (max 3 attempts)
- Logs stored in `~/.claudekit/logs/`

### CI Pipeline

GitHub Actions workflow (`.github/workflows/ci.yml`) on push to main and PRs:

1. **Typecheck** — `pnpm typecheck`
2. **Lint** — Biome check
3. **Test** — Vitest with coverage
4. **Build** — Full monorepo build

### Testing Strategy

- **Unit/Integration**: Vitest 4 with `@testing-library/react` for component tests
- **E2E**: Playwright with `@claudekit/playwright` providing config factory, fixtures, and page objects
- **Coverage**: `@vitest/coverage-v8` with per-package reporting
- **Component Development**: Storybook 10.2 with co-located `.stories.tsx` files

### Database Management

```bash
pnpm --filter <app> db:reset    # Delete .duckdb and .wal files
pnpm --filter <app> db:seed     # Re-seed built-in data
pnpm --filter <app> db:migrate  # Run numbered migrations (gogo-orchestrator)
pnpm db:reset                   # Reset all app databases
```

### Environment Configuration

Apps use `.env` files for optional integrations. Only GoGo Orchestrator requires a GitHub token for core functionality. Other apps work without any environment variables.

Key environment variables:
- `GITHUB_PERSONAL_ACCESS_TOKEN` — GitHub API access
- `MCP_API_TOKEN` — MCP server authentication
- `DATABASE_PATH` — Override default DuckDB location
- `LOG_LEVEL` — Pino log level (default: `info`)
