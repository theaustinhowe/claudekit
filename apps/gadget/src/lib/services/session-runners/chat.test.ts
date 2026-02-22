import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@devkit/claude-runner", () => ({
  runClaude: vi.fn(),
}));
vi.mock("@/lib/actions/generator-projects", () => ({
  getGeneratorProject: vi.fn(),
  createDesignMessage: vi.fn(),
}));
vi.mock("@/lib/actions/upgrade-tasks", () => ({
  getUpgradeTasks: vi.fn(),
}));
vi.mock("@/lib/services/session-manager", () => ({
  setSessionPid: vi.fn(),
}));
vi.mock("@/lib/services/task-mutation-parser", () => ({
  parseTaskMutations: vi.fn(),
  applyTaskMutations: vi.fn(),
}));
vi.mock("@/lib/utils", () => ({
  expandTilde: vi.fn((p: string) => p),
}));

import { runClaude } from "@devkit/claude-runner";
import { createDesignMessage, getGeneratorProject } from "@/lib/actions/generator-projects";
import { getUpgradeTasks } from "@/lib/actions/upgrade-tasks";
import { applyTaskMutations, parseTaskMutations } from "@/lib/services/task-mutation-parser";
import { createChatRunner } from "./chat";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("chat runner", () => {
  const defaultProject = {
    project_path: "/projects",
    project_name: "my-app",
    design_vibes: [],
    color_scheme: {},
    inspiration_urls: [],
  };

  function setupHappyPath() {
    vi.mocked(getGeneratorProject).mockResolvedValue(defaultProject as never);
    vi.mocked(runClaude).mockResolvedValue({
      exitCode: 0,
      stdout: "Response text",
      stderr: "",
    } as never);
    vi.mocked(parseTaskMutations).mockReturnValue({ cleanContent: "Response text", mutations: null });
  }

  it("throws when project not found", async () => {
    vi.mocked(getGeneratorProject).mockResolvedValue(null);

    const runner = createChatRunner({ message: "hello" }, "proj1");

    await expect(
      runner({ onProgress: vi.fn(), signal: new AbortController().signal, sessionId: "s1" }),
    ).rejects.toThrow("Project not found");
  });

  it("saves user and assistant messages", async () => {
    setupHappyPath();

    const runner = createChatRunner({ message: "add a button" }, "proj1");
    await runner({ onProgress: vi.fn(), signal: new AbortController().signal, sessionId: "s1" });

    expect(createDesignMessage).toHaveBeenCalledTimes(2);
    expect(createDesignMessage).toHaveBeenCalledWith(
      expect.objectContaining({ role: "user", content: "add a button" }),
    );
    expect(createDesignMessage).toHaveBeenCalledWith(expect.objectContaining({ role: "assistant" }));
  });

  it("returns content from Claude response", async () => {
    setupHappyPath();

    const runner = createChatRunner({ message: "hello" }, "proj1");
    const result = await runner({ onProgress: vi.fn(), signal: new AbortController().signal, sessionId: "s1" });

    expect(result.result).toHaveProperty("content");
  });

  it("parses suggestions from Claude response", async () => {
    vi.mocked(getGeneratorProject).mockResolvedValue(defaultProject as never);
    vi.mocked(parseTaskMutations).mockReturnValue({ cleanContent: "text", mutations: null });

    // Simulate Claude sending chunks with suggestions
    // biome-ignore lint/suspicious/noExplicitAny: test mock
    vi.mocked(runClaude).mockImplementation(async (opts: any) => {
      const onProgressFn = opts.onProgress as (event: Record<string, unknown>) => void;
      onProgressFn({
        chunk: 'Here is your answer <!-- suggestions: ["do A", "do B", "do C"] -->',
        log: "",
        logType: "status",
        message: "",
      });
      return { exitCode: 0, stdout: "", stderr: "" };
    });

    const runner = createChatRunner({ message: "hello" }, "proj1");
    const result = await runner({ onProgress: vi.fn(), signal: new AbortController().signal, sessionId: "s1" });

    expect(result.result).toHaveProperty("suggestions");
    expect((result.result as Record<string, unknown>).suggestions).toEqual(["do A", "do B", "do C"]);
  });

  it("includes design context when project has design vibes", async () => {
    vi.mocked(getGeneratorProject).mockResolvedValue({
      ...defaultProject,
      design_vibes: ["modern", "clean"],
      color_scheme: { primary: "#000", accent: "#fff" },
      inspiration_urls: ["https://example.com"],
    } as never);
    vi.mocked(runClaude).mockResolvedValue({ exitCode: 0, stdout: "ok", stderr: "" } as never);
    vi.mocked(parseTaskMutations).mockReturnValue({ cleanContent: "ok", mutations: null });

    const runner = createChatRunner({ message: "test" }, "proj1");
    await runner({ onProgress: vi.fn(), signal: new AbortController().signal, sessionId: "s1" });

    expect(runClaude).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining("Design vibes: modern, clean"),
      }),
    );
  });

  it("includes upgrade context when upgradeMode is true", async () => {
    vi.mocked(getGeneratorProject).mockResolvedValue(defaultProject as never);
    vi.mocked(getUpgradeTasks).mockResolvedValue([
      { id: "t1", title: "Setup DB", description: "Create schema", status: "pending" },
    ] as never);
    vi.mocked(runClaude).mockResolvedValue({ exitCode: 0, stdout: "ok", stderr: "" } as never);
    vi.mocked(parseTaskMutations).mockReturnValue({ cleanContent: "ok", mutations: null });

    const runner = createChatRunner({ message: "test", upgradeMode: true }, "proj1");
    await runner({ onProgress: vi.fn(), signal: new AbortController().signal, sessionId: "s1" });

    expect(runClaude).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining("Upgrade Tasks"),
      }),
    );
  });

  it("applies task mutations when in upgrade mode", async () => {
    vi.mocked(getGeneratorProject).mockResolvedValue(defaultProject as never);
    vi.mocked(getUpgradeTasks).mockResolvedValue([]);
    vi.mocked(runClaude).mockResolvedValue({ exitCode: 0, stdout: "ok", stderr: "" } as never);
    vi.mocked(parseTaskMutations).mockReturnValue({
      cleanContent: "ok",
      mutations: { updates: [], additions: [], removals: [] },
    });

    const runner = createChatRunner({ message: "test", upgradeMode: true }, "proj1");
    const result = await runner({ onProgress: vi.fn(), signal: new AbortController().signal, sessionId: "s1" });

    expect(applyTaskMutations).toHaveBeenCalledWith("proj1", expect.any(Object));
    expect(result.result).toHaveProperty("taskMutationsApplied", true);
  });

  it("does not apply task mutations when not in upgrade mode", async () => {
    setupHappyPath();

    const runner = createChatRunner({ message: "test" }, "proj1");
    const result = await runner({ onProgress: vi.fn(), signal: new AbortController().signal, sessionId: "s1" });

    expect(applyTaskMutations).not.toHaveBeenCalled();
    expect(result.result).toHaveProperty("taskMutationsApplied", false);
  });

  it("calls runClaude with correct tools", async () => {
    setupHappyPath();

    const runner = createChatRunner({ message: "test" }, "proj1");
    await runner({ onProgress: vi.fn(), signal: new AbortController().signal, sessionId: "s1" });

    expect(runClaude).toHaveBeenCalledWith(
      expect.objectContaining({
        allowedTools: "Write,Edit,Bash,Read,Glob,Grep,WebFetch",
        disallowedTools: "",
        timeoutMs: 10 * 60_000,
      }),
    );
  });

  it("collects progress logs", async () => {
    vi.mocked(getGeneratorProject).mockResolvedValue(defaultProject as never);
    vi.mocked(parseTaskMutations).mockReturnValue({ cleanContent: "text", mutations: null });
    // biome-ignore lint/suspicious/noExplicitAny: test mock
    vi.mocked(runClaude).mockImplementation(async (opts: any) => {
      const onProgressFn = opts.onProgress as (event: Record<string, unknown>) => void;
      onProgressFn({ log: "Step 1 done", logType: "status", message: "", chunk: "" });
      onProgressFn({ log: "Step 2 done", logType: "status", message: "", chunk: "" });
      return { exitCode: 0, stdout: "", stderr: "" };
    });

    const runner = createChatRunner({ message: "test" }, "proj1");
    await runner({ onProgress: vi.fn(), signal: new AbortController().signal, sessionId: "s1" });

    expect(createDesignMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        role: "assistant",
        progress_logs: expect.arrayContaining([
          expect.objectContaining({ log: "Step 1 done" }),
          expect.objectContaining({ log: "Step 2 done" }),
        ]),
      }),
    );
  });
});
