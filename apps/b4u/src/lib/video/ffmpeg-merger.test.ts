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
import { concatenateAudioFiles, concatenateVideos, generateSilence, mergeVideoAudio } from "@/lib/video/ffmpeg-merger";

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

function createMockProcessWithStderr(exitCode: number, stderrData: string) {
  const handlers: Record<string, ((...args: unknown[]) => void)[]> = {};
  const stderrHandlers: Record<string, ((...args: unknown[]) => void)[]> = {};

  const proc = {
    stderr: {
      on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
        if (!stderrHandlers[event]) stderrHandlers[event] = [];
        stderrHandlers[event].push(cb);
        if (event === "data") {
          setTimeout(() => cb(Buffer.from(stderrData)), 0);
        }
      }),
    },
    on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
      if (!handlers[event]) handlers[event] = [];
      handlers[event].push(cb);
      if (event === "close") {
        setTimeout(() => cb(exitCode), 10);
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

describe("concatenateAudioFiles", () => {
  it("creates audio-concat.txt and calls ffmpeg with -c copy", async () => {
    const proc = createMockProcess(0);
    mockSpawn.mockReturnValue(proc as never);

    await concatenateAudioFiles(["/tmp/a.mp3", "/tmp/b.mp3"], "/tmp/combined.mp3");

    expect(mockWriteFile).toHaveBeenCalledWith(
      expect.stringContaining("audio-concat.txt"),
      "file '/tmp/a.mp3'\nfile '/tmp/b.mp3'",
    );
    expect(mockSpawn).toHaveBeenCalledWith(
      "ffmpeg",
      expect.arrayContaining(["-f", "concat", "-safe", "0", "-c", "copy"]),
      { stdio: ["pipe", "pipe", "pipe"] },
    );
  });

  it("writes correct file content for multiple paths", async () => {
    const proc = createMockProcess(0);
    mockSpawn.mockReturnValue(proc as never);

    await concatenateAudioFiles(["/tmp/x.mp3", "/tmp/y.mp3", "/tmp/z.mp3"], "/tmp/out.mp3");

    expect(mockWriteFile).toHaveBeenCalledWith(
      expect.stringContaining("audio-concat.txt"),
      "file '/tmp/x.mp3'\nfile '/tmp/y.mp3'\nfile '/tmp/z.mp3'",
    );
  });

  it("creates the tmp directory with recursive option", async () => {
    const proc = createMockProcess(0);
    mockSpawn.mockReturnValue(proc as never);

    await concatenateAudioFiles(["/tmp/a.mp3"], "/tmp/out.mp3");

    expect(mockMkdir).toHaveBeenCalledWith(expect.stringContaining("tmp"), { recursive: true });
  });

  it("rejects on ffmpeg error (exit code 1)", async () => {
    const proc = createMockProcess(1);
    mockSpawn.mockReturnValue(proc as never);

    await expect(concatenateAudioFiles(["/tmp/a.mp3"], "/tmp/out.mp3")).rejects.toThrow("ffmpeg exited with code 1");
  });
});

describe("generateSilence", () => {
  it("calls ffmpeg with anullsrc filter and correct duration", async () => {
    const proc = createMockProcess(0);
    mockSpawn.mockReturnValue(proc as never);

    await generateSilence("/tmp/silence.mp3", 5);

    expect(mockSpawn).toHaveBeenCalledWith(
      "ffmpeg",
      ["-y", "-f", "lavfi", "-i", "anullsrc=r=22050:cl=mono", "-t", "5", "-c:a", "libmp3lame", "/tmp/silence.mp3"],
      { stdio: ["pipe", "pipe", "pipe"] },
    );
  });

  it("passes output path as last argument", async () => {
    const proc = createMockProcess(0);
    mockSpawn.mockReturnValue(proc as never);

    await generateSilence("/tmp/out.mp3", 10);

    const spawnArgs = mockSpawn.mock.calls[0][1] as string[];
    expect(spawnArgs[spawnArgs.length - 1]).toBe("/tmp/out.mp3");
  });

  it("rejects on ffmpeg error", async () => {
    const proc = createMockProcess(1);
    mockSpawn.mockReturnValue(proc as never);

    await expect(generateSilence("/tmp/silence.mp3", 3)).rejects.toThrow("ffmpeg exited with code 1");
  });
});

describe("stderr truncation", () => {
  it("truncates stderr to last 500 characters on error", async () => {
    const longStderr = "x".repeat(1000);
    const proc = createMockProcessWithStderr(1, longStderr);
    mockSpawn.mockReturnValue(proc as never);

    let caughtError: Error | undefined;
    try {
      await mergeVideoAudio({
        videoPath: "/tmp/video.mp4",
        audioPath: "/tmp/audio.mp3",
        outputPath: "/tmp/output.mp4",
      });
    } catch (err) {
      caughtError = err as Error;
    }

    expect(caughtError).toBeDefined();
    expect(caughtError?.message).toContain("ffmpeg exited with code 1");
    // The full stderr is 1000 chars, but slice(-500) should truncate it
    const stderrPortion = (caughtError?.message ?? "").split(": ").slice(1).join(": ");
    expect(stderrPortion.length).toBeLessThanOrEqual(500);
  });
});
