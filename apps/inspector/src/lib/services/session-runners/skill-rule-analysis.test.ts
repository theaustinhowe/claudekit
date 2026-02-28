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
  buildSkillRulePrompt: vi.fn().mockReturnValue("mock-rule-prompt"),
}));

vi.mock("@/lib/actions/github", () => ({
  fetchPRDiff: vi.fn(),
}));

vi.mock("@claudekit/claude-runner", () => ({
  runClaude: vi.fn(),
}));

vi.mock("@/lib/services/session-manager", () => ({
  setSessionPid: vi.fn(),
}));

import { runClaude } from "@claudekit/claude-runner";
import { execute, queryAll, queryOne } from "@claudekit/duckdb";
import { fetchPRDiff } from "@/lib/actions/github";
import { getSetting } from "@/lib/actions/settings";
import { createSkillRuleAnalysisRunner } from "./skill-rule-analysis";

const mockQueryAll = vi.mocked(queryAll);
const mockQueryOne = vi.mocked(queryOne);
const mockExecute = vi.mocked(execute);
const mockRunClaude = vi.mocked(runClaude);
const mockGetSetting = vi.mocked(getSetting);
const mockFetchPRDiff = vi.mocked(fetchPRDiff);

function createTestContext(overrides?: { signal?: AbortSignal }) {
  const controller = new AbortController();
  return {
    onProgress: vi.fn(),
    signal: overrides?.signal ?? controller.signal,
    sessionId: "test-session-id",
    controller,
  };
}

describe("createSkillRuleAnalysisRunner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSetting.mockResolvedValue(null);
  });

  it("runs happy path: fetches diffs, generates rules, persists", async () => {
    const comments = [
      {
        id: "c1",
        reviewer: "alice",
        body: "Use error boundaries",
        file_path: "src/App.tsx",
        line_number: 5,
        pr_id: "repo1#1",
      },
    ];

    mockQueryAll
      .mockResolvedValueOnce(comments) // pr_comments
      .mockResolvedValueOnce([{ id: "repo1#1", number: 1, title: "PR One", repo_id: "repo1" }]); // prs

    mockQueryOne
      .mockResolvedValueOnce({ owner: "owner", name: "repo" }) // repo lookup
      .mockResolvedValueOnce(undefined) // group doesn't exist
      .mockResolvedValueOnce({ 1: 1 }); // c1 exists

    mockFetchPRDiff.mockResolvedValue("diff --git a/src/App.tsx b/src/App.tsx\n+error code");

    const rulesJson = JSON.stringify([
      {
        name: "error-boundary-handling",
        group: "react-components",
        severity: "blocking",
        description: "Always wrap components with error boundaries",
        rule_content: "## Error Boundaries\nDo: Use ErrorBoundary\nDon't: Let errors propagate",
        commentIds: ["c1"],
      },
    ]);

    mockRunClaude.mockResolvedValue({ stdout: rulesJson, exitCode: 0, stderr: "" });

    const runner = createSkillRuleAnalysisRunner({ repoId: "repo1", prNumbers: [1] });
    const ctx = createTestContext();
    const result = await runner(ctx);

    expect(result.result).toHaveProperty("analysisId");
    expect(result.result).toHaveProperty("ruleCount", 1);

    // Verify skill group was created
    expect(mockExecute).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining("INSERT INTO skill_groups"),
      expect.arrayContaining(["react-components"]),
    );

    // Verify skill was inserted with rule_content
    expect(mockExecute).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining("INSERT INTO skills"),
      expect.arrayContaining(["error-boundary-handling"]),
    );
  });

  it("reuses existing skill group", async () => {
    const comments = [
      { id: "c1", reviewer: "alice", body: "Fix style", file_path: "src/a.css", line_number: 1, pr_id: "repo1#1" },
    ];

    mockQueryAll
      .mockResolvedValueOnce(comments)
      .mockResolvedValueOnce([{ id: "repo1#1", number: 1, title: "PR One", repo_id: "repo1" }]);

    mockQueryOne
      .mockResolvedValueOnce({ owner: "owner", name: "repo" })
      .mockResolvedValueOnce({ id: "css-styling" }) // group already exists
      .mockResolvedValueOnce({ 1: 1 }); // c1 exists

    mockFetchPRDiff.mockResolvedValue("diff content");

    const rulesJson = JSON.stringify([
      {
        name: "css-naming",
        group: "css-styling",
        severity: "nit",
        description: "Use BEM naming",
        rule_content: "Use BEM naming conventions",
        commentIds: ["c1"],
      },
    ]);
    mockRunClaude.mockResolvedValue({ stdout: rulesJson, exitCode: 0, stderr: "" });

    const runner = createSkillRuleAnalysisRunner({ repoId: "repo1", prNumbers: [1] });
    const ctx = createTestContext();
    await runner(ctx);

    // Should NOT have inserted a new skill group
    const groupInsertCalls = mockExecute.mock.calls.filter(
      (call) => typeof call[1] === "string" && call[1].includes("INSERT INTO skill_groups"),
    );
    expect(groupInsertCalls).toHaveLength(0);
  });

  it("throws when no comments found", async () => {
    mockQueryAll.mockResolvedValueOnce([]);

    const runner = createSkillRuleAnalysisRunner({ repoId: "repo1", prNumbers: [1] });
    const ctx = createTestContext();

    await expect(runner(ctx)).rejects.toThrow("No comments found for selected PRs");
  });

  it("throws when repo not found", async () => {
    const comments = [
      { id: "c1", reviewer: "alice", body: "Fix", file_path: null, line_number: null, pr_id: "repo1#1" },
    ];

    mockQueryAll
      .mockResolvedValueOnce(comments)
      .mockResolvedValueOnce([{ id: "repo1#1", number: 1, title: "PR One", repo_id: "repo1" }]);
    mockQueryOne.mockResolvedValueOnce(undefined); // repo not found

    const runner = createSkillRuleAnalysisRunner({ repoId: "repo1", prNumbers: [1] });
    const ctx = createTestContext();

    await expect(runner(ctx)).rejects.toThrow("Repo not found: repo1");
  });

  it("skips diffs that fail to fetch", async () => {
    const comments = [
      { id: "c1", reviewer: "alice", body: "Fix", file_path: null, line_number: null, pr_id: "repo1#1" },
    ];

    mockQueryAll.mockResolvedValueOnce(comments).mockResolvedValueOnce([
      { id: "repo1#1", number: 1, title: "PR One", repo_id: "repo1" },
      { id: "repo1#2", number: 2, title: "PR Two", repo_id: "repo1" },
    ]);
    mockQueryOne.mockResolvedValueOnce({ owner: "owner", name: "repo" });

    // First diff succeeds, second fails
    mockFetchPRDiff.mockResolvedValueOnce("diff for PR 1").mockRejectedValueOnce(new Error("404"));

    const rulesJson = JSON.stringify([]);
    mockRunClaude.mockResolvedValue({ stdout: rulesJson, exitCode: 0, stderr: "" });

    const runner = createSkillRuleAnalysisRunner({ repoId: "repo1", prNumbers: [1, 2] });
    const ctx = createTestContext();

    // Should not throw
    await expect(runner(ctx)).resolves.toBeDefined();
  });

  it("throws when Claude response has no JSON", async () => {
    const comments = [
      { id: "c1", reviewer: "alice", body: "Fix", file_path: null, line_number: null, pr_id: "repo1#1" },
    ];

    mockQueryAll
      .mockResolvedValueOnce(comments)
      .mockResolvedValueOnce([{ id: "repo1#1", number: 1, title: "PR One", repo_id: "repo1" }]);
    mockQueryOne.mockResolvedValueOnce({ owner: "owner", name: "repo" });
    mockFetchPRDiff.mockResolvedValue("diff content");

    mockRunClaude.mockResolvedValue({
      stdout: "I cannot generate rules.",
      exitCode: 0,
      stderr: "",
    });

    const runner = createSkillRuleAnalysisRunner({ repoId: "repo1", prNumbers: [1] });
    const ctx = createTestContext();

    await expect(runner(ctx)).rejects.toThrow("Failed to parse skill rule analysis response");
  });

  it("aborts during diff fetching", async () => {
    const comments = [
      { id: "c1", reviewer: "alice", body: "Fix", file_path: null, line_number: null, pr_id: "repo1#1" },
    ];

    mockQueryAll
      .mockResolvedValueOnce(comments)
      .mockResolvedValueOnce([{ id: "repo1#1", number: 1, title: "PR One", repo_id: "repo1" }]);
    mockQueryOne.mockResolvedValueOnce({ owner: "owner", name: "repo" });

    const controller = new AbortController();

    // Abort during diff fetch
    mockFetchPRDiff.mockImplementation(async () => {
      controller.abort();
      return "diff";
    });

    const runner = createSkillRuleAnalysisRunner({ repoId: "repo1", prNumbers: [1] });
    const ctx = createTestContext({ signal: controller.signal });

    await expect(runner(ctx)).rejects.toThrow("Aborted");
  });

  it("validates comment IDs before persisting", async () => {
    const comments = [
      { id: "c1", reviewer: "alice", body: "Fix", file_path: null, line_number: null, pr_id: "repo1#1" },
    ];

    mockQueryAll
      .mockResolvedValueOnce(comments)
      .mockResolvedValueOnce([{ id: "repo1#1", number: 1, title: "PR One", repo_id: "repo1" }]);

    mockQueryOne
      .mockResolvedValueOnce({ owner: "owner", name: "repo" }) // repo
      .mockResolvedValueOnce(undefined) // group doesn't exist
      .mockResolvedValueOnce({ 1: 1 }) // c1 valid
      .mockResolvedValueOnce(undefined); // c-invalid not found

    mockFetchPRDiff.mockResolvedValue("diff content");

    const rulesJson = JSON.stringify([
      {
        name: "test-rule",
        group: "testing",
        severity: "suggestion",
        description: "Test rule",
        rule_content: "Rule content",
        commentIds: ["c1", "c-invalid"],
      },
    ]);
    mockRunClaude.mockResolvedValue({ stdout: rulesJson, exitCode: 0, stderr: "" });

    const runner = createSkillRuleAnalysisRunner({ repoId: "repo1", prNumbers: [1] });
    const ctx = createTestContext();
    await runner(ctx);

    const skillInsertCall = mockExecute.mock.calls.find(
      (call) => typeof call[1] === "string" && call[1].includes("INSERT INTO skills"),
    );
    expect(skillInsertCall).toBeDefined();
    expect(skillInsertCall?.[2]).toContain(JSON.stringify(["c1"]));
  });
});
