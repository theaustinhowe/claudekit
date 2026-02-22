import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  getDb: vi.fn().mockResolvedValue({}),
  queryAll: vi.fn(),
  queryOne: vi.fn(),
}));

import { getDb, queryAll, queryOne } from "@/lib/db";
import {
  getDashboardStats,
  getLargePRs,
  getPRComments,
  getPRsWithComments,
  getRecentPRs,
  getWeeklyPRCounts,
} from "./prs";

const mockGetDb = vi.mocked(getDb);
const mockQueryAll = vi.mocked(queryAll);
const mockQueryOne = vi.mocked(queryOne);

describe("prs actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDb.mockResolvedValue({} as Awaited<ReturnType<typeof getDb>>);
  });

  describe("getDashboardStats", () => {
    it("returns stats with all fields populated", async () => {
      mockQueryOne
        .mockResolvedValueOnce({ count: 25 }) // total
        .mockResolvedValueOnce({ avg_lines: 340.5 }) // avg
        .mockResolvedValueOnce({ count: 3 }) // splittable
        .mockResolvedValueOnce({ name: "Error Handling" }); // topSkill

      const result = await getDashboardStats("owner/repo");

      expect(result).toEqual({
        totalPRs: 25,
        avgLinesChanged: 341,
        topSkillGap: "Error Handling",
        splittablePRs: 3,
      });
    });

    it("returns zeros and null when no data", async () => {
      mockQueryOne.mockResolvedValue(undefined);

      const result = await getDashboardStats("owner/repo");

      expect(result).toEqual({
        totalPRs: 0,
        avgLinesChanged: 0,
        topSkillGap: null,
        splittablePRs: 0,
      });
    });
  });

  describe("getWeeklyPRCounts", () => {
    it("returns reversed weekly counts for sparkline", async () => {
      mockQueryAll.mockResolvedValue([{ count: 5 }, { count: 3 }, { count: 8 }]);

      const result = await getWeeklyPRCounts("owner/repo");

      // Should be reversed so most recent is last
      expect(result).toEqual([8, 3, 5]);
    });

    it("returns empty array when no data", async () => {
      mockQueryAll.mockResolvedValue([]);

      const result = await getWeeklyPRCounts("owner/repo");
      expect(result).toEqual([]);
    });
  });

  describe("getRecentPRs", () => {
    it("returns PRs with comment counts and feedback categories", async () => {
      mockQueryAll
        .mockResolvedValueOnce([{ id: "repo1#1", number: 1, title: "PR One", comment_count: 3 }])
        .mockResolvedValueOnce([{ category: "Error Handling" }, { category: "Testing" }]);

      const result = await getRecentPRs("repo1");

      expect(result).toHaveLength(1);
      expect(result[0].commentCount).toBe(3);
      expect(result[0].feedbackCategories).toEqual(["Error Handling", "Testing"]);
    });

    it("returns empty array when no PRs", async () => {
      mockQueryAll.mockResolvedValue([]);

      const result = await getRecentPRs("repo1");
      expect(result).toEqual([]);
    });
  });

  describe("getPRsWithComments", () => {
    it("returns only PRs that have comments", async () => {
      mockQueryAll
        .mockResolvedValueOnce([{ id: "repo1#2", number: 2, title: "PR Two", comment_count: 5 }])
        .mockResolvedValueOnce([{ category: "Naming" }]);

      const result = await getPRsWithComments("repo1");

      expect(result).toHaveLength(1);
      expect(result[0].commentCount).toBe(5);
      expect(result[0].feedbackCategories).toEqual(["Naming"]);
    });
  });

  describe("getLargePRs", () => {
    it("returns only L/XL PRs with empty feedbackCategories", async () => {
      mockQueryAll.mockResolvedValue([
        {
          id: "repo1#3",
          number: 3,
          title: "Large PR",
          size: "L",
          lines_added: 800,
          lines_deleted: 200,
          comment_count: 2,
        },
      ]);

      const result = await getLargePRs("repo1");

      expect(result).toHaveLength(1);
      expect(result[0].commentCount).toBe(2);
      expect(result[0].feedbackCategories).toEqual([]);
    });
  });

  describe("getPRComments", () => {
    it("returns comments for given PR", async () => {
      const comments = [
        {
          id: "c1",
          pr_id: "repo1#1",
          reviewer: "alice",
          reviewer_avatar: null,
          body: "Fix",
          file_path: "src/a.ts",
          line_number: 10,
          severity: "blocking",
          category: "Error Handling",
          created_at: "2025-01-01",
        },
      ];
      mockQueryAll.mockResolvedValue(comments);

      const result = await getPRComments("repo1#1");

      expect(mockQueryAll).toHaveBeenCalledWith(
        {},
        expect.stringContaining("SELECT * FROM pr_comments WHERE pr_id = ?"),
        ["repo1#1"],
      );
      expect(result).toEqual(comments);
    });
  });
});
