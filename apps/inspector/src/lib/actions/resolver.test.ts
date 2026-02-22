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

vi.mock("@/lib/actions/github", () => ({
  fetchFileContent: vi.fn(),
}));

vi.mock("@claudekit/claude-runner", () => ({
  runClaude: vi.fn(),
}));

vi.mock("@/lib/prompts", () => ({
  buildCommentFixPrompt: vi.fn().mockReturnValue("mock-prompt"),
}));

vi.mock("node:crypto", () => ({
  default: { randomUUID: vi.fn().mockReturnValue("mock-fix-id") },
}));

import { runClaude } from "@claudekit/claude-runner";
import { fetchFileContent } from "@/lib/actions/github";
import { execute, getDb, queryAll, queryOne } from "@/lib/db";
import { getCommentFixes, resolveAllFixes, resolveCommentFix, startCommentFixes } from "./resolver";

const mockGetDb = vi.mocked(getDb);
const mockExecute = vi.mocked(execute);
const mockQueryAll = vi.mocked(queryAll);
const mockQueryOne = vi.mocked(queryOne);
const mockRunClaude = vi.mocked(runClaude);
const mockFetchFileContent = vi.mocked(fetchFileContent);

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
    it("happy path: fetches comments, enriches with file content, calls Claude, persists fixes", async () => {
      // comments query
      mockQueryAll.mockResolvedValueOnce([
        { id: "c1", pr_id: "repo1#1", body: "Fix this", file_path: "src/app.ts", line_number: 10 },
      ]);
      // PR query
      mockQueryOne
        .mockResolvedValueOnce({ repo_id: "repo1", branch: "feat-branch" })
        .mockResolvedValueOnce({ owner: "owner", name: "repo" });
      // fetchFileContent
      mockFetchFileContent.mockResolvedValue("const x = 1;");
      // runClaude
      mockRunClaude.mockResolvedValue({
        stdout: '[{"commentId":"c1","suggestedFix":"Add error handling","fixDiff":"- old\\n+ new"}]',
        exitCode: 0,
      } as never);

      const result = await startCommentFixes(["c1"]);

      expect(result).toEqual(["c1"]);
      expect(mockFetchFileContent).toHaveBeenCalledWith("owner", "repo", "src/app.ts", "feat-branch");
      expect(mockExecute).toHaveBeenCalledWith(
        {},
        expect.stringContaining("INSERT INTO comment_fixes"),
        expect.arrayContaining(["mock-fix-id", "c1"]),
      );
    });

    it("throws when no comments found", async () => {
      mockQueryAll.mockResolvedValueOnce([]);

      await expect(startCommentFixes(["c1"])).rejects.toThrow("No comments found");
    });
  });
});
