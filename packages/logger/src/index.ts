import { createWriteStream, existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { Writable } from "node:stream";
import pino from "pino";

export type AppName = "gadget" | "gogo-web" | "gogo-orchestrator" | "b4u" | "web" | "dev-runner";

export interface LoggerConfig {
  app: AppName;
  level?: pino.LevelWithSilent;
  /** Use pino-pretty for console output. Default: NODE_ENV !== "production" */
  pretty?: boolean;
  /** Write NDJSON log file to disk. Default: true */
  fileLogging?: boolean;
  /** Directory for log files. Default: ~/.devkit/logs */
  logDir?: string;
}

export type DevkitLogger = pino.Logger;

export interface LogFileEntry {
  path: string;
  app: string;
  date: string | null;
}

const DEFAULT_LOG_DIR = join(homedir(), ".devkit", "logs");
const MAX_LOG_AGE_DAYS = 14;

function getTodayDate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function ensureLogDir(logDir: string = DEFAULT_LOG_DIR): void {
  if (!existsSync(logDir)) {
    mkdirSync(logDir, { recursive: true });
  }
}

export function getLogFilePath(app: string, logDir: string = DEFAULT_LOG_DIR, date?: string): string {
  const d = date ?? getTodayDate();
  return join(logDir, `${app}.${d}.ndjson`);
}

/** Parse a log filename into app name and optional date */
export function parseLogFileName(filename: string): { app: string; date: string | null } {
  const name = basename(filename, ".ndjson");
  // Match date-based: app.YYYY-MM-DD
  const dateMatch = name.match(/^(.+)\.(\d{4}-\d{2}-\d{2})$/);
  if (dateMatch) {
    return { app: dateMatch[1], date: dateMatch[2] };
  }
  // Legacy: app (no date)
  return { app: name, date: null };
}

export function listLogFiles(logDir: string = DEFAULT_LOG_DIR): LogFileEntry[] {
  ensureLogDir(logDir);
  return readdirSync(logDir)
    .filter((f) => f.endsWith(".ndjson"))
    .map((f) => {
      const parsed = parseLogFileName(f);
      return { path: join(logDir, f), ...parsed };
    });
}

export function pruneOldLogs(logDir: string = DEFAULT_LOG_DIR): void {
  ensureLogDir(logDir);
  const cutoff = Date.now() - MAX_LOG_AGE_DAYS * 24 * 60 * 60 * 1000;
  for (const file of readdirSync(logDir)) {
    if (!file.endsWith(".ndjson")) continue;
    const filePath = join(logDir, file);
    try {
      const stat = statSync(filePath);
      if (stat.mtimeMs < cutoff) {
        unlinkSync(filePath);
      }
    } catch {
      // Skip files we can't stat
    }
  }
}

/**
 * A Writable stream that rotates log files daily at midnight.
 * On each write, checks if the date has changed and opens a new file if needed.
 */
class DailyRotatingStream extends Writable {
  private app: string;
  private logDir: string;
  private currentDate: string;
  private fileStream: ReturnType<typeof createWriteStream>;

  constructor(app: string, logDir: string) {
    super();
    this.app = app;
    this.logDir = logDir;
    this.currentDate = getTodayDate();
    this.fileStream = createWriteStream(getLogFilePath(app, logDir, this.currentDate), { flags: "a" });
  }

  _write(chunk: Buffer, _encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
    const today = getTodayDate();
    if (today !== this.currentDate) {
      this.fileStream.end();
      this.currentDate = today;
      this.fileStream = createWriteStream(getLogFilePath(this.app, this.logDir, this.currentDate), { flags: "a" });
    }
    this.fileStream.write(chunk, callback);
  }

  _final(callback: (error?: Error | null) => void): void {
    this.fileStream.end(callback);
  }
}

export function createLogger(config: LoggerConfig): DevkitLogger {
  const {
    app,
    level = process.env.LOG_LEVEL || "info",
    pretty = process.env.NODE_ENV !== "production",
    fileLogging = true,
    logDir = DEFAULT_LOG_DIR,
  } = config;

  const targets: pino.TransportTargetOptions[] = [];

  if (pretty) {
    targets.push({
      target: "pino-pretty",
      options: { colorize: true },
      level: level as string,
    });
  } else {
    targets.push({
      target: "pino/file",
      options: { destination: 1 }, // stdout
      level: level as string,
    });
  }

  if (fileLogging) {
    ensureLogDir(logDir);
  }

  const consoleTransport = pino.transport({ targets });

  if (fileLogging) {
    const dailyStream = new DailyRotatingStream(app, logDir);
    const multistream = new Writable({
      write(chunk, encoding, callback) {
        let pending = 2;
        let error: Error | null = null;
        const done = (err?: Error | null) => {
          if (err) error = err;
          if (--pending === 0) callback(error);
        };
        consoleTransport.write(chunk, encoding, done);
        dailyStream.write(chunk, encoding, done);
      },
      final(callback) {
        consoleTransport.end();
        dailyStream.end(callback);
      },
    });

    return pino({ level: level as string, base: { app } }, multistream);
  }

  return pino({
    level: level as string,
    transport: { targets },
    base: { app },
  });
}

export function createServiceLogger(logger: DevkitLogger, service: string): DevkitLogger {
  return logger.child({ service });
}
