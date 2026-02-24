import { describe, expect, it, vi } from "vitest";

vi.mock("node:child_process", () => ({
  execFile: vi.fn((...args: unknown[]) => {
    const cb = args[args.length - 1];
    if (typeof cb === "function") cb(null, "1.0.0", "");
    return {};
  }),
  execFileSync: vi.fn().mockReturnValue(""),
}));

vi.mock("node:fs", () => ({
  existsSync: vi.fn().mockReturnValue(false),
  readFileSync: vi.fn().mockReturnValue("{}"),
}));

vi.mock("./version-resolver", () => ({
  resolveLatestVersion: vi.fn().mockResolvedValue(null),
  isNewerVersion: vi.fn().mockReturnValue(false),
}));

import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import type { ToolDefinition } from "@/lib/constants/tools";
import { checkTools } from "./tool-checker";

const mockExecFile = vi.mocked(execFile);
const mockExistsSync = vi.mocked(existsSync);

function makeTool(overrides: Partial<ToolDefinition> = {}): ToolDefinition {
  return {
    id: "test-tool",
    name: "Test Tool",
    category: "dev-tool",
    description: "A test tool",
    binary: "test-bin",
    versionCommand: "test-bin --version",
    versionParser: "first-line",
    installUrl: "https://example.com",
    latestVersionSource: { type: "none" },
    ...overrides,
  };
}

describe("checkTools", () => {
  it("returns results for all provided tools", async () => {
    const tools = [makeTool({ id: "tool1" }), makeTool({ id: "tool2" })];
    const results = await checkTools(tools);
    expect(results).toHaveLength(2);
    expect(results[0].toolId).toBe("tool1");
    expect(results[1].toolId).toBe("tool2");
  });

  it("marks tool as not installed when ENOENT error", async () => {
    mockExecFile.mockImplementation((...args: unknown[]) => {
      const cb = args[args.length - 1];
      const err = new Error("ENOENT") as NodeJS.ErrnoException;
      err.code = "ENOENT";
      if (typeof cb === "function") cb(err, "", "");
      return {} as ReturnType<typeof execFile>;
    });
    const results = await checkTools([makeTool()]);
    expect(results[0].installed).toBe(false);
    expect(results[0].error).toBeNull();
  });

  it("marks tool as not installed when command not found", async () => {
    mockExecFile.mockImplementation((...args: unknown[]) => {
      const cb = args[args.length - 1];
      if (typeof cb === "function") cb(new Error("command not found"), "", "");
      return {} as ReturnType<typeof execFile>;
    });
    const results = await checkTools([makeTool()]);
    expect(results[0].installed).toBe(false);
    expect(results[0].error).toBeNull();
  });

  it("reports timeout error when process is killed", async () => {
    mockExecFile.mockImplementation((...args: unknown[]) => {
      const cb = args[args.length - 1];
      const err = new Error("killed") as Error & { killed?: boolean };
      err.killed = true;
      if (typeof cb === "function") cb(err, "", "");
      return {} as ReturnType<typeof execFile>;
    });
    const results = await checkTools([makeTool()]);
    expect(results[0].error).toBe("Timed out");
  });

  it("handles nvm shell function when nvm.sh not found", async () => {
    mockExistsSync.mockReturnValue(false);
    const results = await checkTools([
      makeTool({ id: "nvm", shellFunction: true, versionCommand: "bash -c nvm --version" }),
    ]);
    expect(results[0].installed).toBe(false);
  });

  it("returns empty array for empty tools list", async () => {
    const results = await checkTools([]);
    expect(results).toEqual([]);
  });
});
