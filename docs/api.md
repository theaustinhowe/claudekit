# ClaudeKit API Reference

All ClaudeKit apps run locally and expose HTTP APIs. There is no authentication on Next.js app routes (they rely on local-only access). The GoGo Orchestrator requires a Bearer token.

---

## Web Dashboard (port 2000)

### Health & App Management

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/health/apps` | Probe all app ports and return status |
| `GET` | `/api/apps/settings` | Read per-app auto-start/auto-restart settings |
| `PUT` | `/api/apps/settings` | Write per-app settings |
| `GET` | `/api/apps/maturity` | Read maturity percentage overrides |
| `PUT` | `/api/apps/maturity` | Write maturity overrides (values 0-100) |
| `POST` | `/api/apps/:id/stop` | Stop an app via the daemon |
| `POST` | `/api/apps/:id/restart` | Restart an app via the daemon |

### Logs

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/logs` | List all log files from `~/.claudekit/logs/` |
| `GET` | `/api/logs/:app` | Read and filter log entries for an app |
| `GET` | `/api/logs/:app/stream` | SSE endpoint — tails a log file in real time |

**`GET /api/logs/:app` query params:** `date`, `level`, `q` (text search), `since`, `limit` (default 1000)

### Todos

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/todos/:app` | List all todos for an app |
| `POST` | `/api/todos/:app` | Create a todo (`{ text }`) |
| `PATCH` | `/api/todos/:app` | Update a todo (`{ id, resolved?, text? }`) |
| `DELETE` | `/api/todos/:app` | Delete a todo or clear completed (`{ id? }` or `{ clearCompleted }`) |

---

## Gadget — Repository Auditor (port 2100)

### Repositories

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/repos` | List repos with aggregated finding counts |
| `POST` | `/api/repos` | Create a repo record |
| `DELETE` | `/api/repos?id=<id>` | Soft-delete a repo |
| `DELETE` | `/api/repos/:repoId` | Delete repo record and remove directory from disk |
| `GET` | `/api/repos/:repoId/raw?path=<rel>` | Serve a raw image file from a repo directory |

### Discovery & Scanning

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/discover` | Walk filesystem roots to discover git repos |
| `GET` | `/api/scans` | List all scan records |
| `GET` | `/api/findings` | List findings (filters: `repoId`, `scanId`, `severity`) |

### Fixes

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/fixes` | List fix actions (filters: `repoId`, `scanId`) |
| `GET` | `/api/fixes/preview?id=<fixId>` | Get diff preview for a fix |
| `POST` | `/api/fixes/apply` | Apply fix actions to a repo (`{ repoId, fixActionIds }`) |
| `POST` | `/api/fixes/restore` | Restore files from pre-fix snapshot (`{ runId }`) |

### Reports & Policies

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/reports` | Export findings (query: `format=json|markdown|pr`, `scanId?`) |
| `GET` | `/api/policies` | List all policies |
| `POST` | `/api/policies` | Create a policy |
| `PUT` | `/api/policies` | Update a policy |

### Utilities

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/claude-usage` | Current Claude API rate limit info |
| `GET` | `/api/fs/browse` | Browse local directories (query: `path`, `showHidden`) |
| `POST` | `/api/toolbox/check` | Check CLI tool availability (`{ toolIds }`) |

### Sessions

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/sessions` | List sessions (filters: status, type) |
| `POST` | `/api/sessions` | Create and start a session |
| `GET` | `/api/sessions/:sessionId` | Session detail with recent logs |
| `GET` | `/api/sessions/:sessionId/stream` | SSE stream for session events |
| `POST` | `/api/sessions/:sessionId/cancel` | Cancel a running session |

**`POST /api/sessions` body:**

```json
{
  "type": "scan | quick-improve | finding-fix | fix-apply | ai-file-gen | cleanup | toolbox-command",
  "label": "string",
  "contextType": "repo",
  "contextId": "string",
  "contextName": "string",
  "metadata": {}
}
```

---

## B4U — Walkthrough Video Generator (port 2300)

### Project Analysis

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/fs/browse` | Browse local directories |
| `POST` | `/api/fs/tree` | Scan project directory and return file tree + metadata |
| `GET` | `/api/project-summary?runId=<id>` | Stored project summary for a run |

### Sessions & Runs

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/sessions` | List sessions (filters: `status`, `limit`) |
| `POST` | `/api/sessions` | Create a session (`{ sessionType, label, projectPath? }`) |
| `GET` | `/api/sessions/history` | Grouped run history |
| `GET` | `/api/sessions/:id/logs` | Session log entries |
| `GET` | `/api/sessions/:id/stream` | SSE stream for session events |
| `POST` | `/api/sessions/:id/cancel` | Cancel a running session |
| `GET` | `/api/runs/:runId` | Full run state (messages, phases, project info) |
| `PUT` | `/api/runs/:runId` | Upsert run state |
| `DELETE` | `/api/runs/:runId` | Delete all data for a run |

### AI Analysis Pipelines

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/analyze/project` | Start project analysis session (`{ path, runId? }`) |
| `POST` | `/api/analyze/outline` | Generate walkthrough outline (`{ runId? }`) |
| `POST` | `/api/analyze/data-plan` | Generate data plan (`{ runId? }`) |
| `POST` | `/api/analyze/scripts` | Generate flow scripts (`{ runId? }`) |
| `POST` | `/api/analyze/edit` | Edit content for a phase (`{ phase, editRequest, runId? }`) |
| `POST` | `/api/chat` | Send a chat message for a specific phase |

### Recording

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/recording/start` | Start screen recording session |
| `GET` | `/api/recording/status` | Recording session status (query: `sessionId` or `runId`) |

### Audio & Voiceover

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/audio/generate` | Start TTS audio generation (`{ voiceId, speed?, runId? }`) |
| `GET` | `/api/audio/voices` | List available ElevenLabs voices |
| `POST` | `/api/audio/preview` | Generate short TTS preview (`{ text, voiceId }`) |
| `GET` | `/api/audio/serve` | Serve combined walkthrough audio (MP3) |
| `GET` | `/api/voice-options` | Cached voice list (5-minute TTL) |

### Video

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/video/merge` | Start final video merge session (`{ runId? }`) |
| `GET` | `/api/video/info?runId=<id>` | Final video metadata |
| `GET` | `/api/video/serve/:id` | Stream final video (supports range requests) |

### Run Content Management

| Method | Path | Description |
|--------|------|-------------|
| `GET/PUT` | `/api/user-flows?runId=<id>` | User flow definitions |
| `GET` | `/api/mock-data-entities?runId=<id>` | Mock data entities |
| `GET/PATCH` | `/api/auth-overrides?runId=<id>` | Auth override toggles |
| `GET/PATCH` | `/api/env-config?runId=<id>` | Environment variable config |
| `GET/PUT` | `/api/flow-scripts?runId=<id>` | Recorded flow scripts (step-by-step actions) |
| `GET/PUT` | `/api/voiceover-scripts?runId=<id>` | Voiceover narration paragraphs |
| `GET/PUT` | `/api/timeline-markers?runId=<id>` | Voiceover timing markers |
| `GET/PUT` | `/api/routes?runId=<id>` | App route definitions |
| `GET/PUT` | `/api/file-tree?runId=<id>` | Stored file tree |
| `GET` | `/api/chapter-markers?runId=<id>` | Chapter markers (flow name + timestamp) |

---

## Inspector — PR Analysis (port 2400)

Inspector primarily uses Server Actions for data fetching. These API routes exist for the session system.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/sessions` | List sessions |
| `POST` | `/api/sessions` | Create and start a session |
| `GET` | `/api/sessions/:sessionId/stream` | SSE stream for session events |
| `POST` | `/api/sessions/:sessionId/cancel` | Cancel a running session |

---

## GoGo Orchestrator (port 2201, Fastify)

All routes require `Authorization: Bearer <token>` header. The orchestrator also exposes a WebSocket endpoint at `/ws`.

### Health

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/health` | System health (DB, agents, polling, GitHub rate limits, WebSocket clients) |
| `GET` | `/api/health/events?limit=<n>` | Recent structured health events |

### Jobs

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/jobs` | List jobs (query: `status?`, `repositoryId?`, `limit`, `offset`) |
| `GET` | `/api/jobs/stale` | Jobs stuck beyond threshold (query: `thresholdMinutes`) |
| `GET` | `/api/jobs/:id` | Get a single job |
| `POST` | `/api/jobs` | Create job from GitHub issue |
| `POST` | `/api/jobs/manual` | Create manual job (not tied to an issue) |
| `POST` | `/api/jobs/:id/actions` | Perform state-machine action on a job |
| `GET` | `/api/jobs/:id/events` | Job audit trail events |
| `GET` | `/api/jobs/:id/logs` | Job log entries (query: `limit`, `afterSequence`, `stream?`) |
| `POST` | `/api/jobs/:id/start` | Start a full job run with git worktree |
| `POST` | `/api/jobs/:id/start-claude` | Start a Claude Code agent run |
| `POST` | `/api/jobs/:id/resume-claude` | Resume a paused Claude run (`{ message? }`) |
| `POST` | `/api/jobs/:id/start-agent` | Start an agent run (`{ agentType? }`) |
| `POST` | `/api/jobs/:id/resume-agent` | Resume an agent run (`{ message?, agentType? }`) |
| `POST` | `/api/jobs/:id/create-pr` | Create a PR for a completed job |
| `POST` | `/api/jobs/:id/approve-plan` | Approve or reject a job plan (`{ approved, message? }`) |
| `POST` | `/api/jobs/:id/check-response` | Poll for GitHub responses on a needs_info job |
| `POST` | `/api/jobs/:id/mock-run` | Start a mock agent run (dev only) |

**Job actions (`POST /api/jobs/:id/actions`):**

| Action | Description |
|--------|-------------|
| `pause` | Stop running processes, transition to paused |
| `resume` | Transition back to queued |
| `cancel` | Stop all processes, transition to failed |
| `force_stop` | Immediate SIGKILL, transition to failed |
| `inject` | Send a message to running Claude process |
| `request_info` | Post a question to GitHub issue, enter needs_info |
| `approve_plan` | Approve a pending plan |
| `reject_plan` | Reject a pending plan |

### Repositories

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/repositories` | List all repositories |
| `GET` | `/api/repositories/active` | List active repositories |
| `GET` | `/api/repositories/:id` | Get a single repository |
| `POST` | `/api/repositories` | Create a repository |
| `PATCH` | `/api/repositories/:id` | Update a repository |
| `DELETE` | `/api/repositories/:id` | Delete a repository (query: `confirm`) |
| `GET` | `/api/repositories/:id/jobs` | List jobs for a repository |
| `GET` | `/api/repositories/:id/settings` | Get per-repo operational settings |
| `PATCH` | `/api/repositories/:id/settings` | Update per-repo settings |
| `GET` | `/api/repositories/:id/branches` | Fetch branch list from GitHub |

### Issues

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/repositories/:id/issues` | List issues (query: `state`, `labels`, `per_page`, `page`) |
| `POST` | `/api/repositories/:id/issues` | Create issue on GitHub |
| `POST` | `/api/repositories/:id/issues/:num/job` | Create a job from an issue |
| `GET` | `/api/repositories/:id/issues/:num/comments` | List issue comments |
| `POST` | `/api/repositories/:id/issues/:num/comments` | Post a comment on GitHub |
| `POST` | `/api/repositories/:id/issues/sync` | Manually sync issues from GitHub |

### Agents

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/agents` | List registered agent types |
| `GET` | `/api/agents/all` | List all known agents with availability status |
| `GET` | `/api/agents/:type` | Get info for a specific agent type |
| `GET` | `/api/agents/:type/status` | Detailed configuration status |

### Research

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/research/sessions` | List research sessions |
| `POST` | `/api/research/sessions` | Start a research session (`{ repositoryId, focusAreas }`) |
| `GET` | `/api/research/:id` | Get session with suggestions |
| `DELETE` | `/api/research/:id` | Cancel a research session |
| `GET` | `/api/research/suggestions` | List suggestions (filters: `sessionId`, `category`, `severity`) |
| `POST` | `/api/research/:id/suggestions/:suggestionId/convert` | Convert suggestion to job or issue |

### Worktrees

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/worktrees` | List all git worktrees with linked job info |
| `GET` | `/api/worktrees/:jobId/pr-status` | Check if a job's PR has been merged |
| `GET` | `/api/worktrees/:jobId/changes` | List changed files in a job's worktree |
| `GET` | `/api/worktrees/:jobId/diff?path=<file>` | Git diff for a file in a worktree |
| `GET` | `/api/worktrees/by-path/changes` | Changed files by worktree path (query: `worktreePath`) |
| `GET` | `/api/worktrees/by-path/diff` | File diff by worktree path (query: `worktreePath`, `path`) |
| `POST` | `/api/worktrees/:jobId/cleanup` | Remove worktree for a done/failed job |
| `POST` | `/api/worktrees/cleanup` | Bulk worktree cleanup |

### Setup & Settings

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/settings` | Global orchestrator settings |
| `PUT` | `/api/settings` | Update global settings |
| `GET` | `/api/setup/status` | Whether initial setup is needed |
| `POST` | `/api/setup/verify-github` | Verify a GitHub PAT |
| `POST` | `/api/setup/verify-repository` | Verify GitHub repo access |
| `POST` | `/api/setup/verify-workspace` | Verify local directory path |
| `POST` | `/api/setup/browse-directory` | List subdirectories for directory picker |
| `POST` | `/api/setup/discover-repos` | Scan directory for git repos |
| `POST` | `/api/setup/complete` | Complete setup wizard |

### System

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/system/network-info` | Local IPv4 addresses and port info |

### WebSocket (`/ws`)

Persistent connection for real-time job updates.

**Client messages:** `subscribe`, `unsubscribe`, `subscribe_repo`, `unsubscribe_repo`, `ping`, `pong`

**Server events:** `job:log`, `job:updated`, `job:created`, `issue:synced`

On subscribe, the server replays the ring buffer (last 500 entries) using the client's `lastSequence` for resumption.

---

## Shared Patterns

### SSE Streaming

Several endpoints return Server-Sent Events (`text/event-stream`). These include:

- Log tailing (`/api/logs/:app/stream`)
- Session event streams (`/api/sessions/:id/stream`)

SSE endpoints send a heartbeat comment (`: heartbeat`) every 15 seconds to keep connections alive.

### Error Responses

All apps return errors as JSON:

```json
{
  "error": "Description of what went wrong"
}
```

Common HTTP status codes: `400` (bad request/validation), `404` (not found), `409` (conflict), `500` (internal error), `503` (service unavailable).

### Pagination (GoGo Orchestrator)

Paginated endpoints return:

```json
{
  "data": [],
  "pagination": {
    "total": 100,
    "limit": 20,
    "offset": 0
  }
}
```
