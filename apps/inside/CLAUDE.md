# CLAUDE.md — Inside

## Commands

```bash
pnpm dev          # Start dev server at http://localhost:2500
pnpm build        # Production build (also runs type-check)
pnpm lint         # Biome check
pnpm lint:fix     # Biome check with auto-fix
pnpm format       # Biome format (write)
pnpm test         # Run tests with vitest
pnpm seed         # Re-seed built-in data
pnpm db:reset     # Delete DuckDB data file and WAL (full reset)
```

## Architecture

**Inside** is a **Next.js 16 App Router** local-first dev tool for project creation, scaffolding, and design workspace management. All imports use the `@/` alias for `src/`.

### Data Layer

- **DuckDB** via `@duckdb/node-api`. DB file at `~/.inside/data.duckdb`.
- Migrations in `src/lib/db/migrations/`. Uses `runMigrations()` from `@claudekit/duckdb`.
- 11 tables: templates, generator_projects, project_specs, design_messages, upgrade_tasks, auto_fix_runs, project_screenshots, generator_runs, settings, sessions, session_logs.

### Session System

5 session types: `scaffold`, `upgrade`, `auto_fix`, `upgrade_init`, `chat`.
Session runners in `src/lib/services/session-runners/`.

### Key Differences from Gadget

- No `policy_id` or `repo_id` columns on generator_projects
- No policies, repos, findings, scans, or concepts tables
- Screenshots stored in `~/.inside/screenshots/`
- Dev server cache key: `__inside_dev_servers__`
- Default project path from settings table instead of scan roots
