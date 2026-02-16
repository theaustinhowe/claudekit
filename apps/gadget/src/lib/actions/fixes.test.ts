import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  getDb: vi.fn(() => ({})),
  queryOne: vi.fn(),
  execute: vi.fn(),
}));
vi.mock("@/lib/services/apply-engine", () => ({
  restoreSnapshot: vi.fn(),
}));

import { execute, queryOne } from "@/lib/db";
import { restoreSnapshot } from "@/lib/services/apply-engine";
import { restoreApplyRun } from "./fixes";

const mockQueryOne = vi.mocked(queryOne);
const mockExecute = vi.mocked(execute);
const mockRestoreSnapshot = vi.mocked(restoreSnapshot);

beforeEach(() => {
  vi.resetAllMocks();
});

describe("restoreApplyRun", () => {
  it("restores a snapshot successfully", async () => {
    mockQueryOne
      .mockResolvedValueOnce({ id: "run-1", snapshot_id: "snap-1", repo_id: "repo-1" }) // apply_run
      .mockResolvedValueOnce({ local_path: "/project" }); // repo
    mockRestoreSnapshot.mockResolvedValue(true);
    mockExecute.mockResolvedValue(undefined);

    const result = await restoreApplyRun("run-1");
    expect(result).toEqual({ success: true });
    expect(mockExecute).toHaveBeenCalledWith({}, "UPDATE apply_runs SET status = 'rolled_back' WHERE id = ?", [
      "run-1",
    ]);
  });

  it("returns error when run not found", async () => {
    mockQueryOne.mockResolvedValue(undefined);

    const result = await restoreApplyRun("nonexistent");
    expect(result).toEqual({ success: false, error: "No snapshot found" });
  });

  it("returns error when no snapshot_id", async () => {
    mockQueryOne.mockResolvedValue({ id: "run-1", snapshot_id: null, repo_id: "repo-1" });

    const result = await restoreApplyRun("run-1");
    expect(result).toEqual({ success: false, error: "No snapshot found" });
  });

  it("returns error when repo not found", async () => {
    mockQueryOne
      .mockResolvedValueOnce({ id: "run-1", snapshot_id: "snap-1", repo_id: "repo-1" })
      .mockResolvedValueOnce(undefined);

    const result = await restoreApplyRun("run-1");
    expect(result).toEqual({ success: false, error: "Repo not found" });
  });

  it("returns error when restore fails", async () => {
    mockQueryOne
      .mockResolvedValueOnce({ id: "run-1", snapshot_id: "snap-1", repo_id: "repo-1" })
      .mockResolvedValueOnce({ local_path: "/project" });
    mockRestoreSnapshot.mockResolvedValue(false);

    const result = await restoreApplyRun("run-1");
    expect(result).toEqual({ success: false, error: "Restore failed" });
  });
});
