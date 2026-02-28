# CLAUDE.md — GoGo Web

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm dev          # Start dev server at http://localhost:2200 (binds 0.0.0.0)
pnpm build        # Production build
pnpm start        # Production server
pnpm lint         # Biome check (lint + format check)
pnpm lint:fix     # Biome check with auto-fix
pnpm format       # Biome format (write)
pnpm typecheck    # TypeScript check
pnpm test         # Run tests with vitest
pnpm test:watch   # Run tests in watch mode
```

## Environment Variables

See `.env.example`. All are optional — the app auto-detects the orchestrator URL from the browser hostname.
- `NEXT_PUBLIC_API_URL` — Override orchestrator REST URL (default: auto-detect from browser hostname + port 2201)
- `NEXT_PUBLIC_WS_URL` — Override WebSocket URL (default: auto-detect)
- `NEXT_PUBLIC_ORCHESTRATOR_PORT` — Override orchestrator port (default: 2201)
- `NEXT_PUBLIC_DEFAULT_DIRECTORY` — Default work directory for agent worktrees (default: /tmp/agent-worktrees)

## Architecture

**GoGo Web** is a **Next.js 16 App Router** dashboard for the GoGo multi-repository AI agent job orchestration system. It communicates with `gogo-orchestrator` (Fastify backend on port 2201) via REST API and WebSocket for real-time updates.

### Directory Layout

```
├── app/                          # Next.js App Router
│   ├── layout.tsx                # Root layout (providers, theme)
│   ├── page.tsx                  # Dashboard home (Kanban board)
│   ├── manifest.ts               # PWA manifest
│   ├── archive/                  # Archived/completed jobs
│   ├── health/                   # System health monitoring
│   ├── issues/                   # GitHub issues management
│   ├── research/                 # AI research sessions
│   ├── settings/                 # Configuration (agents, repos, GitHub)
│   ├── setup/                    # Onboarding wizard
│   └── worktrees/                # Git worktree management
├── components/
│   ├── layout/                   # Client layout, sidebar, connection badge, layout config
│   ├── dashboard/                # Kanban board, job cards, detail drawer, log viewer (20 components)
│   ├── settings/                 # GitHub, agents, repos, general, connect-device settings
│   ├── setup/                    # Setup wizard steps (6 components)
│   ├── issues/                   # Issue list, cards, content, detail drawer, creation dialog
│   ├── research/                 # Suggestion card
│   ├── archive/                  # Archived job cards
│   ├── worktrees/                # Worktree card, file browser, changes drawer
│   ├── theme/                    # Theme provider
│   ├── repo/                     # Repo selector, repo badge, repo settings
│   └── providers.tsx             # Global providers (QueryClient, contexts)
├── contexts/
│   ├── repository-context.tsx    # Multi-repo selection (localStorage persistence)
│   └── websocket-context.tsx     # WebSocket connection + message dispatch to TanStack Query cache
├── hooks/
│   ├── use-jobs.ts               # TanStack Query for jobs, mutations, cache helpers
│   ├── use-repositories.ts       # Repo settings, branches
│   ├── use-issues.ts             # GitHub issues
│   ├── use-agents.ts             # Agent status & management
│   ├── use-settings.ts           # Global settings
│   ├── use-setup.ts              # Setup wizard
│   ├── use-research.ts           # Research sessions
│   ├── use-worktrees.ts          # Worktree info
│   ├── use-issue-comments.ts     # Issue comments
│   └── use-health-coordination.ts # Health check → WS reconnect
├── lib/
│   ├── api.ts                    # REST API client (1000+ lines, all orchestrator endpoints)
│   ├── ws.ts                     # WebSocket hook with exponential backoff reconnection
│   ├── utils.ts                  # Formatting helpers
│   └── actions/
│       └── claude-usage.ts       # Claude usage tracking server action
└── types/
    └── job.ts                    # Job status config, Kanban column groups
```

### State Management

- **Server state**: TanStack React Query 5 — caching, polling (5–30s intervals), invalidation via mutations + WebSocket
- **Real-time**: WebSocket context dispatches `job:updated`, `job:created`, `job:log` events to React Query cache; `research:updated`, `research:suggestion`, `research:output` dispatched as DOM CustomEvents
- **Client state**: React Context (repository selection, WebSocket) + localStorage (auth token, repo selection, theme)
- **URL state**: `nuqs` for query parameters (job ID, filters)

### Data Flow

```
Orchestrator REST API ← lib/api.ts → React Query cache ← WebSocket real-time updates
                                           ↓
                                    Components (hooks)
```

### Provider Nesting

```
NuqsAdapter → QueryClientProvider → WebSocketProvider → HealthCoordinator → RepositoryLoader → ThemeProvider → Toaster
```

### API Client (`lib/api.ts`)

- Dynamic URL detection: uses browser hostname if env vars not set
- Bearer token auth via localStorage key `gogo_api_token`
- Sections: jobs, agents, repositories, issues, worktrees, research, setup, health, settings, PR creation

### WebSocket (`lib/ws.ts`)

- Exponential backoff reconnection (1s → 30s max, 10 attempts)
- Message types: subscribe/unsubscribe (job logs), subscribe_repo/unsubscribe_repo (repo events), ping/pong
- Background reconnect every 30s on failure
- Health check triggers reconnect when backend recovers

## Key Patterns

### Page Pattern

All pages follow the same pattern:
1. **Page component** exports `<Suspense>` boundary with skeleton fallback
2. **Content component** uses hooks for data (TanStack Query + URL state via `nuqs`)
3. Server Actions in `lib/actions/` for server-side operations

### Polling + WebSocket Hybrid

- **WebSocket**: Immediate UI updates on job changes
- **Polling fallback**: 5–30s depending on data criticality (jobs: 5s, health: 10s, stale: 30s)
- Cache helpers in `hooks/use-jobs.ts`: `updateJobInCache()`, `appendLogToCache()`, `invalidateJobsList()`

### Authentication

- Token stored in `localStorage` (`gogo_api_token`)
- Sent as `Authorization: Bearer <token>`
- No server-side sessions

### Network Access

App binds to `0.0.0.0` — accessible from other devices on the network. API URL auto-detection uses the browser's hostname, enabling seamless network access without configuration.

### Types

All domain types re-exported from `@claudekit/gogo-shared` (Job, JobStatus, Repository, Issue, WsMessage, etc.). Local `types/job.ts` defines UI-specific config (status colors, icons, Kanban column groupings).

## Conventions

- All components use `"use client"` directive (interactive SPA)
- Imports use `@/` alias for root and `@claudekit/gogo-shared` for shared types
- Biome for linting/formatting: 2-space indent, 120 line width, double quotes, semicolons
- `cn()` from `@claudekit/ui` for conditional class merging
- Icons from `lucide-react`
- Toasts via `sonner`
- Theme switching via `next-themes` + `@claudekit/hooks` `useAppTheme()` hook
