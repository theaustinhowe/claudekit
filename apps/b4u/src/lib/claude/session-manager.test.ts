import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  query: vi.fn(),
  execute: vi.fn(),
  executePrepared: vi.fn(),
}));

vi.mock("@/lib/db-init", () => ({
  ensureDatabase: vi.fn().mockResolvedValue(undefined),
}));

import { cancelSession, createSession, getLiveSession, startSession, subscribe } from "@/lib/claude/session-manager";
import { executePrepared, query } from "@/lib/db";

const mockQuery = vi.mocked(query);
const mockExecutePrepared = vi.mocked(executePrepared);

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  mockExecutePrepared.mockResolvedValue(undefined);

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
    expect(mockExecutePrepared).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO sessions"),
      expect.objectContaining({
        session_type: "analyze-project",
        label: "Test session",
      }),
    );
  });

  it("passes projectPath and runId when provided", async () => {
    await createSession({
      sessionType: "generate-outline",
      label: "Outline session",
      projectPath: "/home/user/project",
      runId: "run-123",
    });

    expect(mockExecutePrepared).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        project_path: "/home/user/project",
        run_id: "run-123",
      }),
    );
  });

  it("sets projectPath and runId to null when not provided", async () => {
    await createSession({
      sessionType: "chat",
      label: "Chat",
    });

    expect(mockExecutePrepared).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        project_path: null,
        run_id: null,
      }),
    );
  });
});

describe("startSession", () => {
  it("starts a session and transitions to running", async () => {
    const sessionId = await createSession({ sessionType: "analyze-project", label: "Test" });

    mockQuery.mockResolvedValue([
      {
        id: sessionId,
        session_type: "analyze-project",
        status: "pending",
        label: "Test",
        project_path: null,
        run_id: null,
        pid: null,
        progress: null,
        phase: null,
        started_at: null,
        completed_at: null,
        error_message: null,
        result_json: null,
        created_at: new Date().toISOString(),
      },
    ] as never);

    const runner = vi.fn().mockResolvedValue({ result: { done: true } });
    const liveSession = await startSession(sessionId, runner);

    expect(liveSession.id).toBe(sessionId);
    expect(liveSession.status).toBe("running");

    expect(mockExecutePrepared).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE sessions SET"),
      expect.objectContaining({ status: "running" }),
    );
  });

  it("throws if session not found in DB", async () => {
    mockQuery.mockResolvedValue([] as never);

    await expect(startSession("nonexistent-id", vi.fn())).rejects.toThrow("Session nonexistent-id not found");
  });

  it("returns existing session if already running", async () => {
    const sessionId = await createSession({ sessionType: "analyze-project", label: "Test" });

    mockQuery.mockResolvedValue([
      {
        id: sessionId,
        session_type: "analyze-project",
        status: "pending",
        label: "Test",
        project_path: null,
        run_id: null,
        pid: null,
        progress: null,
        phase: null,
        started_at: null,
        completed_at: null,
        error_message: null,
        result_json: null,
        created_at: new Date().toISOString(),
      },
    ] as never);

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

    mockQuery.mockResolvedValue([
      {
        id: sessionId,
        session_type: "analyze-project",
        status: "pending",
        label: "Test",
        project_path: null,
        run_id: null,
        pid: null,
        progress: null,
        phase: null,
        started_at: null,
        completed_at: null,
        error_message: null,
        result_json: null,
        created_at: new Date().toISOString(),
      },
    ] as never);

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

    mockQuery.mockResolvedValue([
      {
        id: sessionId,
        session_type: "analyze-project",
        status: "pending",
        label: "Test",
        project_path: null,
        run_id: null,
        pid: null,
        progress: null,
        phase: null,
        started_at: null,
        completed_at: null,
        error_message: null,
        result_json: null,
        created_at: new Date().toISOString(),
      },
    ] as never);

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
    mockQuery.mockResolvedValue([] as never);
    const result = await cancelSession("nonexistent");
    expect(result).toBe(false);
  });

  it("returns false for already completed session", async () => {
    mockQuery.mockResolvedValue([
      {
        id: "done-sess",
        session_type: "analyze-project",
        status: "done",
        label: "Done",
        project_path: null,
        run_id: null,
        pid: null,
        progress: 100,
        phase: null,
        started_at: null,
        completed_at: new Date().toISOString(),
        error_message: null,
        result_json: null,
        created_at: new Date().toISOString(),
      },
    ] as never);

    const result = await cancelSession("done-sess");
    expect(result).toBe(false);
  });

  it("cancels an orphaned running session in DB", async () => {
    mockQuery.mockResolvedValue([
      {
        id: "orphan-sess",
        session_type: "analyze-project",
        status: "running",
        label: "Orphan",
        project_path: null,
        run_id: null,
        pid: null,
        progress: 50,
        phase: null,
        started_at: new Date().toISOString(),
        completed_at: null,
        error_message: null,
        result_json: null,
        created_at: new Date().toISOString(),
      },
    ] as never);

    const result = await cancelSession("orphan-sess");
    expect(result).toBe(true);
    expect(mockExecutePrepared).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE sessions SET"),
      expect.objectContaining({ status: "cancelled" }),
    );
  });
});
