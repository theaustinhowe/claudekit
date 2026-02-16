# CLAUDE.md — GoGo Orchestrator

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm dev          # Start with tsx watch (live reload, port 2201)
pnpm build        # TypeScript compilation
pnpm start        # Run compiled build
pnpm typecheck    # TypeScript check
pnpm test         # Run tests with vitest
pnpm test:watch   # Run tests in watch mode
pnpm db:seed      # Seed database
pnpm db:migrate   # Run migrations
pnpm db:reset     # Delete DuckDB data file (full reset)
```

## Environment Variables

See `.env.example`. Key variables:
- `PORT` — HTTP port (default: 2201)
- `DATABASE_PATH` — DuckDB file path (default: `./data/gogo.duckdb`)
- `ALLOWED_ORIGINS` — CORS origins (comma-separated, default: localhost:2200,localhost:3000)
- GitHub tokens are configured per-repository via the settings API

## Architecture

**GoGo Orchestrator** is a **Fastify 5** backend that automates GitHub issue-to-PR workflows using AI agents. It manages the full lifecycle: poll labeled issues → create jobs → plan → run Claude agent → create PRs → handle review feedback.

### Directory Layout

```
src/
├── index.ts                      # Startup sequence & initialization
├── server.ts                     # Fastify setup, route registration, CORS
├── db/
│   ├── index.ts                  # DuckDB connection factory (globalThis cached)
│   ├── schema.ts                 # Row types (snake_case) + mappers to camelCase
│   ├── migrate.ts                # Migration runner
│   ├── seed.ts                   # Seed script
│   └── migrations/
│       └── 001_initial.sql       # Complete schema (tables, indexes)
├── api/                          # REST endpoints (Fastify routes)
│   ├── jobs.ts                   # Job CRUD, actions (pause/resume/cancel/retry/inject)
│   ├── agents.ts                 # List available agents
│   ├── health.ts                 # Health status, job counts, rate limits, uptime
│   ├── repositories.ts           # Repository config, enable/disable, polling settings
│   ├── issues.ts                 # GitHub issue sync and caching
│   ├── research.ts               # Research session management
│   ├── settings.ts               # Global settings (Claude config, intervals)
│   ├── setup.ts                  # Onboarding flow (verify GitHub, repo, workspace)
│   ├── system.ts                 # System info
│   └── worktrees.ts              # Git worktree management
├── services/                     # Core business logic
│   ├── state-machine.ts          # Job status transitions, validation, atomic updates
│   ├── agent-executor.ts         # Start/resume agents, callbacks, timeouts
│   ├── agent-runner.ts           # Job run lifecycle (workspace setup, worktree creation)
│   ├── claude-code-agent.ts      # Claude CLI spawning, stream-JSON parsing
│   ├── agents/
│   │   ├── types.ts              # AgentRunner interface
│   │   ├── registry.ts           # Singleton agent registry
│   │   ├── known-agents.ts       # Built-in agent definitions
│   │   └── claude-code-runner.ts  # Claude Code agent implementation
│   ├── polling.ts                # Main polling loop, rate limit handling
│   ├── job-auto-start.ts         # Auto-start queued jobs
│   ├── needs-info.ts             # NEEDS_INFO state: post question, poll for response
│   ├── plan-approval.ts          # Plan approval flow
│   ├── pr-flow.ts                # READY_TO_PR → test → create PR → PR_OPENED
│   ├── pr-reviewing.ts           # PR review state management
│   ├── pr-recovery.ts            # Recover orphaned PRs on startup
│   ├── issue-polling.ts          # Poll labeled issues from GitHub
│   ├── issue-sync.ts             # Sync issues & comments to local cache
│   ├── stale-job-monitor.ts      # Detect zombie processes, pause stale jobs
│   ├── health-events.ts          # Structured health event emission
│   ├── data-pruning.ts           # Archive old logs, prune events
│   ├── shutdown.ts               # Graceful shutdown handlers
│   ├── process-manager.ts        # Track/cleanup spawned agent processes
│   ├── git.ts                    # Git worktree operations (clone, fetch, branch, push)
│   ├── github/
│   │   ├── client.ts             # Octokit wrapper, rate limit tracking
│   │   ├── repo-service.ts       # Repository config queries
│   │   └── index.ts              # Issue creation, PR creation, comments, labels
│   ├── research.ts               # Research session orchestration
│   ├── settings-helper.ts        # Load/validate settings
│   └── test-runner.ts            # Execute test commands
├── ws/
│   └── handler.ts                # WebSocket connection management, subscriptions, broadcasting
├── middleware/
│   └── auth.ts                   # Bearer token authentication
├── schemas/
│   └── index.ts                  # Zod schemas for API validation
└── utils/
    ├── logger.ts                 # @devkit/logger service logging
    ├── job-logging.ts            # Ring buffer (500), batch flush, WebSocket broadcast
    ├── binary-check.ts           # Validate required binaries (git, node, etc.)
    └── timeout.ts                # Promise timeout utilities
```

### Job State Machine

```
queued → planning → awaiting_plan_approval → running → ready_to_pr → pr_opened → pr_reviewing → done
                         ↓ (reject)            ↓            ↓ (test fail)
                      planning            needs_info      running (retry)
                                               ↓
                                          running (response received)

Any state → paused (user action or timeout)
Any state → failed (error or cancel)
paused → queued (resume) | running (resume_with_agent)
```

**Atomic transitions**: All status changes use `applyTransitionAtomic()` / `applyActionAtomic()` with `withTransaction()` for job update + event creation in one operation.

### Database

**DuckDB** via `@devkit/duckdb`. Tables:

| Table | Purpose |
|-------|---------|
| `repositories` | Multi-repo config (owner, name, token, trigger_label, polling settings) |
| `jobs` | Job lifecycle (status, branch, PR number, process PID, plan content, phase) |
| `job_events` | State change audit trail |
| `job_logs` | Streaming logs (stdout/stderr/system) with sequence numbers |
| `issues` | Local GitHub issue cache |
| `issue_comments` | GitHub comment cache |
| `health_events` | Structured health events |
| `research_sessions` | Research session tracking |
| `research_suggestions` | Research findings |
| `settings` | Key-value configuration (JSON values) |

### Startup Sequence

1. Check required binaries (git, node)
2. Register shutdown handlers
3. Cleanup orphaned processes from previous crashes
4. Pause any RUNNING/PLANNING jobs (safety net for crash recovery)
5. Clear stale PID references
6. Recover orphaned PRs
7. Run data pruning (archive old logs/events)
8. Validate startup settings
9. Create Fastify server + register routes + WebSocket
10. Start listening on port 2201
11. Start polling loop

### Polling Loop

Runs every 60s (configurable). Sequence:
1. Check GitHub rate limits → throttle if needed (3x multiplier)
2. Poll labeled issues → auto-create jobs
3. Auto-start queued jobs when resources available
4. Poll needs_info jobs → check for GitHub responses
5. Poll ready_to_pr jobs → run tests → create PRs
6. Poll plan approval / PR reviewing states
7. Check for stale/zombie jobs

### WebSocket (`/ws`)

- Client subscribes to job logs: replays ring buffer (last 500 entries) from `lastSequence`
- Real-time broadcast: `job:log` (log entries), `job:updated` (state changes), `job:created`
- Subscription protocol: `subscribe` / `unsubscribe` / `subscribe_repo` / `unsubscribe_repo` / `ping` / `pong`

### Agent System

- **Registry-based dispatch**: Agents registered in `services/agents/registry.ts`
- **Claude Code agent**: Spawns Claude CLI with structured prompts, parses stream-JSON output
- **Session tracking**: `~/.claude/projects/{encoded-path}/{sessionId}.jsonl`
- **Executor timeout**: 1.1x agent timeout (let agent timeout gracefully first, then force pause)
- **Resume**: Validates session file exists before resuming

## Key Patterns

### Atomic State Transitions

All job status changes go through `applyTransitionAtomic()` which wraps the update + event creation in a DB transaction. Never update job status directly.

### Process Management

- `registerProcess(jobId, pid)` — Track spawned process PIDs
- On startup: `cleanupOrphanedProcesses()` kills stale PIDs, `clearStalePidReferences()` cleans DB
- `stale-job-monitor` detects jobs stuck in running state (process crashed)

### Ring Buffer + Batch Flush

- **Ring Buffer (500)**: In-memory per job, enables WebSocket reconnection replay
- **Batch Flush (2s)**: Logs flushed to DuckDB every 2 seconds
- **WebSocket Broadcast**: Immediate (no batching delay for live viewers)

### Rate Limiting

- Track GitHub API limits per token (`X-RateLimit-Remaining`, `X-RateLimit-Reset`)
- Throttle polling 3x when limits critical
- Emit health events on throttle transitions

### Error Recovery

- Crash recovery: pause active jobs on startup, clean orphaned processes
- Test failure retry: configurable max retries, reverts to planning on exhaust
- PR creation failure: keeps job in ready_to_pr for retry
- Session loss: clears stale session references, allows fresh start

## Conventions

- Bearer token auth on all REST routes
- All domain types from `@devkit/gogo-shared` (Zod-validated)
- Query helpers from `@devkit/duckdb` (`queryAll`, `queryOne`, `execute`, `withTransaction`)
- Structured logging via `@devkit/logger` (Pino-based)
- Biome for linting/formatting: 2-space indent, 120 line width, double quotes, semicolons
- Tests co-located with source files (`*.test.ts`)
