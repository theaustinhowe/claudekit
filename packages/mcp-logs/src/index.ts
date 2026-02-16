import { existsSync, readFileSync, statSync } from "node:fs";
import { basename } from "node:path";
import { getLogFilePath, listLogFiles } from "@devkit/logger";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({
  name: "devkit-logs",
  version: "0.1.0",
});

// --- Helpers ---

interface LogEntry {
  level: number;
  time: number;
  msg: string;
  app?: string;
  service?: string;
  [key: string]: unknown;
}

function pinoLevelToName(level: number): string {
  if (level <= 10) return "trace";
  if (level <= 20) return "debug";
  if (level <= 30) return "info";
  if (level <= 40) return "warn";
  if (level <= 50) return "error";
  return "fatal";
}

function nameToLevel(name: string): number {
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

function parseSince(since: string): number {
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

function readLogEntries(filePath: string): LogEntry[] {
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

function formatEntry(entry: LogEntry): string {
  const time = new Date(entry.time).toISOString();
  const level = pinoLevelToName(entry.level).toUpperCase().padEnd(5);
  const service = entry.service ? `[${entry.service}] ` : "";
  return `${time} ${level} ${service}${entry.msg}`;
}

// --- Tools ---

server.tool(
  "list_log_files",
  "List all devkit log files with size and last modified date",
  { app: z.string().optional().describe("Filter by app name") },
  async ({ app }) => {
    const files = listLogFiles();
    const result = files
      .map((filePath) => {
        const name = basename(filePath, ".ndjson");
        if (app && name !== app) return null;
        try {
          const stat = statSync(filePath);
          return { app: name, size: stat.size, lastModified: stat.mtime.toISOString() };
        } catch {
          return null;
        }
      })
      .filter(Boolean);

    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  },
);

server.tool(
  "search_logs",
  "Search log entries by text query across log files",
  {
    query: z.string().describe("Text to search for in log messages"),
    app: z.string().optional().describe("Filter by app name"),
    level: z.string().optional().describe("Minimum log level: trace, debug, info, warn, error, fatal"),
    since: z.string().optional().describe("Time window, e.g. '1h', '30m', '7d'"),
    limit: z.number().optional().default(50).describe("Max entries to return"),
  },
  async ({ query, app, level, since, limit }) => {
    const files = listLogFiles();
    let allEntries: LogEntry[] = [];

    for (const filePath of files) {
      const name = basename(filePath, ".ndjson");
      if (app && name !== app) continue;
      allEntries = allEntries.concat(readLogEntries(filePath));
    }

    const q = query.toLowerCase();
    let filtered = allEntries.filter((e) => JSON.stringify(e).toLowerCase().includes(q));

    if (level) {
      const minLevel = nameToLevel(level);
      filtered = filtered.filter((e) => e.level >= minLevel);
    }

    if (since) {
      const sinceMs = parseSince(since);
      filtered = filtered.filter((e) => e.time >= sinceMs);
    }

    filtered = filtered.slice(-limit);
    const text = filtered.map(formatEntry).join("\n");
    return { content: [{ type: "text" as const, text: text || "No matching entries found." }] };
  },
);

server.tool(
  "tail_logs",
  "Get the most recent log entries for an app",
  {
    app: z.string().describe("App name (e.g. 'gadget', 'gogo-orchestrator')"),
    lines: z.number().optional().default(50).describe("Number of lines to return"),
    level: z.string().optional().describe("Minimum log level filter"),
  },
  async ({ app, lines, level }) => {
    const logFile = getLogFilePath(app);
    let entries = readLogEntries(logFile);

    if (level) {
      const minLevel = nameToLevel(level);
      entries = entries.filter((e) => e.level >= minLevel);
    }

    entries = entries.slice(-lines);
    const text = entries.map(formatEntry).join("\n");
    return { content: [{ type: "text" as const, text: text || `No log entries found for ${app}.` }] };
  },
);

server.tool(
  "get_recent_errors",
  "Get recent error and fatal log entries across all apps",
  {
    since: z.string().optional().default("1h").describe("Time window, e.g. '1h', '30m'"),
    app: z.string().optional().describe("Filter by app name"),
    limit: z.number().optional().default(20).describe("Max entries to return"),
  },
  async ({ since, app, limit }) => {
    const files = listLogFiles();
    let allEntries: LogEntry[] = [];

    for (const filePath of files) {
      const name = basename(filePath, ".ndjson");
      if (app && name !== app) continue;
      const entries = readLogEntries(filePath);
      allEntries = allEntries.concat(entries.filter((e) => e.level >= 50));
    }

    const sinceMs = parseSince(since);
    let filtered = allEntries.filter((e) => e.time >= sinceMs);
    filtered.sort((a, b) => b.time - a.time);
    filtered = filtered.slice(0, limit);

    const text = filtered
      .map((e) => {
        const appName = e.app || basename(getLogFilePath("unknown"), ".ndjson");
        return `[${appName}] ${formatEntry(e)}`;
      })
      .join("\n");

    return { content: [{ type: "text" as const, text: text || "No recent errors found." }] };
  },
);

server.tool(
  "get_log_context",
  "Get log entries around a specific timestamp for context",
  {
    app: z.string().describe("App name"),
    timestamp: z.string().describe("ISO timestamp or epoch ms to center around"),
    before: z.number().optional().default(10).describe("Number of entries before the timestamp"),
    after: z.number().optional().default(10).describe("Number of entries after the timestamp"),
  },
  async ({ app, timestamp, before, after }) => {
    const logFile = getLogFilePath(app);
    const entries = readLogEntries(logFile);
    const targetMs = timestamp.includes("T") ? new Date(timestamp).getTime() : Number.parseInt(timestamp, 10);

    // Find the closest entry
    let closestIdx = 0;
    let closestDiff = Number.POSITIVE_INFINITY;
    for (let i = 0; i < entries.length; i++) {
      const diff = Math.abs(entries[i].time - targetMs);
      if (diff < closestDiff) {
        closestDiff = diff;
        closestIdx = i;
      }
    }

    const startIdx = Math.max(0, closestIdx - before);
    const endIdx = Math.min(entries.length, closestIdx + after + 1);
    const context = entries.slice(startIdx, endIdx);

    const text = context
      .map((e, i) => {
        const marker = startIdx + i === closestIdx ? ">>>" : "   ";
        return `${marker} ${formatEntry(e)}`;
      })
      .join("\n");

    return { content: [{ type: "text" as const, text: text || `No entries found for ${app}.` }] };
  },
);

// --- Start ---

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("MCP server error:", err);
  process.exit(1);
});
