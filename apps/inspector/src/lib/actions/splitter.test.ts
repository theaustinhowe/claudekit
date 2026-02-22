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

vi.mock("@/lib/actions/github", () => ({
  fetchPRDiff: vi.fn(),
}));

vi.mock("@devkit/claude-runner", () => ({
  runClaude: vi.fn(),
}));

vi.mock("@/lib/prompts", () => ({
  buildSplitPlanPrompt: vi.fn().mockReturnValue("mock-prompt"),
}));

vi.mock("node:crypto", () => ({
  default: { randomUUID: vi.fn().mockReturnValue("mock-plan-id") },
}));

import { runClaude } from "@devkit/claude-runner";
import { fetchPRDiff } from "@/lib/actions/github";
import { execute, getDb, queryOne } from "@/lib/db";
import { getSplitPlan, startSplitAnalysis, updateSubPRDescription } from "./splitter";

const mockGetDb = vi.mocked(getDb);
const mockExecute = vi.mocked(execute);
const mockQueryOne = vi.mocked(queryOne);
const mockRunClaude = vi.mocked(runClaude);
const mockFetchPRDiff = vi.mocked(fetchPRDiff);

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
    it("happy path: fetches PR, fetches diff, calls Claude, persists plan", async () => {
      mockQueryOne
        .mockResolvedValueOnce({
          id: "repo1#1",
          repo_id: "repo1",
          number: 1,
          title: "Big PR",
          files_changed: 10,
          lines_added: 300,
          lines_deleted: 200,
        })
        .mockResolvedValueOnce({ owner: "owner", name: "repo" });
      mockFetchPRDiff.mockResolvedValue("diff content");
      mockRunClaude.mockResolvedValue({
        stdout: '[{"index": 1, "title": "Part 1"}]',
        exitCode: 0,
      } as never);

      const result = await startSplitAnalysis("repo1#1");

      expect(result).toBe("mock-plan-id");
      expect(mockFetchPRDiff).toHaveBeenCalledWith("owner", "repo", 1);
      expect(mockExecute).toHaveBeenCalledWith(
        {},
        expect.stringContaining("INSERT INTO split_plans"),
        expect.arrayContaining(["mock-plan-id", "repo1#1", 500]),
      );
    });

    it("throws when PR not found", async () => {
      mockQueryOne.mockResolvedValue(undefined);

      await expect(startSplitAnalysis("nonexistent")).rejects.toThrow("PR not found");
    });
  });
});
