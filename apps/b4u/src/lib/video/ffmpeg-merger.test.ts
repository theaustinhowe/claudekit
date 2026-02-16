import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:child_process", () => ({
  spawn: vi.fn(),
}));

vi.mock("node:fs/promises", () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
}));

import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { concatenateVideos, mergeVideoAudio } from "@/lib/video/ffmpeg-merger";

const mockSpawn = vi.mocked(spawn);
const mockMkdir = vi.mocked(mkdir);
const mockWriteFile = vi.mocked(writeFile);

function createMockProcess(exitCode = 0) {
  const handlers: Record<string, ((...args: unknown[]) => void)[]> = {};
  const stderrHandlers: Record<string, ((...args: unknown[]) => void)[]> = {};

  const proc = {
    stderr: {
      on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
        if (!stderrHandlers[event]) stderrHandlers[event] = [];
        stderrHandlers[event].push(cb);
      }),
    },
    on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
      if (!handlers[event]) handlers[event] = [];
      handlers[event].push(cb);
      if (event === "close") {
        setTimeout(() => cb(exitCode), 0);
      }
    }),
    stdin: { write: vi.fn(), end: vi.fn() },
    stdout: { on: vi.fn() },
  };

  return proc;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("mergeVideoAudio", () => {
  it("spawns ffmpeg with correct arguments for merging", async () => {
    const proc = createMockProcess(0);
    mockSpawn.mockReturnValue(proc as never);

    await mergeVideoAudio({
      videoPath: "/tmp/video.mp4",
      audioPath: "/tmp/audio.mp3",
      outputPath: "/tmp/output.mp4",
    });

    expect(mockSpawn).toHaveBeenCalledWith(
      "ffmpeg",
      [
        "-y",
        "-i",
        "/tmp/video.mp4",
        "-i",
        "/tmp/audio.mp3",
        "-c:v",
        "copy",
        "-c:a",
        "aac",
        "-shortest",
        "/tmp/output.mp4",
      ],
      { stdio: ["pipe", "pipe", "pipe"] },
    );
  });

  it("rejects when ffmpeg exits with non-zero code", async () => {
    const proc = createMockProcess(1);
    mockSpawn.mockReturnValue(proc as never);

    await expect(
      mergeVideoAudio({
        videoPath: "/tmp/video.mp4",
        audioPath: "/tmp/audio.mp3",
        outputPath: "/tmp/output.mp4",
      }),
    ).rejects.toThrow("ffmpeg exited with code 1");
  });

  it("rejects with helpful message when ffmpeg is not found", async () => {
    const handlers: Record<string, ((...args: unknown[]) => void)[]> = {};
    const proc = {
      stderr: { on: vi.fn() },
      on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
        if (!handlers[event]) handlers[event] = [];
        handlers[event].push(cb);
        if (event === "error") {
          const err = new Error("spawn ffmpeg ENOENT") as NodeJS.ErrnoException;
          err.code = "ENOENT";
          setTimeout(() => cb(err), 0);
        }
      }),
      stdin: { write: vi.fn(), end: vi.fn() },
      stdout: { on: vi.fn() },
    };
    mockSpawn.mockReturnValue(proc as never);

    await expect(
      mergeVideoAudio({
        videoPath: "/tmp/video.mp4",
        audioPath: "/tmp/audio.mp3",
        outputPath: "/tmp/output.mp4",
      }),
    ).rejects.toThrow("ffmpeg not found");
  });
});

describe("concatenateVideos", () => {
  it("creates concat file and spawns ffmpeg", async () => {
    const proc = createMockProcess(0);
    mockSpawn.mockReturnValue(proc as never);

    await concatenateVideos(["/tmp/a.mp4", "/tmp/b.mp4"], "/tmp/combined.mp4");

    expect(mockMkdir).toHaveBeenCalled();
    expect(mockWriteFile).toHaveBeenCalledWith(
      expect.stringContaining("concat.txt"),
      "file '/tmp/a.mp4'\nfile '/tmp/b.mp4'",
    );
    expect(mockSpawn).toHaveBeenCalledWith("ffmpeg", expect.arrayContaining(["-f", "concat", "-safe", "0"]), {
      stdio: ["pipe", "pipe", "pipe"],
    });
  });

  it("passes the output path to ffmpeg", async () => {
    const proc = createMockProcess(0);
    mockSpawn.mockReturnValue(proc as never);

    await concatenateVideos(["/tmp/a.mp4"], "/tmp/final.mp4");

    const spawnArgs = mockSpawn.mock.calls[0][1] as string[];
    expect(spawnArgs[spawnArgs.length - 1]).toBe("/tmp/final.mp4");
  });
});
