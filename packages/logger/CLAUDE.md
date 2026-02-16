# @devkit/logger

Structured logging for all devkit apps. Built on Pino with dual transport (console + NDJSON file).

## Usage

```typescript
import { createLogger, createServiceLogger } from "@devkit/logger";

const logger = createLogger({ app: "gadget" });
const serviceLogger = createServiceLogger(logger, "scanner");

serviceLogger.info({ repoId: "abc" }, "Scanning repository");
```

## API

- `createLogger(config)` — Create a Pino logger with console + file output (daily rotating)
- `createServiceLogger(logger, service)` — Create a child logger for a service
- `getLogFilePath(app, logDir?, date?)` — Get the log file path for an app. Date defaults to today (YYYY-MM-DD)
- `parseLogFileName(filename)` — Parse a log filename into `{ app, date }`. Handles both legacy `app.ndjson` and new `app.2026-02-15.ndjson` formats
- `listLogFiles(logDir?)` — List all .ndjson log files as `{ path, app, date }[]`
- `pruneOldLogs(logDir?)` — Remove log files older than 14 days
- `ensureLogDir(logDir?)` — Create log directory if needed

## File Naming

Log files use day-based naming: `{app}.{YYYY-MM-DD}.ndjson`

- Example: `gadget.2026-02-15.ndjson`
- Legacy undated files (`app.ndjson`) are still discovered by `listLogFiles` with `date: null`
- The `createLogger` uses a `DailyRotatingStream` that automatically rotates at midnight for long-running processes

## Config

```typescript
interface LoggerConfig {
  app: AppName;           // Required: "gadget" | "gogo-web" | etc.
  level?: string;         // Default: LOG_LEVEL env or "info"
  pretty?: boolean;       // Default: NODE_ENV !== "production"
  fileLogging?: boolean;  // Default: true
  logDir?: string;        // Default: ~/.devkit/logs
}
```

## Important

**Server-only**: Pino is Node.js-only. Never import this package in `"use client"` components. For Next.js apps, add `"pino"` to `serverExternalPackages` in `next.config.ts`.
