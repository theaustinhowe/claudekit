# Development Setup Guide

## Prerequisites

| Requirement | Version | Notes |
|------------|---------|-------|
| **Node.js** | v22+ | Pinned in `.nvmrc` — run `nvm use` to switch |
| **pnpm** | v9+ | Package manager — `corepack enable` to activate |
| **Git** | Any recent | Required for scanning and concept discovery |
| **Claude CLI** | Latest | Optional — required for AI-powered features (scaffolding, chat, auto-fix) |

### Platform notes

- **macOS / Linux**: DuckDB native bindings compile during install via `pnpm.onlyBuiltDependencies`. Xcode CLI tools (macOS) or `build-essential` (Linux) must be present.
- **Playwright** (optional): Used for screenshot capture. Installed as a devDependency; browsers are installed on demand, not during `pnpm install`.

## Installation

```bash
# 1. Clone the repository
git clone <repo-url> gadget && cd gadget

# 2. Switch to the correct Node.js version
nvm use   # reads .nvmrc → Node 22

# 3. Install dependencies
pnpm install

# 4. Create your local environment file
cp .env.local.example .env.local
```

Edit `.env.local` and fill in the keys you need (see [Environment Variables](#environment-variables) below).

```bash
# 5. Start the dev server
pnpm dev
```

The app will be available at **http://localhost:2000**.

On first startup the database is created automatically at `~/.gadget/data.duckdb`, the schema is initialized, and built-in seed data (policies, templates, fix packs, custom rules, concept sources) is inserted.

## Environment Variables

All variables are defined in `.env.local` (gitignored). Only `MCP_API_TOKEN` is required for core functionality.

### Required

| Variable | Purpose |
|----------|---------|
| `MCP_API_TOKEN` | Bearer token for MCP programmatic API access |

### Optional — Core

| Variable | Purpose |
|----------|---------|
| `DB_PATH` | Override database location (default: `~/.gadget/data.duckdb`) |
| `ANTHROPIC_API_KEY` | Anthropic API key for AI-powered project generation |
| `GITHUB_PERSONAL_ACCESS_TOKEN` | GitHub API access for repo sync and concept discovery |

### Optional — MCP Server Integrations

These are only needed if you configure the corresponding MCP server integrations within the app:

`BRAVE_API_KEY`, `FIRECRAWL_API_KEY`, `EXA_API_KEY`, `TAVILY_API_KEY`, `NOTION_API_KEY`, `GOOGLE_MAPS_API_KEY`, `RESEND_API_KEY`, `AXIOM_API_TOKEN`, `RAYGUN_API_KEY`, `STRIPE_API_KEY`, `OPENAI_API_KEY`, `REPLICATE_API_TOKEN`, `GITLAB_TOKEN`, `SLACK_BOT_TOKEN`, `SLACK_TEAM_ID`, `SENTRY_AUTH_TOKEN`, `LINEAR_API_KEY`, `SUPABASE_ACCESS_TOKEN`

## Scripts Reference

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start Next.js dev server on port 2000 with hot reload |
| `pnpm build` | Production build (includes type-checking) |
| `pnpm start` | Start production server on port 2000 |
| `pnpm lint` | Run Biome lint + format check on `src/` |
| `pnpm lint:fix` | Run Biome with auto-fix |
| `pnpm format` | Run Biome format (write mode) |
| `pnpm test` | Run tests with Vitest |
| `pnpm seed` | Re-seed built-in data (`tsx src/lib/db/seed.ts`) |
| `pnpm db:reset` | Delete DuckDB data file and WAL — full database reset |
| `pnpm knip` | Detect unused exports, dependencies, and files |
| `pnpm prepare` | Set up Husky git hooks (runs automatically after install) |

## Database

### Overview

Gadget uses [DuckDB](https://duckdb.org/) as an embedded database via `@duckdb/node-api`. The database file lives at `~/.gadget/data.duckdb` (override with `DB_PATH`).

### Automatic initialization

On first connection (`getDb()` in `src/lib/db/index.ts`):

1. Creates the `~/.gadget/` directory if missing
2. Opens or creates the DuckDB file
3. Runs `initSchema()` — creates all 32 tables with `CREATE TABLE IF NOT EXISTS`
4. Auto-seeds built-in data (policies, templates, fix packs, rules, concept sources) if not yet seeded
5. Recovers orphaned sessions/scans stuck in `running`/`pending` state
6. Prunes session logs older than 7 days and completed sessions older than 30 days

No manual migration step is required for a fresh setup.

### Schema changes

There is no incremental migration system. All tables use `CREATE TABLE IF NOT EXISTS` in `src/lib/db/schema.ts`.

- **Additive changes** (new tables, new indexes): Add to `schema.ts` — they apply on next startup.
- **Breaking changes** (renamed columns, changed types): Run `pnpm db:reset` to delete the database, then restart. All data will be re-seeded.

### Resetting the database

```bash
pnpm db:reset   # deletes ~/.gadget/data.duckdb and .wal file
pnpm dev        # restart — fresh database is created automatically
```

### Re-seeding without reset

```bash
pnpm seed   # re-runs seed.ts (inserts use ON CONFLICT DO NOTHING)
```

### WAL corruption recovery

If DuckDB fails to open due to a corrupt WAL file, the init code automatically removes the `.wal` file and retries. You can also manually fix this:

```bash
rm ~/.gadget/data.duckdb.wal
pnpm dev
```

### Connection model

- A single `DuckDBInstance` + `DuckDBConnection` is cached on `globalThis` to survive Next.js HMR reloads.
- All queries go through `src/lib/db/helpers.ts`: `queryAll<T>()`, `queryOne<T>()`, `execute()`, `checkpoint()`.
- The helpers accept `?` placeholders which auto-convert to DuckDB's positional `$1, $2, ...` format.
- Concurrent access is serialized by an async mutex since DuckDB's node-api doesn't support concurrent prepared statements on a single connection.

## Code Style & Linting

### Biome

Gadget uses [Biome](https://biomejs.dev/) for both linting and formatting (no ESLint or Prettier). Config is in `biome.json`.

**Formatting rules:**
- 2-space indentation
- 120-character line width
- Double quotes, semicolons, trailing commas

**Pre-commit hook:** Husky runs `pnpm exec lint-staged` which applies `biome check --write` to staged `*.{js,ts,jsx,tsx,css,json}` files.

**Common lint issues to watch for:**
- Imports must be sorted (type imports before namespace imports from the same module)
- No non-null assertions (`!`) — extract to a variable first
- Unused function parameters are errors — remove them from destructuring
- `useExhaustiveDependencies` — use `.length` instead of the array reference in dependency arrays

### TypeScript

- Strict mode enabled
- All imports use the `@/` path alias (mapped to `src/`)
- All domain types live in `src/lib/types.ts`

## Architecture Quick Reference

### Server/Client split

Every page follows the same pattern:

1. **Server Component** (`src/app/**/page.tsx`) — calls Server Actions to fetch data, passes as props
2. **Client Component** (`src/components/**/*-client.tsx`) — receives data via props, handles interactivity with `"use client"`

### Data flow

```
Client Component
  → Server Action (src/lib/actions/*.ts, "use server")
    → getDb() → DuckDB helpers (queryAll, queryOne, execute)
```

### Session system

All long-running operations (scans, scaffolding, chat, upgrades, auto-fix) go through the unified session system:

- **Session manager** (`src/lib/services/session-manager.ts`) — lifecycle management
- **Runners** (`src/lib/services/session-runners/`) — one factory per `SessionType`
- **API** — `POST /api/sessions` (create+start), `GET /api/sessions/[id]/stream` (SSE), `POST /api/sessions/[id]/cancel`
- **Client hook** — `useSessionStream()` in `src/hooks/use-session-stream.ts`

Do **not** create standalone streaming API routes. Add new operation types by:
1. Adding to the `SessionType` union in `src/lib/types.ts`
2. Creating a runner factory in `src/lib/services/session-runners/`
3. Registering it in `src/lib/services/session-runners/index.ts`

### Key directories

| Path | Purpose |
|------|---------|
| `src/app/` | Next.js App Router pages and API routes |
| `src/components/ui/` | shadcn/ui primitives (24 components) |
| `src/components/` | Feature-specific client components |
| `src/lib/actions/` | Server Actions (22 files, all DB access) |
| `src/lib/services/` | Business logic, scanners, auditors, runners |
| `src/lib/db/` | DuckDB connection, schema, seed, helpers |
| `src/lib/types.ts` | All domain type definitions |
| `src/lib/constants.ts` | Sentinel IDs, patterns, session config |
| `src/hooks/` | React hooks (session stream, auto-scroll, etc.) |

## Common Workflows

### Adding a new page

1. Create the server component at `src/app/<route>/page.tsx`
2. Create the client component at `src/components/<feature>/<feature>-client.tsx` with `"use client"`
3. Fetch data in the server component via Server Actions, pass as props to the client

### Adding a new API endpoint

Create a `route.ts` in `src/app/api/<path>/`. Use `params: Promise<{ id: string }>` for dynamic segments (Next.js 16 async params — must `await params`).

### Adding a shadcn/ui component

The project is configured via `components.json` with RSC support:

```bash
pnpm dlx shadcn@latest add <component-name>
```

Components are installed to `src/components/ui/`.

### Adding a new database table

1. Add the `CREATE TABLE IF NOT EXISTS` statement to `src/lib/db/schema.ts`
2. Add any indexes after the table creation
3. Define the TypeScript type in `src/lib/types.ts`
4. Create Server Actions in `src/lib/actions/` for CRUD operations
5. Restart the dev server — the table is created automatically

### Adding a new session runner

1. Add the new type to the `SessionType` union in `src/lib/types.ts`
2. Create `src/lib/services/session-runners/<type>.ts` exporting a runner factory
3. Register it in `src/lib/services/session-runners/index.ts`
4. The runner signature: `(ctx: { onProgress, signal, sessionId }) => Promise<{ result? }>`

## Troubleshooting

### DuckDB fails to start / WAL errors

```bash
pnpm db:reset
pnpm dev
```

Or just remove the WAL file: `rm ~/.gadget/data.duckdb.wal`

### Port 2000 already in use

```bash
lsof -ti:2000 | xargs kill -9
pnpm dev
```

### Native module build failures

DuckDB requires native compilation. Ensure you have:
- **macOS**: Xcode Command Line Tools (`xcode-select --install`)
- **Linux**: `build-essential` and `python3`

Then reinstall:

```bash
rm -rf node_modules
pnpm install
```

### Biome lint errors on commit

The pre-commit hook runs `biome check --write` automatically. If it fails:

```bash
pnpm lint:fix   # auto-fix what it can
pnpm lint       # see remaining issues
```

### Hot reload breaks database connection

The DuckDB connection is cached on `globalThis` to survive HMR. If you experience stale connection issues, restart the dev server.
