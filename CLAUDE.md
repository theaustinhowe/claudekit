# CLAUDE.md — ClaudeKit Monorepo

This file provides guidance to Claude Code when working in this monorepo.

## Overview

**ClaudeKit** is a pnpm workspace monorepo containing local-first dev tool apps and shared packages. All apps run locally on macOS and persist data via DuckDB (except `apps/web` which is file-based). The monorepo uses `pnpm@10.30.2` and requires Node.js >= 20.

## Apps

| App | Port | Framework | Description |
|-----|------|-----------|-------------|
| `apps/web` | 2000 | Next.js 16 | ClaudeKit dashboard, app health monitor, log viewer, toolbox |
| `apps/ducktails` | 2050 | Next.js 16 | DuckDB admin UI — browse, query, edit all ClaudeKit databases |
| `apps/gadget` | 2100 | Next.js 16 | Repository auditor, AI integrations |
| `apps/inside` | 2150 | Next.js 16 | Project creation, scaffolding, design workspace |
| `apps/gogo-web` | 2200 | Next.js 16 | Job orchestration dashboard for multi-repo AI agents |
| `apps/gogo-orchestrator` | 2201 | Fastify 5 | Backend orchestrator for GoGo job execution |
| `apps/b4u` | 2300 | Next.js 16 | Automated repo walkthrough video generator |
| `apps/inspector` | 2400 | Next.js 16 | GitHub PR analysis, skill building, comment resolution |

Each app has its own `CLAUDE.md` with domain-specific context.

## Shared Packages

| Package | Description |
|---------|-------------|
| `@claudekit/ui` | shadcn/ui (Base UI primitives, not Radix) + cn() utility, shared layout, security headers for Next.js, Storybook on port 6006 |
| `@claudekit/hooks` | Shared React hooks (useAppTheme, useAutoScroll, useIsMobile, useSessionStream, useClaudeUsageRefresh) + ThemeFOUCScript |
| `@claudekit/duckdb` | DuckDB connection factory, query helpers, migration runner (async mutex, typed params) |
| `@claudekit/session` | Session lifecycle manager (ring buffer, batch log flush, DI persistence) with SSE response helpers and `@claudekit/session/next` subpath for Next.js route handlers |
| `@claudekit/claude-runner` | Claude CLI spawn + stream-json parsing, progress estimator, JSON extractor |
| `@claudekit/logger` | Pino-based structured logging with daily-rotating NDJSON files + log querying utilities |
| `@claudekit/github` | GitHub API client (Octokit wrapper), rate limit tracking, error hierarchy |
| `@claudekit/gogo-shared` | GoGo domain types, Zod schemas, typed API client |
| `@claudekit/claude-usage` | Claude API usage tracking + UsageSection component |
| `@claudekit/mcp-logs` | MCP server for log file access (5 tools) |
| `@claudekit/validation` | Shared Zod v4 request validation (parseBody, parseQuery) |
| `@claudekit/playwright` | Playwright browser automation helpers (browser session, navigation, screenshot, video) + E2E testing infrastructure |

Most packages export from `src/index.ts` using direct TypeScript source (no build step — consumers bundle them). The `gogo-orchestrator` is the exception, building to `dist/` via `tsc`.

## Commands

### Development

```bash
pnpm dev              # Start all apps as background daemon (opens http://localhost:2000)
pnpm dev:stop         # Stop the background daemon
pnpm dev:fg           # Start all apps in foreground (colored output via scripts/dev.ts)
pnpm dev:web          # Just Web dashboard (port 2000)
pnpm dev:gadget       # Just Gadget (port 2100)
pnpm dev:inside       # Just Inside (port 2150)
pnpm dev:gogo-web     # Just GoGo web dashboard (port 2200)
pnpm dev:gogo-orch    # Just GoGo orchestrator (port 2201)
pnpm dev:b4u          # Just B4U (port 2300)
pnpm dev:inspector    # Just Inspector (port 2400)
pnpm dev:ducktails    # Just DuckTails (port 2050)
pnpm storybook        # UI component Storybook (port 6006)
```

App startup is configurable via `~/.claudekit/app-settings.json`. The `web` app always starts; others respect `autoStart` settings. Logs go to `~/.claudekit/logs/`. PIDs are stored in `~/.claudekit/pids/`.

### Quality Checks

```bash
pnpm check            # Full CI gate: typecheck → lint → test:coverage → build
pnpm typecheck        # TypeScript check across all workspaces
pnpm lint             # Biome check
pnpm lint:fix         # Biome check with auto-fix (--write)
pnpm format           # Biome format (--write)
pnpm test             # Run all tests (sequential, with summary table)
pnpm test:coverage    # Tests with V8 coverage (Istanbul JSON + thresholds)
pnpm knip             # Dead code / unused dependency detection
```

### Maintenance

```bash
pnpm clean            # Remove .next, dist, build, out, .turbo, .tsbuildinfo across all workspaces
pnpm db:reset         # Reset databases for gadget, gogo-orchestrator, b4u, inside
pnpm build            # Build all packages and apps
```

### Scoped Commands

```bash
pnpm --filter <package> <command>          # Run in a specific workspace
pnpm --filter gadget test                  # Example: test just gadget
pnpm --filter @claudekit/duckdb typecheck  # Example: typecheck a package
```

## Code Style

- **Biome** for linting and formatting (no ESLint, no Prettier)
- 2-space indent, double quotes, semicolons, trailing commas
- 120 character line width
- Import sorting enforced by Biome
- Biome `recommended` rules enabled
- CSS: Tailwind directives enabled, CSS modules disabled

## Testing

- **Vitest** for all tests, using `vitest run` per package
- **V8 coverage** via `@vitest/coverage-v8`
- Coverage thresholds enforced per package (typically 50% statements, 40% branches, 50% functions, 50% lines)
- Tests live alongside source: `*.test.ts` / `*.test.tsx` colocated with their modules
- `pnpm test` discovers all workspaces with a `test` script and runs them sequentially with a summary table
- Supports `--filter <name>`, `--verbose`, and `--coverage` flags

## TypeScript

- Target: ES2022, Module: ESNext, moduleResolution: bundler
- Strict mode enabled across the board
- Each workspace has its own `tsconfig.json` extending the root
- Next.js apps use `@/` path alias mapped to `./src`

## Key Patterns

### Server/Client Split (Next.js apps)

All Next.js pages follow:
1. **Server Component** (`page.tsx`) — fetches data via Server Actions, passes as props
2. **Client Component** (`*-client.tsx`) — receives data, handles interactivity with `"use client"`

### Server Actions

Server-side data access uses `"use server"` functions in `src/lib/actions/` files. These are the data layer — they call DuckDB queries and return typed results to server components or client components via form actions.

### API Routes

Some apps (notably `gadget`) also expose REST API routes at `src/app/api/` using Next.js Route Handlers with colocated `*.test.ts` files.

### DuckDB & Migrations

- All DuckDB apps use `@claudekit/duckdb` with `createDatabase()` and `runMigrations()`
- Databases default to `~/.{appname}/data.duckdb` (overridable via `DATABASE_PATH` env var)
- Migrations are numbered `.sql` files in `src/lib/db/migrations/` (e.g., `001_initial.sql`)
- `pnpm db:reset` deletes database files; migrations re-run on next startup
- See `packages/duckdb/CLAUDE.md` for full API and gotchas

### Session System

Long-running operations use `@claudekit/session`. See `packages/session/CLAUDE.md` for lifecycle details.

### Claude CLI

`@claudekit/claude-runner` wraps Claude CLI invocation. See `packages/claude-runner/CLAUDE.md` for usage.

### Theme System

All apps share 9 color themes via `@claudekit/hooks`:
- Amethyst (default), Sapphire, Emerald, Ruby, Amber, Slate, Midnight, Sunset, Forest
- HSL CSS custom properties, class-based switching (`theme-{id}`)
- `useAppTheme()` hook with configurable storage key
- Tailwind CSS v4 (no `tailwind.config.*` — uses CSS-based configuration in each app's `globals.css`)

### Security Headers

All Next.js apps use `createNextConfig()` from `@claudekit/ui/next-config` in their `next.config.ts`, which applies security headers automatically. DuckDB, Playwright, and Pino bindings are listed in `serverExternalPackages` to exclude them from bundling.

### Logging

Apps use `@claudekit/logger` (Pino-based) for structured logging. Logs are daily-rotating NDJSON files stored in `~/.claudekit/logs/`. Default log level is `info` (configurable via `LOG_LEVEL` env var).

## Environment Variables

### Root `.env.local` (shared across apps)

| Variable | Used By | Description |
|----------|---------|-------------|
| `GITHUB_PERSONAL_ACCESS_TOKEN` | Gadget, GoGo, Inspector | GitHub API access (needs `repo` scope) |
| `LOG_LEVEL` | All | Log level: trace, debug, info, warn, error, fatal |
| `DATABASE_PATH` | All DuckDB apps | Override default database location |

### App-specific (in each app's `.env.local`)

| Variable | App | Description |
|----------|-----|-------------|
| `MCP_API_TOKEN` | Gadget | Bearer token for MCP API auth |
| `BRAVE_API_KEY` | Gadget | Brave Search API |
| `FIRECRAWL_API_KEY` | Gadget | Firecrawl web scraping |
| `EXA_API_KEY` | Gadget | Exa AI search |
| `TAVILY_API_KEY` | Gadget | Tavily AI search |
| `NOTION_API_KEY` | Gadget | Notion API integration |
| `ELEVENLABS_API_KEY` | B4U | TTS narration for walkthroughs |
| `PORT` | GoGo Orchestrator | HTTP server port (default: 2201) |
| `ALLOWED_ORIGINS` | GoGo Orchestrator | CORS origins, comma-separated |
| `NEXT_PUBLIC_API_URL` | GoGo Web | Orchestrator REST URL |
| `NEXT_PUBLIC_WS_URL` | GoGo Web | Orchestrator WebSocket URL |
| `NEXT_PUBLIC_DEFAULT_DIRECTORY` | Gadget, Inside, GoGo Web | Default directory for projects/scans |

Copy `.env.example` files to `.env.local` and fill in values. Root `.env.local` provides shared defaults; app-level `.env.local` files override them.

## Working in This Repo

- **Scope your work**: Use `pnpm --filter <package> <command>` to run commands in specific packages
- **Package changes**: When modifying a shared package, check which apps use it: `grep -r "@claudekit/packagename" apps/`
- **Type-check before committing**: Run `pnpm typecheck` or `pnpm --filter <app> typecheck`
- **Run the full gate**: `pnpm check` runs typecheck → lint → test:coverage → build (same as CI)
- **Each app has its own CLAUDE.md** with domain-specific context — read it before working in that app
