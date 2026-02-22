import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs", () => ({
  default: {
    mkdirSync: vi.fn(),
    existsSync: vi.fn(() => true),
  },
}));
vi.mock("@claudekit/claude-runner", () => ({
  runClaude: vi.fn(),
}));
vi.mock("@/lib/actions/generator-projects", () => ({
  getGeneratorProject: vi.fn(),
  updateGeneratorProject: vi.fn(),
}));
vi.mock("@/lib/services/interface-design", () => ({
  buildInterfaceDesignSystem: vi.fn(() => "design system content"),
  writeInterfaceDesignFile: vi.fn(),
  writeSkillFiles: vi.fn(),
}));
vi.mock("@/lib/services/scaffold-prompt", () => ({
  buildPrototypePrompt: vi.fn(() => "scaffold prompt"),
}));
vi.mock("@/lib/services/session-manager", () => ({
  setSessionPid: vi.fn(),
}));
vi.mock("@/lib/utils", () => ({
  expandTilde: vi.fn((p: string) => p),
}));

import fs from "node:fs";
import { runClaude } from "@claudekit/claude-runner";
import { getGeneratorProject, updateGeneratorProject } from "@/lib/actions/generator-projects";
import { buildInterfaceDesignSystem, writeInterfaceDesignFile, writeSkillFiles } from "@/lib/services/interface-design";
import { createScaffoldRunner } from "./scaffold";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("scaffold runner", () => {
  const defaultProject = {
    project_path: "/projects",
    project_name: "my-app",
    status: "scaffolding",
    scaffold_logs: null,
  };

  function setupHappyPath() {
    vi.mocked(getGeneratorProject).mockResolvedValue(defaultProject as never);
    vi.mocked(runClaude).mockResolvedValue({
      exitCode: 0,
      stdout: "Scaffold complete",
      stderr: "",
    } as never);
  }

  it("throws when project not found", async () => {
    vi.mocked(getGeneratorProject).mockResolvedValue(null);

    const runner = createScaffoldRunner({}, "proj1");

    await expect(
      runner({ onProgress: vi.fn(), signal: new AbortController().signal, sessionId: "s1" }),
    ).rejects.toThrow("Project not found");
  });

  it("throws when project status is not scaffolding", async () => {
    vi.mocked(getGeneratorProject).mockResolvedValue({
      ...defaultProject,
      status: "designing",
    } as never);

    const runner = createScaffoldRunner({}, "proj1");

    await expect(
      runner({ onProgress: vi.fn(), signal: new AbortController().signal, sessionId: "s1" }),
    ).rejects.toThrow('Project status is "designing", expected "scaffolding"');
  });

  it("creates project directory", async () => {
    setupHappyPath();

    const runner = createScaffoldRunner({}, "proj1");
    await runner({ onProgress: vi.fn(), signal: new AbortController().signal, sessionId: "s1" });

    expect(fs.mkdirSync).toHaveBeenCalledWith(expect.stringContaining("my-app"), { recursive: true });
  });

  it("writes interface design system files", async () => {
    setupHappyPath();

    const runner = createScaffoldRunner({}, "proj1");
    await runner({ onProgress: vi.fn(), signal: new AbortController().signal, sessionId: "s1" });

    expect(buildInterfaceDesignSystem).toHaveBeenCalledWith(defaultProject);
    expect(writeInterfaceDesignFile).toHaveBeenCalled();
    expect(writeSkillFiles).toHaveBeenCalled();
  });

  it("calls runClaude with scaffold prompt and full tools", async () => {
    setupHappyPath();

    const runner = createScaffoldRunner({}, "proj1");
    await runner({ onProgress: vi.fn(), signal: new AbortController().signal, sessionId: "s1" });

    expect(runClaude).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: "scaffold prompt",
        allowedTools: "Write,Edit,Bash,Read,Glob,Grep,WebFetch",
        disallowedTools: "",
        timeoutMs: 15 * 60_000,
      }),
    );
  });

  it("updates project to designing status on success", async () => {
    setupHappyPath();

    const runner = createScaffoldRunner({}, "proj1");
    await runner({ onProgress: vi.fn(), signal: new AbortController().signal, sessionId: "s1" });

    expect(updateGeneratorProject).toHaveBeenCalledWith("proj1", expect.objectContaining({ status: "designing" }));
  });

  it("updates project to error status on Claude failure", async () => {
    vi.mocked(getGeneratorProject).mockResolvedValue(defaultProject as never);
    vi.mocked(runClaude).mockResolvedValue({
      exitCode: 1,
      stdout: "",
      stderr: "Failed",
    } as never);

    const runner = createScaffoldRunner({}, "proj1");

    await expect(
      runner({ onProgress: vi.fn(), signal: new AbortController().signal, sessionId: "s1" }),
    ).rejects.toThrow("Claude exited with code 1");

    expect(updateGeneratorProject).toHaveBeenCalledWith("proj1", expect.objectContaining({ status: "error" }));
  });

  it("returns exit code in result", async () => {
    setupHappyPath();

    const runner = createScaffoldRunner({}, "proj1");
    const result = await runner({ onProgress: vi.fn(), signal: new AbortController().signal, sessionId: "s1" });

    expect(result).toEqual({ result: { exitCode: 0 } });
  });

  it("collects scaffold logs", async () => {
    vi.mocked(getGeneratorProject).mockResolvedValue(defaultProject as never);
    // biome-ignore lint/suspicious/noExplicitAny: test mock
    vi.mocked(runClaude).mockImplementation(async (opts: any) => {
      const onProgressFn = opts.onProgress as (event: Record<string, unknown>) => void;
      onProgressFn({ log: "Write  src/index.ts", logType: "tool", message: "" });
      onProgressFn({ log: "Bash  npm install", logType: "tool", message: "" });
      return { exitCode: 0, stdout: "", stderr: "" };
    });

    const runner = createScaffoldRunner({}, "proj1");
    await runner({ onProgress: vi.fn(), signal: new AbortController().signal, sessionId: "s1" });

    expect(updateGeneratorProject).toHaveBeenCalledWith(
      "proj1",
      expect.objectContaining({
        scaffold_logs: expect.arrayContaining([expect.objectContaining({ log: "Write  src/index.ts" })]),
      }),
    );
  });

  // Retry tests
  it("allows retry when status is scaffolding", async () => {
    vi.mocked(getGeneratorProject).mockResolvedValue({
      ...defaultProject,
      status: "scaffolding",
    } as never);
    vi.mocked(runClaude).mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" } as never);

    const runner = createScaffoldRunner({ retry: true }, "proj1");
    const result = await runner({ onProgress: vi.fn(), signal: new AbortController().signal, sessionId: "s1" });

    expect(result).toEqual({ result: { exitCode: 0 } });
  });

  it("allows retry when status is error", async () => {
    vi.mocked(getGeneratorProject).mockResolvedValue({
      ...defaultProject,
      status: "error",
    } as never);
    vi.mocked(runClaude).mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" } as never);

    const runner = createScaffoldRunner({ retry: true }, "proj1");
    const result = await runner({ onProgress: vi.fn(), signal: new AbortController().signal, sessionId: "s1" });

    expect(result).toEqual({ result: { exitCode: 0 } });
  });

  it("throws retry when status is not scaffolding or error", async () => {
    vi.mocked(getGeneratorProject).mockResolvedValue({
      ...defaultProject,
      status: "designing",
    } as never);

    const runner = createScaffoldRunner({ retry: true }, "proj1");

    await expect(
      runner({ onProgress: vi.fn(), signal: new AbortController().signal, sessionId: "s1" }),
    ).rejects.toThrow('Cannot retry: project status is "designing"');
  });

  it("includes retry prefix in prompt with scaffold logs context", async () => {
    vi.mocked(getGeneratorProject).mockResolvedValue({
      ...defaultProject,
      status: "scaffolding",
      scaffold_logs: [
        { log: "Write  src/index.ts", logType: "tool" },
        { log: "Edit  src/app.tsx", logType: "tool" },
        { log: "Bash  npm install", logType: "tool" },
      ],
    } as never);
    vi.mocked(runClaude).mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" } as never);

    const runner = createScaffoldRunner({ retry: true }, "proj1");
    await runner({ onProgress: vi.fn(), signal: new AbortController().signal, sessionId: "s1" });

    expect(runClaude).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining("IMPORTANT: This is a retry"),
      }),
    );
  });

  it("sets status back to scaffolding on retry", async () => {
    vi.mocked(getGeneratorProject).mockResolvedValue({
      ...defaultProject,
      status: "error",
    } as never);
    vi.mocked(runClaude).mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" } as never);

    const runner = createScaffoldRunner({ retry: true }, "proj1");
    await runner({ onProgress: vi.fn(), signal: new AbortController().signal, sessionId: "s1" });

    // First call to updateGeneratorProject is to set status to scaffolding
    const firstCall = vi.mocked(updateGeneratorProject).mock.calls[0];
    expect(firstCall[1]).toEqual({ status: "scaffolding" });
  });

  it("emits progress events from Claude onProgress", async () => {
    vi.mocked(getGeneratorProject).mockResolvedValue(defaultProject as never);
    // biome-ignore lint/suspicious/noExplicitAny: test mock
    vi.mocked(runClaude).mockImplementation(async (opts: any) => {
      const onProgressFn = opts.onProgress as (event: Record<string, unknown>) => void;
      onProgressFn({ log: "step 1", logType: "status", message: "doing step 1" });
      return { exitCode: 0, stdout: "", stderr: "" };
    });

    const onProgress = vi.fn();
    const runner = createScaffoldRunner({}, "proj1");
    await runner({ onProgress, signal: new AbortController().signal, sessionId: "s1" });

    expect(onProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "progress",
        log: "step 1",
      }),
    );
  });
});
