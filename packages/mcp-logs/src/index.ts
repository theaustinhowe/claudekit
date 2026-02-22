import { statSync } from "node:fs";
import {
  filterLogEntries,
  formatLogEntry,
  getLogFilePath,
  type LogEntry,
  listLogFiles,
  nameToLevel,
  parseSince,
  readLogEntries,
} from "@claudekit/logger";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({
  name: "claudekit-logs",
  version: "0.1.0",
});

// --- Tools ---

server.tool(
  "list_log_files",
  "List all claudekit log files with size, date, and last modified",
  { app: z.string().optional().describe("Filter by app name") },
  async ({ app }) => {
    const files = listLogFiles();
    const result = files
      .map((entry) => {
        if (app && entry.app !== app) return null;
        try {
          const stat = statSync(entry.path);
          return { app: entry.app, date: entry.date, size: stat.size, lastModified: stat.mtime.toISOString() };
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
    date: z.string().optional().describe("Filter by date (YYYY-MM-DD)"),
    level: z.string().optional().describe("Minimum log level: trace, debug, info, warn, error, fatal"),
    since: z.string().optional().describe("Time window, e.g. '1h', '30m', '7d'"),
    limit: z.number().optional().default(50).describe("Max entries to return"),
  },
  async ({ query, app, date, level, since, limit }) => {
    const files = listLogFiles();
    let allEntries: LogEntry[] = [];

    for (const entry of files) {
      if (app && entry.app !== app) continue;
      if (date && entry.date !== date) continue;
      allEntries = allEntries.concat(readLogEntries(entry.path));
    }

    let filtered = filterLogEntries(allEntries, { query, since, limit });

    if (level) {
      const minLevel = nameToLevel(level);
      filtered = filtered.filter((e) => e.level >= minLevel);
    }

    const text = filtered.map(formatLogEntry).join("\n");
    return { content: [{ type: "text" as const, text: text || "No matching entries found." }] };
  },
);

server.tool(
  "tail_logs",
  "Get the most recent log entries for an app",
  {
    app: z.string().describe("App name (e.g. 'gadget', 'gogo-orchestrator')"),
    date: z.string().optional().describe("Date to read logs from (YYYY-MM-DD). Defaults to today."),
    lines: z.number().optional().default(50).describe("Number of lines to return"),
    level: z.string().optional().describe("Minimum log level filter"),
  },
  async ({ app, date, lines, level }) => {
    const logFile = getLogFilePath(app, undefined, date);
    let entries = readLogEntries(logFile);

    if (level) {
      const minLevel = nameToLevel(level);
      entries = entries.filter((e) => e.level >= minLevel);
    }

    entries = entries.slice(-lines);
    const text = entries.map(formatLogEntry).join("\n");
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

    for (const entry of files) {
      if (app && entry.app !== app) continue;
      const entries = readLogEntries(entry.path);
      allEntries = allEntries.concat(entries.filter((e) => e.level >= 50));
    }

    const sinceMs = parseSince(since);
    let filtered = allEntries.filter((e) => e.time >= sinceMs);
    filtered.sort((a, b) => b.time - a.time);
    filtered = filtered.slice(0, limit);

    const text = filtered
      .map((e) => {
        const appName = e.app || "unknown";
        return `[${appName}] ${formatLogEntry(e)}`;
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
    date: z.string().optional().describe("Date to read logs from (YYYY-MM-DD). Defaults to today."),
    before: z.number().optional().default(10).describe("Number of entries before the timestamp"),
    after: z.number().optional().default(10).describe("Number of entries after the timestamp"),
  },
  async ({ app, timestamp, date, before, after }) => {
    const logFile = getLogFilePath(app, undefined, date);
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
        return `${marker} ${formatLogEntry(e)}`;
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
