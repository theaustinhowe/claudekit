# API Reference

27 REST endpoints under `/api/`. Gadget is a local-first dev tool — all endpoints are served on `localhost` with no authentication by default.

**Base URL:** `http://localhost:2100`

**Streaming protocols:**
- **SSE** — Server-Sent Events over `text/event-stream` with `data: <json>\n\n` framing (used by the session stream endpoint)

**Common error shape:**
```json
{ "error": "Human-readable message" }
```

**Status code conventions:** `200` success, `201` created, `400` validation error, `403` forbidden, `404` not found, `500` server error.

---

## Table of Contents

- [Repositories](#repositories) — CRUD, raw file serving
- [Scans](#scans) — Scan listing (execution via sessions)
- [Findings](#findings) — Query audit findings
- [Fixes](#fixes) — List, preview, apply, restore fix actions
- [Policies](#policies) — CRUD for audit policies
- [Discovery](#discovery) — Filesystem repo discovery
- [Reports](#reports) — Export audit reports
- [Sessions](#sessions) — Unified session system for long-running operations
- [Claude Usage](#claude-usage) — Claude CLI rate limit monitoring
- [Filesystem](#filesystem) — Directory browsing
- [Toolbox](#toolbox) — CLI tool checking
- [Domain Types](#domain-types) — Type definitions
- [Authentication](#authentication)

---

## Repositories

### `GET /api/repos`

Returns all repositories with aggregated finding counts, ordered by `created_at DESC`.

**Response** `200`:
```json
[
  {
    "id": "<uuid>",
    "name": "my-app",
    "local_path": "/Users/me/projects/my-app",
    "git_remote": "https://github.com/me/my-app.git",
    "default_branch": "main",
    "package_manager": "pnpm",
    "repo_type": "nextjs",
    "is_monorepo": false,
    "last_scanned_at": "2025-01-15T10:30:00.000Z",
    "created_at": "2025-01-01T00:00:00.000Z",
    "critical_count": 2,
    "warning_count": 5,
    "info_count": 12
  }
]
```

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

| Field | Type | Required | Default |
|---|---|---|---|
| `name` | string | yes | — |
| `local_path` | string | yes | — |
| `git_remote` | string | no | `null` |
| `default_branch` | string | no | `"main"` |
| `package_manager` | `PackageManager` | no | `null` |
| `repo_type` | `RepoType` | no | `null` |
| `is_monorepo` | boolean | no | `false` |

**Response** `201`:
```json
{ "id": "<uuid>" }
```

### `DELETE /api/repos?id=<uuid>`

Delete a repository and cascade-delete its findings and fix actions.

**Query params:**

| Param | Type | Required |
|---|---|---|
| `id` | string (uuid) | yes |

**Response** `200`:
```json
{ "success": true }
```

**Errors:** `400` missing `id`.

### `GET /api/repos/[repoId]/raw?path=<relative>`

Serve a raw image file from a repository's local path.

**Query params:**

| Param | Type | Required |
|---|---|---|
| `path` | string | yes |

**Response** `200` — binary image with appropriate `Content-Type` and `Cache-Control: private, max-age=60`.

**Supported types:** `.png`, `.jpg`, `.jpeg`, `.gif`, `.bmp`, `.ico`, `.webp`, `.avif`, `.tiff`, `.tif`

**Security:** path traversal prevention — resolved path must remain within the repo directory.

**Errors:** `400` missing path or unsupported type, `403` path outside repo, `404` repo or file not found.

---

## Scans

### `GET /api/scans`

Returns all scans ordered by `created_at DESC`.

**Response** `200`:
```json
[
  {
    "id": "<uuid>",
    "status": "done",
    "policy_id": "<uuid>",
    "progress": 100,
    "phase": "Complete",
    "started_at": "2025-01-15T10:30:00.000Z",
    "completed_at": "2025-01-15T10:31:00.000Z",
    "created_at": "2025-01-15T10:30:00.000Z"
  }
]
```

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

**Response** `200`: `Finding[]` with `suggested_actions` deserialized from JSON.

```json
[
  {
    "id": "<uuid>",
    "repo_id": "<uuid>",
    "scan_id": "<uuid>",
    "category": "dependencies",
    "severity": "critical",
    "title": "Outdated dependency: next",
    "details": "Expected ^16.0.0, found 15.0.3",
    "evidence": "package.json",
    "suggested_actions": ["Run pnpm update next"],
    "created_at": "2025-01-15T10:30:00.000Z"
  }
]
```

**Sort order:** `critical` → `warning` → `info`.

---

## Fixes

### `GET /api/fixes`

List fix actions with optional filters, ordered by `created_at DESC`.

**Query params:**

| Param | Type | Description |
|---|---|---|
| `repoId` | string | Filter by repository |
| `scanId` | string | Filter by scan |

**Response** `200`: `FixAction[]`

### `GET /api/fixes/preview?id=<uuid>`

Preview a fix action's file diff.

**Query params:**

| Param | Type | Required |
|---|---|---|
| `id` | string (uuid) | yes |

**Response** `200`:
```json
{
  "id": "<uuid>",
  "title": "Update next.config.ts",
  "diff_file": "next.config.ts",
  "diff_before": "...",
  "diff_after": "..."
}
```

**Errors:** `400` missing `id`, `404` fix not found.

### `POST /api/fixes/apply`

Apply fix actions to disk. Creates a snapshot before applying for rollback support.

**Body:**
```json
{
  "repoId": "<uuid>",
  "fixActionIds": ["<uuid>", "<uuid>"]
}
```

| Field | Type | Required |
|---|---|---|
| `repoId` | string (uuid) | yes |
| `fixActionIds` | string[] | yes (non-empty) |

**Response** `200`: Result from `applyFixes()` engine (includes `success`, `runId`, `snapshotId`, `appliedCount`, `totalCount`).

**Errors:** `400` missing `repoId` or `fixActionIds`, `404` repo not found.

### `POST /api/fixes/restore`

Restore files from a snapshot, rolling back a previous apply run.

**Body:**
```json
{ "runId": "<uuid>" }
```

**Response** `200` on success, `400` if `runId` missing or restore fails.

---

## Policies

### `GET /api/policies`

Returns all policies ordered by `created_at DESC`. JSON fields (`expected_versions`, `banned_dependencies`, etc.) are parsed from stored JSON strings.

**Response** `200`: `Policy[]`

### `POST /api/policies`

Create a new policy.

**Body:**
```json
{
  "name": "My Policy",
  "description": "Custom audit policy",
  "expected_versions": { "next": "^16.0.0", "react": "^19.0.0" },
  "banned_dependencies": [{ "name": "moment", "replacement": "dayjs", "reason": "Large bundle size" }],
  "allowed_package_managers": ["pnpm", "npm"],
  "preferred_package_manager": "pnpm",
  "ignore_patterns": ["*.test.ts"]
}
```

| Field | Type | Required | Default |
|---|---|---|---|
| `name` | string | yes | — |
| `description` | string | no | `null` |
| `expected_versions` | `Record<string, string>` | no | `{}` |
| `banned_dependencies` | `Array<{ name, replacement?, reason }>` | no | `[]` |
| `allowed_package_managers` | `PackageManager[]` | no | `[]` |
| `preferred_package_manager` | `PackageManager` | no | `"pnpm"` |
| `ignore_patterns` | `string[]` | no | `[]` |

**Response** `201`:
```json
{ "id": "<uuid>" }
```

### `PUT /api/policies`

Update an existing policy. All fields from POST plus a required `id`.

**Body:** same as POST with `"id": "<uuid>"` added.

**Response** `200`:
```json
{ "success": true }
```

**Errors:** `400` missing `id`.

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

| Field | Type | Required |
|---|---|---|
| `roots` | `string[]` | yes (non-empty, all strings) |
| `excludePatterns` | `string[]` | no |

**Response** `200`:
```json
{
  "count": 12,
  "repos": [
    {
      "name": "my-app",
      "localPath": "/Users/me/projects/my-app",
      "repoType": "nextjs",
      "packageManager": "pnpm",
      "isMonorepo": false,
      "gitRemote": "https://github.com/me/my-app.git",
      "defaultBranch": "main"
    }
  ]
}
```

**Errors:** `400` if `roots` is missing, empty, or not a string array.

---

## Reports

### `GET /api/reports`

Export audit results as a report. Saves the report to the database as a side effect.

**Query params:**

| Param | Type | Default | Description |
|---|---|---|---|
| `format` | `"json"` \| `"markdown"` \| `"pr"` | `"json"` | Output format |
| `scanId` | string | — | Specific scan to report on |

**Response:**
- `format=json` → `200` with `Content-Type: application/json`
- `format=markdown` or `format=pr` → `200` with `Content-Type: text/markdown`

---

## Sessions

The session system provides a unified abstraction for all long-running operations. Operations that previously had standalone streaming endpoints (scan execution, scaffolding, chat, upgrade execution, quick-improve, finding-fix, fix-apply, auto-fix, AI file generation, repo cleanup, toolbox commands) are now handled through sessions.

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

**`SessionType` values:** `"scan"`, `"quick_improve"`, `"finding_fix"`, `"chat"`, `"scaffold"`, `"upgrade"`, `"auto_fix"`, `"fix_apply"`, `"upgrade_init"`, `"ai_file_gen"`, `"cleanup"`, `"toolbox_command"`

**Response** `200`: `SessionRow[]`

```json
[
  {
    "id": "<uuid>",
    "session_type": "scan",
    "status": "done",
    "label": "Scan 3 repos",
    "context_type": "repo",
    "context_id": "<uuid>",
    "context_name": "my-app",
    "metadata_json": "{}",
    "progress": 100,
    "phase": "Complete",
    "pid": null,
    "started_at": "2025-01-15T10:30:00.000Z",
    "completed_at": "2025-01-15T10:31:00.000Z",
    "created_at": "2025-01-15T10:30:00.000Z",
    "error_message": null,
    "result_json": "{}"
  }
]
```

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

| Field | Type | Required | Description |
|---|---|---|---|
| `type` | `SessionType` | yes | Type of operation to run |
| `label` | string | yes | Human-readable label |
| `contextType` | `"repo"` \| `"project"` | no | What the session operates on |
| `contextId` | string | no | ID of the repo or project |
| `contextName` | string | no | Display name for context |
| `metadata` | `Record<string, unknown>` | no | Passed to the runner factory (contents vary by session type) |

**Session type metadata:**

| Session Type | Key Metadata Fields |
|---|---|
| `scan` | `scanRoots`, `policyId` |
| `quick_improve` | `prompt` |
| `finding_fix` | `findingId` |
| `chat` | `prompt`, `history` |
| `scaffold` | `projectId` |
| `upgrade` | `taskId` |
| `auto_fix` | `errorMessage` |
| `fix_apply` | `fixActionIds`, `repoId` |
| `upgrade_init` | `projectId` |
| `ai_file_gen` | `repoId`, `fileName`, `action` |
| `cleanup` | `repoId` |
| `toolbox_command` | `toolId`, `action` |

**Response** `201`:
```json
{ "sessionId": "<uuid>" }
```

**Errors:** `400` missing `type`/`label` or unknown session type, `500` creation failed.

### `GET /api/sessions/[sessionId]`

Get session detail with recent logs. Checks the in-memory live session first, falls back to the database for historical sessions.

**Response** `200` (live session):
```json
{
  "id": "<uuid>",
  "session_type": "scan",
  "status": "running",
  "label": "Scan 3 repos",
  "recentLogs": [
    { "log": "Scanning my-app...", "logType": "status" },
    { "log": "Found 5 findings", "logType": "status" }
  ]
}
```

**Response** `200` (historical session): Full `SessionRow` fields plus `recentLogs` (last 50 entries).

**Errors:** `404` session not found.

### `GET /api/sessions/[sessionId]/stream` (SSE)

Subscribe to session events in real-time with replay support. If the session is live in memory, subscribes to real-time events. If the session is historical, replays stored logs from the database.

**Response** `200` — streaming `text/event-stream`:
```
data: {"type":"progress","progress":25,"phase":"Discovering","message":"Found 3 repos"}

data: {"type":"log","log":"Scanning my-app...","logType":"status"}

data: {"type":"log","log":"Analyzing dependencies...","logType":"tool"}

data: {"type":"done","progress":100,"data":{}}

data: [DONE]
```

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

**Behavior:**
- Live sessions: real-time event subscription with heartbeat
- Historical sessions: replays stored logs (up to 500) then sends terminal event
- Client disconnect does **not** cancel the session
- Stream closes automatically after terminal events (`done`/`error`/`cancelled`)

### `POST /api/sessions/[sessionId]/cancel`

Cancel a running session. Triggers cleanup (e.g., git worktree removal) and kills any associated Claude CLI process.

**Response** `200`:
```json
{ "status": "cancelled" }
```

**Errors:** `404` session not found or not running.

---

## Claude Usage

### `GET /api/claude-usage`

Fetch Claude CLI rate limit information. Data is sourced from the Anthropic OAuth usage API using the locally stored OAuth token (macOS Keychain or `~/.claude/.credentials.json`). Results are cached for 60 seconds.

**Response** `200`:
```json
{
  "rateLimits": {
    "fiveHour": { "utilization": 12.5, "resetsAt": "2025-01-15T15:30:00.000Z" },
    "sevenDay": { "utilization": 35.0, "resetsAt": "2025-01-22T00:00:00.000Z" },
    "modelLimits": {
      "opus": { "utilization": 50.0, "resetsAt": "2025-01-22T00:00:00.000Z" },
      "sonnet": { "utilization": 20.0, "resetsAt": "2025-01-22T00:00:00.000Z" }
    },
    "extraUsage": {
      "isEnabled": true,
      "utilization": 10.0,
      "usedCredits": 5.0,
      "monthlyLimit": 50.0
    }
  }
}
```

`rateLimits` is `null` when no OAuth token is found or the API request fails.

| Field | Type | Description |
|---|---|---|
| `fiveHour` | `RateLimitWindow` | 5-hour rolling utilization (0–100%) |
| `sevenDay` | `RateLimitWindow` | 7-day rolling utilization (0–100%) |
| `modelLimits` | `Record<string, RateLimitWindow>` | Per-model weekly limits (e.g. `"opus"`, `"sonnet"`) |
| `extraUsage` | `object \| null` | Extra usage / overage info. `null` if not enabled. |

---

## Filesystem

### `GET /api/fs/browse`

Browse the local filesystem. Restricted to the user's home directory. Returns only directories (not files).

**Query params:**

| Param | Type | Default | Description |
|---|---|---|---|
| `path` | string | `"~"` | Directory to browse (supports `~` expansion) |
| `showHidden` | `"true"` \| `"false"` | `"false"` | Include dot-directories |

**Response** `200`:
```json
{
  "currentPath": "/Users/me/projects",
  "parentPath": "/Users/me",
  "entries": [
    { "name": "my-app", "path": "/Users/me/projects/my-app", "hasChildren": true }
  ]
}
```

Entries are sorted alphabetically. `parentPath` is `null` when at the home directory root.

**Security:** Rejects any path that resolves outside `$HOME`, including symlinks that target directories outside the home directory.

**Errors:** `400` cannot read directory, `403` path outside home directory or symlink target outside home.

---

## Toolbox

### `POST /api/toolbox/check`

Check whether CLI tools are installed and their versions.

**Body:**
```json
{ "toolIds": ["node", "pnpm", "git", "biome"] }
```

| Field | Type | Required |
|---|---|---|
| `toolIds` | `string[]` | yes (non-empty) |

**Validation:** `toolIds` must be a non-empty array, capped at the number of known tools.

**Response** `200`:
```json
{
  "results": [
    {
      "toolId": "node",
      "installed": true,
      "currentVersion": "22.5.0",
      "latestVersion": "22.6.0",
      "updateAvailable": true,
      "error": null,
      "checkedAt": "2025-01-15T10:30:00.000Z",
      "durationMs": 150,
      "metadata": {}
    }
  ]
}
```

**Errors:** `400` invalid or empty `toolIds`, `500` check failure.

> **Note:** Tool installation/update commands are handled through the [Sessions](#sessions) system (`session_type: "toolbox_command"`).

---

## Domain Types

Types used in request and response bodies, defined in `src/lib/types.ts`.

### Repo

| Field | Type |
|---|---|
| `id` | string (uuid) |
| `name` | string |
| `local_path` | string |
| `git_remote` | string \| null |
| `default_branch` | string |
| `package_manager` | `PackageManager` \| null |
| `repo_type` | `RepoType` \| null |
| `is_monorepo` | boolean |
| `last_scanned_at` | string (ISO 8601) \| null |
| `created_at` | string (ISO 8601) |

### RepoWithCounts

Extends `Repo` with:

| Field | Type |
|---|---|
| `critical_count` | number |
| `warning_count` | number |
| `info_count` | number |

### Policy

| Field | Type |
|---|---|
| `id` | string (uuid) |
| `name` | string |
| `description` | string \| null |
| `expected_versions` | `Record<string, string>` |
| `banned_dependencies` | `Array<{ name, replacement?, reason }>` |
| `allowed_package_managers` | `PackageManager[]` |
| `preferred_package_manager` | `PackageManager` |
| `ignore_patterns` | `string[]` |
| `repo_types` | `RepoType[]` |
| `is_builtin` | boolean |
| `created_at` | string (ISO 8601) |
| `updated_at` | string (ISO 8601) |

### Finding

| Field | Type |
|---|---|
| `id` | string (uuid) |
| `repo_id` | string (uuid) |
| `scan_id` | string (uuid) \| null |
| `category` | `FindingCategory` |
| `severity` | `Severity` |
| `title` | string |
| `details` | string \| null |
| `evidence` | string \| null |
| `suggested_actions` | `string[]` |
| `created_at` | string (ISO 8601) |

### FixAction

| Field | Type |
|---|---|
| `id` | string (uuid) |
| `repo_id` | string (uuid) |
| `finding_id` | string (uuid) \| null |
| `scan_id` | string (uuid) \| null |
| `title` | string |
| `description` | string \| null |
| `impact` | `FixImpact` \| null |
| `risk` | `FixRisk` \| null |
| `requires_approval` | boolean |
| `diff_file` | string \| null |
| `diff_before` | string \| null |
| `diff_after` | string \| null |
| `created_at` | string (ISO 8601) |

### SessionRow

| Field | Type |
|---|---|
| `id` | string (uuid) |
| `session_type` | `SessionType` |
| `status` | `SessionStatus` |
| `label` | string |
| `context_type` | `"repo"` \| `"project"` \| null |
| `context_id` | string \| null |
| `context_name` | string \| null |
| `metadata_json` | string (JSON) |
| `progress` | number (0–100) |
| `phase` | string \| null |
| `pid` | number \| null |
| `started_at` | string (ISO 8601) \| null |
| `completed_at` | string (ISO 8601) \| null |
| `created_at` | string (ISO 8601) |
| `error_message` | string \| null |
| `result_json` | string (JSON) |

### SessionEvent

| Field | Type |
|---|---|
| `type` | `"progress"` \| `"log"` \| `"done"` \| `"error"` \| `"cancelled"` \| `"heartbeat"` \| `"init"` |
| `message` | string (optional) |
| `progress` | number (optional) |
| `phase` | string (optional) |
| `log` | string (optional) |
| `logType` | `"tool"` \| `"thinking"` \| `"status"` (optional) |
| `data` | `Record<string, unknown>` (optional) |

### GeneratorProject

| Field | Type |
|---|---|
| `id` | string (uuid) |
| `title` | string |
| `idea_description` | string |
| `platform` | string |
| `services` | `string[]` |
| `constraints` | `string[]` |
| `project_name` | string |
| `project_path` | string |
| `package_manager` | `PackageManager` |
| `status` | `GeneratorProjectStatus` |
| `active_spec_version` | number |
| `ai_provider` | `AiProvider` |
| `ai_model` | string \| null |
| `template_id` | string \| null |
| `policy_id` | string \| null |
| `repo_id` | string \| null |
| `design_vibes` | `string[]` |
| `inspiration_urls` | `string[]` |
| `color_scheme` | `{ primary?: string, accent?: string }` |
| `custom_features` | `string[]` |
| `created_at` | string (ISO 8601) |
| `updated_at` | string (ISO 8601) |
| `exported_at` | string (ISO 8601) \| null |

### UpgradeTask

| Field | Type |
|---|---|
| `id` | string (uuid) |
| `project_id` | string (uuid) |
| `title` | string |
| `description` | string \| null |
| `status` | `UpgradeTaskStatus` |
| `order_index` | number |
| `step_type` | `"validate"` \| `"implement"` \| `"env_setup"` |
| `claude_output` | string \| null |
| `started_at` | string (ISO 8601) \| null |
| `completed_at` | string (ISO 8601) \| null |
| `created_at` | string (ISO 8601) |

### ProjectScreenshot

| Field | Type |
|---|---|
| `id` | string (uuid) |
| `project_id` | string (uuid) |
| `file_path` | string |
| `label` | string \| null |
| `width` | number |
| `height` | number |
| `file_size` | number |
| `message_id` | string \| null |
| `created_at` | string (ISO 8601) |

### AutoFixRun

| Field | Type |
|---|---|
| `id` | string (uuid) |
| `project_id` | string (uuid) |
| `status` | `"running"` \| `"success"` \| `"failed"` \| `"cancelled"` |
| `error_signature` | string |
| `error_message` | string |
| `claude_output` | string \| null |
| `attempt_number` | number |
| `logs_json` | string (JSON) |
| `started_at` | string (ISO 8601) |
| `completed_at` | string (ISO 8601) \| null |

### ClaudeRateLimits

| Field | Type |
|---|---|
| `fiveHour` | `RateLimitWindow` |
| `sevenDay` | `RateLimitWindow` |
| `modelLimits` | `Record<string, RateLimitWindow>` |
| `extraUsage` | `{ isEnabled, utilization, usedCredits, monthlyLimit } \| null` |

### RateLimitWindow

| Field | Type |
|---|---|
| `utilization` | number (0–100) |
| `resetsAt` | string (ISO 8601) |

### ToolCheckResult

| Field | Type |
|---|---|
| `toolId` | string |
| `installed` | boolean |
| `currentVersion` | string \| null |
| `latestVersion` | string \| null |
| `updateAvailable` | boolean |
| `error` | string \| null |
| `checkedAt` | string (ISO 8601) |
| `durationMs` | number |
| `metadata` | `Record<string, string \| null>` (optional) |

### Enums

| Type | Values |
|---|---|
| `RepoType` | `"nextjs"` \| `"node"` \| `"react"` \| `"library"` \| `"monorepo"` \| `"tanstack"` |
| `PackageManager` | `"npm"` \| `"pnpm"` \| `"bun"` \| `"yarn"` |
| `Severity` | `"critical"` \| `"warning"` \| `"info"` |
| `FindingCategory` | `"dependencies"` \| `"ai-files"` \| `"structure"` \| `"config"` \| `"custom"` |
| `FixImpact` | `"docs"` \| `"config"` \| `"dependencies"` \| `"structure"` |
| `FixRisk` | `"low"` \| `"medium"` \| `"high"` |
| `SessionType` | `"scan"` \| `"quick_improve"` \| `"finding_fix"` \| `"chat"` \| `"scaffold"` \| `"upgrade"` \| `"auto_fix"` \| `"fix_apply"` \| `"upgrade_init"` \| `"ai_file_gen"` \| `"cleanup"` \| `"toolbox_command"` |
| `SessionStatus` | `"pending"` \| `"running"` \| `"done"` \| `"error"` \| `"cancelled"` |
| `GeneratorProjectStatus` | `"drafting"` \| `"scaffolding"` \| `"designing"` \| `"upgrading"` \| `"archived"` \| `"locked"` \| `"exported"` \| `"error"` |
| `AiProvider` | `"claude-code"` \| `"anthropic"` \| `"openai"` \| `"ollama"` |
| `AutoFixStatus` | `"idle"` \| `"detecting"` \| `"fixing"` \| `"success"` \| `"failed"` \| `"cooldown"` \| `"cancelled"` |
| `UpgradeTaskStatus` | `"pending"` \| `"in_progress"` \| `"completed"` \| `"failed"` \| `"skipped"` |
| `ConceptType` | `"skill"` \| `"hook"` \| `"command"` \| `"agent"` \| `"mcp_server"` \| `"plugin"` |

---

## Authentication

Gadget is a local-first tool — there is no user authentication on API routes by default. All endpoints trust the local environment.

**MCP_API_TOKEN** — when set in `.env.local`, enables Bearer token auth for programmatic MCP access:
```
Authorization: Bearer <MCP_API_TOKEN>
```

**GITHUB_PERSONAL_ACCESS_TOKEN** — optional, stored encrypted (AES-256-GCM) in the database. Used by the GitHub client service with Bearer auth against the GitHub API. Not required for any local endpoints.
