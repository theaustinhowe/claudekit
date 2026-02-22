import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  getDb: vi.fn().mockResolvedValue({}),
  execute: vi.fn(),
  queryAll: vi.fn(),
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

vi.mock("@/lib/actions/settings", () => ({
  getSetting: vi.fn().mockResolvedValue(null),
}));

vi.mock("@claudekit/claude-runner", () => ({
  runClaude: vi.fn(),
}));

vi.mock("@/lib/prompts", () => ({
  buildSkillAnalysisPrompt: vi.fn().mockReturnValue("mock-prompt"),
}));

vi.mock("node:crypto", () => ({
  default: { randomUUID: vi.fn().mockReturnValue("mock-uuid") },
}));

import { runClaude } from "@claudekit/claude-runner";
import { getSetting } from "@/lib/actions/settings";
import { execute, getDb, queryAll, queryOne } from "@/lib/db";
import {
  compareAnalyses,
  getAnalysisHistory,
  getSkillAnalyses,
  getSkillsForAnalysis,
  markSkillAddressed,
  startSkillAnalysis,
  updateSkillActionItem,
} from "./skills";

const mockGetDb = vi.mocked(getDb);
const mockExecute = vi.mocked(execute);
const mockQueryAll = vi.mocked(queryAll);
const mockQueryOne = vi.mocked(queryOne);
const mockRunClaude = vi.mocked(runClaude);
const mockGetSetting = vi.mocked(getSetting);

describe("skills actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDb.mockResolvedValue({} as Awaited<ReturnType<typeof getDb>>);
  });

  describe("getSkillAnalyses", () => {
    it("calls queryAll with correct SQL and returns results", async () => {
      const analyses = [{ id: "a1", pr_numbers: "[1,2]", created_at: "2025-01-01" }];
      mockQueryAll.mockResolvedValue(analyses);

      const result = await getSkillAnalyses("repo1");

      expect(mockQueryAll).toHaveBeenCalledWith(
        {},
        expect.stringContaining("SELECT id, pr_numbers, created_at FROM skill_analyses"),
        ["repo1"],
      );
      expect(result).toEqual(analyses);
    });
  });

  describe("getSkillsForAnalysis", () => {
    it("returns skills with joined comments", async () => {
      mockQueryAll
        .mockResolvedValueOnce([{ id: "s1", analysis_id: "a1", name: "Error Handling", frequency: 3 }])
        .mockResolvedValueOnce([
          {
            id: "c1",
            body: "Fix this",
            reviewer: "alice",
            reviewer_avatar: null,
            file_path: "src/app.ts",
            line_number: 10,
            pr_number: 1,
            pr_title: "PR One",
          },
        ]);

      const result = await getSkillsForAnalysis("a1");

      expect(result).toHaveLength(1);
      expect(result[0].comments).toHaveLength(1);
      expect(result[0].comments[0]).toEqual({
        id: "c1",
        prNumber: 1,
        prTitle: "PR One",
        reviewer: "alice",
        reviewerAvatar: null,
        text: "Fix this",
        file: "src/app.ts",
        line: 10,
      });
    });

    it("returns empty array when no skills found", async () => {
      mockQueryAll.mockResolvedValue([]);

      const result = await getSkillsForAnalysis("nonexistent");
      expect(result).toEqual([]);
    });
  });

  describe("markSkillAddressed", () => {
    it("calls execute with correct UPDATE", async () => {
      await markSkillAddressed("s1", true);

      expect(mockExecute).toHaveBeenCalledWith({}, "UPDATE skills SET addressed = ? WHERE id = ?", [true, "s1"]);
    });
  });

  describe("updateSkillActionItem", () => {
    it("calls execute with correct UPDATE", async () => {
      await updateSkillActionItem("s1", "Write more tests");

      expect(mockExecute).toHaveBeenCalledWith({}, "UPDATE skills SET action_item = ? WHERE id = ?", [
        "Write more tests",
        "s1",
      ]);
    });
  });

  describe("getAnalysisHistory", () => {
    it("returns formatted history with parsed prNumbers, skillCount, topSkills", async () => {
      mockQueryAll
        .mockResolvedValueOnce([{ id: "a1", pr_numbers: "[1,2,3]", created_at: "2025-01-01" }])
        .mockResolvedValueOnce([{ name: "Error Handling" }, { name: "Testing" }]);
      mockQueryOne.mockResolvedValueOnce({ count: 5 });

      const result = await getAnalysisHistory("repo1");

      expect(result).toEqual([
        {
          id: "a1",
          prNumbers: [1, 2, 3],
          createdAt: "2025-01-01",
          skillCount: 5,
          topSkills: ["Error Handling", "Testing"],
        },
      ]);
    });

    it("returns empty array when no analyses", async () => {
      mockQueryAll.mockResolvedValue([]);

      const result = await getAnalysisHistory("repo1");
      expect(result).toEqual([]);
    });
  });

  describe("compareAnalyses", () => {
    it("detects new skills (in B but not A)", async () => {
      mockQueryAll
        .mockResolvedValueOnce([]) // skills A - empty
        .mockResolvedValueOnce([{ name: "Testing", frequency: 3, severity: "suggestion" }]); // skills B

      const result = await compareAnalyses("a1", "a2");

      expect(result).toEqual([
        { name: "Testing", status: "new", frequencyA: null, frequencyB: 3, severityA: null, severityB: "suggestion" },
      ]);
    });

    it("detects resolved skills (in A but not B)", async () => {
      mockQueryAll
        .mockResolvedValueOnce([{ name: "Testing", frequency: 3, severity: "suggestion" }]) // skills A
        .mockResolvedValueOnce([]); // skills B - empty

      const result = await compareAnalyses("a1", "a2");

      expect(result[0].status).toBe("resolved");
    });

    it("detects improved/worsened/unchanged based on frequency", async () => {
      mockQueryAll
        .mockResolvedValueOnce([
          { name: "Errors", frequency: 5, severity: "blocking" },
          { name: "Types", frequency: 3, severity: "suggestion" },
          { name: "Naming", frequency: 2, severity: "nit" },
        ])
        .mockResolvedValueOnce([
          { name: "Errors", frequency: 2, severity: "blocking" }, // improved
          { name: "Types", frequency: 7, severity: "suggestion" }, // worsened
          { name: "Naming", frequency: 2, severity: "nit" }, // unchanged
        ]);

      const result = await compareAnalyses("a1", "a2");

      const byName = Object.fromEntries(result.map((r) => [r.name, r.status]));
      expect(byName.Errors).toBe("improved");
      expect(byName.Types).toBe("worsened");
      expect(byName.Naming).toBe("unchanged");
    });

    it("sorts results by priority (worsened > new > unchanged > improved > resolved)", async () => {
      mockQueryAll
        .mockResolvedValueOnce([
          { name: "A-resolved", frequency: 1, severity: "nit" },
          { name: "B-improved", frequency: 5, severity: "nit" },
          { name: "C-unchanged", frequency: 3, severity: "nit" },
          { name: "D-worsened", frequency: 1, severity: "nit" },
        ])
        .mockResolvedValueOnce([
          { name: "B-improved", frequency: 2, severity: "nit" },
          { name: "C-unchanged", frequency: 3, severity: "nit" },
          { name: "D-worsened", frequency: 5, severity: "nit" },
          { name: "E-new", frequency: 1, severity: "nit" },
        ]);

      const result = await compareAnalyses("a1", "a2");
      const statuses = result.map((r) => r.status);

      expect(statuses).toEqual(["worsened", "new", "unchanged", "improved", "resolved"]);
    });
  });

  describe("startSkillAnalysis", () => {
    it("happy path: queries comments, filters bots, calls Claude, persists", async () => {
      // comments query
      mockQueryAll.mockResolvedValueOnce([
        { id: "c1", reviewer: "alice", body: "Fix this", file_path: "src/a.ts", line_number: 1, pr_id: "repo1#1" },
      ]);
      // prs query
      mockQueryAll.mockResolvedValueOnce([{ id: "repo1#1", number: 1, title: "PR One" }]);
      // getSetting for ignore_bots
      mockGetSetting.mockResolvedValue(null);
      // runClaude response
      mockRunClaude.mockResolvedValue({
        stdout:
          '[{"name":"Testing","severity":"suggestion","frequency":1,"trend":"New pattern","topExample":"Fix this","description":"desc","commentIds":["c1"],"resources":[],"actionItem":"Write tests"}]',
        exitCode: 0,
      } as never);
      // queryOne for comment exists check
      mockQueryOne.mockResolvedValue({ 1: 1 });

      const result = await startSkillAnalysis("repo1", [1]);

      expect(result).toBe("mock-uuid");
      // Should insert analysis + skill + skill_comment link
      expect(mockExecute).toHaveBeenCalledWith(
        {},
        expect.stringContaining("INSERT INTO skill_analyses"),
        expect.any(Array),
      );
      expect(mockExecute).toHaveBeenCalledWith({}, expect.stringContaining("INSERT INTO skills"), expect.any(Array));
      expect(mockExecute).toHaveBeenCalledWith(
        {},
        expect.stringContaining("INSERT INTO skill_comments"),
        expect.any(Array),
      );
    });

    it("throws when no comments found", async () => {
      mockQueryAll.mockResolvedValueOnce([]);

      await expect(startSkillAnalysis("repo1", [1])).rejects.toThrow("No comments found for selected PRs");
    });

    it("throws when no comments remain after bot filtering", async () => {
      mockQueryAll.mockResolvedValueOnce([
        {
          id: "c1",
          reviewer: "dependabot[bot]",
          body: "Bump deps",
          file_path: null,
          line_number: null,
          pr_id: "repo1#1",
        },
      ]);
      mockGetSetting.mockResolvedValue(null); // ignore_bots defaults to true

      await expect(startSkillAnalysis("repo1", [1])).rejects.toThrow("No comments remain after filtering bots");
    });
  });
});
