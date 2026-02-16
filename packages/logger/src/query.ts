import { existsSync, readFileSync } from "node:fs";

export interface LogEntry {
  level: number;
  time: number;
  msg: string;
  app?: string;
  service?: string;
  [key: string]: unknown;
}

export interface LogFilter {
  /** Filter by level name(s), comma-separated (e.g. "warn,error") */
  level?: string;
  /** Minimum level number (overrides level name filter) */
  minLevel?: number;
  /** Text search query (case-insensitive, searches full JSON) */
  query?: string;
  /** Time window string, e.g. "1h", "30m", "7d" */
  since?: string;
  /** Max entries to return (from end of list) */
  limit?: number;
}

/** Convert Pino numeric level to human-readable name */
export function pinoLevelToName(level: number): string {
  if (level <= 10) return "trace";
  if (level <= 20) return "debug";
  if (level <= 30) return "info";
  if (level <= 40) return "warn";
  if (level <= 50) return "error";
  return "fatal";
}

/** Convert level name to Pino numeric level */
export function nameToLevel(name: string): number {
  switch (name) {
    case "trace":
      return 10;
    case "debug":
      return 20;
    case "info":
      return 30;
    case "warn":
      return 40;
    case "error":
      return 50;
    case "fatal":
      return 60;
    default:
      return 0;
  }
}

/** Parse a duration string like "1h", "30m", "7d" into a timestamp (ms since epoch) */
export function parseSince(since: string): number {
  const match = since.match(/^(\d+)([smhd])$/);
  if (!match) return 0;
  const value = Number.parseInt(match[1], 10);
  const unit = match[2];
  const now = Date.now();
  switch (unit) {
    case "s":
      return now - value * 1000;
    case "m":
      return now - value * 60 * 1000;
    case "h":
      return now - value * 60 * 60 * 1000;
    case "d":
      return now - value * 24 * 60 * 60 * 1000;
    default:
      return 0;
  }
}

/** Read and parse all NDJSON log entries from a file */
export function readLogEntries(filePath: string): LogEntry[] {
  if (!existsSync(filePath)) return [];
  const content = readFileSync(filePath, "utf-8");
  return content
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line) as LogEntry;
      } catch {
        return null;
      }
    })
    .filter((e): e is LogEntry => e !== null);
}

/** Filter log entries by level, query, since, and limit */
export function filterLogEntries(entries: LogEntry[], filters: LogFilter): LogEntry[] {
  let result = entries;

  if (filters.level) {
    const levels = filters.level.split(",");
    result = result.filter((e) => levels.includes(pinoLevelToName(e.level)));
  }

  if (filters.minLevel != null) {
    const minLevel = filters.minLevel;
    result = result.filter((e) => e.level >= minLevel);
  }

  if (filters.query) {
    const q = filters.query.toLowerCase();
    result = result.filter((e) => JSON.stringify(e).toLowerCase().includes(q));
  }

  if (filters.since) {
    const sinceMs = parseSince(filters.since);
    result = result.filter((e) => e.time >= sinceMs);
  }

  if (filters.limit) {
    result = result.slice(-filters.limit);
  }

  return result;
}

/** Format a log entry as a human-readable string */
export function formatLogEntry(entry: LogEntry): string {
  const time = new Date(entry.time).toISOString();
  const level = pinoLevelToName(entry.level).toUpperCase().padEnd(5);
  const service = entry.service ? `[${entry.service}] ` : "";
  return `${time} ${level} ${service}${entry.msg}`;
}
