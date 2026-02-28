import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:child_process", () => ({
  execSync: vi.fn(),
}));

vi.mock("@claudekit/claude-runner", () => ({
  runClaude: vi
    .fn()
    .mockResolvedValue({ exitCode: 0, stdout: '[ { "title": "Task 1", "description": "Desc" } ]', stderr: "" }),
}));

vi.mock("@/lib/actions/generator-projects", () => ({
  getGeneratorProject: vi.fn().mockResolvedValue(null),
  updateGeneratorProject: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/actions/upgrade-tasks", () => ({
  createUpgradeTasks: vi.fn().mockResolvedValue([{ id: "t1", title: "Task 1" }]),
  deleteUpgradeTasks: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/services/git-utils", () => ({
  safeGitCommit: vi.fn().mockReturnValue({ committed: true }),
}));

vi.mock("@/lib/services/scaffold-prompt", () => ({
  buildImplementationPrompt: vi.fn().mockReturnValue("generated impl prompt"),
  buildUpgradePlanPrompt: vi.fn().mockReturnValue("upgrade plan prompt"),
}));

vi.mock("@/lib/services/session-manager", () => ({
  setSessionPid: vi.fn(),
  setCleanupFn: vi.fn(),
}));

vi.mock("@/lib/utils", () => ({
  expandTilde: vi.fn((p: string) => p.replace("~", "/Users/testuser")),
}));

import { runClaude } from "@claudekit/claude-runner";
import { getGeneratorProject, updateGeneratorProject } from "@/lib/actions/generator-projects";
import { createUpgradeTasks, deleteUpgradeTasks } from "@/lib/actions/upgrade-tasks";
import { safeGitCommit } from "@/lib/services/git-utils";
import { buildImplementationPrompt } from "@/lib/services/scaffold-prompt";
import { setCleanupFn } from "@/lib/services/session-manager";
import type { GeneratorProject } from "@/lib/types";
import { createUpgradeInitRunner } from "./upgrade-init";

const mockRunClaude = vi.mocked(runClaude);
const mockGetProject = vi.mocked(getGeneratorProject);
const mockUpdateProject = vi.mocked(updateGeneratorProject);
const mockCreateUpgradeTasks = vi.mocked(createUpgradeTasks);
const mockDeleteUpgradeTasks = vi.mocked(deleteUpgradeTasks);
const mockSafeGitCommit = vi.mocked(safeGitCommit);
const mockBuildImplPrompt = vi.mocked(buildImplementationPrompt);
const mockSetCleanupFn = vi.mocked(setCleanupFn);

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
    implementation_prompt: "existing impl prompt",
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
  mockRunClaude.mockResolvedValue({
    exitCode: 0,
    stdout: '[{ "title": "Task 1", "description": "Desc" }]',
    stderr: "",
  } as never);
  mockSafeGitCommit.mockReturnValue({ committed: true } as never);
  mockCreateUpgradeTasks.mockResolvedValue([{ id: "t1", title: "Task 1" }] as never);
});

describe("createUpgradeInitRunner", () => {
  it("returns a function", () => {
    const runner = createUpgradeInitRunner({}, "proj-1");
    expect(typeof runner).toBe("function");
  });

  it("throws when project not found", async () => {
    mockGetProject.mockResolvedValue(null);
    const runner = createUpgradeInitRunner({}, "proj-1");
    await expect(runner(makeContext())).rejects.toThrow("Project not found");
  });

  it("throws when project status is not designing or scaffolding", async () => {
    mockGetProject.mockResolvedValue(fakeProject({ status: "upgrading" }));
    const runner = createUpgradeInitRunner({}, "proj-1");
    await expect(runner(makeContext())).rejects.toThrow('Cannot upgrade: project status is "upgrading"');
  });

  it("allows designing status", async () => {
    mockGetProject.mockResolvedValue(fakeProject({ status: "designing" }));
    const runner = createUpgradeInitRunner({}, "proj-1");
    const result = await runner(makeContext());
    expect(result.result).toHaveProperty("tasks");
  });

  it("allows scaffolding status", async () => {
    mockGetProject.mockResolvedValue(fakeProject({ status: "scaffolding" }));
    const runner = createUpgradeInitRunner({}, "proj-1");
    const result = await runner(makeContext());
    expect(result.result).toHaveProperty("tasks");
  });

  it("registers cleanup function", async () => {
    const runner = createUpgradeInitRunner({}, "proj-1");
    await runner(makeContext());

    expect(mockSetCleanupFn).toHaveBeenCalledWith("sess-1", expect.any(Function));
  });

  it("sets project status to upgrading", async () => {
    const runner = createUpgradeInitRunner({}, "proj-1");
    await runner(makeContext());

    expect(mockUpdateProject).toHaveBeenCalledWith("proj-1", { status: "upgrading" });
  });

  it("deletes existing tasks before creating new ones", async () => {
    const runner = createUpgradeInitRunner({}, "proj-1");
    await runner(makeContext());

    expect(mockDeleteUpgradeTasks).toHaveBeenCalledWith("proj-1");
  });

  it("creates upgrade tasks from Claude output", async () => {
    const runner = createUpgradeInitRunner({}, "proj-1");
    await runner(makeContext());

    expect(mockCreateUpgradeTasks).toHaveBeenCalledWith("proj-1", expect.any(Array));
  });

  it("uses existing implementation_prompt", async () => {
    mockGetProject.mockResolvedValue(fakeProject({ implementation_prompt: "existing prompt" }));
    const runner = createUpgradeInitRunner({}, "proj-1");
    await runner(makeContext());

    expect(mockBuildImplPrompt).not.toHaveBeenCalled();
  });

  it("generates implementation_prompt when missing", async () => {
    mockGetProject.mockResolvedValue(fakeProject({ implementation_prompt: null }));
    const runner = createUpgradeInitRunner({}, "proj-1");
    await runner(makeContext());

    expect(mockBuildImplPrompt).toHaveBeenCalled();
    expect(mockUpdateProject).toHaveBeenCalledWith(
      "proj-1",
      expect.objectContaining({ implementation_prompt: "generated impl prompt" }),
    );
  });

  it("throws when Claude output has no JSON array", async () => {
    mockRunClaude.mockResolvedValue({ exitCode: 0, stdout: "No tasks here", stderr: "" } as never);
    const runner = createUpgradeInitRunner({}, "proj-1");

    await expect(runner(makeContext())).rejects.toThrow("Failed to parse task breakdown");
  });

  it("resets status to designing on parse failure", async () => {
    mockRunClaude.mockResolvedValue({ exitCode: 0, stdout: "no json", stderr: "" } as never);
    const runner = createUpgradeInitRunner({}, "proj-1");

    await expect(runner(makeContext())).rejects.toThrow();
    expect(mockUpdateProject).toHaveBeenCalledWith("proj-1", { status: "designing" });
  });

  it("initializes git repo", async () => {
    const runner = createUpgradeInitRunner({}, "proj-1");
    await runner(makeContext());

    expect(mockSafeGitCommit).toHaveBeenCalledWith("/tmp/test-app", "Initial prototype");
  });

  it("emits progress events", async () => {
    const runner = createUpgradeInitRunner({}, "proj-1");
    const ctx = makeContext();
    await runner(ctx);

    expect(ctx.onProgress).toHaveBeenCalledWith(
      expect.objectContaining({ type: "progress", phase: "Starting upgrade..." }),
    );
  });

  it("returns tasks in result", async () => {
    const runner = createUpgradeInitRunner({}, "proj-1");
    const result = await runner(makeContext());

    expect(result.result?.tasks).toEqual([{ id: "t1", title: "Task 1" }]);
  });

  it("handles aborted signal", async () => {
    const controller = new AbortController();
    controller.abort();
    const runner = createUpgradeInitRunner({}, "proj-1");

    await expect(runner({ onProgress: vi.fn(), signal: controller.signal, sessionId: "sess-1" })).rejects.toThrow();
  });
});
