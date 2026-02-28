import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs", () => ({
  default: {
    readdirSync: vi.fn(),
    renameSync: vi.fn(),
    rmSync: vi.fn(),
  },
}));

import fs from "node:fs";
import { cast } from "@claudekit/test-utils";
import { finalizeVideo } from "./video";

const mockedReaddirSync = vi.mocked(fs.readdirSync);
const mockedRenameSync = vi.mocked(fs.renameSync);
const mockedRmSync = vi.mocked(fs.rmSync);

// vi.mocked resolves readdirSync to the Dirent-returning overload;
// our source uses the string-returning overload (with "utf-8" encoding)
function mockReaddir(files: string[]) {
  mockedReaddirSync.mockReturnValue(cast(files));
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("finalizeVideo", () => {
  it("renames .webm to destPath, cleans up rawDir, returns destPath", () => {
    mockReaddir(["recording.webm"]);

    const result = finalizeVideo("/tmp/raw", "/output/video.webm");

    expect(mockedRenameSync).toHaveBeenCalledWith("/tmp/raw/recording.webm", "/output/video.webm");
    expect(mockedRmSync).toHaveBeenCalledWith("/tmp/raw", { recursive: true, force: true });
    expect(result).toBe("/output/video.webm");
  });

  it("uses the first .webm file when multiple exist", () => {
    mockReaddir(["first.webm", "second.webm"]);

    finalizeVideo("/tmp/raw", "/output/video.webm");

    expect(mockedRenameSync).toHaveBeenCalledWith("/tmp/raw/first.webm", "/output/video.webm");
  });

  it("filters to .webm files only", () => {
    mockReaddir(["notes.txt", "thumb.png", "recording.webm"]);

    finalizeVideo("/tmp/raw", "/output/video.webm");

    expect(mockedRenameSync).toHaveBeenCalledWith("/tmp/raw/recording.webm", "/output/video.webm");
  });

  it("throws when no .webm file found", () => {
    mockReaddir(["notes.txt", "thumb.png"]);

    expect(() => finalizeVideo("/tmp/raw", "/output/video.webm")).toThrow("No video file produced");
  });

  it("throws on empty directory", () => {
    mockReaddir([]);

    expect(() => finalizeVideo("/tmp/raw", "/output/video.webm")).toThrow("No video file produced");
  });
});
