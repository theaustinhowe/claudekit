import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@claudekit/claude-runner", () => ({
  runClaude: vi.fn().mockResolvedValue({ exitCode: 0, stdout: "fixed", stderr: "" }),
}));

vi.mock("@/lib/actions/auto-fix", () => ({
  saveAutoFixRun: vi.fn().mockResolvedValue("run-1"),
  updateAutoFixRun: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/services/session-manager", () => ({
  setSessionPid: vi.fn(),
}));

vi.mock("@/lib/services/dev-server-manager", () => ({
  getLogs: vi.fn().mockReturnValue(["line1", "line2", "line3"]),
}));

import { runClaude } from "@claudekit/claude-runner";
import { cast } from "@claudekit/test-utils";
import { saveAutoFixRun, updateAutoFixRun } from "@/lib/actions/auto-fix";
import { createAutoFixRunner } from "./auto-fix";

const mockRunClaude = vi.mocked(runClaude);
const mockSaveRun = vi.mocked(saveAutoFixRun);
const mockUpdateRun = vi.mocked(updateAutoFixRun);

function makeContext() {
  return {
    onProgress: vi.fn(),
    signal: new AbortController().signal,
    sessionId: "sess-1",
  };
}

const defaultMetadata = {
  errorMessage: "TypeError: Cannot read property 'map' of undefined",
  errorSignature: "ERR_001",
  attemptNumber: 1,
  projectDir: "/tmp/test-app",
  projectId: "proj-1",
  contextLines: 50,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockRunClaude.mockResolvedValue(cast({ exitCode: 0, stdout: "fixed", stderr: "" }));
  mockSaveRun.mockResolvedValue("run-1");
});

describe("createAutoFixRunner", () => {
  it("returns a function", () => {
    const runner = createAutoFixRunner(defaultMetadata);
    expect(typeof runner).toBe("function");
  });

  it("saves an auto-fix run record", async () => {
    const runner = createAutoFixRunner(defaultMetadata);
    await runner(makeContext());

    expect(mockSaveRun).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "proj-1",
        status: "running",
        errorSignature: "ERR_001",
        errorMessage: "TypeError: Cannot read property 'map' of undefined",
        attemptNumber: 1,
      }),
    );
  });

  it("calls runClaude with correct parameters", async () => {
    const runner = createAutoFixRunner(defaultMetadata);
    await runner(makeContext());

    expect(mockRunClaude).toHaveBeenCalledWith(
      expect.objectContaining({
        cwd: "/tmp/test-app",
        allowedTools: "Write,Edit,Read,Glob,Grep",
        disallowedTools: "Bash",
        timeoutMs: 3 * 60_000,
      }),
    );
  });

  it("updates run status to success on exit code 0", async () => {
    const runner = createAutoFixRunner(defaultMetadata);
    await runner(makeContext());

    expect(mockUpdateRun).toHaveBeenCalledWith(
      "run-1",
      expect.objectContaining({ status: "success", claudeOutput: "fixed" }),
    );
  });

  it("returns runId and success status", async () => {
    const runner = createAutoFixRunner(defaultMetadata);
    const result = await runner(makeContext());

    expect(result).toEqual({ result: { runId: "run-1", status: "success" } });
  });

  it("updates run status to failed on non-zero exit code", async () => {
    mockRunClaude.mockResolvedValue(cast({ exitCode: 1, stdout: "", stderr: "error" }));
    const runner = createAutoFixRunner(defaultMetadata);

    await expect(runner(makeContext())).rejects.toThrow("Claude exited with code 1");
    expect(mockUpdateRun).toHaveBeenCalledWith("run-1", expect.objectContaining({ status: "failed" }));
  });

  it("updates run status to cancelled on AbortError", async () => {
    const controller = new AbortController();
    mockRunClaude.mockImplementation(async () => {
      throw new DOMException("Aborted", "AbortError");
    });
    const runner = createAutoFixRunner(defaultMetadata);

    await expect(runner({ onProgress: vi.fn(), signal: controller.signal, sessionId: "sess-1" })).rejects.toThrow();
    expect(mockUpdateRun).toHaveBeenCalledWith("run-1", expect.objectContaining({ status: "cancelled" }));
  });

  it("updates run status to failed on generic error", async () => {
    mockRunClaude.mockRejectedValue(new Error("Network timeout"));
    const runner = createAutoFixRunner(defaultMetadata);

    await expect(runner(makeContext())).rejects.toThrow("Network timeout");
    expect(mockUpdateRun).toHaveBeenCalledWith(
      "run-1",
      expect.objectContaining({ status: "failed", claudeOutput: "Network timeout" }),
    );
  });

  it("emits progress events for analyzing phase", async () => {
    const runner = createAutoFixRunner(defaultMetadata);
    const ctx = makeContext();
    await runner(ctx);

    expect(ctx.onProgress).toHaveBeenCalledWith(
      expect.objectContaining({ type: "progress", phase: "Analyzing error...", data: { runId: "run-1" } }),
    );
  });

  it("defaults attemptNumber to 1", async () => {
    const runner = createAutoFixRunner({
      ...defaultMetadata,
      attemptNumber: undefined,
    });
    await runner(makeContext());

    expect(mockSaveRun).toHaveBeenCalledWith(expect.objectContaining({ attemptNumber: 1 }));
  });

  it("emits prompt and output phase separators", async () => {
    const runner = createAutoFixRunner(defaultMetadata);
    const ctx = makeContext();
    await runner(ctx);

    expect(ctx.onProgress).toHaveBeenCalledWith(
      expect.objectContaining({ type: "progress", log: "Prompt", logType: "phase-separator" }),
    );
    expect(ctx.onProgress).toHaveBeenCalledWith(
      expect.objectContaining({ type: "progress", log: "Output", logType: "phase-separator" }),
    );
  });
});
