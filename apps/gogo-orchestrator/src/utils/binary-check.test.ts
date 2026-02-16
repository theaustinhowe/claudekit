import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockExecFilePromise } = vi.hoisted(() => ({
  mockExecFilePromise: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

vi.mock("node:util", () => ({
  promisify: () => mockExecFilePromise,
}));

import { checkBinaries, formatValidationResults } from "./binary-check.js";

type ExecResult = { stdout: string; stderr: string };
type BinaryMockConfig = Record<string, { path?: string; version?: string; missing?: boolean }>;

function setupBinaryMocks(config: BinaryMockConfig) {
  mockExecFilePromise.mockImplementation((cmd: string, args: string[], _opts?: unknown): Promise<ExecResult> => {
    const isWhich = cmd === "which" || cmd === "where";

    if (isWhich) {
      const binary = args[0];
      const cfg = config[binary];
      if (!cfg || cfg.missing) {
        return Promise.reject(new Error(`${binary} not found`));
      }
      return Promise.resolve({ stdout: cfg.path || `/usr/bin/${binary}\n`, stderr: "" });
    }

    // Version check: cmd is the binary name, args is [--version]
    const cfg = config[cmd];
    if (!cfg || cfg.missing) {
      return Promise.reject(new Error(`${cmd} not found`));
    }
    return Promise.resolve({ stdout: cfg.version || "1.0.0\n", stderr: "" });
  });
}

describe("binary-check", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe("formatValidationResults", () => {
    it("should format all-found results", () => {
      const validation = {
        allRequiredFound: true,
        results: [
          { name: "git", found: true, version: "2.39.0", path: "/usr/bin/git", error: null },
          { name: "node", found: true, version: "20.10.0", path: "/usr/bin/node", error: null },
          { name: "claude", found: true, version: "1.0.0", path: "/usr/bin/claude", error: null },
        ],
        missingRequired: [],
        missingOptional: [],
      };

      const output = formatValidationResults(validation);

      expect(output).toContain("Binary Dependencies:");
      expect(output).toContain("git");
      expect(output).toContain("2.39.0");
      expect(output).toContain("node");
      expect(output).toContain("20.10.0");
      expect(output).not.toContain("ERROR");
    });

    it("should show missing required binaries with error", () => {
      const validation = {
        allRequiredFound: false,
        results: [
          { name: "git", found: false, version: null, path: null, error: "git not found in PATH" },
          { name: "node", found: true, version: "20.10.0", path: "/usr/bin/node", error: null },
          { name: "claude", found: true, version: "1.0.0", path: "/usr/bin/claude", error: null },
        ],
        missingRequired: [{ name: "git", found: false, version: null, path: null, error: "git not found in PATH" }],
        missingOptional: [],
      };

      const output = formatValidationResults(validation);

      expect(output).toContain("missing (REQUIRED)");
      expect(output).toContain("ERROR: Required binaries are missing");
      expect(output).toContain("brew install git");
    });

    it("should show missing optional binaries without error", () => {
      const validation = {
        allRequiredFound: true,
        results: [
          { name: "git", found: true, version: "2.39.0", path: "/usr/bin/git", error: null },
          { name: "node", found: true, version: "20.10.0", path: "/usr/bin/node", error: null },
          { name: "claude", found: false, version: null, path: null, error: "claude not found in PATH" },
        ],
        missingRequired: [],
        missingOptional: [
          { name: "claude", found: false, version: null, path: null, error: "claude not found in PATH" },
        ],
      };

      const output = formatValidationResults(validation);

      expect(output).toContain("missing (optional)");
      expect(output).not.toContain("ERROR");
    });
  });

  describe("checkBinaries", () => {
    it("should return allRequiredFound true when all required binaries exist", async () => {
      setupBinaryMocks({
        git: { path: "/usr/bin/git\n", version: "git version 2.39.0\n" },
        node: { path: "/usr/bin/node\n", version: "v20.10.0\n" },
        claude: { path: "/usr/bin/claude\n", version: "1.0.0\n" },
      });

      const result = await checkBinaries();

      expect(result.allRequiredFound).toBe(true);
      expect(result.results).toHaveLength(3);
      expect(result.missingRequired).toHaveLength(0);
    });

    it("should detect missing required binary", async () => {
      setupBinaryMocks({
        git: { missing: true },
        node: { path: "/usr/bin/node\n", version: "v20.10.0\n" },
        claude: { missing: true },
      });

      const result = await checkBinaries();

      expect(result.allRequiredFound).toBe(false);
      expect(result.missingRequired).toHaveLength(1);
      expect(result.missingRequired[0].name).toBe("git");
    });

    it("should detect missing optional binary without failing", async () => {
      setupBinaryMocks({
        git: { path: "/usr/bin/git\n", version: "git version 2.39.0\n" },
        node: { path: "/usr/bin/node\n", version: "v20.10.0\n" },
        claude: { missing: true },
      });

      const result = await checkBinaries();

      expect(result.allRequiredFound).toBe(true);
      expect(result.missingOptional).toHaveLength(1);
      expect(result.missingOptional[0].name).toBe("claude");
    });

    it("should extract version from various output formats", async () => {
      setupBinaryMocks({
        git: { path: "/usr/bin/git\n", version: "git version 2.39.3 (Apple Git-146)\n" },
        node: { path: "/usr/bin/node\n", version: "v22.1.0\n" },
        claude: { path: "/usr/bin/claude\n", version: "Claude Code CLI v1.2.3\n" },
      });

      const result = await checkBinaries();

      expect(result.results[0].version).toBe("2.39.3");
      expect(result.results[1].version).toBe("22.1.0");
      expect(result.results[2].version).toBe("1.2.3");
    });
  });
});
