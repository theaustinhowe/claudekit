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
import { execute, queryAll, queryOne } from "@/lib/db";
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
      costUsd: 0,
      durationMs: 1000,
    });

    const runner = createEditContentRunner(2, "rename to NewApp");
    const result = await runner(makeCtx());

    expect(result).toEqual({ result: updatedData });
  });

  it("throws when Claude returns no JSON", async () => {
    vi.mocked(queryAll).mockResolvedValue([{ name: "App" }]);
    vi.mocked(queryOne).mockResolvedValue({ project_path: "/p" });
    vi.mocked(runClaude).mockResolvedValue({ stdout: "no json", costUsd: 0, durationMs: 1000 });

    const runner = createEditContentRunner(2, "edit");

    await expect(runner(makeCtx())).rejects.toThrow("No JSON found");
  });
});
