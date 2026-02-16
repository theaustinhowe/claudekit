# Gadget

Your local dev tool hub for auditing, generating, and managing projects.

Gadget is a local-first developer tool that scans your repositories against customizable policies, generates automated fix plans with file diffs, scaffolds new projects from templates, and provides a visual editor for Claude Code configuration. Built with Next.js 16, DuckDB, and shadcn/ui — it runs entirely on your machine with zero external dependencies.

## Features

### Repository Scanning

Walks your filesystem to discover Git repositories. Detects package managers (npm, pnpm, yarn, bun), identifies repo types (Next.js, Node, React, library, monorepo, TanStack), and recognizes monorepo indicators like pnpm workspaces and Turborepo.

### Policy-Based Auditing

Define policies with expected dependency versions, banned dependencies (with suggested replacements), and allowed package managers. Four built-in auditors analyze dependencies, AI instruction files, project structure, and custom rules. Ships with 5 policies: Next.js App Standard, Node.js Service, Library/Package, Monorepo, and TanStack App.

### Automated Fix Planning

Generates fix actions with before/after file diffs, risk assessment (low/medium/high), and impact categorization (docs, config, dependencies, structure). Review changes in a syntax-highlighted diff viewer (unified or split mode) before applying.

### Fix Application

Applies fixes atomically — writes to temp files then renames. Creates snapshots before every change with full rollback support. Supports dry-run mode and docs-only filtering.

### Project Creation

Create new projects through a chat-based design flow. Describe your idea, refine the UI spec through conversation, scaffold files via Claude CLI, run a dev server, and auto-fix errors — all from one interface.

### Session-Based Execution

Long-running operations run through a unified session system with real-time SSE streaming, cancellation support, and persistent history. Twelve session types: scan, scaffold, chat, auto-fix, upgrade, upgrade-init, quick-improve, finding-fix, fix-apply, AI file generation, cleanup, and toolbox commands.

### AI Integrations

Discover and install AI integrations from multiple sources — local repos, GitHub repos, curated lists, and Claude configs. Browse and manage Skills, Hooks, Commands, Agents, MCP Servers, and Plugins in a unified patterns library.

### Claude Config Editor

Visual editor for `.claude/settings.local.json` — edit environment variables, permission rules, and MCP server configurations through a structured UI instead of raw JSON.

### Claude Usage Monitoring

Track Claude CLI rate limits by reading OAuth tokens from the macOS Keychain. Displays five-hour and seven-day usage windows with per-model breakdowns.

### Toolbox

Check for installed CLI tools, verify versions, and run commands. Get installation guidance for missing tools.

### Reports

Export audit results as JSON, Markdown, or PR description format with aggregated statistics and finding summaries by severity.

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router), React 19, TypeScript 5.9 |
| Database | DuckDB 1.4 via `@duckdb/node-api` (embedded, zero config) |
| Styling | Tailwind CSS 4, shadcn/ui, Base UI |
| Animation | Motion (Framer Motion) 12 |
| Icons | Lucide React |
| Theming | next-themes (dark/light/system) |
| Code Highlighting | Shiki |
| Markdown | react-markdown + remark-gfm |
| Notifications | Sonner |
| Linting | Biome (replaces ESLint + Prettier) |
| Testing | Vitest, Playwright |
| Dead Code | Knip |
| Git Hooks | Husky + lint-staged |

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) >= 18
- [pnpm](https://pnpm.io/)
- [Claude CLI](https://docs.anthropic.com/en/docs/claude-code) (optional — required for AI-powered scaffolding and fixes)

### Installation

```bash
git clone https://github.com/theaustinhowe/gadget.git
cd gadget
pnpm install
```

### Environment Variables

Copy the example file and edit as needed:

```bash
cp .env.local.example .env.local
```

| Variable | Description | Default |
|---|---|---|
| `MCP_API_TOKEN` | Bearer token for MCP API endpoints | — |
| `DB_PATH` | Override database file location | `~/.gadget/data.duckdb` |
| `ANTHROPIC_API_KEY` | Anthropic API key for project generator and design chat | — |
| `GITHUB_PERSONAL_ACCESS_TOKEN` | GitHub API access for repo metadata sync | — |

Additional optional API keys for MCP server integrations (Brave, Firecrawl, Exa, Tavily, Notion, Stripe, Sentry, Linear, etc.) are listed in `.env.local.example`.

### Run

```bash
pnpm dev
```

Open [http://localhost:2100](http://localhost:2100). On first launch, the database is created automatically at `~/.gadget/data.duckdb` with schema applied and built-in data seeded.

## Scripts

| Command | Description |
|---|---|
| `pnpm dev` | Start dev server at localhost:2100 |
| `pnpm build` | Production build (includes type-check) |
| `pnpm start` | Start production server at localhost:2100 |
| `pnpm lint` | Run Biome checks (lint + format) |
| `pnpm lint:fix` | Run Biome with auto-fix |
| `pnpm format` | Format all files with Biome |
| `pnpm test` | Run tests with Vitest |
| `pnpm seed` | Re-seed built-in policies, templates, and fix packs |
| `pnpm db:reset` | Delete database and WAL file (fresh start) |
| `pnpm knip` | Check for unused exports and dependencies |

## Architecture

### Server/Client Split

Every page follows the same pattern:

1. **Server Component** (`src/app/**/page.tsx`) — fetches data via Server Actions, passes as props
2. **Client Component** (`src/components/*/**-client.tsx`) — receives data, handles interactivity

### Data Flow

```
Browser → Server Component → Server Action → DuckDB
                                   ↓
         Client Component ← props/data
```

### Session System

Long-running operations use a unified session architecture:

```
Client → POST /api/sessions (create + start)
       → GET  /api/sessions/[id]/stream (SSE log stream)
       → POST /api/sessions/[id]/cancel (abort)
```

Twelve runner factories in `src/lib/services/session-runners/` handle each operation type: scan, scaffold, chat, auto-fix, upgrade, upgrade-init, quick-improve, finding-fix, fix-apply, AI file generation, cleanup, and toolbox commands. Each runner writes structured logs to the `session_logs` table, streamed to the client in real time via Server-Sent Events.

### Database

DuckDB runs as an embedded database with a singleton async connection cached on `globalThis` to survive Next.js HMR. On startup:

- Runs schema init (32 tables across scan roots, repos, policies, findings, fixes, templates, settings, concepts, projects, sessions, and more)
- Recovers orphaned sessions (stuck `running`/`pending` → marked `error`)
- Prunes old session logs (>7 days) and old sessions (>30 days)
- Auto-recovers from WAL corruption (removes `.wal` file and retries)
- Seeds built-in data (5 policies, 3 templates, 4 fix packs, concept sources)

To reset the database:

```bash
pnpm db:reset   # removes ~/.gadget/data.duckdb and .wal file
pnpm dev        # schema and seed data are recreated on startup
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
| `/projects` | Project listing |
| `/projects/new` | Create a new project via chat-based design |
| `/projects/archived` | Archived projects |
| `/projects/[projectId]` | Project detail — design chat, scaffolding, dev server, auto-fix |
| `/ai-integrations` | Discover and manage AI integrations (skills, hooks, commands, agents, MCP servers, plugins) |
| `/concepts` | Concept management and sources |
| `/patterns` | Patterns library |
| `/toolbox` | CLI tool checker and command runner |
| `/settings` | App settings, API keys, theme |

### API Routes

27 REST endpoints under `/api/`:

| Endpoint | Purpose |
|---|---|
| `/api/scans` | Streaming scan execution |
| `/api/repos` | Repository CRUD |
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
| `/api/toolbox/check` | CLI tool detection |
| `/api/claude-usage` | Claude CLI rate limit monitoring |
| `/api/projects` | Project creation and listing |
| `/api/projects/[id]` | Project detail |
| `/api/projects/[id]/raw` | Raw project data access |
| `/api/projects/[id]/dev-server` | Dev server management |
| `/api/projects/[id]/auto-fix` | Auto-fix management |
| `/api/projects/[id]/export` | Project export |
| `/api/projects/[id]/screenshots` | Screenshot capture and listing |
| `/api/projects/[id]/screenshots/[screenshotId]` | Individual screenshot access |
| `/api/projects/[id]/upgrade` | Upgrade task management |
| `/api/sessions` | Session creation |
| `/api/sessions/[id]` | Session detail |
| `/api/sessions/[id]/stream` | Real-time session log stream (SSE) |
| `/api/sessions/[id]/cancel` | Cancel a running session |

### Services

Core business logic lives in `src/lib/services/`:

| Service | Purpose |
|---|---|
| `session-manager.ts` | Unified session lifecycle (create, stream, cancel, cleanup) |
| `session-runners/` | 12 specialized runners for each session type |
| `claude-runner.ts` | Invoke Claude CLI with stream-json parsing and abort support |
| `process-runner.ts` | Spawn bash processes with cancellation and streaming output |
| `scanner.ts` | Filesystem walking, Git repo discovery, package manager detection |
| `auditors/` | Four auditors: dependencies, AI files, project structure, custom rules |
| `fix-planner.ts` | Converts findings into fix actions with before/after diffs |
| `apply-engine.ts` | Atomic fix application with snapshots and rollback |
| `generator.ts` | Project scaffolding from templates |
| `reporter.ts` | Report export (JSON, Markdown, PR description) |
| `encryption.ts` | AES-256-GCM encryption for stored secrets |
| `claude-usage-api.ts` | Fetch Claude rate limits from Anthropic OAuth API |
| `concept-scanner.ts` | Local discovery of skills, hooks, commands, agents, MCP servers |
| `github-client.ts` | GitHub API integration and metadata sync |
| `github-concept-scanner.ts` | Discover AI integrations from GitHub repos |
| `mcp-list-scanner.ts` | Scan curated MCP server lists |
| `claude-config.ts` | Read/write Claude Code configuration files |
| `tool-checker.ts` | CLI tool detection and version checking |
| `dev-server-manager.ts` | Project dev server lifecycle management |
| `auto-fix-engine.ts` | Automated error detection and fixing via Claude |
| `screenshot-service.ts` | Capture and manage project screenshots via Playwright |
| `interface-design.ts` | AI-powered interface design generation |

## Project Structure

```
src/
├── app/                        # Next.js App Router
│   ├── api/                    # 27 REST API endpoints
│   ├── repositories/           # Repository pages
│   ├── policies/               # Policy pages
│   ├── scans/                  # Scan pages
│   ├── projects/               # Project creation, design, scaffolding
│   ├── ai-integrations/        # AI integrations page
│   ├── concepts/               # Concept management
│   ├── patterns/               # Patterns library
│   ├── toolbox/                # CLI toolbox page
│   ├── settings/               # Settings page
│   └── page.tsx                # Dashboard
├── components/
│   ├── ui/                     # shadcn/ui components (24)
│   ├── layout/                 # Sidebar, header, mobile nav
│   ├── sessions/               # Session terminal, panel, badges, indicators, context
│   ├── code/                   # Code browser, file viewer, diff
│   └── [feature]/              # Feature-specific client components
├── lib/
│   ├── actions/                # 22 Server Action modules ("use server")
│   ├── db/                     # DuckDB connection, helpers, schema, migrations, seed
│   ├── services/               # Business logic (scanning, auditing, fixing, sessions, etc.)
│   │   ├── auditors/           # 4 audit engines
│   │   └── session-runners/    # 12 session runner factories
│   ├── types.ts                # All domain types
│   ├── constants.ts            # App-wide constants
│   └── utils.ts                # Utilities (ID generation, class merging, timestamps)
└── hooks/                      # React hooks (mobile detection, color scheme, tab nav, auto-scroll, session streaming)
```

## Development

### Code Style

- **Biome** handles both linting and formatting — config in `biome.json`
- 2-space indent, 120-character line width, double quotes, semicolons, trailing commas
- **Husky** + **lint-staged** run `biome check --write` on every commit
- All imports use the `@/` alias for `src/`

### Testing

```bash
pnpm test             # run all tests
pnpm test -- --watch  # watch mode
```

### Security Headers

The app sets security headers via `next.config.ts`:
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`

## License

MIT
