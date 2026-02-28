import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  getDb: vi.fn().mockResolvedValue({}),
  execute: vi.fn().mockResolvedValue(undefined),
  queryOne: vi.fn().mockResolvedValue(null),
  queryAll: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/lib/utils", () => ({
  generateId: vi.fn().mockReturnValue("test-screenshot-id"),
  nowTimestamp: vi.fn().mockReturnValue("2024-01-01T00:00:00.000Z"),
}));

import { cast } from "@claudekit/test-utils";
import { execute, getDb, queryAll, queryOne } from "@/lib/db";
import { getLatestScreenshot, getProjectScreenshots, saveScreenshot } from "./screenshots";

const mockGetDb = vi.mocked(getDb);
const mockExecute = vi.mocked(execute);
const mockQueryOne = vi.mocked(queryOne);
const mockQueryAll = vi.mocked(queryAll);

beforeEach(() => {
  vi.clearAllMocks();
  mockGetDb.mockResolvedValue({} as Awaited<ReturnType<typeof getDb>>);
  mockExecute.mockResolvedValue(cast(undefined));
});

describe("saveScreenshot", () => {
  it("saves a screenshot and returns it", async () => {
    const result = await saveScreenshot({
      project_id: "proj-1",
      file_path: "/screenshots/proj-1/123.png",
    });
    expect(result.id).toBe("test-screenshot-id");
    expect(result.project_id).toBe("proj-1");
    expect(result.file_path).toBe("/screenshots/proj-1/123.png");
    expect(result.width).toBe(1280);
    expect(result.height).toBe(800);
    expect(mockExecute).toHaveBeenCalledTimes(1);
  });

  it("uses provided dimensions", async () => {
    const result = await saveScreenshot({
      project_id: "proj-1",
      file_path: "/screenshots/test.png",
      width: 1920,
      height: 1080,
      file_size: 54321,
      label: "Desktop view",
      message_id: "msg-1",
    });
    expect(result.width).toBe(1920);
    expect(result.height).toBe(1080);
    expect(result.file_size).toBe(54321);
    expect(result.label).toBe("Desktop view");
    expect(result.message_id).toBe("msg-1");
  });
});

describe("getProjectScreenshots", () => {
  it("returns screenshots for a project", async () => {
    mockQueryAll.mockResolvedValue(cast([{ id: "s1" }]));
    const result = await getProjectScreenshots("proj-1");
    expect(result).toHaveLength(1);
  });
});

describe("getLatestScreenshot", () => {
  it("returns latest screenshot when exists", async () => {
    mockQueryOne.mockResolvedValue(cast({ id: "s1", file_path: "/test.png" }));
    const result = await getLatestScreenshot("proj-1");
    expect(result).not.toBeNull();
    expect(result?.id).toBe("s1");
  });

  it("returns null when no screenshots exist", async () => {
    mockQueryOne.mockResolvedValue(cast(undefined));
    const result = await getLatestScreenshot("proj-1");
    expect(result).toBeNull();
  });
});
