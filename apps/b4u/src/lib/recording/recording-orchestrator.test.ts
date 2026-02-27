import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs/promises", () => ({
  mkdir: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  getDb: vi.fn(async () => ({})),
  queryAll: vi.fn(),
  queryOne: vi.fn(),
  execute: vi.fn(),
}));
vi.mock("./app-launcher", () => ({
  startDevServer: vi.fn(),
  stopDevServer: vi.fn(),
}));
vi.mock("./data-seeder", () => ({
  injectEnvOverrides: vi.fn(),
  restoreProject: vi.fn(),
}));
vi.mock("./playwright-runner", () => ({
  recordFlow: vi.fn(),
}));

import { execute, queryAll, queryOne } from "@/lib/db";
import { startDevServer, stopDevServer } from "./app-launcher";
import { restoreProject } from "./data-seeder";
import { recordFlow } from "./playwright-runner";
import { runRecordingPipeline } from "./recording-orchestrator";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("runRecordingPipeline", () => {
  const makeOptions = (overrides = {}) => ({
    projectPath: "/project",
    onProgress: vi.fn(),
    signal: new AbortController().signal,
    ...overrides,
  });

  it("throws when no flow scripts found", async () => {
    vi.mocked(queryAll).mockResolvedValueOnce([]); // flow_scripts (empty)
    vi.mocked(queryOne)
      .mockResolvedValueOnce(null) // entities
      .mockResolvedValueOnce(null) // auth overrides
      .mockResolvedValueOnce(null); // env items

    await expect(runRecordingPipeline(makeOptions())).rejects.toThrow("No flow scripts found");
  });

  it("runs the full pipeline: env setup, dev server, record, cleanup", async () => {
    vi.mocked(queryAll).mockResolvedValueOnce([
      {
        flow_id: "f1",
        flow_name: "Login",
        steps_json: JSON.stringify([
          { id: "s1", stepNumber: 1, url: "/", action: "click login", expectedOutcome: "ok", duration: "3s" },
        ]),
      },
    ]); // flow_scripts with embedded steps
    vi.mocked(queryOne)
      .mockResolvedValueOnce(null) // entities
      .mockResolvedValueOnce(null) // auth overrides
      .mockResolvedValueOnce(null); // env items

    vi.mocked(startDevServer).mockResolvedValue({
      process: { pid: 123 } as import("node:child_process").ChildProcess,
      url: "http://localhost:3000",
      pid: 123,
    });
    vi.mocked(recordFlow).mockResolvedValue({ videoPath: "/recordings/f1.webm", durationSeconds: 30, stepResults: [] });

    const result = await runRecordingPipeline(makeOptions());

    expect(startDevServer).toHaveBeenCalledWith("/project");
    expect(recordFlow).toHaveBeenCalledWith(
      expect.objectContaining({
        serverUrl: "http://localhost:3000",
        flowId: "f1",
      }),
    );
    expect(result.recordings).toHaveLength(1);
    expect(result.recordings[0]).toEqual({ flowId: "f1", videoPath: "/recordings/f1.webm", duration: 30 });
    expect(execute).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining("INSERT INTO recordings"),
      expect.arrayContaining(["rec-f1", "f1"]),
    );
  });

  it("filters flows by flowIds", async () => {
    vi.mocked(queryAll).mockResolvedValueOnce([
      { flow_id: "f1", flow_name: "Login", steps_json: "[]" },
      { flow_id: "f2", flow_name: "Dashboard", steps_json: "[]" },
    ]);
    vi.mocked(queryOne)
      .mockResolvedValueOnce(null) // entities
      .mockResolvedValueOnce(null) // auth overrides
      .mockResolvedValueOnce(null); // env items

    vi.mocked(startDevServer).mockResolvedValue({
      process: { pid: 123 } as import("node:child_process").ChildProcess,
      url: "http://localhost:3000",
      pid: 123,
    });
    vi.mocked(recordFlow).mockResolvedValue({ videoPath: "/recordings/f1.webm", durationSeconds: 20, stepResults: [] });

    const result = await runRecordingPipeline(makeOptions({ flowIds: ["f1"] }));

    expect(recordFlow).toHaveBeenCalledTimes(1);
    expect(result.recordings).toHaveLength(1);
    expect(result.recordings[0].flowId).toBe("f1");
  });

  it("stops dev server and restores project on error", async () => {
    vi.mocked(queryAll).mockResolvedValueOnce([
      {
        flow_id: "f1",
        flow_name: "Login",
        steps_json: JSON.stringify([
          { id: "s1", stepNumber: 1, url: "/", action: "x", expectedOutcome: "x", duration: "3s" },
        ]),
      },
    ]);
    vi.mocked(queryOne)
      .mockResolvedValueOnce(null) // entities
      .mockResolvedValueOnce(null) // auth overrides
      .mockResolvedValueOnce(null); // env items

    const mockProcess = { pid: 123 } as import("node:child_process").ChildProcess;
    vi.mocked(startDevServer).mockResolvedValue({ process: mockProcess, url: "http://localhost:3000", pid: 123 });
    vi.mocked(recordFlow).mockRejectedValue(new Error("Browser crashed"));

    await expect(runRecordingPipeline(makeOptions())).rejects.toThrow("Browser crashed");

    expect(stopDevServer).toHaveBeenCalledWith(mockProcess);
    expect(restoreProject).toHaveBeenCalledWith("/project");
  });
});
