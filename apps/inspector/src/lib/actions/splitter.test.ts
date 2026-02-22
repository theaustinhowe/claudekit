import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  getDb: vi.fn().mockResolvedValue({}),
  execute: vi.fn(),
  queryOne: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  createServiceLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock("@/lib/services/session-manager", () => ({
  createSession: vi.fn().mockResolvedValue("mock-session-id"),
  startSession: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/services/session-runners/split-analysis", () => ({
  createSplitAnalysisRunner: vi.fn().mockReturnValue(vi.fn()),
}));

import { execute, getDb, queryOne } from "@/lib/db";
import { createSession, startSession } from "@/lib/services/session-manager";
import { createSplitAnalysisRunner } from "@/lib/services/session-runners/split-analysis";
import { getSplitPlan, startSplitAnalysis, updateSubPRDescription } from "./splitter";

const mockGetDb = vi.mocked(getDb);
const mockExecute = vi.mocked(execute);
const mockQueryOne = vi.mocked(queryOne);
const mockCreateSession = vi.mocked(createSession);
const mockStartSession = vi.mocked(startSession);
const mockCreateSplitAnalysisRunner = vi.mocked(createSplitAnalysisRunner);

describe("splitter actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDb.mockResolvedValue({} as Awaited<ReturnType<typeof getDb>>);
  });

  describe("getSplitPlan", () => {
    it("returns plan with parsed subPRs and PR metadata", async () => {
      const subPRs = [{ index: 1, title: "Part 1" }];
      mockQueryOne
        .mockResolvedValueOnce({
          id: "plan-1",
          pr_id: "repo1#1",
          total_lines: 500,
          sub_prs: JSON.stringify(subPRs),
          created_at: "2025-01-01",
        })
        .mockResolvedValueOnce({ number: 1, title: "Big PR" });

      const result = await getSplitPlan("plan-1");

      expect(result).toEqual({
        id: "plan-1",
        pr_id: "repo1#1",
        total_lines: 500,
        sub_prs: JSON.stringify(subPRs),
        created_at: "2025-01-01",
        prNumber: 1,
        prTitle: "Big PR",
        subPRs,
      });
    });

    it("returns null when plan not found", async () => {
      mockQueryOne.mockResolvedValue(undefined);

      const result = await getSplitPlan("nonexistent");
      expect(result).toBeNull();
    });
  });

  describe("updateSubPRDescription", () => {
    it("updates description of matching sub-PR", async () => {
      const subPRs = [
        { index: 1, description: "old" },
        { index: 2, description: "other" },
      ];
      mockQueryOne.mockResolvedValueOnce({ sub_prs: JSON.stringify(subPRs) });

      await updateSubPRDescription("plan-1", 1, "new description");

      expect(mockExecute).toHaveBeenCalledWith({}, "UPDATE split_plans SET sub_prs = ? WHERE id = ?", [
        expect.stringContaining('"new description"'),
        "plan-1",
      ]);
    });

    it("throws when plan not found", async () => {
      mockQueryOne.mockResolvedValue(undefined);

      await expect(updateSubPRDescription("nonexistent", 1, "desc")).rejects.toThrow("Plan not found");
    });
  });

  describe("startSplitAnalysis", () => {
    it("creates a session and starts it with the split analysis runner", async () => {
      const mockRunner = vi.fn();
      mockCreateSplitAnalysisRunner.mockReturnValue(mockRunner);

      const result = await startSplitAnalysis("repo1#1");

      expect(mockCreateSession).toHaveBeenCalledWith({
        sessionType: "split_analysis",
        label: "Split analysis for repo1#1",
        contextId: "repo1#1",
        metadata: { prId: "repo1#1" },
      });
      expect(mockCreateSplitAnalysisRunner).toHaveBeenCalledWith({ prId: "repo1#1" });
      expect(mockStartSession).toHaveBeenCalledWith("mock-session-id", mockRunner);
      expect(result).toBe("mock-session-id");
    });
  });
});
