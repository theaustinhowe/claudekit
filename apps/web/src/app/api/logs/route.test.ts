import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@claudekit/logger", () => ({
  listLogFiles: vi.fn(),
}));

vi.mock("node:fs", () => ({
  statSync: vi.fn(),
}));

import { statSync } from "node:fs";
import { listLogFiles } from "@claudekit/logger";
import { GET } from "./route";

const mockListLogFiles = vi.mocked(listLogFiles);
const mockStatSync = vi.mocked(statSync);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/logs", () => {
  it("returns empty array when no log files exist", async () => {
    mockListLogFiles.mockReturnValue([]);

    const response = await GET();
    const data = await response.json();

    expect(data).toEqual([]);
  });

  it("returns log files with stat info", async () => {
    mockListLogFiles.mockReturnValue([
      { path: "/logs/gadget.2026-02-15.ndjson", app: "gadget", date: "2026-02-15" },
      { path: "/logs/b4u.2026-02-14.ndjson", app: "b4u", date: "2026-02-14" },
    ]);

    const mtime = new Date("2026-02-15T10:00:00Z");
    mockStatSync.mockReturnValue({
      size: 4096,
      mtime,
    } as unknown as ReturnType<typeof statSync>);

    const response = await GET();
    const data = await response.json();

    expect(data).toHaveLength(2);
    expect(data[0]).toEqual({
      app: "gadget",
      date: "2026-02-15",
      path: "/logs/gadget.2026-02-15.ndjson",
      size: 4096,
      lastModified: mtime.toISOString(),
    });
  });

  it("filters out files that fail to stat", async () => {
    mockListLogFiles.mockReturnValue([
      { path: "/logs/gadget.2026-02-15.ndjson", app: "gadget", date: "2026-02-15" },
      { path: "/logs/missing.2026-02-15.ndjson", app: "missing", date: "2026-02-15" },
    ]);

    const mtime = new Date("2026-02-15T10:00:00Z");
    mockStatSync.mockImplementation((filePath) => {
      if ((filePath as string).includes("missing")) {
        throw new Error("ENOENT");
      }
      return { size: 1024, mtime } as unknown as ReturnType<typeof statSync>;
    });

    const response = await GET();
    const data = await response.json();

    expect(data).toHaveLength(1);
    expect(data[0].app).toBe("gadget");
  });

  it("handles legacy log files with null date", async () => {
    mockListLogFiles.mockReturnValue([{ path: "/logs/gadget.ndjson", app: "gadget", date: null }]);

    const mtime = new Date("2026-02-15T08:00:00Z");
    mockStatSync.mockReturnValue({
      size: 2048,
      mtime,
    } as unknown as ReturnType<typeof statSync>);

    const response = await GET();
    const data = await response.json();

    expect(data).toHaveLength(1);
    expect(data[0].date).toBeNull();
    expect(data[0].app).toBe("gadget");
  });
});
