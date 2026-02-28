# @claudekit/logger

Structured logging for all claudekit apps. Built on Pino with dual transport (console + NDJSON file).

## Usage

```typescript
import { createLogger, createServiceLogger } from "@claudekit/logger";

const logger = createLogger({ app: "gadget" });
const serviceLogger = createServiceLogger(logger, "scanner");

serviceLogger.info({ repoId: "abc" }, "Scanning repository");
```

## API

### Logger Creation

- `createLogger(config)` — Create a Pino logger with console + file output (daily rotating)
- `createServiceLogger(logger, service)` — Create a child logger for a service

### Log File Management

- `getLogFilePath(app, logDir?, date?)` — Get the log file path for an app. Date defaults to today (YYYY-MM-DD)
- `parseLogFileName(filename)` — Parse a log filename into `{ app, date }`. Handles both legacy `app.ndjson` and new `app.2026-02-15.ndjson` formats
- `listLogFiles(logDir?)` — List all .ndjson log files as `{ path, app, date }[]`
- `pruneOldLogs(logDir?)` — Remove log files older than 14 days
- `ensureLogDir(logDir?)` — Create log directory if needed

### Log Querying (`src/query.ts`)

- `readLogEntries(filePath)` — Read and parse all NDJSON log entries from a file
- `filterLogEntries(entries, filters)` — Filter entries by level, query text, time window, and limit
- `formatLogEntry(entry)` — Format a log entry as a human-readable string
- `pinoLevelToName(level)` — Convert Pino numeric level to name (e.g., 30 -> "info")
- `nameToLevel(name)` — Convert level name to Pino numeric level (e.g., "info" -> 30)
- `parseSince(since)` — Parse a duration string like "1h", "30m", "7d" into a timestamp

## File Naming

Log files use day-based naming: `{app}.{YYYY-MM-DD}.ndjson`

- Example: `gadget.2026-02-15.ndjson`
- Legacy undated files (`app.ndjson`) are still discovered by `listLogFiles` with `date: null`
- The `createLogger` uses a `DailyRotatingStream` that automatically rotates at midnight for long-running processes

## Config

```typescript
type AppName = "gadget" | "gogo-web" | "gogo-orchestrator" | "b4u" | "web" | "dev-runner" | "inspector";

interface LoggerConfig {
  app: AppName;
  level?: pino.LevelWithSilent; // Default: LOG_LEVEL env or "info"
  pretty?: boolean;             // Default: NODE_ENV !== "production"
  fileLogging?: boolean;        // Default: true
  logDir?: string;              // Default: ~/.claudekit/logs
}

interface LogFilter {
  level?: string;     // Filter by level name(s), comma-separated (e.g. "warn,error")
  minLevel?: number;  // Minimum level number
  query?: string;     // Case-insensitive text search across full JSON
  since?: string;     // Time window string, e.g. "1h", "30m", "7d"
  limit?: number;     // Max entries to return (from end of list)
}
```

## Important

**Server-only**: Pino is Node.js-only. Never import this package in `"use client"` components. For Next.js apps, add `"pino"` to `serverExternalPackages` in `next.config.ts`.
