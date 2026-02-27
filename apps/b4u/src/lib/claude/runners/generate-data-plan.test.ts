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
vi.mock("@/lib/claude/prompts/generate-data-plan", () => ({
  buildGenerateDataPlanPrompt: vi.fn(() => "data plan prompt"),
}));

import { runClaude } from "@claudekit/claude-runner";
import { execute, queryAll, queryOne } from "@/lib/db";
import { createGenerateDataPlanRunner } from "./generate-data-plan";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createGenerateDataPlanRunner", () => {
  const makeCtx = () => ({
    onProgress: vi.fn(),
    signal: new AbortController().signal,
    sessionId: "s1",
  });

  it("throws when no project summary found", async () => {
    vi.mocked(queryAll).mockResolvedValue([]);

    const runner = createGenerateDataPlanRunner("test-run-id");

    await expect(runner(makeCtx())).rejects.toThrow("No project summary found");
  });

  it("throws when no user flows found", async () => {
    vi.mocked(queryAll).mockResolvedValueOnce([
      { name: "App", framework: "Next.js", auth: "n", database_info: "n", project_path: "/p" },
    ]);
    vi.mocked(queryOne)
      .mockResolvedValueOnce({ data_json: JSON.stringify([{ path: "/", title: "Home" }]) }) // routes
      .mockResolvedValueOnce(null); // no flows

    const runner = createGenerateDataPlanRunner("test-run-id");

    await expect(runner(makeCtx())).rejects.toThrow("No user flows found");
  });

  it("saves data plan to DB on success", async () => {
    vi.mocked(queryAll).mockResolvedValueOnce([
      { name: "App", framework: "Next.js", auth: "n", database_info: "n", project_path: "/p" },
    ]);
    vi.mocked(queryOne)
      .mockResolvedValueOnce({ data_json: JSON.stringify([{ path: "/", title: "Home" }]) }) // routes
      .mockResolvedValueOnce({ data_json: JSON.stringify([{ id: "f1", name: "Login", steps: [] }]) }); // flows

    const dataPlan = {
      entities: [{ name: "users", count: 10, note: "test users" }],
      authOverrides: [{ id: "skip-auth", label: "Skip Auth", enabled: true }],
      envItems: [{ id: "mock-data", label: "Mock Data", enabled: true }],
    };
    vi.mocked(runClaude).mockResolvedValue({
      stdout: JSON.stringify(dataPlan),
      stderr: "",
      exitCode: 0,
    });

    const runner = createGenerateDataPlanRunner("test-run-id");
    const result = await runner(makeCtx());

    expect(result).toEqual({ result: dataPlan });
    expect(execute).toHaveBeenCalledWith(
      expect.anything(),
      "DELETE FROM run_content WHERE run_id = ? AND content_type IN ('mock_data_entities', 'auth_overrides', 'env_items')",
      ["test-run-id"],
    );
    expect(execute).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining("'mock_data_entities'"),
      expect.any(Array),
    );
  });
});
