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
vi.mock("@/lib/claude/prompts/generate-outline", () => ({
  buildGenerateOutlinePrompt: vi.fn(() => "outline prompt"),
}));

import { runClaude } from "@claudekit/claude-runner";
import { execute, queryAll, queryOne } from "@/lib/db";
import { createGenerateOutlineRunner } from "./generate-outline";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createGenerateOutlineRunner", () => {
  const makeCtx = () => ({
    onProgress: vi.fn(),
    signal: new AbortController().signal,
    sessionId: "s1",
  });

  it("throws when no project summary found", async () => {
    vi.mocked(queryAll).mockResolvedValue([]);

    const runner = createGenerateOutlineRunner();

    await expect(runner(makeCtx())).rejects.toThrow("No project summary found");
  });

  it("throws when Claude returns no JSON", async () => {
    vi.mocked(queryAll).mockResolvedValueOnce([
      { name: "App", framework: "Next.js", auth: "none", database_info: "none", project_path: "/p" },
    ]);
    vi.mocked(queryOne).mockResolvedValueOnce({ data_json: "[]" }); // routes from run_content
    vi.mocked(runClaude).mockResolvedValue({ stdout: "no json", stderr: "", exitCode: 0 });

    const runner = createGenerateOutlineRunner();

    await expect(runner(makeCtx())).rejects.toThrow("No JSON found");
  });

  it("saves outline to DB on success", async () => {
    vi.mocked(queryAll).mockResolvedValueOnce([
      { name: "App", framework: "Next.js", auth: "none", database_info: "none", project_path: "/p" },
    ]);
    vi.mocked(queryOne).mockResolvedValueOnce({
      data_json: JSON.stringify([{ path: "/", title: "Home", authRequired: false, description: "Main" }]),
    });

    const outline = {
      routes: [{ path: "/", title: "Home" }],
      flows: [{ id: "f1", name: "Login", steps: ["step1"] }],
    };
    vi.mocked(runClaude).mockResolvedValue({
      stdout: JSON.stringify(outline),
      stderr: "",
      exitCode: 0,
    });

    const runner = createGenerateOutlineRunner();
    const result = await runner(makeCtx());

    expect(result).toEqual({ result: outline });
    expect(execute).toHaveBeenCalledWith(
      expect.anything(),
      "DELETE FROM run_content WHERE run_id = ? AND content_type IN ('routes', 'user_flows')",
      [undefined],
    );

    // Verify routes INSERT into run_content
    const routesInsert = vi
      .mocked(execute)
      .mock.calls.find((call) => typeof call[1] === "string" && call[1].includes("'routes'"));
    expect(routesInsert).toBeDefined();

    // Verify flows INSERT into run_content
    const flowsInsert = vi
      .mocked(execute)
      .mock.calls.find((call) => typeof call[1] === "string" && call[1].includes("'user_flows'"));
    expect(flowsInsert).toBeDefined();
  });
});
