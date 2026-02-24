import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@claudekit/claude-runner", () => ({
  runClaude: vi.fn().mockResolvedValue({ exitCode: 0, stdout: "done", stderr: "" }),
}));

vi.mock("@/lib/actions/generator-projects", () => ({
  getGeneratorProject: vi.fn().mockResolvedValue(null),
  updateGeneratorProject: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/actions/upgrade-tasks", () => ({
  getUpgradeTasks: vi.fn().mockResolvedValue([]),
  updateUpgradeTask: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/services/git-utils", () => ({
  safeGitCommit: vi.fn().mockReturnValue({ committed: true }),
}));

vi.mock("@/lib/services/scaffold-prompt", () => ({
  buildImplementationPrompt: vi.fn().mockReturnValue("impl prompt"),
  buildEnvSetupPrompt: vi.fn().mockReturnValue("env setup prompt"),
  buildUpgradeTaskPrompt: vi.fn().mockReturnValue("task prompt"),
}));

vi.mock("@/lib/services/session-manager", () => ({
  setSessionPid: vi.fn(),
}));

vi.mock("@/lib/utils", () => ({
  expandTilde: vi.fn((p: string) => p.replace("~", "/Users/testuser")),
  nowTimestamp: vi.fn().mockReturnValue("2024-01-01T00:00:00.000Z"),
}));

import { runClaude } from "@claudekit/claude-runner";
import { getGeneratorProject, updateGeneratorProject } from "@/lib/actions/generator-projects";
import { getUpgradeTasks, updateUpgradeTask } from "@/lib/actions/upgrade-tasks";
import { safeGitCommit } from "@/lib/services/git-utils";
import type { GeneratorProject } from "@/lib/types";
import { createUpgradeRunner } from "./upgrade";

const mockRunClaude = vi.mocked(runClaude);
const mockGetProject = vi.mocked(getGeneratorProject);
const mockUpdateProject = vi.mocked(updateGeneratorProject);
const mockGetUpgradeTasks = vi.mocked(getUpgradeTasks);
const mockUpdateTask = vi.mocked(updateUpgradeTask);
const mockSafeGitCommit = vi.mocked(safeGitCommit);

function fakeProject(overrides: Partial<GeneratorProject> = {}): GeneratorProject {
  return {
    id: "proj-1",
    title: "Test App",
    idea_description: "A test app",
    platform: "nextjs",
    services: ["supabase"],
    constraints: [],
    project_name: "test-app",
    project_path: "/tmp",
    package_manager: "pnpm",
    status: "upgrading",
    active_spec_version: 0,
    scaffold_logs: null,
    implementation_prompt: "existing impl prompt",
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

const pendingTask = {
  id: "task-1",
  project_id: "proj-1",
  title: "Implement auth",
  description: "Add authentication",
  status: "pending",
  step_type: "implement",
  order_index: 0,
};

const failedTask = {
  id: "task-2",
  project_id: "proj-1",
  title: "Add API routes",
  description: "Create REST API",
  status: "failed",
  step_type: "implement",
  order_index: 1,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetProject.mockResolvedValue(fakeProject());
  mockRunClaude.mockResolvedValue({ exitCode: 0, stdout: "done", stderr: "" } as never);
  mockGetUpgradeTasks.mockResolvedValue([pendingTask] as never);
  mockSafeGitCommit.mockReturnValue({ committed: true } as never);
});

describe("createUpgradeRunner", () => {
  it("returns a function", () => {
    const runner = createUpgradeRunner({}, "proj-1");
    expect(typeof runner).toBe("function");
  });

  it("throws when project not found", async () => {
    mockGetProject.mockResolvedValue(null);
    const runner = createUpgradeRunner({}, "proj-1");
    await expect(runner(makeContext())).rejects.toThrow("Project not found");
  });

  it("throws when project status is not upgrading", async () => {
    mockGetProject.mockResolvedValue(fakeProject({ status: "designing" }));
    const runner = createUpgradeRunner({}, "proj-1");
    await expect(runner(makeContext())).rejects.toThrow('Cannot execute: project status is "designing"');
  });

  it("throws when no pending tasks", async () => {
    mockGetUpgradeTasks.mockResolvedValue([{ ...pendingTask, status: "completed" }] as never);
    const runner = createUpgradeRunner({}, "proj-1");
    await expect(runner(makeContext())).rejects.toThrow("No pending tasks to execute");
  });

  it("executes pending tasks and updates status", async () => {
    const runner = createUpgradeRunner({}, "proj-1");
    const ctx = makeContext();
    const result = await runner(ctx);

    expect(mockUpdateTask).toHaveBeenCalledWith("task-1", expect.objectContaining({ status: "in_progress" }));
    expect(mockUpdateTask).toHaveBeenCalledWith("task-1", expect.objectContaining({ status: "completed" }));
    expect(result.result.completedCount).toBe(1);
    expect(result.result.failedCount).toBe(0);
  });

  it("archives project on full success (non-single-task mode)", async () => {
    const runner = createUpgradeRunner({}, "proj-1");
    await runner(makeContext());

    expect(mockUpdateProject).toHaveBeenCalledWith("proj-1", { status: "archived" });
  });

  it("does not archive on failure", async () => {
    mockRunClaude.mockResolvedValue({ exitCode: 1, stdout: "", stderr: "err" } as never);
    const runner = createUpgradeRunner({}, "proj-1");
    await runner(makeContext());

    expect(mockUpdateProject).not.toHaveBeenCalledWith("proj-1", { status: "archived" });
  });

  it("marks task as failed on non-zero exit code", async () => {
    mockRunClaude.mockResolvedValue({ exitCode: 1, stdout: "", stderr: "error output" } as never);
    const runner = createUpgradeRunner({}, "proj-1");
    const result = await runner(makeContext());

    expect(mockUpdateTask).toHaveBeenCalledWith("task-1", expect.objectContaining({ status: "failed" }));
    expect(result.result.failedCount).toBe(1);
  });

  it("stops processing on failure", async () => {
    mockGetUpgradeTasks.mockResolvedValue([pendingTask, failedTask] as never);
    mockRunClaude.mockResolvedValue({ exitCode: 1, stdout: "", stderr: "" } as never);
    const runner = createUpgradeRunner({}, "proj-1");
    await runner(makeContext());

    // Only one task should have been attempted
    expect(mockRunClaude).toHaveBeenCalledTimes(1);
  });

  it("commits after each successful task", async () => {
    const runner = createUpgradeRunner({}, "proj-1");
    await runner(makeContext());

    expect(mockSafeGitCommit).toHaveBeenCalledWith("/tmp/test-app", "Upgrade: Implement auth");
  });

  it("makes final commit in non-single-task mode", async () => {
    const runner = createUpgradeRunner({}, "proj-1");
    await runner(makeContext());

    // Final commit call
    expect(mockSafeGitCommit).toHaveBeenCalledWith("/tmp/test-app", "Upgrade: remaining changes");
  });

  describe("single task mode", () => {
    it("runs only the specified task", async () => {
      mockGetUpgradeTasks.mockResolvedValue([pendingTask, failedTask] as never);
      const runner = createUpgradeRunner({ taskId: "task-1" }, "proj-1");
      const result = await runner(makeContext());

      expect(result.result.completedCount).toBe(1);
      // Should not make final commit in single-task mode
      expect(mockSafeGitCommit).not.toHaveBeenCalledWith(expect.any(String), "Upgrade: remaining changes");
    });

    it("throws when specified task not found", async () => {
      const runner = createUpgradeRunner({ taskId: "nonexistent" }, "proj-1");
      await expect(runner(makeContext())).rejects.toThrow("Task not found");
    });

    it("throws when specified task is already completed", async () => {
      mockGetUpgradeTasks.mockResolvedValue([{ ...pendingTask, status: "completed" }] as never);
      const runner = createUpgradeRunner({ taskId: "task-1" }, "proj-1");
      await expect(runner(makeContext())).rejects.toThrow("Task is already completed");
    });

    it("does not update project status in single-task mode", async () => {
      const runner = createUpgradeRunner({ taskId: "task-1" }, "proj-1");
      await runner(makeContext());

      expect(mockUpdateProject).not.toHaveBeenCalled();
    });
  });

  describe("task step types", () => {
    it("uses read-only tools for env_setup step type", async () => {
      mockGetUpgradeTasks.mockResolvedValue([{ ...pendingTask, step_type: "env_setup" }] as never);
      const runner = createUpgradeRunner({}, "proj-1");
      await runner(makeContext());

      expect(mockRunClaude).toHaveBeenCalledWith(
        expect.objectContaining({
          allowedTools: "Read,Glob,Grep",
          disallowedTools: "Write,Edit,Bash",
        }),
      );
    });

    it("uses read-only tools for validate step type", async () => {
      mockGetUpgradeTasks.mockResolvedValue([{ ...pendingTask, step_type: "validate" }] as never);
      const runner = createUpgradeRunner({}, "proj-1");
      await runner(makeContext());

      expect(mockRunClaude).toHaveBeenCalledWith(
        expect.objectContaining({
          allowedTools: "Read,Glob,Grep",
          disallowedTools: "Write,Edit,Bash",
        }),
      );
    });

    it("uses full tools for implement step type", async () => {
      const runner = createUpgradeRunner({}, "proj-1");
      await runner(makeContext());

      expect(mockRunClaude).toHaveBeenCalledWith(
        expect.objectContaining({
          allowedTools: "Write,Edit,Bash,Read,Glob,Grep",
          disallowedTools: "",
        }),
      );
    });
  });

  it("handles AbortError by re-throwing", async () => {
    const controller = new AbortController();
    controller.abort();
    const runner = createUpgradeRunner({}, "proj-1");
    await expect(runner({ onProgress: vi.fn(), signal: controller.signal, sessionId: "sess-1" })).rejects.toThrow();
  });

  it("handles generic error during task execution", async () => {
    mockRunClaude.mockRejectedValue(new Error("Network timeout"));
    const runner = createUpgradeRunner({}, "proj-1");
    const result = await runner(makeContext());

    expect(mockUpdateTask).toHaveBeenCalledWith(
      "task-1",
      expect.objectContaining({ status: "failed", claude_output: "Network timeout" }),
    );
    expect(result.result.failedCount).toBe(1);
  });

  it("uses existing implementation_prompt if available", async () => {
    mockGetProject.mockResolvedValue(fakeProject({ implementation_prompt: "custom impl" }));
    const runner = createUpgradeRunner({}, "proj-1");
    await runner(makeContext());

    // Should not call buildImplementationPrompt since impl_prompt exists
    // (just verifying it ran successfully)
    expect(mockRunClaude).toHaveBeenCalledTimes(1);
  });

  it("also runs failed tasks", async () => {
    mockGetUpgradeTasks.mockResolvedValue([failedTask] as never);
    const runner = createUpgradeRunner({}, "proj-1");
    const result = await runner(makeContext());

    expect(result.result.completedCount).toBe(1);
  });
});
