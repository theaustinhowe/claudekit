import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  getDb: vi.fn(() => ({})),
}));
vi.mock("@/lib/db/helpers", () => ({
  queryAll: vi.fn(),
  queryOne: vi.fn(),
  execute: vi.fn(),
}));
vi.mock("@/lib/utils", () => ({
  nowTimestamp: vi.fn(() => "2024-01-01T00:00:00.000Z"),
}));
vi.mock("@/lib/constants", () => ({
  DEFAULT_CLEANUP_FILES: [".prettierrc", ".eslintrc.json"],
}));

import { execute, queryAll, queryOne } from "@/lib/db/helpers";
import {
  getCleanupFiles,
  getDashboardOnboardingState,
  getDashboardStats,
  getEncryptionKey,
  getSetting,
  setCleanupFiles,
  setSetting,
} from "./settings";

const mockQueryOne = vi.mocked(queryOne);
const mockQueryAll = vi.mocked(queryAll);
const mockExecute = vi.mocked(execute);

beforeEach(() => {
  vi.resetAllMocks();
});

describe("getSetting", () => {
  it("returns value when setting exists", async () => {
    mockQueryOne.mockResolvedValue({ value: "my-value" });
    const result = await getSetting("theme");
    expect(result).toBe("my-value");
    expect(mockQueryOne).toHaveBeenCalledWith({}, "SELECT value FROM settings WHERE key = ?", ["theme"]);
  });

  it("returns null when setting does not exist", async () => {
    mockQueryOne.mockResolvedValue(undefined);
    const result = await getSetting("nonexistent");
    expect(result).toBeNull();
  });
});

describe("getEncryptionKey", () => {
  it("returns encryption key when set", async () => {
    mockQueryOne.mockResolvedValue({ value: "secret-key" });
    const result = await getEncryptionKey();
    expect(result).toBe("secret-key");
  });

  it("returns null when not set", async () => {
    mockQueryOne.mockResolvedValue(undefined);
    const result = await getEncryptionKey();
    expect(result).toBeNull();
  });

  it("returns null for empty string value", async () => {
    mockQueryOne.mockResolvedValue({ value: "" });
    const result = await getEncryptionKey();
    expect(result).toBeNull();
  });
});

describe("setSetting", () => {
  it("inserts or updates a setting", async () => {
    mockExecute.mockResolvedValue(undefined);

    await setSetting("theme", "dark");
    expect(mockExecute).toHaveBeenCalledWith({}, expect.stringContaining("INSERT INTO settings"), [
      "theme",
      "dark",
      "2024-01-01T00:00:00.000Z",
    ]);
  });
});

describe("getCleanupFiles", () => {
  it("returns parsed cleanup files from settings", async () => {
    mockQueryOne.mockResolvedValue({ value: '[".prettierrc", ".eslintrc"]' });
    const result = await getCleanupFiles();
    expect(result).toEqual([".prettierrc", ".eslintrc"]);
  });

  it("returns defaults when setting is not set", async () => {
    mockQueryOne.mockResolvedValue(undefined);
    const result = await getCleanupFiles();
    expect(result).toEqual([".prettierrc", ".eslintrc.json"]);
  });

  it("returns defaults when JSON is invalid", async () => {
    mockQueryOne.mockResolvedValue({ value: "not json" });
    const result = await getCleanupFiles();
    expect(result).toEqual([".prettierrc", ".eslintrc.json"]);
  });
});

describe("setCleanupFiles", () => {
  it("saves cleanup files as JSON", async () => {
    mockExecute.mockResolvedValue(undefined);
    mockQueryOne.mockResolvedValue(undefined);

    await setCleanupFiles([".prettierrc", ".eslintrc"]);
    expect(mockExecute).toHaveBeenCalledWith({}, expect.stringContaining("INSERT INTO settings"), [
      "cleanup_invalid_files",
      '[".prettierrc",".eslintrc"]',
      "2024-01-01T00:00:00.000Z",
    ]);
  });
});

describe("getDashboardStats", () => {
  it("returns aggregated stats", async () => {
    mockQueryOne
      .mockResolvedValueOnce({ count: 5 })
      .mockResolvedValueOnce({ count: 2 })
      .mockResolvedValueOnce({ count: 3 })
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ last_completed: "2024-01-01T00:00:00Z" })
      .mockResolvedValueOnce({ count: 10 })
      .mockResolvedValueOnce({ count: 2 })
      .mockResolvedValueOnce({ count: 3 });

    const stats = await getDashboardStats();
    expect(stats.reposAudited).toBe(5);
    expect(stats.criticalFindings).toBe(2);
    expect(stats.warningFindings).toBe(3);
    expect(stats.pendingFixes).toBe(1);
    expect(stats.staleRepoCount).toBe(0);
    expect(stats.criticalRepoCount).toBe(1);
    expect(stats.lastScanCompletedAt).toBe("2024-01-01T00:00:00Z");
    expect(stats.conceptCount).toBe(10);
    expect(stats.staleSources).toBe(2);
    expect(stats.policyCount).toBe(3);
  });

  it("returns zeros when queries return undefined", async () => {
    mockQueryOne.mockResolvedValue(undefined);

    const stats = await getDashboardStats();
    expect(stats.reposAudited).toBe(0);
    expect(stats.criticalFindings).toBe(0);
    expect(stats.lastScanCompletedAt).toBeNull();
  });
});

describe("getDashboardOnboardingState", () => {
  it("returns onboarding state with all steps complete", async () => {
    mockQueryAll.mockResolvedValue([{ id: "root1" }]);
    mockQueryOne.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 1 });

    const state = await getDashboardOnboardingState();
    expect(state.hasScanRoots).toBe(true);
    expect(state.hasCompletedScan).toBe(true);
    expect(state.hasAppliedFix).toBe(true);
  });

  it("returns onboarding state with no steps complete", async () => {
    mockQueryAll.mockResolvedValue([]);
    mockQueryOne.mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({ count: 0 });

    const state = await getDashboardOnboardingState();
    expect(state.hasScanRoots).toBe(false);
    expect(state.hasCompletedScan).toBe(false);
    expect(state.hasAppliedFix).toBe(false);
  });
});
