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

vi.mock("@/lib/services/session-runners/comment-fix", () => ({
  createCommentFixRunner: vi.fn().mockReturnValue(vi.fn()),
}));

import { execute, getDb, queryAll } from "@/lib/db";
import { createSession, startSession } from "@/lib/services/session-manager";
import { createCommentFixRunner } from "@/lib/services/session-runners/comment-fix";
import { getCommentFixes, resolveAllFixes, resolveCommentFix, startCommentFixes } from "./resolver";

const mockGetDb = vi.mocked(getDb);
const mockExecute = vi.mocked(execute);
const mockQueryAll = vi.mocked(queryAll);
const mockCreateSession = vi.mocked(createSession);
const mockStartSession = vi.mocked(startSession);
const mockCreateCommentFixRunner = vi.mocked(createCommentFixRunner);

describe("resolver actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDb.mockResolvedValue({} as Awaited<ReturnType<typeof getDb>>);
  });

  describe("getCommentFixes", () => {
    it("returns fixes for given comment IDs", async () => {
      const fixes = [{ id: "f1", comment_id: "c1", suggested_fix: "Fix it", fix_diff: "- a\n+ b", status: "open" }];
      mockQueryAll.mockResolvedValue(fixes);

      const result = await getCommentFixes(["c1"]);

      expect(mockQueryAll).toHaveBeenCalledWith(
        {},
        expect.stringContaining("SELECT * FROM comment_fixes WHERE comment_id IN (?)"),
        ["c1"],
      );
      expect(result).toEqual(fixes);
    });
  });

  describe("resolveCommentFix", () => {
    it("calls execute with correct UPDATE", async () => {
      await resolveCommentFix("c1");

      expect(mockExecute).toHaveBeenCalledWith(
        {},
        "UPDATE comment_fixes SET status = 'resolved' WHERE comment_id = ?",
        ["c1"],
      );
    });
  });

  describe("resolveAllFixes", () => {
    it("calls execute with correct UPDATE for all IDs", async () => {
      await resolveAllFixes(["c1", "c2"]);

      expect(mockExecute).toHaveBeenCalledWith(
        {},
        "UPDATE comment_fixes SET status = 'resolved' WHERE comment_id IN (?,?)",
        ["c1", "c2"],
      );
    });
  });

  describe("startCommentFixes", () => {
    it("creates a session and starts it with the comment fix runner", async () => {
      const mockRunner = vi.fn();
      mockCreateCommentFixRunner.mockReturnValue(mockRunner);

      const result = await startCommentFixes(["c1"]);

      expect(mockCreateSession).toHaveBeenCalledWith({
        sessionType: "comment_fix",
        label: "Fix 1 comment",
        metadata: { commentIds: ["c1"] },
      });
      expect(mockCreateCommentFixRunner).toHaveBeenCalledWith({ commentIds: ["c1"] });
      expect(mockStartSession).toHaveBeenCalledWith("mock-session-id", mockRunner);
      expect(result).toBe("mock-session-id");
    });

    it("uses plural label for multiple comments", async () => {
      mockCreateCommentFixRunner.mockReturnValue(vi.fn());

      await startCommentFixes(["c1", "c2", "c3"]);

      expect(mockCreateSession).toHaveBeenCalledWith(
        expect.objectContaining({
          label: "Fix 3 comments",
        }),
      );
    });
  });
});
