import { describe, expect, it } from "vitest";
import {
  areDecisionsComplete,
  buildDefaultDecisions,
  createThread,
  emptyActiveThreadIds,
  emptyThreads,
  getActiveThread,
  getNextRevision,
  getPhaseThreads,
} from "./thread-utils";
import type { Phase, PhaseThread } from "./types";

function makeThread(overrides: Partial<PhaseThread> = {}): PhaseThread {
  return {
    id: "thread-1",
    runId: "run-1",
    phase: 1,
    revision: 1,
    messages: [],
    decisions: buildDefaultDecisions(1),
    status: "active",
    createdAt: Date.now(),
    ...overrides,
  };
}

describe("thread-utils", () => {
  describe("getActiveThread", () => {
    it("returns the active thread for a phase", () => {
      const thread = makeThread({ id: "t-1" });
      const threads = { ...emptyThreads(), 1: [thread] };
      const activeIds = { ...emptyActiveThreadIds(), 1: "t-1" };
      expect(getActiveThread(threads, activeIds, 1)).toBe(thread);
    });

    it("returns null when no active thread id", () => {
      const threads = emptyThreads();
      const activeIds = emptyActiveThreadIds();
      expect(getActiveThread(threads, activeIds, 1)).toBeNull();
    });

    it("returns null when thread id does not match any thread", () => {
      const thread = makeThread({ id: "t-1" });
      const threads = { ...emptyThreads(), 1: [thread] };
      const activeIds = { ...emptyActiveThreadIds(), 1: "t-nonexistent" };
      expect(getActiveThread(threads, activeIds, 1)).toBeNull();
    });
  });

  describe("getPhaseThreads", () => {
    it("returns threads sorted by revision", () => {
      const t1 = makeThread({ id: "t-1", revision: 2 });
      const t2 = makeThread({ id: "t-2", revision: 1 });
      const threads = { ...emptyThreads(), 1: [t1, t2] };
      const result = getPhaseThreads(threads, 1);
      expect(result[0].revision).toBe(1);
      expect(result[1].revision).toBe(2);
    });

    it("returns empty array for phase with no threads", () => {
      expect(getPhaseThreads(emptyThreads(), 3)).toEqual([]);
    });
  });

  describe("areDecisionsComplete", () => {
    it("returns false when required decisions have null value", () => {
      const thread = makeThread({ phase: 1 });
      expect(areDecisionsComplete(thread)).toBe(false);
    });

    it("returns true when all required decisions are filled", () => {
      const thread = makeThread({ phase: 1 });
      for (const d of thread.decisions) {
        d.value = "test-value";
        d.decidedAt = Date.now();
      }
      expect(areDecisionsComplete(thread)).toBe(true);
    });

    it("returns true for phase 7 which has no required decisions", () => {
      const thread = makeThread({ phase: 7, decisions: [] });
      expect(areDecisionsComplete(thread)).toBe(true);
    });
  });

  describe("buildDefaultDecisions", () => {
    it("creates decisions matching phase 1 config", () => {
      const decisions = buildDefaultDecisions(1);
      expect(decisions).toHaveLength(2);
      expect(decisions[0].key).toBe("folder-path");
      expect(decisions[1].key).toBe("confirm-scan");
      expect(decisions[0].value).toBeNull();
      expect(decisions[1].value).toBeNull();
    });

    it("creates decisions for phase 6 with voice-selection", () => {
      const decisions = buildDefaultDecisions(6);
      expect(decisions).toHaveLength(2);
      expect(decisions[0].key).toBe("voice-selection");
      expect(decisions[1].key).toBe("approve-voiceover");
    });

    it("returns empty for phase 7", () => {
      expect(buildDefaultDecisions(7)).toHaveLength(0);
    });
  });

  describe("createThread", () => {
    it("creates a thread with correct defaults", () => {
      const thread = createThread("run-1", 2, 1);
      expect(thread.runId).toBe("run-1");
      expect(thread.phase).toBe(2);
      expect(thread.revision).toBe(1);
      expect(thread.messages).toEqual([]);
      expect(thread.status).toBe("active");
      expect(thread.decisions).toHaveLength(1); // phase 2 has 1 decision
    });
  });

  describe("getNextRevision", () => {
    it("returns 1 for empty threads", () => {
      expect(getNextRevision(emptyThreads(), 1)).toBe(1);
    });

    it("returns max revision + 1", () => {
      const t1 = makeThread({ revision: 1 });
      const t2 = makeThread({ revision: 3 });
      const threads = { ...emptyThreads(), 1: [t1, t2] };
      expect(getNextRevision(threads, 1)).toBe(4);
    });
  });

  describe("emptyThreads / emptyActiveThreadIds", () => {
    it("creates records for all 7 phases", () => {
      const threads = emptyThreads();
      const ids = emptyActiveThreadIds();
      for (let p = 1; p <= 7; p++) {
        expect(threads[p as Phase]).toEqual([]);
        expect(ids[p as Phase]).toBeNull();
      }
    });
  });
});
