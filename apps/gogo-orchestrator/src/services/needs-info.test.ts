import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db/index.js", () => ({
  getConn: vi.fn(() => ({})),
}));

vi.mock("../db/helpers.js", () => ({
  queryAll: vi.fn(),
  queryOne: vi.fn(),
  execute: vi.fn(),
  withTransaction: vi.fn(),
  buildUpdate: vi.fn(),
  buildWhere: vi.fn(),
  buildInClause: vi.fn(),
  checkpoint: vi.fn(),
}));

vi.mock("../ws/handler.js", () => ({
  broadcast: vi.fn(),
}));

vi.mock("./github/index.js", () => ({
  AGENT_COMMENT_MARKER: "<!-- gogo-agent -->",
  createIssueCommentForRepo: vi.fn(),
  getIssueCommentsForRepo: vi.fn(),
  isHumanComment: vi.fn(),
}));

vi.mock("./state-machine.js", () => ({
  applyTransitionAtomic: vi.fn(),
  validateTransition: vi.fn(),
}));

import { execute, queryAll, queryOne } from "../db/helpers.js";
import { createIssueCommentForRepo, getIssueCommentsForRepo, isHumanComment } from "./github/index.js";
import { checkJobForResponseById, enterNeedsInfo, pollNeedsInfoJobs } from "./needs-info.js";
import { applyTransitionAtomic, validateTransition } from "./state-machine.js";

describe("needs-info", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(execute).mockResolvedValue(undefined);
  });

  describe("enterNeedsInfo", () => {
    it("should throw when job not found", async () => {
      vi.mocked(queryOne).mockResolvedValue(undefined);

      await expect(enterNeedsInfo("nonexistent", "What?")).rejects.toThrow("Job nonexistent not found");
    });

    it("should throw when job has no repository_id", async () => {
      vi.mocked(queryOne).mockResolvedValue({
        id: "job-1",
        status: "running",
        repository_id: null,
      });

      await expect(enterNeedsInfo("job-1", "Question?")).rejects.toThrow("does not have a repository ID");
    });

    it("should throw when transition is invalid", async () => {
      vi.mocked(queryOne).mockResolvedValue({
        id: "job-1",
        status: "done",
        repository_id: "repo-1",
      });
      vi.mocked(validateTransition).mockReturnValue({
        valid: false,
        error: "Cannot transition from done to needs_info",
      });

      await expect(enterNeedsInfo("job-1", "Question?")).rejects.toThrow("Cannot transition from done to needs_info");
    });

    it("should handle manual jobs (issue_number < 0) without GitHub comment", async () => {
      vi.mocked(queryOne).mockResolvedValue({
        id: "job-1",
        status: "running",
        repository_id: "repo-1",
        issue_number: -1,
      });
      vi.mocked(validateTransition).mockReturnValue({ valid: true, eventType: "state_change" });
      vi.mocked(applyTransitionAtomic).mockResolvedValue({ success: true });

      await enterNeedsInfo("job-1", "What is the key?");

      expect(createIssueCommentForRepo).not.toHaveBeenCalled();
      expect(applyTransitionAtomic).toHaveBeenCalledWith("job-1", "needs_info", "What is the key?", {
        needs_info_question: "What is the key?",
      });
    });

    it("should throw when manual job transition fails", async () => {
      vi.mocked(queryOne).mockResolvedValue({
        id: "job-1",
        status: "running",
        repository_id: "repo-1",
        issue_number: -1,
      });
      vi.mocked(validateTransition).mockReturnValue({ valid: true, eventType: "state_change" });
      vi.mocked(applyTransitionAtomic).mockResolvedValue({ success: false, error: "Concurrent conflict" });

      await expect(enterNeedsInfo("job-1", "Question?")).rejects.toThrow("Concurrent conflict");
    });

    it("should post GitHub comment and transition for GitHub-linked jobs", async () => {
      vi.mocked(queryOne).mockResolvedValue({
        id: "job-1",
        status: "running",
        repository_id: "repo-1",
        issue_number: 42,
      });
      vi.mocked(validateTransition).mockReturnValue({ valid: true, eventType: "state_change" });
      vi.mocked(createIssueCommentForRepo).mockResolvedValue({ id: 99, html_url: "https://github.com/..." });
      vi.mocked(applyTransitionAtomic).mockResolvedValue({ success: true });

      await enterNeedsInfo("job-1", "What API key?");

      expect(createIssueCommentForRepo).toHaveBeenCalledWith("repo-1", 42, expect.stringContaining("What API key?"));
      expect(applyTransitionAtomic).toHaveBeenCalledWith("job-1", "needs_info", "What API key?", {
        needsInfoQuestion: "What API key?",
        needs_info_comment_id: 99,
        last_checked_comment_id: 99,
      });
    });
  });

  describe("pollNeedsInfoJobs", () => {
    it("should return early when no needs_info jobs exist", async () => {
      vi.mocked(queryAll).mockResolvedValue([]);

      await pollNeedsInfoJobs();

      expect(getIssueCommentsForRepo).not.toHaveBeenCalled();
    });

    it("should skip non-GitHub jobs (issue_number <= 0)", async () => {
      vi.mocked(queryAll).mockResolvedValue([
        {
          id: "job-1",
          status: "needs_info",
          issue_number: -1,
          repository_id: "repo-1",
          needs_info_comment_id: 10,
          last_checked_comment_id: null,
        },
      ]);

      await pollNeedsInfoJobs();

      expect(getIssueCommentsForRepo).not.toHaveBeenCalled();
    });

    it("should check GitHub comments for needs_info jobs", async () => {
      vi.spyOn(console, "log").mockImplementation(() => {});

      vi.mocked(queryAll).mockResolvedValue([
        {
          id: "job-1",
          status: "needs_info",
          issue_number: 42,
          repository_id: "repo-1",
          needs_info_comment_id: 10,
          last_checked_comment_id: null,
        },
      ]);
      vi.mocked(getIssueCommentsForRepo).mockResolvedValue([]);
      vi.mocked(isHumanComment).mockReturnValue(false);

      await pollNeedsInfoJobs();

      expect(getIssueCommentsForRepo).toHaveBeenCalledWith("repo-1", 42, 10);
    });

    it("should handle errors for individual jobs gracefully", async () => {
      vi.spyOn(console, "log").mockImplementation(() => {});
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      vi.mocked(queryAll).mockResolvedValue([
        {
          id: "job-1",
          status: "needs_info",
          issue_number: 42,
          repository_id: "repo-1",
          needs_info_comment_id: 10,
          last_checked_comment_id: null,
        },
      ]);
      vi.mocked(getIssueCommentsForRepo).mockRejectedValue(new Error("API error"));

      await pollNeedsInfoJobs();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining("[needs-info] Error checking job job-1"),
        expect.any(Error),
      );

      consoleErrorSpy.mockRestore();
    });
  });

  describe("checkJobForResponseById", () => {
    it("should throw when job not found", async () => {
      vi.mocked(queryOne).mockResolvedValue(undefined);

      await expect(checkJobForResponseById("nonexistent")).rejects.toThrow("Job nonexistent not found");
    });

    it("should throw when job is not in needs_info state", async () => {
      vi.mocked(queryOne).mockResolvedValue({ id: "job-1", status: "running" });

      await expect(checkJobForResponseById("job-1")).rejects.toThrow("is not in needs_info state");
    });

    it("should return responseFound false when no human comments", async () => {
      vi.mocked(queryOne).mockResolvedValue({
        id: "job-1",
        status: "needs_info",
        repository_id: "repo-1",
        issue_number: 42,
        needs_info_comment_id: 10,
        last_checked_comment_id: null,
      });
      vi.mocked(getIssueCommentsForRepo).mockResolvedValue([]);
      vi.mocked(isHumanComment).mockReturnValue(false);

      const result = await checkJobForResponseById("job-1");

      expect(result.responseFound).toBe(false);
    });

    it("should transition to running when human responds", async () => {
      vi.spyOn(console, "log").mockImplementation(() => {});

      vi.mocked(queryOne).mockResolvedValue({
        id: "job-1",
        status: "needs_info",
        repository_id: "repo-1",
        issue_number: 42,
        needs_info_comment_id: 10,
        last_checked_comment_id: null,
      });
      vi.mocked(getIssueCommentsForRepo).mockResolvedValue([
        {
          id: 15,
          body: "Use the prod key",
          user: { login: "developer" },
          html_url: "https://github.com/comment/15",
        },
      ]);
      vi.mocked(isHumanComment).mockReturnValue(true);
      vi.mocked(applyTransitionAtomic).mockResolvedValue({ success: true });

      const result = await checkJobForResponseById("job-1");

      expect(result.responseFound).toBe(true);
      expect(applyTransitionAtomic).toHaveBeenCalledWith("job-1", "running", expect.stringContaining("developer"), {
        last_checked_comment_id: 15,
      });
    });

    it("should return responseFound false when missing needs_info_comment_id", async () => {
      vi.spyOn(console, "warn").mockImplementation(() => {});

      vi.mocked(queryOne).mockResolvedValue({
        id: "job-1",
        status: "needs_info",
        repository_id: "repo-1",
        issue_number: 42,
        needs_info_comment_id: null,
        last_checked_comment_id: null,
      });

      const result = await checkJobForResponseById("job-1");

      expect(result.responseFound).toBe(false);
    });
  });
});
