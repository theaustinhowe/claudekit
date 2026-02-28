import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { cast } from "@claudekit/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  readdirSync: vi.fn(),
  statSync: vi.fn(),
  unlinkSync: vi.fn(),
  createWriteStream: vi.fn(),
}));

beforeEach(() => {
  vi.resetAllMocks();
});

const mockedExistsSync = vi.mocked(existsSync);
const mockedMkdirSync = vi.mocked(mkdirSync);
const mockedReaddirSync = vi.mocked(readdirSync);
const mockedStatSync = vi.mocked(statSync);
const mockedUnlinkSync = vi.mocked(unlinkSync);

// vi.mocked resolves readdirSync to the Dirent-returning overload;
// our source uses the string-returning overload (with "utf-8" encoding)
function mockReaddir(files: string[]) {
  mockedReaddirSync.mockReturnValue(cast(files));
}

describe("getLogFilePath", () => {
  it("constructs path with app name, date, and .ndjson extension", async () => {
    const { getLogFilePath } = await import("./index.js");
    const result = getLogFilePath("gadget", "/tmp/logs", "2026-02-15");
    expect(result).toBe(join("/tmp/logs", "gadget.2026-02-15.ndjson"));
  });

  it("uses provided date parameter", async () => {
    const { getLogFilePath } = await import("./index.js");
    const result = getLogFilePath("web", "/var/log", "2025-12-31");
    expect(result).toBe(join("/var/log", "web.2025-12-31.ndjson"));
  });

  it("defaults to today's date when date is not provided", async () => {
    const { getLogFilePath } = await import("./index.js");
    const result = getLogFilePath("b4u", "/tmp/logs");
    const today = new Date();
    const expected = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    expect(result).toBe(join("/tmp/logs", `b4u.${expected}.ndjson`));
  });

  it("works with different app names", async () => {
    const { getLogFilePath } = await import("./index.js");
    const result = getLogFilePath("gogo-orchestrator", "/logs", "2026-01-01");
    expect(result).toBe(join("/logs", "gogo-orchestrator.2026-01-01.ndjson"));
  });
});

describe("parseLogFileName", () => {
  it("parses new date-based format: app.YYYY-MM-DD.ndjson", async () => {
    const { parseLogFileName } = await import("./index.js");
    const result = parseLogFileName("gadget.2026-02-15.ndjson");
    expect(result).toEqual({ app: "gadget", date: "2026-02-15" });
  });

  it("parses app names with hyphens", async () => {
    const { parseLogFileName } = await import("./index.js");
    const result = parseLogFileName("gogo-orchestrator.2026-01-01.ndjson");
    expect(result).toEqual({ app: "gogo-orchestrator", date: "2026-01-01" });
  });

  it("parses legacy format without date", async () => {
    const { parseLogFileName } = await import("./index.js");
    const result = parseLogFileName("gadget.ndjson");
    expect(result).toEqual({ app: "gadget", date: null });
  });

  it("parses legacy format with hyphenated app name", async () => {
    const { parseLogFileName } = await import("./index.js");
    const result = parseLogFileName("gogo-web.ndjson");
    expect(result).toEqual({ app: "gogo-web", date: null });
  });

  it("handles full path by extracting basename", async () => {
    const { parseLogFileName } = await import("./index.js");
    const result = parseLogFileName("/home/user/.claudekit/logs/web.2026-03-10.ndjson");
    expect(result).toEqual({ app: "web", date: "2026-03-10" });
  });
});

describe("listLogFiles", () => {
  it("discovers .ndjson files and returns metadata", async () => {
    mockedExistsSync.mockReturnValue(true);
    mockReaddir(["gadget.2026-02-15.ndjson", "web.ndjson", "ignore.txt"]);

    const { listLogFiles } = await import("./index.js");
    const result = listLogFiles("/tmp/logs");

    expect(result).toEqual([
      { path: join("/tmp/logs", "gadget.2026-02-15.ndjson"), app: "gadget", date: "2026-02-15" },
      { path: join("/tmp/logs", "web.ndjson"), app: "web", date: null },
    ]);
  });

  it("filters out non-ndjson files", async () => {
    mockedExistsSync.mockReturnValue(true);
    mockReaddir(["notes.txt", "data.json", "app.ndjson"]);

    const { listLogFiles } = await import("./index.js");
    const result = listLogFiles("/tmp/logs");

    expect(result).toHaveLength(1);
    expect(result[0].app).toBe("app");
  });

  it("returns empty array when no ndjson files exist", async () => {
    mockedExistsSync.mockReturnValue(true);
    mockReaddir([]);

    const { listLogFiles } = await import("./index.js");
    const result = listLogFiles("/tmp/logs");

    expect(result).toEqual([]);
  });

  it("ensures log directory exists before listing", async () => {
    mockedExistsSync.mockReturnValue(false);
    mockReaddir([]);

    const { listLogFiles } = await import("./index.js");
    listLogFiles("/tmp/logs");

    expect(mockedMkdirSync).toHaveBeenCalledWith("/tmp/logs", { recursive: true });
  });
});

describe("pruneOldLogs", () => {
  it("removes files older than 14 days", async () => {
    mockedExistsSync.mockReturnValue(true);
    mockReaddir(["old.ndjson", "new.ndjson"]);

    const now = Date.now();
    const fifteenDaysAgo = now - 15 * 24 * 60 * 60 * 1000;
    const oneDayAgo = now - 1 * 24 * 60 * 60 * 1000;

    mockedStatSync.mockImplementation((filePath) => {
      const p = String(filePath);
      if (p.includes("old.ndjson")) {
        return { mtimeMs: fifteenDaysAgo } as ReturnType<typeof statSync>;
      }
      return { mtimeMs: oneDayAgo } as ReturnType<typeof statSync>;
    });

    const { pruneOldLogs } = await import("./index.js");
    pruneOldLogs("/tmp/logs");

    expect(mockedUnlinkSync).toHaveBeenCalledTimes(1);
    expect(mockedUnlinkSync).toHaveBeenCalledWith(join("/tmp/logs", "old.ndjson"));
  });

  it("does not remove files within 14 days", async () => {
    mockedExistsSync.mockReturnValue(true);
    mockReaddir(["recent.ndjson"]);

    mockedStatSync.mockReturnValue({ mtimeMs: Date.now() - 5 * 24 * 60 * 60 * 1000 } as ReturnType<typeof statSync>);

    const { pruneOldLogs } = await import("./index.js");
    pruneOldLogs("/tmp/logs");

    expect(mockedUnlinkSync).not.toHaveBeenCalled();
  });

  it("skips non-ndjson files", async () => {
    mockedExistsSync.mockReturnValue(true);
    mockReaddir(["readme.txt"]);

    const { pruneOldLogs } = await import("./index.js");
    pruneOldLogs("/tmp/logs");

    expect(mockedStatSync).not.toHaveBeenCalled();
    expect(mockedUnlinkSync).not.toHaveBeenCalled();
  });

  it("handles stat errors gracefully", async () => {
    mockedExistsSync.mockReturnValue(true);
    mockReaddir(["broken.ndjson"]);
    mockedStatSync.mockImplementation(() => {
      throw new Error("ENOENT");
    });

    const { pruneOldLogs } = await import("./index.js");
    expect(() => pruneOldLogs("/tmp/logs")).not.toThrow();
    expect(mockedUnlinkSync).not.toHaveBeenCalled();
  });
});

describe("ensureLogDir", () => {
  it("creates directory when it does not exist", async () => {
    mockedExistsSync.mockReturnValue(false);

    const { ensureLogDir } = await import("./index.js");
    ensureLogDir("/tmp/logs");

    expect(mockedMkdirSync).toHaveBeenCalledWith("/tmp/logs", { recursive: true });
  });

  it("does not create directory when it already exists", async () => {
    mockedExistsSync.mockReturnValue(true);

    const { ensureLogDir } = await import("./index.js");
    ensureLogDir("/tmp/logs");

    expect(mockedMkdirSync).not.toHaveBeenCalled();
  });

  it("uses default log directory when no argument is provided", async () => {
    mockedExistsSync.mockReturnValue(false);

    const { ensureLogDir } = await import("./index.js");
    ensureLogDir();

    // Should have been called with the default ~/.claudekit/logs path
    expect(mockedMkdirSync).toHaveBeenCalledWith(expect.stringContaining(".claudekit"), { recursive: true });
  });
});

describe("pruneOldLogs edge cases", () => {
  it("removes multiple old files in a single call", async () => {
    mockedExistsSync.mockReturnValue(true);
    mockReaddir(["old1.ndjson", "old2.ndjson", "new.ndjson"]);

    const now = Date.now();
    const twentyDaysAgo = now - 20 * 24 * 60 * 60 * 1000;
    const oneDayAgo = now - 1 * 24 * 60 * 60 * 1000;

    mockedStatSync.mockImplementation((filePath) => {
      const p = String(filePath);
      if (p.includes("new.ndjson")) {
        return { mtimeMs: oneDayAgo } as ReturnType<typeof statSync>;
      }
      return { mtimeMs: twentyDaysAgo } as ReturnType<typeof statSync>;
    });

    const { pruneOldLogs } = await import("./index.js");
    pruneOldLogs("/tmp/logs");

    expect(mockedUnlinkSync).toHaveBeenCalledTimes(2);
    expect(mockedUnlinkSync).toHaveBeenCalledWith(join("/tmp/logs", "old1.ndjson"));
    expect(mockedUnlinkSync).toHaveBeenCalledWith(join("/tmp/logs", "old2.ndjson"));
  });

  it("handles empty directory", async () => {
    mockedExistsSync.mockReturnValue(true);
    mockReaddir([]);

    const { pruneOldLogs } = await import("./index.js");
    pruneOldLogs("/tmp/logs");

    expect(mockedStatSync).not.toHaveBeenCalled();
    expect(mockedUnlinkSync).not.toHaveBeenCalled();
  });

  it("handles mixed file types and only processes .ndjson files", async () => {
    mockedExistsSync.mockReturnValue(true);
    mockReaddir(["readme.md", "data.json", "old.ndjson", "config.yaml"]);

    const twentyDaysAgo = Date.now() - 20 * 24 * 60 * 60 * 1000;
    mockedStatSync.mockReturnValue({ mtimeMs: twentyDaysAgo } as ReturnType<typeof statSync>);

    const { pruneOldLogs } = await import("./index.js");
    pruneOldLogs("/tmp/logs");

    // Only .ndjson files should be stat'd
    expect(mockedStatSync).toHaveBeenCalledTimes(1);
    expect(mockedUnlinkSync).toHaveBeenCalledTimes(1);
  });

  it("uses default log directory when no argument is provided", async () => {
    mockedExistsSync.mockReturnValue(true);
    mockReaddir([]);

    const { pruneOldLogs } = await import("./index.js");
    pruneOldLogs();

    // Should use the default path
    expect(mockedReaddirSync).toHaveBeenCalledWith(expect.stringContaining(".claudekit"), "utf-8");
  });
});

describe("listLogFiles edge cases", () => {
  it("uses default log directory when no argument is provided", async () => {
    mockedExistsSync.mockReturnValue(true);
    mockReaddir([]);

    const { listLogFiles } = await import("./index.js");
    listLogFiles();

    expect(mockedReaddirSync).toHaveBeenCalledWith(expect.stringContaining(".claudekit"), "utf-8");
  });
});

describe("getLogFilePath edge cases", () => {
  it("uses default log directory when no logDir argument is provided", async () => {
    const { getLogFilePath } = await import("./index.js");
    const result = getLogFilePath("web");
    expect(result).toContain(".claudekit");
    expect(result).toContain("web.");
    expect(result).toContain(".ndjson");
  });
});
