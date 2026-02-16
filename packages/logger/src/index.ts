import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import pino from "pino";

export type AppName = "gadget" | "gogo-web" | "gogo-orchestrator" | "b4u" | "logs" | "dev-runner";

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

const DEFAULT_LOG_DIR = join(homedir(), ".devkit", "logs");
const MAX_LOG_AGE_DAYS = 14;

export function ensureLogDir(logDir: string = DEFAULT_LOG_DIR): void {
  if (!existsSync(logDir)) {
    mkdirSync(logDir, { recursive: true });
  }
}

export function getLogFilePath(app: string, logDir: string = DEFAULT_LOG_DIR): string {
  return join(logDir, `${app}.ndjson`);
}

export function listLogFiles(logDir: string = DEFAULT_LOG_DIR): string[] {
  ensureLogDir(logDir);
  return readdirSync(logDir)
    .filter((f) => f.endsWith(".ndjson"))
    .map((f) => join(logDir, f));
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
    const logFile = getLogFilePath(app, logDir);
    targets.push({
      target: "pino/file",
      options: { destination: logFile, mkdir: true, append: true },
      level: level as string,
    });
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
