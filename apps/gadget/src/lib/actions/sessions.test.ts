import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  getDb: vi.fn(() => ({})),
  queryAll: vi.fn(),
  queryOne: vi.fn(),
  execute: vi.fn(),
}));
vi.mock("@/lib/utils", () => ({
  generateId: vi.fn(() => "test-id"),
  nowTimestamp: vi.fn(() => "2024-01-01T00:00:00.000Z"),
}));

import { execute, queryAll, queryOne } from "@/lib/db";
import {
  createSessionRecord,
  getSessionLogsFromDb,
  getSessionRecord,
  insertSessionLogs,
  listSessions,
  updateSessionRecord,
} from "./sessions";

const mockQueryAll = vi.mocked(queryAll);
const mockQueryOne = vi.mocked(queryOne);
const mockExecute = vi.mocked(execute);

beforeEach(() => {
  vi.resetAllMocks();
});

describe("createSessionRecord", () => {
  it("creates a session with required fields", async () => {
    mockExecute.mockResolvedValue(undefined);

    const id = await createSessionRecord({
      sessionType: "scan",
      label: "Scan repos",
    });

    expect(id).toBe("test-id");
    expect(mockExecute).toHaveBeenCalledWith(
      {},
      expect.stringContaining("INSERT INTO sessions"),
      expect.arrayContaining(["test-id", "scan", "Scan repos"]),
    );
  });

  it("creates a session with all optional fields", async () => {
    mockExecute.mockResolvedValue(undefined);

    const id = await createSessionRecord({
      sessionType: "chat",
      label: "Chat session",
      contextType: "repo",
      contextId: "repo-1",
      contextName: "My Repo",
      metadata: { key: "val" },
    });

    expect(id).toBe("test-id");
    expect(mockExecute).toHaveBeenCalledWith(
      {},
      expect.stringContaining("INSERT INTO sessions"),
      expect.arrayContaining(["repo", "repo-1", "My Repo", '{"key":"val"}']),
    );
  });
});

describe("updateSessionRecord", () => {
  it("updates session fields", async () => {
    mockExecute.mockResolvedValue(undefined);

    await updateSessionRecord("sess-1", { status: "running", progress: 50 });
    expect(mockExecute).toHaveBeenCalledWith(
      {},
      expect.stringContaining("UPDATE sessions SET"),
      expect.arrayContaining(["running", 50, "sess-1"]),
    );
  });

  it("does nothing when no data provided", async () => {
    await updateSessionRecord("sess-1", {});
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it("skips undefined values", async () => {
    mockExecute.mockResolvedValue(undefined);

    await updateSessionRecord("sess-1", { status: "done", progress: undefined });
    const sql = mockExecute.mock.calls[0][1] as string;
    expect(sql).not.toContain("progress");
  });
});

describe("listSessions", () => {
  it("returns sessions with default limit", async () => {
    mockQueryAll.mockResolvedValue([]);

    await listSessions();
    expect(mockQueryAll).toHaveBeenCalledWith({}, expect.stringContaining("ORDER BY created_at DESC LIMIT 50"), []);
  });

  it("filters by status array", async () => {
    mockQueryAll.mockResolvedValue([]);

    await listSessions({ status: ["running", "pending"] });
    expect(mockQueryAll).toHaveBeenCalledWith({}, expect.stringContaining("status IN (?, ?)"), ["running", "pending"]);
  });

  it("filters by single status", async () => {
    mockQueryAll.mockResolvedValue([]);

    await listSessions({ status: "done" });
    expect(mockQueryAll).toHaveBeenCalledWith({}, expect.stringContaining("status IN (?)"), ["done"]);
  });

  it("filters by contextId and sessionType", async () => {
    mockQueryAll.mockResolvedValue([]);

    await listSessions({ contextId: "repo-1", sessionType: "scan" });
    expect(mockQueryAll).toHaveBeenCalledWith(
      {},
      expect.stringContaining("context_id = ?"),
      expect.arrayContaining(["repo-1", "scan"]),
    );
  });

  it("respects custom limit", async () => {
    mockQueryAll.mockResolvedValue([]);

    await listSessions({ limit: 10 });
    expect(mockQueryAll).toHaveBeenCalledWith({}, expect.stringContaining("LIMIT 10"), []);
  });
});

describe("getSessionRecord", () => {
  it("returns a session by id", async () => {
    const session = { id: "sess-1", status: "running", session_type: "scan" };
    mockQueryOne.mockResolvedValue(session);

    const result = await getSessionRecord("sess-1");
    expect(result).toEqual(session);
  });

  it("returns undefined when not found", async () => {
    mockQueryOne.mockResolvedValue(undefined);

    const result = await getSessionRecord("nonexistent");
    expect(result).toBeUndefined();
  });
});

describe("getSessionLogsFromDb", () => {
  it("returns logs for a session with default limit", async () => {
    const logs = [{ id: 1, session_id: "sess-1", log: "Starting", log_type: "info" }];
    mockQueryAll.mockResolvedValue(logs);

    const result = await getSessionLogsFromDb("sess-1");
    expect(result).toEqual(logs);
    expect(mockQueryAll).toHaveBeenCalledWith({}, expect.stringContaining("session_id = ?"), ["sess-1", 200]);
  });
});

describe("insertSessionLogs", () => {
  it("inserts multiple logs", async () => {
    mockExecute.mockResolvedValue(undefined);

    await insertSessionLogs("sess-1", [
      { log: "Step 1", logType: "info" },
      { log: "Step 2", logType: "progress" },
    ]);

    expect(mockExecute).toHaveBeenCalledTimes(2);
    expect(mockExecute).toHaveBeenCalledWith({}, expect.stringContaining("INSERT INTO session_logs"), [
      "sess-1",
      "Step 1",
      "info",
      "2024-01-01T00:00:00.000Z",
    ]);
  });

  it("does nothing for empty logs array", async () => {
    await insertSessionLogs("sess-1", []);
    expect(mockExecute).not.toHaveBeenCalled();
  });
});
