import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs", () => ({
  default: {
    readdirSync: vi.fn(),
    renameSync: vi.fn(),
    rmSync: vi.fn(),
  },
}));

import fs from "node:fs";
import { finalizeVideo } from "./video";

const mockedReaddirSync = vi.mocked(fs.readdirSync);
const mockedRenameSync = vi.mocked(fs.renameSync);
const mockedRmSync = vi.mocked(fs.rmSync);

beforeEach(() => {
  vi.resetAllMocks();
});

describe("finalizeVideo", () => {
  it("renames .webm to destPath, cleans up rawDir, returns destPath", () => {
    mockedReaddirSync.mockReturnValue(["recording.webm"]);

    const result = finalizeVideo("/tmp/raw", "/output/video.webm");

    expect(mockedRenameSync).toHaveBeenCalledWith("/tmp/raw/recording.webm", "/output/video.webm");
    expect(mockedRmSync).toHaveBeenCalledWith("/tmp/raw", { recursive: true, force: true });
    expect(result).toBe("/output/video.webm");
  });

  it("uses the first .webm file when multiple exist", () => {
    mockedReaddirSync.mockReturnValue(["first.webm", "second.webm"]);

    finalizeVideo("/tmp/raw", "/output/video.webm");

    expect(mockedRenameSync).toHaveBeenCalledWith("/tmp/raw/first.webm", "/output/video.webm");
  });

  it("filters to .webm files only", () => {
    mockedReaddirSync.mockReturnValue(["notes.txt", "thumb.png", "recording.webm"]);

    finalizeVideo("/tmp/raw", "/output/video.webm");

    expect(mockedRenameSync).toHaveBeenCalledWith("/tmp/raw/recording.webm", "/output/video.webm");
  });

  it("throws when no .webm file found", () => {
    mockedReaddirSync.mockReturnValue(["notes.txt", "thumb.png"]);

    expect(() => finalizeVideo("/tmp/raw", "/output/video.webm")).toThrow("No video file produced");
  });

  it("throws on empty directory", () => {
    mockedReaddirSync.mockReturnValue([]);

    expect(() => finalizeVideo("/tmp/raw", "/output/video.webm")).toThrow("No video file produced");
  });
});
