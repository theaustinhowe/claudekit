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

vi.mock("@/lib/services/session-manager", () => ({
  createSession: vi.fn().mockResolvedValue("mock-session-id"),
  startSession: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/services/session-runners/skill-analysis", () => ({
  createSkillAnalysisRunner: vi.fn().mockReturnValue(vi.fn()),
}));

import { execute, getDb, queryAll, queryOne } from "@/lib/db";
import { createSession, startSession } from "@/lib/services/session-manager";
import { createSkillAnalysisRunner } from "@/lib/services/session-runners/skill-analysis";
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
const mockCreateSession = vi.mocked(createSession);
const mockStartSession = vi.mocked(startSession);
const mockCreateSkillAnalysisRunner = vi.mocked(createSkillAnalysisRunner);

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
        .mockResolvedValueOnce([
          {
            id: "s1",
            analysis_id: "a1",
            name: "Error Handling",
            frequency: 3,
            comment_ids: JSON.stringify(["c1"]),
          },
        ])
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
    it("creates a session and starts it with the skill analysis runner", async () => {
      const mockRunner = vi.fn();
      mockCreateSkillAnalysisRunner.mockReturnValue(mockRunner);

      const result = await startSkillAnalysis("repo1", [1, 2]);

      expect(mockCreateSession).toHaveBeenCalledWith({
        sessionType: "skill_analysis",
        label: "Skill analysis (2 PRs)",
        contextType: "repo",
        contextId: "repo1",
        metadata: { repoId: "repo1", prNumbers: [1, 2] },
      });
      expect(mockCreateSkillAnalysisRunner).toHaveBeenCalledWith({ repoId: "repo1", prNumbers: [1, 2] });
      expect(mockStartSession).toHaveBeenCalledWith("mock-session-id", mockRunner);
      expect(result).toBe("mock-session-id");
    });
  });
});
