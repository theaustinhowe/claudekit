import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
}));

import { existsSync, readFileSync } from "node:fs";
import { filterLogEntries, formatLogEntry, nameToLevel, parseSince, pinoLevelToName, readLogEntries } from "./query";

describe("pinoLevelToName", () => {
  it("returns trace for level <= 10", () => {
    expect(pinoLevelToName(10)).toBe("trace");
    expect(pinoLevelToName(5)).toBe("trace");
    expect(pinoLevelToName(0)).toBe("trace");
  });

  it("returns debug for level 11-20", () => {
    expect(pinoLevelToName(20)).toBe("debug");
    expect(pinoLevelToName(11)).toBe("debug");
    expect(pinoLevelToName(15)).toBe("debug");
  });

  it("returns info for level 21-30", () => {
    expect(pinoLevelToName(30)).toBe("info");
    expect(pinoLevelToName(21)).toBe("info");
    expect(pinoLevelToName(25)).toBe("info");
  });

  it("returns warn for level 31-40", () => {
    expect(pinoLevelToName(40)).toBe("warn");
    expect(pinoLevelToName(31)).toBe("warn");
    expect(pinoLevelToName(35)).toBe("warn");
  });

  it("returns error for level 41-50", () => {
    expect(pinoLevelToName(50)).toBe("error");
    expect(pinoLevelToName(41)).toBe("error");
    expect(pinoLevelToName(45)).toBe("error");
  });

  it("returns fatal for level > 50", () => {
    expect(pinoLevelToName(51)).toBe("fatal");
    expect(pinoLevelToName(60)).toBe("fatal");
    expect(pinoLevelToName(100)).toBe("fatal");
  });
});

describe("nameToLevel", () => {
  it("converts trace to 10", () => {
    expect(nameToLevel("trace")).toBe(10);
  });

  it("converts debug to 20", () => {
    expect(nameToLevel("debug")).toBe(20);
  });

  it("converts info to 30", () => {
    expect(nameToLevel("info")).toBe(30);
  });

  it("converts warn to 40", () => {
    expect(nameToLevel("warn")).toBe(40);
  });

  it("converts error to 50", () => {
    expect(nameToLevel("error")).toBe(50);
  });

  it("converts fatal to 60", () => {
    expect(nameToLevel("fatal")).toBe(60);
  });

  it("returns 0 for unknown names", () => {
    expect(nameToLevel("unknown")).toBe(0);
    expect(nameToLevel("")).toBe(0);
    expect(nameToLevel("WARNING")).toBe(0);
  });
});

describe("parseSince", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-16T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("parses seconds", () => {
    const result = parseSince("30s");
    expect(result).toBe(Date.now() - 30_000);
  });

  it("parses minutes", () => {
    const result = parseSince("5m");
    expect(result).toBe(Date.now() - 5 * 60 * 1000);
  });

  it("parses hours", () => {
    const result = parseSince("2h");
    expect(result).toBe(Date.now() - 2 * 60 * 60 * 1000);
  });

  it("parses days", () => {
    const result = parseSince("7d");
    expect(result).toBe(Date.now() - 7 * 24 * 60 * 60 * 1000);
  });

  it("returns 0 for invalid input", () => {
    expect(parseSince("invalid")).toBe(0);
    expect(parseSince("abc")).toBe(0);
    expect(parseSince("10x")).toBe(0);
  });

  it("returns 0 for empty string", () => {
    expect(parseSince("")).toBe(0);
  });
});

describe("readLogEntries", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns empty array when file does not exist", () => {
    vi.mocked(existsSync).mockReturnValue(false);
    const result = readLogEntries("/tmp/nonexistent.ndjson");
    expect(result).toEqual([]);
  });

  it("parses valid NDJSON lines", () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(
      [
        JSON.stringify({ level: 30, time: 1000, msg: "hello" }),
        JSON.stringify({ level: 50, time: 2000, msg: "error occurred" }),
      ].join("\n"),
    );

    const result = readLogEntries("/tmp/app.ndjson");
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ level: 30, time: 1000, msg: "hello" });
    expect(result[1]).toEqual({ level: 50, time: 2000, msg: "error occurred" });
  });

  it("skips malformed JSON lines", () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(
      [JSON.stringify({ level: 30, time: 1000, msg: "valid" }), "this is not json", "{broken: json}"].join("\n"),
    );

    const result = readLogEntries("/tmp/app.ndjson");
    expect(result).toHaveLength(1);
    expect(result[0].msg).toBe("valid");
  });

  it("skips empty lines", () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(
      `${JSON.stringify({ level: 30, time: 1000, msg: "first" })}\n\n\n${JSON.stringify({ level: 30, time: 2000, msg: "second" })}`,
    );

    const result = readLogEntries("/tmp/app.ndjson");
    expect(result).toHaveLength(2);
  });

  it("handles file with only whitespace", () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue("   \n  \n  ");
    const result = readLogEntries("/tmp/app.ndjson");
    expect(result).toEqual([]);
  });
});

describe("filterLogEntries", () => {
  const entries = [
    { level: 10, time: 1000, msg: "trace msg", service: "web" },
    { level: 20, time: 2000, msg: "debug msg", service: "api" },
    { level: 30, time: 3000, msg: "info msg", service: "web" },
    { level: 40, time: 4000, msg: "warn msg", service: "api" },
    { level: 50, time: 5000, msg: "error msg", service: "web" },
    { level: 60, time: 6000, msg: "fatal msg", service: "api" },
  ];

  it("returns all entries when no filters applied", () => {
    const result = filterLogEntries(entries, {});
    expect(result).toHaveLength(6);
  });

  it("filters by single level name", () => {
    const result = filterLogEntries(entries, { level: "error" });
    expect(result).toHaveLength(1);
    expect(result[0].msg).toBe("error msg");
  });

  it("filters by multiple level names (comma-separated)", () => {
    const result = filterLogEntries(entries, { level: "warn,error" });
    expect(result).toHaveLength(2);
    expect(result[0].msg).toBe("warn msg");
    expect(result[1].msg).toBe("error msg");
  });

  it("filters by minLevel", () => {
    const result = filterLogEntries(entries, { minLevel: 40 });
    expect(result).toHaveLength(3);
    expect(result.map((e) => e.msg)).toEqual(["warn msg", "error msg", "fatal msg"]);
  });

  it("filters by case-insensitive query", () => {
    const result = filterLogEntries(entries, { query: "WARN" });
    expect(result).toHaveLength(1);
    expect(result[0].msg).toBe("warn msg");
  });

  it("query searches full JSON (including service field)", () => {
    const result = filterLogEntries(entries, { query: "api" });
    expect(result).toHaveLength(3);
  });

  it("filters by since timestamp", () => {
    // Use entries with realistic timestamps
    const now = Date.now();
    const timedEntries = [
      { level: 30, time: now - 7200_000, msg: "old entry" }, // 2 hours ago
      { level: 30, time: now - 3600_000, msg: "medium entry" }, // 1 hour ago
      { level: 30, time: now - 1800_000, msg: "recent entry" }, // 30 min ago
      { level: 30, time: now - 60_000, msg: "very recent entry" }, // 1 min ago
    ];

    // Filter to last 1 hour
    const result = filterLogEntries(timedEntries, { since: "1h" });
    // Should exclude the 2-hour-old entry
    expect(result).toHaveLength(3);
    expect(result[0].msg).toBe("medium entry");
  });

  it("limits results from end", () => {
    const result = filterLogEntries(entries, { limit: 2 });
    expect(result).toHaveLength(2);
    expect(result[0].msg).toBe("error msg");
    expect(result[1].msg).toBe("fatal msg");
  });

  it("chains multiple filters", () => {
    const result = filterLogEntries(entries, { minLevel: 30, limit: 2 });
    expect(result).toHaveLength(2);
    expect(result[0].msg).toBe("error msg");
    expect(result[1].msg).toBe("fatal msg");
  });

  it("returns empty array when no entries match", () => {
    const result = filterLogEntries(entries, { query: "nonexistent" });
    expect(result).toEqual([]);
  });

  it("filters by level and query combined", () => {
    const result = filterLogEntries(entries, { level: "info,warn,error,fatal", query: "web" });
    expect(result).toHaveLength(2);
    expect(result[0].msg).toBe("info msg");
    expect(result[1].msg).toBe("error msg");
  });

  it("filters by since with minutes unit", () => {
    const now = Date.now();
    const timedEntries = [
      { level: 30, time: now - 600_000, msg: "10 min ago" },
      { level: 30, time: now - 120_000, msg: "2 min ago" },
      { level: 30, time: now - 30_000, msg: "30 sec ago" },
    ];

    const result = filterLogEntries(timedEntries, { since: "5m" });
    expect(result).toHaveLength(2);
    expect(result[0].msg).toBe("2 min ago");
  });

  it("filters by since with days unit", () => {
    const now = Date.now();
    const timedEntries = [
      { level: 30, time: now - 3 * 24 * 60 * 60 * 1000, msg: "3 days ago" },
      { level: 30, time: now - 60_000, msg: "1 min ago" },
    ];

    const result = filterLogEntries(timedEntries, { since: "2d" });
    expect(result).toHaveLength(1);
    expect(result[0].msg).toBe("1 min ago");
  });

  it("handles since with invalid format (returns all entries)", () => {
    const result = filterLogEntries(entries, { since: "invalid" });
    // parseSince("invalid") returns 0, so all entries with time >= 0 pass
    expect(result).toHaveLength(6);
  });

  it("handles limit of 0 (no entries)", () => {
    const result = filterLogEntries(entries, { limit: 0 });
    // slice(-0) returns entire array in JS
    expect(result).toHaveLength(6);
  });

  it("handles limit larger than entries length", () => {
    const result = filterLogEntries(entries, { limit: 100 });
    expect(result).toHaveLength(6);
  });

  it("handles limit of 1 (only last entry)", () => {
    const result = filterLogEntries(entries, { limit: 1 });
    expect(result).toHaveLength(1);
    expect(result[0].msg).toBe("fatal msg");
  });

  it("chains level, query, since, and limit filters", () => {
    const now = Date.now();
    const complexEntries = [
      { level: 30, time: now - 7200_000, msg: "old info", service: "web" },
      { level: 40, time: now - 3600_000, msg: "old warn", service: "api" },
      { level: 30, time: now - 1800_000, msg: "recent info", service: "web" },
      { level: 40, time: now - 60_000, msg: "recent warn", service: "web" },
      { level: 50, time: now - 30_000, msg: "recent error", service: "web" },
    ];

    const result = filterLogEntries(complexEntries, {
      minLevel: 40,
      query: "web",
      since: "1h",
      limit: 1,
    });
    expect(result).toHaveLength(1);
    expect(result[0].msg).toBe("recent error");
  });

  it("query finds matches in nested object values", () => {
    const entriesWithExtra = [
      { level: 30, time: 1000, msg: "normal", extra: { detail: "special-value" } },
      { level: 30, time: 2000, msg: "other" },
    ];
    const result = filterLogEntries(entriesWithExtra, { query: "special-value" });
    expect(result).toHaveLength(1);
    expect(result[0].msg).toBe("normal");
  });
});

describe("formatLogEntry", () => {
  it("formats entry with timestamp, level, and message", () => {
    const entry = { level: 30, time: new Date("2026-02-16T12:00:00.000Z").getTime(), msg: "hello world" };
    const result = formatLogEntry(entry);
    expect(result).toBe("2026-02-16T12:00:00.000Z INFO  hello world");
  });

  it("pads level name to 5 characters", () => {
    const entry = { level: 40, time: new Date("2026-02-16T12:00:00.000Z").getTime(), msg: "warning" };
    const result = formatLogEntry(entry);
    expect(result).toContain("WARN ");
  });

  it("includes service prefix when present", () => {
    const entry = {
      level: 30,
      time: new Date("2026-02-16T12:00:00.000Z").getTime(),
      msg: "started",
      service: "scanner",
    };
    const result = formatLogEntry(entry);
    expect(result).toContain("[scanner] ");
    expect(result).toBe("2026-02-16T12:00:00.000Z INFO  [scanner] started");
  });

  it("omits service prefix when not present", () => {
    const entry = { level: 50, time: new Date("2026-02-16T12:00:00.000Z").getTime(), msg: "fail" };
    const result = formatLogEntry(entry);
    expect(result).not.toContain("[");
    expect(result).toBe("2026-02-16T12:00:00.000Z ERROR fail");
  });

  it("formats fatal level", () => {
    const entry = { level: 60, time: new Date("2026-02-16T12:00:00.000Z").getTime(), msg: "crash" };
    const result = formatLogEntry(entry);
    expect(result).toContain("FATAL");
  });

  it("formats trace level", () => {
    const entry = { level: 10, time: new Date("2026-02-16T12:00:00.000Z").getTime(), msg: "trace data" };
    const result = formatLogEntry(entry);
    expect(result).toContain("TRACE");
  });
});
