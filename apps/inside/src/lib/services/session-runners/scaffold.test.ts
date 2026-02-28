import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs", () => ({
  default: { mkdirSync: vi.fn() },
  mkdirSync: vi.fn(),
}));

vi.mock("@claudekit/claude-runner", () => ({
  runClaude: vi.fn().mockResolvedValue({ exitCode: 0, stdout: "done", stderr: "" }),
}));

vi.mock("@/lib/actions/generator-projects", () => ({
  getGeneratorProject: vi.fn().mockResolvedValue(null),
  updateGeneratorProject: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/services/interface-design", () => ({
  buildInterfaceDesignSystem: vi.fn().mockReturnValue("design-system-content"),
  writeInterfaceDesignFile: vi.fn(),
  writeSkillFiles: vi.fn(),
}));

vi.mock("@/lib/services/scaffold-prompt", () => ({
  buildPrototypePrompt: vi.fn().mockReturnValue("prototype prompt content"),
}));

vi.mock("@/lib/services/session-manager", () => ({
  setSessionPid: vi.fn(),
}));

vi.mock("@/lib/utils", () => ({
  expandTilde: vi.fn((p: string) => p.replace("~", "/Users/testuser")),
}));

import { runClaude } from "@claudekit/claude-runner";
import { getGeneratorProject, updateGeneratorProject } from "@/lib/actions/generator-projects";
import type { GeneratorProject } from "@/lib/types";
import { createScaffoldRunner } from "./scaffold";

const mockRunClaude = vi.mocked(runClaude);
const mockGetProject = vi.mocked(getGeneratorProject);
const mockUpdateProject = vi.mocked(updateGeneratorProject);

function fakeProject(overrides: Partial<GeneratorProject> = {}): GeneratorProject {
  return {
    id: "proj-1",
    title: "Test App",
    idea_description: "A test app",
    platform: "nextjs",
    services: [],
    constraints: [],
    project_name: "test-app",
    project_path: "/tmp",
    package_manager: "pnpm",
    status: "scaffolding",
    active_spec_version: 0,
    scaffold_logs: null,
    design_vibes: [],
    inspiration_urls: [],
    color_scheme: {},
    custom_features: [],
    tool_versions: {},
    ...overrides,
  } as GeneratorProject;
}

function makeContext() {
  return {
    onProgress: vi.fn(),
    signal: new AbortController().signal,
    sessionId: "sess-1",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetProject.mockResolvedValue(fakeProject());
  mockRunClaude.mockResolvedValue({ exitCode: 0, stdout: "done", stderr: "" } as never);
});

describe("createScaffoldRunner", () => {
  it("returns a function", () => {
    const runner = createScaffoldRunner({}, "proj-1");
    expect(typeof runner).toBe("function");
  });

  it("throws when project not found", async () => {
    mockGetProject.mockResolvedValue(null);
    const runner = createScaffoldRunner({}, "proj-1");
    await expect(runner(makeContext())).rejects.toThrow("Project not found");
  });

  it("throws when project status is not scaffolding (non-retry)", async () => {
    mockGetProject.mockResolvedValue(fakeProject({ status: "designing" }));
    const runner = createScaffoldRunner({}, "proj-1");
    await expect(runner(makeContext())).rejects.toThrow('Project status is "designing"');
  });

  it("runs successfully and updates status to designing", async () => {
    const runner = createScaffoldRunner({}, "proj-1");
    const ctx = makeContext();
    const result = await runner(ctx);

    expect(mockRunClaude).toHaveBeenCalledTimes(1);
    expect(mockUpdateProject).toHaveBeenCalledWith("proj-1", expect.objectContaining({ status: "designing" }));
    expect(result).toEqual({ result: { exitCode: 0 } });
  });

  it("updates status to error when Claude exits non-zero", async () => {
    mockRunClaude.mockResolvedValue({ exitCode: 1, stdout: "", stderr: "fail" } as never);
    const runner = createScaffoldRunner({}, "proj-1");
    await expect(runner(makeContext())).rejects.toThrow("Claude exited with code 1");
    expect(mockUpdateProject).toHaveBeenCalledWith("proj-1", expect.objectContaining({ status: "error" }));
  });

  it("emits progress events including prompt lines", async () => {
    const runner = createScaffoldRunner({}, "proj-1");
    const ctx = makeContext();
    await runner(ctx);

    // Should emit phase separators
    expect(ctx.onProgress).toHaveBeenCalledWith(
      expect.objectContaining({ type: "progress", log: "Prompt", logType: "phase-separator" }),
    );
    expect(ctx.onProgress).toHaveBeenCalledWith(
      expect.objectContaining({ type: "progress", log: "Output", logType: "phase-separator" }),
    );
  });

  describe("retry mode", () => {
    it("allows retry when status is scaffolding", async () => {
      mockGetProject.mockResolvedValue(fakeProject({ status: "scaffolding" }));
      const runner = createScaffoldRunner({ retry: true }, "proj-1");
      await runner(makeContext());
      expect(mockUpdateProject).toHaveBeenCalledWith("proj-1", { status: "scaffolding" });
    });

    it("allows retry when status is error", async () => {
      mockGetProject.mockResolvedValue(fakeProject({ status: "error" }));
      const runner = createScaffoldRunner({ retry: true }, "proj-1");
      await runner(makeContext());
      expect(mockUpdateProject).toHaveBeenCalledWith("proj-1", { status: "scaffolding" });
    });

    it("throws on retry when status is designing", async () => {
      mockGetProject.mockResolvedValue(fakeProject({ status: "designing" }));
      const runner = createScaffoldRunner({ retry: true }, "proj-1");
      await expect(runner(makeContext())).rejects.toThrow('Cannot retry: project status is "designing"');
    });

    it("builds retry context from existing scaffold_logs", async () => {
      mockGetProject.mockResolvedValue(
        fakeProject({
          status: "scaffolding",
          scaffold_logs: [
            { log: "Write  src/index.ts", logType: "status" },
            { log: "Edit  src/app.ts", logType: "status" },
            { log: "Bash  npm install", logType: "status" },
          ],
        }),
      );
      const runner = createScaffoldRunner({ retry: true }, "proj-1");
      await runner(makeContext());

      // The prompt passed to runClaude should include retry prefix
      const callArgs = mockRunClaude.mock.calls[0][0];
      expect(callArgs.prompt).toContain("IMPORTANT: This is a retry");
      expect(callArgs.prompt).toContain("Previous Run Summary");
    });

    it("uses generic retry prefix when scaffold_logs is empty", async () => {
      mockGetProject.mockResolvedValue(
        fakeProject({
          status: "error",
          scaffold_logs: [],
        }),
      );
      const runner = createScaffoldRunner({ retry: true }, "proj-1");
      await runner(makeContext());

      const callArgs = mockRunClaude.mock.calls[0][0];
      expect(callArgs.prompt).toContain("IMPORTANT: This is a retry");
      expect(callArgs.prompt).toContain("partially completed");
    });

    it("uses generic retry prefix when scaffold_logs is null", async () => {
      mockGetProject.mockResolvedValue(
        fakeProject({
          status: "error",
          scaffold_logs: null,
        }),
      );
      const runner = createScaffoldRunner({ retry: true }, "proj-1");
      await runner(makeContext());

      const callArgs = mockRunClaude.mock.calls[0][0];
      expect(callArgs.prompt).toContain("IMPORTANT: This is a retry");
    });
  });
});
