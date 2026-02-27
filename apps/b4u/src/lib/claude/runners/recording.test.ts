import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/recording/recording-orchestrator", () => ({
  runRecordingPipeline: vi.fn(),
}));

import { runRecordingPipeline } from "@/lib/recording/recording-orchestrator";
import { createRecordingRunner } from "./recording";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createRecordingRunner", () => {
  const makeCtx = () => ({
    onProgress: vi.fn(),
    signal: new AbortController().signal,
    sessionId: "s1",
  });

  it("delegates to runRecordingPipeline", async () => {
    const recordings = [{ flowId: "f1", videoPath: "/v.mp4", duration: 30 }];
    vi.mocked(runRecordingPipeline).mockResolvedValue({ recordings });

    const runner = createRecordingRunner("/project", ["f1"], "test-run-id");
    const result = await runner(makeCtx());

    expect(runRecordingPipeline).toHaveBeenCalledWith(
      expect.objectContaining({
        projectPath: "/project",
        flowIds: ["f1"],
      }),
    );
    expect(result).toEqual({ result: { recordings } });
  });

  it("passes signal and onProgress to pipeline", async () => {
    vi.mocked(runRecordingPipeline).mockResolvedValue({ recordings: [] });

    const ctx = makeCtx();
    const runner = createRecordingRunner("/project", undefined, "test-run-id");
    await runner(ctx);

    expect(runRecordingPipeline).toHaveBeenCalledWith(
      expect.objectContaining({
        onProgress: ctx.onProgress,
        signal: ctx.signal,
      }),
    );
  });

  it("propagates pipeline errors", async () => {
    vi.mocked(runRecordingPipeline).mockRejectedValue(new Error("No flow scripts found"));

    const runner = createRecordingRunner("/project", undefined, "test-run-id");

    await expect(runner(makeCtx())).rejects.toThrow("No flow scripts found");
  });
});
