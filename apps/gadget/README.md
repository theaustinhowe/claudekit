# Gadget

Your local dev tool hub for auditing, generating, and managing projects.

Gadget is a local-first developer tool that scans your repositories against customizable policies, generates automated fix plans with file diffs, and provides a visual editor for Claude Code configuration. Built with Next.js 16, DuckDB, and shadcn/ui — it runs entirely on your machine with zero external dependencies.

## Features

### Repository Scanning

Walks your filesystem to discover Git repositories. Detects package managers (npm, pnpm, yarn, bun), identifies repo types (Next.js, Node, React, library, monorepo, TanStack), and recognizes monorepo indicators like pnpm workspaces and Turborepo.

### Policy-Based Auditing

Define policies with expected dependency versions, banned dependencies (with suggested replacements), and allowed package managers. Four built-in auditors analyze dependencies, AI instruction files, project structure, and custom rules. Ships with 5 policies: Next.js App Standard, Node.js Service, Library/Package, Monorepo, and TanStack App.

### Automated Fix Planning

Generates fix actions with before/after file diffs, risk assessment (low/medium/high), and impact categorization (docs, config, dependencies, structure). Review changes in a syntax-highlighted diff viewer before applying.

### Fix Application

Applies fixes atomically — writes to temp files then renames. Creates snapshots before every change with full rollback support.

### Session-Based Execution

Long-running operations run through a unified session system (via `@claudekit/session`) with real-time SSE streaming, cancellation support, and persistent history. Six session types: scan, quick-improve, finding-fix, fix-apply, AI file generation, and cleanup.

### AI Integrations

Discover and install AI integrations from multiple sources — local repos, GitHub repos, curated lists, and Claude configs. Browse and manage Skills, Hooks, Commands, Agents, MCP Servers, and Plugins in a unified patterns library.

### Claude Config Editor

Visual editor for `.claude/settings.local.json` — edit environment variables, permission rules, and MCP server configurations through a structured UI instead of raw JSON.

### Claude Usage Monitoring

Track Claude CLI rate limits via `@claudekit/claude-usage`. Displays five-hour and seven-day usage windows with per-model breakdowns.

### Reports

Export audit results as JSON, Markdown, or PR description format with aggregated statistics and finding summaries by severity.

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router), React 19, TypeScript 5.9 |
| Database | DuckDB via `@claudekit/duckdb` (embedded, zero config) |
| Styling | Tailwind CSS 4, shadcn/ui via `@claudekit/ui` |
| Animation | Motion (Framer Motion) 12 |
| Icons | Lucide React |
| Theming | next-themes (dark/light/system) |
| Code Highlighting | Shiki |
| Markdown | react-markdown + remark-gfm |
| Notifications | Sonner |
| Linting | Biome (replaces ESLint + Prettier) |
| Testing | Vitest |
| Dead Code | Knip |

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) >= 20
- [pnpm](https://pnpm.io/) 9+
- Part of the ClaudeKit monorepo

### Environment Variables

Copy the example file and edit as needed:

```bash
cp .env.example .env.local
```

| Variable | Description | Default |
|---|---|---|
| `MCP_API_TOKEN` | Bearer token for MCP API endpoints | -- |
| `DATABASE_PATH` | Override database file location | `~/.gadget/data.duckdb` |
| `GITHUB_PERSONAL_ACCESS_TOKEN` | GitHub API access for repo metadata sync | -- |

Additional optional API keys for MCP server integrations (Brave, Firecrawl, Exa, Tavily, Notion, Stripe, Sentry, Linear, etc.) are listed in `.env.example`.

### Run

```bash
pnpm dev
```

Open [http://localhost:2100](http://localhost:2100). On first launch, the database is created automatically at `~/.gadget/data.duckdb` with migrations applied and built-in data seeded.

## Scripts

| Command | Description |
|---|---|
| `pnpm dev` | Start dev server at localhost:2100 |
| `pnpm build` | Production build (includes type-check) |
| `pnpm lint` | Run Biome checks (lint + format) |
| `pnpm lint:fix` | Run Biome with auto-fix |
| `pnpm format` | Format all files with Biome |
| `pnpm test` | Run tests with Vitest |
| `pnpm seed` | Re-seed built-in policies and concept sources |
| `pnpm db:reset` | Delete database and WAL file (fresh start) |
| `pnpm knip` | Check for unused exports and dependencies |

## Architecture

### Server/Client Split

Every page follows the same pattern:

1. **Server Component** (`src/app/**/page.tsx`) — fetches data via Server Actions, passes as props
2. **Client Component** (`src/components/*/**-client.tsx`) — receives data, handles interactivity

### Data Flow

```
Browser -> Server Component -> Server Action -> DuckDB
                                   |
         Client Component <- props/data
```

### Session System

Long-running operations use a unified session architecture (via `@claudekit/session`):

```
Client -> POST /api/sessions (create + start)
       -> GET  /api/sessions/[id]/stream (SSE log stream)
       -> POST /api/sessions/[id]/cancel (abort)
```

Six runner factories in `src/lib/services/session-runners/` handle each operation type: scan, quick-improve, finding-fix, fix-apply, AI file generation, and cleanup. Each runner writes structured logs to the `session_logs` table, streamed to the client in real time via Server-Sent Events.

### Database

DuckDB runs as an embedded database via `@claudekit/duckdb` with a `createDatabase()` factory using `useGlobalCache: true` to survive Next.js HMR. On startup:

- Runs numbered SQL migrations from `src/lib/db/migrations/`
- Recovers orphaned sessions (stuck `running`/`pending` -> marked `error`)
- Prunes old session data via `@claudekit/session`
- Seeds built-in data (policies, concept sources)

17 tables across scan roots, repos, policies, findings, fixes, settings, concepts, sessions, and more.

To reset the database:

```bash
pnpm db:reset   # removes ~/.gadget/data.duckdb and .wal file
pnpm dev        # migrations and seed data are recreated on startup
```

### Pages

| Path | Description |
|---|---|
| `/` | Dashboard with activity feed, stats, and onboarding |
| `/scans` | Scan history |
| `/scans/new` | New scan wizard |
| `/repositories` | Repository list with counts |
| `/repositories/[repoId]` | Repository detail — findings, fixes, Claude config editor |
| `/policies` | Audit policy list and editor |
| `/ai-integrations` | Discover and manage AI integrations (skills, hooks, commands, agents, MCP servers, plugins) |
| `/settings` | App settings, API keys, theme |

### API Routes

19 REST endpoints under `/api/`:

| Endpoint | Purpose |
|---|---|
| `/api/scans` | Scan listing |
| `/api/repos` | Repository CRUD |
| `/api/repos/[repoId]` | Single repo operations |
| `/api/repos/[repoId]/raw` | Raw repo data access |
| `/api/discover` | Repository discovery |
| `/api/findings` | Audit findings |
| `/api/fixes` | Fix actions |
| `/api/fixes/apply` | Apply fixes |
| `/api/fixes/preview` | Preview fix diffs |
| `/api/fixes/restore` | Restore from snapshots |
| `/api/policies` | Policy CRUD |
| `/api/reports` | Report export |
| `/api/fs/browse` | Filesystem browsing |
| `/api/claude-usage` | Claude CLI rate limit monitoring |
| `/api/sessions` | Session creation |
| `/api/sessions/cleanup` | Session cleanup |
| `/api/sessions/[id]` | Session detail |
| `/api/sessions/[id]/stream` | Real-time session log stream (SSE) |
| `/api/sessions/[id]/cancel` | Cancel a running session |

### Services

Core business logic lives in `src/lib/services/`:

| Service | Purpose |
|---|---|
| `session-manager.ts` | Wraps `@claudekit/session` for session lifecycle |
| `session-runners/` | 6 specialized runners for each session type |
| `scanner.ts` | Filesystem walking, Git repo discovery, package manager detection |
| `auditors/` | Four auditors: dependencies, AI files, project structure, custom rules |
| `fix-planner.ts` | Converts findings into fix actions with before/after diffs |
| `apply-engine.ts` | Atomic fix application with snapshots and rollback |
| `reporter.ts` | Report export (JSON, Markdown, PR description) |
| `encryption.ts` | AES-256-GCM encryption for stored secrets |
| `concept-scanner.ts` | Local discovery of skills, hooks, commands, agents, MCP servers |
| `github-client.ts` | GitHub API integration and metadata sync |
| `github-concept-scanner.ts` | Discover AI integrations from GitHub repos |
| `mcp-list-scanner.ts` | Scan curated MCP server lists |
| `claude-config.ts` | Read/write Claude Code configuration files |
| `process-runner.ts` | Generic bash process spawning with abort support |
| `git-utils.ts` | Git utility functions |

## Project Structure

```
src/
├── app/                        # Next.js App Router
│   ├── api/                    # 19 REST API endpoints
│   ├── repositories/           # Repository pages
│   ├── policies/               # Policy pages
│   ├── scans/                  # Scan pages
│   ├── ai-integrations/        # AI integrations page
│   ├── settings/               # Settings page
│   └── page.tsx                # Dashboard
├── components/
│   ├── ui/                     # Local shadcn/ui component (empty-state)
│   ├── layout/                 # Shell, page banner, config
│   ├── sessions/               # Session panel, badges, indicators, context
│   ├── code/                   # Code browser, file viewer, diff
│   └── [feature]/              # Feature-specific client components
├── lib/
│   ├── actions/                # 15 Server Action modules ("use server")
│   ├── db/                     # DuckDB init, migrations, seed
│   ├── services/               # Business logic (scanning, auditing, fixing, sessions, etc.)
│   │   ├── auditors/           # 4 audit engines
│   │   └── session-runners/    # 6 session runner factories
│   ├── types.ts                # All domain types
│   ├── constants.ts            # App-wide constants
│   └── utils.ts                # Utilities (ID generation, class merging, timestamps)
└── (hooks from @claudekit/hooks)
```

## Development

### Code Style

- **Biome** handles both linting and formatting — config in `biome.json`
- 2-space indent, 120-character line width, double quotes, semicolons, trailing commas
- All imports use the `@/` alias for `src/`

### Testing

```bash
pnpm test             # run all tests
pnpm test -- --watch  # watch mode
```

## License

MIT
