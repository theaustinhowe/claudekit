# Contributing to Gadget

Thanks for your interest in contributing to Gadget! This guide covers everything you need to get started developing locally.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Environment Variables](#environment-variables)
- [Scripts Reference](#scripts-reference)
- [Database](#database)
- [Code Style and Conventions](#code-style-and-conventions)
- [Project Structure](#project-structure)
- [Development Workflows](#development-workflows)
- [Security Guidelines](#security-guidelines)
- [Testing](#testing)
- [Pull Request Process](#pull-request-process)
- [Troubleshooting](#troubleshooting)
- [Getting Help](#getting-help)

## Prerequisites

| Requirement | Version | Notes |
|---|---|---|
| [Node.js](https://nodejs.org/) | >= 22 | Pinned in `.nvmrc` — run `nvm use` to switch |
| [pnpm](https://pnpm.io/) | Latest | Package manager (`npm install -g pnpm` or `corepack enable`) |
| [Git](https://git-scm.com/) | Any recent | Required for version control and repo scanning |
| [Claude CLI](https://docs.anthropic.com/en/docs/claude-code) | Optional | Required for AI-powered scaffolding, auto-fix, and finding fixes |

### Platform Notes

- **macOS / Linux**: Fully supported. DuckDB native binaries compile during `pnpm install` via `@duckdb/node-bindings`.
- **Windows**: Not tested. DuckDB and Playwright native bindings may need additional setup.
- The `pnpm.onlyBuiltDependencies` field in `package.json` allowlists native packages (`@duckdb/node-bindings`, `esbuild`, `playwright`, `sharp`, `unrs-resolver`) so they compile correctly.

## Quick Start

```bash
# 1. Clone and install
git clone https://github.com/theaustinhowe/gadget.git
cd gadget
nvm use          # switch to Node 22 (from .nvmrc)
pnpm install

# 2. Configure environment
cp .env.local.example .env.local
# Edit .env.local — see "Environment Variables" below

# 3. Start developing
pnpm dev         # → http://localhost:2000
```

On first launch, the database is created automatically at `~/.gadget/data.duckdb`. Schema tables are initialized and built-in seed data (policies, templates, fix packs, concept sources) is inserted — no manual setup required.

## Environment Variables

Copy `.env.local.example` to `.env.local` and configure as needed:

| Variable | Required | Description | Default |
|---|---|---|---|
| `MCP_API_TOKEN` | For MCP access | Bearer token for MCP API endpoints | — |
| `DB_PATH` | No | Override database file location | `~/.gadget/data.duckdb` |
| `ANTHROPIC_API_KEY` | For AI features | Powers project generator and design chat | — |
| `GITHUB_PERSONAL_ACCESS_TOKEN` | For GitHub sync | GitHub API access for repo metadata and concept scanning | — |

Additional optional API keys for MCP server integrations (Brave, Firecrawl, Notion, Sentry, Linear, Slack, etc.) are listed in `.env.local.example`. These are only needed if you configure the corresponding MCP server integrations.

## Scripts Reference

| Command | What It Does |
|---|---|
| `pnpm dev` | Start Next.js dev server at `http://localhost:2000` with hot reload |
| `pnpm build` | Production build — runs TypeScript type-checking then builds the app |
| `pnpm start` | Start production server at port 2000 (run `pnpm build` first) |
| `pnpm lint` | Check for lint and formatting errors with Biome (read-only) |
| `pnpm lint:fix` | Auto-fix lint and formatting issues with Biome |
| `pnpm format` | Format all source files with Biome |
| `pnpm test` | Run test suite with Vitest |
| `pnpm seed` | Re-seed built-in data (policies, templates, fix packs, concept sources) |
| `pnpm db:reset` | Delete `~/.gadget/data.duckdb` and its WAL file for a fresh start |
| `pnpm knip` | Detect unused exports, dependencies, and files |

## Database

### How It Works

Gadget uses **DuckDB** as an embedded database — no external database server to install or manage. The database file lives at `~/.gadget/data.duckdb` (override with `DB_PATH` env var).

Key implementation details in `src/lib/db/`:

- **`index.ts`** — Singleton `DuckDBInstance` + `DuckDBConnection` cached on `globalThis` to survive Next.js HMR. Lazy async initialization with promise deduplication. Registers shutdown handlers for clean connection closure.
- **`helpers.ts`** — Query helpers (`queryAll`, `queryOne`, `execute`, `checkpoint`, `withTransaction`, `buildUpdate`). Converts `?` placeholders to DuckDB's `$1, $2, ...` positional format. All DB operations are serialized through an async mutex since DuckDB doesn't support concurrent prepared statements on a single connection.
- **`schema.ts`** — Defines 32 tables with `CREATE TABLE IF NOT EXISTS`. Auto-seeds on first run.
- **`seed.ts`** — Inserts built-in policies, fix packs, templates, policy templates, custom rules, and concept sources. Tracked by a `seeded_at` flag in the `settings` table to prevent re-seeding.

### Schema Changes

There is no migrations system. All tables use `CREATE TABLE IF NOT EXISTS` in `schema.ts`. For breaking schema changes:

```bash
pnpm db:reset    # deletes the database
pnpm dev         # schema recreated automatically
```

For additive changes (new tables, new columns with defaults), add them directly to `schema.ts`. For destructive changes (renaming columns, changing types), `pnpm db:reset` is required.

### Startup Behavior

When the dev server starts and the first database connection is made:

1. Directory `~/.gadget/` is created if missing
2. DuckDB database file is opened (WAL corruption auto-recovery: removes `.wal` file and retries)
3. WAL auto-checkpoint is set to 256KB (lower than default 16MB for a local tool)
4. All schema tables and indexes are created (`CREATE TABLE IF NOT EXISTS`)
5. Orphaned scans and sessions stuck in `running`/`pending` state are marked as `error`
6. Old session logs (>7 days) and old sessions (>30 days) are pruned
7. Built-in data is seeded (only on first run)

### Resetting the Database

```bash
pnpm db:reset    # deletes ~/.gadget/data.duckdb and .wal file
pnpm dev         # schema + seed data recreated automatically
```

### Re-seeding Without Reset

To re-insert built-in data without deleting existing data:

```bash
pnpm seed        # runs tsx src/lib/db/seed.ts
```

This uses `ON CONFLICT DO NOTHING`, so existing records are preserved.

### DuckDB Conventions

- Always get the connection with `const db = await getDb()`
- Use `?` placeholders in SQL (auto-converted to `$1, $2, ...`)
- `queryOne<T>()` returns `T | undefined` (not `T | null`) — wrap with `?? null` when a null return is needed
- `GROUP BY` must list ALL non-aggregated columns (unlike SQLite)
- Use `BOOLEAN` columns (not `INTEGER 0/1`)
- Timestamps: `CAST(current_timestamp AS VARCHAR)`
- Upserts: `INSERT INTO ... ON CONFLICT DO NOTHING` or `ON CONFLICT (key) DO UPDATE SET ...`
- JSON fields stored as `TEXT` — use `JSON.parse()` on read, `JSON.stringify()` on write
- Transactions: prefer `withTransaction(db, async (conn) => { ... })` from `@/lib/db/helpers` over manual `BEGIN`/`COMMIT`/`ROLLBACK`
- Do not bypass the mutex by calling `conn.prepare()` directly — always use the helpers

**Common SQLite-isms that fail in DuckDB:**

| Wrong (SQLite) | Correct (DuckDB) |
|---|---|
| `INSERT OR IGNORE INTO ...` | `INSERT INTO ... ON CONFLICT DO NOTHING` |
| `INSERT OR REPLACE INTO ...` | `INSERT INTO ... ON CONFLICT (key) DO UPDATE SET ...` |
| `datetime('now')` | `CAST(current_timestamp AS VARCHAR)` |
| `INTEGER` for booleans (0/1) | `BOOLEAN DEFAULT false` |

## Code Style and Conventions

### Formatting and Linting

This project uses [Biome](https://biomejs.dev/) for both linting and formatting (replaces ESLint + Prettier). Config in `biome.json`:

- 2-space indentation
- 120 character line width
- Double quotes
- Semicolons required
- Trailing commas

[Husky](https://typicode.github.io/husky/) + [lint-staged](https://github.com/lint-staged/lint-staged) run `biome check --write` automatically on every commit, so formatting is enforced before code reaches the repo.

```bash
pnpm lint        # check only (CI-friendly)
pnpm lint:fix    # check + auto-fix
```

### Common Biome Pitfalls

- **Import ordering**: Type imports must come before namespace imports from the same module. Use `import type { X }` for type-only imports.
- **No non-null assertions** (`!`): Extract to a variable with a null check instead.
- **Unused parameters**: Remove unused function parameters from destructuring entirely. Biome treats these as errors — do not prefix with `_`.
- **`useExhaustiveDependencies`**: For array dependencies in hooks, use `.length` instead of the array reference. Add `// biome-ignore` comments only when truly necessary, always with an explanation.

### Naming Conventions

| Type | Convention | Examples |
|---|---|---|
| Files | kebab-case | `dashboard-client.tsx`, `concept-sources.ts` |
| Components | PascalCase | `DashboardClient`, `EmptyState` |
| Functions/variables | camelCase | `getRepos`, `repoId` |
| Types/interfaces | PascalCase | `Repo`, `Finding`, `ScanStatus` |
| Constants | UPPER_SNAKE_CASE | `LIBRARY_REPO_ID`, `DEFAULT_EXCLUDE_PATTERNS` |
| Session runners | kebab-case files matching session type | `quick-improve.ts` for `quick_improve` |
| Hooks | `use-` prefix, kebab-case files | `use-session-stream.ts` |

### Import Conventions

- Always use the `@/` path alias (maps to `src/`). Never use relative paths like `../../lib/db`.
- Use `import type { ... }` for type-only imports.
- Preferred import order: Node built-ins → external packages → Next.js → internal `@/components` → `@/lib` → types → utils.

### TypeScript

- Strict mode enabled in `tsconfig.json`
- Domain types live in `src/lib/types.ts` — add new types there, not in component files
- IDs: `generateId()` from `@/lib/utils` (wraps `crypto.randomUUID()`)
- Timestamps: `nowTimestamp()` from `@/lib/utils` (returns `new Date().toISOString()`)
- Use `cn()` from `@/lib/utils` for Tailwind class merging — don't use raw string concatenation for conditional classes
- `as const` arrays cause type errors when passed to functions expecting `string[]` — use explicit `string[]` type annotation instead
- Always narrow caught errors: `err instanceof Error ? err.message : String(err)` — never use bare `err.message`
- Use `async import()` for dynamic imports in services, not `require()`

### Sentinel IDs and Constants

Sentinel IDs (`LIBRARY_REPO_ID`, `CURATED_SOURCE_ID`, `CLAUDE_CONFIG_SOURCE_ID`), discovery patterns, and session configuration constants are defined in `src/lib/constants.ts`. Always reference the constant — never inline the string value.

## Project Structure

### Server/Client Split

Every page follows the same pattern:

1. **Server Component** (`src/app/**/page.tsx`) — async function, fetches data via Server Actions, passes as props
2. **Client Component** (`src/components/*/**-client.tsx`) — receives data via props, uses `"use client"` directive

**Do:**
- Fetch data in server components via Server Actions, pass as props
- Import Server Actions in client components from `"use server"` files

**Don't:**
- Call `getDb()` or import from `@/lib/db` in client components
- Use `useState`, `useEffect`, or event handlers in server components
- Fetch data in `useEffect` instead of server component props

### Key Directories

| Directory | Purpose |
|---|---|
| `src/app/` | Next.js App Router pages and API routes |
| `src/components/ui/` | shadcn/ui primitives — do not edit directly, use `npx shadcn@latest add` |
| `src/components/` | Feature-specific components |
| `src/components/sessions/` | Session management UI (badge, panel, terminal, context) |
| `src/lib/actions/` | Server Actions (`"use server"`) — all DB access goes through here |
| `src/lib/services/` | Business logic (scanning, auditing, fixing, generating, etc.) |
| `src/lib/services/session-runners/` | Session runner implementations (one per operation type) |
| `src/lib/db/` | DuckDB connection, helpers, schema, seed data |
| `src/lib/types.ts` | All domain types |
| `src/lib/constants.ts` | Sentinel IDs, discovery patterns, labels, session config |
| `src/lib/utils.ts` | `cn()`, `generateId()`, `nowTimestamp()`, `parsePolicy()`, etc. |
| `src/hooks/` | React hooks |

### Session System Architecture

All long-running operations (scanning, scaffolding, auto-fix, chat, upgrades, etc.) are unified under a single session management system rather than having separate streaming endpoints per feature.

**How it works:**

1. **Session runners** (`src/lib/services/session-runners/`) — 12 runner implementations, one per operation type: `scan`, `scaffold`, `chat`, `auto-fix`, `finding-fix`, `fix-apply`, `quick-improve`, `upgrade`, `upgrade-init`, `ai-file-gen`, `cleanup`, `toolbox-command`
2. **Session manager** (`src/lib/services/session-manager.ts`) — manages in-memory live sessions (cached on `globalThis` for HMR), handles fan-out event broadcasting to SSE subscribers, batches log persistence, and manages process lifecycle (PID tracking, cleanup functions)
3. **Session API** (`src/app/api/sessions/`) — REST endpoints for creating, streaming (SSE with replay), and cancelling sessions
4. **Session UI** (`src/components/sessions/`) — React context, status badges, sliding panel, and terminal display

**Session lifecycle:**

1. Client calls `POST /api/sessions` with a session type and context
2. Session record is created (status: `pending`), then transitions to `running`
3. The appropriate runner is spawned and streams events via `onProgress` callback
4. Events fan out to all SSE subscribers and are batched for DB persistence (every 2s)
5. Terminal event (`done` / `error` / `cancelled`) closes the stream
6. Completed sessions can be replayed from persisted logs

**Adding a new session runner:**

1. Add the session type to `SessionType` in `src/lib/types.ts`
2. Add a label in `SESSION_TYPE_LABELS` in `src/lib/constants.ts`
3. Create a runner file in `src/lib/services/session-runners/` implementing the `SessionRunner` interface
4. Register it in `src/lib/services/session-runners/index.ts`

**Session runner requirements:**
- Check `signal.aborted` for cancellation support
- Emit progress via `onProgress()` — event types: `progress`, `log`, `done`, `error`, `cancelled`, `heartbeat`, `init`
- Use `setCleanupFn()` for resource cleanup (e.g., git worktree removal) on cancel/error
- Use `setSessionPid()` to track child process IDs for killability

### Next.js 16 Specifics

- **Async params**: Page params are `Promise<{ paramName: string }>` and must be awaited before use:
  ```typescript
  export default async function Page({ params }: { params: Promise<{ repoId: string }> }) {
    const { repoId } = await params;
    // ...
  }
  ```
- **Root layout**: `src/app/layout.tsx` uses `export const dynamic = "force-dynamic"` because DuckDB pages cannot be statically prerendered. Do not remove this.
- **Motion SSR safety**: Motion (Framer Motion) components cause SSR errors. Wrap animated components with `next/dynamic` and `ssr: false` when used in layout-level components.
- **`usePathname()` nullability**: Returns `string | null` in Next.js 16 — always use optional chaining (e.g., `pathname?.startsWith(...)` not `pathname.startsWith(...)`).
- **`serverExternalPackages`**: `@duckdb/node-api`, `@duckdb/node-bindings`, and `playwright` are excluded from bundling in `next.config.ts`. Do not remove these entries.

### UI Stack

- **shadcn/ui** components in `src/components/ui/` (configured via `components.json`, RSC-enabled)
- **Tailwind CSS v4** via `@tailwindcss/postcss` plugin
- **Design tokens** in `src/app/globals.css` — HSL CSS custom properties for light/dark themes, plus semantic colors (`success`, `warning`, `info`) and sidebar theme tokens
- **Motion** (Framer Motion v12) for animations
- **Lucide** for icons
- **next-themes** for dark/light/system theme switching
- **Sonner** for toast notifications (`toast()` — `<Toaster />` is in the root layout, don't add duplicates)
- **Shiki** for syntax highlighting
- **`<EmptyState>`** component (`@/components/ui/empty-state`) for empty data states — use it instead of bare "no data" text

### globalThis Singletons

Both the DuckDB connection (`src/lib/db/index.ts`) and session manager (`src/lib/services/session-manager.ts`) use `globalThis` caching to survive Next.js HMR. Any new module-level singleton should follow this same pattern — plain module-level state will be lost during hot reloads in development.

## Development Workflows

### Adding a New Page

1. Create a Server Component at `src/app/your-page/page.tsx` — fetch data via Server Actions
2. Create a Client Component at `src/components/your-page/your-page-client.tsx` with `"use client"`
3. Pass fetched data as props from the server component to the client component
4. Add navigation link in the sidebar (`src/components/layout/`)

### Adding a New Server Action

1. Create or edit a file in `src/lib/actions/` with `"use server"` at the top
2. Get the DB connection: `const db = await getDb()`
3. Use `queryAll<T>()`, `queryOne<T>()`, or `execute()` for queries
4. Use `?` placeholders for parameters — never string interpolation

### Adding a New API Route

1. Create `src/app/api/your-route/route.ts`
2. Export named functions (`GET`, `POST`, `PUT`, `DELETE`)
3. For routes with path params, use `params: Promise<{ id: string }>` and `await params`

### Adding a New Database Table

1. Add the `CREATE TABLE IF NOT EXISTS` statement in `src/lib/db/schema.ts`
2. Add indexes below the existing ones in the same file
3. Add the TypeScript type in `src/lib/types.ts`
4. Add seed data in `src/lib/db/seed.ts` if needed
5. Run `pnpm db:reset` then `pnpm dev` to recreate the database with the new schema

### Adding a shadcn/ui Component

```bash
npx shadcn@latest add <component-name>
```

Do not manually edit files in `src/components/ui/` — they are generated by the shadcn CLI.

### Using parsePolicy() for DB Rows

Policy rows from the database contain JSON text fields that need parsing. Always use `parsePolicy()` from `@/lib/utils` rather than manually calling `JSON.parse` on individual policy fields.

### Debugging Database Issues

```bash
# Full reset — deletes all data
pnpm db:reset && pnpm dev

# Check if WAL file is stale (can cause startup failures)
ls -la ~/.gadget/data.duckdb*

# The app auto-recovers from WAL corruption on startup,
# but you can manually remove the WAL:
rm ~/.gadget/data.duckdb.wal
```

## Security Guidelines

- **SQL injection**: All queries must use `?` placeholder parameters. Never use string interpolation in SQL. The only exception is `buildUpdate()` in `helpers.ts`, which validates column names via `SAFE_SQL_IDENTIFIER` regex.
- **Command injection**: Services that execute shell commands (`claude-runner.ts`, `process-runner.ts`, `tool-checker.ts`, `dev-server-manager.ts`) use `spawn()` with argument arrays, not shell strings. Maintain this pattern — never pass user input directly to shell execution without sanitization.
- **Error messages**: Server Actions and API routes should return generic error messages to the client. Don't leak stack traces, file paths, or internal details.
- **Error type checking**: Always narrow caught errors: `err instanceof Error ? err.message : String(err)`.
- **File paths**: Expand user-provided paths with `expandTilde()` from `@/lib/utils`. Don't pass raw `~` to `fs` operations. Guard against path traversal.
- **Sensitive data**: GitHub PATs are encrypted with AES-256-GCM (format: `iv:authTag:ciphertext` hex-encoded) before storage. Never store tokens in plain text or log them.
- **Environment variables**: Sensitive values (`MCP_API_TOKEN`, `GITHUB_PERSONAL_ACCESS_TOKEN`) must come from `.env.local`, never hardcoded.
- **Security headers**: `next.config.ts` configures X-Content-Type-Options, X-Frame-Options, Referrer-Policy, and Permissions-Policy. Don't weaken these.
- **AbortSignal handling**: Session runners and streaming endpoints must check `signal.aborted` before spawning child processes and kill child processes when the signal fires. Don't leave dangling promises after abort.

## Testing

Tests use [Vitest](https://vitest.dev/) (v4). No separate config file — Vitest uses its defaults with the project's `tsconfig.json`.

```bash
pnpm test              # run all tests
pnpm test -- --watch   # watch mode
pnpm test -- --run     # single run (CI-friendly, no watch)
```

### Guidelines

- Place test files alongside the code they test using `*.test.ts` or `*.test.tsx` naming
- Use `describe`/`it` blocks with clear descriptions
- Test service logic and utility functions — these are the most testable parts of the codebase
- Server Actions that depend on DuckDB will need the database available (integration-style tests)
- Session runners should be testable in isolation — avoid hard dependencies on global state beyond what the `SessionRunner` interface provides
- Do not remove existing tests without justification

### What to Test

- Server Actions with complex logic
- Utility functions (`src/lib/utils.ts`)
- Service functions (scanners, auditors, fix planners)
- Session runners (in isolation via their `SessionRunner` interface)

## Pull Request Process

1. **Create a branch** from `main`:

   ```bash
   git checkout -b your-feature-name
   ```

2. **Make your changes** following the conventions above.

3. **Verify all checks pass:**

   ```bash
   pnpm lint          # no lint or formatting errors
   pnpm build         # production build succeeds (includes type-check)
   pnpm test          # all tests pass
   pnpm knip          # no unused exports or dependencies introduced
   ```

4. **Commit your changes.** Husky will auto-format staged files via `biome check --write` on commit.

5. **Open a pull request** against `main`. In your PR description:
   - Describe what the change does and why
   - Note any new dependencies added and the rationale
   - Include screenshots for UI changes
   - Call out any database schema changes (requires `pnpm db:reset`)

6. **Address review feedback** and keep the PR up to date with `main`.

### PR Checklist

- [ ] `pnpm lint` passes with no errors
- [ ] `pnpm build` succeeds
- [ ] `pnpm test` passes
- [ ] `pnpm knip` reports no new unused exports/dependencies
- [ ] New Server Actions use `"use server"` and go through `getDb()`
- [ ] New pages follow the server component + client component split
- [ ] New streaming operations use the session runner pattern (not standalone routes)
- [ ] Database schema changes are in `src/lib/db/schema.ts` (with `pnpm db:reset` documented if breaking)
- [ ] No hardcoded secrets or credentials
- [ ] SQL queries use parameterized `?` placeholders
- [ ] New domain types are added in `src/lib/types.ts` (not scattered in component files)
- [ ] Constants and sentinel IDs reference `src/lib/constants.ts` (not inline strings)

## Troubleshooting

### `pnpm install` fails with native module errors

DuckDB requires native compilation. Make sure you're on Node 22+ and try:

```bash
pnpm install --force
```

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

### Biome errors on commit

Husky runs `biome check --write` on staged files. If the auto-fix changes the file, you may need to re-stage:

```bash
git add -u
git commit
```

Or run the fix manually first:

```bash
pnpm lint:fix
git add -u
git commit
```

### Port 2000 already in use

Kill the existing process:

```bash
lsof -ti:2000 | xargs kill -9
pnpm dev
```

### `as const` type errors

If an `as const` array causes type errors when passed to a function expecting `string[]`, add an explicit type annotation:

```typescript
// Error: readonly ["a", "b"] is not assignable to string[]
const items = ["a", "b"] as const;

// Fix: use explicit typing
const items: string[] = ["a", "b"];
```

## Getting Help

If you have questions or run into issues, open a GitHub issue on the repository.
