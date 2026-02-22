import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs", () => ({
  default: {
    existsSync: vi.fn(() => true),
    rmSync: vi.fn(),
  },
}));
vi.mock("@claudekit/claude-runner", () => ({
  runClaude: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  getDb: vi.fn(async () => ({})),
  queryOne: vi.fn(),
}));
vi.mock("@/lib/actions/settings", () => ({
  getCleanupFiles: vi.fn(async () => []),
}));
vi.mock("@/lib/services/git-utils", () => ({
  pushBranchAndCreatePR: vi.fn(),
  runShell: vi.fn(),
  sanitizeGitRef: vi.fn((ref: string) => ref),
  shellEscape: vi.fn((arg: string) => `'${arg}'`),
}));
vi.mock("@/lib/services/process-runner", () => ({
  runProcess: vi.fn(),
}));
vi.mock("@/lib/services/quick-improve-prompts", () => ({
  PERSONA_CONFIGS: {
    uiux: {
      label: "UI/UX",
      branchPrefix: "gadget/uiux-improve",
      commitMessage: "UI/UX improvements by Gadget",
      allowedTools: "Write,Edit,Read,Glob,Grep",
      prTitle: (repoName: string) => `UI/UX improvements for ${repoName}`,
      prBody: (repoName: string, claudeOutput: string) => `body for ${repoName}: ${claudeOutput}`,
      buildPrompt: (repoPath: string) => `prompt for ${repoPath}`,
    },
  },
}));
vi.mock("@/lib/services/session-manager", () => ({
  setCleanupFn: vi.fn(),
  setSessionPid: vi.fn(),
}));
vi.mock("@/lib/utils", () => ({
  expandTilde: vi.fn((p: string) => p),
}));

import fs from "node:fs";
import { runClaude } from "@claudekit/claude-runner";
import { queryOne } from "@/lib/db";
import { pushBranchAndCreatePR, runShell } from "@/lib/services/git-utils";
import { setCleanupFn } from "@/lib/services/session-manager";
import { createQuickImproveRunner } from "./quick-improve";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(fs.existsSync).mockReturnValue(true);
});

describe("quick-improve runner", () => {
  const defaultRepo = { local_path: "/repo", name: "my-repo", git_remote: "https://github.com/user/repo" };

  function setupHappyPath() {
    vi.mocked(queryOne).mockResolvedValue(defaultRepo);
    vi.mocked(runShell)
      // gh auth status
      .mockResolvedValueOnce({ exitCode: 0, stdout: "", stderr: "" })
      // git rev-parse --abbrev-ref HEAD
      .mockResolvedValueOnce({ exitCode: 0, stdout: "main", stderr: "" })
      // git worktree add
      .mockResolvedValueOnce({ exitCode: 0, stdout: "", stderr: "" })
      // git diff --stat
      .mockResolvedValueOnce({ exitCode: 0, stdout: "1 file changed", stderr: "" })
      // git ls-files --others
      .mockResolvedValueOnce({ exitCode: 0, stdout: "", stderr: "" })
      // git commit
      .mockResolvedValueOnce({ exitCode: 0, stdout: "", stderr: "" })
      // git diff --stat HEAD~1
      .mockResolvedValueOnce({ exitCode: 0, stdout: "3 files changed, 45 insertions(+), 12 deletions(-)", stderr: "" })
      // git worktree remove (final cleanup)
      .mockResolvedValueOnce({ exitCode: 0, stdout: "", stderr: "" });
    vi.mocked(runClaude).mockResolvedValue({
      exitCode: 0,
      stdout: "Made improvements",
      stderr: "",
    } as never);
    vi.mocked(pushBranchAndCreatePR).mockResolvedValue({
      prUrl: "https://github.com/user/repo/pull/1",
    });
  }

  it("throws when persona is invalid", async () => {
    const runner = createQuickImproveRunner({ persona: "nonexistent", repoId: "r1" });

    await expect(
      runner({ onProgress: vi.fn(), signal: new AbortController().signal, sessionId: "s1" }),
    ).rejects.toThrow("Invalid persona");
  });

  it("throws when repo not found", async () => {
    vi.mocked(queryOne).mockResolvedValue(undefined);

    const runner = createQuickImproveRunner({ persona: "uiux", repoId: "r1" });

    await expect(
      runner({ onProgress: vi.fn(), signal: new AbortController().signal, sessionId: "s1" }),
    ).rejects.toThrow("Repo not found");
  });

  it("throws when repo has no git remote", async () => {
    vi.mocked(queryOne).mockResolvedValue({ local_path: "/repo", name: "my-repo", git_remote: null });

    const runner = createQuickImproveRunner({ persona: "uiux", repoId: "r1" });

    await expect(
      runner({ onProgress: vi.fn(), signal: new AbortController().signal, sessionId: "s1" }),
    ).rejects.toThrow("Repo has no git remote");
  });

  it("throws when repo path does not exist", async () => {
    vi.mocked(queryOne).mockResolvedValue(defaultRepo);
    vi.mocked(fs.existsSync).mockReturnValue(false);

    const runner = createQuickImproveRunner({ persona: "uiux", repoId: "r1" });

    await expect(
      runner({ onProgress: vi.fn(), signal: new AbortController().signal, sessionId: "s1" }),
    ).rejects.toThrow("Repo path does not exist on disk");
  });

  it("throws when gh CLI is not authenticated", async () => {
    vi.mocked(queryOne).mockResolvedValue(defaultRepo);
    vi.mocked(runShell).mockResolvedValueOnce({ exitCode: 1, stdout: "", stderr: "not logged in" });

    const runner = createQuickImproveRunner({ persona: "uiux", repoId: "r1" });

    await expect(
      runner({ onProgress: vi.fn(), signal: new AbortController().signal, sessionId: "s1" }),
    ).rejects.toThrow("GitHub CLI (gh) is not authenticated");
  });

  it("throws when current branch detection fails", async () => {
    vi.mocked(queryOne).mockResolvedValue(defaultRepo);
    vi.mocked(runShell)
      .mockResolvedValueOnce({ exitCode: 0, stdout: "", stderr: "" }) // gh auth
      .mockResolvedValueOnce({ exitCode: 1, stdout: "", stderr: "" }); // git rev-parse

    const runner = createQuickImproveRunner({ persona: "uiux", repoId: "r1" });

    await expect(
      runner({ onProgress: vi.fn(), signal: new AbortController().signal, sessionId: "s1" }),
    ).rejects.toThrow("Failed to detect current branch");
  });

  it("returns noChanges when no changes detected", async () => {
    vi.mocked(queryOne).mockResolvedValue(defaultRepo);
    vi.mocked(runShell)
      .mockResolvedValueOnce({ exitCode: 0, stdout: "", stderr: "" }) // gh auth
      .mockResolvedValueOnce({ exitCode: 0, stdout: "main", stderr: "" }) // rev-parse
      .mockResolvedValueOnce({ exitCode: 0, stdout: "", stderr: "" }) // worktree add
      .mockResolvedValueOnce({ exitCode: 0, stdout: "", stderr: "" }) // diff --stat (empty)
      .mockResolvedValueOnce({ exitCode: 0, stdout: "", stderr: "" }) // ls-files (empty)
      .mockResolvedValueOnce({ exitCode: 0, stdout: "", stderr: "" }) // worktree remove
      .mockResolvedValueOnce({ exitCode: 0, stdout: "", stderr: "" }); // branch -D
    vi.mocked(runClaude).mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" } as never);

    const onProgress = vi.fn();
    const runner = createQuickImproveRunner({ persona: "uiux", repoId: "r1" });
    const result = await runner({ onProgress, signal: new AbortController().signal, sessionId: "s1" });

    expect(result).toEqual({ result: { noChanges: true } });
  });

  it("creates PR and returns result on success", async () => {
    setupHappyPath();

    const onProgress = vi.fn();
    const runner = createQuickImproveRunner({ persona: "uiux", repoId: "r1" });
    const result = await runner({ onProgress, signal: new AbortController().signal, sessionId: "s1" });

    expect(result.result).toHaveProperty("prUrl", "https://github.com/user/repo/pull/1");
    expect(result.result).toHaveProperty("branchName");
    expect(result.result).toHaveProperty("diffSummary");
    expect(pushBranchAndCreatePR).toHaveBeenCalled();
  });

  it("registers a cleanup function", async () => {
    setupHappyPath();

    const runner = createQuickImproveRunner({ persona: "uiux", repoId: "r1" });
    await runner({ onProgress: vi.fn(), signal: new AbortController().signal, sessionId: "s1" });

    expect(setCleanupFn).toHaveBeenCalledWith("s1", expect.any(Function));
  });

  it("calls runClaude with persona prompt", async () => {
    setupHappyPath();

    const runner = createQuickImproveRunner({ persona: "uiux", repoId: "r1" });
    await runner({ onProgress: vi.fn(), signal: new AbortController().signal, sessionId: "s1" });

    expect(runClaude).toHaveBeenCalledWith(
      expect.objectContaining({
        allowedTools: "Write,Edit,Read,Glob,Grep",
        disallowedTools: "Bash",
      }),
    );
  });

  it("emits progress events", async () => {
    setupHappyPath();

    const onProgress = vi.fn();
    const runner = createQuickImproveRunner({ persona: "uiux", repoId: "r1" });
    await runner({ onProgress, signal: new AbortController().signal, sessionId: "s1" });

    const progressCalls = onProgress.mock.calls.filter(([evt]) => evt.type === "progress");
    expect(progressCalls.length).toBeGreaterThan(0);
  });

  it("throws when worktree creation fails", async () => {
    vi.mocked(queryOne).mockResolvedValue(defaultRepo);
    vi.mocked(runShell)
      .mockResolvedValueOnce({ exitCode: 0, stdout: "", stderr: "" }) // gh auth
      .mockResolvedValueOnce({ exitCode: 0, stdout: "main", stderr: "" }) // rev-parse
      .mockResolvedValueOnce({ exitCode: 128, stdout: "", stderr: "fatal: worktree error" }); // worktree add

    const runner = createQuickImproveRunner({ persona: "uiux", repoId: "r1" });

    await expect(
      runner({ onProgress: vi.fn(), signal: new AbortController().signal, sessionId: "s1" }),
    ).rejects.toThrow("Failed to create worktree");
  });

  it("throws when commit fails", async () => {
    vi.mocked(queryOne).mockResolvedValue(defaultRepo);
    vi.mocked(runShell)
      .mockResolvedValueOnce({ exitCode: 0, stdout: "", stderr: "" }) // gh auth
      .mockResolvedValueOnce({ exitCode: 0, stdout: "main", stderr: "" }) // rev-parse
      .mockResolvedValueOnce({ exitCode: 0, stdout: "", stderr: "" }) // worktree add
      .mockResolvedValueOnce({ exitCode: 0, stdout: "1 file changed", stderr: "" }) // diff --stat
      .mockResolvedValueOnce({ exitCode: 0, stdout: "", stderr: "" }) // ls-files
      .mockResolvedValueOnce({ exitCode: 1, stdout: "", stderr: "commit error" }); // commit fails
    vi.mocked(runClaude).mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" } as never);

    const runner = createQuickImproveRunner({ persona: "uiux", repoId: "r1" });

    await expect(
      runner({ onProgress: vi.fn(), signal: new AbortController().signal, sessionId: "s1" }),
    ).rejects.toThrow("Git commit failed");
  });
});
