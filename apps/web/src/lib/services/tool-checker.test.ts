import { beforeEach, describe, expect, it, vi } from "vitest";

// Must mock before imports
vi.mock("node:child_process", () => ({
  exec: vi.fn(),
  execFile: vi.fn(),
  execFileSync: vi.fn(),
}));

vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
}));

vi.mock("./version-resolver", () => ({
  resolveLatestVersion: vi.fn(),
  isNewerVersion: vi.fn(),
}));

import { exec, execFile, execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import type { ToolDefinition } from "@/lib/types/toolbox";
import { checkTools } from "./tool-checker";
import { isNewerVersion, resolveLatestVersion } from "./version-resolver";

const mockExec = vi.mocked(exec);
const mockExecFile = vi.mocked(execFile);
const mockExecFileSync = vi.mocked(execFileSync);
const mockExistsSync = vi.mocked(existsSync);
const mockReadFileSync = vi.mocked(readFileSync);
const mockResolveLatest = vi.mocked(resolveLatestVersion);
const mockIsNewer = vi.mocked(isNewerVersion);

function makeTool(overrides: Partial<ToolDefinition> = {}): ToolDefinition {
  return {
    id: "test-tool",
    name: "Test Tool",
    category: "dev-tool",
    description: "A test tool",
    binary: "test-bin",
    versionCommand: "test-bin --version",
    versionParser: "semver-line",
    installUrl: "https://example.com",
    latestVersionSource: { type: "none" },
    ...overrides,
  };
}

/** Simulate promisify(execFile) by invoking the callback argument */
function setupExecFile(stdout: string, stderr = "") {
  mockExecFile.mockImplementation(((...args: unknown[]) => {
    const cb = args.find((a) => typeof a === "function") as
      | ((err: null, result: { stdout: string; stderr: string }) => void)
      | undefined;
    cb?.(null, { stdout, stderr });
    return undefined as never;
  }) as never);
}

/** Simulate promisify(exec) by invoking the callback argument (for shellFunction tools) */
function setupExec(stdout: string, stderr = "") {
  mockExec.mockImplementation(((...args: unknown[]) => {
    const cb = args.find((a) => typeof a === "function") as
      | ((err: null, result: { stdout: string; stderr: string }) => void)
      | undefined;
    cb?.(null, { stdout, stderr });
    return undefined as never;
  }) as never);
}

function setupExecFileError(error: NodeJS.ErrnoException & { killed?: boolean }) {
  mockExecFile.mockImplementation(((...args: unknown[]) => {
    const cb = args.find((a) => typeof a === "function") as ((err: Error) => void) | undefined;
    cb?.(error);
    return undefined as never;
  }) as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockExecFileSync.mockReturnValue("");
  mockExistsSync.mockReturnValue(false);
  mockResolveLatest.mockResolvedValue(null);
  mockIsNewer.mockReturnValue(false);
});

describe("checkTools", () => {
  it("checks multiple tools and returns results in original order", async () => {
    setupExecFile("v1.0.0\n");

    const tools = [makeTool({ id: "a" }), makeTool({ id: "b" }), makeTool({ id: "c" })];

    const results = await checkTools(tools);

    expect(results).toHaveLength(3);
    expect(results[0].toolId).toBe("a");
    expect(results[1].toolId).toBe("b");
    expect(results[2].toolId).toBe("c");
  });

  it("returns empty array for empty tool list", async () => {
    const results = await checkTools([]);
    expect(results).toEqual([]);
  });
});

describe("checkTool (via checkTools)", () => {
  it("parses version with semver-line parser", async () => {
    setupExecFile("node v22.11.0\n");

    const results = await checkTools([makeTool({ versionParser: "semver-line" })]);

    expect(results[0].installed).toBe(true);
    expect(results[0].currentVersion).toBe("22.11.0");
  });

  it("parses version with first-line parser", async () => {
    setupExecFile("9.15.0\n");

    const results = await checkTools([makeTool({ versionParser: "first-line" })]);

    expect(results[0].installed).toBe(true);
    expect(results[0].currentVersion).toBe("9.15.0");
  });

  it("parses version with regex parser", async () => {
    setupExecFile("git version 2.45.2\n");

    const results = await checkTools([
      makeTool({
        versionParser: "regex",
        versionRegex: "git version ([\\d.]+)",
      }),
    ]);

    expect(results[0].installed).toBe(true);
    expect(results[0].currentVersion).toBe("2.45.2");
  });

  it("detects update available", async () => {
    setupExecFile("v1.0.0\n");
    mockResolveLatest.mockResolvedValue("1.1.0");
    mockIsNewer.mockReturnValue(true);

    const results = await checkTools([makeTool({ latestVersionSource: { type: "npm", package: "test" } })]);

    expect(results[0].updateAvailable).toBe(true);
    expect(results[0].latestVersion).toBe("1.1.0");
  });

  it("marks not installed on ENOENT", async () => {
    const err = new Error("spawn test-bin ENOENT") as NodeJS.ErrnoException;
    err.code = "ENOENT";
    setupExecFileError(err);

    const results = await checkTools([makeTool()]);

    expect(results[0].installed).toBe(false);
    expect(results[0].error).toBeNull();
  });

  it("marks timed out when killed", async () => {
    const err = new Error("killed") as NodeJS.ErrnoException & { killed: boolean };
    err.killed = true;
    setupExecFileError(err);

    const results = await checkTools([makeTool()]);

    expect(results[0].installed).toBe(false);
    expect(results[0].error).toBe("Timed out");
  });

  it("returns error message for other errors", async () => {
    const err = new Error("permission denied") as NodeJS.ErrnoException;
    err.code = "EPERM";
    setupExecFileError(err);

    const results = await checkTools([makeTool()]);

    expect(results[0].installed).toBe(false);
    expect(results[0].error).toBe("permission denied");
  });

  it("handles nvm shell function — not installed when nvm.sh missing", async () => {
    mockExistsSync.mockReturnValue(false);

    const results = await checkTools([
      makeTool({
        id: "nvm",
        shellFunction: true,
        versionCommand: 'bash -c "source ~/.nvm/nvm.sh && nvm --version"',
      }),
    ]);

    expect(results[0].installed).toBe(false);
  });

  it("handles nvm shell function — installed when nvm.sh exists", async () => {
    // existsSync returns true for nvm.sh check
    mockExistsSync.mockReturnValue(true);
    setupExec("0.40.1\n");

    const results = await checkTools([
      makeTool({
        id: "nvm",
        shellFunction: true,
        detectInstallMethod: false,
        versionCommand: 'bash -c "source ~/.nvm/nvm.sh && nvm --version"',
        versionParser: "first-line",
      }),
    ]);

    expect(results[0].installed).toBe(true);
    expect(results[0].currentVersion).toBe("0.40.1");
  });
});

describe("detectInstallMethod and metadata", () => {
  it("detects homebrew install method from binary path", async () => {
    setupExecFile("v22.0.0\n");
    mockExecFileSync.mockReturnValue("/opt/homebrew/bin/test-bin\n");

    const results = await checkTools([makeTool()]);

    expect(results[0].metadata?.installMethod).toBe("homebrew");
    expect(results[0].metadata?.binaryPath).toBe("/opt/homebrew/bin/test-bin");
  });

  it("detects npm install method from binary path", async () => {
    setupExecFile("v1.0.0\n");
    mockExecFileSync.mockReturnValue("/Users/test/.nvm/versions/node/v22/bin/test-bin\n");

    const results = await checkTools([makeTool()]);

    expect(results[0].metadata?.installMethod).toBe("npm");
  });

  it("returns unknown when which fails", async () => {
    setupExecFile("v1.0.0\n");
    mockExecFileSync.mockImplementation(() => {
      throw new Error("not found");
    });

    const results = await checkTools([makeTool()]);

    expect(results[0].metadata?.installMethod).toBe("unknown");
  });

  it("skips install method detection when detectInstallMethod is false", async () => {
    setupExecFile("v1.0.0\n");

    const results = await checkTools([makeTool({ detectInstallMethod: false })]);

    expect(results[0].metadata).toBeUndefined();
  });
});

describe("detectClaudeMetadata", () => {
  it("detects oauth auth and plan from .claude.json", async () => {
    setupExecFile("1.0.20 (Claude Code)\n");
    mockExecFileSync.mockReturnValue("/opt/homebrew/bin/claude\n");
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(
      JSON.stringify({
        oauthAccount: { billingType: "max_5x" },
      }),
    );

    const results = await checkTools([
      makeTool({
        id: "claude",
        binary: "claude",
        versionCommand: "claude --version",
        versionParser: "semver-line",
      }),
    ]);

    expect(results[0].metadata?.authMethod).toBe("oauth");
    expect(results[0].metadata?.planType).toBe("max 5x");
  });

  it("handles missing .claude.json gracefully", async () => {
    setupExecFile("1.0.20\n");
    mockExecFileSync.mockReturnValue("/opt/homebrew/bin/claude\n");
    mockExistsSync.mockImplementation((p) => {
      // Return false for .claude.json, true for which check
      return typeof p === "string" && !p.toString().includes(".claude.json");
    });

    const results = await checkTools([
      makeTool({
        id: "claude",
        binary: "claude",
        versionCommand: "claude --version",
        versionParser: "semver-line",
      }),
    ]);

    expect(results[0].metadata?.authMethod).toBeNull();
    expect(results[0].metadata?.planType).toBeNull();
  });
});
