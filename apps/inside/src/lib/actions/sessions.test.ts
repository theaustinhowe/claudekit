import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  getDb: vi.fn().mockResolvedValue({}),
  execute: vi.fn().mockResolvedValue(undefined),
  queryOne: vi.fn().mockResolvedValue(null),
  queryAll: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/lib/utils", () => ({
  generateId: vi.fn().mockReturnValue("test-session-id"),
  nowTimestamp: vi.fn().mockReturnValue("2024-01-01T00:00:00.000Z"),
}));

import { execute, getDb, queryAll, queryOne } from "@/lib/db";
import {
  createSessionRecord,
  getSessionLogsFromDb,
  getSessionRecord,
  insertSessionLogs,
  listSessions,
  updateSessionRecord,
} from "./sessions";

const mockGetDb = vi.mocked(getDb);
const mockExecute = vi.mocked(execute);
const mockQueryOne = vi.mocked(queryOne);
const mockQueryAll = vi.mocked(queryAll);

beforeEach(() => {
  vi.clearAllMocks();
  mockGetDb.mockResolvedValue({} as Awaited<ReturnType<typeof getDb>>);
  mockExecute.mockResolvedValue(undefined as never);
  mockQueryAll.mockResolvedValue([] as never);
});

describe("createSessionRecord", () => {
  it("creates a session and returns the ID", async () => {
    const id = await createSessionRecord({
      sessionType: "scaffold",
      label: "Scaffold Project",
    });
    expect(id).toBe("test-session-id");
    expect(mockExecute).toHaveBeenCalledTimes(1);
    expect(mockExecute).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining("INSERT INTO sessions"),
      expect.arrayContaining(["test-session-id", "scaffold", "Scaffold Project"]),
    );
  });

  it("passes optional context fields", async () => {
    await createSessionRecord({
      sessionType: "upgrade",
      label: "Upgrade",
      contextType: "project",
      contextId: "proj-1",
      contextName: "My Project",
      metadata: { taskId: "task-1" },
    });
    expect(mockExecute).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining("INSERT INTO sessions"),
      expect.arrayContaining(["project", "proj-1", "My Project"]),
    );
  });
});

describe("updateSessionRecord", () => {
  it("updates session fields", async () => {
    await updateSessionRecord("session-1", { status: "running", progress: 50 });
    expect(mockExecute).toHaveBeenCalledTimes(1);
    expect(mockExecute).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining("UPDATE sessions"),
      expect.arrayContaining(["running", 50, "session-1"]),
    );
  });

  it("skips update when no fields provided", async () => {
    await updateSessionRecord("session-1", {});
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it("skips undefined values", async () => {
    await updateSessionRecord("session-1", { status: "done", progress: undefined });
    expect(mockExecute).toHaveBeenCalledTimes(1);
  });
});

describe("listSessions", () => {
  it("returns all sessions when no filter", async () => {
    mockQueryAll.mockResolvedValue([] as never);
    const result = await listSessions();
    expect(result).toEqual([]);
    expect(mockQueryAll).toHaveBeenCalledWith(expect.anything(), expect.stringContaining("SELECT * FROM sessions"), []);
  });

  it("filters by single status", async () => {
    await listSessions({ status: "running" });
    expect(mockQueryAll).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining("status IN"),
      expect.arrayContaining(["running"]),
    );
  });

  it("filters by multiple statuses", async () => {
    await listSessions({ status: ["running", "pending"] });
    expect(mockQueryAll).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining("status IN"),
      expect.arrayContaining(["running", "pending"]),
    );
  });

  it("filters by contextId", async () => {
    await listSessions({ contextId: "proj-1" });
    expect(mockQueryAll).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining("context_id = ?"),
      expect.arrayContaining(["proj-1"]),
    );
  });

  it("filters by contextType", async () => {
    await listSessions({ contextType: "project" });
    expect(mockQueryAll).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining("context_type = ?"),
      expect.arrayContaining(["project"]),
    );
  });

  it("filters by sessionType", async () => {
    await listSessions({ sessionType: "scaffold" });
    expect(mockQueryAll).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining("session_type = ?"),
      expect.arrayContaining(["scaffold"]),
    );
  });

  it("applies limit", async () => {
    await listSessions({ limit: 10 });
    expect(mockQueryAll).toHaveBeenCalledWith(expect.anything(), expect.stringContaining("LIMIT 10"), []);
  });
});

describe("getSessionRecord", () => {
  it("returns session when found", async () => {
    const row = { id: "session-1", status: "running" };
    mockQueryOne.mockResolvedValue(row as never);
    const result = await getSessionRecord("session-1");
    expect(result).toEqual(row);
  });

  it("returns undefined when not found", async () => {
    mockQueryOne.mockResolvedValue(undefined as never);
    const result = await getSessionRecord("nonexistent");
    expect(result).toBeUndefined();
  });
});

describe("getSessionLogsFromDb", () => {
  it("returns logs for a session", async () => {
    const logs = [{ id: 1, session_id: "s1", log: "test", log_type: "info" }];
    mockQueryAll.mockResolvedValue(logs as never);
    const result = await getSessionLogsFromDb("s1");
    expect(result).toEqual(logs);
  });
});

describe("insertSessionLogs", () => {
  it("inserts each log entry", async () => {
    await insertSessionLogs("session-1", [
      { log: "Line 1", logType: "info" },
      { log: "Line 2", logType: "error" },
    ]);
    expect(mockExecute).toHaveBeenCalledTimes(2);
  });

  it("does nothing for empty logs array", async () => {
    await insertSessionLogs("session-1", []);
    expect(mockExecute).not.toHaveBeenCalled();
  });
});
