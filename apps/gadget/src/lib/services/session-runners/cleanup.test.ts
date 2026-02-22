import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs", () => ({
  default: {
    existsSync: vi.fn(() => true),
    unlinkSync: vi.fn(),
  },
}));
vi.mock("@devkit/claude-runner", () => ({
  runClaude: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  getDb: vi.fn(async () => ({})),
  queryOne: vi.fn(),
}));
vi.mock("@/lib/actions/settings", () => ({
  getCleanupFiles: vi.fn(),
}));
vi.mock("@/lib/services/process-runner", () => ({
  runProcess: vi.fn(),
}));
vi.mock("@/lib/services/session-manager", () => ({
  setSessionPid: vi.fn(),
}));

import fs from "node:fs";
import { runClaude } from "@devkit/claude-runner";
import { getCleanupFiles } from "@/lib/actions/settings";
import { queryOne } from "@/lib/db";
import { runProcess } from "@/lib/services/process-runner";
import { createCleanupRunner } from "./cleanup";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("cleanup runner", () => {
  function setupHappyPath() {
    vi.mocked(queryOne).mockResolvedValue({ local_path: "/repo" });
    vi.mocked(getCleanupFiles).mockResolvedValue([".eslintrc.js", ".prettierrc"]);
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(runProcess)
      // knip
      .mockResolvedValueOnce({ exitCode: 0 })
      // git commit
      .mockResolvedValueOnce({ exitCode: 0 });
    vi.mocked(runClaude).mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" } as never);
  }

  it("throws when repo not found", async () => {
    vi.mocked(queryOne).mockResolvedValue(undefined);

    const runner = createCleanupRunner({ repoId: "r1" });

    await expect(
      runner({ onProgress: vi.fn(), signal: new AbortController().signal, sessionId: "s1" }),
    ).rejects.toThrow("Repo not found");
  });

  it("throws when repo path does not exist", async () => {
    vi.mocked(queryOne).mockResolvedValue({ local_path: "/repo" });
    vi.mocked(fs.existsSync).mockReturnValue(false);

    const runner = createCleanupRunner({ repoId: "r1" });

    await expect(
      runner({ onProgress: vi.fn(), signal: new AbortController().signal, sessionId: "s1" }),
    ).rejects.toThrow("Repo path does not exist");
  });

  it("removes cleanup files and returns removedCount", async () => {
    setupHappyPath();

    const onProgress = vi.fn();
    const runner = createCleanupRunner({ repoId: "r1" });
    const result = await runner({ onProgress, signal: new AbortController().signal, sessionId: "s1" });

    expect(fs.unlinkSync).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ result: { removedCount: 2 } });
  });

  it("emits progress for each removed file", async () => {
    setupHappyPath();

    const onProgress = vi.fn();
    const runner = createCleanupRunner({ repoId: "r1" });
    await runner({ onProgress, signal: new AbortController().signal, sessionId: "s1" });

    const phases = onProgress.mock.calls
      .filter(([evt]) => evt.type === "progress" && evt.phase)
      .map(([evt]) => evt.phase);
    expect(phases).toContain("Removed .eslintrc.js");
    expect(phases).toContain("Removed .prettierrc");
  });

  it("handles file removal errors gracefully", async () => {
    vi.mocked(queryOne).mockResolvedValue({ local_path: "/repo" });
    vi.mocked(getCleanupFiles).mockResolvedValue([".eslintrc.js"]);
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.unlinkSync).mockImplementation(() => {
      throw new Error("permission denied");
    });
    vi.mocked(runProcess).mockResolvedValueOnce({ exitCode: 0 }).mockResolvedValueOnce({ exitCode: 0 });
    vi.mocked(runClaude).mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" } as never);

    const onProgress = vi.fn();
    const runner = createCleanupRunner({ repoId: "r1" });
    const result = await runner({ onProgress, signal: new AbortController().signal, sessionId: "s1" });

    expect(result).toEqual({ result: { removedCount: 0 } });
    const logCalls = onProgress.mock.calls.filter(([evt]) => evt.type === "log" && evt.log?.includes("Failed to remove"));
    expect(logCalls.length).toBe(1);
  });

  it("runs knip --fix via runProcess", async () => {
    setupHappyPath();

    const runner = createCleanupRunner({ repoId: "r1" });
    await runner({ onProgress: vi.fn(), signal: new AbortController().signal, sessionId: "s1" });

    expect(runProcess).toHaveBeenCalledWith(
      expect.objectContaining({
        command: "npx knip --fix --no-progress",
      }),
    );
  });

  it("continues when knip fails with non-abort error", async () => {
    vi.mocked(queryOne).mockResolvedValue({ local_path: "/repo" });
    vi.mocked(getCleanupFiles).mockResolvedValue([]);
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(runProcess)
      .mockRejectedValueOnce(new Error("npx not found")) // knip fails
      .mockResolvedValueOnce({ exitCode: 0 }); // git commit
    vi.mocked(runClaude).mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" } as never);

    const onProgress = vi.fn();
    const runner = createCleanupRunner({ repoId: "r1" });
    const result = await runner({ onProgress, signal: new AbortController().signal, sessionId: "s1" });

    expect(result).toEqual({ result: { removedCount: 0 } });
  });

  it("re-throws AbortError from knip", async () => {
    vi.mocked(queryOne).mockResolvedValue({ local_path: "/repo" });
    vi.mocked(getCleanupFiles).mockResolvedValue([]);
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(runProcess).mockRejectedValueOnce(new DOMException("Aborted", "AbortError"));

    const runner = createCleanupRunner({ repoId: "r1" });

    await expect(
      runner({ onProgress: vi.fn(), signal: new AbortController().signal, sessionId: "s1" }),
    ).rejects.toThrow("Aborted");
  });

  it("calls runClaude for indirection analysis", async () => {
    setupHappyPath();

    const runner = createCleanupRunner({ repoId: "r1" });
    await runner({ onProgress: vi.fn(), signal: new AbortController().signal, sessionId: "s1" });

    expect(runClaude).toHaveBeenCalledWith(
      expect.objectContaining({
        allowedTools: "Write,Edit,Read,Glob,Grep",
        disallowedTools: "Bash",
      }),
    );
  });

  it("continues when indirection analysis fails with non-abort error", async () => {
    vi.mocked(queryOne).mockResolvedValue({ local_path: "/repo" });
    vi.mocked(getCleanupFiles).mockResolvedValue([]);
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(runProcess)
      .mockResolvedValueOnce({ exitCode: 0 }) // knip
      .mockResolvedValueOnce({ exitCode: 0 }); // git commit
    vi.mocked(runClaude).mockRejectedValue(new Error("Claude timeout"));

    const onProgress = vi.fn();
    const runner = createCleanupRunner({ repoId: "r1" });
    const result = await runner({ onProgress, signal: new AbortController().signal, sessionId: "s1" });

    expect(result).toEqual({ result: { removedCount: 0 } });
  });

  it("throws abort signal during file cleanup loop", async () => {
    vi.mocked(queryOne).mockResolvedValue({ local_path: "/repo" });
    vi.mocked(getCleanupFiles).mockResolvedValue([".eslintrc.js"]);
    vi.mocked(fs.existsSync).mockReturnValue(true);

    const controller = new AbortController();
    controller.abort();

    const runner = createCleanupRunner({ repoId: "r1" });

    await expect(
      runner({ onProgress: vi.fn(), signal: controller.signal, sessionId: "s1" }),
    ).rejects.toThrow("Aborted");
  });

  it("handles git commit error gracefully", async () => {
    vi.mocked(queryOne).mockResolvedValue({ local_path: "/repo" });
    vi.mocked(getCleanupFiles).mockResolvedValue([]);
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(runProcess)
      .mockResolvedValueOnce({ exitCode: 0 }) // knip
      .mockRejectedValueOnce(new Error("git error")); // git commit fails
    vi.mocked(runClaude).mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" } as never);

    const onProgress = vi.fn();
    const runner = createCleanupRunner({ repoId: "r1" });
    const result = await runner({ onProgress, signal: new AbortController().signal, sessionId: "s1" });

    expect(result).toEqual({ result: { removedCount: 0 } });
  });
});
