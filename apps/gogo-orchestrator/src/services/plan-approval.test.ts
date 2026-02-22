import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db/index.js", () => ({
  getDb: vi.fn(async () => ({})),
}));

const mockLogger = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock("../utils/logger.js", () => ({
  createServiceLogger: () => mockLogger,
}));

vi.mock("@claudekit/duckdb", () => ({
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
  getIssueCommentsForRepo: vi.fn(),
  isHumanComment: vi.fn(),
}));

import { execute, queryAll, queryOne } from "@claudekit/duckdb";
import { broadcast } from "../ws/handler.js";
import { getIssueCommentsForRepo, isHumanComment } from "./github/index.js";
import { pollPlanApprovalJobs } from "./plan-approval.js";

const makeJob = (overrides?: Partial<Record<string, unknown>>) => ({
  id: "job-1",
  repository_id: "repo-1",
  issue_number: 42,
  status: "awaiting_plan_approval",
  plan_content: "# Plan\n1. Do X\n2. Do Y",
  plan_comment_id: 100,
  last_checked_plan_comment_id: null,
  ...overrides,
});

describe("plan-approval", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(execute).mockResolvedValue(undefined);
  });

  describe("pollPlanApprovalJobs", () => {
    it("should return early when no jobs are awaiting approval", async () => {
      vi.mocked(queryAll).mockResolvedValue([]);

      await pollPlanApprovalJobs();

      expect(getIssueCommentsForRepo).not.toHaveBeenCalled();
    });

    it("should skip non-GitHub jobs (issue_number <= 0)", async () => {
      vi.mocked(queryAll).mockResolvedValue([makeJob({ issue_number: -1 })]);

      await pollPlanApprovalJobs();

      expect(getIssueCommentsForRepo).not.toHaveBeenCalled();
    });

    it("should skip jobs without plan_comment_id", async () => {
      vi.spyOn(console, "warn").mockImplementation(() => {});
      vi.spyOn(console, "log").mockImplementation(() => {});

      vi.mocked(queryAll).mockResolvedValue([makeJob({ plan_comment_id: null })]);

      await pollPlanApprovalJobs();

      expect(getIssueCommentsForRepo).not.toHaveBeenCalled();
    });

    it("should skip jobs without repository_id", async () => {
      vi.spyOn(console, "warn").mockImplementation(() => {});
      vi.spyOn(console, "log").mockImplementation(() => {});

      vi.mocked(queryAll).mockResolvedValue([makeJob({ repository_id: null })]);

      await pollPlanApprovalJobs();

      expect(getIssueCommentsForRepo).not.toHaveBeenCalled();
    });

    it("should transition to running when 'approved' keyword found", async () => {
      vi.spyOn(console, "log").mockImplementation(() => {});

      vi.mocked(queryAll).mockResolvedValue([makeJob()]);
      vi.mocked(getIssueCommentsForRepo).mockResolvedValue([
        {
          id: 150,
          body: "Approved! Go ahead.",
          user: { login: "reviewer", type: "User", avatar_url: "https://github.com/reviewer.png" },
          html_url: "https://github.com/comment/150",
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-01T00:00:00Z",
        },
      ]);
      vi.mocked(isHumanComment).mockReturnValue(true);
      vi.mocked(queryOne).mockResolvedValue({ ...makeJob(), status: "running" });

      await pollPlanApprovalJobs();

      // Should update status to running
      expect(execute).toHaveBeenCalledWith(
        expect.anything(),
        expect.stringContaining("UPDATE jobs SET status = ?"),
        expect.arrayContaining(["running"]),
      );

      // Should insert plan_approved event (plan_approved is a param value, not in SQL)
      const eventInsert = vi
        .mocked(execute)
        .mock.calls.find(
          (call) =>
            typeof call[1] === "string" &&
            call[1].includes("job_events") &&
            Array.isArray(call[2]) &&
            (call[2] as unknown[]).includes("plan_approved"),
        );
      expect(eventInsert).toBeDefined();

      expect(broadcast).toHaveBeenCalledWith({
        type: "job:updated",
        payload: expect.objectContaining({ status: "running" }),
      });
    });

    it("should match various approval keywords", async () => {
      const approvalPhrases = ["approved", "LGTM", "looks good", "ship it", "go ahead"];

      for (const phrase of approvalPhrases) {
        vi.resetAllMocks();
        vi.spyOn(console, "log").mockImplementation(() => {});
        vi.mocked(execute).mockResolvedValue(undefined);

        vi.mocked(queryAll).mockResolvedValue([makeJob()]);
        vi.mocked(getIssueCommentsForRepo).mockResolvedValue([
          {
            id: 200,
            body: phrase,
            user: { login: "user", type: "User", avatar_url: "https://github.com/user.png" },
            html_url: "https://github.com/c/200",
            created_at: "2024-01-01T00:00:00Z",
            updated_at: "2024-01-01T00:00:00Z",
          },
        ]);
        vi.mocked(isHumanComment).mockReturnValue(true);
        vi.mocked(queryOne).mockResolvedValue({ ...makeJob(), status: "running" });

        await pollPlanApprovalJobs();

        expect(execute).toHaveBeenCalledWith(
          expect.anything(),
          expect.stringContaining("UPDATE jobs SET status = ?"),
          expect.arrayContaining(["running"]),
        );
      }
    });

    it("should transition to planning on non-approval feedback", async () => {
      vi.spyOn(console, "log").mockImplementation(() => {});

      vi.mocked(queryAll).mockResolvedValue([makeJob()]);
      vi.mocked(getIssueCommentsForRepo).mockResolvedValue([
        {
          id: 160,
          body: "Please also handle edge case X",
          user: { login: "reviewer", type: "User", avatar_url: "https://github.com/reviewer.png" },
          html_url: "https://github.com/comment/160",
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-01T00:00:00Z",
        },
      ]);
      vi.mocked(isHumanComment).mockReturnValue(true);
      vi.mocked(queryOne).mockResolvedValue({ ...makeJob(), status: "planning" });

      await pollPlanApprovalJobs();

      expect(execute).toHaveBeenCalledWith(
        expect.anything(),
        expect.stringContaining("UPDATE jobs SET status = ?"),
        expect.arrayContaining(["planning"]),
      );

      expect(broadcast).toHaveBeenCalledWith({
        type: "job:updated",
        payload: expect.objectContaining({ status: "planning" }),
      });
    });

    it("should update last_checked_plan_comment_id when only bot comments exist", async () => {
      vi.spyOn(console, "log").mockImplementation(() => {});

      vi.mocked(queryAll).mockResolvedValue([makeJob()]);
      vi.mocked(getIssueCommentsForRepo).mockResolvedValue([
        {
          id: 120,
          body: "Bot message",
          user: { login: "bot", type: "Bot", avatar_url: "https://github.com/bot.png" },
          html_url: "https://github.com/c/120",
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-01T00:00:00Z",
        },
        {
          id: 130,
          body: "Another bot",
          user: { login: "bot", type: "Bot", avatar_url: "https://github.com/bot.png" },
          html_url: "https://github.com/c/130",
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-01T00:00:00Z",
        },
      ]);
      vi.mocked(isHumanComment).mockReturnValue(false);

      await pollPlanApprovalJobs();

      expect(execute).toHaveBeenCalledWith(
        expect.anything(),
        expect.stringContaining("UPDATE jobs SET last_checked_plan_comment_id"),
        expect.arrayContaining([130, "job-1"]),
      );
    });

    it("should handle errors for individual jobs gracefully", async () => {
      vi.mocked(queryAll).mockResolvedValue([makeJob()]);
      vi.mocked(getIssueCommentsForRepo).mockRejectedValue(new Error("API failure"));

      await pollPlanApprovalJobs();

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({ err: expect.any(Error), jobId: "job-1" }),
        "Error checking job",
      );
    });
  });
});
