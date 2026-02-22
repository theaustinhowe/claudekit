import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@claudekit/claude-runner", () => ({
  runClaude: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  getDb: vi.fn(async () => ({})),
  execute: vi.fn(),
}));
vi.mock("@/lib/claude/prompts/analyze-project", () => ({
  buildAnalyzeProjectPrompt: vi.fn(() => "analyze prompt"),
}));

import { runClaude } from "@claudekit/claude-runner";
import { execute } from "@/lib/db";
import { createAnalyzeProjectRunner } from "./analyze-project";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createAnalyzeProjectRunner", () => {
  const makeCtx = () => ({
    onProgress: vi.fn(),
    signal: new AbortController().signal,
    sessionId: "s1",
  });

  it("throws when Claude returns no JSON", async () => {
    vi.mocked(runClaude).mockResolvedValue({ stdout: "no json here", stderr: "", exitCode: 0 });

    const runner = createAnalyzeProjectRunner("/project");

    await expect(runner(makeCtx())).rejects.toThrow("No JSON found");
  });

  it("throws on invalid JSON from Claude", async () => {
    vi.mocked(runClaude).mockResolvedValue({ stdout: "{invalid json}", stderr: "", exitCode: 0 });

    const runner = createAnalyzeProjectRunner("/project");

    await expect(runner(makeCtx())).rejects.toThrow("Failed to parse analysis");
  });

  it("saves analysis to DB on success", async () => {
    const analysis = {
      name: "MyApp",
      framework: "Next.js",
      auth: "OAuth",
      database: "PostgreSQL",
      routes: [{ path: "/home", title: "Home", authRequired: false, description: "Main page" }],
    };
    vi.mocked(runClaude).mockResolvedValue({
      stdout: JSON.stringify(analysis),
      stderr: "",
      exitCode: 0,
    });

    const runner = createAnalyzeProjectRunner("/project");
    const result = await runner(makeCtx());

    expect(result).toEqual({ result: analysis });
    // Clears existing data
    expect(execute).toHaveBeenCalledWith(expect.anything(), "DELETE FROM project_summary WHERE run_id = ?", [
      undefined,
    ]);
    expect(execute).toHaveBeenCalledWith(
      expect.anything(),
      "DELETE FROM run_content WHERE run_id = ? AND content_type IN ('routes', 'file_tree')",
      [undefined],
    );
    // Inserts project summary
    expect(execute).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining("INSERT INTO project_summary"),
      expect.arrayContaining(["MyApp", "Next.js"]),
    );
  });

  it("reports progress through onProgress", async () => {
    vi.mocked(runClaude).mockResolvedValue({
      stdout: '{"name": "Test"}',
      stderr: "",
      exitCode: 0,
    });

    const ctx = makeCtx();
    const runner = createAnalyzeProjectRunner("/project");
    await runner(ctx);

    expect(ctx.onProgress).toHaveBeenCalledWith(
      expect.objectContaining({ type: "progress", message: "Analyzing project structure..." }),
    );
    expect(ctx.onProgress).toHaveBeenCalledWith(
      expect.objectContaining({ type: "progress", message: "Analysis complete", progress: 100 }),
    );
  });

  it("serializes directories as JSON with VARCHAR[] cast", async () => {
    const analysis = {
      name: "MyApp",
      framework: "Next.js",
      directories: ["src/app", "src/components"],
      auth: "None",
      database: "None",
    };
    vi.mocked(runClaude).mockResolvedValue({
      stdout: JSON.stringify(analysis),
      stderr: "",
      exitCode: 0,
    });

    const runner = createAnalyzeProjectRunner("/project");
    await runner(makeCtx());

    // Verify the INSERT uses ?::VARCHAR[] cast
    const insertCall = vi
      .mocked(execute)
      .mock.calls.find((call) => typeof call[1] === "string" && call[1].includes("INSERT INTO project_summary"));
    expect(insertCall).toBeDefined();
    expect(insertCall?.[1]).toContain("?::VARCHAR[]");
    // Verify directories are JSON.stringify'd
    expect(insertCall?.[2]).toContain(JSON.stringify(["src/app", "src/components"]));
  });

  it("extracts JSON from markdown-wrapped output", async () => {
    vi.mocked(runClaude).mockResolvedValue({
      stdout: '```json\n{"name": "Wrapped"}\n```',
      stderr: "",
      exitCode: 0,
    });

    const runner = createAnalyzeProjectRunner("/project");
    const result = await runner(makeCtx());

    expect(result).toEqual({ result: { name: "Wrapped" } });
  });
});
