import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs", () => ({
  default: {
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
    statSync: vi.fn(),
    rmSync: vi.fn(),
  },
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  statSync: vi.fn(),
  rmSync: vi.fn(),
}));
vi.mock("@/lib/utils", () => ({
  expandTilde: vi.fn((p: string) => p.replace("~", "/home/user")),
}));

import fs from "node:fs";
import { deleteScreenshotFiles } from "./screenshot-service";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("screenshot-service", () => {
  describe("deleteScreenshotFiles", () => {
    it("removes project screenshot directory when it exists", () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);

      deleteScreenshotFiles("proj-1");

      expect(fs.rmSync).toHaveBeenCalledWith(expect.stringContaining("proj-1"), { recursive: true, force: true });
    });

    it("does nothing when directory does not exist", () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      deleteScreenshotFiles("proj-1");

      expect(fs.rmSync).not.toHaveBeenCalled();
    });

    it("ignores cleanup errors", () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.rmSync).mockImplementation(() => {
        throw new Error("permission denied");
      });

      // Should not throw
      expect(() => deleteScreenshotFiles("proj-1")).not.toThrow();
    });
  });
});
