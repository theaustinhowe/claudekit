# AGENTS.md

Coordination guide for breaking work into specialized agents across the Gadget codebase.

## Stack at a Glance

| Layer | Tech |
|-------|------|
| Framework | Next.js 16, React 19, TypeScript 5.9 |
| Database | DuckDB via `@claudekit/duckdb` (17 tables) |
| Styling | Tailwind CSS v4 (`@tailwindcss/postcss`), shadcn/ui via `@claudekit/ui` |
| Animation | Motion 12 (Framer Motion) |
| Linting | Biome (lint + format, replaces ESLint/Prettier) |
| Testing | Vitest |
| Sessions | `@claudekit/session` |
| AI | Claude CLI via `@claudekit/claude-runner` |
| Package mgr | pnpm |

---

## Agent Roles

### 1. Data Agent

**Owns:** Database init, migrations, seed data.

**Files:**
- `src/lib/db/index.ts` — Uses `createDatabase()` from `@claudekit/duckdb` with `useGlobalCache: true`. Runs migrations, reconciles orphaned scans/sessions, auto-seeds.
- `src/lib/db/migrations/001_initial.sql` — 17 tables: scan_roots, scans, repos, policies, findings, fix_actions, snapshots, apply_runs, settings, github_accounts, concept_sources, concepts, concept_links, custom_rules, manual_findings, sessions, session_logs
- `src/lib/db/seed.ts` — Built-in policies, concept sources

**Key rules:**
- Query helpers (`queryAll`, `queryOne`, `execute`, `buildUpdate`, `withTransaction`, `checkpoint`, `parseJsonField`) come from `@claudekit/duckdb`, re-exported via `src/lib/db/index.ts`
- `getDb()` is async and deduplicates concurrent init calls — always `const db = await getDb()`
- Migrations are numbered `.sql` files in `src/lib/db/migrations/`, run via `runMigrations()` from `@claudekit/duckdb`
- JSON fields use DuckDB's native `JSON` type — use `parseJsonField()` on read
- Timestamps use `TIMESTAMPTZ DEFAULT now()`

**Involved when:** Adding tables/columns, changing queries, fixing DB errors, updating seed data.

---

### 2. Actions Agent

**Owns:** All server actions — the bridge between pages and DB/services.

**Files (15 action files):**
- `src/lib/actions/repos.ts` — CRUD + stats for repositories, repos needing attention
- `src/lib/actions/scans.ts` — CRUD for scans + scan roots
- `src/lib/actions/findings.ts` — Query findings and AI files for repos
- `src/lib/actions/fixes.ts` — Query fix actions, fix packs, apply runs, restore
- `src/lib/actions/policies.ts` — CRUD for policies
- `src/lib/actions/concepts.ts` — Concept queries, link/unlink, sync, install
- `src/lib/actions/concept-sources.ts` — CRUD for concept sources, scanning, refresh
- `src/lib/actions/settings.ts` — App settings, dashboard stats, onboarding state
- `src/lib/actions/claude-config.ts` — Read/write Claude settings + CLAUDE.md
- `src/lib/actions/claude-usage.ts` — Claude API usage stats via `@claudekit/claude-usage`
- `src/lib/actions/env-keys.ts` — .env.local read/write, GitHub PAT checks
- `src/lib/actions/custom-rules.ts` — Custom audit rule CRUD
- `src/lib/actions/manual-findings.ts` — Manual finding CRUD + resolution
- `src/lib/actions/code-browser.ts` — Code tree, file content, branches, commits
- `src/lib/actions/sessions.ts` — Session CRUD + log management

**Key rules:**
- Every file must have `"use server"` at top
- Always `const db = await getDb()` — it's async
- Parse JSON fields with `parseJsonField()` from `@claudekit/duckdb`
- Use `?` placeholders (auto-converted to DuckDB `$1, $2, ...`)
- Return plain serializable objects to client components (no class instances, no functions)

**Involved when:** Adding data access for new features, changing what data pages receive, adding DB writes.

---

### 3. Services Agent

**Owns:** All business logic — scanning, auditing, fixing, reporting, external integrations, and session orchestration.

**Session system (`src/lib/services/session-manager.ts` + `session-runners/`):**
- `session-manager.ts` — Wraps `createSessionManager()` from `@claudekit/session`
- `session-runners/index.ts` — Registry mapping `SessionType` to runner factory
- `session-runners/scan.ts` — Scan execution runner
- `session-runners/quick-improve.ts` — Quick improve runner (branch, Claude CLI, commit, PR)
- `session-runners/finding-fix.ts` — AI-powered finding fix runner
- `session-runners/fix-apply.ts` — Fix application runner
- `session-runners/ai-file-gen.ts` — AI file generation runner
- `session-runners/cleanup.ts` — Resource cleanup runner

**Auditors (`src/lib/services/auditors/`):**
- `index.ts` — Orchestrator for all auditors + concept discovery
- `dependencies.ts` — Version mismatch + banned dependency checks
- `ai-files.ts` — AI instruction file presence + quality scoring
- `structure.ts` — Project structure + workspace validation
- `custom-rules.ts` — Custom rule evaluation engine

**Core services:**
- `scanner.ts` — Filesystem walk, git repo discovery, package manager + repo type detection
- `fix-planner.ts` — Finding to fix action conversion with before/after diffs
- `apply-engine.ts` — Atomic fix application with snapshots + rollback
- `reporter.ts` — JSON/Markdown/PR export

**Concept discovery:**
- `concept-scanner.ts` — Discover concepts from local repos
- `github-concept-scanner.ts` — Discover concepts from remote GitHub repos via API
- `mcp-list-scanner.ts` — Curated + remote MCP server list scanning
- `claude-config-scanner.ts` — Discover concepts from default Claude config locations

**Claude integration:**
- `claude-config.ts` — Read/write `.claude/settings.json` and CLAUDE.md
- `claude-settings-schema.ts` — Deep object access, form state parsing

**External integrations:**
- `github-client.ts` — GitHub API integration (token validation, repo info, file tree, content)
- `encryption.ts` — AES-256-GCM for GitHub PATs

**Utility services:**
- `process-runner.ts` — Generic bash process spawning with abort support and stdout/stderr streaming
- `git-utils.ts` — Git utility functions
- `policy-matcher.ts` — Match repos to policies by repo type + package manager
- `language-detector.ts` — Programming language detection
- `finding-prompt-builder.ts` — Build prompts for AI-powered finding analysis
- `finding-classifier.ts` — AI-powered finding classification
- `quick-improve-prompts.ts` — Persona-based prompts for automated code improvements

**Key rules:**
- Use `runClaude()` from `@claudekit/claude-runner` to invoke Claude CLI
- Use `runProcess()` from `process-runner.ts` for generic bash commands
- Session runners receive `{ onProgress, signal, sessionId }` context and return `{ result? }`

**Involved when:** Changing scan behavior, adding auditors, modifying fix generation, adding export formats, integrating external APIs, adding concept types, adding new session runner types.

---

### 4. API Agent

**Owns:** All route handlers — REST endpoints for the UI and external access.

**Files (19 endpoints):**

**Repository endpoints:**
- `src/app/api/repos/route.ts` — Repository CRUD
- `src/app/api/repos/[repoId]/route.ts` — Single repo operations
- `src/app/api/repos/[repoId]/raw/route.ts` — Serve raw repo files (images) with path traversal protection

**Scan endpoints:**
- `src/app/api/scans/route.ts` — Scan listing
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
- `src/app/api/claude-usage/route.ts` — Claude API usage tracking

**Session endpoints (unified streaming):**
- `src/app/api/sessions/route.ts` — Create + start sessions (POST), list sessions (GET)
- `src/app/api/sessions/cleanup/route.ts` — Session cleanup
- `src/app/api/sessions/[sessionId]/route.ts` — Session detail (GET)
- `src/app/api/sessions/[sessionId]/stream/route.ts` — SSE stream of session progress events
- `src/app/api/sessions/[sessionId]/cancel/route.ts` — Cancel a running session (POST)

**Key rules:**
- All streaming goes through the **unified session system** — do NOT create ad-hoc streaming routes.
- Route handlers call services/actions — they don't contain business logic
- Return `NextResponse.json()` for all non-streaming responses
- Next.js 16 async params: `params: Promise<{ sessionId: string }>` — must `await params`

**Involved when:** Adding API endpoints, modifying streaming behavior, adding new external access patterns.

---

### 5. Pages Agent

**Owns:** All Next.js page server components, layouts, and the root layout.

**Files (8 pages + layout + special files):**
- `src/app/layout.tsx` — Root layout (`dynamic = "force-dynamic"`, fonts, theme, layout shell)
- `src/app/page.tsx` — Dashboard
- `src/app/repositories/page.tsx` — Repository listing
- `src/app/repositories/[repoId]/page.tsx` — Repository detail
- `src/app/scans/page.tsx` — Scan history
- `src/app/scans/new/page.tsx` — New scan wizard
- `src/app/policies/page.tsx` — Policy management
- `src/app/ai-integrations/page.tsx` — AI integrations (skills, MCP, agents)
- `src/app/settings/page.tsx` — App settings
- `src/app/not-found.tsx` — Custom 404 page
- `src/app/error.tsx` — Error boundary
- `src/app/global-error.tsx` — Global error boundary
- `src/app/globals.css` — Tailwind v4 design tokens

**Key rules:**
- Pages are server components — they call server actions, then pass data as props to client components
- Next.js 16 async params: `params: Promise<{ repoId: string }>` — must `await params` before use
- Don't import client-side libraries (motion, hooks) in page files
- Root layout has `dynamic = "force-dynamic"` because DuckDB prevents static prerendering

**Involved when:** Adding new pages/routes, changing what data a page fetches, updating the root layout.

---

### 6. UI Agent

**Owns:** All client components, layout shell, and local UI primitives.

**Layout:**
- `src/components/layout/layout-shell.tsx` — Main wrapper (uses `next/dynamic` with `ssr: false`)
- `src/components/layout/page-banner.tsx` — Page banner component
- `src/components/layout/layout-config.tsx` — Layout configuration

**Feature clients (one per page):**
- `src/components/dashboard/dashboard-client.tsx` — Dashboard with stats + activity
- `src/components/repos/repos-client.tsx` — Repository listing
- `src/components/repos/repo-detail-client.tsx` — Repo detail with tabs
- `src/components/scans/scan-wizard.tsx` — Multi-step scan wizard
- `src/components/policies/policies-client.tsx` — Policy listing + form
- `src/components/patterns/patterns-library-client.tsx` — Patterns browser
- `src/components/settings/settings-client.tsx` — App settings tabs

**Repo sub-components:**
- `src/components/repos/claude-tab-content.tsx` — Claude config editor tab
- `src/components/repos/settings-form-editor.tsx` — Form-based settings editor
- `src/components/repos/settings-raw-editor.tsx` — Raw JSON settings editor
- `src/components/repos/settings-form/` — Key-value editor, string array editor, permission rules editor, hooks editor
- `src/components/repos/add-from-library-dialog.tsx` — Add concepts from library
- `src/components/repos/repo-integrations-content.tsx` — Repo integrations tab
- `src/components/repos/repo-github-content.tsx` — GitHub content tab
- `src/components/repos/repo-quick-improve.tsx` — Quick improve actions
- `src/components/repos/ai-file-gen-terminal.tsx` — AI file generation terminal
- `src/components/repos/manual-finding-form.tsx` — Manual finding entry form

**Session components (`src/components/sessions/`):**
- `session-context.tsx` — React context provider for session state across the app
- `session-panel.tsx` — Session list/detail panel UI
- `session-indicator.tsx` — Header badge showing active session count
- `session-badge.tsx` — Inline status badge for individual sessions

**Concept components:**
- `src/components/concepts/concept-sources-panel.tsx` — Source management panel
- `src/components/concepts/add-source-dialog.tsx` — Add concept source dialog
- `src/components/concepts/edit-source-dialog.tsx` — Edit concept source dialog
- `src/components/concepts/view-source-dialog.tsx` — View concept source dialog
- `src/components/concepts/install-concept-dialog.tsx` — Install concept to repo

**Code browser components (`src/components/code/`):**
- Code tree, file viewer, directory listing, breadcrumb, toolbar
- Branch switcher, commit log, commit detail, changes view
- Inline search, tab content

**Policy components:**
- `src/components/policies/policy-form.tsx` — Policy editor form
- `src/components/policies/rules-tab.tsx` — Custom rules tab
- `src/components/policies/rule-form.tsx` — Rule editor form
- `src/components/policies/format-docs.tsx` — Format documentation

**Shared components:**
- `src/components/directory-picker.tsx` — Filesystem directory browser

**Local shadcn/ui primitive in `src/components/ui/`:**
- `empty-state.tsx`

**Hooks from `@claudekit/hooks`:**
- `useIsMobile` — Mobile breakpoint detection
- `useAutoScroll` — Auto-scroll behavior for terminals/logs
- `useSessionStream` — SSE subscription hook for session progress events
- `useAppTheme` — Theme management

**Key rules:**
- Client components must have `"use client"` directive
- Use `next/dynamic` with `ssr: false` for motion imports to avoid prerender crashes
- Use `cn()` from `@claudekit/ui` for Tailwind class merging
- Sonner for toasts (`toast()` from `sonner`)
- Client components call `fetch('/api/...')` for mutations
- Session streaming uses `useSessionStream` hook from `@claudekit/hooks`

**Involved when:** Adding UI features, changing layouts, updating component styles, adding interactivity, creating new client components.

---

### 7. Types & Config Agent

**Owns:** Shared types, constants, utilities, and build/tooling configuration.

**Files:**
- `src/lib/types.ts` — All domain types
- `src/lib/constants.ts` — DEFAULT_EXCLUDE_PATTERNS, LOCKFILE_TO_PM, MONOREPO_INDICATORS, REPO_TYPE_INDICATORS, CONCEPT_DISCOVERY_PATTERNS, LIBRARY_REPO_ID, CURATED_SOURCE_ID, CLAUDE_CONFIG_SOURCE_ID, SESSION_TYPE_LABELS, re-exports SESSION_HEARTBEAT_INTERVAL_MS from `@claudekit/session`
- `src/lib/constants/permission-suggestions.ts` — Claude permission presets
- `src/lib/constants/settings-presets.ts` — Settings presets
- `src/lib/utils.ts` — `cn()`, `generateId()`, `nowTimestamp()`, `expandTilde()`, `formatBytes()`, `timeAgo()`
- `src/lib/fuzzy-match.ts` — Fuzzy string matching
- `src/lib/logger.ts` — Pino logger via `@claudekit/logger`
- `next.config.ts`, `biome.json`, `tsconfig.json`, `postcss.config.mjs`, `package.json`

**Key rules:**
- IDs use `crypto.randomUUID()` via `generateId()`
- Timestamps use `new Date().toISOString()` via `nowTimestamp()`
- All type changes ripple through actions -> pages -> components; coordinate accordingly
- Biome handles both linting and formatting — no ESLint or Prettier config exists

**Involved when:** Adding/changing domain types, updating constants, modifying build config, adding dependencies, updating tooling.

---

## Dependency Graph

```
Types & Config <- Data <- Actions <- Pages -> UI
                         Actions <- Services
                                 <- API Routes
```

**Import direction:** Types & Config -> Data -> Actions -> {Services, API, Pages} -> UI. Never import backwards.

---

## The Session System

The **unified session system** (via `@claudekit/session`) replaces all ad-hoc streaming endpoints. Every long-running operation goes through sessions.

```
Client -> POST /api/sessions (create + start)
       -> GET  /api/sessions/[id]/stream (SSE subscribe)
       -> POST /api/sessions/[id]/cancel (abort)
```

**All 6 session types:** `scan`, `quick_improve`, `finding_fix`, `fix_apply`, `ai_file_gen`, `cleanup`

**Adding a new session runner:**

| Step | Agent | Action |
|------|-------|--------|
| 1 | Types & Config | Add session type to `SessionType` union in `types.ts`, add label to `SESSION_TYPE_LABELS` in `constants.ts` |
| 2 | Services | Create `src/lib/services/session-runners/<name>.ts` exporting a runner factory |
| 3 | Services | Register in `src/lib/services/session-runners/index.ts` |
| 4 | API / UI | Wire the trigger (button, form) to `POST /api/sessions` with the new session type |

---

## Verification Checklist

After any multi-agent workflow, run these in order:

```bash
pnpm build        # Type-check + production build
pnpm lint         # Biome check
pnpm test         # Vitest
pnpm knip         # Detect unused exports, dependencies, and files
```
