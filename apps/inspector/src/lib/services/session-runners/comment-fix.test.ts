import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  getDb: vi.fn().mockResolvedValue({}),
}));

vi.mock("@claudekit/duckdb", () => ({
  queryAll: vi.fn(),
  queryOne: vi.fn(),
  execute: vi.fn(),
}));

vi.mock("@/lib/actions/github", () => ({
  fetchFileContent: vi.fn(),
}));

vi.mock("@/lib/prompts", () => ({
  buildCommentFixPrompt: vi.fn().mockReturnValue("mock-fix-prompt"),
}));

vi.mock("@claudekit/claude-runner", () => ({
  runClaude: vi.fn(),
}));

vi.mock("@/lib/services/session-manager", () => ({
  setSessionPid: vi.fn(),
}));

import { runClaude } from "@claudekit/claude-runner";
import { execute, queryAll, queryOne } from "@claudekit/duckdb";
import { fetchFileContent } from "@/lib/actions/github";
import { buildCommentFixPrompt } from "@/lib/prompts";
import { createCommentFixRunner } from "./comment-fix";

const mockQueryAll = vi.mocked(queryAll);
const mockQueryOne = vi.mocked(queryOne);
const mockExecute = vi.mocked(execute);
const mockRunClaude = vi.mocked(runClaude);
const mockFetchFileContent = vi.mocked(fetchFileContent);
const mockBuildFixPrompt = vi.mocked(buildCommentFixPrompt);

function createTestContext(overrides?: { signal?: AbortSignal }) {
  const controller = new AbortController();
  return {
    onProgress: vi.fn(),
    signal: overrides?.signal ?? controller.signal,
    sessionId: "test-session-id",
    controller,
  };
}

describe("createCommentFixRunner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("runs happy path: fetches file content, generates fixes, persists", async () => {
    const comments = [
      { id: "c1", pr_id: "repo1#1", body: "Fix null check", file_path: "src/utils.ts", line_number: 15 },
    ];
    mockQueryAll.mockResolvedValueOnce(comments);

    // PR lookup
    mockQueryOne
      .mockResolvedValueOnce({ repo_id: "repo1", branch: "feature-branch" }) // PR
      .mockResolvedValueOnce({ owner: "owner", name: "repo" }); // Repo

    mockFetchFileContent.mockResolvedValue("const x = null;\nif (x) { ... }");

    const fixesJson = JSON.stringify([
      {
        commentId: "c1",
        suggestedFix: "Add null check before accessing x",
        fixDiff: "@@ -1,2 +1,2 @@\n-const x = null;\n+const x = null ?? defaultVal;",
      },
    ]);
    mockRunClaude.mockResolvedValue({ stdout: fixesJson, exitCode: 0, stderr: "" });

    const runner = createCommentFixRunner({ commentIds: ["c1"] });
    const ctx = createTestContext();
    const result = await runner(ctx);

    expect(result.result).toEqual({ fixCount: 1, commentIds: ["c1"] });

    // Verify file content was fetched
    expect(mockFetchFileContent).toHaveBeenCalledWith("owner", "repo", "src/utils.ts", "feature-branch");

    // Verify fix was persisted
    expect(mockExecute).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining("INSERT INTO comment_fixes"),
      expect.arrayContaining(["c1", "Add null check before accessing x"]),
    );
  });

  it("skips file content fetch when no file_path or branch", async () => {
    const comments = [{ id: "c1", pr_id: "repo1#1", body: "General comment", file_path: null, line_number: null }];
    mockQueryAll.mockResolvedValueOnce(comments);

    mockQueryOne
      .mockResolvedValueOnce({ repo_id: "repo1", branch: null }) // no branch
      .mockResolvedValueOnce({ owner: "owner", name: "repo" });

    const fixesJson = JSON.stringify([{ commentId: "c1", suggestedFix: "General fix", fixDiff: "diff" }]);
    mockRunClaude.mockResolvedValue({ stdout: fixesJson, exitCode: 0, stderr: "" });

    const runner = createCommentFixRunner({ commentIds: ["c1"] });
    const ctx = createTestContext();
    await runner(ctx);

    // fetchFileContent should not be called when branch is null
    expect(mockFetchFileContent).not.toHaveBeenCalled();

    // Prompt should be built with null fileContent
    expect(mockBuildFixPrompt).toHaveBeenCalledWith([expect.objectContaining({ id: "c1", fileContent: null })]);
  });

  it("throws when no comments found", async () => {
    mockQueryAll.mockResolvedValueOnce([]);

    const runner = createCommentFixRunner({ commentIds: ["c1"] });
    const ctx = createTestContext();

    await expect(runner(ctx)).rejects.toThrow("No comments found");
  });

  it("throws when PR not found", async () => {
    mockQueryAll.mockResolvedValueOnce([
      { id: "c1", pr_id: "repo1#1", body: "Fix this", file_path: null, line_number: null },
    ]);
    mockQueryOne.mockResolvedValueOnce(undefined); // PR not found

    const runner = createCommentFixRunner({ commentIds: ["c1"] });
    const ctx = createTestContext();

    await expect(runner(ctx)).rejects.toThrow("PR not found");
  });

  it("throws when repo not found", async () => {
    mockQueryAll.mockResolvedValueOnce([
      { id: "c1", pr_id: "repo1#1", body: "Fix this", file_path: null, line_number: null },
    ]);
    mockQueryOne
      .mockResolvedValueOnce({ repo_id: "repo1", branch: "main" }) // PR found
      .mockResolvedValueOnce(undefined); // Repo not found

    const runner = createCommentFixRunner({ commentIds: ["c1"] });
    const ctx = createTestContext();

    await expect(runner(ctx)).rejects.toThrow("Repo not found");
  });

  it("throws when Claude response has no JSON", async () => {
    mockQueryAll.mockResolvedValueOnce([
      { id: "c1", pr_id: "repo1#1", body: "Fix this", file_path: null, line_number: null },
    ]);
    mockQueryOne
      .mockResolvedValueOnce({ repo_id: "repo1", branch: null })
      .mockResolvedValueOnce({ owner: "owner", name: "repo" });

    mockRunClaude.mockResolvedValue({
      stdout: "Unable to generate fixes.",
      exitCode: 0,
      stderr: "",
    });

    const runner = createCommentFixRunner({ commentIds: ["c1"] });
    const ctx = createTestContext();

    await expect(runner(ctx)).rejects.toThrow("Failed to parse fix response");
  });

  it("handles multiple comments with file content", async () => {
    const comments = [
      { id: "c1", pr_id: "repo1#1", body: "Fix error", file_path: "src/a.ts", line_number: 10 },
      { id: "c2", pr_id: "repo1#1", body: "Add type", file_path: "src/b.ts", line_number: 5 },
    ];
    mockQueryAll.mockResolvedValueOnce(comments);

    mockQueryOne
      .mockResolvedValueOnce({ repo_id: "repo1", branch: "feat" })
      .mockResolvedValueOnce({ owner: "owner", name: "repo" });

    mockFetchFileContent.mockResolvedValueOnce("file a content").mockResolvedValueOnce("file b content");

    const fixesJson = JSON.stringify([
      { commentId: "c1", suggestedFix: "Fix 1", fixDiff: "diff1" },
      { commentId: "c2", suggestedFix: "Fix 2", fixDiff: "diff2" },
    ]);
    mockRunClaude.mockResolvedValue({ stdout: fixesJson, exitCode: 0, stderr: "" });

    const runner = createCommentFixRunner({ commentIds: ["c1", "c2"] });
    const ctx = createTestContext();
    const result = await runner(ctx);

    expect(result.result).toEqual({ fixCount: 2, commentIds: ["c1", "c2"] });
    expect(mockFetchFileContent).toHaveBeenCalledTimes(2);

    // Both fixes persisted
    const insertCalls = mockExecute.mock.calls.filter(
      (call) => typeof call[1] === "string" && call[1].includes("INSERT INTO comment_fixes"),
    );
    expect(insertCalls).toHaveLength(2);
  });

  it("aborts before fix generation", async () => {
    mockQueryAll.mockResolvedValueOnce([
      { id: "c1", pr_id: "repo1#1", body: "Fix", file_path: null, line_number: null },
    ]);
    mockQueryOne
      .mockResolvedValueOnce({ repo_id: "repo1", branch: null })
      .mockResolvedValueOnce({ owner: "owner", name: "repo" });

    const controller = new AbortController();
    controller.abort();

    const runner = createCommentFixRunner({ commentIds: ["c1"] });
    const ctx = createTestContext({ signal: controller.signal });

    await expect(runner(ctx)).rejects.toThrow("Aborted");
  });

  it("reports progress through all phases", async () => {
    mockQueryAll.mockResolvedValueOnce([
      { id: "c1", pr_id: "repo1#1", body: "Fix", file_path: null, line_number: null },
    ]);
    mockQueryOne
      .mockResolvedValueOnce({ repo_id: "repo1", branch: null })
      .mockResolvedValueOnce({ owner: "owner", name: "repo" });

    mockRunClaude.mockResolvedValue({
      stdout: JSON.stringify([{ commentId: "c1", suggestedFix: "Fix", fixDiff: "diff" }]),
      exitCode: 0,
      stderr: "",
    });

    const runner = createCommentFixRunner({ commentIds: ["c1"] });
    const ctx = createTestContext();
    await runner(ctx);

    const phases = ctx.onProgress.mock.calls.map((c: unknown[]) => (c[0] as { phase?: string }).phase).filter(Boolean);
    expect(phases).toContain("Loading comments");
    expect(phases).toContain("Fetching file context");
    expect(phases).toContain("Generating fixes");
    expect(phases).toContain("Processing fixes");
    expect(phases).toContain("Saving fixes");
    expect(phases).toContain("Complete");
  });
});
