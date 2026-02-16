import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  getDb: vi.fn(async () => ({})),
  queryOne: vi.fn(),
}));
vi.mock("@/lib/services/apply-engine", () => ({
  applyFixes: vi.fn(),
}));

import { queryOne } from "@/lib/db";
import { applyFixes } from "@/lib/services/apply-engine";
import { createFixApplyRunner } from "./fix-apply";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("fix-apply runner", () => {
  it("throws when repo not found", async () => {
    vi.mocked(queryOne).mockResolvedValue(undefined);

    const runner = createFixApplyRunner({ fixActionIds: ["f1"], repoId: "r1" });

    await expect(
      runner({ onProgress: vi.fn(), signal: new AbortController().signal, sessionId: "s1" }),
    ).rejects.toThrow("Repo not found");
  });

  it("throws immediately when already aborted", async () => {
    const controller = new AbortController();
    controller.abort();

    const runner = createFixApplyRunner({ fixActionIds: ["f1"], repoId: "r1" });

    await expect(runner({ onProgress: vi.fn(), signal: controller.signal, sessionId: "s1" })).rejects.toThrow(
      "Aborted",
    );
  });

  it("calls applyFixes and returns result on success", async () => {
    vi.mocked(queryOne).mockResolvedValue({ id: "r1", local_path: "/repo" });
    vi.mocked(applyFixes).mockResolvedValue({
      success: true,
      runId: "run-1",
      snapshotId: "snap-1",
      appliedCount: 3,
      totalCount: 5,
    } as never);

    const onProgress = vi.fn();
    const runner = createFixApplyRunner({ fixActionIds: ["f1", "f2"], repoId: "r1" });
    const result = await runner({ onProgress, signal: new AbortController().signal, sessionId: "s1" });

    expect(applyFixes).toHaveBeenCalledWith(
      expect.objectContaining({
        repoId: "r1",
        repoPath: "/repo",
        fixActionIds: ["f1", "f2"],
      }),
    );
    expect(result).toEqual({
      result: { runId: "run-1", snapshotId: "snap-1", appliedCount: 3, totalCount: 5 },
    });
  });

  it("throws on apply failure", async () => {
    vi.mocked(queryOne).mockResolvedValue({ id: "r1", local_path: "/repo" });
    vi.mocked(applyFixes).mockResolvedValue({
      success: false,
      error: "File conflict",
    } as never);

    const runner = createFixApplyRunner({ fixActionIds: ["f1"], repoId: "r1" });

    await expect(
      runner({ onProgress: vi.fn(), signal: new AbortController().signal, sessionId: "s1" }),
    ).rejects.toThrow("File conflict");
  });
});
