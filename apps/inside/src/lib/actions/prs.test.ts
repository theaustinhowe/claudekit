import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  getDb: vi.fn().mockResolvedValue({}),
  queryAll: vi.fn(),
  queryOne: vi.fn(),
}));

import { getDb, queryAll, queryOne } from "@/lib/db";
import { getDashboardStats, getWeeklyPRCounts } from "./prs";

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
});
