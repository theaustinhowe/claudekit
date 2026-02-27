import { describe, expect, it } from "vitest";
import {
  areDecisionsComplete,
  buildDefaultDecisions,
  createRevisionThread,
  createThread,
  emptyActiveThreadIds,
  emptyThreads,
  getActiveThread,
  getMissingGateDecisions,
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

    it("returns one non-required decision for phase 7", () => {
      const decisions = buildDefaultDecisions(7);
      expect(decisions).toHaveLength(1);
      expect(decisions[0].key).toBe("review-output");
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

  describe("getMissingGateDecisions", () => {
    it("returns gate decisions that have null values", () => {
      // Phase 1 has folder-path (gate) and confirm-scan (not gate)
      const thread = makeThread({ phase: 1 });
      const missing = getMissingGateDecisions(thread);
      expect(missing).toHaveLength(1);
      expect(missing[0].key).toBe("folder-path");
    });

    it("returns empty array when all gate decisions are set", () => {
      const thread = makeThread({ phase: 1 });
      const folderDecision = thread.decisions.find((d) => d.key === "folder-path");
      if (folderDecision) {
        folderDecision.value = "/some/path";
        folderDecision.decidedAt = Date.now();
      }
      expect(getMissingGateDecisions(thread)).toHaveLength(0);
    });

    it("returns missing gate decisions for phase 6 (voice-selection)", () => {
      const thread = makeThread({ phase: 6, decisions: buildDefaultDecisions(6) });
      const missing = getMissingGateDecisions(thread);
      expect(missing).toHaveLength(1);
      expect(missing[0].key).toBe("voice-selection");
    });

    it("returns empty for phase 7 (no gate decisions)", () => {
      const thread = makeThread({ phase: 7, decisions: buildDefaultDecisions(7) });
      expect(getMissingGateDecisions(thread)).toHaveLength(0);
    });

    it("ignores non-gate decisions even if they are null", () => {
      const thread = makeThread({ phase: 1 });
      // Set the gate decision but leave confirm-scan (not gate) as null
      const folderDecision = thread.decisions.find((d) => d.key === "folder-path");
      if (folderDecision) {
        folderDecision.value = "/path";
        folderDecision.decidedAt = Date.now();
      }
      // confirm-scan is still null but it's not a gate
      expect(getMissingGateDecisions(thread)).toHaveLength(0);
    });
  });

  describe("createRevisionThread", () => {
    it("copies gate decision values from superseded thread", () => {
      // Phase 6 has voice-selection (gate) and approve-voiceover (not gate)
      const superseded = makeThread({ phase: 6, decisions: buildDefaultDecisions(6) });
      const voiceDecision = superseded.decisions.find((d) => d.key === "voice-selection");
      if (voiceDecision) {
        voiceDecision.value = "voice-abc";
        voiceDecision.decidedAt = 1000;
      }
      // Also set the non-gate decision
      const approveDecision = superseded.decisions.find((d) => d.key === "approve-voiceover");
      if (approveDecision) {
        approveDecision.value = "true";
        approveDecision.decidedAt = 2000;
      }

      const newThread = createRevisionThread("run-1", 6, 2, superseded);
      // Gate decision should be copied
      const newVoice = newThread.decisions.find((d) => d.key === "voice-selection");
      expect(newVoice?.value).toBe("voice-abc");
      expect(newVoice?.decidedAt).toBe(1000);

      // Non-gate decision should remain null
      const newApprove = newThread.decisions.find((d) => d.key === "approve-voiceover");
      expect(newApprove?.value).toBeNull();
    });

    it("returns default decisions when no superseded thread", () => {
      const newThread = createRevisionThread("run-1", 6, 1);
      const voice = newThread.decisions.find((d) => d.key === "voice-selection");
      expect(voice?.value).toBeNull();
    });

    it("handles phase with no gate decisions (phase 2)", () => {
      const superseded = makeThread({ phase: 2, decisions: buildDefaultDecisions(2) });
      const approveDecision = superseded.decisions.find((d) => d.key === "approve-outline");
      if (approveDecision) {
        approveDecision.value = "true";
      }

      const newThread = createRevisionThread("run-1", 2, 2, superseded);
      // approve-outline is not a gate, so should not be copied
      const newApprove = newThread.decisions.find((d) => d.key === "approve-outline");
      expect(newApprove?.value).toBeNull();
    });

    it("copies gate decisions for phase 1 (folder-path)", () => {
      const superseded = makeThread({ phase: 1 });
      const folderDecision = superseded.decisions.find((d) => d.key === "folder-path");
      if (folderDecision) {
        folderDecision.value = "/my/project";
        folderDecision.decidedAt = 5000;
      }

      const newThread = createRevisionThread("run-1", 1, 2, superseded);
      const newFolder = newThread.decisions.find((d) => d.key === "folder-path");
      expect(newFolder?.value).toBe("/my/project");

      // confirm-scan is not gate, should remain null
      const newConfirm = newThread.decisions.find((d) => d.key === "confirm-scan");
      expect(newConfirm?.value).toBeNull();
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
