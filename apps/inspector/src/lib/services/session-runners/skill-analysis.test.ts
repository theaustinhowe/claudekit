import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  getDb: vi.fn().mockResolvedValue({}),
}));

vi.mock("@claudekit/duckdb", () => ({
  queryAll: vi.fn(),
  queryOne: vi.fn(),
  execute: vi.fn(),
}));

vi.mock("@/lib/actions/settings", () => ({
  getSetting: vi.fn(),
}));

vi.mock("@/lib/prompts", () => ({
  buildSkillAnalysisPrompt: vi.fn().mockReturnValue("mock-prompt"),
}));

vi.mock("@claudekit/claude-runner", () => ({
  runClaude: vi.fn(),
}));

vi.mock("@/lib/services/session-manager", () => ({
  setSessionPid: vi.fn(),
}));

import { runClaude } from "@claudekit/claude-runner";
import { execute, queryAll, queryOne } from "@claudekit/duckdb";
import { getSetting } from "@/lib/actions/settings";
import { buildSkillAnalysisPrompt } from "@/lib/prompts";
import { createSkillAnalysisRunner } from "./skill-analysis";

const mockQueryAll = vi.mocked(queryAll);
const mockQueryOne = vi.mocked(queryOne);
const mockExecute = vi.mocked(execute);
const mockRunClaude = vi.mocked(runClaude);
const mockGetSetting = vi.mocked(getSetting);
const mockBuildPrompt = vi.mocked(buildSkillAnalysisPrompt);

function createTestContext(overrides?: { signal?: AbortSignal }) {
  const controller = new AbortController();
  return {
    onProgress: vi.fn(),
    signal: overrides?.signal ?? controller.signal,
    sessionId: "test-session-id",
    controller,
  };
}

describe("createSkillAnalysisRunner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSetting.mockResolvedValue(null); // ignore_bots default
  });

  it("runs happy path: gathers comments, calls Claude, persists skills", async () => {
    const comments = [
      {
        id: "c1",
        reviewer: "alice",
        body: "Fix error handling",
        file_path: "src/app.ts",
        line_number: 10,
        pr_id: "repo1#1",
      },
      { id: "c2", reviewer: "bob", body: "Add tests", file_path: "src/utils.ts", line_number: 20, pr_id: "repo1#2" },
    ];

    // queryAll calls: comments, then PRs
    mockQueryAll
      .mockResolvedValueOnce(comments) // pr_comments
      .mockResolvedValueOnce([
        { id: "repo1#1", number: 1, title: "PR One" },
        { id: "repo1#2", number: 2, title: "PR Two" },
      ]); // prs

    const skillsResponse = JSON.stringify([
      {
        name: "Error Handling",
        severity: "blocking",
        frequency: 1,
        trend: "New pattern",
        topExample: "Fix error handling",
        description: "Improve error handling patterns",
        commentIds: ["c1"],
        resources: [{ title: "Error Guide", url: "https://example.com" }],
        actionItem: "Add try-catch blocks",
      },
    ]);

    mockRunClaude.mockResolvedValue({
      stdout: skillsResponse,
      exitCode: 0,
      stderr: "",
    });

    // queryOne for validating commentIds
    mockQueryOne.mockResolvedValueOnce({ 1: 1 }); // c1 exists

    const runner = createSkillAnalysisRunner({ repoId: "repo1", prNumbers: [1, 2] });
    const ctx = createTestContext();
    const result = await runner(ctx);

    expect(result.result).toHaveProperty("analysisId");
    expect(result.result).toHaveProperty("skillCount", 1);

    // Verify analysis was inserted
    expect(mockExecute).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining("INSERT INTO skill_analyses"),
      expect.arrayContaining(["repo1", JSON.stringify([1, 2])]),
    );

    // Verify skill was inserted
    expect(mockExecute).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining("INSERT INTO skills"),
      expect.arrayContaining(["Error Handling"]),
    );

    // Verify prompt was built with enriched comments
    expect(mockBuildPrompt).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ id: "c1", prNumber: 1, prTitle: "PR One" })]),
    );
  });

  it("throws when no comments found", async () => {
    mockQueryAll.mockResolvedValueOnce([]); // empty comments

    const runner = createSkillAnalysisRunner({ repoId: "repo1", prNumbers: [1] });
    const ctx = createTestContext();

    await expect(runner(ctx)).rejects.toThrow("No comments found for selected PRs");
  });

  it("filters bot comments when ignore_bots is enabled", async () => {
    const comments = [
      { id: "c1", reviewer: "alice", body: "Good change", file_path: null, line_number: null, pr_id: "repo1#1" },
      {
        id: "c2",
        reviewer: "dependabot[bot]",
        body: "Auto update",
        file_path: null,
        line_number: null,
        pr_id: "repo1#1",
      },
    ];

    mockQueryAll.mockResolvedValueOnce(comments).mockResolvedValueOnce([{ id: "repo1#1", number: 1, title: "PR One" }]);
    mockGetSetting.mockResolvedValue(null); // Not "false" => bots are filtered

    const skillsJson = JSON.stringify([
      {
        name: "Code Quality",
        severity: "suggestion",
        frequency: 1,
        trend: "Flat",
        topExample: "Good change",
        description: "Quality improvements",
        commentIds: ["c1"],
        resources: [],
        actionItem: "Keep it up",
      },
    ]);
    mockRunClaude.mockResolvedValue({ stdout: skillsJson, exitCode: 0, stderr: "" });
    mockQueryOne.mockResolvedValueOnce({ 1: 1 }); // c1 exists

    const runner = createSkillAnalysisRunner({ repoId: "repo1", prNumbers: [1] });
    const ctx = createTestContext();
    await runner(ctx);

    // Verify only non-bot comment was passed to prompt
    expect(mockBuildPrompt).toHaveBeenCalledWith([expect.objectContaining({ id: "c1", reviewer: "alice" })]);
  });

  it("throws when all comments are bots", async () => {
    const comments = [
      {
        id: "c1",
        reviewer: "github-actions[bot]",
        body: "CI passed",
        file_path: null,
        line_number: null,
        pr_id: "repo1#1",
      },
    ];

    mockQueryAll.mockResolvedValueOnce(comments);
    mockGetSetting.mockResolvedValue(null); // bots filtered

    const runner = createSkillAnalysisRunner({ repoId: "repo1", prNumbers: [1] });
    const ctx = createTestContext();

    await expect(runner(ctx)).rejects.toThrow("No comments remain after filtering bots");
  });

  it("includes bot comments when ignore_bots is false", async () => {
    const comments = [
      {
        id: "c1",
        reviewer: "dependabot[bot]",
        body: "Update deps",
        file_path: null,
        line_number: null,
        pr_id: "repo1#1",
      },
    ];

    mockQueryAll.mockResolvedValueOnce(comments).mockResolvedValueOnce([{ id: "repo1#1", number: 1, title: "PR One" }]);
    mockGetSetting.mockResolvedValue("false"); // Do NOT filter bots

    const skillsJson = JSON.stringify([
      {
        name: "Dependency Mgmt",
        severity: "nit",
        frequency: 1,
        trend: "Flat",
        topExample: "Update deps",
        description: "Dep management",
        commentIds: ["c1"],
        resources: [],
        actionItem: "Auto-merge deps",
      },
    ]);
    mockRunClaude.mockResolvedValue({ stdout: skillsJson, exitCode: 0, stderr: "" });
    mockQueryOne.mockResolvedValueOnce({ 1: 1 });

    const runner = createSkillAnalysisRunner({ repoId: "repo1", prNumbers: [1] });
    const ctx = createTestContext();
    await runner(ctx);

    expect(mockBuildPrompt).toHaveBeenCalledWith([expect.objectContaining({ id: "c1", reviewer: "dependabot[bot]" })]);
  });

  it("throws when Claude response has no JSON array", async () => {
    mockQueryAll
      .mockResolvedValueOnce([
        { id: "c1", reviewer: "alice", body: "Fix this", file_path: null, line_number: null, pr_id: "repo1#1" },
      ])
      .mockResolvedValueOnce([{ id: "repo1#1", number: 1, title: "PR One" }]);

    mockRunClaude.mockResolvedValue({
      stdout: "Sorry, I cannot help with that.",
      exitCode: 0,
      stderr: "",
    });

    const runner = createSkillAnalysisRunner({ repoId: "repo1", prNumbers: [1] });
    const ctx = createTestContext();

    await expect(runner(ctx)).rejects.toThrow("Failed to parse skill analysis response");
  });

  it("filters invalid comment IDs during persistence", async () => {
    mockQueryAll
      .mockResolvedValueOnce([
        { id: "c1", reviewer: "alice", body: "Fix", file_path: null, line_number: null, pr_id: "repo1#1" },
      ])
      .mockResolvedValueOnce([{ id: "repo1#1", number: 1, title: "PR One" }]);

    const skillsJson = JSON.stringify([
      {
        name: "Testing",
        severity: "suggestion",
        frequency: 1,
        trend: "Flat",
        topExample: "Add tests",
        description: "Test coverage",
        commentIds: ["c1", "c-nonexistent"],
        resources: [],
        actionItem: "Write tests",
      },
    ]);
    mockRunClaude.mockResolvedValue({ stdout: skillsJson, exitCode: 0, stderr: "" });

    // c1 exists, c-nonexistent does not
    mockQueryOne
      .mockResolvedValueOnce({ 1: 1 }) // c1 exists
      .mockResolvedValueOnce(undefined); // c-nonexistent not found

    const runner = createSkillAnalysisRunner({ repoId: "repo1", prNumbers: [1] });
    const ctx = createTestContext();
    await runner(ctx);

    // Verify only valid comment ID was persisted
    const skillInsertCall = mockExecute.mock.calls.find(
      (call) => typeof call[1] === "string" && call[1].includes("INSERT INTO skills"),
    );
    expect(skillInsertCall).toBeDefined();
    expect(skillInsertCall?.[2]).toContain(JSON.stringify(["c1"]));
  });

  it("aborts before Claude analysis", async () => {
    mockQueryAll
      .mockResolvedValueOnce([
        { id: "c1", reviewer: "alice", body: "Fix", file_path: null, line_number: null, pr_id: "repo1#1" },
      ])
      .mockResolvedValueOnce([{ id: "repo1#1", number: 1, title: "PR One" }]);

    const controller = new AbortController();
    const runner = createSkillAnalysisRunner({ repoId: "repo1", prNumbers: [1] });

    // Abort after comments are fetched but before Claude is called
    mockBuildPrompt.mockImplementation(() => {
      controller.abort();
      return "mock-prompt";
    });

    const ctx = createTestContext({ signal: controller.signal });
    await expect(runner(ctx)).rejects.toThrow("Aborted");
    expect(mockRunClaude).not.toHaveBeenCalled();
  });

  it("reports progress through all phases", async () => {
    mockQueryAll
      .mockResolvedValueOnce([
        { id: "c1", reviewer: "alice", body: "Fix", file_path: null, line_number: null, pr_id: "repo1#1" },
      ])
      .mockResolvedValueOnce([{ id: "repo1#1", number: 1, title: "PR One" }]);

    mockRunClaude.mockResolvedValue({
      stdout: JSON.stringify([]),
      exitCode: 0,
      stderr: "",
    });

    const runner = createSkillAnalysisRunner({ repoId: "repo1", prNumbers: [1] });
    const ctx = createTestContext();
    await runner(ctx);

    const phases = ctx.onProgress.mock.calls.map((c: unknown[]) => (c[0] as { phase?: string }).phase).filter(Boolean);
    expect(phases).toContain("Preparing");
    expect(phases).toContain("Extracting comments");
    expect(phases).toContain("Analyzing patterns");
    expect(phases).toContain("Processing results");
    expect(phases).toContain("Saving results");
    expect(phases).toContain("Complete");
  });
});
