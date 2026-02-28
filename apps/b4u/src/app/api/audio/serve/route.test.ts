import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs/promises", () => ({
  readdir: vi.fn(),
  readFile: vi.fn(),
  stat: vi.fn(),
}));
vi.mock("@/lib/video/ffmpeg-merger", () => ({
  concatenateAudioFiles: vi.fn(),
}));

import { readdir, readFile, stat } from "node:fs/promises";
import { cast } from "@claudekit/test-utils";
import { GET } from "@/app/api/audio/serve/route";
import { concatenateAudioFiles } from "@/lib/video/ffmpeg-merger";

const mockReaddirRaw = vi.mocked(readdir);
const mockReadFile = vi.mocked(readFile);
const mockStat = vi.mocked(stat);
const mockConcatenate = vi.mocked(concatenateAudioFiles);

// vi.mocked resolves readdir to the Dirent-returning overload;
// our source uses the string-returning overload (with "utf-8" encoding)
function mockReaddir(files: string[]) {
  mockReaddirRaw.mockResolvedValue(cast(files));
}

const audioDir = `${process.cwd()}/data/audio`;
const fakeBuffer = Buffer.from("fake-audio-data");

beforeEach(() => {
  vi.clearAllMocks();
  mockReadFile.mockResolvedValue(fakeBuffer);
});

describe("GET /api/audio/serve", () => {
  it("returns 404 when readdir throws", async () => {
    mockReaddirRaw.mockRejectedValue(new Error("ENOENT"));

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe("No audio files found");
  });

  it("returns 404 when directory is empty", async () => {
    mockReaddir([]);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe("No audio files found");
  });

  it("serves single MP3 file directly without concatenation", async () => {
    mockReaddir(["flow-1.mp3"]);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(mockConcatenate).not.toHaveBeenCalled();
    expect(mockReadFile).toHaveBeenCalledWith(`${audioDir}/flow-1.mp3`);
  });

  it("concatenates multiple files when combined file does not exist", async () => {
    mockReaddir(["flow-1.mp3", "flow-2.mp3"]);
    mockStat.mockImplementation((p: unknown) => {
      const filePath = p as string;
      if (filePath.includes("combined")) {
        return Promise.reject(new Error("ENOENT"));
      }
      return Promise.resolve({ mtimeMs: 1000 } as Awaited<ReturnType<typeof stat>>);
    });

    const response = await GET();

    expect(response.status).toBe(200);
    expect(mockConcatenate).toHaveBeenCalledWith(
      [`${audioDir}/flow-1.mp3`, `${audioDir}/flow-2.mp3`],
      `${audioDir}/combined-walkthrough.mp3`,
    );
  });

  it("skips regeneration when combined file is fresh", async () => {
    mockReaddir(["flow-1.mp3", "flow-2.mp3"]);
    mockStat.mockImplementation((p: unknown) => {
      const filePath = p as string;
      if (filePath.includes("combined")) {
        return Promise.resolve({ mtimeMs: 3000 } as Awaited<ReturnType<typeof stat>>);
      }
      return Promise.resolve({ mtimeMs: 1000 } as Awaited<ReturnType<typeof stat>>);
    });

    const response = await GET();

    expect(response.status).toBe(200);
    expect(mockConcatenate).not.toHaveBeenCalled();
  });

  it("regenerates when combined file is stale", async () => {
    mockReaddir(["flow-1.mp3", "flow-2.mp3"]);
    mockStat.mockImplementation((p: unknown) => {
      const filePath = p as string;
      if (filePath.includes("combined")) {
        return Promise.resolve({ mtimeMs: 500 } as Awaited<ReturnType<typeof stat>>);
      }
      return Promise.resolve({ mtimeMs: 1000 } as Awaited<ReturnType<typeof stat>>);
    });

    const response = await GET();

    expect(response.status).toBe(200);
    expect(mockConcatenate).toHaveBeenCalledWith(
      [`${audioDir}/flow-1.mp3`, `${audioDir}/flow-2.mp3`],
      `${audioDir}/combined-walkthrough.mp3`,
    );
  });

  it("excludes combined-* files from source listing", async () => {
    mockReaddir(["combined-old.mp3", "combined-walkthrough.mp3", "flow-1.mp3"]);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(mockReadFile).toHaveBeenCalledWith(`${audioDir}/flow-1.mp3`);
    expect(mockConcatenate).not.toHaveBeenCalled();
  });

  it("returns correct headers", async () => {
    mockReaddir(["flow-1.mp3"]);

    const response = await GET();

    expect(response.headers.get("Content-Type")).toBe("audio/mpeg");
    expect(response.headers.get("Content-Disposition")).toBe('attachment; filename="walkthrough-audio.mp3"');
    expect(response.headers.get("Content-Length")).toBe(String(fakeBuffer.length));
  });
});
