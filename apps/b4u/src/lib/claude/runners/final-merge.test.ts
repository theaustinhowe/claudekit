import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs/promises", () => ({
  mkdir: vi.fn(),
}));
vi.mock("node:fs", () => ({
  statSync: vi.fn(() => ({ size: 5000 })),
}));
vi.mock("@/lib/db", () => ({
  getDb: vi.fn(async () => ({})),
  queryAll: vi.fn(),
  execute: vi.fn(),
}));
vi.mock("@/lib/video/chapter-generator", () => ({
  generateChapters: vi.fn(),
}));
vi.mock("@/lib/video/ffmpeg-merger", () => ({
  concatenateVideos: vi.fn(),
  mergeVideoAudio: vi.fn(),
}));

import { execute, queryAll } from "@/lib/db";
import { generateChapters } from "@/lib/video/chapter-generator";
import { concatenateVideos, mergeVideoAudio } from "@/lib/video/ffmpeg-merger";
import { createFinalMergeRunner } from "./final-merge";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createFinalMergeRunner", () => {
  const makeCtx = () => ({
    onProgress: vi.fn(),
    signal: new AbortController().signal,
    sessionId: "s1",
  });

  it("throws when no recordings found", async () => {
    vi.mocked(queryAll)
      .mockResolvedValueOnce([]) // recordings
      .mockResolvedValueOnce([]) // audio_files
      .mockResolvedValueOnce([]); // flow_scripts

    const runner = createFinalMergeRunner();

    await expect(runner(makeCtx())).rejects.toThrow("No recordings found");
  });

  it("concatenates videos and generates chapters on success", async () => {
    vi.mocked(queryAll)
      .mockResolvedValueOnce([{ id: "r1", flow_id: "f1", video_path: "/v1.mp4", duration_seconds: 30 }])
      .mockResolvedValueOnce([]) // no audio
      .mockResolvedValueOnce([{ flow_id: "f1", flow_name: "Login" }])
      .mockResolvedValueOnce([{ name: "MyApp", project_path: "/project" }]);

    vi.mocked(generateChapters).mockReturnValue([{ flowName: "Login", startTime: "0:00", startSeconds: 0 }]);

    const runner = createFinalMergeRunner();
    const result = await runner(makeCtx());

    expect(concatenateVideos).toHaveBeenCalled();
    expect(mergeVideoAudio).not.toHaveBeenCalled(); // no audio
    expect(generateChapters).toHaveBeenCalled();
    expect(execute).toHaveBeenCalledWith(expect.anything(), "DELETE FROM chapter_markers");
    expect(execute).toHaveBeenCalledWith(expect.anything(), "DELETE FROM final_videos");
    expect(result.result).toHaveProperty("videoPath");
    expect(result.result).toHaveProperty("chapters");
  });

  it("merges audio when audio files exist", async () => {
    vi.mocked(queryAll)
      .mockResolvedValueOnce([{ id: "r1", flow_id: "f1", video_path: "/v1.mp4", duration_seconds: 30 }])
      .mockResolvedValueOnce([{ id: "a1", flow_id: "f1", file_path: "/a1.mp3", duration_seconds: 25 }])
      .mockResolvedValueOnce([{ flow_id: "f1", flow_name: "Login" }])
      .mockResolvedValueOnce([{ name: "MyApp", project_path: "/project" }]);

    vi.mocked(generateChapters).mockReturnValue([]);

    const runner = createFinalMergeRunner();
    await runner(makeCtx());

    expect(mergeVideoAudio).toHaveBeenCalledWith(expect.objectContaining({ audioPath: "/a1.mp3" }));
  });

  it("throws when aborted", async () => {
    vi.mocked(queryAll)
      .mockResolvedValueOnce([{ id: "r1", flow_id: "f1", video_path: "/v1.mp4", duration_seconds: 30 }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ name: "App", project_path: "/p" }]);

    const controller = new AbortController();
    controller.abort();

    const runner = createFinalMergeRunner();

    await expect(runner({ onProgress: vi.fn(), signal: controller.signal, sessionId: "s1" })).rejects.toThrow(
      "Aborted",
    );
  });
});
