# CLAUDE.md — ClaudeKit Monorepo

This file provides guidance to Claude Code when working in this monorepo.

## Overview

**ClaudeKit** is a pnpm workspace monorepo containing local-first dev tool apps and shared packages.

## Apps

| App | Port | Framework | Description |
|-----|------|-----------|-------------|
| `apps/web` | 2000 | Next.js 16 | ClaudeKit dashboard, app health monitor, log viewer |
| `apps/gadget` | 2100 | Next.js 16 | Repository auditor, AI integrations |
| `apps/inside` | 2500 | Next.js 16 | Project creation, scaffolding, design workspace |
| `apps/gogo-web` | 2200 | Next.js 16 | Job orchestration dashboard for multi-repo AI agents |
| `apps/gogo-orchestrator` | 2201 | Fastify 5 | Backend orchestrator for GoGo job execution |
| `apps/b4u` | 2300 | Next.js 16 | Automated repo walkthrough video generator |
| `apps/inspector` | 2400 | Next.js 16 | GitHub PR analysis, skill building, comment resolution |

## Shared Packages

| Package | Description |
|---------|-------------|
| `@claudekit/duckdb` | DuckDB connection factory, query helpers, migration runner (async mutex, typed params) |
| `@claudekit/claude-runner` | Claude CLI spawn + stream-json parsing, progress estimator, JSON extractor |
| `@claudekit/session` | Session lifecycle manager (ring buffer, batch log flush, DI persistence) |
| `@claudekit/ui` | shadcn/ui components + cn() utility (65 components) |
| `@claudekit/hooks` | Shared React hooks (useAppTheme, useAutoScroll, useIsMobile, useSessionStream) |
| `@claudekit/gogo-shared` | GoGo domain types, Zod schemas, typed API client |
| `@claudekit/logger` | Pino-based structured logging with daily-rotating NDJSON files + log querying utilities |
| `@claudekit/claude-usage` | Claude API usage tracking |
| `@claudekit/mcp-logs` | MCP server for log file access (5 tools) |
| `@claudekit/playwright` | Playwright browser automation helpers (browser session, navigation, screenshot, video) + E2E testing infrastructure |

## Commands

```bash
pnpm dev              # Start all apps (colored output via scripts/dev.ts)
pnpm dev:web          # Just Web dashboard (port 2000)
pnpm dev:gadget       # Just Gadget (port 2100)
pnpm dev:gogo-web     # Just GoGo web dashboard (port 2200)
pnpm dev:gogo-orch    # Just GoGo orchestrator (port 2201)
pnpm dev:b4u          # Just B4U (port 2300)
pnpm dev:inspector    # Just Inspector (port 2400)
pnpm dev:inside       # Just Inside (port 2500)
pnpm build            # Build all packages and apps
pnpm typecheck        # TypeScript check across everything
pnpm lint             # Biome check
pnpm lint:fix         # Biome check with auto-fix
pnpm format           # Biome format
pnpm test             # All tests
pnpm check            # typecheck + lint + test + build
```

## Code Style

- **Biome** for linting and formatting (no ESLint, no Prettier)
- 2-space indent, double quotes, semicolons, trailing commas
- 120 character line width
- Import sorting enforced by Biome

## Key Patterns

### DuckDB

All apps use `@claudekit/duckdb` for database access:
- `createDatabase(config)` — factory with optional `globalThis` caching for Next.js HMR survival
- `queryAll<T>`, `queryOne<T>`, `execute` — query helpers with async mutex
- `withTransaction` — automatic BEGIN/COMMIT/ROLLBACK
- `buildUpdate` — dynamic UPDATE from partial objects
- `runMigrations(conn, { migrationsDir })` — numbered `.sql` migrations tracked in `_migrations` table
- Each app has its own migrations directory and seed scripts

### Session System

Long-running operations use `@claudekit/session`:
- `createSessionManager(config)` — factory with DI persistence callbacks
- Ring buffer (500 events), batch log flush (2s), heartbeat (15s)
- Apps provide `loadSession`, `updateSession`, `persistLogs` callbacks

### Claude CLI

`@claudekit/claude-runner` wraps Claude CLI invocation:
- `runClaude(options)` — spawn with stream-json parsing, abort, PID tracking
- `parseStreamJsonEvent(evt, cwd)` — standalone event parser for any transport

### Server/Client Split (Next.js apps)

All Next.js pages follow:
1. **Server Component** (`page.tsx`) — fetches data via Server Actions, passes as props
2. **Client Component** (`*-client.tsx`) — receives data, handles interactivity with `"use client"`

### Theme System

All apps share 9 color themes via `@claudekit/hooks`:
- Amethyst (default), Sapphire, Emerald, Ruby, Amber, Slate, Midnight, Sunset, Forest
- HSL CSS custom properties, class-based switching (`theme-{id}`)
- `useAppTheme()` hook with configurable storage key

## Working in This Repo

- **Scope your work**: Use `pnpm --filter <package> <command>` to run commands in specific packages
- **Package changes**: When modifying a shared package, check which apps use it: `grep -r "@claudekit/packagename" apps/`
- **Migrations**: Apps use numbered `.sql` files in `migrations/` directories with `runMigrations()` from `@claudekit/duckdb`. Use `pnpm --filter <app> db:reset` for full schema reset during development
- **Each app has its own CLAUDE.md** with domain-specific context
