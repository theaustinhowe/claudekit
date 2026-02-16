import { beforeEach, describe, expect, it, vi } from "vitest";

// Capture tool handlers during module load
const toolHandlers = new Map<string, (...args: unknown[]) => Promise<unknown>>();

vi.mock("@modelcontextprotocol/sdk/server/mcp.js", () => {
  class MockMcpServer {
    tool(
      name: string,
      _description: string,
      _schema: Record<string, unknown>,
      handler: (...args: unknown[]) => Promise<unknown>,
    ) {
      toolHandlers.set(name, handler);
    }
    async connect() {}
  }
  return { McpServer: MockMcpServer };
});

vi.mock("@modelcontextprotocol/sdk/server/stdio.js", () => ({
  StdioServerTransport: class {},
}));

vi.mock("@devkit/logger", () => ({
  listLogFiles: vi.fn(),
  readLogEntries: vi.fn(),
  filterLogEntries: vi.fn(),
  formatLogEntry: vi.fn(),
  getLogFilePath: vi.fn(),
  nameToLevel: vi.fn(),
  parseSince: vi.fn(),
}));

vi.mock("node:fs", () => ({
  statSync: vi.fn(),
}));

import { statSync } from "node:fs";
import type { LogEntry } from "@devkit/logger";
import {
  filterLogEntries,
  formatLogEntry,
  getLogFilePath,
  listLogFiles,
  nameToLevel,
  parseSince,
  readLogEntries,
} from "@devkit/logger";

// Trigger module load to register tools
await import("./index");

function getHandler(name: string) {
  const handler = toolHandlers.get(name);
  if (!handler) throw new Error(`Tool ${name} not found. Available: ${Array.from(toolHandlers.keys()).join(", ")}`);
  return handler;
}

describe("list_log_files", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("lists log files with stats", async () => {
    const handler = getHandler("list_log_files");

    vi.mocked(listLogFiles).mockReturnValue([
      { path: "/logs/gadget.2026-02-16.ndjson", app: "gadget", date: "2026-02-16" },
      { path: "/logs/web.2026-02-16.ndjson", app: "web", date: "2026-02-16" },
    ]);

    vi.mocked(statSync).mockReturnValue({
      size: 1024,
      mtime: new Date("2026-02-16T12:00:00Z"),
    } as ReturnType<typeof statSync>);

    const result = (await handler({ app: undefined })) as { content: Array<{ text: string }> };
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed).toHaveLength(2);
    expect(parsed[0].app).toBe("gadget");
    expect(parsed[0].size).toBe(1024);
  });

  it("filters by app name", async () => {
    const handler = getHandler("list_log_files");

    vi.mocked(listLogFiles).mockReturnValue([
      { path: "/logs/gadget.2026-02-16.ndjson", app: "gadget", date: "2026-02-16" },
      { path: "/logs/web.2026-02-16.ndjson", app: "web", date: "2026-02-16" },
    ]);

    vi.mocked(statSync).mockReturnValue({
      size: 512,
      mtime: new Date("2026-02-16T10:00:00Z"),
    } as ReturnType<typeof statSync>);

    const result = (await handler({ app: "gadget" })) as { content: Array<{ text: string }> };
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].app).toBe("gadget");
  });

  it("handles stat errors gracefully", async () => {
    const handler = getHandler("list_log_files");

    vi.mocked(listLogFiles).mockReturnValue([
      { path: "/logs/gadget.2026-02-16.ndjson", app: "gadget", date: "2026-02-16" },
    ]);

    vi.mocked(statSync).mockImplementation(() => {
      throw new Error("ENOENT");
    });

    const result = (await handler({ app: undefined })) as { content: Array<{ text: string }> };
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed).toHaveLength(0);
  });

  it("returns empty for no log files", async () => {
    const handler = getHandler("list_log_files");
    vi.mocked(listLogFiles).mockReturnValue([]);

    const result = (await handler({ app: undefined })) as { content: Array<{ text: string }> };
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed).toHaveLength(0);
  });
});

describe("search_logs", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("searches across log files with all filter params", async () => {
    const handler = getHandler("search_logs");

    vi.mocked(listLogFiles).mockReturnValue([
      { path: "/logs/gadget.2026-02-16.ndjson", app: "gadget", date: "2026-02-16" },
    ]);

    const entries: LogEntry[] = [
      { level: 30, time: 1000, msg: "hello world" },
      { level: 50, time: 2000, msg: "error occurred" },
    ];
    vi.mocked(readLogEntries).mockReturnValue(entries);
    vi.mocked(filterLogEntries).mockReturnValue([entries[1]]);
    vi.mocked(nameToLevel).mockReturnValue(50);
    vi.mocked(formatLogEntry).mockReturnValue("2026-02-16 ERROR error occurred");

    const result = (await handler({
      query: "error",
      app: "gadget",
      date: "2026-02-16",
      level: "error",
      since: "1h",
      limit: 50,
    })) as { content: Array<{ text: string }> };

    expect(result.content[0].text).toContain("error occurred");
  });

  it("returns no matches message when nothing found", async () => {
    const handler = getHandler("search_logs");

    vi.mocked(listLogFiles).mockReturnValue([
      { path: "/logs/gadget.2026-02-16.ndjson", app: "gadget", date: "2026-02-16" },
    ]);
    vi.mocked(readLogEntries).mockReturnValue([]);
    vi.mocked(filterLogEntries).mockReturnValue([]);

    const result = (await handler({
      query: "nonexistent",
      limit: 50,
    })) as { content: Array<{ text: string }> };

    expect(result.content[0].text).toBe("No matching entries found.");
  });

  it("filters by app and date", async () => {
    const handler = getHandler("search_logs");

    vi.mocked(listLogFiles).mockReturnValue([
      { path: "/logs/gadget.2026-02-16.ndjson", app: "gadget", date: "2026-02-16" },
      { path: "/logs/web.2026-02-16.ndjson", app: "web", date: "2026-02-16" },
      { path: "/logs/gadget.2026-02-15.ndjson", app: "gadget", date: "2026-02-15" },
    ]);
    vi.mocked(readLogEntries).mockReturnValue([]);
    vi.mocked(filterLogEntries).mockReturnValue([]);

    await handler({
      query: "test",
      app: "gadget",
      date: "2026-02-16",
      limit: 50,
    });

    // Should only read entries for matching app+date
    expect(readLogEntries).toHaveBeenCalledTimes(1);
    expect(readLogEntries).toHaveBeenCalledWith("/logs/gadget.2026-02-16.ndjson");
  });
});

describe("tail_logs", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns recent N entries", async () => {
    const handler = getHandler("tail_logs");

    vi.mocked(getLogFilePath).mockReturnValue("/logs/gadget.2026-02-16.ndjson");
    const entries: LogEntry[] = Array.from({ length: 100 }, (_, i) => ({
      level: 30,
      time: i * 1000,
      msg: `line ${i}`,
    }));
    vi.mocked(readLogEntries).mockReturnValue(entries);
    vi.mocked(formatLogEntry).mockImplementation((e) => `${e.time} ${e.msg}`);

    const result = (await handler({ app: "gadget", lines: 10 })) as { content: Array<{ text: string }> };
    const lines = result.content[0].text.split("\n");
    expect(lines).toHaveLength(10);
  });

  it("applies level filter", async () => {
    const handler = getHandler("tail_logs");

    vi.mocked(getLogFilePath).mockReturnValue("/logs/gadget.ndjson");
    vi.mocked(readLogEntries).mockReturnValue([
      { level: 30, time: 1000, msg: "info" },
      { level: 50, time: 2000, msg: "error" },
    ]);
    vi.mocked(nameToLevel).mockReturnValue(50);
    vi.mocked(formatLogEntry).mockReturnValue("ERROR error");

    const result = (await handler({ app: "gadget", lines: 50, level: "error" })) as {
      content: Array<{ text: string }>;
    };
    expect(result.content[0].text).toContain("error");
  });

  it("returns empty message when no entries found", async () => {
    const handler = getHandler("tail_logs");

    vi.mocked(getLogFilePath).mockReturnValue("/logs/gadget.ndjson");
    vi.mocked(readLogEntries).mockReturnValue([]);

    const result = (await handler({ app: "gadget", lines: 50 })) as { content: Array<{ text: string }> };
    expect(result.content[0].text).toContain("No log entries found");
  });

  it("defaults to 50 lines", async () => {
    const handler = getHandler("tail_logs");

    vi.mocked(getLogFilePath).mockReturnValue("/logs/gadget.ndjson");
    const entries: LogEntry[] = Array.from({ length: 100 }, (_, i) => ({
      level: 30,
      time: i * 1000,
      msg: `line ${i}`,
    }));
    vi.mocked(readLogEntries).mockReturnValue(entries);
    vi.mocked(formatLogEntry).mockImplementation((e) => e.msg);

    const result = (await handler({ app: "gadget", lines: 50 })) as { content: Array<{ text: string }> };
    const lines = result.content[0].text.split("\n");
    expect(lines).toHaveLength(50);
  });
});

describe("get_recent_errors", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns errors with level >= 50", async () => {
    const handler = getHandler("get_recent_errors");

    vi.mocked(listLogFiles).mockReturnValue([
      { path: "/logs/gadget.2026-02-16.ndjson", app: "gadget", date: "2026-02-16" },
    ]);
    vi.mocked(readLogEntries).mockReturnValue([
      { level: 30, time: Date.now(), msg: "info", app: "gadget" },
      { level: 50, time: Date.now(), msg: "error 1", app: "gadget" },
      { level: 60, time: Date.now(), msg: "fatal 1", app: "gadget" },
    ]);
    vi.mocked(parseSince).mockReturnValue(0); // Include all
    vi.mocked(formatLogEntry).mockImplementation((e) => `${e.msg}`);

    const result = (await handler({ since: "1h", limit: 20 })) as { content: Array<{ text: string }> };
    expect(result.content[0].text).toContain("error 1");
    expect(result.content[0].text).toContain("fatal 1");
    expect(result.content[0].text).not.toContain("info");
  });

  it("sorts by time descending", async () => {
    const handler = getHandler("get_recent_errors");

    vi.mocked(listLogFiles).mockReturnValue([{ path: "/logs/gadget.ndjson", app: "gadget", date: "2026-02-16" }]);
    vi.mocked(readLogEntries).mockReturnValue([
      { level: 50, time: 1000, msg: "old error", app: "gadget" },
      { level: 50, time: 3000, msg: "newest error", app: "gadget" },
      { level: 50, time: 2000, msg: "middle error", app: "gadget" },
    ]);
    vi.mocked(parseSince).mockReturnValue(0);
    vi.mocked(formatLogEntry).mockImplementation((e) => e.msg);

    const result = (await handler({ since: "1h", limit: 20 })) as { content: Array<{ text: string }> };
    const lines = result.content[0].text.split("\n");
    expect(lines[0]).toContain("newest error");
    expect(lines[2]).toContain("old error");
  });

  it("limits results", async () => {
    const handler = getHandler("get_recent_errors");

    vi.mocked(listLogFiles).mockReturnValue([{ path: "/logs/gadget.ndjson", app: "gadget", date: "2026-02-16" }]);
    vi.mocked(readLogEntries).mockReturnValue(
      Array.from({ length: 30 }, (_, i) => ({
        level: 50,
        time: Date.now() + i,
        msg: `error ${i}`,
        app: "gadget",
      })),
    );
    vi.mocked(parseSince).mockReturnValue(0);
    vi.mocked(formatLogEntry).mockImplementation((e) => e.msg);

    const result = (await handler({ since: "1h", limit: 5 })) as { content: Array<{ text: string }> };
    const lines = result.content[0].text.split("\n");
    expect(lines).toHaveLength(5);
  });

  it("filters by app", async () => {
    const handler = getHandler("get_recent_errors");

    vi.mocked(listLogFiles).mockReturnValue([
      { path: "/logs/gadget.ndjson", app: "gadget", date: "2026-02-16" },
      { path: "/logs/web.ndjson", app: "web", date: "2026-02-16" },
    ]);
    vi.mocked(readLogEntries).mockReturnValue([{ level: 50, time: Date.now(), msg: "error", app: "gadget" }]);
    vi.mocked(parseSince).mockReturnValue(0);
    vi.mocked(formatLogEntry).mockImplementation((e) => e.msg);

    await handler({ since: "1h", app: "gadget", limit: 20 });

    expect(readLogEntries).toHaveBeenCalledTimes(1);
    expect(readLogEntries).toHaveBeenCalledWith("/logs/gadget.ndjson");
  });

  it("returns no errors message when none found", async () => {
    const handler = getHandler("get_recent_errors");

    vi.mocked(listLogFiles).mockReturnValue([]);
    vi.mocked(parseSince).mockReturnValue(0);

    const result = (await handler({ since: "1h", limit: 20 })) as { content: Array<{ text: string }> };
    expect(result.content[0].text).toBe("No recent errors found.");
  });
});

describe("get_log_context", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("finds closest entry by ISO timestamp", async () => {
    const handler = getHandler("get_log_context");

    vi.mocked(getLogFilePath).mockReturnValue("/logs/gadget.ndjson");
    vi.mocked(readLogEntries).mockReturnValue([
      { level: 30, time: 1000, msg: "first" },
      { level: 30, time: 2000, msg: "second" },
      { level: 30, time: 3000, msg: "third" },
      { level: 30, time: 4000, msg: "fourth" },
      { level: 30, time: 5000, msg: "fifth" },
    ]);
    vi.mocked(formatLogEntry).mockImplementation((e) => e.msg);

    const result = (await handler({
      app: "gadget",
      timestamp: new Date(3000).toISOString(),
      before: 1,
      after: 1,
    })) as { content: Array<{ text: string }> };

    expect(result.content[0].text).toContain(">>> third");
    expect(result.content[0].text).toContain("   second");
    expect(result.content[0].text).toContain("   fourth");
  });

  it("finds closest entry by epoch timestamp", async () => {
    const handler = getHandler("get_log_context");

    vi.mocked(getLogFilePath).mockReturnValue("/logs/gadget.ndjson");
    vi.mocked(readLogEntries).mockReturnValue([
      { level: 30, time: 1000, msg: "first" },
      { level: 30, time: 5000, msg: "last" },
    ]);
    vi.mocked(formatLogEntry).mockImplementation((e) => e.msg);

    const result = (await handler({
      app: "gadget",
      timestamp: "4000",
      before: 1,
      after: 1,
    })) as { content: Array<{ text: string }> };

    // Closest to 4000 is 5000
    expect(result.content[0].text).toContain(">>> last");
  });

  it("clamps to array boundaries", async () => {
    const handler = getHandler("get_log_context");

    vi.mocked(getLogFilePath).mockReturnValue("/logs/gadget.ndjson");
    vi.mocked(readLogEntries).mockReturnValue([{ level: 30, time: 1000, msg: "only" }]);
    vi.mocked(formatLogEntry).mockImplementation((e) => e.msg);

    const result = (await handler({
      app: "gadget",
      timestamp: "1000",
      before: 10,
      after: 10,
    })) as { content: Array<{ text: string }> };

    expect(result.content[0].text).toContain(">>> only");
    const lines = result.content[0].text.split("\n").filter(Boolean);
    expect(lines).toHaveLength(1);
  });

  it("marks closest entry with >>> prefix", async () => {
    const handler = getHandler("get_log_context");

    vi.mocked(getLogFilePath).mockReturnValue("/logs/gadget.ndjson");
    vi.mocked(readLogEntries).mockReturnValue([
      { level: 30, time: 1000, msg: "before" },
      { level: 30, time: 2000, msg: "target" },
      { level: 30, time: 3000, msg: "after" },
    ]);
    vi.mocked(formatLogEntry).mockImplementation((e) => e.msg);

    const result = (await handler({
      app: "gadget",
      timestamp: "2000",
      before: 1,
      after: 1,
    })) as { content: Array<{ text: string }> };

    const lines = result.content[0].text.split("\n");
    expect(lines[0]).toMatch(/^ {3} before$/);
    expect(lines[1]).toMatch(/^>>> target$/);
    expect(lines[2]).toMatch(/^ {3} after$/);
  });

  it("returns empty message when no entries found", async () => {
    const handler = getHandler("get_log_context");

    vi.mocked(getLogFilePath).mockReturnValue("/logs/gadget.ndjson");
    vi.mocked(readLogEntries).mockReturnValue([]);
    vi.mocked(formatLogEntry).mockImplementation((e) => e.msg);

    const result = (await handler({
      app: "gadget",
      timestamp: "1000",
      before: 10,
      after: 10,
    })) as { content: Array<{ text: string }> };

    expect(result.content[0].text).toContain("No entries found");
  });
});
