import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@devkit/claude-runner", () => ({
  runClaude: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  getDb: vi.fn(async () => ({})),
  queryAll: vi.fn(),
  execute: vi.fn(),
}));
vi.mock("@/lib/claude/prompts/generate-scripts", () => ({
  buildGenerateScriptsPrompt: vi.fn(() => "scripts prompt"),
}));
vi.mock("@/lib/claude/prompts/generate-voiceover", () => ({
  buildGenerateVoiceoverPrompt: vi.fn(() => "voiceover prompt"),
}));

import { runClaude } from "@devkit/claude-runner";
import { execute, queryAll } from "@/lib/db";
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
    vi.mocked(queryAll)
      .mockResolvedValueOnce([{ name: "App", framework: "Next.js", project_path: "/p" }])
      .mockResolvedValueOnce([{ path: "/", title: "Home", description: "Main" }])
      .mockResolvedValueOnce([]); // no flows

    const runner = createGenerateScriptsRunner();

    await expect(runner(makeCtx())).rejects.toThrow("No user flows found");
  });

  it("runs two Claude calls (scripts then voiceover) and saves results", async () => {
    vi.mocked(queryAll)
      .mockResolvedValueOnce([{ name: "App", framework: "Next.js", project_path: "/p" }])
      .mockResolvedValueOnce([{ path: "/", title: "Home", description: "Main" }])
      .mockResolvedValueOnce([{ id: "f1", name: "Login", steps: ["step1"] }]);

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
      .mockResolvedValueOnce({ stdout: JSON.stringify(scripts), costUsd: 0, durationMs: 1000 })
      .mockResolvedValueOnce({ stdout: JSON.stringify(voiceover), costUsd: 0, durationMs: 1000 });

    const runner = createGenerateScriptsRunner();
    const result = await runner(makeCtx());

    expect(result).toEqual({ result: { scripts, voiceover } });
    expect(runClaude).toHaveBeenCalledTimes(2);
    expect(execute).toHaveBeenCalledWith(expect.anything(), "DELETE FROM flow_scripts");
    expect(execute).toHaveBeenCalledWith(expect.anything(), "DELETE FROM voiceover_scripts");
    expect(execute).toHaveBeenCalledWith(expect.anything(), "DELETE FROM timeline_markers");
  });

  it("throws when scripts Claude output has no JSON", async () => {
    vi.mocked(queryAll)
      .mockResolvedValueOnce([{ name: "App", framework: "Next.js", project_path: "/p" }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: "f1", name: "Login", steps: [] }]);

    vi.mocked(runClaude).mockResolvedValue({ stdout: "no json", costUsd: 0, durationMs: 1000 });

    const runner = createGenerateScriptsRunner();

    await expect(runner(makeCtx())).rejects.toThrow("No JSON found");
  });
});
