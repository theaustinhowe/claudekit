import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  getDb: vi.fn(() => ({})),
  queryAll: vi.fn(),
  execute: vi.fn(),
}));
vi.mock("@/lib/utils", () => ({
  generateId: vi.fn(() => "test-id"),
  nowTimestamp: vi.fn(() => "2024-01-01T00:00:00.000Z"),
}));
vi.mock("@/lib/actions/settings", () => ({
  getSetting: vi.fn(),
  setSetting: vi.fn(),
}));

import { getSetting, setSetting } from "@/lib/actions/settings";
import { execute, queryAll } from "@/lib/db";
import { getAutoFixEnabled, getAutoFixHistory, saveAutoFixRun, setAutoFixEnabled, updateAutoFixRun } from "./auto-fix";

const mockQueryAll = vi.mocked(queryAll);
const mockExecute = vi.mocked(execute);
const mockGetSetting = vi.mocked(getSetting);
const mockSetSetting = vi.mocked(setSetting);

beforeEach(() => {
  vi.resetAllMocks();
});

describe("saveAutoFixRun", () => {
  it("inserts a new auto-fix run", async () => {
    mockExecute.mockResolvedValue(undefined);

    const id = await saveAutoFixRun({
      projectId: "proj-1",
      status: "running",
      errorSignature: "sig-1",
      errorMessage: "Something broke",
      attemptNumber: 1,
      logs: [{ log: "Starting fix", logType: "info" }],
    });

    expect(id).toBe("test-id");
    expect(mockExecute).toHaveBeenCalledWith(
      {},
      expect.stringContaining("INSERT INTO auto_fix_runs"),
      expect.arrayContaining(["test-id", "proj-1", "running", "sig-1", "Something broke"]),
    );
  });

  it("sets completed_at when status is not running", async () => {
    mockExecute.mockResolvedValue(undefined);

    await saveAutoFixRun({
      projectId: "proj-1",
      status: "success",
      errorSignature: "sig-1",
      errorMessage: "Fixed",
      attemptNumber: 1,
      logs: [],
    });

    const callArgs = mockExecute.mock.calls[0][2] as unknown[];
    // completed_at should be set (not null) for non-running status
    expect(callArgs[callArgs.length - 1]).toBe("2024-01-01T00:00:00.000Z");
  });

  it("sets completed_at to null when status is running", async () => {
    mockExecute.mockResolvedValue(undefined);

    await saveAutoFixRun({
      projectId: "proj-1",
      status: "running",
      errorSignature: "sig-1",
      errorMessage: "Fixing",
      attemptNumber: 1,
      logs: [],
    });

    const callArgs = mockExecute.mock.calls[0][2] as unknown[];
    expect(callArgs[callArgs.length - 1]).toBeNull();
  });
});

describe("updateAutoFixRun", () => {
  it("updates status and sets completed_at", async () => {
    mockExecute.mockResolvedValue(undefined);

    await updateAutoFixRun("run-1", { status: "success" });
    expect(mockExecute).toHaveBeenCalledWith(
      {},
      expect.stringContaining("UPDATE auto_fix_runs SET"),
      expect.arrayContaining(["success", "2024-01-01T00:00:00.000Z", "run-1"]),
    );
  });

  it("does nothing when no updates provided", async () => {
    await updateAutoFixRun("run-1", {});
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it("updates claude output", async () => {
    mockExecute.mockResolvedValue(undefined);

    await updateAutoFixRun("run-1", { claudeOutput: "Fixed the issue" });
    expect(mockExecute).toHaveBeenCalledWith(
      {},
      expect.stringContaining("claude_output"),
      expect.arrayContaining(["Fixed the issue", "run-1"]),
    );
  });

  it("updates logs as JSON", async () => {
    mockExecute.mockResolvedValue(undefined);

    await updateAutoFixRun("run-1", { logs: [{ log: "Done", logType: "info" }] });
    expect(mockExecute).toHaveBeenCalledWith(
      {},
      expect.stringContaining("logs_json"),
      expect.arrayContaining(['[{"log":"Done","logType":"info"}]', "run-1"]),
    );
  });
});

describe("getAutoFixHistory", () => {
  it("returns auto-fix runs for a project", async () => {
    const runs = [{ id: "1", project_id: "proj-1", status: "success" }];
    mockQueryAll.mockResolvedValue(runs);

    const result = await getAutoFixHistory("proj-1");
    expect(result).toEqual(runs);
    expect(mockQueryAll).toHaveBeenCalledWith(
      {},
      expect.stringContaining("SELECT * FROM auto_fix_runs WHERE project_id = ?"),
      ["proj-1", 20],
    );
  });

  it("respects custom limit", async () => {
    mockQueryAll.mockResolvedValue([]);

    await getAutoFixHistory("proj-1", 5);
    expect(mockQueryAll).toHaveBeenCalledWith({}, expect.stringContaining("LIMIT ?"), ["proj-1", 5]);
  });
});

describe("getAutoFixEnabled", () => {
  it("returns true when setting is 'true'", async () => {
    mockGetSetting.mockResolvedValue("true");
    const result = await getAutoFixEnabled("proj-1");
    expect(result).toBe(true);
  });

  it("returns false when setting is not 'true'", async () => {
    mockGetSetting.mockResolvedValue(null);
    const result = await getAutoFixEnabled("proj-1");
    expect(result).toBe(false);
  });
});

describe("setAutoFixEnabled", () => {
  it("saves the enabled state", async () => {
    mockSetSetting.mockResolvedValue(undefined);
    await setAutoFixEnabled("proj-1", true);
    expect(mockSetSetting).toHaveBeenCalledWith("autofix_enabled_proj-1", "true");
  });
});
