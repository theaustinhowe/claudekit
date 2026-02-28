# API Reference

19 REST endpoints under `/api/`. Gadget is a local-first dev tool -- all endpoints are served on `localhost` with no authentication by default.

**Base URL:** `http://localhost:2100`

**Streaming protocols:**
- **SSE** -- Server-Sent Events over `text/event-stream` with `data: <json>\n\n` framing (used by the session stream endpoint)

**Common error shape:**
```json
{ "error": "Human-readable message" }
```

**Status code conventions:** `200` success, `201` created, `400` validation error, `403` forbidden, `404` not found, `500` server error.

---

## Table of Contents

- [Repositories](#repositories) -- CRUD, raw file serving
- [Scans](#scans) -- Scan listing (execution via sessions)
- [Findings](#findings) -- Query audit findings
- [Fixes](#fixes) -- List, preview, apply, restore fix actions
- [Policies](#policies) -- CRUD for audit policies
- [Discovery](#discovery) -- Filesystem repo discovery
- [Reports](#reports) -- Export audit reports
- [Sessions](#sessions) -- Unified session system for long-running operations
- [Claude Usage](#claude-usage) -- Claude CLI rate limit monitoring
- [Filesystem](#filesystem) -- Directory browsing
- [Authentication](#authentication)

---

## Repositories

### `GET /api/repos`

Returns all repositories with aggregated finding counts, ordered by `created_at DESC`.

**Response** `200`: `RepoWithCounts[]`

### `POST /api/repos`

Create a new repository record.

**Body:**
```json
{
  "name": "my-app",
  "local_path": "/Users/me/projects/my-app",
  "git_remote": "https://github.com/me/my-app.git",
  "default_branch": "main",
  "package_manager": "pnpm",
  "repo_type": "nextjs",
  "is_monorepo": false
}
```

**Response** `201`: `{ "id": "<uuid>" }`

### `DELETE /api/repos?id=<uuid>`

Delete a repository and cascade-delete its findings and fix actions.

**Errors:** `400` missing `id`.

### `GET /api/repos/[repoId]`

Get a single repository.

### `GET /api/repos/[repoId]/raw?path=<relative>`

Serve a raw image file from a repository's local path.

**Security:** path traversal prevention -- resolved path must remain within the repo directory.

**Supported types:** `.png`, `.jpg`, `.jpeg`, `.gif`, `.bmp`, `.ico`, `.webp`, `.avif`, `.tiff`, `.tif`

---

## Scans

### `GET /api/scans`

Returns all scans ordered by `created_at DESC`.

> **Note:** Scan execution is handled through the [Sessions](#sessions) system (`session_type: "scan"`). Create a session with `type: "scan"` to start a new scan.

---

## Findings

### `GET /api/findings`

Query findings with optional filters, ordered by severity (critical first).

**Query params:**

| Param | Type | Description |
|---|---|---|
| `repoId` | string | Filter by repository |
| `scanId` | string | Filter by scan |
| `severity` | `"critical"` \| `"warning"` \| `"info"` | Filter by severity |

---

## Fixes

### `GET /api/fixes`

List fix actions with optional filters.

### `GET /api/fixes/preview?id=<uuid>`

Preview a fix action's file diff.

### `POST /api/fixes/apply`

Apply fix actions to disk. Creates a snapshot before applying for rollback support.

**Body:**
```json
{
  "repoId": "<uuid>",
  "fixActionIds": ["<uuid>", "<uuid>"]
}
```

### `POST /api/fixes/restore`

Restore files from a snapshot, rolling back a previous apply run.

**Body:**
```json
{ "runId": "<uuid>" }
```

---

## Policies

### `GET /api/policies`

Returns all policies ordered by `created_at DESC`. JSON fields are parsed from stored JSON.

### `POST /api/policies`

Create a new policy.

### `PUT /api/policies`

Update an existing policy.

---

## Discovery

### `POST /api/discover`

Scan filesystem paths for git repositories without persisting them.

**Body:**
```json
{
  "roots": ["/Users/me/projects"],
  "excludePatterns": ["node_modules"]
}
```

---

## Reports

### `GET /api/reports`

Export audit results as a report. Supports `json`, `markdown`, and `pr` formats.

---

## Sessions

The session system (via `@claudekit/session`) provides a unified abstraction for all long-running operations.

### `GET /api/sessions`

List sessions with optional filters.

**Query params:**

| Param | Type | Description |
|---|---|---|
| `status` | string | Comma-separated status filter (e.g. `"running,done"`) |
| `contextId` | string | Filter by context ID (repo or project ID) |
| `contextType` | `"repo"` \| `"project"` | Filter by context type |
| `type` | `SessionType` | Filter by session type |
| `limit` | number | Max results |

**`SessionType` values:** `"scan"`, `"quick_improve"`, `"finding_fix"`, `"fix_apply"`, `"ai_file_gen"`, `"cleanup"`

### `POST /api/sessions`

Create and start a new session. The session begins executing in the background immediately.

**Body:**
```json
{
  "type": "scan",
  "label": "Scan 3 repos",
  "contextType": "repo",
  "contextId": "<uuid>",
  "contextName": "my-app",
  "metadata": {
    "scanRoots": ["/Users/me/projects"],
    "policyId": "<uuid>"
  }
}
```

**Response** `201`: `{ "sessionId": "<uuid>" }`

### `POST /api/sessions/cleanup`

Clean up completed/stale sessions.

### `GET /api/sessions/[sessionId]`

Get session detail with recent logs.

### `GET /api/sessions/[sessionId]/stream` (SSE)

Subscribe to session events in real-time with replay support.

**Event types:**

| Type | Description |
|---|---|
| `init` | Initial state snapshot |
| `progress` | Progress update with percentage and phase |
| `log` | Log message with `logType` (`"status"`, `"tool"`, `"thinking"`) |
| `done` | Session completed successfully |
| `error` | Session failed, includes `message` |
| `cancelled` | Session was cancelled |
| `heartbeat` | Keep-alive (every 15 seconds) |

### `POST /api/sessions/[sessionId]/cancel`

Cancel a running session. Triggers cleanup and kills any associated Claude CLI process.

---

## Claude Usage

### `GET /api/claude-usage`

Fetch Claude CLI rate limit information via `@claudekit/claude-usage`. Results are cached for 60 seconds.

---

## Filesystem

### `GET /api/fs/browse`

Browse the local filesystem. Restricted to the user's home directory. Returns only directories (not files).

**Query params:**

| Param | Type | Default | Description |
|---|---|---|---|
| `path` | string | `"~"` | Directory to browse (supports `~` expansion) |
| `showHidden` | `"true"` \| `"false"` | `"false"` | Include dot-directories |

**Security:** Rejects any path that resolves outside `$HOME`.

---

## Authentication

Gadget is a local-first tool -- there is no user authentication on API routes by default. All endpoints trust the local environment.

**MCP_API_TOKEN** -- when set in `.env.local`, enables Bearer token auth for programmatic MCP access.

**GITHUB_PERSONAL_ACCESS_TOKEN** -- optional, stored encrypted (AES-256-GCM) in the database. Used by the GitHub client service. Not required for any local endpoints.
