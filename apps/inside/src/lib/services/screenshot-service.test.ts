import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs", () => ({
  default: {
    mkdirSync: vi.fn(),
    statSync: vi.fn().mockReturnValue({ size: 12345 }),
    existsSync: vi.fn().mockReturnValue(false),
    rmSync: vi.fn(),
  },
  mkdirSync: vi.fn(),
  statSync: vi.fn().mockReturnValue({ size: 12345 }),
  existsSync: vi.fn().mockReturnValue(false),
  rmSync: vi.fn(),
}));

vi.mock("@claudekit/playwright", () => ({
  captureScreenshot: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/utils", () => ({
  expandTilde: vi.fn((p: string) => p.replace("~", "/Users/testuser")),
}));

import fs from "node:fs";
import { captureScreenshot as playwrightScreenshot } from "@claudekit/playwright";
import { captureScreenshot, deleteScreenshotFiles } from "./screenshot-service";

const mockFs = vi.mocked(fs);
const mockPlaywright = vi.mocked(playwrightScreenshot);

beforeEach(() => {
  vi.resetAllMocks();
  mockFs.statSync.mockReturnValue({ size: 12345 } as ReturnType<typeof fs.statSync>);
  mockPlaywright.mockResolvedValue(undefined as never);
});

describe("captureScreenshot", () => {
  it("captures a screenshot and returns result", async () => {
    const result = await captureScreenshot("proj-1", 3000);

    expect(result).not.toBeNull();
    expect(result!.width).toBe(1280);
    expect(result!.height).toBe(800);
    expect(result!.fileSize).toBe(12345);
    expect(result!.filePath).toContain("proj-1");
    expect(result!.filePath).toContain(".png");
  });

  it("creates project directory", async () => {
    await captureScreenshot("proj-1", 3000);

    expect(mockFs.mkdirSync).toHaveBeenCalledWith(expect.stringContaining("proj-1"), { recursive: true });
  });

  it("calls playwright with correct URL and options", async () => {
    await captureScreenshot("proj-1", 3000);

    expect(mockPlaywright).toHaveBeenCalledWith(
      "http://localhost:3000",
      expect.objectContaining({
        viewport: { width: 1280, height: 800 },
      }),
    );
  });

  it("returns null on failure", async () => {
    mockPlaywright.mockRejectedValue(new Error("Browser error"));

    const result = await captureScreenshot("proj-1", 3000);

    expect(result).toBeNull();
  });
});

describe("deleteScreenshotFiles", () => {
  it("removes directory when it exists", () => {
    mockFs.existsSync.mockReturnValue(true);

    deleteScreenshotFiles("proj-1");

    expect(mockFs.rmSync).toHaveBeenCalledWith(expect.stringContaining("proj-1"), { recursive: true, force: true });
  });

  it("does nothing when directory does not exist", () => {
    mockFs.existsSync.mockReturnValue(false);

    deleteScreenshotFiles("proj-1");

    expect(mockFs.rmSync).not.toHaveBeenCalled();
  });

  it("handles cleanup errors gracefully", () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.rmSync.mockImplementation(() => {
      throw new Error("cleanup error");
    });

    // Should not throw
    expect(() => deleteScreenshotFiles("proj-1")).not.toThrow();
  });
});
