# Development Setup Guide

## Prerequisites

| Requirement | Version | Notes |
|------------|---------|-------|
| **Node.js** | v20+ | Required by the ClaudeKit monorepo |
| **pnpm** | v9+ | Package manager -- `corepack enable` to activate |
| **Git** | Any recent | Required for scanning and concept discovery |
| **Claude CLI** | Latest | Optional -- required for AI-powered features (finding-fix, quick-improve) |

## Installation

Gadget is part of the ClaudeKit monorepo:

```bash
# 1. Clone the monorepo
git clone <repo-url> claudekit && cd claudekit

# 2. Install dependencies
pnpm install

# 3. Create your local environment file
cp apps/gadget/.env.example apps/gadget/.env.local
```

Edit `.env.local` and fill in the keys you need (see [Environment Variables](#environment-variables) below).

```bash
# 4. Start the dev server
pnpm dev:gadget
```

The app will be available at **http://localhost:2100**.

On first startup the database is created automatically at `~/.gadget/data.duckdb`, numbered SQL migrations are run, and built-in seed data (policies, concept sources) is inserted.

## Environment Variables

All variables are defined in `.env.local` (gitignored). Only `MCP_API_TOKEN` is required for core functionality.

### Required

| Variable | Purpose |
|----------|---------|
| `MCP_API_TOKEN` | Bearer token for MCP programmatic API access |

### Optional -- Core

| Variable | Purpose |
|----------|---------|
| `DATABASE_PATH` | Override database location (default: `~/.gadget/data.duckdb`) |
| `GITHUB_PERSONAL_ACCESS_TOKEN` | GitHub API access for repo sync and concept discovery |

### Optional -- MCP Server Integrations

These are only needed if you configure the corresponding MCP server integrations within the app:

`BRAVE_API_KEY`, `FIRECRAWL_API_KEY`, `EXA_API_KEY`, `TAVILY_API_KEY`, `NOTION_API_KEY`, `GOOGLE_MAPS_API_KEY`, `RESEND_API_KEY`, `AXIOM_API_TOKEN`, `RAYGUN_API_KEY`, `STRIPE_API_KEY`, `REPLICATE_API_TOKEN`, `GITLAB_TOKEN`, `SLACK_BOT_TOKEN`, `SLACK_TEAM_ID`, `SENTRY_AUTH_TOKEN`, `LINEAR_API_KEY`, `SUPABASE_ACCESS_TOKEN`

## Scripts Reference

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start Next.js dev server on port 2100 with hot reload |
| `pnpm build` | Production build (includes type-checking) |
| `pnpm lint` | Run Biome lint + format check on `src/` |
| `pnpm lint:fix` | Run Biome with auto-fix |
| `pnpm format` | Run Biome format (write mode) |
| `pnpm test` | Run tests with Vitest |
| `pnpm seed` | Re-seed built-in data (`tsx src/lib/db/seed.ts`) |
| `pnpm db:reset` | Delete DuckDB data file and WAL -- full database reset |
| `pnpm knip` | Detect unused exports, dependencies, and files |

## Database

### Overview

Gadget uses [DuckDB](https://duckdb.org/) as an embedded database via `@claudekit/duckdb`. The database file lives at `~/.gadget/data.duckdb` (override with `DATABASE_PATH`).

### Automatic initialization

On first connection (`getDb()` in `src/lib/db/index.ts`):

1. Creates the `~/.gadget/` directory if missing
2. Opens or creates the DuckDB file
3. Runs numbered SQL migrations from `src/lib/db/migrations/`
4. Recovers orphaned scans stuck in `running` state
5. Reconciles orphaned sessions + prunes old session data (via `@claudekit/session`)
6. Seeds built-in data (only on first run)

### Schema changes

Migrations are numbered `.sql` files in `src/lib/db/migrations/` (e.g., `001_initial.sql`). To add a migration, create a new numbered file and it will run automatically on startup via `runMigrations()` from `@claudekit/duckdb`.

### Resetting the database

```bash
pnpm db:reset   # deletes ~/.gadget/data.duckdb and .wal file
pnpm dev        # restart -- fresh database is created automatically
```

### Re-seeding without reset

```bash
pnpm seed   # re-runs seed.ts (inserts use ON CONFLICT DO NOTHING)
```

### Connection model

- `createDatabase()` from `@claudekit/duckdb` with `useGlobalCache: true` to survive Next.js HMR reloads.
- Query helpers (`queryAll<T>()`, `queryOne<T>()`, `execute()`, `buildUpdate()`, `withTransaction()`, `checkpoint()`, `parseJsonField()`) are re-exported from `@claudekit/duckdb`.
- Uses `?` placeholders which auto-convert to DuckDB's positional `$1, $2, ...` format.

## Code Style & Linting

### Biome

Gadget uses [Biome](https://biomejs.dev/) for both linting and formatting (no ESLint or Prettier). Config is in `biome.json`.

**Formatting rules:**
- 2-space indentation
- 120-character line width
- Double quotes, semicolons, trailing commas

**Common lint issues to watch for:**
- Imports must be sorted (type imports before namespace imports from the same module)
- No non-null assertions (`!`) -- extract to a variable first
- Unused function parameters are errors -- remove them from destructuring
- `useExhaustiveDependencies` -- use `.length` instead of the array reference in dependency arrays

### TypeScript

- Strict mode enabled
- All imports use the `@/` path alias (mapped to `src/`)
- All domain types live in `src/lib/types.ts`
- Shared packages use `@claudekit/*` imports

## Architecture Quick Reference

### Server/Client split

Every page follows the same pattern:

1. **Server Component** (`src/app/**/page.tsx`) -- calls Server Actions to fetch data, passes as props
2. **Client Component** (`src/components/**/*-client.tsx`) -- receives data via props, handles interactivity with `"use client"`

### Data flow

```
Client Component
  -> Server Action (src/lib/actions/*.ts, "use server")
    -> getDb() -> @claudekit/duckdb helpers (queryAll, queryOne, execute)
```

### Session system

All long-running operations go through `@claudekit/session`:

- **Session manager** (`src/lib/services/session-manager.ts`) -- lifecycle management
- **Runners** (`src/lib/services/session-runners/`) -- 6 runner factories
- **API** -- `POST /api/sessions` (create+start), `GET /api/sessions/[id]/stream` (SSE), `POST /api/sessions/[id]/cancel`
- **Client hook** -- `useSessionStream()` from `@claudekit/hooks`

### Key directories

| Path | Purpose |
|------|---------|
| `src/app/` | Next.js App Router pages (8) and API routes (19) |
| `src/components/` | Feature-specific client components |
| `src/lib/actions/` | Server Actions (15 files, all DB access) |
| `src/lib/services/` | Business logic, scanners, auditors, runners |
| `src/lib/db/` | DuckDB init, migrations, seed |
| `src/lib/types.ts` | All domain type definitions |

## Common Workflows

### Adding a new page

1. Create the server component at `src/app/<route>/page.tsx`
2. Create the client component at `src/components/<feature>/<feature>-client.tsx` with `"use client"`
3. Fetch data in the server component via Server Actions, pass as props to the client

### Adding a new API endpoint

Create a `route.ts` in `src/app/api/<path>/`. Use `params: Promise<{ id: string }>` for dynamic segments (Next.js 16 async params -- must `await params`).

### Adding a new session runner

1. Add the new type to the `SessionType` union in `src/lib/types.ts`
2. Create `src/lib/services/session-runners/<type>.ts` exporting a runner factory
3. Register it in `src/lib/services/session-runners/index.ts`

## Troubleshooting

### DuckDB fails to start / WAL errors

```bash
pnpm db:reset
pnpm dev
```

Or just remove the WAL file: `rm ~/.gadget/data.duckdb.wal`

### Port 2100 already in use

```bash
lsof -ti:2100 | xargs kill -9
pnpm dev
```

### Hot reload breaks database connection

The DuckDB connection is cached via `useGlobalCache: true` in `createDatabase()` to survive HMR. If you experience stale connection issues, restart the dev server.
