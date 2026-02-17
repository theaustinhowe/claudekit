import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@devkit/claude-runner", () => ({
  runClaude: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  getDb: vi.fn(async () => ({})),
  queryAll: vi.fn(),
  queryOne: vi.fn(),
  execute: vi.fn(),
}));
vi.mock("@/lib/claude/prompts/edit-content", () => ({
  buildEditContentPrompt: vi.fn(() => "edit prompt"),
}));

import { runClaude } from "@devkit/claude-runner";
import { queryAll, queryOne } from "@/lib/db";
import { createEditContentRunner } from "./edit-content";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createEditContentRunner", () => {
  const makeCtx = () => ({
    onProgress: vi.fn(),
    signal: new AbortController().signal,
    sessionId: "s1",
  });

  it("throws for unsupported phase", async () => {
    const runner = createEditContentRunner(1, "edit something");

    await expect(runner(makeCtx())).rejects.toThrow("No editable data for phase 1");
  });

  it("throws for phase 7 (unsupported)", async () => {
    const runner = createEditContentRunner(7, "edit something");

    await expect(runner(makeCtx())).rejects.toThrow("No editable data for phase 7");
  });

  it("loads phase 2 data and edits it", async () => {
    // loadPhaseData for phase 2 calls queryAll twice
    vi.mocked(queryAll)
      .mockResolvedValueOnce([{ name: "App", framework: "Next.js" }]) // summary
      .mockResolvedValueOnce([{ path: "/", title: "Home" }]); // routes
    vi.mocked(queryOne).mockResolvedValue({ project_path: "/project" });

    const updatedData = { summary: { name: "NewApp" }, routes: [] };
    vi.mocked(runClaude).mockResolvedValue({
      stdout: JSON.stringify(updatedData),
      stderr: "",
      exitCode: 0,
    });

    const runner = createEditContentRunner(2, "rename to NewApp");
    const result = await runner(makeCtx());

    expect(result).toEqual({ result: updatedData });
  });

  it("throws when Claude returns no JSON", async () => {
    vi.mocked(queryAll).mockResolvedValue([{ name: "App" }]);
    vi.mocked(queryOne).mockResolvedValue({ project_path: "/p" });
    vi.mocked(runClaude).mockResolvedValue({ stdout: "no json", stderr: "", exitCode: 0 });

    const runner = createEditContentRunner(2, "edit");

    await expect(runner(makeCtx())).rejects.toThrow("No JSON found");
  });

  // Helper to set up phase 2 mocks for reuse across tests
  function setupPhase2Mocks(stdout = '{"summary":{"name":"App"},"routes":[]}') {
    vi.mocked(queryAll)
      .mockResolvedValueOnce([{ name: "App", framework: "Next.js" }])
      .mockResolvedValueOnce([{ path: "/", title: "Home" }]);
    vi.mocked(queryOne).mockResolvedValue({ project_path: "/project" });
    vi.mocked(runClaude).mockResolvedValue({ stdout, stderr: "", exitCode: 0 });
  }

  it("serializes directories with JSON.stringify and VARCHAR[] cast in phase 2", async () => {
    vi.mocked(queryAll)
      .mockResolvedValueOnce([{ name: "App", framework: "Next.js" }])
      .mockResolvedValueOnce([{ path: "/", title: "Home" }]);
    vi.mocked(queryOne).mockResolvedValue({ project_path: "/project" });

    const updatedData = {
      summary: { name: "App", framework: "Next.js", auth: "None", database_info: "None" },
      directories: ["src/app", "src/lib"],
      routes: [],
    };
    vi.mocked(runClaude).mockResolvedValue({
      stdout: JSON.stringify(updatedData),
      stderr: "",
      exitCode: 0,
    });

    const runner = createEditContentRunner(2, "edit dirs");
    await runner(makeCtx());

    const { execute } = await import("@/lib/db");
    const summaryInsert = vi
      .mocked(execute)
      .mock.calls.find((call) => typeof call[1] === "string" && call[1].includes("INSERT INTO project_summary"));
    expect(summaryInsert).toBeDefined();
    expect(summaryInsert?.[1]).toContain("?::VARCHAR[]");
    expect(summaryInsert?.[2]).toContain(JSON.stringify(["src/app", "src/lib"]));
  });

  it("serializes steps with JSON.stringify and VARCHAR[] cast in phase 3", async () => {
    vi.mocked(queryAll)
      .mockResolvedValueOnce([{ path: "/", title: "Home", auth_required: false, description: "Main" }])
      .mockResolvedValueOnce([{ id: "f1", name: "Flow", steps: ["step1", "step2"] }]);
    vi.mocked(queryOne).mockResolvedValue({ project_path: "/project" });

    const updatedData = {
      routes: [{ path: "/", title: "Home", auth_required: false, description: "Main" }],
      flows: [{ id: "f1", name: "Flow", steps: ["step1", "step2", "step3"] }],
    };
    vi.mocked(runClaude).mockResolvedValue({
      stdout: JSON.stringify(updatedData),
      stderr: "",
      exitCode: 0,
    });

    const runner = createEditContentRunner(3, "add step");
    await runner(makeCtx());

    const { execute } = await import("@/lib/db");
    const flowInsert = vi
      .mocked(execute)
      .mock.calls.find((call) => typeof call[1] === "string" && call[1].includes("INSERT INTO user_flows"));
    expect(flowInsert).toBeDefined();
    expect(flowInsert?.[1]).toContain("?::VARCHAR[]");
    expect(flowInsert?.[2]).toContain(JSON.stringify(["step1", "step2", "step3"]));
  });

  it("loads phase 3 data (routes + flows) and edits it", async () => {
    vi.mocked(queryAll)
      .mockResolvedValueOnce([
        { path: "/dashboard", title: "Dashboard", auth_required: true, description: "Main page" },
      ])
      .mockResolvedValueOnce([{ id: 1, name: "Login Flow", steps: ["visit /login", "enter creds"] }]);
    vi.mocked(queryOne).mockResolvedValue({ project_path: "/project" });

    const updatedData = {
      routes: [{ path: "/home", title: "Home" }],
      flows: [{ id: 1, name: "Updated Flow", steps: [] }],
    };
    vi.mocked(runClaude).mockResolvedValue({
      stdout: JSON.stringify(updatedData),
      stderr: "",
      exitCode: 0,
    });

    const runner = createEditContentRunner(3, "simplify flows");
    const result = await runner(makeCtx());

    expect(result).toEqual({ result: updatedData });
  });

  it("loads phase 4 data (entities + auth overrides + env items) and edits it", async () => {
    vi.mocked(queryAll)
      .mockResolvedValueOnce([{ name: "User", count: 10, note: "test users" }])
      .mockResolvedValueOnce([{ id: "ao1", label: "Bypass Auth", enabled: true }])
      .mockResolvedValueOnce([{ id: "env1", label: "API_KEY", enabled: false }]);
    vi.mocked(queryOne).mockResolvedValue({ project_path: "/project" });

    const updatedData = {
      entities: [{ name: "User", count: 5, note: "fewer users" }],
      authOverrides: [{ id: "ao1", label: "Bypass Auth", enabled: false }],
      envItems: [{ id: "env1", label: "API_KEY", enabled: true }],
    };
    vi.mocked(runClaude).mockResolvedValue({
      stdout: JSON.stringify(updatedData),
      stderr: "",
      exitCode: 0,
    });

    const runner = createEditContentRunner(4, "reduce user count");
    const result = await runner(makeCtx());

    expect(result).toEqual({ result: updatedData });
  });

  it("loads phase 5 data (flow scripts, steps, voiceovers, timeline markers) and edits it", async () => {
    vi.mocked(queryAll)
      .mockResolvedValueOnce([{ flow_id: "f1", flow_name: "Onboarding" }])
      .mockResolvedValueOnce([
        {
          id: "s1",
          flow_id: "f1",
          step_number: 1,
          url: "/",
          action: "click",
          expected_outcome: "page loads",
          duration: "3s",
        },
      ])
      .mockResolvedValueOnce([{ flow_id: "f1", paragraph_index: 0, text: "Welcome to the app" }])
      .mockResolvedValueOnce([{ flow_id: "f1", timestamp: "0:00", label: "Start", paragraph_index: 0 }]);
    vi.mocked(queryOne).mockResolvedValue({ project_path: "/project" });

    const updatedData = {
      flowScripts: [{ flow_id: "f1", flow_name: "Onboarding Updated" }],
      scriptSteps: [
        {
          id: "s1",
          flow_id: "f1",
          step_number: 1,
          url: "/home",
          action: "navigate",
          expected_outcome: "home loads",
          duration: "2s",
        },
      ],
      voiceovers: [{ flow_id: "f1", paragraph_index: 0, text: "Updated voiceover" }],
      timelineMarkers: [{ flow_id: "f1", timestamp: "0:05", label: "Intro", paragraph_index: 0 }],
    };
    vi.mocked(runClaude).mockResolvedValue({
      stdout: JSON.stringify(updatedData),
      stderr: "",
      exitCode: 0,
    });

    const runner = createEditContentRunner(5, "update voiceover text");
    const result = await runner(makeCtx());

    expect(result).toEqual({ result: updatedData });
  });

  it("throws for phase 6 (unsupported)", async () => {
    const runner = createEditContentRunner(6, "edit something");

    await expect(runner(makeCtx())).rejects.toThrow("No editable data for phase 6");
  });

  it("throws for phase 0 (unsupported)", async () => {
    const runner = createEditContentRunner(0, "edit something");

    await expect(runner(makeCtx())).rejects.toThrow("No editable data for phase 0");
  });

  it("fires all progress callbacks in order", async () => {
    setupPhase2Mocks();

    const ctx = makeCtx();
    const runner = createEditContentRunner(2, "edit");
    await runner(ctx);

    const progressCalls = ctx.onProgress.mock.calls.map((call) => ({
      message: call[0].message,
      progress: call[0].progress,
    }));

    // Filter to the fixed progress milestones (not the dynamic onProgress from runClaude)
    const milestones = progressCalls.filter((c) => [10, 30, 80, 90, 100].includes(c.progress));

    expect(milestones).toEqual([
      { message: "Loading current data...", progress: 10 },
      { message: "Editing project analysis and routes...", progress: 30 },
      { message: "Parsing edited content...", progress: 80 },
      { message: "Saving updated data...", progress: 90 },
      { message: "Edit complete", progress: 100 },
    ]);
  });

  it("throws with 'Failed to parse edit result' for malformed JSON", async () => {
    setupPhase2Mocks("{not: valid: json: {{}}}");

    const runner = createEditContentRunner(2, "edit");

    await expect(runner(makeCtx())).rejects.toThrow("Failed to parse edit result");
  });

  it("propagates database load errors", async () => {
    vi.mocked(queryAll).mockRejectedValueOnce(new Error("DB connection failed"));

    const runner = createEditContentRunner(2, "edit");

    await expect(runner(makeCtx())).rejects.toThrow("DB connection failed");
  });

  it("passes signal to runClaude", async () => {
    setupPhase2Mocks();

    const controller = new AbortController();
    const ctx = {
      onProgress: vi.fn(),
      signal: controller.signal,
      sessionId: "s1",
    };

    const runner = createEditContentRunner(2, "edit");
    await runner(ctx);

    expect(vi.mocked(runClaude)).toHaveBeenCalledWith(
      expect.objectContaining({
        signal: controller.signal,
      }),
    );
  });
});
