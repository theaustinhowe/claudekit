import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@claudekit/duckdb", () => ({
  execute: vi.fn(),
  queryOne: vi.fn(),
}));

vi.mock("@claudekit/session", () => ({
  createSessionManager: vi.fn(() => ({
    startSession: vi.fn(),
    cancelSession: vi.fn(),
    getLiveSession: vi.fn(),
    setCleanupFn: vi.fn(),
    setSessionPid: vi.fn(),
    emitEvent: vi.fn(),
  })),
}));

vi.mock("../db/index.js", () => ({
  getDb: vi.fn(async () => ({})),
}));

import {
  createSessionRecord,
  getActiveSessionCount,
  safeTerminateProcess,
  trackSession,
  untrackSession,
} from "./session-bridge.js";

describe("session-bridge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("session tracking", () => {
    afterEach(() => {
      // Clean up tracked sessions
      untrackSession("s1");
      untrackSession("s2");
    });

    it("tracks and untracks sessions", () => {
      expect(getActiveSessionCount()).toBe(0);
      trackSession("s1");
      expect(getActiveSessionCount()).toBe(1);
      trackSession("s2");
      expect(getActiveSessionCount()).toBe(2);
      untrackSession("s1");
      expect(getActiveSessionCount()).toBe(1);
    });
  });

  describe("createSessionRecord", () => {
    it("creates a session with defaults", async () => {
      const { execute } = await import("@claudekit/duckdb");
      const id = await createSessionRecord({ id: "test-id", label: "Test" });
      expect(id).toBe("test-id");
      expect(execute).toHaveBeenCalledWith(
        {},
        expect.stringContaining("INSERT INTO sessions"),
        expect.arrayContaining(["test-id", "claude_run", "Test"]),
      );
    });

    it("creates a session with all options", async () => {
      const { execute } = await import("@claudekit/duckdb");
      const id = await createSessionRecord({
        id: "test-id-2",
        sessionType: "research",
        label: "Research session",
        contextType: "repo",
        contextId: "repo-1",
        contextName: "My Repo",
        metadata: { key: "value" },
      });
      expect(id).toBe("test-id-2");
      expect(execute).toHaveBeenCalledWith(
        {},
        expect.stringContaining("INSERT INTO sessions"),
        expect.arrayContaining(["test-id-2", "research", "Research session", "repo", "repo-1", "My Repo"]),
      );
    });
  });

  describe("safeTerminateProcess", () => {
    it("returns false for non-existent process", async () => {
      // Use a PID that definitely doesn't exist
      const result = await safeTerminateProcess(999999999);
      expect(result).toBe(false);
    });
  });
});
