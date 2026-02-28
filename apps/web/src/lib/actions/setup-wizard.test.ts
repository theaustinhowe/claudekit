import { cast } from "@claudekit/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
}));

vi.mock("@/lib/env-parser", () => ({
  parseEnvExample: vi.fn(),
  deduplicateVariables: vi.fn(),
}));

import { readFile, writeFile } from "node:fs/promises";
import { deduplicateVariables, parseEnvExample } from "@/lib/env-parser";
import { loadSetupData, saveSetupEnv } from "./setup-wizard";

const mockReadFile = vi.mocked(readFile);
const mockWriteFile = vi.mocked(writeFile);
const mockParseEnvExample = vi.mocked(parseEnvExample);
const mockDeduplicateVariables = vi.mocked(deduplicateVariables);

// The cwd is deep inside the monorepo during tests
const FAKE_ROOT = "/workspace/claudekit";

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(process, "cwd").mockReturnValue(`${FAKE_ROOT}/apps/web`);
});

/** Helper: configure readFile to find pnpm-workspace.yaml at FAKE_ROOT */
function setupWorkspaceRoot() {
  mockReadFile.mockImplementation(async (filePath: Parameters<typeof readFile>[0]) => {
    const p = filePath.toString();

    // Walk-up: fail at apps/web, succeed at root
    if (p === `${FAKE_ROOT}/apps/web/pnpm-workspace.yaml`) {
      throw new Error("ENOENT");
    }
    if (p === `${FAKE_ROOT}/apps/pnpm-workspace.yaml`) {
      throw new Error("ENOENT");
    }
    if (p === `${FAKE_ROOT}/pnpm-workspace.yaml`) {
      return cast("packages:\n  - apps/*");
    }

    // Default: not found
    throw new Error(`ENOENT: ${p}`);
  });
}

describe("loadSetupData", () => {
  it("finds pnpm-workspace.yaml in cwd", async () => {
    vi.spyOn(process, "cwd").mockReturnValue(FAKE_ROOT);
    mockReadFile.mockImplementation(async (filePath: Parameters<typeof readFile>[0]) => {
      const p = filePath.toString();
      if (p === `${FAKE_ROOT}/pnpm-workspace.yaml`) return cast("packages:");
      throw new Error("ENOENT");
    });
    mockParseEnvExample.mockReturnValue([]);
    mockDeduplicateVariables.mockReturnValue({ sharedVariables: [], appVariables: {} });

    await loadSetupData();

    // Should have tried to read .env.example files from root
    expect(mockReadFile).toHaveBeenCalledWith(`${FAKE_ROOT}/.env.example`, "utf-8");
  });

  it("walks up directories to find workspace root", async () => {
    setupWorkspaceRoot();
    mockParseEnvExample.mockReturnValue([]);
    mockDeduplicateVariables.mockReturnValue({ sharedVariables: [], appVariables: {} });

    await loadSetupData();

    // Verifies it walked up from apps/web to root
    expect(mockReadFile).toHaveBeenCalledWith(`${FAKE_ROOT}/apps/web/pnpm-workspace.yaml`, "utf-8");
    expect(mockReadFile).toHaveBeenCalledWith(`${FAKE_ROOT}/pnpm-workspace.yaml`, "utf-8");
  });

  it("throws when workspace root not found", async () => {
    mockReadFile.mockRejectedValue(new Error("ENOENT"));
    vi.spyOn(process, "cwd").mockReturnValue("/");

    await expect(loadSetupData()).rejects.toThrow("Could not find monorepo root");
  });

  it("reads all 7 .env.example files from ENV_FILES config", async () => {
    setupWorkspaceRoot();
    mockParseEnvExample.mockReturnValue([]);
    mockDeduplicateVariables.mockReturnValue({ sharedVariables: [], appVariables: {} });

    await loadSetupData();

    const readPaths = mockReadFile.mock.calls.map((c) => c[0].toString());
    expect(readPaths).toContain(`${FAKE_ROOT}/.env.example`);
    expect(readPaths).toContain(`${FAKE_ROOT}/apps/b4u/.env.example`);
    expect(readPaths).toContain(`${FAKE_ROOT}/apps/gadget/.env.example`);
    expect(readPaths).toContain(`${FAKE_ROOT}/apps/gogo-web/.env.example`);
    expect(readPaths).toContain(`${FAKE_ROOT}/apps/gogo-orchestrator/.env.example`);
    expect(readPaths).toContain(`${FAKE_ROOT}/apps/inspector/.env.example`);
    expect(readPaths).toContain(`${FAKE_ROOT}/apps/inside/.env.example`);
  });

  it("passes each file content to parseEnvExample", async () => {
    const exampleContent = "API_KEY=test";
    mockReadFile.mockImplementation(async (filePath: Parameters<typeof readFile>[0]) => {
      const p = filePath.toString();
      if (p.endsWith("pnpm-workspace.yaml")) {
        if (p === `${FAKE_ROOT}/pnpm-workspace.yaml`) return cast("packages:");
        throw new Error("ENOENT");
      }
      if (p.endsWith(".env.example")) return cast(exampleContent);
      throw new Error("ENOENT");
    });
    mockParseEnvExample.mockReturnValue([]);
    mockDeduplicateVariables.mockReturnValue({ sharedVariables: [], appVariables: {} });

    await loadSetupData();

    expect(mockParseEnvExample).toHaveBeenCalledWith(exampleContent);
    expect(mockParseEnvExample).toHaveBeenCalledTimes(7);
  });

  it("skips missing .env.example files silently", async () => {
    // Only root .env.example exists
    mockReadFile.mockImplementation(async (filePath: Parameters<typeof readFile>[0]) => {
      const p = filePath.toString();
      if (p === `${FAKE_ROOT}/pnpm-workspace.yaml`) return cast("packages:");
      if (p === `${FAKE_ROOT}/.env.example`) return cast("KEY=val");
      throw new Error("ENOENT");
    });
    mockParseEnvExample.mockReturnValue([]);
    mockDeduplicateVariables.mockReturnValue({ sharedVariables: [], appVariables: {} });

    // Should not throw
    await loadSetupData();

    expect(mockParseEnvExample).toHaveBeenCalledTimes(1);
  });

  it("calls deduplicateVariables with parsed results", async () => {
    const vars = [{ key: "K", defaultValue: "", description: "", required: true, group: "" }];
    mockReadFile.mockImplementation(async (filePath: Parameters<typeof readFile>[0]) => {
      const p = filePath.toString();
      if (p === `${FAKE_ROOT}/pnpm-workspace.yaml`) return cast("packages:");
      if (p === `${FAKE_ROOT}/.env.example`) return cast("K=v");
      throw new Error("ENOENT");
    });
    mockParseEnvExample.mockReturnValue(vars);
    mockDeduplicateVariables.mockReturnValue({ sharedVariables: [], appVariables: {} });

    await loadSetupData();

    expect(mockDeduplicateVariables).toHaveBeenCalledWith([{ appId: "root", label: "Root", variables: vars }]);
  });

  it("reads .env.local files for existing values", async () => {
    mockReadFile.mockImplementation(async (filePath: Parameters<typeof readFile>[0]) => {
      const p = filePath.toString();
      if (p === `${FAKE_ROOT}/pnpm-workspace.yaml`) return cast("packages:");
      if (p === `${FAKE_ROOT}/.env.local`) return cast("EXISTING_KEY=hello\n");
      throw new Error("ENOENT");
    });
    mockParseEnvExample.mockReturnValue([]);
    mockDeduplicateVariables.mockReturnValue({ sharedVariables: [], appVariables: {} });

    const result = await loadSetupData();

    expect(result.existingValues.EXISTING_KEY).toBe("hello");
  });

  it("skips comments and blank lines in .env.local", async () => {
    mockReadFile.mockImplementation(async (filePath: Parameters<typeof readFile>[0]) => {
      const p = filePath.toString();
      if (p === `${FAKE_ROOT}/pnpm-workspace.yaml`) return cast("packages:");
      if (p === `${FAKE_ROOT}/.env.local`) return cast("# comment\n\nKEY=value\n");
      throw new Error("ENOENT");
    });
    mockParseEnvExample.mockReturnValue([]);
    mockDeduplicateVariables.mockReturnValue({ sharedVariables: [], appVariables: {} });

    const result = await loadSetupData();

    expect(result.existingValues).toEqual({ KEY: "value" });
  });

  it("handles = in env.local values (URLs)", async () => {
    mockReadFile.mockImplementation(async (filePath: Parameters<typeof readFile>[0]) => {
      const p = filePath.toString();
      if (p === `${FAKE_ROOT}/pnpm-workspace.yaml`) return cast("packages:");
      if (p === `${FAKE_ROOT}/.env.local`) return cast("URL=https://example.com?a=1&b=2\n");
      throw new Error("ENOENT");
    });
    mockParseEnvExample.mockReturnValue([]);
    mockDeduplicateVariables.mockReturnValue({ sharedVariables: [], appVariables: {} });

    const result = await loadSetupData();

    expect(result.existingValues.URL).toBe("https://example.com?a=1&b=2");
  });

  it("first non-empty value wins across files", async () => {
    mockReadFile.mockImplementation(async (filePath: Parameters<typeof readFile>[0]) => {
      const p = filePath.toString();
      if (p === `${FAKE_ROOT}/pnpm-workspace.yaml`) return cast("packages:");
      if (p === `${FAKE_ROOT}/.env.local`) return cast("KEY=first\n");
      if (p === `${FAKE_ROOT}/apps/b4u/.env.local`) return cast("KEY=second\n");
      throw new Error("ENOENT");
    });
    mockParseEnvExample.mockReturnValue([]);
    mockDeduplicateVariables.mockReturnValue({ sharedVariables: [], appVariables: {} });

    const result = await loadSetupData();

    expect(result.existingValues.KEY).toBe("first");
  });

  it("returns { sharedVariables, appVariables, existingValues }", async () => {
    const shared = [{ key: "S", defaultValue: "", description: "", required: true, group: "", sources: [] }];
    const appVars = { gadget: { label: "Gadget", variables: [] } };
    mockReadFile.mockImplementation(async (filePath: Parameters<typeof readFile>[0]) => {
      const p = filePath.toString();
      if (p === `${FAKE_ROOT}/pnpm-workspace.yaml`) return cast("packages:");
      throw new Error("ENOENT");
    });
    mockParseEnvExample.mockReturnValue([]);
    mockDeduplicateVariables.mockReturnValue({ sharedVariables: shared, appVariables: appVars });

    const result = await loadSetupData();

    expect(result).toEqual({
      sharedVariables: shared,
      appVariables: appVars,
      existingValues: {},
    });
  });
});

describe("saveSetupEnv", () => {
  beforeEach(() => {
    vi.spyOn(process, "cwd").mockReturnValue(FAKE_ROOT);
    mockReadFile.mockImplementation(async (filePath: Parameters<typeof readFile>[0]) => {
      const p = filePath.toString();
      if (p === `${FAKE_ROOT}/pnpm-workspace.yaml`) return cast("packages:");
      // buildKeyToApps reads these to map keys → app IDs
      if (p === `${FAKE_ROOT}/.env.example`) return cast("GITHUB_PERSONAL_ACCESS_TOKEN=\nLOG_LEVEL=");
      if (p === `${FAKE_ROOT}/apps/b4u/.env.example`) return cast("ELEVENLABS_API_KEY=");
      if (p === `${FAKE_ROOT}/apps/gadget/.env.example`) return cast("GITHUB_PERSONAL_ACCESS_TOKEN=");
      if (p === `${FAKE_ROOT}/apps/gogo-orchestrator/.env.example`) return cast("GITHUB_PERSONAL_ACCESS_TOKEN=");
      if (p === `${FAKE_ROOT}/apps/gogo-web/.env.example`) return cast("");
      throw new Error(`ENOENT: ${p}`);
    });
    mockParseEnvExample.mockImplementation((content: string) => {
      const vars = [];
      if (content.includes("ELEVENLABS_API_KEY")) {
        vars.push({ key: "ELEVENLABS_API_KEY", defaultValue: "", description: "", required: true, group: "" });
      }
      if (content.includes("GITHUB_PERSONAL_ACCESS_TOKEN")) {
        vars.push({
          key: "GITHUB_PERSONAL_ACCESS_TOKEN",
          defaultValue: "",
          description: "",
          required: true,
          group: "",
        });
      }
      if (content.includes("LOG_LEVEL")) {
        vars.push({ key: "LOG_LEVEL", defaultValue: "info", description: "", required: true, group: "" });
      }
      return vars;
    });
    mockWriteFile.mockResolvedValue();
  });

  it("routes keys to correct app files via buildKeyToApps mapping", async () => {
    await saveSetupEnv({ ELEVENLABS_API_KEY: "elk-123" });

    expect(mockWriteFile).toHaveBeenCalledTimes(1);
    const writePath = mockWriteFile.mock.calls[0][0].toString();
    expect(writePath).toBe(`${FAKE_ROOT}/apps/b4u/.env.local`);
  });

  it("skips unknown keys not in mapping", async () => {
    await saveSetupEnv({ UNKNOWN_KEY: "value" });

    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it("updates existing active line", async () => {
    mockReadFile.mockImplementation(async (filePath: Parameters<typeof readFile>[0]) => {
      const p = filePath.toString();
      if (p === `${FAKE_ROOT}/pnpm-workspace.yaml`) return cast("packages:");
      if (p === `${FAKE_ROOT}/apps/b4u/.env.example`) return cast("ELEVENLABS_API_KEY=");
      if (p === `${FAKE_ROOT}/apps/b4u/.env.local`) return cast("ELEVENLABS_API_KEY=old-key\n");
      throw new Error("ENOENT");
    });

    await saveSetupEnv({ ELEVENLABS_API_KEY: "new-key" });

    const written = mockWriteFile.mock.calls[0][1].toString();
    expect(written).toContain("ELEVENLABS_API_KEY=new-key");
    expect(written).not.toContain("old-key");
  });

  it("updates existing commented line", async () => {
    mockReadFile.mockImplementation(async (filePath: Parameters<typeof readFile>[0]) => {
      const p = filePath.toString();
      if (p === `${FAKE_ROOT}/pnpm-workspace.yaml`) return cast("packages:");
      if (p === `${FAKE_ROOT}/apps/b4u/.env.example`) return cast("ELEVENLABS_API_KEY=");
      if (p === `${FAKE_ROOT}/apps/b4u/.env.local`) return cast("# ELEVENLABS_API_KEY=\n");
      throw new Error("ENOENT");
    });

    await saveSetupEnv({ ELEVENLABS_API_KEY: "new-key" });

    const written = mockWriteFile.mock.calls[0][1].toString();
    expect(written).toContain("ELEVENLABS_API_KEY=new-key");
    expect(written).not.toContain("# ELEVENLABS_API_KEY");
  });

  it("appends new keys not in file", async () => {
    mockReadFile.mockImplementation(async (filePath: Parameters<typeof readFile>[0]) => {
      const p = filePath.toString();
      if (p === `${FAKE_ROOT}/pnpm-workspace.yaml`) return cast("packages:");
      if (p === `${FAKE_ROOT}/apps/b4u/.env.example`) return cast("ELEVENLABS_API_KEY=");
      if (p === `${FAKE_ROOT}/apps/b4u/.env.local`) return cast("OTHER=value\n");
      throw new Error("ENOENT");
    });

    await saveSetupEnv({ ELEVENLABS_API_KEY: "appended" });

    const written = mockWriteFile.mock.calls[0][1].toString();
    expect(written).toContain("OTHER=value");
    expect(written).toContain("ELEVENLABS_API_KEY=appended");
  });

  it("comments out key when value is empty string", async () => {
    await saveSetupEnv({ ELEVENLABS_API_KEY: "" });

    const written = mockWriteFile.mock.calls[0][1].toString();
    expect(written).toContain("# ELEVENLABS_API_KEY=");
  });

  it("preserves unrelated lines unchanged", async () => {
    mockReadFile.mockImplementation(async (filePath: Parameters<typeof readFile>[0]) => {
      const p = filePath.toString();
      if (p === `${FAKE_ROOT}/pnpm-workspace.yaml`) return cast("packages:");
      if (p === `${FAKE_ROOT}/apps/b4u/.env.example`) return cast("ELEVENLABS_API_KEY=");
      if (p === `${FAKE_ROOT}/apps/b4u/.env.local`) return cast("UNRELATED=keep\nELEVENLABS_API_KEY=old\n");
      throw new Error("ENOENT");
    });

    await saveSetupEnv({ ELEVENLABS_API_KEY: "new" });

    const written = mockWriteFile.mock.calls[0][1].toString();
    expect(written).toContain("UNRELATED=keep");
  });

  it("creates file content when file doesn't exist", async () => {
    await saveSetupEnv({ ELEVENLABS_API_KEY: "brand-new" });

    expect(mockWriteFile).toHaveBeenCalledTimes(1);
    const written = mockWriteFile.mock.calls[0][1].toString();
    expect(written).toContain("ELEVENLABS_API_KEY=brand-new");
  });

  it("returns { success: true, filesWritten } on success", async () => {
    const result = await saveSetupEnv({ ELEVENLABS_API_KEY: "val" });

    expect(result.success).toBe(true);
    expect(result.filesWritten).toContain("apps/b4u/.env.local");
    expect(result.errors).toEqual([]);
  });

  it("returns { success: false, errors } on write failure", async () => {
    mockWriteFile.mockRejectedValue(new Error("Permission denied"));

    const result = await saveSetupEnv({ ELEVENLABS_API_KEY: "val" });

    expect(result.success).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toBe("Permission denied");
  });

  it("filesWritten contains relative paths", async () => {
    const result = await saveSetupEnv({ LOG_LEVEL: "debug" });

    for (const f of result.filesWritten) {
      expect(f).not.toContain(FAKE_ROOT);
    }
  });

  it("deduplicates filesWritten", async () => {
    // GITHUB_PERSONAL_ACCESS_TOKEN maps to ["root", "gadget", "gogo-orchestrator"]
    // LOG_LEVEL maps to ["root"] — root appears twice but file should be deduplicated
    const result = await saveSetupEnv({
      GITHUB_PERSONAL_ACCESS_TOKEN: "ghp_123",
      LOG_LEVEL: "debug",
    });

    const rootCount = result.filesWritten.filter((f) => f === ".env.local").length;
    expect(rootCount).toBeLessThanOrEqual(1);
  });

  it("handles empty values object", async () => {
    const result = await saveSetupEnv({});

    expect(result.success).toBe(true);
    expect(result.filesWritten).toEqual([]);
    expect(result.errors).toEqual([]);
    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it("output ends with trailing newline", async () => {
    await saveSetupEnv({ ELEVENLABS_API_KEY: "val" });

    const written = mockWriteFile.mock.calls[0][1].toString();
    expect(written).toMatch(/\n$/);
  });

  it("writes shared key to all mapped apps", async () => {
    // GITHUB_PERSONAL_ACCESS_TOKEN → root, gadget, gogo-orchestrator
    await saveSetupEnv({ GITHUB_PERSONAL_ACCESS_TOKEN: "ghp_test" });

    const writePaths = mockWriteFile.mock.calls.map((c) => c[0].toString());
    expect(writePaths).toContain(`${FAKE_ROOT}/.env.local`);
    expect(writePaths).toContain(`${FAKE_ROOT}/apps/gadget/.env.local`);
    expect(writePaths).toContain(`${FAKE_ROOT}/apps/gogo-orchestrator/.env.local`);
  });

  it("keeps commented line unchanged when clearing value on already-commented key", async () => {
    mockReadFile.mockImplementation(async (filePath: Parameters<typeof readFile>[0]) => {
      const p = filePath.toString();
      if (p === `${FAKE_ROOT}/pnpm-workspace.yaml`) return cast("packages:");
      if (p === `${FAKE_ROOT}/apps/b4u/.env.example`) return cast("ELEVENLABS_API_KEY=");
      if (p === `${FAKE_ROOT}/apps/b4u/.env.local`) return cast("# ELEVENLABS_API_KEY=old-val\n");
      throw new Error("ENOENT");
    });

    await saveSetupEnv({ ELEVENLABS_API_KEY: "" });

    const written = mockWriteFile.mock.calls[0][1].toString();
    // Empty value on already-commented line should preserve original comment
    expect(written).toContain("# ELEVENLABS_API_KEY=old-val");
  });

  it("handles non-Error exception in write failure", async () => {
    mockWriteFile.mockRejectedValue("string error");

    const result = await saveSetupEnv({ ELEVENLABS_API_KEY: "val" });

    expect(result.success).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("Failed to write");
  });
});
