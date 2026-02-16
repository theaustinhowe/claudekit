# Gadget Architecture

## Overview

Gadget is a **local-first developer tool** built on **Next.js 16 App Router**. It audits local repositories against configurable policies, manages AI integrations (Claude skills, MCP servers, agents), generates fix diffs, and scaffolds new projects using Claude CLI. All data stays on the developer's machine — there is no cloud backend or SaaS dependency.

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
      |       +--- Session Runners (scan, scaffold, upgrade, auto-fix, ...)
      |       +--- Claude Runner   -- spawns Claude CLI as child process
      |       +--- SSE Stream API  -- real-time progress to browser
      |
      +--- Scanner / Auditors     -- discover repos, check policies
      +--- Fix Planner / Engine   -- generate and apply file diffs
      +--- Dev Server Manager     -- manage project dev server processes
      +--- Auto-Fix Engine        -- detect errors, invoke Claude to fix
      +--- Concept Scanners       -- discover AI skills, MCP servers, etc.
      |
      +--- Local filesystem (repos, git, config files)
      +--- Claude CLI (project scaffolding, auto-fix)
      +--- GitHub API (repo sync, concept discovery)
```

## Technology Stack

| Layer          | Technology                                                      |
| -------------- | --------------------------------------------------------------- |
| Framework      | Next.js 16 (App Router, React 19, RSC)                         |
| Language       | TypeScript 5.9 (strict mode, `@/` path alias)                  |
| Database       | DuckDB via `@duckdb/node-api` (local file, WAL mode)           |
| UI Framework   | shadcn/ui (Base UI primitives), Tailwind CSS v4                  |
| Animations     | Motion (Framer Motion v12)                                      |
| Icons          | Lucide React                                                    |
| Theming        | next-themes (light/dark/system), custom workbench color schemes |
| Syntax         | Shiki (code highlighting)                                       |
| Markdown       | react-markdown + remark-gfm                                    |
| Toasts         | Sonner                                                          |
| Lint/Format    | Biome (replaces ESLint + Prettier)                              |
| Pre-commit     | Husky + lint-staged                                             |
| Testing        | Vitest                                                          |
| Dead code      | Knip                                                            |
| Package Manager| pnpm                                                            |
| AI Integration | Claude CLI (spawned as child process)                           |
| Screenshots    | Playwright                                                      |
| Encryption     | Node.js crypto (AES-256-GCM for GitHub PATs)                   |

## Directory Structure

```
src/
 app/                              Next.js App Router
 |  layout.tsx                     Root layout (force-dynamic, fonts, theme provider)
 |  page.tsx                       Dashboard (server component)
 |  globals.css                    Design tokens, Tailwind v4 config
 |
 |  repos/                         Repository listing + detail pages
 |  repositories/                  Alternate repo routes (with [repoId] dynamic route)
 |  scans/                         Scan history + scan wizard
 |  policies/                      Policy CRUD (versions, bans, rules)
 |  projects/                      Project creation, design chat, scaffolding
 |  ai-integrations/               Skills, MCP servers, agents browser
 |  patterns/                      Patterns library
 |  concepts/                      Concept management + sources
 |  toolbox/                       CLI tool version checker
 |  settings/                      App settings, API keys
 |
 |  api/                           REST route handlers
 |     scans/                      Streaming scan execution
 |     repos/                      Repository CRUD + cleanup + raw access
 |     findings/                   Findings CRUD
 |     fixes/                      Fix lifecycle (preview, apply, restore)
 |     policies/                   Policy CRUD
 |     reports/                    Report generation
 |     discover/                   Repo discovery
 |     projects/                   Project CRUD + detail
 |     projects/[projectId]/       Chat, scaffold, export, auto-fix,
 |                                 dev-server, screenshots, upgrade
 |     sessions/                   Session CRUD + streaming (SSE)
 |     ai-files/generate/          AI file generation
 |     fs/browse/                  Filesystem browsing
 |     toolbox/                    CLI tool check + run
 |
 components/
 |  ui/                            shadcn/ui primitives (25 components)
 |  layout/                        Shell, sidebar, header, nav link
 |  dashboard/                     Dashboard client component
 |  repos/                         Repo detail tabs, Claude config editor
 |  policies/                      Policy form, rules tab, templates tab
 |  scans/                         Scan wizard (multi-step)
 |  generator/                     Project scaffolding, design workspace, chat
 |  sessions/                      Session panel, terminal, context provider, badges
 |  code/                          Code browser, file viewer, diff viewer
 |  settings/                      Settings tabs, API keys
 |  concepts/                      Concept sources, install dialogs
 |  patterns/                      Patterns library
 |  toolbox/                       Toolbox client
 |
 lib/
 |  db/                            DuckDB connection, schema, migrations, seed
 |  |  index.ts                    Singleton connection (globalThis-cached)
 |  |  schema.ts                   30+ table definitions + indexes
 |  |  helpers.ts                  Query helpers (queryAll, queryOne, execute)
 |  |  migrations.ts               Schema versioning (current version: 2)
 |  |  seed.ts                     Built-in data seeder
 |  |
 |  actions/                       Server Action files ("use server")
 |  |  repos.ts                    Repo CRUD, listing with finding counts
 |  |  scans.ts                    Scan listing, detail with counts
 |  |  findings.ts                 Finding CRUD, counts by severity/category
 |  |  fixes.ts                    Fix action CRUD, apply run history
 |  |  policies.ts                 Policy CRUD with JSON field parsing
 |  |  concepts.ts                 Concept CRUD, search, linking to repos
 |  |  concept-sources.ts          Concept source management, scan triggering
 |  |  settings.ts                 Key-value settings, dashboard stats, onboarding
 |  |  sessions.ts                 Session record CRUD + log persistence
 |  |  generator-projects.ts       Project CRUD, design chat, spec management
 |  |  claude-config.ts            Claude config read/write for repos
 |  |  claude-usage.ts             Claude CLI usage statistics parsing
 |  |  auto-fix.ts                 Auto-fix run persistence
 |  |  code-browser.ts             File tree, file content, git log, branches
 |  |  env-keys.ts                 Encrypted environment key management
 |  |  upgrade-tasks.ts            Upgrade task CRUD
 |  |  screenshots.ts              Screenshot CRUD
 |  |  custom-rules.ts             Custom rule CRUD
 |  |  manual-findings.ts          Manual finding CRUD
 |  |  policy-templates.ts         Policy template CRUD
 |  |  toolbox.ts                  CLI tool checks
 |  |  prototype-files.ts          Prototype file management
 |  |
 |  services/
 |  |  session-manager.ts          Orchestrates long-running background sessions
 |  |  session-runners/            Runner factories for each session type
 |  |  |  scan.ts                  Discovery -> audit -> fix planning
 |  |  |  scaffold.ts              Claude CLI project generation
 |  |  |  upgrade.ts               Multi-step upgrade task execution
 |  |  |  auto-fix.ts              Single error fix via Claude
 |  |  |  fix-apply.ts             Batch fix application
 |  |  |  finding-fix.ts           Batch finding fix via Claude
 |  |  |  quick-improve.ts         PR creation via persona-driven Claude
 |  |  |  chat.ts                  Design conversation
 |  |  |
 |  |  claude-runner.ts            Spawn Claude CLI, parse stream-json output
 |  |  scanner.ts                  Filesystem walker, repo discovery
 |  |  auditors/                   Four audit engines (deps, ai-files, structure, custom-rules)
 |  |  fix-planner.ts              Converts findings into fix actions with diffs
 |  |  apply-engine.ts             Atomic fix application with snapshots + rollback
 |  |  auto-fix-engine.ts          Dev server error detection + auto-fix via Claude
 |  |  dev-server-manager.ts       Dev server lifecycle management
 |  |  generator.ts                Project scaffolding from templates
 |  |  reporter.ts                 JSON/Markdown/PR report export
 |  |  concept-scanner.ts          Local concept discovery
 |  |  github-concept-scanner.ts   GitHub-based concept discovery
 |  |  mcp-list-scanner.ts         MCP server list scanning
 |  |  claude-config-scanner.ts    Claude config parsing
 |  |  claude-config.ts            Claude config read/write
 |  |  encryption.ts               AES-256-GCM encryption
 |  |  github-client.ts            GitHub API integration
 |  |  scaffold-prompt.ts          Prompt generation for scaffolding
 |  |  screenshot-service.ts       Capture screenshots via Playwright
 |  |  interface-design.ts         AI-powered interface design generation
 |  |  spec-exporter.ts            Export project specs to files
 |  |  finding-prompt-builder.ts   Prompt generation for finding analysis
 |  |  finding-classifier.ts       AI-powered finding categorization
 |  |  quick-improve-prompts.ts    Prompt generation for quick improvements
 |  |  policy-matcher.ts           Match repos against policies
 |  |  version-resolver.ts         Semantic version resolution
 |  |  language-detector.ts        Programming language detection
 |  |  tool-checker.ts             CLI tool detection and version checking
 |  |
 |  types.ts                       All domain types (~60 interfaces/types)
 |  constants.ts                   Sentinel IDs, discovery patterns, labels, options
 |  utils.ts                       cn(), generateId(), nowTimestamp(), parsePolicy()
 |
 hooks/
    use-mobile.ts                  Mobile detection
    use-color-scheme.ts            Color scheme detection
    use-tab-navigation.ts          Tab navigation state
    use-session-stream.ts          SSE session streaming + log accumulation
    use-auto-scroll.ts             Auto-scroll behavior for terminals
```

## Data Layer

### DuckDB

The application uses **DuckDB** as an embedded analytical database, stored as a single file at `~/.gadget/data.duckdb`. This is a deliberate choice for a local-first tool: zero configuration, no database server to manage, and excellent performance for the analytical-style queries typical in audit/scan workloads.

**Connection management** (`src/lib/db/index.ts`):
- A singleton `DuckDBInstance` + `DuckDBConnection` is cached on `globalThis` to survive Next.js HMR reloads in development. Without this, hot reloads would orphan the old instance while its WAL file is still open.
- Initialization is deduped via a shared promise (`__duckdb_initPromise`) so concurrent requests don't race to create multiple connections.
- WAL autocheckpoint is set to 256KB (down from the default 16MB) since this is a local tool with small write volumes.
- On startup, the system auto-recovers orphaned scans and sessions (stuck in `running`/`pending` status from crashed processes) by marking them `error`.
- Old session logs are pruned (>7 days) and completed sessions are cleaned up (>30 days).
- Corrupt WAL files are auto-recovered by removing the `.wal` file and retrying.
- Graceful shutdown handlers close the connection on `SIGINT`/`SIGTERM`/`beforeExit`.

**Query helpers** (`src/lib/db/helpers.ts`):
- A thin wrapper bridges `?` placeholders to DuckDB's `$1, $2, ...` positional params.
- Exports `queryAll<T>()`, `queryOne<T>()`, `execute()`, `checkpoint()`, `withTransaction()`, `buildUpdate()`.
- All prepared statement execution is serialized through an async mutex (`withLock`) because DuckDB's node-api doesn't support concurrent prepared statements on a single connection.
- `buildUpdate()` provides safe dynamic UPDATE construction with SQL identifier validation to prevent injection.

**Schema** (`src/lib/db/schema.ts`):
30+ tables organized into these domains:

| Domain             | Tables                                                                   |
| ------------------ | ------------------------------------------------------------------------ |
| Scanning           | `scan_roots`, `scans`, `scan_root_entries`                               |
| Repositories       | `repos`                                                                  |
| Policies           | `policies`, `policy_templates`, `custom_rules`                           |
| Findings           | `findings`, `manual_findings`                                            |
| Fixes              | `fix_actions`, `fix_packs`, `snapshots`, `apply_runs`                    |
| Templates          | `templates`, `generator_runs`                                            |
| Reports            | `reports`                                                                |
| Settings           | `settings`                                                               |
| GitHub             | `github_accounts`, `github_metadata`                                     |
| Concepts           | `concept_sources`, `concepts`, `concept_links`                           |
| Projects           | `generator_projects`, `ui_specs`, `mock_data_sets`, `design_messages`,   |
|                    | `spec_snapshots`, `auto_fix_runs`, `upgrade_tasks`, `project_screenshots`|
| Sessions           | `sessions`, `session_logs`                                               |

Key schema conventions:
- All IDs are text UUIDs generated via `crypto.randomUUID()`.
- Timestamps are stored as `TEXT` using `CAST(current_timestamp AS VARCHAR)` in DDL and `new Date().toISOString()` in application code.
- Boolean columns use DuckDB's native `BOOLEAN` type.
- JSON fields (e.g. `policies.expected_versions`, `policies.banned_dependencies`) are stored as `TEXT` and parsed with `JSON.parse` on read.
- Upserts use `ON CONFLICT ... DO UPDATE SET` / `ON CONFLICT DO NOTHING` (not SQLite-style `INSERT OR REPLACE`).

**Migrations** (`src/lib/db/migrations.ts`):
- Schema version is tracked in a `schema_version` table (current version: 2).
- All tables and columns are defined in `schema.ts` using `CREATE TABLE IF NOT EXISTS`.
- v1 → v2: Added `sessions` and `session_logs` tables for the session management system.
- Future migrations for existing databases are added as incremental steps keyed to the version number.

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

**Example — Repository Detail:**

```typescript
// src/app/repositories/[repoId]/page.tsx (Server Component)
export default async function RepoDetailPage({ params }: { params: Promise<{ repoId: string }> }) {
  const { repoId } = await params;
  const [repo, findings, concepts, ...rest] = await Promise.all([
    getRepoById(repoId),
    getFindingsForRepo(repoId),
    getConceptsForRepo(repoId),
    // ... 10+ parallel data fetches
  ]);
  return <RepoDetailClient repo={repo} findings={findings} concepts={concepts} ... />;
}
```

This pattern is used consistently because:
1. Server Components can directly call `"use server"` actions for data fetching with zero client-side JS overhead.
2. Client Components receive pre-fetched data via props, avoiding waterfalls.
3. The split keeps the client bundle small — only interactivity code ships to the browser.

The root layout uses `export const dynamic = "force-dynamic"` because DuckDB-backed pages cannot be statically prerendered. Layout components (sidebar, header) are loaded with `next/dynamic` and `ssr: false` to avoid Motion animation SSR hydration issues.

## Session Management System

The session system is the core coordination layer for all long-running background operations. It provides a unified model for starting, monitoring, cancelling, and replaying async tasks.

### Architecture

```
Browser                          Server (Node.js)
  |                                  |
  |  POST /api/sessions              |
  |  {type, metadata}           +--> Session Manager (singleton on globalThis)
  |  <-- {sessionId}            |    |
  |                             |    +-- Create DB record (status=pending)
  |  GET /sessions/:id/stream   |    +-- Start runner in background
  |  (SSE connection)           |    |      |
  |  <-- event: init            |    |      +-- Runner executes async work
  |  <-- event: progress 10%    |    |      +-- Calls onProgress(event) per step
  |  <-- event: log "..."       |    |      |
  |  <-- event: progress 50%    |    |   fanOut()
  |  <-- event: log "..."       |    |      +-- Records in ring buffer (max 500)
  |  <-- event: done            |    |      +-- Batches logs to pendingLogs
  |  <-- [DONE]                 |    |      +-- Flushes to DB every 2s
  |                             |    |      +-- Fans out to all SSE subscribers
  |                             |    |
  |  (disconnect is safe --     |    +-- On terminal event: flush, cleanup
  |   session keeps running)    |    +-- Optional cleanup fn (e.g. git worktree removal)
```

### Session Types

| Type            | Runner                    | Purpose                                        |
| --------------- | ------------------------- | ---------------------------------------------- |
| `scan`          | `session-runners/scan.ts` | Discover repos, audit policies, plan fixes     |
| `scaffold`      | `scaffold.ts`             | Generate project from spec via Claude CLI      |
| `upgrade`       | `upgrade.ts`              | Execute multi-step upgrade tasks               |
| `auto_fix`      | `auto-fix.ts`             | Fix single error via Claude                    |
| `fix_apply`     | `fix-apply.ts`            | Apply planned fix diffs to files               |
| `finding_fix`   | `finding-fix.ts`          | Batch-fix findings via Claude with git commits |
| `quick_improve` | `quick-improve.ts`        | Create improvement PR via persona-driven Claude|
| `chat`          | `chat.ts`                 | Interactive design conversation                |

### Session Lifecycle

1. **Create** — `POST /api/sessions` creates a DB record with `status=pending` and returns `sessionId` immediately.
2. **Start** — The API route looks up the appropriate runner factory, calls `startSession()` which creates a `LiveSession` in memory and begins executing the runner in the background.
3. **Execute** — The runner emits `SessionEvent`s via the `onProgress` callback. Each event is recorded in a ring buffer (max 500 events), batched for DB persistence (flushed every 2 seconds), and fanned out to all connected SSE subscribers.
4. **Stream** — `GET /api/sessions/:id/stream` returns an SSE connection. If the session is live, buffered events are replayed immediately and new events stream in real-time. If the session already completed, logs are replayed from the database.
5. **Complete/Error/Cancel** — A terminal event (`done`, `error`, or `cancelled`) triggers a final log flush, DB status update, and subscriber cleanup.
6. **Cleanup** — Optional cleanup functions (registered via `setCleanupFn`) run after terminal events, handling resource teardown like git worktree removal.

### Event Types

| Event       | Data                                   | Purpose                          |
| ----------- | -------------------------------------- | -------------------------------- |
| `init`      | —                                      | Session started                  |
| `progress`  | progress %, phase, message             | Progress bar update              |
| `log`       | log text, logType (status/tool/thinking) | Terminal output line           |
| `done`      | progress=100, optional result data     | Successful completion            |
| `error`     | error message                          | Failure                          |
| `cancelled` | message                                | User cancelled                   |
| `heartbeat` | —                                      | SSE keepalive (every 15s)        |

### Client-Side Integration

- **`useSessionStream()`** hook — Connects to the SSE endpoint, accumulates logs, tracks progress/phase/elapsed time, supports disconnect/reconnect/cancel.
- **`SessionContext`** — React context provider that polls `/api/sessions` every 5 seconds for global session state. Detects status transitions and shows toast notifications.
- **`SessionPanel`** — Right-side sheet showing active and recent sessions with progress bars and action buttons.
- **`SessionTerminal`** — Terminal-style display with macOS chrome, color-coded log lines (tool=blue, thinking=muted, stderr=red), and auto-scroll behavior.

## Claude CLI Integration

The Claude runner (`src/lib/services/claude-runner.ts`) spawns the Claude Code CLI as a child process for AI-powered operations.

**Invocation:**
```bash
claude -p --verbose --output-format stream-json \
  --allowedTools Write \
  --disallowedTools Edit,Bash
```

- Prompts are piped via stdin.
- Output is streamed as one JSON object per line on stdout.
- Events are parsed into structured `SessionEvent`s: tool use blocks become `log` events with `logType: "tool"`, text blocks become `logType: "thinking"`.

**Tool restrictions vary by runner:**

| Runner        | Allowed Tools                            | Rationale                              |
| ------------- | ---------------------------------------- | -------------------------------------- |
| scaffold      | Write, Edit, Bash, Read, Glob, Grep, WebFetch | Full project generation needs all tools |
| upgrade (impl)| Write, Edit, Bash, Read, Glob, Grep     | Implementation changes + shell commands|
| upgrade (validate) | Read, Glob, Grep                    | Read-only validation                   |
| finding_fix   | Write, Edit, Read, Glob, Grep           | Code changes, no shell access          |
| auto_fix      | Write, Edit, Read, Glob, Grep           | Code changes, no shell access          |
| Default       | Write only                               | Minimal blast radius                   |

**Process management:**
- AbortSignal support — cancelling a session sends SIGTERM to the Claude process.
- Configurable timeout (default 10 minutes, scaffold uses 15 minutes).
- Keepalive events emitted every 3 seconds to prevent SSE timeouts.
- Settled state flag prevents double-completion race conditions.

## Core Pipelines

### 1. Scan Pipeline

The scan pipeline discovers repos, audits them against policies, and generates fix plans. It runs as a `scan` session.

```
[POST /api/sessions {type: "scan"}]
      |
      v
Phase 1: Discovery (scanner.ts) — progress 0-10%
  - Walk scan root directories
  - Find .git directories (max depth 4)
  - Detect: package manager (lockfiles), repo type (config files),
    monorepo indicators, git remote, default branch
  - Upsert discovered repos into DB
      |
      v
Phase 2: Auditing (auditors/index.ts) — progress 10-75%
  - Match policy to repo (auto-match by repo type or explicit)
  - Run four auditors in sequence:
    1. Dependencies — version checks, banned deps, lockfile presence
    2. AI Files — CLAUDE.md, .cursorrules, etc.
    3. Structure — project structure analysis
    4. Custom Rules — user-defined file_exists/file_missing/file_contains/json_field rules
  - For monorepos: audit each workspace package independently
  - Discover Claude Code concepts (skills, hooks, commands, agents, MCP servers)
  - Store all findings in DB (transactional delete + insert per repo)
      |
      v
Phase 3: Fix Planning (fix-planner.ts) — progress 75-100%
  - Convert findings into actionable FixActions with file diffs (before/after)
  - Store planned fixes in DB
      |
      v
[Session done event]
```

### 2. Fix Application Pipeline

Fix application is an atomic operation with built-in rollback capability. It runs as a `fix_apply` session.

```
[Apply Request (fix action IDs)]
      |
      v
Load fix actions from DB
      |
      v
Create snapshot (apply-engine.ts)
  - Copy affected files to ~/.gadget/snapshots/<snapshotId>/
  - Record file existence for new-file detection
      |
      v
Group actions by target file
  - Multiple fixes per file: warn and apply sequentially
  - Different files: apply in parallel (Promise.allSettled)
      |
      v
Apply each fix
  - Write diff_after content to temp file
  - Atomic rename (temp -> target)
      |
      v
Git commit ("Findings fixed by Gadget App")
      |
      v
Record apply_run (status: done/partial/error)
      |
      v
[Restore available via snapshot]
```

### 3. Project Scaffolding Pipeline

Project scaffolding uses Claude CLI to generate complete project codebases from design specifications. It spans multiple session types.

```
[Create Project]                          Session: none (direct action)
  - Idea description, platform, services, constraints
  - Design vibes, color scheme, inspiration URLs
      |
      v
Design Chat (chat session)                Session: chat
  - Conversational refinement of UI spec
  - Each message can produce spec diffs (pages/components/entities added/modified/removed)
  - Spec snapshots saved per version
      |
      v
Scaffold (scaffold session)               Session: scaffold
  - Generate implementation prompt from spec (scaffold-prompt.ts)
  - Spawn Claude CLI with Write/Edit/Bash/Read/Glob/Grep/WebFetch tools
  - Stream progress (tool calls, thinking, file writes)
  - On retry: include previous scaffold logs to avoid recreating existing files
  - On success: transition project status from "scaffolding" to "designing"
      |
      v
Dev Server (dev-server-manager.ts)         Managed process (not a session)
  - Start project dev server (pnpm/npm/bun run dev)
  - Allocate available port
  - Stream logs to subscribers via ring buffer (max 500 lines)
  - Ready detection via regex ("http://localhost:\d+", "ready in", "Local:")
      |
      v
Auto-Fix Loop (auto-fix-engine.ts)        Session: auto_fix (per fix attempt)
  - Subscribe to dev server log stream
  - Detect compilation/runtime errors via regex patterns
  - Debounce error detection (2s window)
  - Hash error to stable signature (SHA256)
  - Trigger Claude CLI to fix errors
  - Rate limiting: max 3 retries per error signature,
    5-minute cooldown after 5 consecutive failures
```

### 4. Quick Improve Pipeline

Quick improve creates pull requests with AI-driven improvements. It runs as a `quick_improve` session.

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
  - Register cleanup function to remove worktree on cancel
      |
      v
Run Claude with persona prompt
  - Persona types: Refactoring, Performance, Documentation, Testing, Security
  - Claude operates in worktree directory
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

### 5. Concept Discovery Pipeline

Concepts are reusable AI integration artifacts (skills, hooks, commands, agents, MCP servers, plugins) discovered from various sources.

```
Source Types:
  - local_repo: Walk local repo for CONCEPT_DISCOVERY_PATTERNS
  - github_repo: Fetch concept files from GitHub repos
  - mcp_list: Parse MCP server list URLs
  - curated: Built-in curated concepts
  - claude_config: Parse Claude settings for MCP servers

Discovery flow:
  Source --> Scanner --> Concepts --> concept_links --> Repos
                                    (shared library)
```

## Server Actions

All database reads and writes flow through `"use server"` functions in action files under `src/lib/actions/`. Each action file:

1. Imports and calls `await getDb()` to get the singleton DuckDB connection.
2. Uses the async query helpers (`queryAll`, `queryOne`, `execute`).
3. Handles JSON serialization/deserialization for complex fields.

Key action files:

| File                    | Responsibility                                             |
| ----------------------- | ---------------------------------------------------------- |
| `repos.ts`              | Repo CRUD, listing with finding counts, attention queries  |
| `scans.ts`              | Scan listing, detail with repo/finding counts              |
| `findings.ts`           | Finding CRUD, counts by severity/category                  |
| `fixes.ts`              | Fix action CRUD, apply run history                         |
| `policies.ts`           | Policy CRUD with JSON field parsing                        |
| `concepts.ts`           | Concept CRUD, search, linking/unlinking to repos           |
| `concept-sources.ts`    | Concept source management, scan triggering                 |
| `settings.ts`           | Key-value settings, dashboard stats, onboarding state      |
| `sessions.ts`           | Session record CRUD, log batch insert, log retrieval       |
| `generator-projects.ts` | Project CRUD, design chat, spec management                 |
| `claude-config.ts`      | Claude config read/write for repos                         |
| `auto-fix.ts`           | Auto-fix run persistence                                   |
| `code-browser.ts`       | File tree, file content, git log, branch listing           |
| `upgrade-tasks.ts`      | Upgrade task CRUD and status management                    |

REST API routes are only used when streaming (SSE) or complex response formats are needed.

## Security Model

Since Gadget runs locally, the security model focuses on protecting sensitive data at rest and hardening the HTTP interface:

- **GitHub PATs**: Encrypted at rest using AES-256-GCM (`src/lib/services/encryption.ts`). The encryption key is generated per installation and stored in the settings table.
- **MCP API Token**: Optional `MCP_API_TOKEN` env var enables Bearer token auth for programmatic MCP access.
- **HTTP Security Headers** (via `next.config.ts`):
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Permissions-Policy: camera=(), microphone=(), geolocation=()`
- **SQL Injection Prevention**: All queries use parameterized prepared statements. Dynamic column/table names in `buildUpdate()` are validated against a strict regex (`/^[a-zA-Z_][a-zA-Z0-9_]*$/`).
- **Claude CLI Sandboxing**: The Claude runner restricts allowed tools per session type (default: `Write` only; `Edit` and `Bash` disallowed) to limit the blast radius of AI-generated changes.

## Design Decisions and Trade-offs

### DuckDB over SQLite

DuckDB was chosen over the more common SQLite for several reasons:
- **Analytical queries**: Scan/audit workloads involve aggregations, counting, and filtering across multiple tables — DuckDB's columnar engine excels here.
- **Native boolean and JSON support**: Cleaner schema than SQLite's integer-as-boolean pattern.
- **Promise-native API**: The `@duckdb/node-api` is fully async, avoiding the need for worker threads or synchronous I/O.

Trade-off: DuckDB requires `serverExternalPackages` in Next.js config and `pnpm.onlyBuiltDependencies` for native compilation, adding build complexity.

### force-dynamic Root Layout

The root layout is marked `force-dynamic` because every page reads from DuckDB. Static prerendering is impossible when all data comes from a local database that doesn't exist at build time. This means no ISR or static generation, but for a local dev tool this is the correct trade-off — pages always show fresh data.

### Server Actions over tRPC/GraphQL

All data access goes through `"use server"` functions rather than a separate API layer:
- **Co-location**: Actions live next to the types and utilities they use.
- **Type safety**: Full TypeScript types flow from DB query to component props without serialization boundaries.
- **Simplicity**: No schema definition language, no code generation, no separate server.

### Session System over Direct Streaming

Long-running operations (scans, scaffolding, upgrades) use the session management system rather than direct `ReadableStream` responses:
- **Survivability**: Sessions persist in the database. If the browser disconnects, the operation continues. Reconnecting replays buffered events and resumes streaming.
- **Observability**: All sessions are visible in the session panel. Users can monitor multiple concurrent operations.
- **Cancellability**: AbortController integration allows clean cancellation with process cleanup.
- **Replayability**: Completed sessions can be replayed from persisted logs.

Trade-off: More infrastructure than a simple streaming response, but essential for operations that may take minutes (scaffold runs up to 15 minutes).

### Singleton DB Connection

A single DuckDB connection is shared across all requests. This is appropriate because:
- DuckDB doesn't support concurrent writes on the same file anyway.
- The async mutex in `helpers.ts` serializes prepared statement execution.
- For a local tool serving one user, connection pooling adds complexity without benefit.

### Claude CLI over API

Project scaffolding and auto-fix use the Claude CLI (spawned as a child process) rather than direct API calls:
- The CLI provides tool use (Read, Write, Glob, Grep) out of the box.
- It handles conversation management, context windows, and retries.
- The `--output-format stream-json` flag enables structured progress streaming.
- Users don't need to manage API keys separately — the CLI uses its own authentication.

### Atomic File Writes

The fix application engine writes to a `.tmp` file then renames it to the target path (`fs.writeFileSync` + `fs.renameSync`). This prevents partial writes from corrupting files if the process crashes mid-write.

### Ring Buffer + Batch Persistence

Session events use an in-memory ring buffer (max 500 events) with periodic DB flushes (every 2 seconds). This balances:
- **Low latency**: Events reach SSE subscribers immediately without waiting for DB writes.
- **Persistence**: Logs survive process restarts via periodic batch inserts.
- **Memory bounds**: The ring buffer caps memory usage regardless of session duration.
- **DB efficiency**: Batching avoids per-event INSERT overhead.

### Git Worktrees for Quick Improve

Quick improve operations create git worktrees instead of branches in the main working tree:
- The user's working directory is never modified.
- Multiple improvements can run concurrently on different worktrees.
- Cleanup functions ensure worktrees are removed on cancellation or completion.

## Component Architecture

The `src/components/` directory mirrors the page routes, with each domain getting its own subdirectory:

| Directory     | Components                                                           |
| ------------- | -------------------------------------------------------------------- |
| `ui/`         | 25 shadcn/ui primitives (button, card, dialog, table, etc.)          |
| `layout/`     | Shell (collapsible sidebar + mobile bottom nav), header, nav links   |
| `dashboard/`  | Dashboard client with stats cards, attention list, activity feed     |
| `repos/`      | Repo detail tabs, Claude config editor, settings forms               |
| `policies/`   | Policy form, rules tab, templates tab                                |
| `scans/`      | Multi-step scan wizard                                               |
| `generator/`  | Design workspace, chat panel, scaffold terminal, dev server logs,    |
|               | auto-fix indicator, preview panel, screenshot timelapse              |
| `sessions/`   | Session panel, session terminal, session context provider, badges    |
| `code/`       | File tree, file viewer, diff viewer, commit log, branch switcher     |
| `settings/`   | Settings tabs, API key management                                    |
| `concepts/`   | Concept source management, install dialogs                           |

### CSS and Theming

- **Tailwind CSS v4** with `@tailwindcss/postcss` plugin (no `tailwind.config.js` — config is in `globals.css`).
- **Design tokens** defined as HSL CSS custom properties in `globals.css` for both light and dark themes.
- **Workbench themes**: Multiple color schemes (amethyst, sapphire, emerald, ruby, amber, slate) applied via CSS class on `<html>`.
- **next-themes** handles light/dark/system mode switching.
- A blocking `<script>` in the root layout reads the theme from localStorage before paint to prevent flash-of-wrong-theme.

## Configuration Files

| File               | Purpose                                                                |
| ------------------ | ---------------------------------------------------------------------- |
| `next.config.ts`   | `serverExternalPackages` for DuckDB/Playwright, security headers       |
| `tsconfig.json`    | Strict mode, `@/*` path alias, bundler module resolution               |
| `biome.json`       | 2-space indent, 120 line width, double quotes, semicolons, Tailwind CSS parsing |
| `components.json`  | shadcn/ui config (RSC-enabled, neutral base color, CSS variables)      |
| `package.json`     | ESM (`"type": "module"`), scripts, `pnpm.onlyBuiltDependencies`       |
