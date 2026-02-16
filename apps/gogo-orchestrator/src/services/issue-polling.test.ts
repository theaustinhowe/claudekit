import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock dependencies
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
  getIssuesWithLabel: vi.fn(),
  removeLabelFromIssue: vi.fn(),
}));

import { execute, queryAll, queryOne } from "../db/helpers.js";
import { broadcast } from "../ws/handler.js";
import { getIssuesWithLabel, removeLabelFromIssue } from "./github/index.js";
import { pollForLabeledIssues } from "./issue-polling.js";

const makeRepo = (overrides?: Partial<Record<string, unknown>>) => ({
  id: "repo-1",
  owner: "testowner",
  name: "testrepo",
  trigger_label: "agent:run",
  is_active: true,
  auto_create_jobs: true,
  remove_label_after_create: false,
  ...overrides,
});

const makeIssue = (overrides?: Partial<Record<string, unknown>>) => ({
  number: 42,
  title: "Fix the bug",
  html_url: "https://github.com/testowner/testrepo/issues/42",
  body: "Description of the bug",
  ...overrides,
});

describe("issue-polling", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe("pollForLabeledIssues", () => {
    it("should return zeros when no active repositories exist", async () => {
      // getActiveRepositories returns empty
      vi.mocked(queryAll).mockResolvedValue([]);

      const result = await pollForLabeledIssues();

      expect(result).toEqual({ checked: 0, created: 0 });
    });

    it("should check issues for active repositories", async () => {
      const repo = makeRepo();

      // getActiveRepositories
      vi.mocked(queryAll).mockResolvedValue([repo]);

      // jobExistsForIssue - job exists
      vi.mocked(queryOne).mockResolvedValue({ id: "existing-job" });

      vi.mocked(getIssuesWithLabel).mockResolvedValue([makeIssue()] as never);

      const result = await pollForLabeledIssues();

      expect(result).toEqual({ checked: 1, created: 0 });
      expect(getIssuesWithLabel).toHaveBeenCalledWith("repo-1", "agent:run");
    });

    it("should create a job for a new issue", async () => {
      const repo = makeRepo();
      const issue = makeIssue();
      const newJob = { id: "new-job-1", status: "queued", issue_number: 42 };

      // getActiveRepositories
      vi.mocked(queryAll).mockResolvedValue([repo]);

      // jobExistsForIssue - no existing job, then createJobFromIssue queryOne returns newJob
      vi.mocked(queryOne)
        .mockResolvedValueOnce(undefined) // jobExistsForIssue - no job
        .mockResolvedValueOnce(newJob); // createJobFromIssue - fetch newly created job

      vi.mocked(getIssuesWithLabel).mockResolvedValue([issue] as never);
      vi.mocked(execute).mockResolvedValue(undefined);

      const result = await pollForLabeledIssues();

      expect(result).toEqual({ checked: 1, created: 1 });
      // execute called for: INSERT job, INSERT event
      expect(execute).toHaveBeenCalledTimes(2);
      expect(broadcast).toHaveBeenCalledWith({
        type: "job:created",
        payload: newJob,
      });
    });

    it("should remove label after creating job when configured", async () => {
      const repo = makeRepo({ remove_label_after_create: true });
      const issue = makeIssue();
      const newJob = { id: "new-job-1", status: "queued" };

      vi.mocked(queryAll).mockResolvedValue([repo]);

      vi.mocked(queryOne)
        .mockResolvedValueOnce(undefined) // jobExistsForIssue
        .mockResolvedValueOnce(newJob); // createJobFromIssue fetch

      vi.mocked(getIssuesWithLabel).mockResolvedValue([issue] as never);
      vi.mocked(execute).mockResolvedValue(undefined);

      await pollForLabeledIssues();

      expect(removeLabelFromIssue).toHaveBeenCalledWith(
        "repo-1",
        42,
        "agent:run",
      );
    });

    it("should NOT remove label when removeLabelAfterCreate is false", async () => {
      const repo = makeRepo({ remove_label_after_create: false });
      const issue = makeIssue();
      const newJob = { id: "new-job-1", status: "queued" };

      vi.mocked(queryAll).mockResolvedValue([repo]);

      vi.mocked(queryOne)
        .mockResolvedValueOnce(undefined) // jobExistsForIssue
        .mockResolvedValueOnce(newJob); // createJobFromIssue fetch

      vi.mocked(getIssuesWithLabel).mockResolvedValue([issue] as never);
      vi.mocked(execute).mockResolvedValue(undefined);

      await pollForLabeledIssues();

      expect(removeLabelFromIssue).not.toHaveBeenCalled();
    });

    it("should skip issues that already have jobs", async () => {
      const repo = makeRepo();
      const issue1 = makeIssue({ number: 1 });
      const issue2 = makeIssue({ number: 2 });

      vi.mocked(queryAll).mockResolvedValue([repo]);

      vi.mocked(queryOne)
        .mockResolvedValueOnce({ id: "existing" }) // issue 1 has existing job
        .mockResolvedValueOnce(undefined) // issue 2 has no job
        .mockResolvedValueOnce({ id: "new-job" }); // createJobFromIssue fetch

      vi.mocked(getIssuesWithLabel).mockResolvedValue([
        issue1,
        issue2,
      ] as never);
      vi.mocked(execute).mockResolvedValue(undefined);

      const result = await pollForLabeledIssues();

      expect(result).toEqual({ checked: 2, created: 1 });
    });

    it("should handle multiple repositories", async () => {
      const repo1 = makeRepo({ id: "repo-1" });
      const repo2 = makeRepo({ id: "repo-2", trigger_label: "bot:run" });

      vi.mocked(queryAll).mockResolvedValue([repo1, repo2]);

      // For each repo: jobExistsForIssue returns undefined, createJobFromIssue returns job
      vi.mocked(queryOne)
        .mockResolvedValueOnce(undefined) // repo1 issue - no existing job
        .mockResolvedValueOnce({ id: "new-job-1" }) // repo1 createJobFromIssue
        .mockResolvedValueOnce(undefined) // repo2 issue - no existing job
        .mockResolvedValueOnce({ id: "new-job-2" }); // repo2 createJobFromIssue

      vi.mocked(getIssuesWithLabel)
        .mockResolvedValueOnce([makeIssue({ number: 1 })] as never)
        .mockResolvedValueOnce([makeIssue({ number: 2 })] as never);

      vi.mocked(execute).mockResolvedValue(undefined);

      const result = await pollForLabeledIssues();

      expect(result).toEqual({ checked: 2, created: 2 });
      expect(getIssuesWithLabel).toHaveBeenCalledWith("repo-1", "agent:run");
      expect(getIssuesWithLabel).toHaveBeenCalledWith("repo-2", "bot:run");
    });

    it("should return zeros when no issues have the trigger label", async () => {
      const repo = makeRepo();

      vi.mocked(queryAll).mockResolvedValue([repo]);
      vi.mocked(getIssuesWithLabel).mockResolvedValue([]);

      const result = await pollForLabeledIssues();

      expect(result).toEqual({ checked: 0, created: 0 });
    });
  });
});
