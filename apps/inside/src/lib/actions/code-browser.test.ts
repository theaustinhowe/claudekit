import { describe, expect, it, vi } from "vitest";

vi.mock("node:child_process", () => ({
  execFile: vi.fn((...args: unknown[]) => {
    const cb = args[args.length - 1];
    if (typeof cb === "function") cb(null, "", "");
    return {};
  }),
}));

import { openFolderInFinder } from "./code-browser";

describe("openFolderInFinder", () => {
  it("calls open with the directory path", async () => {
    await openFolderInFinder("/tmp/my-project");
    const { execFile } = await import("node:child_process");
    const mockExecFile = vi.mocked(execFile);
    expect(mockExecFile).toHaveBeenCalledWith("open", ["/tmp/my-project"], expect.any(Function));
  });

  it("resolves without error on success", async () => {
    await expect(openFolderInFinder("/tmp/test")).resolves.toBeUndefined();
  });
});
