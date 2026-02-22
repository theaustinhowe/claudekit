import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:child_process", () => ({
  execSync: vi.fn(),
}));
vi.mock("@claudekit/claude-runner", () => ({
  runClaude: vi.fn(),
}));
vi.mock("@/lib/actions/generator-projects", () => ({
  getGeneratorProject: vi.fn(),
  updateGeneratorProject: vi.fn(),
}));
vi.mock("@/lib/actions/upgrade-tasks", () => ({
  createUpgradeTasks: vi.fn(),
  deleteUpgradeTasks: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  getDb: vi.fn(async () => ({})),
  execute: vi.fn(),
}));
vi.mock("@/lib/services/git-utils", () => ({
  safeGitCommit: vi.fn(() => ({ committed: true })),
}));
vi.mock("@/lib/services/scaffold-prompt", () => ({
  buildImplementationPrompt: vi.fn(() => "impl prompt"),
  buildUpgradePlanPrompt: vi.fn(() => "plan prompt"),
}));
vi.mock("@/lib/services/session-manager", () => ({
  setCleanupFn: vi.fn(),
  setSessionPid: vi.fn(),
}));
vi.mock("@/lib/utils", () => ({
  expandTilde: vi.fn((p: string) => p),
  generateId: vi.fn(() => "gen-id"),
  nowTimestamp: vi.fn(() => "2025-01-01T00:00:00.000Z"),
}));

import { runClaude } from "@claudekit/claude-runner";
import { getGeneratorProject, updateGeneratorProject } from "@/lib/actions/generator-projects";
import { createUpgradeTasks, deleteUpgradeTasks } from "@/lib/actions/upgrade-tasks";
import { execute } from "@/lib/db";
import { buildImplementationPrompt } from "@/lib/services/scaffold-prompt";
import { setCleanupFn } from "@/lib/services/session-manager";
import { createUpgradeInitRunner } from "./upgrade-init";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("upgrade-init runner", () => {
  const defaultProject = {
    project_path: "/projects",
    project_name: "my-app",
    status: "designing",
    package_manager: "pnpm",
    platform: "nextjs",
    implementation_prompt: null,
    services: [],
  };

  function setupHappyPath() {
    vi.mocked(getGeneratorProject).mockResolvedValue(defaultProject as never);
    vi.mocked(createUpgradeTasks).mockResolvedValue([{ id: "t1", title: "Setup DB" }] as never);
    vi.mocked(runClaude).mockResolvedValue({
      exitCode: 0,
      stdout: '[{"title":"Setup DB","description":"Create schema","step_type":"implement"}]',
      stderr: "",
    } as never);
  }

  it("throws when project not found", async () => {
    vi.mocked(getGeneratorProject).mockResolvedValue(null);

    const runner = createUpgradeInitRunner({}, "proj1");

    await expect(
      runner({ onProgress: vi.fn(), signal: new AbortController().signal, sessionId: "s1" }),
    ).rejects.toThrow("Project not found");
  });

  it("throws when project status is not designing or scaffolding", async () => {
    vi.mocked(getGeneratorProject).mockResolvedValue({
      ...defaultProject,
      status: "archived",
    } as never);

    const runner = createUpgradeInitRunner({}, "proj1");

    await expect(
      runner({ onProgress: vi.fn(), signal: new AbortController().signal, sessionId: "s1" }),
    ).rejects.toThrow('Cannot upgrade: project status is "archived"');
  });

  it("allows upgrading from scaffolding status", async () => {
    vi.mocked(getGeneratorProject).mockResolvedValue({
      ...defaultProject,
      status: "scaffolding",
    } as never);
    vi.mocked(createUpgradeTasks).mockResolvedValue([{ id: "t1", title: "Setup" }] as never);
    vi.mocked(runClaude).mockResolvedValue({
      exitCode: 0,
      stdout: '[{"title":"Setup","description":"desc"}]',
      stderr: "",
    } as never);

    const runner = createUpgradeInitRunner({}, "proj1");
    const result = await runner({ onProgress: vi.fn(), signal: new AbortController().signal, sessionId: "s1" });

    expect(result.result).toHaveProperty("tasks");
  });

  it("registers cleanup function", async () => {
    setupHappyPath();

    const runner = createUpgradeInitRunner({}, "proj1");
    await runner({ onProgress: vi.fn(), signal: new AbortController().signal, sessionId: "s1" });

    expect(setCleanupFn).toHaveBeenCalledWith("s1", expect.any(Function));
  });

  it("sets status to upgrading", async () => {
    setupHappyPath();

    const runner = createUpgradeInitRunner({}, "proj1");
    await runner({ onProgress: vi.fn(), signal: new AbortController().signal, sessionId: "s1" });

    expect(updateGeneratorProject).toHaveBeenCalledWith("proj1", { status: "upgrading" });
  });

  it("creates repo record in database", async () => {
    setupHappyPath();

    const runner = createUpgradeInitRunner({}, "proj1");
    await runner({ onProgress: vi.fn(), signal: new AbortController().signal, sessionId: "s1" });

    expect(execute).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining("INSERT INTO repos"),
      expect.arrayContaining(["gen-id", "my-app"]),
    );
  });

  it("generates implementation prompt when not already set", async () => {
    setupHappyPath();

    const runner = createUpgradeInitRunner({}, "proj1");
    await runner({ onProgress: vi.fn(), signal: new AbortController().signal, sessionId: "s1" });

    expect(buildImplementationPrompt).toHaveBeenCalled();
    expect(updateGeneratorProject).toHaveBeenCalledWith(
      "proj1",
      expect.objectContaining({ implementation_prompt: "impl prompt" }),
    );
  });

  it("uses existing implementation prompt when available", async () => {
    vi.mocked(getGeneratorProject).mockResolvedValue({
      ...defaultProject,
      implementation_prompt: "existing prompt",
    } as never);
    vi.mocked(createUpgradeTasks).mockResolvedValue([{ id: "t1", title: "Setup" }] as never);
    vi.mocked(runClaude).mockResolvedValue({
      exitCode: 0,
      stdout: '[{"title":"Setup","description":"desc"}]',
      stderr: "",
    } as never);

    const runner = createUpgradeInitRunner({}, "proj1");
    await runner({ onProgress: vi.fn(), signal: new AbortController().signal, sessionId: "s1" });

    expect(buildImplementationPrompt).not.toHaveBeenCalled();
  });

  it("deletes existing tasks before generating new ones", async () => {
    setupHappyPath();

    const runner = createUpgradeInitRunner({}, "proj1");
    await runner({ onProgress: vi.fn(), signal: new AbortController().signal, sessionId: "s1" });

    expect(deleteUpgradeTasks).toHaveBeenCalledWith("proj1");
  });

  it("parses Claude output and creates tasks", async () => {
    setupHappyPath();

    const runner = createUpgradeInitRunner({}, "proj1");
    const result = await runner({ onProgress: vi.fn(), signal: new AbortController().signal, sessionId: "s1" });

    expect(createUpgradeTasks).toHaveBeenCalledWith("proj1", [
      { title: "Setup DB", description: "Create schema", step_type: "implement" },
    ]);
    expect(result.result).toHaveProperty("tasks");
    expect(result.result).toHaveProperty("repoId", "gen-id");
  });

  it("throws when Claude output cannot be parsed as JSON", async () => {
    vi.mocked(getGeneratorProject).mockResolvedValue(defaultProject as never);
    vi.mocked(runClaude).mockResolvedValue({
      exitCode: 0,
      stdout: "No JSON here, just text",
      stderr: "",
    } as never);

    const runner = createUpgradeInitRunner({}, "proj1");

    await expect(
      runner({ onProgress: vi.fn(), signal: new AbortController().signal, sessionId: "s1" }),
    ).rejects.toThrow("Failed to parse task breakdown");
  });

  it("resets status to designing when JSON parsing fails", async () => {
    vi.mocked(getGeneratorProject).mockResolvedValue(defaultProject as never);
    vi.mocked(runClaude).mockResolvedValue({
      exitCode: 0,
      stdout: "No JSON here",
      stderr: "",
    } as never);

    const runner = createUpgradeInitRunner({}, "proj1");

    await expect(
      runner({ onProgress: vi.fn(), signal: new AbortController().signal, sessionId: "s1" }),
    ).rejects.toThrow();

    expect(updateGeneratorProject).toHaveBeenCalledWith("proj1", { status: "designing" });
  });

  it("throws on abort signal", async () => {
    vi.mocked(getGeneratorProject).mockResolvedValue(defaultProject as never);

    const controller = new AbortController();
    controller.abort();

    const runner = createUpgradeInitRunner({}, "proj1");

    await expect(runner({ onProgress: vi.fn(), signal: controller.signal, sessionId: "s1" })).rejects.toThrow(
      "Aborted",
    );
  });

  it("emits progress events", async () => {
    setupHappyPath();

    const onProgress = vi.fn();
    const runner = createUpgradeInitRunner({}, "proj1");
    await runner({ onProgress, signal: new AbortController().signal, sessionId: "s1" });

    const phases = onProgress.mock.calls.filter(([evt]) => evt.phase).map(([evt]) => evt.phase);
    expect(phases).toContain("Starting upgrade...");
    expect(phases).toContain("Creating repository record...");
  });

  it("calls runClaude with read-only tools", async () => {
    setupHappyPath();

    const runner = createUpgradeInitRunner({}, "proj1");
    await runner({ onProgress: vi.fn(), signal: new AbortController().signal, sessionId: "s1" });

    expect(runClaude).toHaveBeenCalledWith(
      expect.objectContaining({
        allowedTools: "Read,Glob,Grep",
        disallowedTools: "Write,Edit,Bash",
      }),
    );
  });
});
