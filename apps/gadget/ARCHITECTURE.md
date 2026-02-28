# Gadget Architecture

## Overview

Gadget is a **local-first developer tool** built on **Next.js 16 App Router**. It audits local repositories against configurable policies, manages AI integrations (Claude skills, MCP servers, agents), and generates fix diffs. All data stays on the developer's machine -- there is no cloud backend or SaaS dependency.

```
 User (Browser)
      |
 Next.js App Router (localhost:2100)
      |
      +--- Server Components (pages)        -- fetch data via Server Actions
      +--- Client Components ("use client")  -- interactivity, state, animations
      +--- REST API Routes                   -- streaming operations, CRUD
      |
 Server Actions ("use server")
      |
 DuckDB (local file at ~/.gadget/data.duckdb)
      |
 Services Layer
      |
      +--- Session Manager        -- orchestrates long-running background tasks
      |       +--- Session Runners (scan, quick-improve, finding-fix, ...)
      |       +--- Claude Runner   -- spawns Claude CLI as child process
      |       +--- SSE Stream API  -- real-time progress to browser
      |
      +--- Scanner / Auditors     -- discover repos, check policies
      +--- Fix Planner / Engine   -- generate and apply file diffs
      +--- Concept Scanners       -- discover AI skills, MCP servers, etc.
      |
      +--- Local filesystem (repos, git, config files)
      +--- Claude CLI (via @claudekit/claude-runner)
      +--- GitHub API (repo sync, concept discovery)
```

## Technology Stack

| Layer          | Technology                                                      |
| -------------- | --------------------------------------------------------------- |
| Framework      | Next.js 16 (App Router, React 19, RSC)                         |
| Language       | TypeScript 5.9 (strict mode, `@/` path alias)                  |
| Database       | DuckDB via `@claudekit/duckdb` (local file, WAL mode)          |
| UI Framework   | shadcn/ui via `@claudekit/ui`, Tailwind CSS v4                 |
| Animations     | Motion (Framer Motion v12)                                      |
| Icons          | Lucide React                                                    |
| Theming        | next-themes (light/dark/system), custom workbench color schemes |
| Syntax         | Shiki (code highlighting)                                       |
| Markdown       | react-markdown + remark-gfm                                    |
| Toasts         | Sonner                                                          |
| Lint/Format    | Biome (replaces ESLint + Prettier)                              |
| Testing        | Vitest                                                          |
| Dead code      | Knip                                                            |
| Package Manager| pnpm                                                            |
| AI Integration | Claude CLI via `@claudekit/claude-runner`                       |
| Encryption     | Node.js crypto (AES-256-GCM for GitHub PATs)                   |

## Shared Packages

Gadget relies on several `@claudekit/*` packages:

| Package | Purpose |
|---------|---------|
| `@claudekit/duckdb` | Database connection factory, query helpers, migration runner |
| `@claudekit/session` | Session lifecycle management, reconciliation, constants |
| `@claudekit/claude-runner` | Claude CLI spawn + stream-json parsing |
| `@claudekit/claude-usage` | Claude API rate limit tracking |
| `@claudekit/logger` | Pino-based structured logging |
| `@claudekit/ui` | shadcn/ui components, `cn()` utility, security headers |
| `@claudekit/hooks` | React hooks (useAppTheme, useAutoScroll, useIsMobile, useSessionStream) |

## Directory Structure

```
src/
 app/                              Next.js App Router
 |  layout.tsx                     Root layout (force-dynamic, fonts, theme provider)
 |  page.tsx                       Dashboard (server component)
 |  globals.css                    Design tokens, Tailwind v4 config
 |
 |  repositories/                  Repository listing + detail (with [repoId] dynamic route)
 |  scans/                         Scan history + scan wizard
 |  policies/                      Policy CRUD (versions, bans, rules)
 |  ai-integrations/               Skills, MCP servers, agents browser
 |  settings/                      App settings, API keys
 |
 |  api/                           REST route handlers (19 endpoints)
 |     scans/                      Scan listing
 |     repos/                      Repository CRUD + raw access
 |     findings/                   Findings queries
 |     fixes/                      Fix lifecycle (preview, apply, restore)
 |     policies/                   Policy CRUD
 |     reports/                    Report generation
 |     discover/                   Repo discovery
 |     sessions/                   Session CRUD + streaming (SSE) + cleanup
 |     fs/browse/                  Filesystem browsing
 |     claude-usage/               Claude usage tracking
 |
 components/
 |  ui/                            Local shadcn/ui component (empty-state)
 |  layout/                        Shell, page banner, layout config
 |  dashboard/                     Dashboard client component
 |  repos/                         Repo detail tabs, Claude config editor
 |  policies/                      Policy form, rules tab
 |  scans/                         Scan wizard (multi-step)
 |  sessions/                      Session panel, context provider, badges
 |  code/                          Code browser, file viewer, diff viewer
 |  settings/                      Settings tabs, API keys
 |  concepts/                      Concept sources, install dialogs
 |  patterns/                      Patterns library
 |
 lib/
 |  db/                            DuckDB init, migrations, seed
 |  |  index.ts                    createDatabase() with global cache, auto-init
 |  |  migrations/001_initial.sql  17 table definitions + indexes
 |  |  seed.ts                     Built-in data seeder
 |  |
 |  actions/                       15 Server Action files ("use server")
 |  |  repos.ts                    Repo CRUD, listing with finding counts
 |  |  scans.ts                    Scan listing, detail with counts
 |  |  findings.ts                 Finding CRUD, counts by severity/category
 |  |  fixes.ts                    Fix action CRUD, apply run history
 |  |  policies.ts                 Policy CRUD with JSON field parsing
 |  |  concepts.ts                 Concept CRUD, search, linking to repos
 |  |  concept-sources.ts          Concept source management, scan triggering
 |  |  settings.ts                 Key-value settings, dashboard stats, onboarding
 |  |  sessions.ts                 Session record CRUD + log persistence
 |  |  claude-config.ts            Claude config read/write for repos
 |  |  claude-usage.ts             Claude CLI usage statistics
 |  |  code-browser.ts             File tree, file content, git log, branches
 |  |  env-keys.ts                 Encrypted environment key management
 |  |  custom-rules.ts             Custom rule CRUD
 |  |  manual-findings.ts          Manual finding CRUD
 |  |
 |  services/
 |  |  session-manager.ts          Wraps @claudekit/session for lifecycle management
 |  |  session-runners/            Runner factories for each session type
 |  |  |  scan.ts                  Discovery -> audit -> fix planning
 |  |  |  quick-improve.ts         PR creation via persona-driven Claude
 |  |  |  finding-fix.ts           Batch finding fix via Claude
 |  |  |  fix-apply.ts             Batch fix application
 |  |  |  ai-file-gen.ts           AI file generation
 |  |  |  cleanup.ts               Resource cleanup
 |  |  |
 |  |  scanner.ts                  Filesystem walker, repo discovery
 |  |  auditors/                   Four audit engines (deps, ai-files, structure, custom-rules)
 |  |  fix-planner.ts              Converts findings into fix actions with diffs
 |  |  apply-engine.ts             Atomic fix application with snapshots + rollback
 |  |  reporter.ts                 JSON/Markdown/PR report export
 |  |  concept-scanner.ts          Local concept discovery
 |  |  github-concept-scanner.ts   GitHub-based concept discovery
 |  |  mcp-list-scanner.ts         MCP server list scanning
 |  |  claude-config-scanner.ts    Claude config parsing
 |  |  claude-config.ts            Claude config read/write
 |  |  claude-settings-schema.ts   Deep object access, form state parsing
 |  |  encryption.ts               AES-256-GCM encryption
 |  |  github-client.ts            GitHub API integration
 |  |  process-runner.ts           Generic bash process spawning
 |  |  git-utils.ts                Git utility functions
 |  |  finding-prompt-builder.ts   Prompt generation for finding analysis
 |  |  finding-classifier.ts       AI-powered finding categorization
 |  |  quick-improve-prompts.ts    Prompt generation for quick improvements
 |  |  policy-matcher.ts           Match repos against policies
 |  |  language-detector.ts        Programming language detection
 |  |
 |  constants/                     Permission suggestions, settings presets
 |  types.ts                       All domain types
 |  constants.ts                   Sentinel IDs, discovery patterns, labels
 |  logger.ts                      Pino logger via @claudekit/logger
 |  utils.ts                       cn(), generateId(), nowTimestamp(), parsePolicy()
```

## Data Layer

### DuckDB

The application uses **DuckDB** as an embedded analytical database, stored as a single file at `~/.gadget/data.duckdb`. This is a deliberate choice for a local-first tool: zero configuration, no database server to manage, and excellent performance for the analytical-style queries typical in audit/scan workloads.

**Connection management** (`src/lib/db/index.ts`):
- Uses `createDatabase()` from `@claudekit/duckdb` with `useGlobalCache: true` to survive Next.js HMR reloads.
- On startup: runs numbered SQL migrations, recovers orphaned scans, reconciles orphaned sessions (via `@claudekit/session`), and auto-seeds built-in data.
- Query helpers (`queryAll`, `queryOne`, `execute`, `buildUpdate`, `withTransaction`, `checkpoint`, `parseJsonField`) are re-exported from `@claudekit/duckdb`.

**Schema** (`src/lib/db/migrations/001_initial.sql`):
17 tables organized into these domains:

| Domain             | Tables                                                                   |
| ------------------ | ------------------------------------------------------------------------ |
| Scanning           | `scan_roots`, `scans`                                                    |
| Repositories       | `repos`                                                                  |
| Policies           | `policies`, `custom_rules`                                               |
| Findings           | `findings`, `manual_findings`                                            |
| Fixes              | `fix_actions`, `snapshots`, `apply_runs`                                 |
| Settings           | `settings`                                                               |
| GitHub             | `github_accounts`                                                        |
| Concepts           | `concept_sources`, `concepts`, `concept_links`                           |
| Sessions           | `sessions`, `session_logs`                                               |

Key schema conventions:
- All IDs are text UUIDs generated via `crypto.randomUUID()`.
- Timestamps use `TIMESTAMPTZ DEFAULT now()`.
- Boolean columns use DuckDB's native `BOOLEAN` type.
- JSON fields use DuckDB's native `JSON` type.
- Upserts use `ON CONFLICT ... DO UPDATE SET` / `ON CONFLICT DO NOTHING`.

## Server/Client Component Split

Every page follows a strict two-layer pattern:

```
Server Component (src/app/**/page.tsx)
    |
    | calls Server Actions to fetch data
    | passes data as props
    |
    v
Client Component (src/components/**/*-client.tsx)
    |
    | "use client" directive
    | handles interactivity (state, forms, animations, toasts)
```

The root layout uses `export const dynamic = "force-dynamic"` because DuckDB-backed pages cannot be statically prerendered. Layout components (sidebar, header) are loaded with `next/dynamic` and `ssr: false` to avoid Motion animation SSR hydration issues.

## Session Management System

The session system is the core coordination layer for all long-running background operations, powered by `@claudekit/session`. It provides a unified model for starting, monitoring, cancelling, and replaying async tasks.

### Session Types

| Type            | Runner                    | Purpose                                        |
| --------------- | ------------------------- | ---------------------------------------------- |
| `scan`          | `scan.ts`                 | Discover repos, audit policies, plan fixes     |
| `quick_improve` | `quick-improve.ts`        | Create improvement PR via persona-driven Claude|
| `finding_fix`   | `finding-fix.ts`          | Batch-fix findings via Claude with git commits |
| `fix_apply`     | `fix-apply.ts`            | Apply planned fix diffs to files               |
| `ai_file_gen`   | `ai-file-gen.ts`          | Generate documentation files                   |
| `cleanup`       | `cleanup.ts`              | Resource cleanup                               |

### Session Lifecycle

1. **Create** -- `POST /api/sessions` creates a DB record with `status=pending` and returns `sessionId` immediately.
2. **Start** -- The API route looks up the appropriate runner factory, calls `startSession()` which creates a `LiveSession` in memory and begins executing the runner in the background.
3. **Execute** -- The runner emits `SessionEvent`s via the `onProgress` callback. Each event is recorded in a ring buffer, batched for DB persistence, and fanned out to all connected SSE subscribers.
4. **Stream** -- `GET /api/sessions/:id/stream` returns an SSE connection. If the session is live, buffered events are replayed immediately and new events stream in real-time. If the session already completed, logs are replayed from the database.
5. **Complete/Error/Cancel** -- A terminal event (`done`, `error`, or `cancelled`) triggers a final log flush, DB status update, and subscriber cleanup.

## Core Pipelines

### 1. Scan Pipeline

```
[POST /api/sessions {type: "scan"}]
      |
      v
Phase 1: Discovery (scanner.ts)
  - Walk scan root directories
  - Find .git directories
  - Detect: package manager, repo type, monorepo indicators, git remote
  - Upsert discovered repos into DB
      |
      v
Phase 2: Auditing (auditors/index.ts)
  - Match policy to repo
  - Run four auditors:
    1. Dependencies -- version checks, banned deps
    2. AI Files -- CLAUDE.md, .cursorrules, etc.
    3. Structure -- project structure analysis
    4. Custom Rules -- user-defined rules
  - Store all findings in DB
      |
      v
Phase 3: Fix Planning (fix-planner.ts)
  - Convert findings into actionable FixActions with file diffs
  - Store planned fixes in DB
      |
      v
[Session done event]
```

### 2. Fix Application Pipeline

```
[Apply Request (fix action IDs)]
      |
      v
Load fix actions from DB
      |
      v
Create snapshot (apply-engine.ts)
  - Copy affected files to ~/.gadget/snapshots/<snapshotId>/
      |
      v
Apply each fix
  - Write diff_after content to temp file
  - Atomic rename (temp -> target)
      |
      v
Record apply_run (status: done/partial/error)
      |
      v
[Restore available via snapshot]
```

### 3. Quick Improve Pipeline

```
[Trigger: quick improve for repo]
      |
      v
Verify prerequisites
  - Check gh CLI is authenticated
  - Verify clean git working tree
      |
      v
Create isolated workspace
  - git worktree add (branch: gadget/<task>-<timestamp>)
      |
      v
Run Claude with persona prompt (via @claudekit/claude-runner)
  - Persona types: Refactoring, Performance, Documentation, Testing, Security
      |
      v
Create pull request
  - git add + commit in worktree
  - git push branch to remote
  - gh pr create with description
      |
      v
[Session done with {prUrl}]
```

## Security Model

Since Gadget runs locally, the security model focuses on protecting sensitive data at rest and hardening the HTTP interface:

- **GitHub PATs**: Encrypted at rest using AES-256-GCM (`src/lib/services/encryption.ts`).
- **MCP API Token**: Optional `MCP_API_TOKEN` env var enables Bearer token auth for programmatic MCP access.
- **HTTP Security Headers** (via `@claudekit/ui/next-config`):
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Permissions-Policy: camera=(), microphone=(), geolocation=()`
- **SQL Injection Prevention**: All queries use parameterized prepared statements via `@claudekit/duckdb`.
- **Claude CLI Sandboxing**: Claude runner restricts allowed tools per session type.

## Design Decisions and Trade-offs

### DuckDB over SQLite

DuckDB was chosen over SQLite for analytical queries, native boolean and JSON support, and a promise-native API.

### Session System over Direct Streaming

Long-running operations use `@claudekit/session` rather than direct `ReadableStream` responses for survivability (sessions persist if browser disconnects), observability (all sessions visible in one panel), and cancellability.

### Server Actions over tRPC/GraphQL

All data access goes through `"use server"` functions for co-location, type safety, and simplicity.

### `globalThis` Singleton Caching

Both the DuckDB connection and session manager use `globalThis` caching to survive Next.js HMR reloads.

### Git Worktrees for Quick Improve

Quick improve operations create git worktrees instead of branches in the main working tree, so the user's working directory is never modified.
