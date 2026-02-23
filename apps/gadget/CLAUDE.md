# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm dev          # Start dev server at http://localhost:2100
pnpm build        # Production build (also runs type-check)
pnpm lint         # Biome check (lint + format check)
pnpm lint:fix     # Biome check with auto-fix
pnpm format       # Biome format (write)
pnpm test         # Run tests with vitest
pnpm seed         # Re-seed built-in data (tsx src/lib/db/seed.ts)
pnpm db:reset     # Delete DuckDB data file and WAL (full reset)
pnpm knip         # Detect unused exports, dependencies, and files
```

## Environment Variables

See `.env.local.example`. Key variables:
- `MCP_API_TOKEN` — required for MCP programmatic access (Bearer token auth)
- `DATABASE_PATH` — override database location (default: `~/.gadget/data.duckdb`)
- `GITHUB_PERSONAL_ACCESS_TOKEN` — for GitHub API integration
- Additional optional keys for MCP server integrations (Brave, Firecrawl, Exa, Tavily, Notion, Stripe, OpenAI, Replicate, etc.)

## Architecture

**Gadget** is a **Next.js 16 App Router** local-first dev tool (not a SaaS). It audits repositories against policies, manages AI integrations (Claude skills, MCP servers, agents), generates fix diffs, scaffolds new projects, and provides upgrade task management with screenshot capture. All imports use the `@/` alias for `src/`.

### Directory Layout

```
src/
├── app/                          # Next.js App Router
│   ├── layout.tsx                # Root layout (force-dynamic, fonts, theme)
│   ├── page.tsx                  # Dashboard
│   ├── repos/                    # Repository listing + detail
│   ├── repositories/             # Alternate repo routes
│   ├── scans/                    # Scan history + new scan wizard
│   ├── policies/                 # Policy management
│   ├── projects/                 # Project creation, scaffolding, chat, archived
│   ├── ai-integrations/          # Skills, MCP servers, agents
│   ├── patterns/                 # Patterns library
│   ├── concepts/                 # Concept management + sources
│   ├── toolbox/                  # CLI tool checker
│   ├── settings/                 # App settings
│   └── api/                      # 27 REST endpoints
├── components/
│   ├── ui/                       # shadcn/ui primitives (24 components)
│   ├── layout/                   # Shell, sidebar, header, nav
│   ├── dashboard/                # Dashboard client
│   ├── repos/                    # Repo detail tabs, Claude config editor
│   ├── policies/                 # Policy form + listing
│   ├── scans/                    # Scan wizard
│   ├── generator/                # Project scaffolding, chat, design workspace, upgrades
│   ├── sessions/                 # Session badge, terminal, panel, indicator, context
│   ├── code/                     # Code browser, file viewer, diff, commit views
│   ├── settings/                 # Settings tabs, API keys
│   ├── concepts/                 # Concept sources, install dialogs
│   ├── patterns/                 # Patterns library
│   └── toolbox/                  # Toolbox client
├── lib/
│   ├── db/                       # DuckDB connection, schema, helpers, seed
│   ├── actions/                  # 22 Server Action files ("use server")
│   ├── services/                 # Business logic, scanners, auditors, session system
│   │   ├── auditors/             # 4 auditors: dependencies, ai-files, structure, custom-rules
│   │   └── session-runners/      # 12 per-type session runner factories + index
│   ├── types.ts                  # All domain types
│   ├── constants.ts              # Sentinel IDs, discovery patterns, labels, session config
│   └── utils.ts                  # cn(), generateId(), nowTimestamp(), parsePolicy(), etc.
└── hooks/
    ├── use-mobile.ts             # Mobile detection hook
    ├── use-color-scheme.ts       # Color scheme detection
    ├── use-tab-navigation.ts     # Tab navigation state
    ├── use-auto-scroll.ts        # Auto-scroll for terminal output
    └── use-session-stream.ts     # SSE hook for session event streaming
```

### Data Layer

- **DuckDB** via `@duckdb/node-api` (async, promise-native API). DB file at `~/.gadget/data.duckdb`.
- `src/lib/db/index.ts` — singleton `DuckDBInstance` + `DuckDBConnection`, cached on `globalThis` to survive Next.js HMR. Lazy async init with promise dedup. On startup: runs schema init, auto-recovers orphaned scans and sessions (stuck in 'running'/'pending' → marked 'error'), prunes old session logs (>7 days) and old sessions (>30 days), auto-seeds built-in data if not yet seeded. WAL corruption auto-recovery (removes `.wal` file and retries).
- `src/lib/db/helpers.ts` — thin wrapper bridging `?` placeholders to DuckDB's `$1, $2, ...` positional params. Exports `queryAll<T>()`, `queryOne<T>()`, `execute()`, `checkpoint()`, `withTransaction()`, `buildUpdate()`. Includes an async mutex to serialize prepared statement execution (DuckDB doesn't support concurrent prepared statements on a single connection).
- `src/lib/db/schema.ts` — 32 tables including `sessions` and `session_logs` for the unified session system. All tables use `CREATE TABLE IF NOT EXISTS`. Uses `BOOLEAN` columns (not INTEGER 0/1). Timestamps via `CAST(current_timestamp AS VARCHAR)`.
- No migrations system — all tables use `CREATE IF NOT EXISTS` in schema.ts. Use `pnpm db:reset` for breaking schema changes.
- `@duckdb/node-api` requires `serverExternalPackages` in `next.config.ts` and `pnpm.onlyBuiltDependencies` in `package.json` for native compilation.

### Session System

The session system provides a unified abstraction for all long-running operations. All streaming operations go through sessions — there are no standalone streaming API routes.

- **`src/lib/services/session-manager.ts`** — `globalThis`-cached singleton managing in-memory `LiveSession` objects. Handles create, start, cancel, subscribe, cleanup. Fans out `SessionEvent`s to SSE subscribers and batches log persistence to DuckDB.
- **`src/lib/services/session-runners/`** — 12 runner factories (one per `SessionType`):
  - `scan` — repository scanning
  - `quick-improve` — quick repo improvements via Claude
  - `finding-fix` — finding-specific fixes via Claude
  - `chat` — chat sessions with Claude
  - `scaffold` — project scaffolding via Claude
  - `upgrade` — upgrade task execution via Claude
  - `upgrade-init` — upgrade initialization
  - `auto-fix` — automated error detection and fixing
  - `fix-apply` — apply fix operations
  - `ai-file-gen` — AI file generation
  - `cleanup` — resource cleanup
  - `toolbox-command` — toolbox command execution
- **`src/lib/actions/sessions.ts`** — Server Actions for session DB records (`createSessionRecord`, `updateSessionRecord`, `getSessionRecord`, `insertSessionLogs`, etc.)
- **`src/app/api/sessions/`** — REST endpoints: `POST /api/sessions` (create+start), `GET /api/sessions/[id]/stream` (SSE), `POST /api/sessions/[id]/cancel`.
- **`src/hooks/use-session-stream.ts`** — client-side SSE hook for consuming session events.
- **`src/components/sessions/`** — `session-terminal.tsx` (log viewer), `session-panel.tsx` (slide-over panel), `session-badge.tsx`, `session-indicator.tsx`, `session-context.tsx`.
- Constants in `src/lib/constants.ts`: `SESSION_EVENT_BUFFER_SIZE=500`, `SESSION_LOG_FLUSH_INTERVAL_MS=2000`, `SESSION_HEARTBEAT_INTERVAL_MS=15000`.

### Server/Client Split

Every page follows the same pattern:
1. **Server Component** (`src/app/**/page.tsx`) — calls Server Actions to fetch data, passes as props
2. **Client Component** (`src/components/*/**-client.tsx`) — receives data via props, handles interactivity with `"use client"`

### Server Actions (`src/lib/actions/`)

All DB reads/writes go through `"use server"` functions in 22 action files. These call `await getDb()` to get a DuckDB connection, then use async helper functions (`queryAll`, `queryOne`, `execute`).

Key action files: `repos.ts`, `scans.ts`, `findings.ts`, `fixes.ts`, `policies.ts`, `concepts.ts`, `concept-sources.ts`, `settings.ts`, `claude-config.ts`, `claude-usage.ts`, `generator-projects.ts`, `env-keys.ts`, `toolbox.ts`, `policy-templates.ts`, `custom-rules.ts`, `manual-findings.ts`, `code-browser.ts`, `prototype-files.ts`, `auto-fix.ts`, `screenshots.ts`, `upgrade-tasks.ts`, `sessions.ts`.

### Route Handlers (API)

27 REST endpoints under `src/app/api/`:
- `scans/` — streaming scan execution (ReadableStream progress)
- `repos/` — repository CRUD
- `repos/[repoId]/raw/` — raw repo data access
- `findings/`, `fixes/`, `policies/`, `reports/` — audit data CRUD
- `fixes/apply/`, `fixes/preview/`, `fixes/restore/` — fix lifecycle
- `discover/` — repo discovery
- `fs/browse/` — filesystem browsing
- `toolbox/check/` — CLI tool checking
- `claude-usage/` — Claude API usage tracking
- `projects/` — project creation and listing
- `projects/[projectId]/` — project detail
- `projects/[projectId]/raw/` — raw project data access
- `projects/[projectId]/dev-server/` — dev server management
- `projects/[projectId]/auto-fix/` — auto-fix management
- `projects/[projectId]/export/` — project export
- `projects/[projectId]/screenshots/` — project screenshot capture and listing
- `projects/[projectId]/screenshots/[screenshotId]/` — individual screenshot access
- `projects/[projectId]/upgrade/` — upgrade task management
- `sessions/` — create and start sessions
- `sessions/[sessionId]/` — session detail
- `sessions/[sessionId]/stream/` — SSE event stream
- `sessions/[sessionId]/cancel/` — cancel a running session

### Services (`src/lib/services/`)

Key service files:
- **`session-manager.ts`** — unified session lifecycle management (create, start, cancel, subscribe, cleanup)
- **`session-runners/`** — 12 per-type runner factories dispatched via `sessionRunners` registry in `index.ts`
- **`claude-runner.ts`** — invoke Claude CLI (`runClaude()`) with stream-json parsing, abort support, PID tracking
- **`process-runner.ts`** — generic bash process spawning with abort support and stdout/stderr streaming
- **`claude-usage-api.ts`** — Claude usage API integration
- **`scanner.ts`** — walks filesystem from scan roots, finds `.git` directories, detects package managers/monorepos/repo types
- **`auditors/`** — four auditors producing `AuditFinding[]`: `dependencies.ts`, `ai-files.ts`, `structure.ts`, `custom-rules.ts` (plus `index.ts` barrel)
- **`fix-planner.ts`** — converts findings into fix actions with file diffs (before/after)
- **`apply-engine.ts`** — snapshots files, applies fixes atomically (write to temp then rename), supports restore
- **`auto-fix-engine.ts`** — automated error detection and fixing via Claude
- **`generator.ts`** — scaffolds new projects from templates with feature toggles
- **`reporter.ts`** — exports reports as JSON, Markdown, or PR description format
- **`concept-scanner.ts`** / **`github-concept-scanner.ts`** / **`mcp-list-scanner.ts`** / **`claude-config-scanner.ts`** — discover concepts from various sources
- **`claude-config.ts`** / **`claude-settings-schema.ts`** / **`claude-session-parser.ts`** — Claude config read/write/parse
- **`github-client.ts`** — GitHub API integration
- **`encryption.ts`** — AES-256-GCM encryption for GitHub PATs
- **`tool-checker.ts`** — CLI tool detection and version checking
- **`policy-matcher.ts`** / **`version-resolver.ts`** — policy matching and version resolution
- **`interface-design.ts`** — AI-powered interface design generation
- **`scaffold-prompt.ts`** — prompt generation for project scaffolding
- **`language-detector.ts`** — programming language detection
- **`finding-prompt-builder.ts`** / **`finding-classifier.ts`** — AI-powered finding analysis
- **`dev-server-manager.ts`** — manages project dev server lifecycle
- **`spec-exporter.ts`** — export project specs to files
- **`screenshot-service.ts`** — capture and manage project screenshots via Playwright
- **`quick-improve-prompts.ts`** — prompt generation for quick repo improvements

### UI Stack

- **shadcn/ui** components in `src/components/ui/` (configured via `components.json`, RSC-enabled)
- **Tailwind CSS v4** via `@tailwindcss/postcss` plugin, with `@tailwindcss/typography`
- **Design tokens** in `src/app/globals.css` — HSL CSS custom properties for light/dark themes, semantic colors (`success`, `warning`, `info`), sidebar theme tokens
- **Motion** (Framer Motion v12) for animations, **Lucide** for icons, **next-themes** for theme switching
- **Sonner** for toast notifications, **Shiki** for syntax highlighting, **react-markdown** + **remark-gfm** for Markdown rendering
- Layout: collapsible desktop sidebar + mobile bottom nav, using `next/dynamic` with `ssr: false` to avoid SSR issues with Motion

## Key Patterns

### Next.js
- Async params: `params: Promise<{ repoId: string }>` — must `await params` before use
- Root layout uses `export const dynamic = "force-dynamic"` — required because DuckDB pages can't be statically prerendered
- Layout uses `next/dynamic` with `ssr: false` for sidebar/header components to avoid Motion SSR issues
- Security headers configured in `next.config.ts` (X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy)

### DuckDB

See `packages/duckdb/CLAUDE.md` for general DuckDB query patterns and gotchas. App-specific notes:
- `getDb()` is async — always `const db = await getDb()`
- JSON fields (policies' `expected_versions`, `banned_dependencies`, etc.) stored as TEXT, parsed with `JSON.parse` on read
- No migrations system — all tables use `CREATE IF NOT EXISTS` in schema.ts. Use `pnpm db:reset` for breaking schema changes

### Session System
- All long-running operations go through the session system — do NOT create standalone streaming routes
- To add a new operation type: add to `SessionType` union in `types.ts`, create a runner factory in `session-runners/`, register it in `session-runners/index.ts`, add label to `SESSION_TYPE_LABELS` in `constants.ts`
- `SessionRunner` signature: `(ctx: { onProgress, signal, sessionId }) => Promise<{ result? }>`
- Runner factory signature: `(metadata: Record<string, unknown>, contextId?: string) => SessionRunner`
- Emit `SessionEvent`s via `onProgress()` — types: `progress`, `log`, `done`, `error`, `cancelled`, `heartbeat`, `init`
- Use `setCleanupFn()` for resource cleanup (e.g., git worktree removal) on cancel/error
- Use `setSessionPid()` to track Claude CLI process IDs for killability
- Sessions use `globalThis` caching (same pattern as DuckDB) to survive HMR

### Claude CLI Integration
- `runClaude()` in `src/lib/services/claude-runner.ts` is the standard way to invoke Claude CLI
- Parses `--output-format stream-json` events for real-time progress
- Supports abort via `AbortSignal`, PID tracking via `onPid`, configurable tool allowlists/disallowlists
- Default: allows `Write`, disallows `Edit,Bash`
- `runProcess()` in `src/lib/services/process-runner.ts` for generic bash command execution with abort support
- Use `async import()` not `require()` for dynamic imports in services

### TypeScript / Code Style
- All domain types defined in `src/lib/types.ts`
- IDs generated via `generateId()` in `src/lib/utils.ts` (uses `crypto.randomUUID()`)
- Timestamps via `nowTimestamp()` (returns `new Date().toISOString()`)
- `as const` arrays need explicit `string[]` typing when passed to functions expecting mutable arrays
- **Biome** for linting and formatting (replaces ESLint + Prettier). Config in `biome.json`: 2-space indent, 120 line width, double quotes, semicolons, trailing commas.
- **Husky** + **lint-staged** run `biome check --write` on pre-commit for `*.{js,ts,jsx,tsx,css,json}` files
- Scanner behavior controlled by constants in `src/lib/constants.ts`: `DEFAULT_EXCLUDE_PATTERNS`, `LOCKFILE_TO_PM`, `MONOREPO_INDICATORS`, `REPO_TYPE_INDICATORS`, `CONCEPT_DISCOVERY_PATTERNS`
- Sentinel IDs: `LIBRARY_REPO_ID = "__library__"`, `CURATED_SOURCE_ID`, `CLAUDE_CONFIG_SOURCE_ID`

### Common Biome Lint Gotchas
- Imports must be sorted (type imports before namespace imports from same module)
- No non-null assertions (`!`) — extract to variable first
- Unused function parameters are errors — remove from destructuring
- `useExhaustiveDependencies` — use `.length` instead of array ref in dependency arrays
