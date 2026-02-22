import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@claudekit/logger", async () => {
  const actual = await vi.importActual<typeof import("@claudekit/logger")>("@claudekit/logger");
  return {
    ...actual,
    getLogFilePath: vi.fn(),
    readLogEntries: vi.fn(),
  };
});

vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
}));

import { existsSync } from "node:fs";
import { getLogFilePath, readLogEntries } from "@claudekit/logger";
import { GET } from "./route";

const mockGetLogFilePath = vi.mocked(getLogFilePath);
const mockExistsSync = vi.mocked(existsSync);
const mockReadLogEntries = vi.mocked(readLogEntries);

beforeEach(() => {
  vi.clearAllMocks();
  mockGetLogFilePath.mockReturnValue("/logs/gadget.2026-02-15.ndjson");
});

function makeEntry(overrides: Record<string, unknown> = {}) {
  return {
    level: 30,
    time: Date.now(),
    msg: "test message",
    ...overrides,
  };
}

function buildRequest(appName: string, searchParams: Record<string, string> = {}) {
  const url = new URL(`http://localhost:2000/api/logs/${appName}`);
  for (const [k, v] of Object.entries(searchParams)) {
    url.searchParams.set(k, v);
  }
  const req = new Request(url.toString());
  const params = Promise.resolve({ app: appName });
  return { req, params };
}

describe("GET /api/logs/[app]", () => {
  it("returns 404 when log file does not exist", async () => {
    mockExistsSync.mockReturnValue(false);
    const { req, params } = buildRequest("gadget");

    const response = await GET(req as never, { params });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe("Log file not found");
  });

  it("returns parsed log entries", async () => {
    mockExistsSync.mockReturnValue(true);
    mockReadLogEntries.mockReturnValue([makeEntry({ msg: "first" }), makeEntry({ msg: "second" })] as never);

    const { req, params } = buildRequest("gadget");
    const response = await GET(req as never, { params });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.total).toBe(2);
    expect(data.entries).toHaveLength(2);
    expect(data.entries[0].msg).toBe("first");
    expect(data.entries[1].msg).toBe("second");
  });

  it("passes date param to getLogFilePath", async () => {
    mockExistsSync.mockReturnValue(true);
    mockReadLogEntries.mockReturnValue([makeEntry()] as never);

    const { req, params } = buildRequest("gadget", { date: "2026-02-10" });
    await GET(req as never, { params });

    expect(mockGetLogFilePath).toHaveBeenCalledWith("gadget", undefined, "2026-02-10");
  });

  it("filters by level", async () => {
    mockExistsSync.mockReturnValue(true);
    mockReadLogEntries.mockReturnValue([
      makeEntry({ level: 30, msg: "info" }),
      makeEntry({ level: 50, msg: "error" }),
      makeEntry({ level: 40, msg: "warn" }),
    ] as never);

    const { req, params } = buildRequest("gadget", { level: "error" });
    const response = await GET(req as never, { params });
    const data = await response.json();

    expect(data.total).toBe(1);
    expect(data.entries[0].msg).toBe("error");
  });

  it("filters by multiple levels", async () => {
    mockExistsSync.mockReturnValue(true);
    mockReadLogEntries.mockReturnValue([
      makeEntry({ level: 30, msg: "info" }),
      makeEntry({ level: 50, msg: "error" }),
      makeEntry({ level: 40, msg: "warn" }),
    ] as never);

    const { req, params } = buildRequest("gadget", { level: "error,warn" });
    const response = await GET(req as never, { params });
    const data = await response.json();

    expect(data.total).toBe(2);
    const msgs = data.entries.map((e: { msg: string }) => e.msg);
    expect(msgs).toContain("error");
    expect(msgs).toContain("warn");
  });

  it("filters by text query", async () => {
    mockExistsSync.mockReturnValue(true);
    mockReadLogEntries.mockReturnValue([
      makeEntry({ msg: "database connected" }),
      makeEntry({ msg: "user logged in" }),
      makeEntry({ msg: "database error" }),
    ] as never);

    const { req, params } = buildRequest("gadget", { q: "database" });
    const response = await GET(req as never, { params });
    const data = await response.json();

    expect(data.total).toBe(2);
    for (const entry of data.entries) {
      expect(entry.msg.toLowerCase()).toContain("database");
    }
  });

  it("filters by since with minutes unit", async () => {
    mockExistsSync.mockReturnValue(true);
    const now = Date.now();
    mockReadLogEntries.mockReturnValue([
      makeEntry({ time: now - 120_000, msg: "old" }),
      makeEntry({ time: now - 30_000, msg: "recent" }),
    ] as never);

    const { req, params } = buildRequest("gadget", { since: "1m" });
    const response = await GET(req as never, { params });
    const data = await response.json();

    expect(data.total).toBe(1);
    expect(data.entries[0].msg).toBe("recent");
  });

  it("filters by since with hours unit", async () => {
    mockExistsSync.mockReturnValue(true);
    const now = Date.now();
    mockReadLogEntries.mockReturnValue([
      makeEntry({ time: now - 7_200_000, msg: "old" }),
      makeEntry({ time: now - 1_800_000, msg: "recent" }),
    ] as never);

    const { req, params } = buildRequest("gadget", { since: "1h" });
    const response = await GET(req as never, { params });
    const data = await response.json();

    expect(data.total).toBe(1);
    expect(data.entries[0].msg).toBe("recent");
  });

  it("respects limit param and returns last N entries", async () => {
    mockExistsSync.mockReturnValue(true);
    mockReadLogEntries.mockReturnValue(Array.from({ length: 10 }, (_, i) => makeEntry({ msg: `entry-${i}` })) as never);

    const { req, params } = buildRequest("gadget", { limit: "3" });
    const response = await GET(req as never, { params });
    const data = await response.json();

    expect(data.total).toBe(3);
    expect(data.entries[0].msg).toBe("entry-7");
    expect(data.entries[2].msg).toBe("entry-9");
  });

  it("defaults limit to 1000", async () => {
    mockExistsSync.mockReturnValue(true);
    mockReadLogEntries.mockReturnValue(Array.from({ length: 5 }, (_, i) => makeEntry({ msg: `entry-${i}` })) as never);

    const { req, params } = buildRequest("gadget");
    const response = await GET(req as never, { params });
    const data = await response.json();

    expect(data.total).toBe(5);
  });

  it("maps pino levels correctly", async () => {
    mockExistsSync.mockReturnValue(true);

    const entries = [
      makeEntry({ level: 10, msg: "trace" }),
      makeEntry({ level: 20, msg: "debug" }),
      makeEntry({ level: 30, msg: "info" }),
      makeEntry({ level: 40, msg: "warn" }),
      makeEntry({ level: 50, msg: "error" }),
      makeEntry({ level: 60, msg: "fatal" }),
    ];
    mockReadLogEntries.mockReturnValue(entries as never);

    const testCases = [
      { level: "trace", expected: "trace" },
      { level: "debug", expected: "debug" },
      { level: "info", expected: "info" },
      { level: "warn", expected: "warn" },
      { level: "error", expected: "error" },
      { level: "fatal", expected: "fatal" },
    ];

    for (const { level, expected } of testCases) {
      const { req, params } = buildRequest("gadget", { level });
      const response = await GET(req as never, { params });
      const data = await response.json();
      expect(data.entries[0].msg).toBe(expected);
    }
  });
});
