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

See `.env.example`. Key variables:
- `MCP_API_TOKEN` — required for MCP programmatic access (Bearer token auth)
- `DATABASE_PATH` — override database location (default: `~/.gadget/data.duckdb`)
- `GITHUB_PERSONAL_ACCESS_TOKEN` — for GitHub API integration
- Additional optional keys for MCP server integrations (Brave, Firecrawl, Exa, Tavily, Notion, Stripe, etc.)

## Architecture

**Gadget** is a **Next.js 16 App Router** local-first dev tool (not a SaaS). It audits repositories against policies, manages AI integrations (Claude skills, MCP servers, agents), and generates fix diffs. All imports use the `@/` alias for `src/`.

### Directory Layout

```
src/
├── app/                          # Next.js App Router
│   ├── layout.tsx                # Root layout (force-dynamic, fonts, theme)
│   ├── page.tsx                  # Dashboard
│   ├── repositories/             # Repository listing + detail
│   ├── scans/                    # Scan history + new scan wizard
│   ├── policies/                 # Policy management
│   ├── ai-integrations/          # Skills, MCP servers, agents
│   ├── settings/                 # App settings
│   └── api/                      # 19 REST endpoints
├── components/
│   ├── ui/                       # shadcn/ui primitives (1 local: empty-state)
│   ├── layout/                   # Shell, page banner, layout config
│   ├── dashboard/                # Dashboard client
│   ├── repos/                    # Repo detail tabs, Claude config editor
│   ├── policies/                 # Policy form, rules tab
│   ├── scans/                    # Scan wizard
│   ├── sessions/                 # Session badge, panel, indicator, context
│   ├── code/                     # Code browser, file viewer, diff, commit views
│   ├── settings/                 # Settings tabs, API keys
│   ├── concepts/                 # Concept sources, install dialogs
│   └── patterns/                 # Patterns library
├── lib/
│   ├── db/                       # DuckDB init, migrations, seed
│   ├── actions/                  # 15 Server Action files ("use server")
│   ├── services/                 # Business logic, scanners, auditors, session system
│   │   ├── auditors/             # 4 auditors: dependencies, ai-files, structure, custom-rules
│   │   └── session-runners/      # 6 per-type session runner factories + index
│   ├── constants/                # Permission suggestions, settings presets
│   ├── types.ts                  # All domain types
│   ├── constants.ts              # Sentinel IDs, discovery patterns, labels, session config
│   ├── logger.ts                 # Pino logger via @claudekit/logger
│   └── utils.ts                  # cn(), generateId(), nowTimestamp(), parsePolicy(), etc.
└── (no local hooks/ — uses @claudekit/hooks)
```

### Shared Packages

This app uses several `@claudekit/*` packages instead of local implementations:
- **`@claudekit/duckdb`** — `createDatabase()`, `runMigrations()`, query helpers (`queryAll`, `queryOne`, `execute`, `buildUpdate`, etc.)
- **`@claudekit/session`** — `createSessionManager()`, `reconcileSessionsOnInit()`, session constants
- **`@claudekit/claude-runner`** — `runClaude()` for Claude CLI invocation with stream-json parsing
- **`@claudekit/claude-usage`** — Claude API usage and rate limit tracking
- **`@claudekit/logger`** — Pino-based structured logging
- **`@claudekit/ui`** — shadcn/ui components, `cn()` utility, security headers
- **`@claudekit/hooks`** — Shared React hooks (useAppTheme, useAutoScroll, useIsMobile, useSessionStream)

### Data Layer

- **DuckDB** via `@claudekit/duckdb` using `createDatabase()`. DB file at `~/.gadget/data.duckdb`.
- `src/lib/db/index.ts` — calls `createDatabase()` with `useGlobalCache: true`, runs numbered migrations via `runMigrations()`, reconciles orphaned scans/sessions, auto-seeds built-in data.
- `src/lib/db/migrations/001_initial.sql` — 17 tables: scan_roots, scans, repos, policies, findings, fix_actions, snapshots, apply_runs, settings, github_accounts, concept_sources, concepts, concept_links, custom_rules, manual_findings, sessions, session_logs.
- `src/lib/db/seed.ts` — Built-in policies, concept sources.
- Query helpers (`queryAll`, `queryOne`, `execute`, `buildUpdate`, `withTransaction`, `checkpoint`, `parseJsonField`) are re-exported from `@claudekit/duckdb`.

### Session System

The session system provides a unified abstraction for all long-running operations via `@claudekit/session`. All streaming operations go through sessions.

- **`src/lib/services/session-manager.ts`** — wraps `createSessionManager()` from `@claudekit/session`, cached on `globalThis` for HMR survival.
- **`src/lib/services/session-runners/`** — 6 runner factories (one per `SessionType`):
  - `scan` — repository scanning
  - `quick-improve` — quick repo improvements via Claude
  - `finding-fix` — finding-specific fixes via Claude
  - `fix-apply` — apply fix operations
  - `ai-file-gen` — AI file generation
  - `cleanup` — resource cleanup
- **`src/lib/actions/sessions.ts`** — Server Actions for session DB records
- **`src/app/api/sessions/`** — REST endpoints: `POST /api/sessions` (create+start), `GET /api/sessions/[id]/stream` (SSE), `POST /api/sessions/[id]/cancel`, `POST /api/sessions/cleanup`
- **Client hook** — `useSessionStream()` from `@claudekit/hooks`
- **`src/components/sessions/`** — `session-panel.tsx`, `session-badge.tsx`, `session-indicator.tsx`, `session-context.tsx`

### Server/Client Split

Every page follows the same pattern:
1. **Server Component** (`src/app/**/page.tsx`) — calls Server Actions to fetch data, passes as props
2. **Client Component** (`src/components/*/**-client.tsx`) — receives data via props, handles interactivity with `"use client"`

### Server Actions (`src/lib/actions/`)

All DB reads/writes go through `"use server"` functions in 15 action files. These call `await getDb()` to get a DuckDB connection, then use async helper functions (`queryAll`, `queryOne`, `execute`).

Action files: `repos.ts`, `scans.ts`, `findings.ts`, `fixes.ts`, `policies.ts`, `concepts.ts`, `concept-sources.ts`, `settings.ts`, `claude-config.ts`, `claude-usage.ts`, `env-keys.ts`, `custom-rules.ts`, `manual-findings.ts`, `code-browser.ts`, `sessions.ts`.

### Route Handlers (API)

19 REST endpoints under `src/app/api/`:
- `scans/` — scan listing
- `repos/` — repository CRUD
- `repos/[repoId]/` — single repo operations
- `repos/[repoId]/raw/` — raw repo data access
- `findings/` — audit findings
- `fixes/` — fix action queries
- `fixes/apply/`, `fixes/preview/`, `fixes/restore/` — fix lifecycle
- `discover/` — repo discovery
- `policies/` — policy CRUD
- `reports/` — report export
- `fs/browse/` — filesystem browsing
- `claude-usage/` — Claude API usage tracking
- `sessions/` — create and start sessions
- `sessions/cleanup/` — session cleanup
- `sessions/[sessionId]/` — session detail
- `sessions/[sessionId]/stream/` — SSE event stream
- `sessions/[sessionId]/cancel/` — cancel a running session

### Services (`src/lib/services/`)

Key service files:
- **`session-manager.ts`** — wraps `@claudekit/session` for session lifecycle management
- **`session-runners/`** — 6 per-type runner factories dispatched via `sessionRunners` registry in `index.ts`
- **`scanner.ts`** — walks filesystem from scan roots, finds `.git` directories, detects package managers/monorepos/repo types
- **`auditors/`** — four auditors producing `AuditFinding[]`: `dependencies.ts`, `ai-files.ts`, `structure.ts`, `custom-rules.ts` (plus `index.ts` barrel)
- **`fix-planner.ts`** — converts findings into fix actions with file diffs (before/after)
- **`apply-engine.ts`** — snapshots files, applies fixes atomically (write to temp then rename), supports restore
- **`reporter.ts`** — exports reports as JSON, Markdown, or PR description format
- **`concept-scanner.ts`** / **`github-concept-scanner.ts`** / **`mcp-list-scanner.ts`** / **`claude-config-scanner.ts`** — discover concepts from various sources
- **`claude-config.ts`** / **`claude-settings-schema.ts`** — Claude config read/write/parse
- **`github-client.ts`** — GitHub API integration
- **`encryption.ts`** — AES-256-GCM encryption for GitHub PATs
- **`process-runner.ts`** — generic bash process spawning with abort support and stdout/stderr streaming
- **`git-utils.ts`** — Git utility functions
- **`policy-matcher.ts`** — policy matching
- **`language-detector.ts`** — programming language detection
- **`finding-prompt-builder.ts`** / **`finding-classifier.ts`** — AI-powered finding analysis
- **`quick-improve-prompts.ts`** — prompt generation for quick repo improvements

### UI Stack

- **shadcn/ui** components from `@claudekit/ui` (1 local component: `empty-state.tsx`)
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
- Security headers configured in `next.config.ts` via `@claudekit/ui/next-config`

### DuckDB

See `packages/duckdb/CLAUDE.md` for general DuckDB query patterns and gotchas. App-specific notes:
- `getDb()` is async — always `const db = await getDb()`
- JSON fields stored as native `JSON` type in DuckDB, parsed with `parseJsonField()` on read
- Migrations are numbered `.sql` files in `src/lib/db/migrations/` (e.g., `001_initial.sql`)
- Timestamps use `TIMESTAMPTZ DEFAULT now()` (not TEXT columns)

### Session System
- All long-running operations go through the session system — do NOT create standalone streaming routes
- To add a new operation type: add to `SessionType` union in `types.ts`, create a runner factory in `session-runners/`, register it in `session-runners/index.ts`
- `SessionRunner` signature: `(ctx: { onProgress, signal, sessionId }) => Promise<{ result? }>`
- Runner factory signature: `(metadata: Record<string, unknown>, contextId?: string) => SessionRunner`
- Use `runClaude()` from `@claudekit/claude-runner` to invoke Claude CLI

### TypeScript / Code Style
- All domain types defined in `src/lib/types.ts`
- IDs generated via `generateId()` in `src/lib/utils.ts` (uses `crypto.randomUUID()`)
- Timestamps via `nowTimestamp()` (returns `new Date().toISOString()`)
- `as const` arrays need explicit `string[]` typing when passed to functions expecting mutable arrays
- **Biome** for linting and formatting (replaces ESLint + Prettier). Config in `biome.json`: 2-space indent, 120 line width, double quotes, semicolons, trailing commas.
- Scanner behavior controlled by constants in `src/lib/constants.ts`: `DEFAULT_EXCLUDE_PATTERNS`, `LOCKFILE_TO_PM`, `MONOREPO_INDICATORS`, `REPO_TYPE_INDICATORS`, `CONCEPT_DISCOVERY_PATTERNS`
- Sentinel IDs: `LIBRARY_REPO_ID = "__library__"`, `CURATED_SOURCE_ID`, `CLAUDE_CONFIG_SOURCE_ID`

### Common Biome Lint Gotchas
- Imports must be sorted (type imports before namespace imports from same module)
- No non-null assertions (`!`) — extract to variable first
- Unused function parameters are errors — remove from destructuring
- `useExhaustiveDependencies` — use `.length` instead of array ref in dependency arrays
