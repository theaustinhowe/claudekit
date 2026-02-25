import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@claudekit/claude-runner", () => ({
  runClaude: vi.fn().mockResolvedValue({ exitCode: 0, stdout: "response text", stderr: "" }),
}));

vi.mock("@/lib/actions/generator-projects", () => ({
  getGeneratorProject: vi.fn().mockResolvedValue(null),
  createDesignMessage: vi.fn().mockResolvedValue({ id: "msg-1" }),
}));

vi.mock("@/lib/actions/upgrade-tasks", () => ({
  getUpgradeTasks: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/lib/services/session-manager", () => ({
  setSessionPid: vi.fn(),
}));

vi.mock("@/lib/services/task-mutation-parser", () => ({
  parseTaskMutations: vi.fn().mockReturnValue({ cleanContent: "", mutations: null }),
  applyTaskMutations: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/utils", () => ({
  expandTilde: vi.fn((p: string) => p.replace("~", "/Users/testuser")),
}));

import { runClaude } from "@claudekit/claude-runner";
import { createDesignMessage, getGeneratorProject } from "@/lib/actions/generator-projects";
import { getUpgradeTasks } from "@/lib/actions/upgrade-tasks";
import { applyTaskMutations, parseTaskMutations } from "@/lib/services/task-mutation-parser";
import type { GeneratorProject } from "@/lib/types";
import { createChatRunner } from "./chat";

const mockRunClaude = vi.mocked(runClaude);
const mockGetProject = vi.mocked(getGeneratorProject);
const mockCreateMessage = vi.mocked(createDesignMessage);
const mockGetUpgradeTasks = vi.mocked(getUpgradeTasks);
const mockParseTaskMutations = vi.mocked(parseTaskMutations);
const mockApplyTaskMutations = vi.mocked(applyTaskMutations);

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
    status: "designing",
    active_spec_version: 0,
    scaffold_logs: null,
    design_vibes: [],
    inspiration_urls: [],
    color_scheme: {},
    custom_features: [],
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
  mockRunClaude.mockResolvedValue({ exitCode: 0, stdout: "response text", stderr: "" } as never);
  mockParseTaskMutations.mockReturnValue({ cleanContent: "", mutations: null });
});

describe("createChatRunner", () => {
  it("returns a function", () => {
    const runner = createChatRunner({ message: "Hello" }, "proj-1");
    expect(typeof runner).toBe("function");
  });

  it("throws when project not found", async () => {
    mockGetProject.mockResolvedValue(null);
    const runner = createChatRunner({ message: "Hello" }, "proj-1");
    await expect(runner(makeContext())).rejects.toThrow("Project not found");
  });

  it("saves user and assistant messages", async () => {
    const runner = createChatRunner({ message: "Fix the button" }, "proj-1");
    await runner(makeContext());

    // User message
    expect(mockCreateMessage).toHaveBeenCalledWith(
      expect.objectContaining({ project_id: "proj-1", role: "user", content: "Fix the button" }),
    );
    // Assistant message
    expect(mockCreateMessage).toHaveBeenCalledWith(
      expect.objectContaining({ project_id: "proj-1", role: "assistant" }),
    );
  });

  it("calls runClaude with correct cwd", async () => {
    const runner = createChatRunner({ message: "Hello" }, "proj-1");
    await runner(makeContext());

    expect(mockRunClaude).toHaveBeenCalledWith(expect.objectContaining({ cwd: "/tmp/test-app" }));
  });

  it("returns suggestions and content in result", async () => {
    const runner = createChatRunner({ message: "Hello" }, "proj-1");
    const result = await runner(makeContext());

    expect(result.result).toHaveProperty("suggestions");
    expect(result.result).toHaveProperty("content");
    expect(result.result).toHaveProperty("taskMutationsApplied");
  });

  it("includes design context when design_vibes are set", async () => {
    mockGetProject.mockResolvedValue(fakeProject({ design_vibes: ["minimal", "dark"] }));
    const runner = createChatRunner({ message: "Hello" }, "proj-1");
    await runner(makeContext());

    const callArgs = mockRunClaude.mock.calls[0][0];
    expect(callArgs.prompt).toContain("minimal, dark");
  });

  it("includes color scheme in design context", async () => {
    mockGetProject.mockResolvedValue(fakeProject({ color_scheme: { primary: "#000", accent: "#fff" } }));
    const runner = createChatRunner({ message: "Hello" }, "proj-1");
    await runner(makeContext());

    const callArgs = mockRunClaude.mock.calls[0][0];
    expect(callArgs.prompt).toContain("primary: #000");
    expect(callArgs.prompt).toContain("accent: #fff");
  });

  it("includes inspiration URLs in design context", async () => {
    mockGetProject.mockResolvedValue(fakeProject({ inspiration_urls: ["https://example.com"] }));
    const runner = createChatRunner({ message: "Hello" }, "proj-1");
    await runner(makeContext());

    const callArgs = mockRunClaude.mock.calls[0][0];
    expect(callArgs.prompt).toContain("https://example.com");
  });

  describe("upgrade mode", () => {
    it("fetches upgrade tasks when upgradeMode is true", async () => {
      mockGetUpgradeTasks.mockResolvedValue([
        { id: "t1", title: "Task 1", description: "Desc", status: "pending" },
      ] as never);
      const runner = createChatRunner({ message: "Hello", upgradeMode: true }, "proj-1");
      await runner(makeContext());

      expect(mockGetUpgradeTasks).toHaveBeenCalledWith("proj-1");
      const callArgs = mockRunClaude.mock.calls[0][0];
      expect(callArgs.prompt).toContain("Upgrade Tasks");
      expect(callArgs.prompt).toContain("Task 1");
    });

    it("applies task mutations when present", async () => {
      mockParseTaskMutations.mockReturnValue({
        cleanContent: "cleaned",
        mutations: { updates: [], additions: [], removals: [] },
      } as never);
      const runner = createChatRunner({ message: "Hello", upgradeMode: true }, "proj-1");
      const result = await runner(makeContext());

      expect(mockApplyTaskMutations).toHaveBeenCalledWith("proj-1", expect.any(Object));
      expect(result.result?.taskMutationsApplied).toBe(true);
    });

    it("does not apply mutations when not in upgrade mode", async () => {
      const runner = createChatRunner({ message: "Hello" }, "proj-1");
      await runner(makeContext());

      expect(mockParseTaskMutations).not.toHaveBeenCalled();
    });
  });

  it("emits progress events for prompt lines", async () => {
    const runner = createChatRunner({ message: "Hello" }, "proj-1");
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
