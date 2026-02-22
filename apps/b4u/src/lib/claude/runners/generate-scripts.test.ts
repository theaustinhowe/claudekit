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
vi.mock("@/lib/claude/prompts/generate-scripts", () => ({
  buildGenerateScriptsPrompt: vi.fn(() => "scripts prompt"),
}));
vi.mock("@/lib/claude/prompts/generate-voiceover", () => ({
  buildGenerateVoiceoverPrompt: vi.fn(() => "voiceover prompt"),
}));

import { runClaude } from "@claudekit/claude-runner";
import { execute, queryAll, queryOne } from "@/lib/db";
import { createGenerateScriptsRunner } from "./generate-scripts";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createGenerateScriptsRunner", () => {
  const makeCtx = () => ({
    onProgress: vi.fn(),
    signal: new AbortController().signal,
    sessionId: "s1",
  });

  it("throws when no project summary found", async () => {
    vi.mocked(queryAll).mockResolvedValue([]);

    const runner = createGenerateScriptsRunner();

    await expect(runner(makeCtx())).rejects.toThrow("No project summary found");
  });

  it("throws when no user flows found", async () => {
    vi.mocked(queryAll).mockResolvedValueOnce([{ name: "App", framework: "Next.js", project_path: "/p" }]);
    vi.mocked(queryOne)
      .mockResolvedValueOnce({ data_json: JSON.stringify([{ path: "/", title: "Home", description: "Main" }]) }) // routes
      .mockResolvedValueOnce(null); // no flows

    const runner = createGenerateScriptsRunner();

    await expect(runner(makeCtx())).rejects.toThrow("No user flows found");
  });

  it("runs two Claude calls (scripts then voiceover) and saves results", async () => {
    vi.mocked(queryAll).mockResolvedValueOnce([{ name: "App", framework: "Next.js", project_path: "/p" }]);
    vi.mocked(queryOne)
      .mockResolvedValueOnce({
        data_json: JSON.stringify([{ path: "/", title: "Home", description: "Main" }]),
      }) // routes
      .mockResolvedValueOnce({
        data_json: JSON.stringify([{ id: "f1", name: "Login", steps: ["step1"] }]),
      }); // flows

    const scripts = {
      scripts: [
        {
          flowId: "f1",
          flowName: "Login",
          steps: [{ id: "s1", stepNumber: 1, url: "/", action: "click", expectedOutcome: "ok", duration: "3s" }],
        },
      ],
    };
    const voiceover = {
      voiceovers: { f1: ["Paragraph 1"] },
      timelineMarkers: { f1: [{ timestamp: "0:00", label: "Start", paragraphIndex: 0 }] },
    };

    vi.mocked(runClaude)
      .mockResolvedValueOnce({ stdout: JSON.stringify(scripts), stderr: "", exitCode: 0 })
      .mockResolvedValueOnce({ stdout: JSON.stringify(voiceover), stderr: "", exitCode: 0 });

    const runner = createGenerateScriptsRunner();
    const result = await runner(makeCtx());

    expect(result).toEqual({ result: { scripts, voiceover } });
    expect(runClaude).toHaveBeenCalledTimes(2);
    expect(execute).toHaveBeenCalledWith(expect.anything(), "DELETE FROM flow_scripts WHERE run_id = ?", [undefined]);
    expect(execute).toHaveBeenCalledWith(expect.anything(), "DELETE FROM flow_voiceover WHERE run_id = ?", [undefined]);
  });

  it("throws when scripts Claude output has no JSON", async () => {
    vi.mocked(queryAll).mockResolvedValueOnce([{ name: "App", framework: "Next.js", project_path: "/p" }]);
    vi.mocked(queryOne)
      .mockResolvedValueOnce({ data_json: "[]" }) // routes
      .mockResolvedValueOnce({ data_json: JSON.stringify([{ id: "f1", name: "Login", steps: [] }]) }); // flows

    vi.mocked(runClaude).mockResolvedValue({ stdout: "no json", stderr: "", exitCode: 0 });

    const runner = createGenerateScriptsRunner();

    await expect(runner(makeCtx())).rejects.toThrow("No JSON found");
  });
});
