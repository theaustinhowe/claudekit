# Contributing to Gadget

Thanks for your interest in contributing to Gadget! This guide covers everything you need to get started developing locally.

## Prerequisites

| Requirement | Version | Notes |
|---|---|---|
| [Node.js](https://nodejs.org/) | >= 20 | Required by the ClaudeKit monorepo |
| [pnpm](https://pnpm.io/) | 9+ | Package manager (`corepack enable`) |
| [Git](https://git-scm.com/) | Any recent | Required for version control and repo scanning |
| [Claude CLI](https://docs.anthropic.com/en/docs/claude-code) | Optional | Required for AI-powered fixes and quick-improve sessions |

## Quick Start

Gadget is part of the ClaudeKit monorepo. From the monorepo root:

```bash
# 1. Install all dependencies
pnpm install

# 2. Configure environment
cp apps/gadget/.env.example apps/gadget/.env.local
# Edit .env.local -- see "Environment Variables" below

# 3. Start developing
pnpm dev:gadget   # -> http://localhost:2100
```

On first launch, the database is created automatically at `~/.gadget/data.duckdb`. Schema tables are initialized via numbered SQL migrations and built-in seed data (policies, concept sources) is inserted -- no manual setup required.

## Environment Variables

Copy `.env.example` to `.env.local` and configure as needed:

| Variable | Required | Description | Default |
|---|---|---|---|
| `MCP_API_TOKEN` | For MCP access | Bearer token for MCP API endpoints | -- |
| `DATABASE_PATH` | No | Override database file location | `~/.gadget/data.duckdb` |
| `GITHUB_PERSONAL_ACCESS_TOKEN` | For GitHub sync | GitHub API access for repo metadata and concept scanning | -- |

Additional optional API keys for MCP server integrations (Brave, Firecrawl, Notion, Sentry, Linear, Slack, etc.) are listed in `.env.example`. These are only needed if you configure the corresponding MCP server integrations.

## Scripts Reference

| Command | What It Does |
|---|---|
| `pnpm dev` | Start Next.js dev server at `http://localhost:2100` with hot reload |
| `pnpm build` | Production build -- runs TypeScript type-checking then builds the app |
| `pnpm lint` | Check for lint and formatting errors with Biome (read-only) |
| `pnpm lint:fix` | Auto-fix lint and formatting issues with Biome |
| `pnpm format` | Format all source files with Biome |
| `pnpm test` | Run test suite with Vitest |
| `pnpm seed` | Re-seed built-in data (policies, concept sources) |
| `pnpm db:reset` | Delete `~/.gadget/data.duckdb` and its WAL file for a fresh start |
| `pnpm knip` | Detect unused exports, dependencies, and files |

## Database

### How It Works

Gadget uses **DuckDB** as an embedded database via `@claudekit/duckdb` -- no external database server to install or manage. The database file lives at `~/.gadget/data.duckdb` (override with `DATABASE_PATH` env var).

Key implementation in `src/lib/db/`:

- **`index.ts`** -- Uses `createDatabase()` from `@claudekit/duckdb` with `useGlobalCache: true` to survive Next.js HMR. Runs numbered SQL migrations, reconciles orphaned sessions, auto-seeds on first run.
- **`migrations/001_initial.sql`** -- Defines 17 tables with indexes.
- **`seed.ts`** -- Inserts built-in policies and concept sources. Tracked by a `seeded_at` flag in the `settings` table to prevent re-seeding.

Query helpers (`queryAll`, `queryOne`, `execute`, `buildUpdate`, `withTransaction`, `checkpoint`, `parseJsonField`) are re-exported from `@claudekit/duckdb`.

### Schema Changes

Migrations are numbered `.sql` files in `src/lib/db/migrations/`. To add a migration, create a new file (e.g., `002_add_feature.sql`) and it will run automatically on startup.

### Resetting the Database

```bash
pnpm db:reset    # deletes the database
pnpm dev         # schema recreated automatically via migrations
```

### DuckDB Conventions

- Always get the connection with `const db = await getDb()`
- Use `?` placeholders in SQL (auto-converted to `$1, $2, ...`)
- JSON fields use native `JSON` type -- use `parseJsonField()` on read
- Timestamps use `TIMESTAMPTZ DEFAULT now()`
- Upserts: `INSERT INTO ... ON CONFLICT DO NOTHING` or `ON CONFLICT (key) DO UPDATE SET ...`
- Transactions: prefer `withTransaction(db, async (conn) => { ... })`

## Code Style and Conventions

### Formatting and Linting

This project uses [Biome](https://biomejs.dev/) for both linting and formatting (replaces ESLint + Prettier). Config in `biome.json`:

- 2-space indentation
- 120 character line width
- Double quotes
- Semicolons required
- Trailing commas

### Common Biome Pitfalls

- **Import ordering**: Type imports must come before namespace imports from the same module.
- **No non-null assertions** (`!`): Extract to a variable with a null check instead.
- **Unused parameters**: Remove unused function parameters from destructuring entirely.
- **`useExhaustiveDependencies`**: For array dependencies in hooks, use `.length` instead of the array reference.

### Naming Conventions

| Type | Convention | Examples |
|---|---|---|
| Files | kebab-case | `dashboard-client.tsx`, `concept-sources.ts` |
| Components | PascalCase | `DashboardClient`, `EmptyState` |
| Functions/variables | camelCase | `getRepos`, `repoId` |
| Types/interfaces | PascalCase | `Repo`, `Finding`, `ScanStatus` |
| Constants | UPPER_SNAKE_CASE | `LIBRARY_REPO_ID`, `DEFAULT_EXCLUDE_PATTERNS` |
| Session runners | kebab-case files | `quick-improve.ts` for `quick_improve` |

### Import Conventions

- Always use the `@/` path alias (maps to `src/`). Never use relative paths like `../../lib/db`.
- Use `import type { ... }` for type-only imports.
- Shared packages use `@claudekit/*` imports (e.g., `@claudekit/duckdb`, `@claudekit/session`).

## Project Structure

### Server/Client Split

Every page follows the same pattern:

1. **Server Component** (`src/app/**/page.tsx`) -- async function, fetches data via Server Actions, passes as props
2. **Client Component** (`src/components/*/**-client.tsx`) -- receives data via props, uses `"use client"` directive

### Key Directories

| Directory | Purpose |
|---|---|
| `src/app/` | Next.js App Router pages and API routes |
| `src/components/ui/` | Local shadcn/ui component (empty-state) |
| `src/components/` | Feature-specific components |
| `src/components/sessions/` | Session management UI (badge, panel, indicator, context) |
| `src/lib/actions/` | Server Actions (`"use server"`) -- all DB access goes through here (15 files) |
| `src/lib/services/` | Business logic (scanning, auditing, fixing, etc.) |
| `src/lib/services/session-runners/` | Session runner implementations (6 types) |
| `src/lib/db/` | DuckDB init, migrations, seed data |
| `src/lib/types.ts` | All domain types |
| `src/lib/constants.ts` | Sentinel IDs, discovery patterns, labels |

### Session System Architecture

All long-running operations (scanning, finding-fix, quick-improve, etc.) are unified under `@claudekit/session`.

**Session types:** `scan`, `quick_improve`, `finding_fix`, `fix_apply`, `ai_file_gen`, `cleanup`

**Adding a new session runner:**

1. Add the session type to `SessionType` in `src/lib/types.ts`
2. Add a label in `SESSION_TYPE_LABELS` in `src/lib/constants.ts`
3. Create a runner file in `src/lib/services/session-runners/`
4. Register it in `src/lib/services/session-runners/index.ts`

## Development Workflows

### Adding a New Page

1. Create a Server Component at `src/app/your-page/page.tsx` -- fetch data via Server Actions
2. Create a Client Component at `src/components/your-page/your-page-client.tsx` with `"use client"`
3. Pass fetched data as props from the server component to the client component
4. Add navigation link in the layout

### Adding a New Server Action

1. Create or edit a file in `src/lib/actions/` with `"use server"` at the top
2. Get the DB connection: `const db = await getDb()`
3. Use `queryAll<T>()`, `queryOne<T>()`, or `execute()` for queries
4. Use `?` placeholders for parameters -- never string interpolation

### Adding a New API Route

1. Create `src/app/api/your-route/route.ts`
2. Export named functions (`GET`, `POST`, `PUT`, `DELETE`)
3. For routes with path params, use `params: Promise<{ id: string }>` and `await params`

## Testing

Tests use [Vitest](https://vitest.dev/). Test files are colocated with source using `*.test.ts` naming.

```bash
pnpm test              # run all tests
pnpm test -- --watch   # watch mode
```

## Pull Request Process

1. **Create a branch** from `main`
2. **Make your changes** following the conventions above
3. **Verify all checks pass:**

   ```bash
   pnpm lint          # no lint or formatting errors
   pnpm build         # production build succeeds (includes type-check)
   pnpm test          # all tests pass
   pnpm knip          # no unused exports or dependencies introduced
   ```

4. **Open a pull request** against `main`

### PR Checklist

- [ ] `pnpm lint` passes with no errors
- [ ] `pnpm build` succeeds
- [ ] `pnpm test` passes
- [ ] `pnpm knip` reports no new unused exports/dependencies
- [ ] New Server Actions use `"use server"` and go through `getDb()`
- [ ] New pages follow the server component + client component split
- [ ] New streaming operations use the session runner pattern (not standalone routes)
- [ ] No hardcoded secrets or credentials
- [ ] SQL queries use parameterized `?` placeholders
- [ ] New domain types are added in `src/lib/types.ts`

## Troubleshooting

### Dev server crashes on startup with DuckDB errors

Usually caused by a corrupt WAL file:

```bash
rm ~/.gadget/data.duckdb.wal
pnpm dev
```

For a full reset:

```bash
pnpm db:reset
pnpm dev
```

### Port 2100 already in use

```bash
lsof -ti:2100 | xargs kill -9
pnpm dev
```
