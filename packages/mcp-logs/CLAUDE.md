# @claudekit/mcp-logs

MCP (Model Context Protocol) server that exposes claudekit log files as tools. Provides 5 tools for listing, searching, tailing, and inspecting log entries via the MCP stdio transport.

## Usage

The server is started via stdio and intended to be registered as an MCP tool provider (e.g., in Claude Desktop or similar MCP-aware clients).

```bash
pnpm start        # Run the MCP server
pnpm dev          # Run with file watching (tsx watch)
```

## Directory Tree

```
src/
  index.ts        # MCP server definition, all 5 tools, and startup
  index.test.ts   # Tests for all tools (mock-based)
```

## Tools (5)

### `list_log_files`

List all claudekit log files with size, date, and last modified time.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `app` | string | No | Filter by app name |

### `search_logs`

Search log entries by text query across log files.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query` | string | Yes | Text to search for in log messages |
| `app` | string | No | Filter by app name |
| `date` | string | No | Filter by date (YYYY-MM-DD) |
| `level` | string | No | Minimum log level: trace, debug, info, warn, error, fatal |
| `since` | string | No | Time window, e.g. `1h`, `30m`, `7d` |
| `limit` | number | No | Max entries to return (default: 50) |

### `tail_logs`

Get the most recent log entries for an app.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `app` | string | Yes | App name (e.g. `gadget`, `gogo-orchestrator`) |
| `date` | string | No | Date to read logs from (YYYY-MM-DD, defaults to today) |
| `lines` | number | No | Number of lines to return (default: 50) |
| `level` | string | No | Minimum log level filter |

### `get_recent_errors`

Get recent error and fatal log entries (level >= 50) across all apps.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `since` | string | No | Time window, e.g. `1h`, `30m` (default: `1h`) |
| `app` | string | No | Filter by app name |
| `limit` | number | No | Max entries to return (default: 20) |

### `get_log_context`

Get log entries around a specific timestamp for context. Marks the closest entry with `>>>` prefix.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `app` | string | Yes | App name |
| `timestamp` | string | Yes | ISO timestamp or epoch ms to center around |
| `date` | string | No | Date to read logs from (YYYY-MM-DD, defaults to today) |
| `before` | number | No | Entries before the timestamp (default: 10) |
| `after` | number | No | Entries after the timestamp (default: 10) |

## Dependencies

- **`@claudekit/logger`** — provides `listLogFiles`, `readLogEntries`, `filterLogEntries`, `formatLogEntry`, `getLogFilePath`, `nameToLevel`, `parseSince`
- **`@modelcontextprotocol/sdk`** — MCP server and stdio transport
- **`zod`** — parameter schema validation (required by MCP SDK)

## Scripts

| Script | Command |
|--------|---------|
| `dev` | `tsx watch src/index.ts` |
| `start` | `tsx src/index.ts` |
| `build` | `tsc --noEmit` |
| `typecheck` | `tsc --noEmit` |
| `lint` | `biome check .` |
| `format` | `biome format --write .` |
| `test` | `vitest run` |

## Important

This is a **single-file package** — all 5 tools are defined and registered in `src/index.ts`. The server uses `StdioServerTransport` and expects to be launched as a child process by an MCP client. It does not expose any HTTP endpoints.
