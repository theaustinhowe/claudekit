import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@devkit/claude-runner", () => ({
  runClaude: vi.fn(),
}));
vi.mock("@/lib/actions/generator-projects", () => ({
  getGeneratorProject: vi.fn(),
  updateGeneratorProject: vi.fn(),
}));
vi.mock("@/lib/actions/upgrade-tasks", () => ({
  getUpgradeTasks: vi.fn(),
  updateUpgradeTask: vi.fn(),
}));
vi.mock("@/lib/services/git-utils", () => ({
  safeGitCommit: vi.fn(() => ({ committed: false })),
}));
vi.mock("@/lib/services/scaffold-prompt", () => ({
  buildImplementationPrompt: vi.fn(() => "impl prompt"),
  buildUpgradeTaskPrompt: vi.fn(() => "task prompt"),
  buildEnvSetupPrompt: vi.fn(() => "env prompt"),
}));
vi.mock("@/lib/services/session-manager", () => ({
  setSessionPid: vi.fn(),
}));
vi.mock("@/lib/utils", () => ({
  expandTilde: vi.fn((p: string) => p),
  nowTimestamp: vi.fn(() => "2025-01-01T00:00:00.000Z"),
}));

import { runClaude } from "@devkit/claude-runner";
import { getGeneratorProject, updateGeneratorProject } from "@/lib/actions/generator-projects";
import { getUpgradeTasks, updateUpgradeTask } from "@/lib/actions/upgrade-tasks";
import { safeGitCommit } from "@/lib/services/git-utils";
import { createUpgradeRunner } from "./upgrade";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("upgrade runner", () => {
  const defaultProject = {
    project_path: "/projects",
    project_name: "my-app",
    status: "upgrading",
    implementation_prompt: "build it",
    services: [],
  };

  const pendingTask = {
    id: "t1",
    title: "Setup DB",
    description: "Create schema",
    status: "pending",
    step_type: "implement",
  };

  function setupHappyPath() {
    vi.mocked(getGeneratorProject).mockResolvedValue(defaultProject as never);
    vi.mocked(getUpgradeTasks).mockResolvedValue([pendingTask] as never);
    vi.mocked(runClaude).mockResolvedValue({
      exitCode: 0,
      stdout: "Done",
      stderr: "",
    } as never);
  }

  it("throws when project not found", async () => {
    vi.mocked(getGeneratorProject).mockResolvedValue(null);

    const runner = createUpgradeRunner({}, "proj1");

    await expect(
      runner({ onProgress: vi.fn(), signal: new AbortController().signal, sessionId: "s1" }),
    ).rejects.toThrow("Project not found");
  });

  it("throws when project status is not upgrading", async () => {
    vi.mocked(getGeneratorProject).mockResolvedValue({ ...defaultProject, status: "designing" } as never);

    const runner = createUpgradeRunner({}, "proj1");

    await expect(
      runner({ onProgress: vi.fn(), signal: new AbortController().signal, sessionId: "s1" }),
    ).rejects.toThrow('Cannot execute: project status is "designing"');
  });

  it("throws when no pending tasks", async () => {
    vi.mocked(getGeneratorProject).mockResolvedValue(defaultProject as never);
    vi.mocked(getUpgradeTasks).mockResolvedValue([{ id: "t1", status: "completed" }] as never);

    const runner = createUpgradeRunner({}, "proj1");

    await expect(
      runner({ onProgress: vi.fn(), signal: new AbortController().signal, sessionId: "s1" }),
    ).rejects.toThrow("No pending tasks to execute");
  });

  it("executes pending tasks and returns counts", async () => {
    setupHappyPath();

    const onProgress = vi.fn();
    const runner = createUpgradeRunner({}, "proj1");
    const result = await runner({ onProgress, signal: new AbortController().signal, sessionId: "s1" });

    expect(result).toEqual({ result: { completedCount: 1, failedCount: 0 } });
  });

  it("marks task as in_progress then completed on success", async () => {
    setupHappyPath();

    const runner = createUpgradeRunner({}, "proj1");
    await runner({ onProgress: vi.fn(), signal: new AbortController().signal, sessionId: "s1" });

    expect(updateUpgradeTask).toHaveBeenCalledWith("t1", expect.objectContaining({ status: "in_progress" }));
    expect(updateUpgradeTask).toHaveBeenCalledWith("t1", expect.objectContaining({ status: "completed" }));
  });

  it("marks task as failed when Claude exits non-zero", async () => {
    vi.mocked(getGeneratorProject).mockResolvedValue(defaultProject as never);
    vi.mocked(getUpgradeTasks).mockResolvedValue([pendingTask] as never);
    vi.mocked(runClaude).mockResolvedValue({
      exitCode: 1,
      stdout: "",
      stderr: "timeout",
    } as never);

    const runner = createUpgradeRunner({}, "proj1");
    const result = await runner({ onProgress: vi.fn(), signal: new AbortController().signal, sessionId: "s1" });

    expect(result).toEqual({ result: { completedCount: 0, failedCount: 1 } });
    expect(updateUpgradeTask).toHaveBeenCalledWith("t1", expect.objectContaining({ status: "failed" }));
  });

  it("stops on failure and does not continue to next task", async () => {
    vi.mocked(getGeneratorProject).mockResolvedValue(defaultProject as never);
    vi.mocked(getUpgradeTasks).mockResolvedValue([
      pendingTask,
      { id: "t2", title: "Second task", description: "", status: "pending", step_type: "implement" },
    ] as never);
    vi.mocked(runClaude).mockResolvedValue({
      exitCode: 1,
      stdout: "",
      stderr: "error",
    } as never);

    const runner = createUpgradeRunner({}, "proj1");
    const result = await runner({ onProgress: vi.fn(), signal: new AbortController().signal, sessionId: "s1" });

    expect(result).toEqual({ result: { completedCount: 0, failedCount: 1 } });
    // Only first task should have been attempted
    expect(runClaude).toHaveBeenCalledTimes(1);
  });

  it("runs single task when taskId is provided", async () => {
    vi.mocked(getGeneratorProject).mockResolvedValue(defaultProject as never);
    vi.mocked(getUpgradeTasks).mockResolvedValue([
      pendingTask,
      { id: "t2", title: "Second", description: "", status: "pending", step_type: "implement" },
    ] as never);
    vi.mocked(runClaude).mockResolvedValue({ exitCode: 0, stdout: "Done", stderr: "" } as never);

    const runner = createUpgradeRunner({ taskId: "t1" }, "proj1");
    const result = await runner({ onProgress: vi.fn(), signal: new AbortController().signal, sessionId: "s1" });

    expect(runClaude).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ result: { completedCount: 1, failedCount: 0 } });
  });

  it("throws when single task is not found", async () => {
    vi.mocked(getGeneratorProject).mockResolvedValue(defaultProject as never);
    vi.mocked(getUpgradeTasks).mockResolvedValue([pendingTask] as never);

    const runner = createUpgradeRunner({ taskId: "nonexistent" }, "proj1");

    await expect(
      runner({ onProgress: vi.fn(), signal: new AbortController().signal, sessionId: "s1" }),
    ).rejects.toThrow("Task not found");
  });

  it("throws when single task is already completed", async () => {
    vi.mocked(getGeneratorProject).mockResolvedValue(defaultProject as never);
    vi.mocked(getUpgradeTasks).mockResolvedValue([{ ...pendingTask, status: "completed" }] as never);

    const runner = createUpgradeRunner({ taskId: "t1" }, "proj1");

    await expect(
      runner({ onProgress: vi.fn(), signal: new AbortController().signal, sessionId: "s1" }),
    ).rejects.toThrow("Task is already completed");
  });

  it("commits after each completed task", async () => {
    setupHappyPath();
    vi.mocked(safeGitCommit).mockReturnValue({ committed: true });

    const onProgress = vi.fn();
    const runner = createUpgradeRunner({}, "proj1");
    await runner({ onProgress, signal: new AbortController().signal, sessionId: "s1" });

    expect(safeGitCommit).toHaveBeenCalledWith(expect.stringContaining("my-app"), expect.stringContaining("Setup DB"));
  });

  it("archives project on full success (non-single-task mode)", async () => {
    setupHappyPath();

    const runner = createUpgradeRunner({}, "proj1");
    await runner({ onProgress: vi.fn(), signal: new AbortController().signal, sessionId: "s1" });

    expect(updateGeneratorProject).toHaveBeenCalledWith("proj1", { status: "archived" });
  });

  it("does not archive when there are failures", async () => {
    vi.mocked(getGeneratorProject).mockResolvedValue(defaultProject as never);
    vi.mocked(getUpgradeTasks).mockResolvedValue([pendingTask] as never);
    vi.mocked(runClaude).mockResolvedValue({ exitCode: 1, stdout: "", stderr: "err" } as never);

    const runner = createUpgradeRunner({}, "proj1");
    await runner({ onProgress: vi.fn(), signal: new AbortController().signal, sessionId: "s1" });

    expect(updateGeneratorProject).not.toHaveBeenCalledWith("proj1", { status: "archived" });
  });

  it("skips final commit and status update in single-task mode", async () => {
    vi.mocked(getGeneratorProject).mockResolvedValue(defaultProject as never);
    vi.mocked(getUpgradeTasks).mockResolvedValue([pendingTask] as never);
    vi.mocked(runClaude).mockResolvedValue({ exitCode: 0, stdout: "Done", stderr: "" } as never);

    const runner = createUpgradeRunner({ taskId: "t1" }, "proj1");
    await runner({ onProgress: vi.fn(), signal: new AbortController().signal, sessionId: "s1" });

    // safeGitCommit should only be called for the individual task, not a final commit
    expect(safeGitCommit).not.toHaveBeenCalledWith(expect.anything(), "Upgrade: remaining changes");
    expect(updateGeneratorProject).not.toHaveBeenCalledWith("proj1", { status: "archived" });
  });

  it("re-throws AbortError", async () => {
    vi.mocked(getGeneratorProject).mockResolvedValue(defaultProject as never);
    vi.mocked(getUpgradeTasks).mockResolvedValue([pendingTask] as never);
    vi.mocked(runClaude).mockRejectedValue(new DOMException("Aborted", "AbortError"));

    const runner = createUpgradeRunner({}, "proj1");

    await expect(
      runner({ onProgress: vi.fn(), signal: new AbortController().signal, sessionId: "s1" }),
    ).rejects.toThrow("Aborted");
  });

  it("uses env_setup tools for env_setup tasks", async () => {
    vi.mocked(getGeneratorProject).mockResolvedValue(defaultProject as never);
    vi.mocked(getUpgradeTasks).mockResolvedValue([{ ...pendingTask, step_type: "env_setup" }] as never);
    vi.mocked(runClaude).mockResolvedValue({
      exitCode: 0,
      stdout: '[{"name":"DATABASE_URL","required":true}]',
      stderr: "",
    } as never);

    const onProgress = vi.fn();
    const runner = createUpgradeRunner({}, "proj1");
    await runner({ onProgress, signal: new AbortController().signal, sessionId: "s1" });

    expect(runClaude).toHaveBeenCalledWith(
      expect.objectContaining({
        allowedTools: "Read,Glob,Grep",
        disallowedTools: "Write,Edit,Bash",
      }),
    );
  });

  it("uses validate tools for validate tasks", async () => {
    vi.mocked(getGeneratorProject).mockResolvedValue(defaultProject as never);
    vi.mocked(getUpgradeTasks).mockResolvedValue([{ ...pendingTask, step_type: "validate" }] as never);
    vi.mocked(runClaude).mockResolvedValue({ exitCode: 0, stdout: "ok", stderr: "" } as never);

    const runner = createUpgradeRunner({}, "proj1");
    await runner({ onProgress: vi.fn(), signal: new AbortController().signal, sessionId: "s1" });

    expect(runClaude).toHaveBeenCalledWith(
      expect.objectContaining({
        allowedTools: "Read,Glob,Grep",
        disallowedTools: "Write,Edit,Bash",
      }),
    );
  });

  it("uses full tool set for implement tasks", async () => {
    setupHappyPath();

    const runner = createUpgradeRunner({}, "proj1");
    await runner({ onProgress: vi.fn(), signal: new AbortController().signal, sessionId: "s1" });

    expect(runClaude).toHaveBeenCalledWith(
      expect.objectContaining({
        allowedTools: "Write,Edit,Bash,Read,Glob,Grep",
        disallowedTools: "",
      }),
    );
  });
});
