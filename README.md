# ClaudeKit

A local-first monorepo of developer tools and dashboards built with Next.js, Fastify, DuckDB, and the Claude CLI. ClaudeKit provides a suite of apps for repository auditing, AI agent orchestration, project scaffolding, PR analysis, database administration, and more — all running on your machine.

## Apps

| App | Port | Description |
|-----|------|-------------|
| **Web** | 2000 | Dashboard, app health monitor, and log viewer |
| **DuckTails** | 2050 | DuckDB admin UI — browse, query, and edit all ClaudeKit databases |
| **Gadget** | 2100 | Repository auditor with AI integrations and MCP tool support |
| **Inside** | 2150 | Project creation, scaffolding, and design workspace |
| **GoGo Web** | 2200 | Job orchestration dashboard for multi-repo AI agents |
| **GoGo Orchestrator** | 2201 | Backend orchestrator for GoGo job execution (Fastify) |
| **B4U** | 2300 | Automated repo walkthrough video generator |
| **Inspector** | 2400 | GitHub PR analysis, skill building, and comment resolution |

## Shared Packages

| Package | Description |
|---------|-------------|
| `@claudekit/ui` | shadcn/ui component library + `cn()` utility |
| `@claudekit/hooks` | Shared React hooks — `useAppTheme`, `useAutoScroll`, `useIsMobile`, `useSessionStream` |
| `@claudekit/duckdb` | DuckDB connection factory, query helpers, and migration runner |
| `@claudekit/claude-runner` | Claude CLI spawn with stream-JSON parsing and progress estimation |
| `@claudekit/session` | Session lifecycle manager (ring buffer, batch log flush, DI persistence) |
| `@claudekit/logger` | Pino-based structured logging with daily-rotating NDJSON files |
| `@claudekit/mcp-logs` | MCP server exposing 5 log-querying tools |
| `@claudekit/gogo-shared` | GoGo domain types, Zod schemas, job state machine, typed API client |
| `@claudekit/github` | GitHub API client with rate-limit tracking |
| `@claudekit/claude-usage` | Claude API usage tracking with pricing data |
| `@claudekit/playwright` | Browser automation helpers and E2E testing infrastructure |
| `@claudekit/validation` | Shared Zod validation schemas |

## Prerequisites

- **Node.js** >= 20 (22 recommended)
- **pnpm** 9.15.0 — pinned via `packageManager` in `package.json`
- **Claude CLI** — required by apps that use `@claudekit/claude-runner`

## Getting Started

```bash
# Clone the repo
git clone https://github.com/your-org/claudekit.git
cd claudekit

# Install dependencies
pnpm install

# Copy example env files and fill in your values
cp .env.example .env.local
cp apps/gadget/.env.example apps/gadget/.env.local
cp apps/gogo-orchestrator/.env.example apps/gogo-orchestrator/.env.local
# ... repeat for other apps as needed

# Start all apps
pnpm dev

# Or start a single app
pnpm dev:web
```

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start all apps (background, colored output) |
| `pnpm dev:fg` | Start all apps in foreground mode |
| `pnpm dev:stop` | Stop all background dev processes |
| `pnpm dev:web` | Start Web dashboard (port 2000) |
| `pnpm dev:ducktails` | Start DuckTails (port 2050) |
| `pnpm dev:gadget` | Start Gadget (port 2100) |
| `pnpm dev:inside` | Start Inside (port 2150) |
| `pnpm dev:gogo-web` | Start GoGo Web (port 2200) |
| `pnpm dev:gogo-orch` | Start GoGo Orchestrator (port 2201) |
| `pnpm dev:b4u` | Start B4U (port 2300) |
| `pnpm dev:inspector` | Start Inspector (port 2400) |
| `pnpm build` | Build all packages and apps |
| `pnpm typecheck` | TypeScript check across the workspace |
| `pnpm lint` | Biome lint check |
| `pnpm lint:fix` | Biome lint with auto-fix |
| `pnpm format` | Biome format |
| `pnpm test` | Run all tests (Vitest) |
| `pnpm test:coverage` | Run tests with coverage |
| `pnpm check` | Full CI check — typecheck + lint + test + build |
| `pnpm db:reset` | Reset all app databases |
| `pnpm clean` | Remove build artifacts |
| `pnpm storybook` | Launch UI component Storybook (port 6006) |

Run commands in a specific package with `pnpm --filter <name> <command>`:

```bash
pnpm --filter gadget dev
pnpm --filter @claudekit/duckdb typecheck
pnpm --filter gogo-orchestrator db:reset
```

## Architecture

```
claudekit/
├── apps/
│   ├── web/                 # Dashboard & log viewer (Next.js)
│   ├── ducktails/           # DuckDB admin UI (Next.js)
│   ├── gadget/              # Repo auditor (Next.js)
│   ├── inside/              # Project scaffolding (Next.js)
│   ├── gogo-web/            # Agent orchestration UI (Next.js)
│   ├── gogo-orchestrator/   # Job execution backend (Fastify)
│   ├── b4u/                 # Walkthrough video gen (Next.js)
│   └── inspector/           # PR analysis (Next.js)
├── packages/
│   ├── ui/                  # Component library (shadcn/ui)
│   ├── hooks/               # Shared React hooks
│   ├── duckdb/              # Database layer
│   ├── claude-runner/       # Claude CLI wrapper
│   ├── session/             # Session lifecycle
│   ├── logger/              # Structured logging
│   ├── mcp-logs/            # MCP log server
│   ├── gogo-shared/         # GoGo shared types
│   ├── github/              # GitHub API client
│   ├── claude-usage/        # Usage tracking
│   ├── playwright/          # Browser automation
│   └── validation/          # Zod schemas
└── scripts/                 # Dev tooling (dev runner, db reset, etc.)
```

### Key Patterns

**Server/Client Split** — All Next.js pages follow a two-file pattern:
- `page.tsx` — Server Component that fetches data via Server Actions
- `*-client.tsx` — Client Component (`"use client"`) that receives data as props

**DuckDB Persistence** — Most apps store data locally in DuckDB via `@claudekit/duckdb`. Migrations live in `migrations/` directories as numbered `.sql` files.

**Theme System** — All apps share 9 color themes (Amethyst, Sapphire, Emerald, Ruby, Amber, Slate, Midnight, Sunset, Forest) managed by `useAppTheme()` from `@claudekit/hooks`. Themes use HSL CSS custom properties with class-based switching.

**Logging** — Structured NDJSON logs written to `~/.claudekit/logs/` with daily rotation and 14-day retention via `@claudekit/logger` (Pino-based).

## Environment Variables

Each app has a `.env.example` listing its supported variables. Copy to `.env.local` and fill in your values.

### Shared (Root)

| Variable | Description |
|----------|-------------|
| `GITHUB_PERSONAL_ACCESS_TOKEN` | GitHub PAT used by Gadget, GoGo, and Inspector |
| `LOG_LEVEL` | Logging level — `trace`, `debug`, `info` (default), `warn`, `error`, `fatal` |
| `DATABASE_PATH` | Override default database path (per-app defaults below) |

### Per-App

| App | Key Variables |
|-----|---------------|
| **Gadget** | `MCP_API_TOKEN`, `NEXT_PUBLIC_DEFAULT_DIRECTORY`, `BRAVE_API_KEY`, `FIRECRAWL_API_KEY`, `EXA_API_KEY`, `TAVILY_API_KEY`, plus many optional MCP integrations |
| **GoGo Web** | `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_WS_URL`, `NEXT_PUBLIC_ORCHESTRATOR_PORT`, `NEXT_PUBLIC_DEFAULT_DIRECTORY` |
| **GoGo Orchestrator** | `PORT`, `ALLOWED_ORIGINS`, `API_TOKEN`, `GITHUB_PERSONAL_ACCESS_TOKEN` |
| **Inspector** | `GITHUB_PERSONAL_ACCESS_TOKEN` |
| **B4U** | `ELEVENLABS_API_KEY` |
| **Inside** | `NEXT_PUBLIC_DEFAULT_DIRECTORY` |

### Database Locations

| App | Default Path |
|-----|-------------|
| Gadget | `~/.gadget/data.duckdb` |
| Inspector | `~/.inspector/data.duckdb` |
| Inside | `~/.inside/data.duckdb` |
| B4U | `data/b4u.duckdb` (relative to app) |
| GoGo Orchestrator | `data/gogo.duckdb` (relative to app) |

## Tech Stack

- **Runtime:** Node.js 20+
- **Package Manager:** pnpm 9 (workspaces)
- **Frontend:** Next.js 16 (App Router), React, Tailwind CSS v4
- **Backend:** Fastify 5 (GoGo Orchestrator)
- **Database:** DuckDB (via `@duckdb/node-api`)
- **Components:** shadcn/ui (Base UI primitives)
- **Linting/Formatting:** Biome (no ESLint or Prettier)
- **Testing:** Vitest, Playwright
- **Logging:** Pino with NDJSON file transport
- **TypeScript:** Strict mode, ES2022 target
