import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db/index.js", () => ({
  getDb: vi.fn(async () => ({})),
}));

vi.mock("@devkit/duckdb", () => ({
  queryAll: vi.fn(),
  queryOne: vi.fn(),
  execute: vi.fn(),
  withTransaction: vi.fn(),
  buildUpdate: vi.fn(),
  buildWhere: vi.fn(),
  buildInClause: vi.fn(),
  checkpoint: vi.fn(),
}));

vi.mock("../utils/logger.js", () => ({
  createServiceLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock("../ws/handler.js", () => ({
  broadcast: vi.fn(),
}));

import { execute, queryAll } from "@devkit/duckdb";
import { broadcast } from "../ws/handler.js";

describe("health-events", () => {
  let emitHealthEvent: typeof import("./health-events.js").emitHealthEvent;
  let getRecentHealthEvents: typeof import("./health-events.js").getRecentHealthEvents;

  beforeEach(async () => {
    vi.resetAllMocks();
    vi.mocked(execute).mockResolvedValue(undefined);

    // Re-import to get fresh in-memory buffer
    vi.resetModules();
    const mod = await import("./health-events.js");
    emitHealthEvent = mod.emitHealthEvent;
    getRecentHealthEvents = mod.getRecentHealthEvents;
  });

  describe("emitHealthEvent", () => {
    it("should persist event to database", async () => {
      emitHealthEvent("agent_started", "Agent started for job-1");

      // persistEvent is async fire-and-forget, wait for microtask
      await vi.waitFor(() => {
        expect(execute).toHaveBeenCalledWith(
          expect.anything(),
          expect.stringContaining("INSERT INTO health_events"),
          expect.arrayContaining(["agent_started", "Agent started for job-1"]),
        );
      });
    });

    it("should broadcast event via WebSocket", () => {
      emitHealthEvent("shutdown_initiated", "Graceful shutdown started");

      expect(broadcast).toHaveBeenCalledWith({
        type: "health:event",
        payload: expect.objectContaining({
          type: "shutdown_initiated",
          message: "Graceful shutdown started",
          timestamp: expect.any(String),
        }),
      });
    });

    it("should include metadata when provided", async () => {
      emitHealthEvent("stale_job_detected", "Stale job found", { jobId: "j1", silentMinutes: 90 });

      await vi.waitFor(() => {
        expect(execute).toHaveBeenCalledWith(
          expect.anything(),
          expect.stringContaining("INSERT INTO health_events"),
          expect.arrayContaining([
            "stale_job_detected",
            "Stale job found",
            JSON.stringify({ jobId: "j1", silentMinutes: 90 }),
          ]),
        );
      });
    });

    it("should pass null metadata when not provided", async () => {
      emitHealthEvent("poll_cycle_complete", "Poll done");

      await vi.waitFor(() => {
        expect(execute).toHaveBeenCalled();
      });
      const params = vi.mocked(execute).mock.calls[0][2] as unknown[];
      // metadata param should be null
      expect(params[2]).toBeNull();
    });

    it("should maintain ring buffer of max 100 events", async () => {
      for (let i = 0; i < 110; i++) {
        emitHealthEvent("poll_cycle_complete", `Event ${i}`);
      }

      const events = await getRecentHealthEvents(200);
      expect(events).toHaveLength(100);
      expect(events[0].message).toBe("Event 10");
      expect(events[99].message).toBe("Event 109");
    });
  });

  describe("getRecentHealthEvents", () => {
    it("should return events from in-memory buffer", async () => {
      emitHealthEvent("agent_started", "Started 1");
      emitHealthEvent("agent_stopped", "Stopped 1");

      const events = await getRecentHealthEvents();

      expect(events).toHaveLength(2);
      expect(events[0].type).toBe("agent_started");
      expect(events[1].type).toBe("agent_stopped");
    });

    it("should respect limit parameter", async () => {
      emitHealthEvent("agent_started", "A");
      emitHealthEvent("agent_stopped", "B");
      emitHealthEvent("job_transitioned", "C");

      const events = await getRecentHealthEvents(2);

      expect(events).toHaveLength(2);
      expect(events[0].type).toBe("agent_stopped");
      expect(events[1].type).toBe("job_transitioned");
    });

    it("should fall back to database when buffer is empty", async () => {
      vi.mocked(queryAll).mockResolvedValue([
        { id: "1", type: "agent_started", message: "DB event 1", metadata: null, created_at: "2024-01-01T00:00:00Z" },
        {
          id: "2",
          type: "agent_stopped",
          message: "DB event 2",
          metadata: '{"key":"val"}',
          created_at: "2024-01-01T01:00:00Z",
        },
      ]);

      const events = await getRecentHealthEvents();

      expect(queryAll).toHaveBeenCalledWith(
        expect.anything(),
        expect.stringContaining("SELECT * FROM health_events"),
        [50],
      );
      // Events from DB are reversed (oldest first)
      expect(events).toHaveLength(2);
      expect(events[0].message).toBe("DB event 2");
      expect(events[1].message).toBe("DB event 1");
    });

    it("should parse metadata JSON from database rows", async () => {
      vi.mocked(queryAll).mockResolvedValue([
        {
          id: "1",
          type: "stale_job_detected",
          message: "Stale",
          metadata: '{"jobId":"j1"}',
          created_at: "2024-01-01T00:00:00Z",
        },
      ]);

      const events = await getRecentHealthEvents();

      expect(events[0].metadata).toEqual({ jobId: "j1" });
    });

    it("should return empty array on database error", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      vi.mocked(queryAll).mockRejectedValue(new Error("DB error"));

      const events = await getRecentHealthEvents();

      expect(events).toEqual([]);
    });
  });
});
