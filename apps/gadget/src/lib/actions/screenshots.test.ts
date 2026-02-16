import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  getDb: vi.fn(() => ({})),
  queryAll: vi.fn(),
  queryOne: vi.fn(),
  execute: vi.fn(),
}));
vi.mock("@/lib/utils", () => ({
  generateId: vi.fn(() => "test-id"),
  nowTimestamp: vi.fn(() => "2024-01-01T00:00:00.000Z"),
}));

import { execute, queryAll, queryOne } from "@/lib/db";
import { getLatestScreenshot, getProjectScreenshots, saveScreenshot } from "./screenshots";

const mockQueryAll = vi.mocked(queryAll);
const mockQueryOne = vi.mocked(queryOne);
const mockExecute = vi.mocked(execute);

beforeEach(() => {
  vi.resetAllMocks();
});

describe("saveScreenshot", () => {
  it("inserts a screenshot with defaults", async () => {
    mockExecute.mockResolvedValue(undefined);

    const result = await saveScreenshot({
      project_id: "proj-1",
      file_path: "/screenshots/img.png",
    });

    expect(result).toEqual({
      id: "test-id",
      project_id: "proj-1",
      file_path: "/screenshots/img.png",
      label: null,
      width: 1280,
      height: 800,
      file_size: 0,
      message_id: null,
      created_at: "2024-01-01T00:00:00.000Z",
    });
    expect(mockExecute).toHaveBeenCalledWith(
      {},
      expect.stringContaining("INSERT INTO project_screenshots"),
      expect.arrayContaining(["test-id", "proj-1", "/screenshots/img.png"]),
    );
  });

  it("inserts a screenshot with all fields", async () => {
    mockExecute.mockResolvedValue(undefined);

    const result = await saveScreenshot({
      project_id: "proj-1",
      file_path: "/screenshots/img.png",
      label: "Homepage",
      width: 1920,
      height: 1080,
      file_size: 12345,
      message_id: "msg-1",
    });

    expect(result.label).toBe("Homepage");
    expect(result.width).toBe(1920);
    expect(result.height).toBe(1080);
    expect(result.file_size).toBe(12345);
    expect(result.message_id).toBe("msg-1");
  });
});

describe("getProjectScreenshots", () => {
  it("returns screenshots ordered by created_at ASC", async () => {
    const screenshots = [
      { id: "1", project_id: "proj-1", file_path: "/a.png", created_at: "2024-01-01" },
      { id: "2", project_id: "proj-1", file_path: "/b.png", created_at: "2024-01-02" },
    ];
    mockQueryAll.mockResolvedValue(screenshots);

    const result = await getProjectScreenshots("proj-1");
    expect(result).toEqual(screenshots);
    expect(mockQueryAll).toHaveBeenCalledWith(
      {},
      "SELECT * FROM project_screenshots WHERE project_id = ? ORDER BY created_at ASC",
      ["proj-1"],
    );
  });
});

describe("getLatestScreenshot", () => {
  it("returns the latest screenshot", async () => {
    const screenshot = { id: "2", project_id: "proj-1", file_path: "/b.png", created_at: "2024-01-02" };
    mockQueryOne.mockResolvedValue(screenshot);

    const result = await getLatestScreenshot("proj-1");
    expect(result).toEqual(screenshot);
  });

  it("returns null when no screenshots exist", async () => {
    mockQueryOne.mockResolvedValue(undefined);

    const result = await getLatestScreenshot("proj-1");
    expect(result).toBeNull();
  });
});
