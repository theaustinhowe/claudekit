# ClaudeKit API Reference

Complete reference for all HTTP endpoints, WebSocket connections, and Server Actions across the ClaudeKit monorepo.

---

## Table of Contents

- [Overview](#overview)
- [Authentication](#authentication)
- [Error Handling](#error-handling)
- [Common Patterns](#common-patterns)
- [apps/web (Port 2000)](#appsweb-port-2000)
- [apps/gadget (Port 2100)](#appsgadget-port-2100)
- [apps/inside (Port 2150)](#appsinside-port-2150)
- [apps/gogo-web (Port 2200)](#appsgogo-web-port-2200)
- [apps/gogo-orchestrator (Port 2201)](#appsgogo-orchestrator-port-2201)
- [apps/b4u (Port 2300)](#appsb4u-port-2300)
- [apps/inspector (Port 2400)](#appsinspector-port-2400)
- [apps/ducktails (Port 2050)](#appsducktails-port-2050)
- [Shared Types](#shared-types)
- [Server Actions](#server-actions)

---

## Overview

| Metric | Count |
|--------|-------|
| Total REST endpoints | ~150 |
| Next.js API route files | 91 |
| Fastify route groups | 10 |
| Server Action files | 42 |
| Exported server action functions | ~170 |
| Apps with API routes | 6 |
| Apps with Server Actions | 7 |

All apps are **local-only** with no external network exposure. The sole exception requiring authentication is `gogo-orchestrator`.

---

## Authentication

### Next.js Apps (web, gadget, inside, b4u, inspector, ducktails)

No authentication. All endpoints are local-only and trust the caller.

### GoGo Orchestrator (Port 2201)

**Bearer token** authentication on all routes except `/api/health` and `/api/setup`.

```
Authorization: Bearer <token>
```

- Token is stored in the DuckDB settings table or via `API_TOKEN` env var.
- On fresh installs with no token configured, auth is skipped to allow the setup flow.
- CORS restricted to `localhost:2200`, `localhost:3000` (configurable via `ALLOWED_ORIGINS` env var).

**Error responses:**

| Status | Body |
|--------|------|
| `401` | `{ "error": "Authentication required" }` |
| `401` | `{ "error": "Invalid token" }` |

### GitHub API Access

Several apps use `GITHUB_PERSONAL_ACCESS_TOKEN` for GitHub API calls (Inspector, GoGo Orchestrator). This is a server-side env var, not exposed to clients.

---

## Error Handling

### Standard Error Response Shape

All apps follow a consistent convention (not a formal shared type):

```json
{
  "error": "Human-readable error message",
  "details": {}
}
```

- `error` — always a string, always present on errors
- `details` — optional; contains Zod validation tree or structured context

### Status Codes

| Code | Meaning |
|------|---------|
| `200` | Success |
| `201` | Created (new resource) |
| `206` | Partial Content (range requests for video) |
| `400` | Bad request / validation error |
| `401` | Authentication required or invalid token |
| `403` | Forbidden (path traversal, restricted directory) |
| `404` | Resource not found |
| `409` | Conflict (e.g., deleting repo with running jobs) |
| `422` | Validation failure (via `@claudekit/validation`) |
| `500` | Internal server error |
| `503` | Service unavailable (daemon not running) |

### Validation Patterns

**Fastify routes (GoGo Orchestrator):**
```typescript
const parsed = schema.safeParse(request.body);
if (!parsed.success) {
  reply.status(400).send({ error: "Invalid request", details: z.treeifyError(parsed.error) });
}
```

**Next.js routes (B4U, others):**
```typescript
// Uses @claudekit/validation
const parsed = await parseBody(request, schema);
if (!parsed.ok) {
  return NextResponse.json({ error: parsed.error }, { status: parsed.status });
}
```

- `parseBody` returns status `400` for invalid JSON, `422` for schema violations (up to 5 issue messages joined by semicolons).

---

## Common Patterns

### Session System

Gadget, Inspector, Inside, and B4U share a session pattern from `@claudekit/session/next`. Each app exposes:

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/sessions` | List sessions with optional query filters |
| `POST` | `/api/sessions` | Create a new session |
| `GET` | `/api/sessions/[id]` | Get session details + recent logs |
| `GET` | `/api/sessions/[id]/stream` | SSE stream of session events |
| `POST` | `/api/sessions/[id]/cancel` | Cancel a running session |
| `POST` | `/api/sessions/cleanup` | Clean up stale/orphaned sessions |

**Session Create Body:**
```json
{
  "type": "scan | analyze | record | ...",
  "label": "Human-readable label",
  "contextType": "repo | project | ...",
  "contextId": "uuid",
  "contextName": "display name",
  "metadata": {}
}
```

**Session Response:**
```json
{
  "id": "uuid",
  "session_type": "string",
  "status": "pending | running | done | error | cancelled",
  "label": "string",
  "recentLogs": []
}
```

**SSE Stream Events** (`text/event-stream`):
```
data: {"type":"log","message":"...","progress":0.5,"phase":"scanning"}
data: {"type":"chunk","chunk":"partial text"}
data: {"type":"done","result":{}}
data: {"type":"error","message":"something failed"}
```

### Filesystem Browsing

Gadget, B4U, and Inside each expose an identical `/api/fs/browse` endpoint:

| Method | Path | Query Params | Response |
|--------|------|-------------|----------|
| `GET` | `/api/fs/browse` | `path?` (default: `~`), `showHidden?` | `{ currentPath, parentPath, entries: [{ name, path, hasChildren }] }` |

**Security:** Restricts browsing to the user's home directory. Resolves symlinks to prevent traversal.

### Claude Usage

All Next.js apps (except web and ducktails) share `claude-usage.ts` server actions wrapping `@claudekit/claude-usage`:
- `getClaudeUsageStatsAction()` → `ClaudeUsageStats`
- `getClaudeRateLimitsAction()` → `ClaudeRateLimits`

---

## apps/web (Port 2000)

Dashboard and app health monitor. No database — uses JSON files and port probing.

### App Health

#### `GET /api/health/apps`

Returns health status of all ClaudeKit apps by probing their ports.

**Response** `200`:
```json
[
  {
    "id": "gadget",
    "name": "Gadget",
    "description": "Repository auditor",
    "port": 2100,
    "url": "http://localhost:2100",
    "status": "online | offline | starting",
    "icon": "string",
    "maturity": 75,
    "settings": { "autoStart": false, "autoRestart": false },
    "managedByDaemon": false
  }
]
```

### App Control

#### `POST /api/apps/[id]/stop`

Stops an app via the daemon control server (port 2999).

| Parameter | In | Type | Description |
|-----------|----|------|-------------|
| `id` | path | string | App identifier |

**Response** `200`: Proxied from daemon.
**Response** `503`: `{ "error": "Daemon not running" }`

#### `POST /api/apps/[id]/restart`

Restarts an app via the daemon control server.

| Parameter | In | Type | Description |
|-----------|----|------|-------------|
| `id` | path | string | App identifier |

**Response** `200`: Proxied from daemon.
**Response** `503`: `{ "error": "Daemon not running" }`

### App Settings

#### `GET /api/apps/settings`

Returns per-app settings (autoStart, autoRestart).

**Response** `200`:
```json
{
  "version": 1,
  "apps": {
    "gadget": { "autoStart": false, "autoRestart": false }
  }
}
```

#### `PUT /api/apps/settings`

Updates per-app settings.

**Body:**
```json
{
  "version": 1,
  "apps": {
    "gadget": { "autoStart": true, "autoRestart": true }
  }
}
```

**Response** `200`: `{ "ok": true }`

### App Maturity

#### `GET /api/apps/maturity`

Returns maturity score overrides.

#### `PUT /api/apps/maturity`

**Body:** `{ "gadget": 80, "inspector": 60 }` (values 0–100)

**Response** `200`: `{ "ok": true }`

### Log Viewing

#### `GET /api/logs`

Lists all available log files.

**Response** `200`:
```json
[{ "app": "gadget", "date": "2026-02-25", "path": "/path/to/log", "size": 1024, "lastModified": "..." }]
```

#### `GET /api/logs/[app]`

Returns log entries for a specific app.

| Parameter | In | Type | Description |
|-----------|----|------|-------------|
| `app` | path | string | App name |
| `date` | query | string | Date filter (YYYY-MM-DD) |
| `level` | query | string | Minimum log level |
| `q` | query | string | Search text |
| `since` | query | string | Time window (e.g., `1h`, `30m`) |
| `limit` | query | number | Max entries |

**Response** `200`: `{ "entries": [...], "total": 100 }`

#### `GET /api/logs/[app]/stream`

SSE stream for real-time log tailing. Sends last 50 lines then watches for new content with 15s heartbeat.

| Parameter | In | Type | Description |
|-----------|----|------|-------------|
| `app` | path | string | App name |
| `date` | query | string | Date filter |

### Todos

#### `GET /api/todos/[app]`

Returns todos for an app.

**Response** `200`: `Todo[]`

#### `POST /api/todos/[app]`

Creates a new todo.

**Body:** `{ "text": "Fix the bug" }`
**Response** `201`: `Todo`

#### `PATCH /api/todos/[app]`

Updates a todo.

**Body:** `{ "id": "uuid", "resolved": true, "text": "Updated text" }`
**Response** `200`: `Todo`

#### `DELETE /api/todos/[app]`

Deletes a todo or clears completed.

**Body:** `{ "id": "uuid" }` or `{ "clearCompleted": true }`
**Response** `200`: `{ "ok": true }` or `Todo[]`

---

## apps/gadget (Port 2100)

Repository auditor with AI-powered scanning, finding management, and code browsing.

### Repositories

#### `GET /api/repos`

Lists all repositories with finding counts.

**Response** `200`:
```json
[{
  "id": "uuid", "name": "string", "local_path": "/path",
  "critical_count": 0, "warning_count": 2, "info_count": 5
}]
```

#### `POST /api/repos`

Registers a new repository.

**Body:**
```json
{
  "name": "my-repo",
  "local_path": "/Users/me/repos/my-repo",
  "git_remote": "https://github.com/owner/repo",
  "default_branch": "main",
  "package_manager": "pnpm",
  "repo_type": "monorepo",
  "is_monorepo": true
}
```

**Response** `201`: `{ "id": "uuid" }`

#### `DELETE /api/repos`

Deletes a repository by query param.

| Parameter | In | Type | Description |
|-----------|----|------|-------------|
| `id` | query | string | Repository ID |

**Response** `200`: `{ "success": true }`

#### `DELETE /api/repos/[repoId]`

Deletes a repository by path param.

**Response** `200`: `{ "success": true }`
**Response** `404`: `{ "error": "Repository not found" }`

#### `GET /api/repos/[repoId]/raw`

Serves raw file content (images) from a repository.

| Parameter | In | Type | Description |
|-----------|----|------|-------------|
| `repoId` | path | string | Repository ID |
| `path` | query | string | Relative file path |

**Response** `200`: Binary data with appropriate Content-Type.
**Response** `403`: Path traversal detected.

### Discovery

#### `POST /api/discover`

Discovers git repositories in specified directories.

**Body:**
```json
{
  "roots": ["/Users/me/repos"],
  "excludePatterns": ["node_modules"]
}
```

**Response** `200`: `{ "count": 5, "repos": [{ "name": "...", "localPath": "...", "repoType": "..." }] }`

### Scans & Findings

#### `GET /api/scans`

Lists all completed scans.

**Response** `200`: `Scan[]`

#### `GET /api/findings`

Lists findings with optional filters.

| Parameter | In | Type | Description |
|-----------|----|------|-------------|
| `repoId` | query | string | Filter by repo |
| `scanId` | query | string | Filter by scan |
| `severity` | query | string | Filter by severity |

**Response** `200`: `Finding[]` (with parsed `suggested_actions`)

### Fix Actions

#### `GET /api/fixes`

Lists available fix actions.

| Parameter | In | Type | Description |
|-----------|----|------|-------------|
| `repoId` | query | string | Filter by repo |
| `scanId` | query | string | Filter by scan |

**Response** `200`: `FixAction[]`

#### `GET /api/fixes/preview`

Previews a fix action's diff.

| Parameter | In | Type | Description |
|-----------|----|------|-------------|
| `id` | query | string | Fix action ID |

**Response** `200`: `{ "id": "...", "title": "...", "diff_file": "...", "diff_before": "...", "diff_after": "..." }`

#### `POST /api/fixes/apply`

Applies one or more fix actions to a repository.

**Body:** `{ "repoId": "uuid", "fixActionIds": ["uuid", "uuid"] }`
**Response** `200`: Apply result object.

#### `POST /api/fixes/restore`

Restores a previous fix application.

**Body:** `{ "runId": "uuid" }`
**Response** `200`: `{ "success": true }`

### Policies

#### `GET /api/policies`

Lists all policies.

**Response** `200`: `Policy[]`

#### `POST /api/policies`

Creates a new policy.

**Body:**
```json
{
  "name": "Security Policy",
  "description": "Enforce security standards",
  "expected_versions": {},
  "banned_dependencies": [],
  "allowed_package_managers": ["pnpm"],
  "preferred_package_manager": "pnpm",
  "ignore_patterns": []
}
```

**Response** `201`: `{ "id": "uuid" }`

#### `PUT /api/policies`

Updates an existing policy.

**Body:** Same as POST plus `"id": "uuid"`.
**Response** `200`: `{ "success": true }`

### Reports

#### `GET /api/reports`

Generates a scan report in various formats.

| Parameter | In | Type | Description |
|-----------|----|------|-------------|
| `format` | query | `json \| markdown \| pr` | Output format |
| `scanId` | query | string | Specific scan |

**Response** `200`: JSON object or `text/markdown`.

### Toolbox

#### `POST /api/toolbox/check`

Runs tool availability checks.

**Body:** `{ "toolIds": ["biome", "pnpm", "git"] }`
**Response** `200`: `{ "results": {...} }`

#### `POST /api/toolbox/run`

Executes a tool install or update command. Returns an SSE stream of command output.

**Body:** `{ "toolId": "node", "action": "install" | "update", "installMethod": "brew" }`
**Response** `200`: `text/event-stream` (SSE with command output)

#### `GET /api/toolbox/settings`

Returns the list of selected toolbox tool IDs.

**Response** `200`: `{ "toolIds": ["node", "pnpm", "biome"] }`

#### `PUT /api/toolbox/settings`

Updates toolbox tool selection.

**Body:** `{ "toolIds": ["node", "pnpm", "biome"] }`
**Response** `200`: `{ "ok": true }`

### Claude Usage

#### `GET /api/claude-usage`

Returns Claude API rate limits.

**Response** `200`: `{ "rateLimits": {...} }`

### Sessions

See [Common Patterns > Session System](#session-system).

---

## apps/inside (Port 2150)

Project creation, scaffolding, and design workspace.

### Projects

#### `POST /api/projects`

Creates a new project from a template.

**Body:**
```json
{
  "templateId": "next-app",
  "projectName": "my-project",
  "projectPath": "/Users/me/projects",
  "policyId": "uuid",
  "intent": "Build a dashboard",
  "packageManager": "pnpm",
  "features": ["auth", "database"],
  "gitInit": true
}
```

**Response** `200`: `{ "success": true, ... }`
**Response** `400`: Validation error.

#### `DELETE /api/projects/[projectId]`

Deletes a project.

**Response** `200`: `{ "success": true }`
**Response** `404`: `{ "error": "Project not found" }`

#### `GET /api/projects/[projectId]/raw`

Serves raw image files from a project directory.

| Parameter | In | Type | Description |
|-----------|----|------|-------------|
| `projectId` | path | string | Project ID |
| `path` | query | string | Relative file path |

**Response** `200`: Binary image data.
**Response** `403`: Path traversal detected.

#### `GET /api/projects/[projectId]/status`

Returns the current project status.

**Response** `200`: `{ "status": "..." }`

### Dev Server

#### `POST /api/projects/[projectId]/dev-server`

Starts a dev server for the project.

**Response** `200`: `{ "port": 3000, "status": "running" }`

#### `GET /api/projects/[projectId]/dev-server`

Returns dev server status.

**Response** `200`: `{ "running": true, "port": 3000, "pid": 12345, "logs": ["..."] }`

#### `DELETE /api/projects/[projectId]/dev-server`

Stops the dev server.

**Response** `200`: `{ "success": true }`

### Auto-Fix

#### `GET /api/projects/[projectId]/auto-fix`

Returns auto-fix state and history.

**Response** `200`:
```json
{
  "enabled": true,
  "status": "idle | running | ...",
  "currentRun": {},
  "history": []
}
```

#### `POST /api/projects/[projectId]/auto-fix`

Controls auto-fix behavior.

**Body:** `{ "action": "enable" | "disable" | "trigger", "projectDir": "...", "errorMessage": "..." }`

#### `DELETE /api/projects/[projectId]/auto-fix`

Cancels the current auto-fix run.

**Response** `200`: `{ "cancelled": true }`

### Export

#### `POST /api/projects/[projectId]/export`

Exports a project to disk.

**Body:** `{ "spec": {}, "mockData": {} }`
**Response** `200`: `{ "success": true, "filesCreated": 12, "projectPath": "/path" }`

### Screenshots

#### `GET /api/projects/[projectId]/screenshots`

Lists project screenshots.

**Response** `200`: `{ "screenshots": [...] }`

#### `POST /api/projects/[projectId]/screenshots`

Captures a new screenshot.

**Body:** `{ "port": 3000, "label": "Homepage", "messageId": "uuid" }`
**Response** `200`: `{ "screenshot": {...} }`

#### `GET /api/projects/[projectId]/screenshots/[screenshotId]`

Serves a screenshot image.

**Response** `200`: `image/png`
**Response** `403`: Path traversal.

### Upgrade Tasks

#### `GET /api/projects/[projectId]/upgrade`

Returns upgrade task status and logs.

**Response** `200`: `{ "status": "...", "tasks": [...], "taskLogs": [...] }`

### Dev Server Cleanup

#### `GET /api/dev-servers/cleanup`

Lists orphaned dev servers.

**Response** `200`: `{ "servers": [...] }`

#### `POST /api/dev-servers/cleanup`

Stops orphaned dev servers.

**Response** `200`: `{ "stopped": [...] }`

### Sessions & Filesystem

See [Common Patterns > Session System](#session-system) and [Filesystem Browsing](#filesystem-browsing).

---

## apps/gogo-web (Port 2200)

Frontend dashboard for GoGo job orchestration. Communicates with `gogo-orchestrator` (port 2201) — has no API routes of its own. Uses server actions only for `claude-usage`.

---

## apps/gogo-orchestrator (Port 2201)

Fastify backend for multi-repo AI agent orchestration. All routes prefixed with `/api/`.

### Health (Public — no auth required)

#### `GET /api/health`

Returns system health status.

**Response** `200`:
```json
{
  "status": "healthy",
  "uptime": 3600,
  "uptimeFormatted": "1h 0m",
  "activeJobs": { "running": 2, "queued": 3 },
  "polling": { "active": true, "lastPoll": "...", "pollIntervalMs": 30000, "throttled": false },
  "agents": {},
  "database": {},
  "github": { "rateLimitTracked": true },
  "shutdown": false,
  "websocket": { "clientCount": 1 }
}
```

#### `GET /api/health/events`

Returns recent health events.

| Parameter | In | Type | Default | Description |
|-----------|----|------|---------|-------------|
| `limit` | query | number | 50 | Max events |

### Agents

#### `GET /api/agents`

Lists registered agent runners.

**Response** `200`: `{ "data": Agent[] }`

#### `GET /api/agents/all`

Lists all known agents (registered + configured).

**Response** `200`: `{ "data": AgentWithStatus[] }`

#### `GET /api/agents/:type`

Returns info for a specific agent type.

**Response** `200`:
```json
{
  "data": {
    "type": "claude-code",
    "displayName": "Claude Code",
    "capabilities": { "canResume": true, "canInject": true, "supportsStreaming": true },
    "activeRunCount": 1
  }
}
```

**Response** `404`: `{ "error": "Agent not found" }`

#### `GET /api/agents/:type/status`

Returns detailed status for an agent type.

**Response** `200`: `{ "data": AgentStatus }`

### Jobs

#### `GET /api/jobs`

Lists jobs with pagination.

| Parameter | In | Type | Default | Description |
|-----------|----|------|---------|-------------|
| `status` | query | JobStatus | — | Filter by status |
| `repositoryId` | query | uuid | — | Filter by repo |
| `limit` | query | 1–100 | 50 | Page size |
| `offset` | query | ≥0 | 0 | Page offset |

**Response** `200`:
```json
{
  "data": [Job],
  "pagination": { "total": 42, "limit": 50, "offset": 0 }
}
```

**`JobStatus` values:** `queued`, `planning`, `awaiting_plan_approval`, `running`, `needs_info`, `ready_to_pr`, `pr_opened`, `pr_reviewing`, `paused`, `failed`, `done`

#### `GET /api/jobs/stale`

Lists jobs that may be stuck.

| Parameter | In | Type | Default | Description |
|-----------|----|------|---------|-------------|
| `thresholdMinutes` | query | number | 60 | Staleness threshold |

**Response** `200`: `{ "data": [Job], "thresholdMinutes": 60, "count": 3 }`

#### `GET /api/jobs/:id`

Returns a single job.

**Response** `200`: `{ "data": Job }`
**Response** `404`: `{ "error": "Job not found" }`

#### `POST /api/jobs`

Creates a job from a GitHub issue.

**Body (Zod validated):**
```json
{
  "issueNumber": 42,
  "issueTitle": "Fix login bug",
  "issueUrl": "https://github.com/owner/repo/issues/42",
  "issueBody": "Optional description"
}
```

**Response** `200`: `{ "data": Job }`

#### `POST /api/jobs/manual`

Creates a manual job (not linked to a GitHub issue).

**Body (Zod validated):**
```json
{
  "repositoryId": "uuid",
  "title": "Refactor auth module",
  "description": "Optional details"
}
```

**Response** `200`: `{ "data": Job }`
**Response** `404`: `{ "error": "Repository not found" }`

#### `POST /api/jobs/:id/actions`

Performs an action on a job. Discriminated union by `type`:

| Action Type | Additional Fields | Description |
|-------------|-------------------|-------------|
| `pause` | `reason?` | Pause execution |
| `resume` | — | Resume paused job |
| `cancel` | `reason?` | Cancel the job |
| `inject` | `message`, `mode: "immediate" \| "queued"` | Inject a message |
| `request_info` | `question` | Request info from job |
| `force_stop` | `reason?` | Force stop the process |
| `retry` | — | Retry a failed job |

**Response** `200`: `{ "data": Job }`

#### `GET /api/jobs/:id/events`

Returns job event history.

| Parameter | In | Type | Default | Description |
|-----------|----|------|---------|-------------|
| `limit` | query | 1–500 | 100 | Page size |
| `offset` | query | ≥0 | 0 | Page offset |
| `after` | query | datetime | — | Only events after this time |

**Response** `200`: `{ "data": [JobEvent] }`

**`JobEventType` values:** `state_change`, `message`, `error`, `github_sync`, `user_action`, `needs_info_response`, `plan_submitted`, `plan_approved`

#### `GET /api/jobs/:id/logs`

Returns job console output.

| Parameter | In | Type | Default | Description |
|-----------|----|------|---------|-------------|
| `limit` | query | 1–1000 | 200 | Max log entries |
| `afterSequence` | query | ≥0 | 0 | Sequence number cursor |
| `stream` | query | LogStream | — | Filter by stream |

**`LogStream` values:** `stdout`, `stdout:tool`, `stdout:thinking`, `stdout:content`, `stderr`, `system`

**Response** `200`: `{ "data": [JobLog] }`

#### `POST /api/jobs/:id/start`

Starts a queued job.

**Response** `200`: `{ "success": true, "message": "Job started" }`

#### `POST /api/jobs/:id/start-claude`

Starts a job with the Claude Code agent.

**Response** `200`: `{ "success": true, "message": "..." }`

#### `POST /api/jobs/:id/resume-claude`

Resumes a paused Claude Code session.

**Body:** `{ "message": "Optional context for resume" }`

#### `POST /api/jobs/:id/start-agent`

Starts a job with a specific agent type.

**Body:** `{ "agentType": "claude-code" }`

#### `POST /api/jobs/:id/resume-agent`

Resumes a job with a specific agent type.

**Body:** `{ "message": "Optional context", "agentType": "claude-code" }`

#### `POST /api/jobs/:id/create-pr`

Creates a GitHub PR from the job's worktree.

**Response** `200`: `{ "success": true, "prUrl": "https://...", "prNumber": 99 }`

#### `POST /api/jobs/:id/approve-plan`

Approves or rejects a job's plan.

**Body:** `{ "approved": true, "message": "Looks good" }`
**Response** `200`: `{ "data": Job }`

#### `POST /api/jobs/:id/check-response`

Checks if a needs_info response has been received.

**Response** `200`: `{ "success": true, "responseFound": true, "message": "..." }`

#### `POST /api/jobs/:id/mock-run` (dev only)

Simulates a job run for development testing.

**Response** `403` in production: `{ "error": "Mock runs only available in development" }`

### Repositories

#### `GET /api/repositories`

Lists all configured repositories (tokens masked in response).

**Response** `200`: `{ "data": [Repository] }`

#### `GET /api/repositories/active`

Lists only active repositories.

**Response** `200`: `{ "data": [Repository] }`

#### `GET /api/repositories/:id`

Returns a single repository.

**Response** `200`: `{ "data": Repository }`
**Response** `404`: `{ "error": "Repository not found" }`

#### `POST /api/repositories`

Adds a new repository.

**Body (Zod validated):**
```json
{
  "owner": "github-username",
  "name": "repo-name",
  "githubToken": "ghp_...",
  "workdirPath": "/path/to/workdir",
  "baseBranch": "main",
  "triggerLabel": "agent",
  "isActive": true,
  "displayName": "My Repo",
  "autoCreateJobs": true,
  "autoStartJobs": false,
  "autoCreatePr": false,
  "removeLabelAfterCreate": true
}
```

**Response** `200`: `{ "data": Repository }`

#### `PATCH /api/repositories/:id`

Updates a repository (all fields optional).

**Response** `200`: `{ "data": Repository }`

#### `DELETE /api/repositories/:id`

Deletes a repository.

| Parameter | In | Type | Description |
|-----------|----|------|-------------|
| `confirm` | query | `true` / `false` | Confirm deletion |

**Response** `200`: `{ "success": true, "orphanedJobs": 0 }`
**Response** `409`: `{ "error": "Cannot delete repository with running jobs", "details": { "runningJobs": [...] } }`

#### `GET /api/repositories/:id/jobs`

Lists jobs for a repository.

| Parameter | In | Type | Default |
|-----------|----|------|---------|
| `status` | query | JobStatus | — |
| `limit` | query | 1–100 | 50 |
| `offset` | query | ≥0 | 0 |

**Response** `200`: `{ "data": [Job], "pagination": {...} }`

#### `GET /api/repositories/:id/settings`

Returns repository-specific settings.

**Response** `200`:
```json
{
  "data": {
    "pollIntervalMs": 30000,
    "testCommand": "pnpm test",
    "agentProvider": "claude-code",
    "triggerLabel": "agent",
    "branchPattern": "agent/{issue}-{slug}",
    "baseBranch": "main",
    "autoCleanup": true,
    "autoStartJobs": false,
    "autoCreatePr": false
  }
}
```

#### `PATCH /api/repositories/:id/settings`

Updates repository settings.

**Body (Zod validated):** Partial of the settings object above. `pollIntervalMs` must be 5000–300000.

**Response** `200`: `{ "data": RepoSettings }`

#### `GET /api/repositories/:id/branches`

Lists branches from the GitHub API.

**Response** `200`: `{ "data": [Branch], "defaultBranch": "main" }`

### Issues

#### `GET /api/repositories/:id/issues`

Lists GitHub issues for a repository (locally cached).

| Parameter | In | Type | Default | Description |
|-----------|----|------|---------|-------------|
| `state` | query | `open \| closed \| all` | `open` | Issue state |
| `labels` | query | string | — | Comma-separated labels |
| `per_page` | query | 1–100 | 30 | Page size |
| `page` | query | ≥1 | 1 | Page number |

**Response** `200`: `{ "data": [Issue], "pagination": {...} }`

#### `POST /api/repositories/:id/issues`

Creates a GitHub issue.

**Body (Zod validated):**
```json
{
  "title": "Bug: login fails",
  "body": "Steps to reproduce...",
  "labels": ["bug", "agent"]
}
```

**Response** `200`: `{ "data": GitHubIssue }`

#### `POST /api/repositories/:id/issues/:issueNumber/job`

Creates a job from an existing issue.

**Response** `200`: `{ "success": true, "jobId": "uuid", "message": "..." }`
**Response** `409`: `{ "error": "Job already exists for this issue" }`

#### `GET /api/repositories/:id/issues/:issueNumber/comments`

Lists comments on an issue.

**Response** `200`: `{ "data": [Comment] }`

#### `POST /api/repositories/:id/issues/:issueNumber/comments`

Posts a comment on an issue.

**Body (Zod validated):** `{ "body": "Comment text" }`
**Response** `200`: `{ "data": GitHubComment }`

#### `POST /api/repositories/:id/issues/sync`

Syncs all issues from GitHub.

**Response** `200`: `{ "success": true, "synced": 15, "comments": 42, "message": "..." }`

### Research

#### `GET /api/research/sessions`

Lists research sessions with suggestion counts.

**Response** `200`: `{ "data": [ResearchSession] }`

#### `GET /api/research/:id`

Returns a research session with its suggestions.

**Response** `200`: `{ "data": { ...ResearchSession, "suggestions": [...] } }`

#### `POST /api/research/sessions`

Starts a new research session.

**Body (Zod validated):**
```json
{
  "repositoryId": "uuid",
  "focusAreas": ["security", "performance", "testing"]
}
```

**`focusAreas` values:** `ui`, `ux`, `security`, `durability`, `performance`, `testing`, `accessibility`, `documentation`

**Response** `200`: `{ "data": ResearchSession }`

#### `DELETE /api/research/:id`

Deletes a research session.

**Response** `200`: `{ "success": true }`

#### `GET /api/research/suggestions`

Lists research suggestions with filters.

| Parameter | In | Type | Description |
|-----------|----|------|-------------|
| `sessionId` | query | uuid | Filter by session |
| `category` | query | ResearchCategory | Filter by category |
| `severity` | query | ResearchSeverity | Filter by severity |

**`ResearchSeverity` values:** `low`, `medium`, `high`, `critical`

**Response** `200`: `{ "data": [ResearchSuggestion] }`

#### `POST /api/research/:id/suggestions/:suggestionId/convert`

Converts a suggestion to a job or GitHub issue.

**Body (Zod validated):**
```json
{ "convertTo": "github_issue" | "manual_job" }
```

**Response** `200`:
```json
{
  "data": {
    "convertedTo": "github_issue",
    "convertedId": "42",
    "job": null
  }
}
```

### Settings

#### `GET /api/settings`

Returns global orchestrator settings.

**Response** `200`:
```json
{
  "data": {
    "personalAccessToken": "ghp_***masked***",
    "workDirectory": "/path/to/work",
    "maxParallelJobs": 3
  }
}
```

#### `PUT /api/settings`

Updates global settings.

**Body:** `{ "personalAccessToken": "ghp_...", "workDirectory": "/path", "maxParallelJobs": 5 }`
**Response** `200`: `{ "data": {...} }`

### Setup (Public — no auth required)

#### `GET /api/setup/status`

Checks if initial setup is needed.

**Response** `200`: `{ "needsSetup": true, "repositoryCount": 0 }`

#### `POST /api/setup/verify-github`

Verifies a GitHub token.

**Body:** `{ "token": "ghp_..." }`
**Response** `200`:
```json
{
  "success": true,
  "data": {
    "username": "octocat",
    "name": "The Octocat",
    "avatarUrl": "https://...",
    "scopes": ["repo", "..."],
    "rateLimit": { "limit": 5000, "remaining": 4999, "reset": 1234567890 }
  }
}
```
**Response** `401`: `{ "success": false, "error": "Invalid token" }`

#### `POST /api/setup/verify-repository`

Verifies access to a GitHub repository.

**Body:**
```json
{
  "token": "ghp_...",
  "reuseTokenFromRepoId": "uuid",
  "owner": "owner",
  "name": "repo"
}
```

**Response** `200`:
```json
{
  "success": true,
  "data": {
    "fullName": "owner/repo",
    "visibility": "private",
    "defaultBranch": "main",
    "openIssuesCount": 12,
    "canPush": true,
    "description": "My repo"
  }
}
```

#### `POST /api/setup/verify-workspace`

Verifies a workspace directory path.

**Body:** `{ "path": "/Users/me/work" }`
**Response** `200`: `{ "success": true, "data": { "path": "...", "exists": true, "writable": true, "canCreate": true } }`

#### `POST /api/setup/browse-directory`

Browses directories for setup.

**Body:** `{ "path": "/Users/me" }`
**Response** `200`: `{ "success": true, "data": { "path": "...", "parent": "...", "directories": [...] } }`

#### `POST /api/setup/discover-repos`

Discovers git repos in a directory.

**Body:** `{ "path": "/Users/me/repos", "maxDepth": 3 }`
**Response** `200`: `{ "success": true, "data": { "repos": [DiscoveredRepo], "scannedPath": "..." } }`

#### `POST /api/setup/complete`

Completes the setup flow by adding a repository.

**Body (Zod validated):**
```json
{
  "githubToken": "ghp_...",
  "reuseTokenFromRepoId": "uuid",
  "owner": "owner",
  "name": "repo",
  "triggerLabel": "agent",
  "baseBranch": "main",
  "workdirPath": "/Users/me/work"
}
```

**Response** `200`: `{ "success": true, "data": { "id": "uuid", "owner": "...", "name": "...", "isNew": true } }`

### System

#### `GET /api/system/network-info`

Returns network info for remote connections.

**Response** `200`: `{ "data": { "ips": ["192.168.1.100"], "port": 2201, "wsPort": 2201 } }`

### Worktrees

#### `GET /api/worktrees`

Lists all git worktrees with associated job and repo info.

**Response** `200`: `{ "data": [Worktree] }`

#### `GET /api/worktrees/:jobId/pr-status`

Checks if the job's PR has been merged.

**Response** `200`: `{ "merged": false, "prNumber": 99, "prUrl": "https://..." }`

#### `GET /api/worktrees/:jobId/changes`

Lists changed files in a job's worktree.

**Response** `200`: `{ "files": ["src/index.ts", "..."], "baseBranch": "main" }`

#### `GET /api/worktrees/:jobId/diff`

Returns a diff for a specific file.

| Parameter | In | Type | Description |
|-----------|----|------|-------------|
| `path` | query | string | File path within worktree |

**Response** `200`: `{ "diff": "unified diff string", "filePath": "...", "baseBranch": "main" }`

#### `GET /api/worktrees/by-path/changes`

Lists changed files by worktree path.

| Parameter | In | Type | Description |
|-----------|----|------|-------------|
| `worktreePath` | query | string | Absolute worktree path |

**Response** `200`: `{ "files": [...], "baseBranch": "main" }`

#### `GET /api/worktrees/by-path/diff`

Returns a diff by worktree path.

| Parameter | In | Type | Description |
|-----------|----|------|-------------|
| `worktreePath` | query | string | Absolute worktree path |
| `path` | query | string | File path within worktree |

**Response** `200`: `{ "diff": "...", "filePath": "...", "baseBranch": "main" }`

#### `POST /api/worktrees/:jobId/cleanup`

Cleans up a single job's worktree.

**Response** `200`: `{ "success": true, "cleaned": { "worktreePath": "...", "jobsDir": "..." } }`

#### `POST /api/worktrees/cleanup`

Bulk worktree cleanup.

**Body:**
```json
{
  "dryRun": false,
  "jobIds": ["uuid"],
  "includeStatuses": ["done", "failed"]
}
```

**Response** `200`: `{ "data": { "cleaned": [...], "errors": [...], "skipped": [...] }, "dryRun": false }`

### WebSocket

#### `ws://localhost:2201/ws`

Real-time bidirectional communication for job log streaming.

**Message size limit:** 16KB

**Client → Server messages:**

| Type | Payload | Description |
|------|---------|-------------|
| `subscribe` | `{ jobId, lastSequence? }` | Subscribe to job logs |
| `unsubscribe` | `{ jobId }` | Unsubscribe from job |
| `subscribe_repo` | `{ repositoryId }` | Subscribe to all repo events |
| `unsubscribe_repo` | `{ repositoryId }` | Unsubscribe from repo |
| `ping` | — | Keep-alive |

**Server → Client messages:**

| Type | Description |
|------|-------------|
| `connection:established` | Initial connection confirmation |
| `subscribed` | Subscription confirmed |
| `unsubscribed` | Unsubscription confirmed |
| `job:log` | New log entry for a subscribed job |
| `job:updated` | Job state change |
| `job:created` | New job created |
| `issue:synced` | GitHub issues synced |
| `health:event` | Health event broadcast |
| `research:updated` | Research session update |
| `research:suggestion` | New research suggestion |
| `research:output` | Research output chunk |
| `pong` | Response to ping |
| `error` | Error message |

---

## apps/b4u (Port 2300)

Automated repository walkthrough video generator.

### Analysis Pipeline

#### `POST /api/analyze/project`

Starts project analysis (phase 1).

**Body:** `{ "path": "/Users/me/repo", "runId": "uuid" }`
**Response** `200`: `{ "sessionId": "uuid" }`

#### `POST /api/analyze/outline`

Generates walkthrough outline (phase 2).

**Body:** `{ "runId": "uuid" }`
**Response** `200`: `{ "sessionId": "uuid" }`

#### `POST /api/analyze/data-plan`

Generates mock data plan (phase 3).

**Body:** `{ "runId": "uuid" }`
**Response** `200`: `{ "sessionId": "uuid" }`

#### `POST /api/analyze/scripts`

Generates recording scripts (phase 4).

**Body:** `{ "runId": "uuid" }`
**Response** `200`: `{ "sessionId": "uuid" }`

#### `POST /api/analyze/edit`

Requests edits to a phase's output.

**Body:** `{ "phase": 2, "editRequest": "Make the outline shorter", "runId": "uuid" }`

### Data Management

#### `GET /api/user-flows` · `PUT /api/user-flows`

**Query:** `runId` (required)
**PUT Body (Zod validated):** Array of user flows (max 20), each with `id`, `name`, `steps` (1–20 strings).

#### `GET /api/mock-data-entities`

**Query:** `runId` (required)
**Response** `200`: `Entity[]`

#### `GET /api/auth-overrides` · `PATCH /api/auth-overrides`

**PATCH Body:** `{ "id": "uuid", "enabled": true, "runId": "uuid" }`

#### `GET /api/env-config` · `PATCH /api/env-config`

**PATCH Body:** `{ "id": "uuid", "enabled": true, "runId": "uuid" }`

#### `GET /api/flow-scripts` · `PUT /api/flow-scripts`

**PUT Body (Zod validated):** Array of flow scripts (max 20), each with `flowId`, `flowName`, `steps` (max 50 per flow with `id`, `stepNumber`, `url`, `action`, `expectedOutcome`, `duration`).

#### `GET /api/voiceover-scripts` · `PUT /api/voiceover-scripts`

**PUT Body:** `Record<flowId, string[]>` (paragraphs, max 5000 chars each).

#### `GET /api/timeline-markers` · `PUT /api/timeline-markers`

**PUT Body:** `Record<flowId, TimelineMarker[]>`
**PUT Response:** `{ "ok": true }`

#### `GET /api/routes` · `PUT /api/routes`

**PUT Body (Zod validated):** Array of routes (max 50), each with `path` (must start with `/`, max 200), `title` (max 100), `authRequired`, `description` (max 500).

#### `GET /api/file-tree` · `PUT /api/file-tree`

**Query:** `runId` (required)
**PUT Body:** `{ "tree": {...}, "name": "optional" }`

#### `GET /api/chapter-markers`

**Query:** `runId` (required)
**Response** `200`: `[{ "flowName": "Login Flow", "startTime": 0 }]`

#### `GET /api/project-summary`

**Query:** `runId` (required)
**Response** `200`: `{ "name": "...", "framework": "...", "directories": [...], "auth": {...}, "database": {...} }`

### Chat

#### `POST /api/chat`

Sends a message to the AI assistant.

**Body:** `{ "message": "Can you add more steps?", "phase": 2, "runId": "uuid" }`
**Response** `200`: `{ "response": "Sure, here's...", "suggestedAction": "edit_outline" }`

### Audio

#### `GET /api/voice-options`

Lists available TTS voices (cached 5 min from ElevenLabs API).

**Response** `200`: `[{ "id": "voice_id", "name": "Rachel", "style": "narrative" }]`

#### `GET /api/audio/voices`

Lists available voices.

**Response** `200`: `[{ "id": "...", "name": "...", "style": "..." }]`

#### `POST /api/audio/generate`

Starts audio generation for voiceover.

**Body:** `{ "voiceId": "voice_id", "speed": 1.0, "runId": "uuid" }`
**Response** `200`: `{ "sessionId": "uuid" }`

#### `POST /api/audio/preview`

Generates a short audio preview.

**Body:** `{ "text": "Hello world", "voiceId": "voice_id" }`
**Response** `200`: `audio/mpeg` binary data.

#### `GET /api/audio/serve`

Serves the combined walkthrough audio.

**Response** `200`: `audio/mpeg` binary data.
**Response** `404`: Audio not yet generated.

### Recording

#### `POST /api/recording/start`

Starts recording walkthrough flows.

**Body:** `{ "projectPath": "/path/to/project", "flowIds": ["flow1", "flow2"], "runId": "uuid" }`
**Response** `200`: `{ "sessionId": "uuid" }`

#### `GET /api/recording/status`

Returns recording session status.

| Parameter | In | Type | Description |
|-----------|----|------|-------------|
| `sessionId` | query | string | Specific session |
| `runId` | query | string | Current run |

**Response** `200`: Session status object or `{ "sessions": [...], "hasRecoverable": false }`

### Video

#### `POST /api/video/merge`

Merges recorded clips into final video.

**Body:** `{ "runId": "uuid" }`
**Response** `200`: `{ "sessionId": "uuid" }`

#### `GET /api/video/info`

Returns video metadata.

**Query:** `runId` (required)
**Response** `200`: `{ "id": "uuid", "durationSeconds": 120 }`

#### `GET /api/video/serve/[id]`

Streams video with range request support.

**Headers:** `Range: bytes=0-1024` (optional)
**Response** `200` or `206`: `video/mp4` stream.

### Run State

#### `GET /api/runs/[runId]`

Returns the full state of a run.

**Response** `200`:
```json
{
  "runId": "uuid",
  "projectPath": "/path",
  "projectName": "My App",
  "currentPhase": 2,
  "phaseStatuses": { "1": "done", "2": "running" },
  "messages": [...]
}
```

#### `DELETE /api/runs/[runId]`

Deletes a run and its data.

**Response** `200`: `{ "ok": true }`

#### `PUT /api/runs/[runId]/state` · `POST /api/runs/[runId]/state`

Saves run state.

**Body:**
```json
{
  "messages": [...],
  "currentPhase": 2,
  "phaseStatuses": { "1": "done", "2": "running" },
  "projectPath": "/path",
  "projectName": "My App"
}
```

**Response** `200`: `{ "ok": true }`

### Preflight

#### `GET /api/preflight`

Checks external dependency availability before starting a run.

**Response** `200`:
```json
{
  "ok": true,
  "checks": [
    { "name": "ffmpeg", "available": true, "message": "ffmpeg is installed" },
    { "name": "elevenlabs", "available": false, "message": "ELEVENLABS_API_KEY not set..." }
  ]
}
```

### Phase Threads

#### `GET /api/runs/[runId]/threads/[threadId]`

Returns a phase thread (revision history for a specific phase).

**Response** `200`: `{ "id": "...", "runId": "...", "phase": 2, "revision": 1, "messages": [...], "decisions": [...], "status": "...", "createdAt": 1234567890 }`
**Response** `404`: `{ "error": "Thread not found" }`

#### `PUT /api/runs/[runId]/threads/[threadId]`

Creates or updates a phase thread.

**Body:** `{ "phase": 2, "revision": 1, "messages": [...], "decisions": [...], "status": "active", "createdAt": "..." }`
**Response** `200`: `{ "ok": true }`

### Phase Validation

#### `GET /api/runs/[runId]/validate-phase`

Validates that prerequisites for a phase are met before advancement.

| Parameter | In | Type | Description |
|-----------|----|------|-------------|
| `phase` | query | number (2–7) | Phase to validate |

**Response** `200`: `{ "valid": true }` or `{ "valid": false, "message": "Complete Phase N first." }`

### Sessions & Filesystem

See [Common Patterns > Session System](#session-system) and [Filesystem Browsing](#filesystem-browsing).

B4U also exposes:

#### `GET /api/sessions/history`

Returns all run entries.

**Response** `200`: `{ "runs": [RunEntry] }`

#### `POST /api/fs/tree`

Builds a file tree for a project.

**Body:** `{ "path": "/Users/me/repo" }`
**Response** `200`: `{ "name": "...", "path": "...", "framework": "...", "auth": {...}, "database": {...}, "directories": [...], "tree": {...} }`

---

## apps/inspector (Port 2400)

GitHub PR analysis, skill building, and comment resolution.

Inspector uses **server actions** as its primary data layer rather than REST API routes. The only REST routes are the shared session endpoints.

### REST Routes

See [Common Patterns > Session System](#session-system). Inspector exposes the standard `GET /api/sessions`, `POST /api/sessions`, `GET /api/sessions/[id]/stream`, `POST /api/sessions/[id]/cancel`, and `POST /api/sessions/cleanup` endpoints.

### Server Actions

Inspector's functionality is accessed via Next.js Server Actions:

- **Account:** `hasValidPAT`, `getAuthenticatedUser`, `startAccountSync`, `getAccountPRs`, `getAccountStats`
- **GitHub sync:** `syncRepo`, `syncPRs`, `syncPRComments`, `fetchPRDiff`, `fetchFileContent`
- **PR analysis:** `getRecentPRs`, `getDashboardStats`, `getPRsWithComments`, `getLargePRs`, `getWeeklyPRCounts`
- **Skills:** `startSkillAnalysis`, `getSkillAnalyses`, `getSkillsForAnalysis`, `markSkillAddressed`, `getSkillTrends`, `compareAnalyses`
- **Skill groups:** `getSkillGroups`, `getSkillGroupPreview`, `createSkillGroup`, `updateSkillGroup`, `deleteSkillGroup`, `exportSkillGroupAsFiles`
- **PR splitting:** `startSplitAnalysis`, `getSplitPlan`, `updateSubPRDescription`
- **Comment resolution:** `startCommentFixes`, `getCommentFixes`, `resolveCommentFix`, `resolveAllFixes`
- **Reviewers:** `getReviewerStats`, `getReviewerComments`, `getReviewerFileStats`

---

## apps/ducktails (Port 2050)

DuckDB admin UI. Has no REST API routes — all data access is via server actions.

### Server Actions

#### Database Operations

| Function | Description |
|----------|-------------|
| `listDatabases()` | Lists all known DuckDB databases |
| `getDatabaseEntry(id)` | Gets a single database entry |
| `refreshSnapshots()` | Re-scans for database files |

#### Table Operations

| Function | Description |
|----------|-------------|
| `listTables(dbPath)` | Lists tables in a database |
| `getTableSchema(dbPath, table)` | Returns column definitions |
| `getTableRowCount(dbPath, table)` | Returns row count |
| `getSchemaForCompletion(dbPath)` | Returns schema for SQL autocompletion |
| `getTablePrimaryKey(dbPath, table)` | Returns primary key column(s) |

#### Data Operations

| Function | Description |
|----------|-------------|
| `getTableData(dbPath, table, opts)` | Paginated table data with filters |
| `insertRow(dbPath, table, data)` | Inserts a row |
| `updateRow(dbPath, table, key, data)` | Updates a row by primary key |
| `deleteRow(dbPath, table, key)` | Deletes a row by primary key |

#### Query Execution

| Function | Description |
|----------|-------------|
| `executeQuery(dbPath, sql)` | Executes arbitrary SQL and returns results |

---

## Shared Types

### API Response Wrappers (`@claudekit/gogo-shared`)

```typescript
interface ApiResponse<T> {
  data?: T;
  error?: string;
}

interface PaginatedResponse<T> {
  data: T[];
  pagination: { total: number; limit: number; offset: number };
}
```

### Job Status State Machine (`@claudekit/gogo-shared`)

```
queued → planning → awaiting_plan_approval → running → ready_to_pr → pr_opened → pr_reviewing → done
                                              ↓
                                          needs_info
                                              ↓
                                           paused ↔ running
                                              ↓
                                            failed
```

Archivable statuses: `done`, `failed`, `paused`.

### Session Types (`@claudekit/session`)

```typescript
type SessionStatus = "pending" | "running" | "done" | "error" | "cancelled";

interface SessionEvent {
  type: string;
  message?: string;
  progress?: number;
  phase?: string;
  log?: string;
  logType?: string;
  chunk?: string;
  data?: unknown;
}
```

### Claude Usage Types (`@claudekit/claude-usage`)

```typescript
interface ClaudeRateLimits {
  // 5-hour and 7-day usage windows with utilization and reset times
  // Per-model token limits, extra usage credits
}

interface ClaudeUsageStats {
  // Aggregated: sessions, messages, model token counts
  // Daily activity, hourly counts, cost breakdowns
}
```

### WebSocket Protocol Types (`@claudekit/gogo-shared`)

```typescript
type WsMessageType =
  | "job:updated" | "job:log" | "job:created"
  | "issue:synced" | "health:event"
  | "research:updated" | "research:suggestion" | "research:output"
  | "connection:established" | "subscribed" | "unsubscribed"
  | "subscribed_repo" | "unsubscribed_repo"
  | "pong" | "error";

type WsClientMessageType =
  | "subscribe" | "unsubscribe"
  | "subscribe_repo" | "unsubscribe_repo"
  | "ping";
```

---

## Server Actions

All Server Actions use `"use server"` and are called via React Server Components or client-side `useTransition`. They are not HTTP endpoints — they use Next.js internal RPC.

### Cross-App Server Actions

| Action | Apps | Description |
|--------|------|-------------|
| `getClaudeUsageStatsAction` | gadget, inside, inspector, b4u, gogo-web | Claude API usage statistics |
| `getClaudeRateLimitsAction` | gadget, inside, inspector, b4u, gogo-web | Claude API rate limits |
| `createSessionRecord` | gadget, inside, inspector | Create session DB record |
| `updateSessionRecord` | gadget, inside, inspector | Update session status/metadata |
| `listSessions` | gadget, inside, inspector | Query sessions |
| `getSessionRecord` | gadget, inside, inspector | Get single session |
| `getSessionLogsFromDb` | gadget, inside, inspector | Retrieve persisted logs |
| `insertSessionLogs` | gadget, inside, inspector | Batch-persist session logs |
| `getSetting` / `setSetting` | gadget, inside, inspector | App-level key/value settings |

### Gadget-Specific Actions (15 files)

| Module | Key Functions |
|--------|---------------|
| `repos` | `getRepos`, `getRepoById`, `deleteRepos`, `readRepoFile`, `getGitHubRepoSettings`, `updateGitHubRepoSettings`, `setupGitHubRemote` |
| `scans` | `getScanRoots`, `createScanRoot`, `deleteScanRoot` |
| `findings` | `getFindingsForRepo`, `refreshAIFileFindings`, `getAIFilesForRepo` |
| `fixes` | Fix action queries and lifecycle management |
| `policies` | `getPolicies`, `createPolicy`, `updatePolicy`, `deletePolicy` |
| `claude-config` | `getClaudeConfig`, `saveClaudeSettingsJson`, `saveClaudeMd`, `saveDefaultClaudeSettings`, `saveRuleFile`, `removeRuleFile` |
| `concepts` | `getConceptsForRepo`, `getAllConcepts`, `linkConcept`, `unlinkConcept`, `syncConceptToRepo`, `installConcept` |
| `concept-sources` | `getConceptSources`, `createGitHubSource`, `createMcpListSource`, `deleteConceptSource`, `scanConceptSource` |
| `custom-rules` | `getCustomRules`, `createCustomRule`, `updateCustomRule`, `deleteCustomRule`, `toggleCustomRule` |
| `manual-findings` | `createManualFinding`, `updateManualFinding`, `deleteManualFinding`, `resolveManualFinding` |
| `code-browser` | `getDirectoryContents`, `getCodeFileContent`, `getBranches`, `getCommitLog`, `getReadmeContent`, `getFileTree`, `getGitStatus`, `commitChanges` |
| `env-keys` | `readEnvLocal`, `writeEnvKey`, `getConfiguredEnvKeyNames`, `hasGitHubPat` |
| `settings` | `getSetting`, `setSetting`, `getEncryptionKey`, `getCleanupFiles`, `setCleanupFiles`, `getDashboardStats`, `getDashboardOnboardingState` |

### Inside-Specific Actions (9 files)

| Module | Key Functions |
|--------|---------------|
| `generator-projects` | `createGeneratorProject`, `getGeneratorProject`, `getGeneratorProjects`, `updateGeneratorProject`, `deleteGeneratorProject`, `getUiSpec`, `getMockData`, `getDesignMessages`, `createDesignMessage` |
| `screenshots` | `saveScreenshot`, `getProjectScreenshots`, `getLatestScreenshot` |
| `prototype-files` | `getProjectTree`, `getProjectFileContent` |
| `auto-fix` | `saveAutoFixRun`, `updateAutoFixRun`, `getAutoFixHistory`, `getAutoFixEnabled`, `setAutoFixEnabled` |
| `upgrade-tasks` | `getUpgradeTasks`, `createUpgradeTasks`, `updateUpgradeTask`, `deleteUpgradeTasks` |
| `code-browser` | `openFolderInFinder` |

### Inspector-Specific Actions (11 files)

| Module | Key Functions |
|--------|---------------|
| `account` | `hasValidPAT`, `getAuthenticatedUser`, `startAccountSync`, `getAccountPRs`, `getAccountStats` |
| `github` | `syncRepo`, `syncPRs`, `syncPRComments`, `fetchPRDiff`, `fetchFileContent`, `getConnectedRepos`, `removeRepo` |
| `prs` | `getRecentPRs`, `getDashboardStats`, `getPRsWithComments`, `getLargePRs`, `getWeeklyPRCounts`, `getPRComments` |
| `skills` | `startSkillAnalysis`, `getSkillAnalyses`, `getSkillsForAnalysis`, `markSkillAddressed`, `getSkillTrends`, `compareAnalyses` |
| `skill-groups` | `getSkillGroups`, `getSkillGroupPreview`, `createSkillGroup`, `updateSkillGroup`, `deleteSkillGroup`, `exportSkillGroupAsFiles` |
| `splitter` | `startSplitAnalysis`, `getSplitPlan`, `updateSubPRDescription` |
| `resolver` | `startCommentFixes`, `getCommentFixes`, `resolveCommentFix`, `resolveAllFixes` |
| `reviewers` | `getReviewerStats`, `getReviewerComments`, `getReviewerFileStats` |
| `settings` | `getSetting`, `setSetting` |

### DuckTails-Specific Actions (4 files)

| Module | Key Functions |
|--------|---------------|
| `databases` | `listDatabases`, `getDatabaseEntry`, `refreshSnapshots` |
| `tables` | `listTables`, `getTableSchema`, `getTableRowCount`, `getSchemaForCompletion`, `getTablePrimaryKey` |
| `data` | `getTableData`, `insertRow`, `updateRow`, `deleteRow` |
| `query` | `executeQuery` |
