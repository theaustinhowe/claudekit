import { cast } from "@claudekit/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs", () => ({
  default: {
    existsSync: vi.fn(() => true),
    statSync: vi.fn(() => ({ mtimeMs: 0 })),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
  },
}));
vi.mock("@claudekit/claude-runner", () => ({
  runClaude: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  getDb: vi.fn(async () => ({})),
  queryOne: vi.fn(),
}));
vi.mock("@/lib/actions/findings", () => ({
  refreshAIFileFindings: vi.fn(),
}));
vi.mock("@/lib/services/session-manager", () => ({
  setSessionPid: vi.fn(),
}));
vi.mock("@/lib/utils", () => ({
  expandTilde: vi.fn((p: string) => p),
}));

import fs from "node:fs";
import { runClaude } from "@claudekit/claude-runner";
import { refreshAIFileFindings } from "@/lib/actions/findings";
import { queryOne } from "@/lib/db";
import { createAIFileGenRunner } from "./ai-file-gen";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(fs.existsSync).mockReturnValue(true);
  vi.mocked(fs.statSync).mockReturnValue(cast({ mtimeMs: 0 }));
});

describe("ai-file-gen runner", () => {
  const defaultRepo = { local_path: "/repo", name: "my-repo" };

  it("throws when repo not found", async () => {
    vi.mocked(queryOne).mockResolvedValue(undefined);

    const runner = createAIFileGenRunner({ repoId: "r1", fileName: "CLAUDE.md" });

    await expect(
      runner({ onProgress: vi.fn(), signal: new AbortController().signal, sessionId: "s1" }),
    ).rejects.toThrow("Repository not found");
  });

  it("throws when repo path does not exist", async () => {
    vi.mocked(queryOne).mockResolvedValue(defaultRepo);
    vi.mocked(fs.existsSync).mockReturnValue(false);

    const runner = createAIFileGenRunner({ repoId: "r1", fileName: "CLAUDE.md" });

    await expect(
      runner({ onProgress: vi.fn(), signal: new AbortController().signal, sessionId: "s1" }),
    ).rejects.toThrow("Repository path does not exist on disk");
  });

  it("skips when file was recently modified", async () => {
    vi.mocked(queryOne).mockResolvedValue(defaultRepo);
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.statSync).mockReturnValue(cast({ mtimeMs: Date.now() - 1000 })); // 1 second ago

    const runner = createAIFileGenRunner({ repoId: "r1", fileName: "CLAUDE.md" });
    const result = await runner({ onProgress: vi.fn(), signal: new AbortController().signal, sessionId: "s1" });

    expect(result.result).toHaveProperty("skipped", true);
    expect(runClaude).not.toHaveBeenCalled();
  });

  it("runs Claude and returns result on success when Claude writes file", async () => {
    vi.mocked(queryOne).mockResolvedValue(defaultRepo);
    // First call: repoPath exists, second: file check before claude, third: file doesn't exist before,
    // fourth: file written by Claude exists after
    let existsCallCount = 0;
    vi.mocked(fs.existsSync).mockImplementation(() => {
      existsCallCount++;
      // call 1: repoPath check -> true
      // call 2: filePath recency check -> false (file doesn't exist)
      // call 3: fileExistedBefore -> false
      // call 4: fileWrittenByClaude check -> true
      // call 5: final verification -> true
      if (existsCallCount === 2 || existsCallCount === 3) return false;
      return true;
    });
    vi.mocked(runClaude).mockResolvedValue(cast({ exitCode: 0, stdout: "", stderr: "" }));

    const onProgress = vi.fn();
    const runner = createAIFileGenRunner({ repoId: "r1", fileName: "CLAUDE.md" });
    const result = await runner({ onProgress, signal: new AbortController().signal, sessionId: "s1" });

    expect(result.result).toEqual({
      fileName: "CLAUDE.md",
      action: "create",
      message: "Created CLAUDE.md",
    });
  });

  it("falls back to writing stdout when Claude does not write file directly", async () => {
    vi.mocked(queryOne).mockResolvedValue(defaultRepo);
    let existsCallCount = 0;
    vi.mocked(fs.existsSync).mockImplementation(() => {
      existsCallCount++;
      // call 1: repoPath check -> true
      // call 2: filePath recency check -> false
      // call 3: fileExistedBefore check -> false
      // call 4: fileWrittenByClaude -> false (file still doesn't exist)
      // call 5: dir check -> true
      // call 6: final verification -> true
      if (existsCallCount === 2 || existsCallCount === 3 || existsCallCount === 4) return false;
      return true;
    });
    vi.mocked(runClaude).mockResolvedValue(
      cast({
        exitCode: 0,
        stdout: "# CLAUDE.md content\nSome instructions",
        stderr: "",
      }),
    );

    const runner = createAIFileGenRunner({ repoId: "r1", fileName: "CLAUDE.md" });
    const result = await runner({ onProgress: vi.fn(), signal: new AbortController().signal, sessionId: "s1" });

    expect(fs.writeFileSync).toHaveBeenCalled();
    expect(result.result).toHaveProperty("action", "create");
  });

  it("strips code fences from stdout fallback", async () => {
    vi.mocked(queryOne).mockResolvedValue(defaultRepo);
    let existsCallCount = 0;
    vi.mocked(fs.existsSync).mockImplementation(() => {
      existsCallCount++;
      if (existsCallCount === 2 || existsCallCount === 3 || existsCallCount === 4) return false;
      return true;
    });
    vi.mocked(runClaude).mockResolvedValue(
      cast({
        exitCode: 0,
        stdout: "```markdown\n# Content\n```",
        stderr: "",
      }),
    );

    const runner = createAIFileGenRunner({ repoId: "r1", fileName: "CLAUDE.md" });
    await runner({ onProgress: vi.fn(), signal: new AbortController().signal, sessionId: "s1" });

    expect(fs.writeFileSync).toHaveBeenCalledWith(expect.any(String), "# Content\n", "utf-8");
  });

  it("throws when Claude exits non-zero", async () => {
    vi.mocked(queryOne).mockResolvedValue(defaultRepo);
    let existsCallCount = 0;
    vi.mocked(fs.existsSync).mockImplementation(() => {
      existsCallCount++;
      if (existsCallCount === 2 || existsCallCount === 3) return false;
      return true;
    });
    vi.mocked(runClaude).mockResolvedValue(
      cast({
        exitCode: 1,
        stdout: "",
        stderr: "Claude error",
      }),
    );

    const runner = createAIFileGenRunner({ repoId: "r1", fileName: "CLAUDE.md" });

    await expect(
      runner({ onProgress: vi.fn(), signal: new AbortController().signal, sessionId: "s1" }),
    ).rejects.toThrow("Claude error");
  });

  it("throws when Claude returns empty content and no file written", async () => {
    vi.mocked(queryOne).mockResolvedValue(defaultRepo);
    let existsCallCount = 0;
    vi.mocked(fs.existsSync).mockImplementation(() => {
      existsCallCount++;
      if (existsCallCount === 2 || existsCallCount === 3 || existsCallCount === 4) return false;
      return true;
    });
    vi.mocked(runClaude).mockResolvedValue(
      cast({
        exitCode: 0,
        stdout: "",
        stderr: "",
      }),
    );

    const runner = createAIFileGenRunner({ repoId: "r1", fileName: "CLAUDE.md" });

    await expect(
      runner({ onProgress: vi.fn(), signal: new AbortController().signal, sessionId: "s1" }),
    ).rejects.toThrow("Claude returned empty content");
  });

  it("refreshes AI file findings after success", async () => {
    vi.mocked(queryOne).mockResolvedValue(defaultRepo);
    let existsCallCount = 0;
    vi.mocked(fs.existsSync).mockImplementation(() => {
      existsCallCount++;
      if (existsCallCount === 2 || existsCallCount === 3) return false;
      return true;
    });
    vi.mocked(runClaude).mockResolvedValue(cast({ exitCode: 0, stdout: "", stderr: "" }));

    const runner = createAIFileGenRunner({ repoId: "r1", fileName: "CLAUDE.md" });
    await runner({ onProgress: vi.fn(), signal: new AbortController().signal, sessionId: "s1" });

    expect(refreshAIFileFindings).toHaveBeenCalledWith("r1");
  });

  it("uses update action when specified", async () => {
    vi.mocked(queryOne).mockResolvedValue(defaultRepo);
    let existsCallCount = 0;
    vi.mocked(fs.existsSync).mockImplementation(() => {
      existsCallCount++;
      if (existsCallCount === 2 || existsCallCount === 3) return false;
      return true;
    });
    vi.mocked(runClaude).mockResolvedValue(cast({ exitCode: 0, stdout: "", stderr: "" }));

    const runner = createAIFileGenRunner({ repoId: "r1", fileName: "CLAUDE.md", action: "update" });
    const result = await runner({ onProgress: vi.fn(), signal: new AbortController().signal, sessionId: "s1" });

    expect(result.result).toHaveProperty("action", "update");
    expect(result.result).toHaveProperty("message", "Updated CLAUDE.md");
  });
});
