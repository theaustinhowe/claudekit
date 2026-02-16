import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@devkit/claude-runner", () => ({
  runClaude: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  getDb: vi.fn(async () => ({})),
  execute: vi.fn(),
}));
vi.mock("@/lib/claude/prompts/analyze-project", () => ({
  buildAnalyzeProjectPrompt: vi.fn(() => "analyze prompt"),
}));

import { runClaude } from "@devkit/claude-runner";
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
    vi.mocked(runClaude).mockResolvedValue({ stdout: "no json here", costUsd: 0, durationMs: 1000 });

    const runner = createAnalyzeProjectRunner("/project");

    await expect(runner(makeCtx())).rejects.toThrow("No JSON found");
  });

  it("throws on invalid JSON from Claude", async () => {
    vi.mocked(runClaude).mockResolvedValue({ stdout: "{invalid json}", costUsd: 0, durationMs: 1000 });

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
      costUsd: 0.01,
      durationMs: 5000,
    });

    const runner = createAnalyzeProjectRunner("/project");
    const result = await runner(makeCtx());

    expect(result).toEqual({ result: analysis });
    // Clears existing data
    expect(execute).toHaveBeenCalledWith(expect.anything(), "DELETE FROM project_summary");
    expect(execute).toHaveBeenCalledWith(expect.anything(), "DELETE FROM routes");
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
      costUsd: 0,
      durationMs: 1000,
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

  it("extracts JSON from markdown-wrapped output", async () => {
    vi.mocked(runClaude).mockResolvedValue({
      stdout: '```json\n{"name": "Wrapped"}\n```',
      costUsd: 0,
      durationMs: 1000,
    });

    const runner = createAnalyzeProjectRunner("/project");
    const result = await runner(makeCtx());

    expect(result).toEqual({ result: { name: "Wrapped" } });
  });
});
