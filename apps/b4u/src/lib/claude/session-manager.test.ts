import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockConn } = vi.hoisted(() => ({
  mockConn: Symbol("conn"),
}));

vi.mock("@/lib/db", () => ({
  getDb: vi.fn().mockResolvedValue(mockConn),
  execute: vi.fn().mockResolvedValue(undefined),
  queryOne: vi.fn(),
}));

import { cancelSession, createSession, getLiveSession, startSession, subscribe } from "@/lib/claude/session-manager";
import { execute, getDb, queryOne } from "@/lib/db";

const mockQueryOne = vi.mocked(queryOne);
const mockExecute = vi.mocked(execute);
const mockGetDb = vi.mocked(getDb);

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  mockGetDb.mockResolvedValue(mockConn as never);
  mockExecute.mockResolvedValue(undefined as never);

  const g = globalThis as typeof globalThis & { __session_manager?: Map<string, unknown> };
  g.__session_manager = undefined;
});

afterEach(() => {
  vi.useRealTimers();
});

describe("createSession", () => {
  it("creates a session and returns an ID", async () => {
    const id = await createSession({
      sessionType: "analyze-project",
      label: "Test session",
    });

    expect(typeof id).toBe("string");
    expect(id.length).toBeGreaterThan(0);
    expect(mockExecute).toHaveBeenCalledWith(
      mockConn,
      expect.stringContaining("INSERT INTO sessions"),
      expect.arrayContaining(["analyze-project", "Test session"]),
    );
  });

  it("passes projectPath and runId when provided", async () => {
    await createSession({
      sessionType: "generate-outline",
      label: "Outline session",
      projectPath: "/home/user/project",
      runId: "run-123",
    });

    expect(mockExecute).toHaveBeenCalledWith(
      mockConn,
      expect.any(String),
      expect.arrayContaining(["/home/user/project", "run-123"]),
    );
  });

  it("sets projectPath and runId to null when not provided", async () => {
    await createSession({
      sessionType: "chat",
      label: "Chat",
    });

    expect(mockExecute).toHaveBeenCalledWith(mockConn, expect.any(String), expect.arrayContaining([null, null]));
  });
});

describe("startSession", () => {
  it("starts a session and transitions to running", async () => {
    const sessionId = await createSession({ sessionType: "analyze-project", label: "Test" });

    mockQueryOne.mockResolvedValue({
      id: sessionId,
      session_type: "analyze-project",
      status: "pending",
      label: "Test",
      context_type: null,
      context_id: null,
      context_name: null,
      metadata_json: null,
      pid: null,
      progress: null,
      phase: null,
      started_at: null,
      completed_at: null,
      error_message: null,
      result_json: null,
      created_at: new Date().toISOString(),
    } as never);

    const runner = vi.fn().mockResolvedValue({ result: { done: true } });
    const liveSession = await startSession(sessionId, runner);

    expect(liveSession.id).toBe(sessionId);
    expect(liveSession.status).toBe("running");

    expect(mockExecute).toHaveBeenCalledWith(
      mockConn,
      expect.stringContaining("UPDATE sessions SET"),
      expect.arrayContaining(["running"]),
    );
  });

  it("throws if session not found in DB", async () => {
    mockQueryOne.mockResolvedValue(undefined as never);

    await expect(startSession("nonexistent-id", vi.fn())).rejects.toThrow("Session nonexistent-id not found");
  });

  it("returns existing session if already running", async () => {
    const sessionId = await createSession({ sessionType: "analyze-project", label: "Test" });

    mockQueryOne.mockResolvedValue({
      id: sessionId,
      session_type: "analyze-project",
      status: "pending",
      label: "Test",
      context_type: null,
      context_id: null,
      context_name: null,
      metadata_json: null,
      pid: null,
      progress: null,
      phase: null,
      started_at: null,
      completed_at: null,
      error_message: null,
      result_json: null,
      created_at: new Date().toISOString(),
    } as never);

    const runner = vi
      .fn()
      .mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve({ result: {} }), 10000)));

    const session1 = await startSession(sessionId, runner);
    const session2 = await startSession(sessionId, runner);
    expect(session1).toBe(session2);
  });
});

describe("subscribe", () => {
  it("returns null for non-existent session", () => {
    const unsub = subscribe("nonexistent", vi.fn());
    expect(unsub).toBeNull();
  });

  it("replays buffered events and subscribes to new ones", async () => {
    const sessionId = await createSession({ sessionType: "analyze-project", label: "Test" });

    mockQueryOne.mockResolvedValue({
      id: sessionId,
      session_type: "analyze-project",
      status: "pending",
      label: "Test",
      context_type: null,
      context_id: null,
      context_name: null,
      metadata_json: null,
      pid: null,
      progress: null,
      phase: null,
      started_at: null,
      completed_at: null,
      error_message: null,
      result_json: null,
      created_at: new Date().toISOString(),
    } as never);

    const runner = vi
      .fn()
      .mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve({ result: {} }), 10000)));

    await startSession(sessionId, runner);

    const events: unknown[] = [];
    const unsub = subscribe(sessionId, (event) => events.push(event));

    expect(unsub).not.toBeNull();
    expect(events.length).toBeGreaterThan(0);
    expect(events[0]).toEqual(expect.objectContaining({ type: "init" }));

    unsub?.();
  });
});

describe("getLiveSession", () => {
  it("returns undefined for non-existent session", () => {
    expect(getLiveSession("nonexistent")).toBeUndefined();
  });

  it("returns the live session after it is started", async () => {
    const sessionId = await createSession({ sessionType: "analyze-project", label: "Test" });

    mockQueryOne.mockResolvedValue({
      id: sessionId,
      session_type: "analyze-project",
      status: "pending",
      label: "Test",
      context_type: null,
      context_id: null,
      context_name: null,
      metadata_json: null,
      pid: null,
      progress: null,
      phase: null,
      started_at: null,
      completed_at: null,
      error_message: null,
      result_json: null,
      created_at: new Date().toISOString(),
    } as never);

    const runner = vi
      .fn()
      .mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve({ result: {} }), 10000)));

    await startSession(sessionId, runner);
    const session = getLiveSession(sessionId);
    expect(session).toBeDefined();
    expect(session?.id).toBe(sessionId);
  });
});

describe("cancelSession", () => {
  it("returns false for non-existent session with no DB record", async () => {
    mockQueryOne.mockResolvedValue(undefined as never);
    const result = await cancelSession("nonexistent");
    expect(result).toBe(false);
  });

  it("returns false for already completed session", async () => {
    mockQueryOne.mockResolvedValue({
      id: "done-sess",
      session_type: "analyze-project",
      status: "done",
      label: "Done",
      context_type: null,
      context_id: null,
      context_name: null,
      metadata_json: null,
      pid: null,
      progress: 100,
      phase: null,
      started_at: null,
      completed_at: new Date().toISOString(),
      error_message: null,
      result_json: null,
      created_at: new Date().toISOString(),
    } as never);

    const result = await cancelSession("done-sess");
    expect(result).toBe(false);
  });

  it("cancels an orphaned running session in DB", async () => {
    mockQueryOne.mockResolvedValue({
      id: "orphan-sess",
      session_type: "analyze-project",
      status: "running",
      label: "Orphan",
      context_type: null,
      context_id: null,
      context_name: null,
      metadata_json: null,
      pid: null,
      progress: 50,
      phase: null,
      started_at: new Date().toISOString(),
      completed_at: null,
      error_message: null,
      result_json: null,
      created_at: new Date().toISOString(),
    } as never);

    const result = await cancelSession("orphan-sess");
    expect(result).toBe(true);
    expect(mockExecute).toHaveBeenCalledWith(
      mockConn,
      expect.stringContaining("UPDATE sessions SET"),
      expect.arrayContaining(["cancelled"]),
    );
  });
});
