# @claudekit/gogo-shared

Shared domain types, state machine, and constants for the GoGo job orchestration system. This package is the contract between `apps/gogo-web` (frontend) and `apps/gogo-orchestrator` (backend).

## Structure

```
src/
├── index.ts           # Barrel exports
├── types.ts           # All domain types (~250 lines)
├── constants.ts       # State machine, labels, action types
└── constants.test.ts  # State machine invariant tests
```

## Key Exports

### State Machine (`VALID_TRANSITIONS`)

Source of truth for job status transitions. 11 states:

```
queued → planning → awaiting_plan_approval → running → ready_to_pr → pr_opened → pr_reviewing → done
                                                    ↘ needs_info ↗
Any non-terminal state can transition to: paused, failed
failed → queued (retry), done has no transitions (terminal)
```

### Constants

- `VALID_TRANSITIONS` — `Record<JobStatus, JobStatus[]>` defining all legal transitions
- `ARCHIVABLE_STATUSES` — `["done", "failed", "paused"]` for archive/inactive views
- `JOB_STATUS_LABELS` — Human-readable display names (e.g. `awaiting_plan_approval` → `"Plan Review"`)
- `JobActionType` — Client-initiated operations: pause, resume, cancel, inject, approve_plan, reject_plan, etc.

### Core Types

- **`Job`** — Long-running orchestration work unit (status, issue tracking, Claude session, plan content, PR info)
- **`JobEvent`** — State change log (event type, from/to status, message, metadata)
- **`JobLog`** — Console output capture with `LogStream` (stdout, stderr, system, tool, thinking, content)
- **`Repository`** — GitHub repo config (token, trigger label, work directory)
- **`Issue` / `IssueComment`** — Locally cached GitHub data with sync tracking
- **`ResearchSession` / `ResearchSuggestion`** — Repository analysis subsystem (8 categories, 4 severities)

### WebSocket Protocol

- `WsMessageType` — Server → client events (job:updated, job:log, job:created, issue:synced, research:*, etc.)
- `WsClientMessageType` — Client → server (subscribe, unsubscribe, subscribe_repo, ping)

### API Wrappers

- `ApiResponse<T>` — Generic `{ data?, error? }` response
- `PaginatedResponse<T>` — With total, limit, offset

## Patterns

- **No runtime dependencies** — pure TypeScript interfaces and constants
- **No Zod schemas** — types only; consumers validate at their boundaries
- **Plan-first workflow** — `planning` → `awaiting_plan_approval` states with `planContent` and approval tracking on `Job`
- **PR review loop** — `pr_reviewing` state for automated review comment handling
- **Tests enforce completeness** — all statuses must appear in `VALID_TRANSITIONS`, all non-terminal states must allow `failed`
