import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  getDb: vi.fn().mockResolvedValue({}),
  queryAll: vi.fn(),
}));

import { getDb, queryAll } from "@/lib/db";
import { getReviewerStats } from "./reviewers";

const mockGetDb = vi.mocked(getDb);
const mockQueryAll = vi.mocked(queryAll);

describe("reviewers actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDb.mockResolvedValue({} as Awaited<ReturnType<typeof getDb>>);
  });

  describe("getReviewerStats", () => {
    it("returns reviewers with severity/category counts", async () => {
      mockQueryAll
        .mockResolvedValueOnce([
          { reviewer: "alice", reviewer_avatar: "https://avatar.url", total_comments: 10, prs_reviewed: 3 },
        ])
        .mockResolvedValueOnce([
          { severity: "blocking", count: 4 },
          { severity: "suggestion", count: 6 },
        ])
        .mockResolvedValueOnce([
          { category: "Error Handling", count: 5 },
          { category: "Testing", count: 3 },
        ]);

      const result = await getReviewerStats("repo1");

      expect(result).toEqual([
        {
          reviewer: "alice",
          reviewerAvatar: "https://avatar.url",
          totalComments: 10,
          prsReviewed: 3,
          severityCounts: { blocking: 4, suggestion: 6 },
          categoryCounts: { "Error Handling": 5, Testing: 3 },
        },
      ]);
    });

    it("handles empty reviewer list", async () => {
      mockQueryAll.mockResolvedValueOnce([]);

      const result = await getReviewerStats("repo1");
      expect(result).toEqual([]);
    });

    it("correctly converts BigInt/number counts", async () => {
      mockQueryAll
        .mockResolvedValueOnce([
          { reviewer: "bob", reviewer_avatar: null, total_comments: BigInt(5), prs_reviewed: BigInt(2) },
        ])
        .mockResolvedValueOnce([{ severity: "nit", count: BigInt(5) }])
        .mockResolvedValueOnce([{ category: "General", count: BigInt(3) }]);

      const result = await getReviewerStats("repo1");

      expect(result[0].totalComments).toBe(5);
      expect(result[0].prsReviewed).toBe(2);
      expect(result[0].severityCounts.nit).toBe(5);
    });
  });
});
