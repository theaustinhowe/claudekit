# AGENTS.md

Coordination guide for breaking work into specialized agents across the Gadget codebase.

## Stack at a Glance

| Layer | Tech |
|-------|------|
| Framework | Next.js 16, React 19, TypeScript 5.9 |
| Database | DuckDB 1.4 (`@duckdb/node-api`, 32 tables) |
| Styling | Tailwind CSS v4 (`@tailwindcss/postcss`), shadcn/ui, Radix UI |
| Animation | Motion 12 (Framer Motion) |
| Linting | Biome 2 (lint + format, replaces ESLint/Prettier) |
| Testing | Vitest 4 |
| Screenshots | Playwright (headless Chromium for project screenshots) |
| Package mgr | pnpm |

---

## Agent Roles

### 1. Data Agent

**Owns:** Database schema, connection management, seed data.

**Files:**
- `src/lib/db/index.ts` — Singleton async `DuckDBInstance` + `DuckDBConnection`, cached on `globalThis` for HMR survival. Startup recovery for orphaned scans and sessions, WAL corruption auto-recovery, log/session pruning, auto-seeding.
- `src/lib/db/schema.ts` — 32 tables via `CREATE TABLE IF NOT EXISTS`: scan_roots, scans, scan_root_entries, repos, policies, findings, fix_actions, fix_packs, snapshots, apply_runs, templates, generator_runs, reports, settings, github_accounts, github_metadata, concept_sources, concepts, concept_links, custom_rules, manual_findings, policy_templates, generator_projects, ui_specs, mock_data_sets, design_messages, spec_snapshots, auto_fix_runs, upgrade_tasks, project_screenshots, sessions, session_logs
- `src/lib/db/helpers.ts` — `queryAll<T>()`, `queryOne<T>()`, `execute()`, `checkpoint()`, `withTransaction()`, `buildUpdate()` with `?` → `$N` param bridging and async mutex for serialized prepared statement execution
- `src/lib/db/seed.ts` — Built-in policies, templates, concept sources

**Key rules:**
- **No migrations system** — all tables use `CREATE TABLE IF NOT EXISTS` in schema.ts. Use `pnpm db:reset` for breaking schema changes.
- DuckDB `GROUP BY` must list ALL non-aggregated columns (unlike SQLite)
- Use `CAST(current_timestamp AS VARCHAR)` instead of `datetime('now')`
- Use `INSERT INTO ... ON CONFLICT DO NOTHING` instead of `INSERT OR IGNORE`
- Use `INSERT INTO ... ON CONFLICT (key) DO UPDATE SET ...` instead of `INSERT OR REPLACE`
- `BOOLEAN` columns return native booleans — no casting needed
- `getDb()` is async and deduplicates concurrent init calls — always `const db = await getDb()`
- JSON fields stored as TEXT — parse with `JSON.parse` on read
- WAL autocheckpoint set to 256KB (not default 16MB) for local tool use

**Involved when:** Adding tables/columns, changing queries, fixing DB errors, updating seed data, WAL corruption recovery.

---

### 2. Actions Agent

**Owns:** All server actions — the bridge between pages and DB/services.

**Files (22 action files):**
- `src/lib/actions/repos.ts` — CRUD + stats for repositories, repos needing attention
- `src/lib/actions/scans.ts` — CRUD for scans + scan roots
- `src/lib/actions/findings.ts` — Query findings and AI files for repos
- `src/lib/actions/fixes.ts` — Query fix actions, fix packs, apply runs, restore
- `src/lib/actions/policies.ts` — CRUD for policies
- `src/lib/actions/concepts.ts` — Concept queries, link/unlink, sync, install
- `src/lib/actions/concept-sources.ts` — CRUD for concept sources, scanning, refresh
- `src/lib/actions/settings.ts` — App settings, dashboard stats, onboarding state
- `src/lib/actions/claude-config.ts` — Read/write Claude settings + CLAUDE.md, default settings
- `src/lib/actions/claude-usage.ts` — Claude API usage stats from session parser
- `src/lib/actions/generator-projects.ts` — Project CRUD + spec management
- `src/lib/actions/env-keys.ts` — .env.local read/write, GitHub PAT checks
- `src/lib/actions/toolbox.ts` — Dev tool ID storage
- `src/lib/actions/policy-templates.ts` — Policy template CRUD
- `src/lib/actions/custom-rules.ts` — Custom audit rule CRUD
- `src/lib/actions/manual-findings.ts` — Manual finding CRUD + resolution
- `src/lib/actions/code-browser.ts` — Code tree, file content, branches, commits
- `src/lib/actions/prototype-files.ts` — Prototype file operations
- `src/lib/actions/auto-fix.ts` — Auto-fix run management
- `src/lib/actions/screenshots.ts` — Save, list, get latest, delete project screenshots
- `src/lib/actions/upgrade-tasks.ts` — Upgrade task CRUD, completion, skipping
- `src/lib/actions/sessions.ts` — Session CRUD + log management (create, update, list, get, add logs)

**Key rules:**
- Every file must have `"use server"` at top
- Always `const db = await getDb()` — it's async
- Parse JSON fields (`expected_versions`, `banned_dependencies`, `metadata_json`) with `JSON.parse` on read
- Use `?` placeholders (auto-converted to DuckDB `$1, $2, ...`)
- Return plain serializable objects to client components (no class instances, no functions)
- `queryOne<T>()` returns `T | undefined`, not `T | null` — wrap with `?? null` if null return type needed

**Involved when:** Adding data access for new features, changing what data pages receive, adding DB writes.

---

### 3. Services Agent

**Owns:** All business logic — scanning, auditing, fixing, generating, reporting, external integrations, and session orchestration.

**Files (49 service files):**

**Session system (`src/lib/services/session-manager.ts` + `session-runners/`):**
- `session-manager.ts` — In-memory session lifecycle: start, cancel, subscribe (SSE), progress events. Cached on `globalThis` for HMR survival. Buffers log writes and flushes every 2s.
- `session-runners/index.ts` — Registry mapping `SessionType` → runner factory
- `session-runners/scan.ts` — Scan execution runner
- `session-runners/quick-improve.ts` — Quick improve runner (branch, Claude CLI, commit, PR)
- `session-runners/finding-fix.ts` — AI-powered finding fix runner
- `session-runners/chat.ts` — Project design chat runner
- `session-runners/scaffold.ts` — Project scaffolding runner via Claude CLI
- `session-runners/upgrade.ts` — Upgrade task execution runner
- `session-runners/upgrade-init.ts` — Upgrade initialization runner
- `session-runners/auto-fix.ts` — Automated error detection + fix runner
- `session-runners/fix-apply.ts` — Fix application runner
- `session-runners/ai-file-gen.ts` — AI file generation runner
- `session-runners/cleanup.ts` — Resource cleanup runner
- `session-runners/toolbox-command.ts` — Toolbox command execution runner

**Auditors (`src/lib/services/auditors/`):**
- `index.ts` — Orchestrator for all auditors + concept discovery
- `dependencies.ts` — Version mismatch + banned dependency checks
- `ai-files.ts` — AI instruction file presence + quality scoring
- `structure.ts` — Project structure + workspace validation
- `custom-rules.ts` — Custom rule evaluation engine

**Core services:**
- `scanner.ts` — Filesystem walk, git repo discovery, package manager + repo type detection
- `fix-planner.ts` — Finding → fix action conversion with before/after diffs
- `apply-engine.ts` — Atomic fix application with snapshots + rollback
- `generator.ts` — Project scaffolding from templates with feature toggles
- `reporter.ts` — JSON/Markdown/PR export

**Concept discovery:**
- `concept-scanner.ts` — Discover concepts from local repos
- `github-concept-scanner.ts` — Discover concepts from remote GitHub repos via API
- `mcp-list-scanner.ts` — Curated + remote MCP server list scanning
- `claude-config-scanner.ts` — Discover concepts from default Claude config locations

**Claude integration:**
- `claude-config.ts` — Read/write `.claude/settings.json` and CLAUDE.md
- `claude-settings-schema.ts` — Deep object access, form state parsing, default settings
- `claude-session-parser.ts` — Parse Claude session logs for usage stats
- `claude-runner.ts` — Invoke Claude CLI (`runClaude()`) with stream-json parsing, abort support, PID tracking
- `claude-usage-api.ts` — Claude usage API integration

**Project creation & design:**
- `scaffold-prompt.ts` — Prompt generation for project scaffolding
- `interface-design.ts` — Design system traits (VIBE_TRAITS) for project visual identity
- `dev-server-manager.ts` — Manages project dev server lifecycle
- `auto-fix-engine.ts` — Automated error detection and fixing via Claude
- `screenshot-service.ts` — Playwright-based screenshot capture for project dev servers
- `spec-exporter.ts` — Export project specs to files
- `quick-improve-prompts.ts` — Persona-based prompts (UI/UX, DRY-KISS, Security) for automated code improvements

**External integrations:**
- `github-client.ts` — GitHub API integration (token validation, repo info, file tree, content)
- `encryption.ts` — AES-256-GCM for GitHub PATs

**Utility services:**
- `process-runner.ts` — Generic bash process spawning with abort support and stdout/stderr streaming
- `tool-checker.ts` — CLI tool detection and version checking
- `policy-matcher.ts` — Match repos to policies by repo type + package manager
- `version-resolver.ts` — npm/PyPI latest version lookup + semver comparison
- `language-detector.ts` — Programming language detection
- `finding-prompt-builder.ts` — Build prompts for AI-powered finding analysis
- `finding-classifier.ts` — AI-powered finding classification

**Key rules:**
- Services are pure logic — they read/write files and call APIs but don't touch the DB directly (except `session-manager.ts` which writes logs via the actions layer)
- Actions call services; services don't import actions directly
- Scanner respects `DEFAULT_EXCLUDE_PATTERNS` from constants
- Apply engine writes to temp file first, then atomic rename
- Session runners receive `{ onProgress, signal, sessionId }` context and return `{ result? }`
- Use `runClaude()` from `claude-runner.ts` to invoke Claude CLI — don't spawn claude directly
- Use `runProcess()` from `process-runner.ts` for generic bash commands — don't use `child_process` directly
- Use `async import()` not `require()` for dynamic imports in services

**Involved when:** Changing scan behavior, adding auditors, modifying fix generation, adding export formats, integrating external APIs, adding concept types, building new AI-powered workflows, adding new session runner types.

---

### 4. API Agent

**Owns:** All route handlers — REST endpoints for the UI and external access.

**Files (27 endpoints):**

**Repository endpoints:**
- `src/app/api/repos/route.ts` — Repository CRUD
- `src/app/api/repos/[repoId]/raw/route.ts` — Serve raw repo files (images) with path traversal protection

**Scan endpoints:**
- `src/app/api/scans/route.ts` — Scan execution (creates a session, returns session ID)
- `src/app/api/discover/route.ts` — Repo discovery from scan roots

**Finding & fix endpoints:**
- `src/app/api/findings/route.ts` — Findings queries
- `src/app/api/fixes/route.ts` — Fix action queries
- `src/app/api/fixes/preview/route.ts` — Fix preview
- `src/app/api/fixes/apply/route.ts` — Apply fixes
- `src/app/api/fixes/restore/route.ts` — Restore from snapshot

**Policy & report endpoints:**
- `src/app/api/policies/route.ts` — Policy CRUD
- `src/app/api/reports/route.ts` — Report export

**Utility endpoints:**
- `src/app/api/fs/browse/route.ts` — Filesystem browsing
- `src/app/api/toolbox/check/route.ts` — CLI tool version checks
- `src/app/api/claude-usage/route.ts` — Claude API usage tracking

**Project endpoints:**
- `src/app/api/projects/route.ts` — Project creation and listing
- `src/app/api/projects/[projectId]/route.ts` — Project detail
- `src/app/api/projects/[projectId]/dev-server/route.ts` — Dev server management
- `src/app/api/projects/[projectId]/auto-fix/route.ts` — Auto-fix management
- `src/app/api/projects/[projectId]/export/route.ts` — Project export
- `src/app/api/projects/[projectId]/raw/route.ts` — Serve raw project files with path traversal protection
- `src/app/api/projects/[projectId]/screenshots/route.ts` — List and capture project screenshots
- `src/app/api/projects/[projectId]/screenshots/[screenshotId]/route.ts` — Individual screenshot GET/DELETE
- `src/app/api/projects/[projectId]/upgrade/route.ts` — Upgrade workflow (git init, repo creation, task generation)

**Session endpoints (unified streaming):**
- `src/app/api/sessions/route.ts` — Create + start sessions (POST)
- `src/app/api/sessions/[sessionId]/route.ts` — Session detail (GET)
- `src/app/api/sessions/[sessionId]/stream/route.ts` — SSE stream of session progress events
- `src/app/api/sessions/[sessionId]/cancel/route.ts` — Cancel a running session (POST)

**Key rules:**
- All streaming goes through the **unified session system** — create a session via `POST /api/sessions`, then subscribe via `GET /api/sessions/[id]/stream` (SSE). Do NOT create ad-hoc streaming routes.
- Route handlers call services/actions — they don't contain business logic
- Return `NextResponse.json()` for all non-streaming responses
- Raw file serving routes must include path traversal protection (`..` rejection, base directory containment)
- Next.js 16 async params: `params: Promise<{ projectId: string }>` — must `await params`

**Involved when:** Adding API endpoints, modifying streaming behavior, adding new external access patterns.

---

### 5. Pages Agent

**Owns:** All Next.js page server components, layouts, and the root layout.

**Files (17 pages + 2 layouts + globals):**
- `src/app/layout.tsx` — Root layout (`dynamic = "force-dynamic"`, fonts, theme, layout shell)
- `src/app/page.tsx` — Dashboard
- `src/app/repos/page.tsx` — Repository list
- `src/app/repos/[repoId]/page.tsx` — Repository detail
- `src/app/repositories/page.tsx` — Alternate repository listing
- `src/app/repositories/[repoId]/page.tsx` — Alternate repository detail
- `src/app/scans/page.tsx` — Scan history
- `src/app/scans/new/page.tsx` — New scan wizard
- `src/app/policies/page.tsx` — Policy management
- `src/app/patterns/page.tsx` — Patterns library
- `src/app/concepts/page.tsx` — Concept management + sources
- `src/app/ai-integrations/page.tsx` — AI integrations (skills, MCP, agents)
- `src/app/projects/page.tsx` — Project listing
- `src/app/projects/new/page.tsx` — New project creation
- `src/app/projects/archived/page.tsx` — Archived projects with screenshot previews
- `src/app/projects/[projectId]/page.tsx` — Project detail (design chat, scaffolding, dev server, upgrade)
- `src/app/projects/[projectId]/layout.tsx` — Project detail layout
- `src/app/toolbox/page.tsx` — CLI tool checker
- `src/app/settings/page.tsx` — App settings
- `src/app/not-found.tsx` — Custom 404 page
- `src/app/globals.css` — Tailwind v4 design tokens (HSL custom properties, light/dark themes)

**Key rules:**
- Pages are server components — they call server actions, then pass data as props to client components
- Next.js 16 async params: `params: Promise<{ repoId: string }>` — must `await params` before use
- Don't import client-side libraries (motion, hooks) in page files
- Root layout has `dynamic = "force-dynamic"` because DuckDB prevents static prerendering

**Involved when:** Adding new pages/routes, changing what data a page fetches, updating the root layout.

---

### 6. UI Agent

**Owns:** All client components, layout shell, hooks, and shadcn/ui primitives.

**Files:**

**Layout:**
- `src/components/layout/layout-shell.tsx` — Main wrapper (uses `next/dynamic` with `ssr: false`)
- `src/components/layout/app-sidebar.tsx` — Collapsible desktop sidebar + mobile bottom nav
- `src/components/layout/app-header.tsx` — Top header with theme toggle + session indicator
- `src/components/layout/nav-link.tsx` — Navigation link helper

**Feature clients (one per page):**
- `src/components/dashboard/dashboard-client.tsx` — Dashboard with stats + activity
- `src/components/repos/repos-client.tsx` — Repository listing
- `src/components/repos/repo-detail-client.tsx` — Repo detail with tabs
- `src/components/scans/scan-wizard.tsx` — Multi-step scan wizard
- `src/components/policies/policies-client.tsx` — Policy listing + form
- `src/components/patterns/patterns-library-client.tsx` — Patterns browser
- `src/components/settings/settings-client.tsx` — App settings tabs
- `src/components/toolbox/toolbox-client.tsx` — CLI tool checker

**Repo sub-components:**
- `src/components/repos/claude-tab-content.tsx` — Claude config editor tab
- `src/components/repos/settings-form-editor.tsx` — Form-based settings editor
- `src/components/repos/settings-raw-editor.tsx` — Raw JSON settings editor with validation + AI gen
- `src/components/repos/settings-form/key-value-editor.tsx` — Key-value pair editor
- `src/components/repos/settings-form/string-array-editor.tsx` — String array editor
- `src/components/repos/settings-form/permission-rules-editor.tsx` — Permission rules editor
- `src/components/repos/add-from-library-dialog.tsx` — Add concepts from library
- `src/components/repos/repo-integrations-content.tsx` — Repo integrations tab
- `src/components/repos/claude-terminal.tsx` — Claude CLI terminal output
- `src/components/repos/manual-finding-form.tsx` — Manual finding entry form

**Generator / project components:**
- `src/components/generator/design-workspace.tsx` — Main project design workspace
- `src/components/generator/chat-panel.tsx` — Design chat interface
- `src/components/generator/preview-panel.tsx` — Project preview panel
- `src/components/generator/app-preview.tsx` — iframe-based preview of running project
- `src/components/generator/describe-step.tsx` — Project description step
- `src/components/generator/features-input.tsx` — Feature selection input
- `src/components/generator/vibes-selector.tsx` — Visual style/vibe selector
- `src/components/generator/color-scheme-picker.tsx` — Color scheme picker
- `src/components/generator/inspiration-input.tsx` — Design inspiration input
- `src/components/generator/scaffold-terminal.tsx` — Terminal UI for scaffolding output
- `src/components/generator/scaffold-log-dialog.tsx` — Scaffold log viewer dialog
- `src/components/generator/spec-files-tab.tsx` — File tree browser for project files
- `src/components/generator/project-card.tsx` — Project card for listing pages
- `src/components/generator/project-settings-dialog.tsx` — Project settings editor
- `src/components/generator/screenshot-timelapse.tsx` — Screenshot gallery with timelapse playback
- `src/components/generator/streaming-display.tsx` — Streaming output display
- `src/components/generator/dev-server-logs.tsx` — Dev server log viewer
- `src/components/generator/auto-fix-indicator.tsx` — Auto-fix status indicator
- `src/components/generator/upgrade-dialog.tsx` — Upgrade workflow confirmation dialog
- `src/components/generator/upgrade-chat-view.tsx` — Upgrade task execution UI with streaming progress

**Session components (`src/components/sessions/`):**
- `session-context.tsx` — React context provider for session state across the app
- `session-panel.tsx` — Session list/detail panel UI
- `session-terminal.tsx` — Terminal-style log viewer for session output
- `session-indicator.tsx` — Header badge showing active session count
- `session-badge.tsx` — Inline status badge for individual sessions

**Concept components:**
- `src/components/concepts/concept-sources-panel.tsx` — Source management panel
- `src/components/concepts/add-source-dialog.tsx` — Add concept source dialog
- `src/components/concepts/install-concept-dialog.tsx` — Install concept to repo

**Code browser components (`src/components/code/`):**
- Code tree, file viewer, directory listing, breadcrumb, toolbar
- Branch switcher, commit log, commit detail, changes view
- Inline search, diff viewer, syntax highlighter, markdown renderer

**Shared components:**
- `src/components/claude-usage-shared.tsx` — Claude API usage display
- `src/components/directory-picker.tsx` — Filesystem directory browser
- `src/components/theme-provider.tsx` — next-themes wrapper
- `src/components/theme-toggle.tsx` — Dark/light toggle

**shadcn/ui primitives (24 components) in `src/components/ui/`:**
- alert-dialog, badge, button, card, checkbox, collapsible, dialog, dropdown-menu, empty-state, input, label, popover, progress, scroll-area, select, separator, sheet, skeleton, sonner, switch, table, tabs, textarea, tooltip

**Hooks (`src/hooks/`):**
- `use-mobile.ts` — Mobile breakpoint detection
- `use-color-scheme.ts` — Color scheme detection
- `use-tab-navigation.ts` — Tab navigation state
- `use-auto-scroll.ts` — Auto-scroll behavior for terminals/logs
- `use-session-stream.ts` — SSE subscription hook for session progress events

**Key rules:**
- Client components must have `"use client"` directive
- Use `next/dynamic` with `ssr: false` for motion imports to avoid prerender crashes
- `usePathname()` returns `string | null` in Next.js — always use optional chaining
- Use `cn()` from `src/lib/utils.ts` for Tailwind class merging
- Sonner for toasts (`toast()` from `sonner`)
- Client components call `fetch('/api/...')` for mutations — don't import server actions directly into client components
- Session streaming uses `use-session-stream.ts` hook which connects to `/api/sessions/[id]/stream` via `EventSource`

**Involved when:** Adding UI features, changing layouts, updating component styles, adding interactivity, creating new client components.

---

### 7. Types & Config Agent

**Owns:** Shared types, constants, utilities, and build/tooling configuration.

**Files:**
- `src/lib/types.ts` — All domain types (70+ interfaces): Repo, RepoWithCounts, Policy, Finding, FixAction, FixPack, Scan, ScanRoot, Concept, ConceptSource, ConceptLink, ApplyRun, ProjectTemplate, GeneratorRun, AIFile, ToolCheckResult, ClaudeUsageStats, CustomRule, ManualFinding, PolicyTemplate, GeneratorProject, UiSpec, DesignMessage, SpecSnapshot, AutoFixRun, AutoFixState, MockEntity, UpgradeTask, ProjectScreenshot, SessionType, SessionStatus, SessionEvent, SessionRow, SessionLogRow
- `src/lib/constants.ts` — DEFAULT_EXCLUDE_PATTERNS, LOCKFILE_TO_PM, MONOREPO_INDICATORS, REPO_TYPE_INDICATORS, CONCEPT_DISCOVERY_PATTERNS, CONCEPT_TYPE_LABELS, LIBRARY_REPO_ID, CURATED_SOURCE_ID, CLAUDE_CONFIG_SOURCE_ID, IMAGE_MIME_TYPES, SESSION_LOG_RETENTION_DAYS, SESSION_RETENTION_DAYS, SESSION_EVENT_BUFFER_SIZE, SESSION_LOG_FLUSH_INTERVAL_MS, SESSION_HEARTBEAT_INTERVAL_MS, SESSION_TYPE_LABELS
- `src/lib/constants/permission-suggestions.ts` — Claude permission presets (allow/deny rules)
- `src/lib/constants/tools.ts` — Dev tool definitions with version parsing, install/update commands
- `src/lib/utils.ts` — `cn()`, `generateId()`, `nowTimestamp()`, `expandTilde()`, `formatBytes()`, `timeAgo()`
- `src/lib/fuzzy-match.ts` — Fuzzy string matching
- `src/lib/claude-pricing.ts` — Claude API pricing data
- `next.config.ts` — `serverExternalPackages` for DuckDB + Playwright native bindings, security headers
- `biome.json` — Linting + formatting rules (2-space indent, 120 line width, double quotes, semicolons)
- `tsconfig.json` — TypeScript config with `@/*` path alias, strict mode
- `postcss.config.mjs` — PostCSS with `@tailwindcss/postcss` (Tailwind v4)
- `components.json` — shadcn/ui configuration (RSC-enabled)
- `package.json` — Dependencies, scripts, pnpm config, lint-staged config

**Key rules:**
- `as const` arrays need explicit `string[]` typing when passed to functions expecting mutable arrays
- IDs use `crypto.randomUUID()` via `generateId()`
- Timestamps use `new Date().toISOString()` via `nowTimestamp()`
- All type changes ripple through actions → pages → components; coordinate accordingly
- Adding new shadcn/ui components: `pnpm dlx shadcn@latest add <component>`
- Biome handles both linting and formatting — no ESLint or Prettier config exists

**Involved when:** Adding/changing domain types, updating constants, modifying build config, adding dependencies, updating tooling.

---

## Dependency Graph

```
Types & Config ← Data ← Actions ← Pages → UI
                         Actions ← Services
                                 ← API Routes
```

**Import direction:** Types & Config → Data → Actions → {Services, API, Pages} → UI. Never import backwards.

**Key constraints:**
- Services never import from actions or DB directly (session-manager uses actions for log persistence)
- Client components never import server actions — they call `/api/` routes via `fetch()`
- Pages (server components) call actions, pass data as props to client components
- Actions are the only layer that calls both DB helpers and services

---

## The Session System

The **unified session system** replaces all ad-hoc streaming endpoints. Every long-running operation goes through sessions — there are no standalone streaming routes.

```
Client → POST /api/sessions (create + start)
       → GET  /api/sessions/[id]/stream (SSE subscribe)
       → POST /api/sessions/[id]/cancel (abort)
```

**Architecture:**
1. **`session-manager.ts`** — In-memory `Map<string, LiveSession>` on `globalThis`. Manages lifecycle: start → running → done/error/cancelled. Holds `AbortController` per session, buffers progress events, fans out to SSE subscribers.
2. **`session-runners/`** — Each `SessionType` has a runner factory that returns an async function receiving `{ onProgress, signal, sessionId }`. The runner emits `SessionEvent` objects (status, log, progress, result) via `onProgress`.
3. **`sessions.ts` (actions)** — Persists session records + logs to DuckDB. Logs are buffered and flushed every 2s to reduce write frequency.
4. **`use-session-stream.ts` (hook)** — Client-side hook that connects to the SSE endpoint and provides `{ events, status, isRunning }` to components.
5. **Session components** — `session-context.tsx` provides app-wide session state; `session-panel.tsx` shows session list; `session-terminal.tsx` renders log output; `session-indicator.tsx` shows active count in the header.

**All 12 session types:** `scan`, `quick_improve`, `finding_fix`, `chat`, `scaffold`, `upgrade`, `upgrade_init`, `auto_fix`, `fix_apply`, `ai_file_gen`, `cleanup`, `toolbox_command`

**Adding a new session runner:**

| Step | Agent | Action |
|------|-------|--------|
| 1 | Types & Config | Add session type to `SessionType` union in `types.ts`, add label to `SESSION_TYPE_LABELS` in `constants.ts` |
| 2 | Services | Create `src/lib/services/session-runners/<name>.ts` exporting a `createXxxRunner` factory |
| 3 | Services | Register in `src/lib/services/session-runners/index.ts` |
| 4 | API / UI | Wire the trigger (button, form) to `POST /api/sessions` with the new session type |

---

## Handoff Rules

1. **New type added?** Types & Config adds to `types.ts` → Data adds table → Actions adds CRUD → others consume.
2. **New DB column?** Data adds to `schema.ts` table definition (idempotent `CREATE TABLE IF NOT EXISTS`) → Actions updates queries (remember: GROUP BY all non-aggregated columns) → UI updates display. For breaking changes, document in commit that `pnpm db:reset` is needed.
3. **New service?** Services builds it → Actions wraps it for server-side use → API exposes it if needed → Pages/UI wires up the frontend.
4. **New page?** Pages creates server component → UI creates client component → Actions provides data functions if new queries are needed → UI adds nav link in sidebar.
5. **Schema change?** Data handles in `schema.ts` → Actions updates affected queries → Services updates logic → UI updates views. Always verify with `pnpm build`.
6. **New auditor?** Types & Config adds finding categories if needed → Services creates auditor + registers in orchestrator → UI updates finding display if new categories need rendering.
7. **New concept source type?** Types & Config adds to `ConceptSourceType` union → Services creates scanner → Actions adds source management functions in `concept-sources.ts` → UI adds to `add-source-dialog.tsx`.
8. **New streaming operation?** Create a new session runner (see "Adding a new session runner" above). Do NOT create ad-hoc streaming routes — use the session system.
9. **New project sub-feature?** Types & Config adds types → Data adds table if persistent → Services adds engine logic → API adds route under `projects/[projectId]/` → UI adds component in `components/generator/` → Pages wires into project detail page.

---

## Multi-Step Workflows

### Adding a New Feature (End-to-End)

| Step | Agent | Action |
|------|-------|--------|
| 1 | Types & Config | Add types to `src/lib/types.ts` |
| 2 | Data | Add table to `schema.ts` (with `CREATE TABLE IF NOT EXISTS`) |
| 3 | Data | Add seed data if needed in `seed.ts` |
| 4 | Actions | Add server action functions in `src/lib/actions/` |
| 5 | Services | Add business logic in `src/lib/services/` (if any) |
| 6 | API | Add route handler in `src/app/api/` (if REST access needed) |
| 7 | Pages | Create page server component in `src/app/` |
| 8 | UI | Create client component in `src/components/`, add nav link in `app-sidebar.tsx` |
| 9 | All | Run `pnpm build` to verify, `pnpm lint` to check style |

### Adding a New Auditor

| Step | Agent | Action |
|------|-------|--------|
| 1 | Types & Config | Add finding categories/severities to `types.ts` if needed |
| 2 | Services | Create `src/lib/services/auditors/<name>.ts` returning `AuditFinding[]` |
| 3 | Services | Register in `src/lib/services/auditors/index.ts` orchestrator |
| 4 | UI | Update finding display in `repo-detail-client.tsx` if new categories need special rendering |

### Adding a New Page

| Step | Agent | Action |
|------|-------|--------|
| 1 | Actions | Add server action functions for data access (if new queries needed) |
| 2 | Pages | Create `src/app/<route>/page.tsx` — fetch data via actions, pass to client component |
| 3 | UI | Create `src/components/<feature>/<feature>-client.tsx` with `"use client"` |
| 4 | UI | Add nav link in `src/components/layout/app-sidebar.tsx` |

### Adding a New Concept Source Type

| Step | Agent | Action |
|------|-------|--------|
| 1 | Types & Config | Add source type to `ConceptSourceType` union in `types.ts` |
| 2 | Services | Create scanner in `src/lib/services/` (e.g., `<source>-concept-scanner.ts`) |
| 3 | Actions | Add create/scan functions to `src/lib/actions/concept-sources.ts` |
| 4 | UI | Add option to `src/components/concepts/add-source-dialog.tsx` |

### Adding a Project Sub-Feature (e.g., Screenshots, Upgrade)

| Step | Agent | Action |
|------|-------|--------|
| 1 | Types & Config | Add types to `types.ts` (e.g., `ProjectScreenshot`, `UpgradeTask`) |
| 2 | Data | Add table to `schema.ts` if data is persistent |
| 3 | Actions | Add action file in `src/lib/actions/` (e.g., `screenshots.ts`, `upgrade-tasks.ts`) |
| 4 | Services | Add service logic (e.g., `screenshot-service.ts`) |
| 5 | Services | If long-running, create a session runner in `session-runners/` |
| 6 | API | Add route(s) under `src/app/api/projects/[projectId]/` |
| 7 | UI | Add component(s) in `src/components/generator/` |
| 8 | Pages | Wire into project detail page (`src/app/projects/[projectId]/page.tsx`) |

---

## Runtime Flows

### Scan Pipeline

```
UI: Scan Wizard → POST /api/scans (creates session)
  → Session system starts scan runner
  → Services: scanner.ts discovers repos from scan roots
  → Actions: creates scan record, upserts repos
  → Services: auditors/index.ts runs all auditors per repo
  → Actions: stores findings in DB
  → Services: fix-planner.ts generates fix actions from findings
  → Actions: stores fix actions in DB
  → UI: receives SSE progress via /api/sessions/[id]/stream
```

### Fix Application Pipeline

```
UI: Click "Apply" on fix actions
  → POST /api/sessions (type: fix_apply)
  → Session runner: apply-engine.ts creates snapshot of target files
  → Session runner: apply-engine.ts writes fixes (temp file → atomic rename)
  → Actions: updates fix_actions status, creates apply_run record
  → UI: receives SSE progress, shows per-action results
  → (on failure) Services: apply-engine.ts restores from snapshot
```

### Concept Discovery Pipeline

```
UI: Add concept source → scan
  → Actions: concept-sources.ts creates source record
  → Services: concept-scanner.ts / github-concept-scanner.ts / mcp-list-scanner.ts
  → Services: discovers skills, hooks, agents, MCP servers, plugins
  → Actions: stores concepts + links in DB
  → UI: shows discovered concepts with install options
```

### Project Creation Pipeline

```
UI: New project form → POST /api/projects (creates project record)
  → UI: Design chat → POST /api/sessions (type: chat)
    → Session runner: AI refines UI spec
  → UI: Scaffold → POST /api/sessions (type: scaffold)
    → Session runner: claude-runner.ts invokes Claude CLI to generate files
  → UI: Dev server → POST /api/projects/[id]/dev-server
    → Services: dev-server-manager.ts starts/stops dev server
  → UI: Screenshots → POST /api/projects/[id]/screenshots
    → Services: screenshot-service.ts captures via Playwright
  → UI: Auto-fix → POST /api/sessions (type: auto_fix)
    → Session runner: detects errors, invokes Claude to fix
  → UI: Upgrade → POST /api/sessions (type: upgrade)
    → Session runner: executes upgrade tasks via Claude CLI
  → UI: Export → POST /api/projects/[id]/export
    → Services: spec-exporter.ts exports spec to files
```

### Quick Improve Pipeline

```
UI: Select persona (UI/UX, DRY-KISS, Security) on repo detail
  → POST /api/sessions (type: quick_improve)
  → Session runner: quick-improve-prompts.ts builds persona prompt
  → Session runner: creates git branch, invokes Claude CLI, commits changes
  → Session runner: creates PR via GitHub API (if PAT configured)
  → UI: receives SSE progress (branch creation → Claude output → commit → PR)
```

---

## Quick Reference

| File Pattern | Agent |
|---|---|
| `src/lib/db/*` | Data |
| `src/lib/actions/*` | Actions |
| `src/lib/services/**` | Services |
| `src/lib/services/session-manager.ts` | Services |
| `src/lib/services/session-runners/*` | Services |
| `src/app/api/**` | API |
| `src/app/**/page.tsx`, `src/app/**/layout.tsx` | Pages |
| `src/components/**`, `src/hooks/*` | UI |
| `src/components/sessions/*` | UI |
| `src/lib/types.ts`, `src/lib/constants.ts`, `src/lib/utils.ts` | Types & Config |
| `src/lib/constants/*` | Types & Config |
| `*.config.*`, `biome.json`, `tsconfig.json`, `package.json` | Types & Config |
| `src/app/globals.css` | Pages + UI (shared) |

---

## Verification Checklist

After any multi-agent workflow, run these in order:

```bash
pnpm build        # Type-check + production build (catches type errors, import issues)
pnpm lint         # Biome check (catches formatting + lint violations)
pnpm test         # Vitest (if tests exist for the changed area)
pnpm knip         # Detect unused exports, dependencies, and files
```

Common build failures and which agent fixes them:

| Error | Agent | Fix |
|-------|-------|-----|
| Type error in action return | Actions | Mismatched types between DB rows and interfaces |
| GROUP BY error in DuckDB | Data / Actions | Missing column in GROUP BY |
| Module not found | Types & Config | Missing export or wrong import path |
| Prerender error with motion | UI | Needs `next/dynamic` with `ssr: false` |
| `usePathname()` null error | UI | Missing optional chaining (`pathname?.startsWith(...)`) |
| Unused export detected by knip | Types & Config | Remove export or add to knip ignore |
| JSON parse error on DB read | Actions | Missing `JSON.parse` on TEXT field containing JSON |
| Path traversal in raw file route | API | Missing `..` rejection or base directory containment check |
| SSE stream not closing | API / Services | Missing `controller.close()` or cleanup on client disconnect |
| Session runner not registered | Services | Missing entry in `session-runners/index.ts` registry |
| Session events not reaching UI | UI / API | Check `use-session-stream.ts` hook and SSE endpoint |
