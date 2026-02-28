import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  getDb: vi.fn().mockResolvedValue({}),
}));

vi.mock("@claudekit/duckdb", () => ({
  queryOne: vi.fn(),
  execute: vi.fn(),
}));

vi.mock("@/lib/actions/github", () => ({
  fetchPRDiff: vi.fn(),
}));

vi.mock("@/lib/prompts", () => ({
  buildSplitPlanPrompt: vi.fn().mockReturnValue("mock-split-prompt"),
}));

vi.mock("@claudekit/claude-runner", () => ({
  runClaude: vi.fn(),
}));

vi.mock("@/lib/services/session-manager", () => ({
  setSessionPid: vi.fn(),
}));

import { runClaude } from "@claudekit/claude-runner";
import { execute, queryOne } from "@claudekit/duckdb";
import { fetchPRDiff } from "@/lib/actions/github";
import { buildSplitPlanPrompt } from "@/lib/prompts";
import { createSplitAnalysisRunner } from "./split-analysis";

const mockQueryOne = vi.mocked(queryOne);
const mockExecute = vi.mocked(execute);
const mockRunClaude = vi.mocked(runClaude);
const mockFetchPRDiff = vi.mocked(fetchPRDiff);
const mockBuildPrompt = vi.mocked(buildSplitPlanPrompt);

function createTestContext(overrides?: { signal?: AbortSignal }) {
  const controller = new AbortController();
  return {
    onProgress: vi.fn(),
    signal: overrides?.signal ?? controller.signal,
    sessionId: "test-session-id",
    controller,
  };
}

describe("createSplitAnalysisRunner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("runs happy path: fetches diff, analyzes, persists split plan", async () => {
    mockQueryOne
      .mockResolvedValueOnce({
        id: "repo1#1",
        repo_id: "repo1",
        number: 1,
        title: "Big PR",
        files_changed: 15,
        lines_added: 500,
        lines_deleted: 200,
      }) // PR
      .mockResolvedValueOnce({ owner: "owner", name: "repo" }); // Repo

    mockFetchPRDiff.mockResolvedValue("diff --git a/file1 b/file1\n+new code");

    const subPRs = [
      {
        index: 1,
        total: 2,
        title: "Refactor utilities",
        size: "M",
        linesChanged: 300,
        files: [{ path: "src/utils.ts", additions: 200, deletions: 100 }],
        dependsOn: [],
        risk: "Low",
        riskNote: "Simple refactor",
        description: "Refactors utility functions",
        checklist: ["Tests pass"],
      },
      {
        index: 2,
        total: 2,
        title: "Add new feature",
        size: "M",
        linesChanged: 400,
        files: [{ path: "src/feature.ts", additions: 300, deletions: 100 }],
        dependsOn: [1],
        risk: "Medium",
        riskNote: "New API surface",
        description: "Adds new feature",
        checklist: ["Integration tests"],
      },
    ];

    mockRunClaude.mockResolvedValue({
      stdout: JSON.stringify(subPRs),
      exitCode: 0,
      stderr: "",
    });

    const runner = createSplitAnalysisRunner({ prId: "repo1#1" });
    const ctx = createTestContext();
    const result = await runner(ctx);

    expect(result.result).toHaveProperty("planId");
    expect(result.result).toHaveProperty("subPRCount", 2);

    // Verify diff was fetched
    expect(mockFetchPRDiff).toHaveBeenCalledWith("owner", "repo", 1);

    // Verify prompt was built with PR info
    expect(mockBuildPrompt).toHaveBeenCalledWith({
      number: 1,
      title: "Big PR",
      filesChanged: 15,
      diff: "diff --git a/file1 b/file1\n+new code",
    });

    // Verify split plan was persisted
    expect(mockExecute).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining("INSERT INTO split_plans"),
      expect.arrayContaining(["repo1#1", 700, JSON.stringify(subPRs)]),
    );
  });

  it("throws when PR not found", async () => {
    mockQueryOne.mockResolvedValueOnce(undefined);

    const runner = createSplitAnalysisRunner({ prId: "repo1#99" });
    const ctx = createTestContext();

    await expect(runner(ctx)).rejects.toThrow("PR not found: repo1#99");
  });

  it("throws when repo not found", async () => {
    mockQueryOne
      .mockResolvedValueOnce({
        id: "repo1#1",
        repo_id: "repo1",
        number: 1,
        title: "PR",
        files_changed: 5,
        lines_added: 100,
        lines_deleted: 50,
      })
      .mockResolvedValueOnce(undefined); // repo not found

    const runner = createSplitAnalysisRunner({ prId: "repo1#1" });
    const ctx = createTestContext();

    await expect(runner(ctx)).rejects.toThrow("Repo not found: repo1");
  });

  it("throws when Claude response has no JSON", async () => {
    mockQueryOne
      .mockResolvedValueOnce({
        id: "repo1#1",
        repo_id: "repo1",
        number: 1,
        title: "PR",
        files_changed: 5,
        lines_added: 100,
        lines_deleted: 50,
      })
      .mockResolvedValueOnce({ owner: "owner", name: "repo" });

    mockFetchPRDiff.mockResolvedValue("diff content");

    mockRunClaude.mockResolvedValue({
      stdout: "This PR is too complex to split.",
      exitCode: 0,
      stderr: "",
    });

    const runner = createSplitAnalysisRunner({ prId: "repo1#1" });
    const ctx = createTestContext();

    await expect(runner(ctx)).rejects.toThrow("Failed to parse split plan response");
  });

  it("calculates total lines correctly for split plan", async () => {
    mockQueryOne
      .mockResolvedValueOnce({
        id: "repo1#1",
        repo_id: "repo1",
        number: 1,
        title: "PR",
        files_changed: 5,
        lines_added: 300,
        lines_deleted: 150,
      })
      .mockResolvedValueOnce({ owner: "owner", name: "repo" });

    mockFetchPRDiff.mockResolvedValue("diff content");

    mockRunClaude.mockResolvedValue({
      stdout: JSON.stringify([{ index: 1, title: "Sub PR 1" }]),
      exitCode: 0,
      stderr: "",
    });

    const runner = createSplitAnalysisRunner({ prId: "repo1#1" });
    const ctx = createTestContext();
    await runner(ctx);

    // total_lines = lines_added + lines_deleted = 300 + 150 = 450
    expect(mockExecute).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining("INSERT INTO split_plans"),
      expect.arrayContaining([450]),
    );
  });

  it("aborts before Claude analysis", async () => {
    mockQueryOne
      .mockResolvedValueOnce({
        id: "repo1#1",
        repo_id: "repo1",
        number: 1,
        title: "PR",
        files_changed: 5,
        lines_added: 100,
        lines_deleted: 50,
      })
      .mockResolvedValueOnce({ owner: "owner", name: "repo" });

    const controller = new AbortController();

    // Abort during diff fetch so signal is aborted before the next check
    mockFetchPRDiff.mockImplementation(async () => {
      controller.abort();
      return "diff content";
    });

    const runner = createSplitAnalysisRunner({ prId: "repo1#1" });
    const ctx = createTestContext({ signal: controller.signal });

    await expect(runner(ctx)).rejects.toThrow("Aborted");
  });

  it("reports progress through all phases", async () => {
    mockQueryOne
      .mockResolvedValueOnce({
        id: "repo1#1",
        repo_id: "repo1",
        number: 1,
        title: "PR",
        files_changed: 5,
        lines_added: 100,
        lines_deleted: 50,
      })
      .mockResolvedValueOnce({ owner: "owner", name: "repo" });

    mockFetchPRDiff.mockResolvedValue("diff content");

    mockRunClaude.mockResolvedValue({
      stdout: JSON.stringify([]),
      exitCode: 0,
      stderr: "",
    });

    const runner = createSplitAnalysisRunner({ prId: "repo1#1" });
    const ctx = createTestContext();
    await runner(ctx);

    const phases = ctx.onProgress.mock.calls.map((c: unknown[]) => (c[0] as { phase?: string }).phase).filter(Boolean);
    expect(phases).toContain("Loading PR");
    expect(phases).toContain("Fetching diff");
    expect(phases).toContain("Analyzing structure");
    expect(phases).toContain("Processing results");
    expect(phases).toContain("Complete");
  });
});
