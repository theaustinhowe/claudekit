# CLAUDE.md — Devkit Monorepo

This file provides guidance to Claude Code when working in this monorepo.

## Overview

**Devkit** is a pnpm workspace monorepo containing three local-first dev tool apps and shared packages.

## Apps

| App | Port | Framework | Description |
|-----|------|-----------|-------------|
| `apps/web` | 2000 | Next.js 16 | Devkit dashboard, app health monitor, log viewer |
| `apps/gadget` | 2100 | Next.js 16 | Repository auditor, AI integrations, project scaffolding |
| `apps/gogo-web` | 2200 | Next.js 16 | Job orchestration dashboard for multi-repo AI agents |
| `apps/gogo-orchestrator` | 2201 | Fastify 5 | Backend orchestrator for GoGo job execution |
| `apps/b4u` | 2300 | Next.js 16 | Automated repo walkthrough video generator |

## Shared Packages

| Package | Description |
|---------|-------------|
| `@devkit/duckdb` | DuckDB connection factory + query helpers (async mutex, typed params) |
| `@devkit/claude-runner` | Claude CLI spawn + stream-json parsing |
| `@devkit/session` | Session lifecycle manager (ring buffer, batch log flush, DI persistence) |
| `@devkit/ui` | shadcn/ui components + cn() utility (25 components) |
| `@devkit/hooks` | Shared React hooks (useAppTheme, useAutoScroll, useIsMobile, useSessionStream) |
| `@devkit/gogo-shared` | GoGo domain types (Job, Repository, etc.) |
| `@devkit/config` | Base tsconfig and biome configs |

## Commands

```bash
pnpm dev              # Start all apps (colored output via scripts/dev.ts)
pnpm dev:web          # Just Web dashboard (port 2000)
pnpm dev:gadget       # Just Gadget (port 2100)
pnpm dev:gogo         # GoGo web + orchestrator (split terminal)
pnpm dev:b4u          # Just B4U (port 2300)
pnpm build            # Build all packages and apps
pnpm typecheck        # TypeScript check across everything
pnpm lint             # Biome check
pnpm lint:fix         # Biome check with auto-fix
pnpm format           # Biome format
pnpm test             # All tests
pnpm check            # typecheck + lint + test
```

## Code Style

- **Biome** for linting and formatting (no ESLint, no Prettier)
- 2-space indent, double quotes, semicolons, trailing commas
- 120 character line width
- Import sorting enforced by Biome

## Key Patterns

### DuckDB

All apps use `@devkit/duckdb` for database access:
- `createDatabase(config)` — factory with optional `globalThis` caching for Next.js HMR survival
- `queryAll<T>`, `queryOne<T>`, `execute` — query helpers with async mutex
- `withTransaction` — automatic BEGIN/COMMIT/ROLLBACK
- `buildUpdate` — dynamic UPDATE from partial objects
- Each app has its own schema definitions and seed scripts

### Session System

Long-running operations use `@devkit/session`:
- `createSessionManager(config)` — factory with DI persistence callbacks
- Ring buffer (500 events), batch log flush (2s), heartbeat (15s)
- Apps provide `loadSession`, `updateSession`, `persistLogs` callbacks

### Claude CLI

`@devkit/claude-runner` wraps Claude CLI invocation:
- `runClaude(options)` — spawn with stream-json parsing, abort, PID tracking
- `parseStreamJsonEvent(evt, cwd)` — standalone event parser for any transport

### Server/Client Split (Next.js apps)

All Next.js pages follow:
1. **Server Component** (`page.tsx`) — fetches data via Server Actions, passes as props
2. **Client Component** (`*-client.tsx`) — receives data, handles interactivity with `"use client"`

### Theme System

All apps share 9 color themes via `@devkit/hooks`:
- Amethyst (default), Sapphire, Emerald, Ruby, Amber, Slate, Midnight, Sunset, Forest
- HSL CSS custom properties, class-based switching (`theme-{id}`)
- `useAppTheme()` hook with configurable storage key

## Working in This Repo

- **Scope your work**: Use `pnpm --filter <package> <command>` to run commands in specific packages
- **Package changes**: When modifying a shared package, check which apps use it: `grep -r "@devkit/packagename" apps/`
- **No migrations**: All DuckDB tables use `CREATE TABLE IF NOT EXISTS`. Use `pnpm --filter <app> db:reset` for schema changes
- **Each app has its own CLAUDE.md** with domain-specific context
