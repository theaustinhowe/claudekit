# Copilot Instructions — ClaudeKit Monorepo

## Project Overview

ClaudeKit is a **pnpm workspace monorepo** with 8 Next.js/Fastify apps and 12 shared packages. All apps are local-first developer tools (not SaaS). The stack is **Next.js 16 App Router**, **DuckDB** for persistence, **Tailwind CSS v4**, and **Biome** for linting/formatting.

## Code Review Standards

### Must Check

- Every PR must pass `pnpm check` (typecheck + lint + test:coverage + build)
- TypeScript strict mode is enabled — no `any` types without justification
- All shared package changes must be verified against consuming apps
- Server Actions must include `"use server"` directive at the top of the file
- DuckDB queries must use parameterized `?` placeholders — never string interpolation for SQL values

### Formatting and Style (Biome)

- **2-space indentation**, **double quotes**, **semicolons**, **trailing commas**
- **120 character line width**
- Imports must be sorted (Biome enforces this — type imports before namespace imports from the same module)
- No ESLint or Prettier — this project uses Biome exclusively

### Code Quality Flags

- Flag non-null assertions (`!`) — extract to a variable with a proper check instead
- Flag unused function parameters — remove them from destructuring
- Flag `useEffect` with missing or incorrect dependency arrays — use `.length` for array deps, not the array reference
- Flag `console.log` left in production code — use `@claudekit/logger` for structured logging
- Flag direct DuckDB connection access — always go through `getDb()` and query helpers (`queryAll`, `queryOne`, `execute`)

## Naming Conventions

### Files

- **Pages**: `page.tsx` (server component), companion `*-client.tsx` (client component)
- **Server Actions**: `src/lib/actions/*.ts` with `"use server"` directive
- **Services**: `src/lib/services/*.ts` for business logic
- **Types**: `src/lib/types.ts` for all domain types in an app
- **Constants**: `src/lib/constants.ts` for magic values, labels, config
- **Tests**: co-located as `*.test.ts` next to the source file
- **Migrations**: numbered SQL files in `migrations/` directories (e.g., `001_initial.sql`)

### Code

- **React components**: PascalCase (`SessionPanel`, `LogViewer`)
- **Functions and variables**: camelCase (`getSessionRecord`, `isRunning`)
- **Database columns**: snake_case (`created_at`, `job_id`)
- **CSS custom properties**: kebab-case HSL variables (`--primary`, `--sidebar-background`)
- **Package imports**: `@claudekit/package-name` (e.g., `@claudekit/ui`, `@claudekit/duckdb`)
- **Path aliases**: `@/` maps to `src/` in all Next.js apps

### UI Components

- Import from `@claudekit/ui/components/component-name` (direct path, not barrel)
- Use `cn()` from `@claudekit/ui` for conditional class names (clsx + tailwind-merge)
- Components use Base UI primitives (`@base-ui/react`), not Radix UI

## Architecture Patterns

### Server/Client Split (Next.js)

Every page must follow:
1. **Server Component** (`page.tsx`) — fetches data via Server Actions, passes as props
2. **Client Component** (`*-client.tsx`) — receives data, handles interactivity with `"use client"`

Flag violations where client components call the database directly or server components use React hooks.

### DuckDB Usage

- Connection is `globalThis`-cached to survive Next.js HMR — always use `createDatabase()` or `getDb()`
- All queries go through the async mutex (DuckDB doesn't support concurrent prepared statements on one connection)
- Use `withTransaction()` for multi-statement operations
- DuckDB-specific SQL: `INSERT ... ON CONFLICT DO NOTHING` (not `INSERT OR IGNORE`), `BOOLEAN` type (not INTEGER 0/1), `CAST(current_timestamp AS VARCHAR)` (not `datetime('now')`)
- `queryOne<T>()` returns `T | undefined`, not `T | null`

### Session System

- All long-running operations must go through `@claudekit/session` — do not create standalone streaming routes
- New operation types require: `SessionType` union update, runner factory, registry entry, label constant

### State Machine (GoGo Orchestrator)

- All job status changes must use `applyTransitionAtomic()` — never update job status directly
- State transitions are wrapped in DB transactions (job update + event creation)

## Testing Requirements

- **Framework**: Vitest with V8 coverage provider
- **Coverage thresholds** vary by workspace:
  - Shared packages: 40–50% minimum (statements/branches/functions/lines)
  - `@claudekit/session`, `@claudekit/hooks`: 80–90% minimum
  - Apps: 50–65% minimum
- Tests must be co-located with source files (`*.test.ts`)
- Coverage excludes test files, type declarations, and barrel index files
- Flag PRs that reduce coverage below the configured thresholds in `vitest.config.ts`

## Security Considerations

### SQL Injection

- All database queries must use parameterized placeholders (`?`) — never concatenate user input into SQL strings
- The `buildUpdate()` and `buildInClause()` helpers handle parameterization automatically — use them

### Secrets and Tokens

- GitHub PATs are encrypted at rest with AES-256-GCM (`services/encryption.ts`)
- Environment variables for API keys (MCP tokens, GitHub PATs) must never be logged or returned in API responses
- Bearer token authentication is required on all GoGo Orchestrator REST routes

### Next.js Security

- Security headers are configured in `next.config.ts` (X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy) — flag any removal
- `@duckdb/node-api` must be in `serverExternalPackages` — flag if removed (causes build failures and potential data exposure)
- Server Actions are the only authorized way to access the database from Next.js pages

### Process Spawning

- All CLI process spawning must support `AbortSignal` for cancellation
- Track spawned process PIDs for cleanup on crash recovery
- Never pass unsanitized user input to `child_process.spawn` or shell commands

### File System

- File operations in the apply engine use atomic write (write to temp, then rename) — flag direct writes to target paths
- Database files are stored in user-specific directories (`~/.gadget/`, `~/.inspector/`, etc.)

## Common Pitfalls to Flag

### DuckDB

- Using `require()` instead of `await import()` for dynamic imports in services
- Missing `await` on `getDb()` — it's async
- Using `GROUP BY` without listing all non-aggregated columns (DuckDB is strict)
- Forgetting WAL recovery — `createDatabase()` handles this, direct connections don't

### Next.js

- Not awaiting `params` in page components — Next.js 16 uses `params: Promise<{ id: string }>`
- Missing `export const dynamic = "force-dynamic"` on layouts that use DuckDB (can't statically prerender)
- Using `ssr: true` with Motion (Framer Motion) components — causes hydration mismatches
- Importing `@duckdb/node-api` in client components — it's server-only

### React

- Using array references in `useEffect` dependency arrays instead of `.length`
- Missing cleanup in `useEffect` for SSE/EventSource connections
- Not using `next/dynamic` with `ssr: false` for components that use browser-only APIs

### TypeScript

- Using `as const` arrays without explicit `string[]` typing when passed to functions expecting mutable arrays
- Non-null assertions (`!`) instead of proper narrowing
- Missing generic type parameters on `queryAll<T>()` and `queryOne<T>()` calls

### Monorepo

- Modifying a shared package without checking all consumers (`grep -r "@claudekit/package-name" apps/`)
- Adding dependencies to the wrong `package.json` (workspace root vs app vs package)
- Forgetting to add native packages to `pnpm.onlyBuiltDependencies` in the root `package.json`
