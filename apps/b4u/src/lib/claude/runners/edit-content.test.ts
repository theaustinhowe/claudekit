import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@claudekit/claude-runner", () => ({
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

import { runClaude } from "@claudekit/claude-runner";
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
    // loadPhaseData for phase 2: queryAll for summary, queryOne for routes from run_content
    vi.mocked(queryAll).mockResolvedValueOnce([{ name: "App", framework: "Next.js" }]); // summary
    vi.mocked(queryOne)
      .mockResolvedValueOnce({ data_json: JSON.stringify([{ path: "/", title: "Home" }]) }) // routes
      .mockResolvedValueOnce({ project_path: "/project" }); // project_path

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
    vi.mocked(queryOne)
      .mockResolvedValueOnce({ data_json: "[]" }) // routes
      .mockResolvedValueOnce({ project_path: "/p" }); // project_path
    vi.mocked(runClaude).mockResolvedValue({ stdout: "no json", stderr: "", exitCode: 0 });

    const runner = createEditContentRunner(2, "edit");

    await expect(runner(makeCtx())).rejects.toThrow("No JSON found");
  });

  // Helper to set up phase 2 mocks for reuse across tests
  function setupPhase2Mocks(stdout = '{"summary":{"name":"App"},"routes":[]}') {
    vi.mocked(queryAll).mockResolvedValueOnce([{ name: "App", framework: "Next.js" }]);
    vi.mocked(queryOne)
      .mockResolvedValueOnce({ data_json: JSON.stringify([{ path: "/", title: "Home" }]) }) // routes
      .mockResolvedValueOnce({ project_path: "/project" }); // project_path
    vi.mocked(runClaude).mockResolvedValue({ stdout, stderr: "", exitCode: 0 });
  }

  it("serializes directories with JSON.stringify and VARCHAR[] cast in phase 2", async () => {
    vi.mocked(queryAll).mockResolvedValueOnce([{ name: "App", framework: "Next.js" }]);
    vi.mocked(queryOne)
      .mockResolvedValueOnce({ data_json: JSON.stringify([{ path: "/", title: "Home" }]) }) // routes
      .mockResolvedValueOnce({ project_path: "/project" }); // project_path

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

  it("saves routes and flows to run_content in phase 3", async () => {
    // loadPhaseData for phase 3: queryOne for routes, queryOne for flows from run_content
    vi.mocked(queryOne)
      .mockResolvedValueOnce({
        data_json: JSON.stringify([{ path: "/", title: "Home", auth_required: false, description: "Main" }]),
      }) // routes
      .mockResolvedValueOnce({
        data_json: JSON.stringify([{ id: "f1", name: "Flow", steps: ["step1", "step2"] }]),
      }) // flows
      .mockResolvedValueOnce({ project_path: "/project" }); // project_path

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
    const flowsInsert = vi
      .mocked(execute)
      .mock.calls.find((call) => typeof call[1] === "string" && call[1].includes("'user_flows'"));
    expect(flowsInsert).toBeDefined();
  });

  it("loads phase 3 data (routes + flows) and edits it", async () => {
    vi.mocked(queryOne)
      .mockResolvedValueOnce({
        data_json: JSON.stringify([
          { path: "/dashboard", title: "Dashboard", auth_required: true, description: "Main page" },
        ]),
      }) // routes
      .mockResolvedValueOnce({
        data_json: JSON.stringify([{ id: 1, name: "Login Flow", steps: ["visit /login", "enter creds"] }]),
      }) // flows
      .mockResolvedValueOnce({ project_path: "/project" }); // project_path

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
    vi.mocked(queryOne)
      .mockResolvedValueOnce({ data_json: JSON.stringify([{ name: "User", count: 10, note: "test users" }]) }) // entities
      .mockResolvedValueOnce({ data_json: JSON.stringify([{ id: "ao1", label: "Bypass Auth", enabled: true }]) }) // auth
      .mockResolvedValueOnce({ data_json: JSON.stringify([{ id: "env1", label: "API_KEY", enabled: false }]) }) // env
      .mockResolvedValueOnce({ project_path: "/project" }); // project_path

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

  it("loads phase 5 data (flow scripts + voiceovers) and edits it", async () => {
    vi.mocked(queryAll)
      .mockResolvedValueOnce([
        {
          flow_id: "f1",
          flow_name: "Onboarding",
          steps_json: JSON.stringify([
            { id: "s1", stepNumber: 1, url: "/", action: "click", expectedOutcome: "page loads", duration: "3s" },
          ]),
        },
      ]) // flow_scripts
      .mockResolvedValueOnce([
        {
          flow_id: "f1",
          paragraphs_json: JSON.stringify(["Welcome to the app"]),
          markers_json: JSON.stringify([{ timestamp: "0:00", label: "Start", paragraphIndex: 0 }]),
        },
      ]); // flow_voiceover
    vi.mocked(queryOne).mockResolvedValue({ project_path: "/project" });

    const updatedData = {
      flowScripts: [{ flow_id: "f1", flow_name: "Onboarding Updated", steps: [] }],
      voiceovers: [
        {
          flow_id: "f1",
          paragraphs: ["Updated voiceover"],
          markers: [{ timestamp: "0:05", label: "Intro", paragraphIndex: 0 }],
        },
      ],
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
