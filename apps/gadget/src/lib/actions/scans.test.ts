import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  getDb: vi.fn(() => ({})),
  queryAll: vi.fn(),
  queryOne: vi.fn(),
  execute: vi.fn(),
}));
vi.mock("@/lib/utils", () => ({
  generateId: vi.fn(() => "test-id"),
}));

import { execute, queryAll, queryOne } from "@/lib/db";
import { createScanRoot, deleteScanRoot, getScanRoots } from "./scans";

const mockQueryAll = vi.mocked(queryAll);
const mockQueryOne = vi.mocked(queryOne);
const mockExecute = vi.mocked(execute);

beforeEach(() => {
  vi.resetAllMocks();
});

describe("getScanRoots", () => {
  it("returns all scan roots ordered by created_at DESC", async () => {
    const roots = [
      { id: "1", path: "/repo1", created_at: "2024-01-02" },
      { id: "2", path: "/repo2", created_at: "2024-01-01" },
    ];
    mockQueryAll.mockResolvedValue(roots);

    const result = await getScanRoots();
    expect(result).toEqual(roots);
    expect(mockQueryAll).toHaveBeenCalledWith({}, "SELECT * FROM scan_roots ORDER BY created_at DESC");
  });
});

describe("createScanRoot", () => {
  it("returns existing scan root if path already exists", async () => {
    const existing = { id: "existing-id", path: "/repo1", created_at: "2024-01-01" };
    mockQueryOne.mockResolvedValueOnce(existing);

    const result = await createScanRoot("/repo1");
    expect(result).toEqual(existing);
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it("creates a new scan root when path does not exist", async () => {
    mockQueryOne
      .mockResolvedValueOnce(undefined) // no existing
      .mockResolvedValueOnce({ id: "test-id", path: "/new-repo", created_at: "2024-01-01" }); // created
    mockExecute.mockResolvedValue(undefined);

    const result = await createScanRoot("/new-repo");
    expect(result).toEqual({ id: "test-id", path: "/new-repo", created_at: "2024-01-01" });
    expect(mockExecute).toHaveBeenCalledWith({}, "INSERT INTO scan_roots (id, path) VALUES (?, ?)", [
      "test-id",
      "/new-repo",
    ]);
  });

  it("throws if created scan root cannot be found", async () => {
    mockQueryOne.mockResolvedValue(undefined);
    mockExecute.mockResolvedValue(undefined);

    await expect(createScanRoot("/new-repo")).rejects.toThrow("Failed to create scan root");
  });
});

describe("deleteScanRoot", () => {
  it("deletes a scan root by id", async () => {
    mockExecute.mockResolvedValue(undefined);

    await deleteScanRoot("root-1");
    expect(mockExecute).toHaveBeenCalledWith({}, "DELETE FROM scan_roots WHERE id = ?", ["root-1"]);
  });
});
