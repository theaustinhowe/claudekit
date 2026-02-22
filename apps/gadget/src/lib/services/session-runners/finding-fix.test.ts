import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs", () => ({
  default: {
    existsSync: vi.fn(() => true),
  },
}));
vi.mock("node:child_process", () => ({
  spawn: vi.fn(() => {
    // biome-ignore lint/suspicious/noExplicitAny: test mock
    const handlers: Record<string, (...args: any[]) => unknown> = {};
    // biome-ignore lint/suspicious/noExplicitAny: test mock
    return {
      on: vi.fn((event: string, handler: (...args: any[]) => unknown) => {
        handlers[event] = handler;
        if (event === "close") {
          setTimeout(() => handler(0), 0);
        }
      }),
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
    };
  }),
}));
vi.mock("@devkit/claude-runner", () => ({
  runClaude: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  getDb: vi.fn(async () => ({})),
  queryOne: vi.fn(),
  queryAll: vi.fn(),
}));
vi.mock("@/lib/logger", () => ({
  createServiceLogger: vi.fn(() => ({
    error: vi.fn(),
    info: vi.fn(),
  })),
}));
vi.mock("@/lib/services/finding-classifier", () => ({
  classifyFinding: vi.fn(),
}));
vi.mock("@/lib/services/finding-prompt-builder", () => ({
  buildFindingsFixPrompt: vi.fn(() => "fix prompt"),
}));
vi.mock("@/lib/services/session-manager", () => ({
  setSessionPid: vi.fn(),
}));
vi.mock("@/lib/utils", () => ({
  expandTilde: vi.fn((p: string) => p),
  parsePolicy: vi.fn((row: Record<string, unknown>) => row),
}));

import fs from "node:fs";
import { runClaude } from "@devkit/claude-runner";
import { queryAll, queryOne } from "@/lib/db";
import { classifyFinding } from "@/lib/services/finding-classifier";
import { createFindingFixRunner } from "./finding-fix";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(fs.existsSync).mockReturnValue(true);
});

describe("finding-fix runner", () => {
  const defaultRepo = { local_path: "/repo", name: "my-repo" };

  it("throws when repo not found", async () => {
    vi.mocked(queryOne).mockResolvedValue(undefined);

    const runner = createFindingFixRunner({ findingIds: ["f1"], repoId: "r1" });

    await expect(
      runner({ onProgress: vi.fn(), signal: new AbortController().signal, sessionId: "s1" }),
    ).rejects.toThrow("Repository not found");
  });

  it("throws when repo path does not exist", async () => {
    vi.mocked(queryOne).mockResolvedValue(defaultRepo);
    vi.mocked(fs.existsSync).mockReturnValue(false);

    const runner = createFindingFixRunner({ findingIds: ["f1"], repoId: "r1" });

    await expect(
      runner({ onProgress: vi.fn(), signal: new AbortController().signal, sessionId: "s1" }),
    ).rejects.toThrow("Repository path does not exist on disk");
  });

  it("throws when no auto-fixable findings", async () => {
    vi.mocked(queryOne).mockResolvedValue(defaultRepo);
    vi.mocked(queryAll).mockResolvedValue([
      { id: "f1", repo_id: "r1", title: "Test finding", suggested_actions: "[]" },
    ]);
    vi.mocked(classifyFinding).mockReturnValue({ autoFixable: false, batchKey: "misc" } as never);

    const runner = createFindingFixRunner({ findingIds: ["f1"], repoId: "r1" });

    await expect(
      runner({ onProgress: vi.fn(), signal: new AbortController().signal, sessionId: "s1" }),
    ).rejects.toThrow("No auto-fixable findings in selection");
  });

  it("processes batches and returns result", async () => {
    vi.mocked(queryOne)
      .mockResolvedValueOnce(defaultRepo)
      // re-audit query returns null
      .mockResolvedValueOnce(null);
    vi.mocked(queryAll).mockResolvedValue([
      { id: "f1", repo_id: "r1", title: "Missing file", suggested_actions: "[]" },
      { id: "f2", repo_id: "r1", title: "Wrong version", suggested_actions: "[]" },
    ]);
    vi.mocked(classifyFinding)
      .mockReturnValueOnce({ autoFixable: true, batchKey: "config" } as never)
      .mockReturnValueOnce({ autoFixable: true, batchKey: "config" } as never)
      // Called again during grouping
      .mockReturnValueOnce({ autoFixable: true, batchKey: "config" } as never)
      .mockReturnValueOnce({ autoFixable: true, batchKey: "config" } as never);
    vi.mocked(runClaude).mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" } as never);

    const onProgress = vi.fn();
    const runner = createFindingFixRunner({ findingIds: ["f1", "f2"], repoId: "r1" });
    const result = await runner({ onProgress, signal: new AbortController().signal, sessionId: "s1" });

    expect(result.result).toEqual({ batchCount: 1, fixableCount: 2 });
    expect(runClaude).toHaveBeenCalledTimes(1);
  });

  it("splits large batches by MAX_BATCH_SIZE", async () => {
    vi.mocked(queryOne).mockResolvedValueOnce(defaultRepo).mockResolvedValueOnce(null);
    const findings = Array.from({ length: 8 }, (_, i) => ({
      id: `f${i}`,
      repo_id: "r1",
      title: `Finding ${i}`,
      suggested_actions: "[]",
    }));
    vi.mocked(queryAll).mockResolvedValue(findings);
    vi.mocked(classifyFinding).mockReturnValue({ autoFixable: true, batchKey: "config" } as never);
    vi.mocked(runClaude).mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" } as never);

    const runner = createFindingFixRunner({ findingIds: findings.map((f) => f.id), repoId: "r1" });
    const result = await runner({ onProgress: vi.fn(), signal: new AbortController().signal, sessionId: "s1" });

    // 8 findings / MAX_BATCH_SIZE(5) = 2 batches
    expect(result.result).toEqual({ batchCount: 2, fixableCount: 8 });
    expect(runClaude).toHaveBeenCalledTimes(2);
  });

  it("emits progress for each batch", async () => {
    vi.mocked(queryOne).mockResolvedValueOnce(defaultRepo).mockResolvedValueOnce(null);
    vi.mocked(queryAll).mockResolvedValue([{ id: "f1", repo_id: "r1", title: "Test", suggested_actions: "[]" }]);
    vi.mocked(classifyFinding).mockReturnValue({ autoFixable: true, batchKey: "deps" } as never);
    vi.mocked(runClaude).mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" } as never);

    const onProgress = vi.fn();
    const runner = createFindingFixRunner({ findingIds: ["f1"], repoId: "r1" });
    await runner({ onProgress, signal: new AbortController().signal, sessionId: "s1" });

    const batchEvents = onProgress.mock.calls.filter(
      ([evt]) => evt.type === "progress" && evt.phase?.startsWith("Batch"),
    );
    expect(batchEvents.length).toBeGreaterThanOrEqual(1);
  });

  it("logs error when batch fails", async () => {
    vi.mocked(queryOne).mockResolvedValueOnce(defaultRepo).mockResolvedValueOnce(null);
    vi.mocked(queryAll).mockResolvedValue([{ id: "f1", repo_id: "r1", title: "Test", suggested_actions: "[]" }]);
    vi.mocked(classifyFinding).mockReturnValue({ autoFixable: true, batchKey: "deps" } as never);
    vi.mocked(runClaude).mockResolvedValue({ exitCode: 1, stdout: "", stderr: "Claude failed" } as never);

    const onProgress = vi.fn();
    const runner = createFindingFixRunner({ findingIds: ["f1"], repoId: "r1" });
    await runner({ onProgress, signal: new AbortController().signal, sessionId: "s1" });

    const failCalls = onProgress.mock.calls.filter(([evt]) => evt.log?.includes("failed"));
    expect(failCalls.length).toBeGreaterThanOrEqual(1);
  });

  it("throws on abort signal", async () => {
    vi.mocked(queryOne).mockResolvedValue(defaultRepo);
    vi.mocked(queryAll).mockResolvedValue([{ id: "f1", repo_id: "r1", title: "Test", suggested_actions: "[]" }]);
    vi.mocked(classifyFinding).mockReturnValue({ autoFixable: true, batchKey: "deps" } as never);

    const controller = new AbortController();
    controller.abort();

    const runner = createFindingFixRunner({ findingIds: ["f1"], repoId: "r1" });

    await expect(runner({ onProgress: vi.fn(), signal: controller.signal, sessionId: "s1" })).rejects.toThrow(
      "Aborted",
    );
  });

  it("calls runClaude with correct tools", async () => {
    vi.mocked(queryOne).mockResolvedValueOnce(defaultRepo).mockResolvedValueOnce(null);
    vi.mocked(queryAll).mockResolvedValue([{ id: "f1", repo_id: "r1", title: "Test", suggested_actions: "[]" }]);
    vi.mocked(classifyFinding).mockReturnValue({ autoFixable: true, batchKey: "deps" } as never);
    vi.mocked(runClaude).mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" } as never);

    const runner = createFindingFixRunner({ findingIds: ["f1"], repoId: "r1" });
    await runner({ onProgress: vi.fn(), signal: new AbortController().signal, sessionId: "s1" });

    expect(runClaude).toHaveBeenCalledWith(
      expect.objectContaining({
        allowedTools: "Write,Read,Glob,Grep",
        disallowedTools: "Bash,Edit",
      }),
    );
  });
});
