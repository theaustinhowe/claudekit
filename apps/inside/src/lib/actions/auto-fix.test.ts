import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  getDb: vi.fn().mockResolvedValue({}),
  execute: vi.fn().mockResolvedValue(undefined),
  queryAll: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/lib/utils", () => ({
  generateId: vi.fn().mockReturnValue("test-run-id"),
  nowTimestamp: vi.fn().mockReturnValue("2024-01-01T00:00:00.000Z"),
}));

vi.mock("@/lib/actions/settings", () => ({
  getSetting: vi.fn().mockResolvedValue(null),
  setSetting: vi.fn().mockResolvedValue(undefined),
}));

import { cast } from "@claudekit/test-utils";
import { getSetting, setSetting } from "@/lib/actions/settings";
import { execute, getDb, queryAll } from "@/lib/db";
import { getAutoFixEnabled, getAutoFixHistory, saveAutoFixRun, setAutoFixEnabled, updateAutoFixRun } from "./auto-fix";

const mockGetDb = vi.mocked(getDb);
const mockExecute = vi.mocked(execute);
const mockQueryAll = vi.mocked(queryAll);
const mockGetSetting = vi.mocked(getSetting);
const mockSetSetting = vi.mocked(setSetting);

beforeEach(() => {
  vi.clearAllMocks();
  mockGetDb.mockResolvedValue({} as Awaited<ReturnType<typeof getDb>>);
  mockExecute.mockResolvedValue(cast(undefined));
});

describe("saveAutoFixRun", () => {
  it("inserts a new auto-fix run and returns ID", async () => {
    const id = await saveAutoFixRun({
      projectId: "proj-1",
      status: "running",
      errorSignature: "ERR_001",
      errorMessage: "Something failed",
      attemptNumber: 1,
      logs: [{ log: "Starting fix", logType: "info" }],
    });
    expect(id).toBe("test-run-id");
    expect(mockExecute).toHaveBeenCalledTimes(1);
    expect(mockExecute).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining("INSERT INTO auto_fix_runs"),
      expect.arrayContaining(["test-run-id", "proj-1", "running"]),
    );
  });

  it("sets completed_at to null when status is running", async () => {
    await saveAutoFixRun({
      projectId: "proj-1",
      status: "running",
      errorSignature: "ERR",
      errorMessage: "err",
      attemptNumber: 1,
      logs: [],
    });
    const params = vi.mocked(mockExecute).mock.calls[0][2] ?? [];
    // Last param should be null (completed_at)
    expect(params[params.length - 1]).toBeNull();
  });

  it("sets completed_at when status is not running", async () => {
    await saveAutoFixRun({
      projectId: "proj-1",
      status: "success",
      errorSignature: "ERR",
      errorMessage: "err",
      attemptNumber: 1,
      logs: [],
    });
    const params = vi.mocked(mockExecute).mock.calls[0][2] ?? [];
    expect(params[params.length - 1]).toBe("2024-01-01T00:00:00.000Z");
  });
});

describe("updateAutoFixRun", () => {
  it("updates status and completed_at", async () => {
    await updateAutoFixRun("run-1", { status: "success" });
    expect(mockExecute).toHaveBeenCalledTimes(1);
    expect(mockExecute).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining("UPDATE auto_fix_runs"),
      expect.arrayContaining(["success"]),
    );
  });

  it("updates claudeOutput", async () => {
    await updateAutoFixRun("run-1", { claudeOutput: "Fixed it!" });
    expect(mockExecute).toHaveBeenCalledTimes(1);
  });

  it("updates logs", async () => {
    await updateAutoFixRun("run-1", { logs: [{ log: "done", logType: "info" }] });
    expect(mockExecute).toHaveBeenCalledTimes(1);
  });

  it("does nothing when no updates", async () => {
    await updateAutoFixRun("run-1", {});
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it("does not set completed_at when status is running", async () => {
    await updateAutoFixRun("run-1", { status: "running" });
    expect(mockExecute).toHaveBeenCalledTimes(1);
    const sql = mockExecute.mock.calls[0][1] as string;
    expect(sql).not.toContain("completed_at");
  });
});

describe("getAutoFixHistory", () => {
  it("returns history for a project", async () => {
    mockQueryAll.mockResolvedValue(cast([{ id: "run-1" }]));
    const result = await getAutoFixHistory("proj-1");
    expect(result).toHaveLength(1);
  });

  it("uses default limit of 20", async () => {
    mockQueryAll.mockResolvedValue(cast([]));
    await getAutoFixHistory("proj-1");
    expect(mockQueryAll).toHaveBeenCalledWith(expect.anything(), expect.stringContaining("LIMIT"), ["proj-1", 20]);
  });

  it("uses custom limit", async () => {
    mockQueryAll.mockResolvedValue(cast([]));
    await getAutoFixHistory("proj-1", 5);
    expect(mockQueryAll).toHaveBeenCalledWith(expect.anything(), expect.anything(), ["proj-1", 5]);
  });
});

describe("getAutoFixEnabled", () => {
  it("returns true when setting is 'true'", async () => {
    mockGetSetting.mockResolvedValue("true");
    const result = await getAutoFixEnabled("proj-1");
    expect(result).toBe(true);
  });

  it("returns false when setting is null", async () => {
    mockGetSetting.mockResolvedValue(null);
    const result = await getAutoFixEnabled("proj-1");
    expect(result).toBe(false);
  });

  it("returns false when setting is 'false'", async () => {
    mockGetSetting.mockResolvedValue("false");
    const result = await getAutoFixEnabled("proj-1");
    expect(result).toBe(false);
  });
});

describe("setAutoFixEnabled", () => {
  it("sets the enabled setting to 'true'", async () => {
    await setAutoFixEnabled("proj-1", true);
    expect(mockSetSetting).toHaveBeenCalledWith("autofix_enabled_proj-1", "true");
  });

  it("sets the enabled setting to 'false'", async () => {
    await setAutoFixEnabled("proj-1", false);
    expect(mockSetSetting).toHaveBeenCalledWith("autofix_enabled_proj-1", "false");
  });
});
