import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@claudekit/claude-runner", () => ({
  runClaude: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  getDb: vi.fn(async () => ({})),
  queryAll: vi.fn(),
  execute: vi.fn(),
}));
vi.mock("@/lib/claude/prompts/generate-outline", () => ({
  buildGenerateOutlinePrompt: vi.fn(() => "outline prompt"),
}));

import { runClaude } from "@claudekit/claude-runner";
import { execute, queryAll } from "@/lib/db";
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
    vi.mocked(queryAll)
      .mockResolvedValueOnce([
        { name: "App", framework: "Next.js", auth: "none", database_info: "none", project_path: "/p" },
      ])
      .mockResolvedValueOnce([]);
    vi.mocked(runClaude).mockResolvedValue({ stdout: "no json", stderr: "", exitCode: 0 });

    const runner = createGenerateOutlineRunner();

    await expect(runner(makeCtx())).rejects.toThrow("No JSON found");
  });

  it("saves outline to DB on success", async () => {
    vi.mocked(queryAll)
      .mockResolvedValueOnce([
        { name: "App", framework: "Next.js", auth: "none", database_info: "none", project_path: "/p" },
      ])
      .mockResolvedValueOnce([{ path: "/", title: "Home", auth_required: false, description: "Main" }]);

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
    expect(execute).toHaveBeenCalledWith(expect.anything(), "DELETE FROM routes WHERE run_id = ?", [undefined]);
    expect(execute).toHaveBeenCalledWith(expect.anything(), "DELETE FROM user_flows WHERE run_id = ?", [undefined]);

    // Verify steps INSERT uses ?::VARCHAR[] cast and JSON.stringify
    const flowInsertCall = vi
      .mocked(execute)
      .mock.calls.find((call) => typeof call[1] === "string" && call[1].includes("INSERT INTO user_flows"));
    expect(flowInsertCall).toBeDefined();
    expect(flowInsertCall?.[1]).toContain("?::VARCHAR[]");
    expect(flowInsertCall?.[2]).toContain(JSON.stringify(["step1"]));
  });
});
