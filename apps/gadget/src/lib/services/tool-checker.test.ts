import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));
vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
}));
vi.mock("node:util", () => ({
  promisify: vi.fn((fn: unknown) => fn),
}));
vi.mock("./version-resolver", () => ({
  resolveLatestVersion: vi.fn(),
  isNewerVersion: vi.fn(),
}));

import { execFile } from "node:child_process";
import type { ToolDefinition } from "@/lib/constants/tools";
import { checkTools } from "./tool-checker";
import { isNewerVersion, resolveLatestVersion } from "./version-resolver";

const mockExecFile = vi.mocked(execFile);
const mockResolveLatest = vi.mocked(resolveLatestVersion);
const mockIsNewer = vi.mocked(isNewerVersion);

function makeTool(overrides: Partial<ToolDefinition> = {}): ToolDefinition {
  return {
    id: "node",
    name: "Node.js",
    category: "runtime" as ToolDefinition["category"],
    description: "JavaScript runtime",
    binary: "node",
    versionCommand: "node --version",
    versionParser: "semver-line",
    installUrl: "https://nodejs.org",
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("checkTools", () => {
  it("returns installed=true when tool version is detected", async () => {
    mockExecFile.mockImplementation((_cmd: unknown, _args: unknown, _opts: unknown) => {
      return Promise.resolve({ stdout: "v20.11.0\n", stderr: "" }) as never;
    });

    const results = await checkTools([makeTool()]);
    expect(results).toHaveLength(1);
    expect(results[0].installed).toBe(true);
    expect(results[0].currentVersion).toBe("20.11.0");
    expect(results[0].toolId).toBe("node");
  });

  it("returns installed=false when tool is not found (ENOENT)", async () => {
    const error = new Error("not found") as NodeJS.ErrnoException;
    error.code = "ENOENT";
    mockExecFile.mockRejectedValue(error as never);

    const results = await checkTools([makeTool()]);
    expect(results).toHaveLength(1);
    expect(results[0].installed).toBe(false);
    expect(results[0].error).toBeNull();
  });

  it("returns installed=false with error on timeout", async () => {
    const error = new Error("timed out") as NodeJS.ErrnoException & { killed: boolean };
    error.killed = true;
    mockExecFile.mockRejectedValue(error as never);

    const results = await checkTools([makeTool()]);
    expect(results).toHaveLength(1);
    expect(results[0].installed).toBe(false);
    expect(results[0].error).toBe("Timed out");
  });

  it("returns installed=false with error message on other errors", async () => {
    const error = new Error("Permission denied");
    mockExecFile.mockRejectedValue(error as never);

    const results = await checkTools([makeTool()]);
    expect(results).toHaveLength(1);
    expect(results[0].installed).toBe(false);
    expect(results[0].error).toBe("Permission denied");
  });

  it("checks for updates when latestVersionSource is provided", async () => {
    mockExecFile.mockImplementation(() => {
      return Promise.resolve({ stdout: "v18.0.0\n", stderr: "" }) as never;
    });
    mockResolveLatest.mockResolvedValue("20.0.0");
    mockIsNewer.mockReturnValue(true);

    const tool = makeTool({ latestVersionSource: { type: "npm", package: "node" } });
    const results = await checkTools([tool]);

    expect(results[0].latestVersion).toBe("20.0.0");
    expect(results[0].updateAvailable).toBe(true);
  });

  it("parses version with first-line parser", async () => {
    mockExecFile.mockImplementation(() => {
      return Promise.resolve({ stdout: "Python 3.12.1\nsome other line\n", stderr: "" }) as never;
    });

    const tool = makeTool({
      id: "python",
      versionCommand: "python3 --version",
      versionParser: "first-line",
    });
    const results = await checkTools([tool]);
    expect(results[0].currentVersion).toBe("Python 3.12.1");
  });

  it("parses version with regex parser", async () => {
    mockExecFile.mockImplementation(() => {
      return Promise.resolve({ stdout: "rustc 1.75.0 (82e1608df 2023-12-21)\n", stderr: "" }) as never;
    });

    const tool = makeTool({
      id: "rustc",
      versionCommand: "rustc --version",
      versionParser: "regex",
      versionRegex: "rustc (\\d+\\.\\d+\\.\\d+)",
    });
    const results = await checkTools([tool]);
    expect(results[0].currentVersion).toBe("1.75.0");
  });

  it("falls back to stderr when stdout is empty", async () => {
    mockExecFile.mockImplementation(() => {
      return Promise.resolve({ stdout: "", stderr: 'java version "21.0.1"\n' }) as never;
    });

    const tool = makeTool({
      id: "java",
      versionCommand: "java -version",
      versionParser: "semver-line",
    });
    const results = await checkTools([tool]);
    expect(results[0].installed).toBe(true);
    expect(results[0].currentVersion).toBe("21.0.1");
  });

  it("checks multiple tools and returns results in original order", async () => {
    mockExecFile.mockImplementation((_cmd: unknown) => {
      return Promise.resolve({ stdout: "v1.0.0\n", stderr: "" }) as never;
    });

    const tools = [makeTool({ id: "a" }), makeTool({ id: "b" }), makeTool({ id: "c" })];
    const results = await checkTools(tools);
    expect(results.map((r) => r.toolId)).toEqual(["a", "b", "c"]);
  });
});
