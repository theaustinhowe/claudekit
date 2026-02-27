import { describe, expect, it, vi } from "vitest";
import { type AppState, appReducer, initialState } from "@/lib/store";
import { createThread, emptyActiveThreadIds, emptyThreads } from "@/lib/thread-utils";
import type { ChatMessage, Phase, PhaseStatus } from "@/lib/types";

function makeMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: "msg-1",
    role: "ai",
    content: "Hello",
    timestamp: Date.now(),
    ...overrides,
  };
}

function stateWithThread(phase: Phase, runId = "run-1"): AppState {
  const thread = createThread(runId, phase, 1);
  return {
    ...initialState,
    runId,
    currentPhase: phase,
    threads: { ...emptyThreads(), [phase]: [thread] },
    activeThreadIds: { ...emptyActiveThreadIds(), [phase]: thread.id },
    viewingPhase: phase,
  };
}

describe("appReducer", () => {
  describe("SET_PHASE", () => {
    it("sets the current phase and marks it active", () => {
      const state = appReducer(initialState, { type: "SET_PHASE", phase: 3 });
      expect(state.currentPhase).toBe(3);
      expect(state.phaseStatuses[3]).toBe("active");
      expect(state.rightPanelContent).toBe(3);
      expect(state.viewingPhase).toBe(3);
    });
  });

  describe("COMPLETE_PHASE", () => {
    it("marks phase as completed and advances to next", () => {
      const base = stateWithThread(1);
      const state = appReducer(base, { type: "COMPLETE_PHASE", phase: 1 });
      expect(state.phaseStatuses[1]).toBe("completed");
      expect(state.phaseStatuses[2]).toBe("active");
      expect(state.currentPhase).toBe(2);
      expect(state.rightPanelContent).toBe(2);
      expect(state.viewingPhase).toBe(2);
    });

    it("marks the active thread as completed", () => {
      const base = stateWithThread(1);
      const threadId = base.activeThreadIds[1] ?? "";
      const state = appReducer(base, { type: "COMPLETE_PHASE", phase: 1 });
      const thread = state.threads[1].find((t) => t.id === threadId);
      expect(thread?.status).toBe("completed");
    });

    it("stays on phase 7 when completing the last phase", () => {
      const base = {
        ...stateWithThread(7),
        phaseStatuses: { ...initialState.phaseStatuses, 7: "active" as PhaseStatus },
      };
      const state = appReducer(base, { type: "COMPLETE_PHASE", phase: 7 });
      expect(state.phaseStatuses[7]).toBe("completed");
      expect(state.currentPhase).toBe(7);
    });
  });

  describe("CREATE_THREAD", () => {
    it("creates a new thread for a phase", () => {
      const state = appReducer(initialState, { type: "CREATE_THREAD", phase: 1, runId: "run-1" });
      expect(state.threads[1]).toHaveLength(1);
      expect(state.threads[1][0].phase).toBe(1);
      expect(state.threads[1][0].revision).toBe(1);
      expect(state.activeThreadIds[1]).toBe(state.threads[1][0].id);
    });

    it("assigns incrementing revision numbers", () => {
      let state = appReducer(initialState, { type: "CREATE_THREAD", phase: 1, runId: "run-1" });
      state = appReducer(state, { type: "CREATE_THREAD", phase: 1, runId: "run-1" });
      expect(state.threads[1]).toHaveLength(2);
      expect(state.threads[1][0].revision).toBe(1);
      expect(state.threads[1][1].revision).toBe(2);
      expect(state.activeThreadIds[1]).toBe(state.threads[1][1].id);
    });
  });

  describe("ADD_THREAD_MESSAGE", () => {
    it("adds a message to the active thread", () => {
      const base = stateWithThread(1);
      const msg = makeMessage();
      const state = appReducer(base, { type: "ADD_THREAD_MESSAGE", phase: 1, message: msg });
      const thread = state.threads[1].find((t) => t.id === state.activeThreadIds[1]);
      expect(thread?.messages).toHaveLength(1);
      expect(thread?.messages[0]).toBe(msg);
    });

    it("does nothing if no active thread and logs a warning", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const msg = makeMessage();
      const state = appReducer(initialState, { type: "ADD_THREAD_MESSAGE", phase: 1, message: msg });
      expect(state.threads[1]).toEqual([]);
      expect(state).toBe(initialState);
      expect(warnSpy).toHaveBeenCalledWith("[B4U] ADD_THREAD_MESSAGE: No active thread for phase 1, message dropped");
      warnSpy.mockRestore();
    });
  });

  describe("UPDATE_THREAD_MESSAGE", () => {
    it("updates a message in the active thread", () => {
      const base = stateWithThread(1);
      const msg = makeMessage({ id: "msg-42", content: "Original" });
      let state = appReducer(base, { type: "ADD_THREAD_MESSAGE", phase: 1, message: msg });
      state = appReducer(state, {
        type: "UPDATE_THREAD_MESSAGE",
        phase: 1,
        messageId: "msg-42",
        updates: { content: "Updated" },
      });
      const thread = state.threads[1].find((t) => t.id === state.activeThreadIds[1]);
      expect(thread?.messages[0].content).toBe("Updated");
    });
  });

  describe("SET_THREAD_DECISION", () => {
    it("sets a decision value on the active thread", () => {
      const base = stateWithThread(1);
      const state = appReducer(base, {
        type: "SET_THREAD_DECISION",
        phase: 1,
        key: "folder-path",
        value: "/some/path",
      });
      const thread = state.threads[1].find((t) => t.id === state.activeThreadIds[1]);
      const decision = thread?.decisions.find((d) => d.key === "folder-path");
      expect(decision?.value).toBe("/some/path");
      expect(decision?.decidedAt).toBeTypeOf("number");
    });
  });

  describe("COMPLETE_THREAD", () => {
    it("marks the active thread as completed", () => {
      const base = stateWithThread(1);
      const state = appReducer(base, { type: "COMPLETE_THREAD", phase: 1 });
      const thread = state.threads[1].find((t) => t.id === state.activeThreadIds[1]);
      expect(thread?.status).toBe("completed");
    });
  });

  describe("SET_VIEWING_PHASE", () => {
    it("changes the viewing phase and right panel", () => {
      const state = appReducer(initialState, { type: "SET_VIEWING_PHASE", phase: 3 });
      expect(state.viewingPhase).toBe(3);
      expect(state.rightPanelContent).toBe(3);
    });
  });

  describe("SET_TYPING", () => {
    it("sets isTyping to true", () => {
      const state = appReducer(initialState, { type: "SET_TYPING", isTyping: true });
      expect(state.isTyping).toBe(true);
    });

    it("sets isTyping to false", () => {
      const state = appReducer({ ...initialState, isTyping: true }, { type: "SET_TYPING", isTyping: false });
      expect(state.isTyping).toBe(false);
    });
  });

  describe("SET_PROJECT_NAME", () => {
    it("sets the project name", () => {
      const state = appReducer(initialState, { type: "SET_PROJECT_NAME", name: "My Project" });
      expect(state.projectName).toBe("My Project");
    });
  });

  describe("SET_RIGHT_PANEL", () => {
    it("sets rightPanelContent to a phase", () => {
      const state = appReducer(initialState, { type: "SET_RIGHT_PANEL", phase: 5 });
      expect(state.rightPanelContent).toBe(5);
    });

    it("sets rightPanelContent to null", () => {
      const state = appReducer(initialState, { type: "SET_RIGHT_PANEL", phase: null });
      expect(state.rightPanelContent).toBeNull();
    });
  });

  describe("SET_EDIT_MODE", () => {
    it("sets editMode to a phase", () => {
      const state = appReducer(initialState, { type: "SET_EDIT_MODE", phase: 3 });
      expect(state.editMode).toBe(3);
    });

    it("clears editMode with null", () => {
      const state = appReducer({ ...initialState, editMode: 3 }, { type: "SET_EDIT_MODE", phase: null });
      expect(state.editMode).toBeNull();
    });
  });

  describe("GOTO_PHASE", () => {
    it("updates rightPanelContent and viewingPhase without changing currentPhase", () => {
      const state = appReducer(initialState, { type: "GOTO_PHASE", phase: 5 });
      expect(state.rightPanelContent).toBe(5);
      expect(state.viewingPhase).toBe(5);
      expect(state.currentPhase).toBe(1);
    });
  });

  describe("RESTART_FROM_PHASE", () => {
    it("supersedes current thread and creates a new one", () => {
      const base = stateWithThread(3, "run-1");
      const oldThreadId = base.activeThreadIds[3] ?? "";
      const state = appReducer(base, { type: "RESTART_FROM_PHASE", phase: 3 });

      // Old thread superseded
      const oldThread = state.threads[3].find((t) => t.id === oldThreadId);
      expect(oldThread?.status).toBe("superseded");

      // New thread created
      expect(state.threads[3]).toHaveLength(2);
      const newThreadId = state.activeThreadIds[3];
      expect(newThreadId).not.toBe(oldThreadId);
      const newThread = state.threads[3].find((t) => t.id === newThreadId);
      expect(newThread?.status).toBe("active");
      expect(newThread?.revision).toBe(2);
    });

    it("new revision thread inherits gate decision values from superseded thread", () => {
      // Set up phase 6 with voice-selection filled
      const base = stateWithThread(6, "run-1");
      let state = appReducer(base, {
        type: "SET_THREAD_DECISION",
        phase: 6,
        key: "voice-selection",
        value: "voice-xyz",
      });
      // Also set approve-voiceover (not gate)
      state = appReducer(state, {
        type: "SET_THREAD_DECISION",
        phase: 6,
        key: "approve-voiceover",
        value: "true",
      });

      // Restart phase 6
      state = appReducer(state, { type: "RESTART_FROM_PHASE", phase: 6 });

      // New thread should inherit gate decisions
      const newThreadId = state.activeThreadIds[6];
      const newThread = state.threads[6].find((t) => t.id === newThreadId);
      const voice = newThread?.decisions.find((d) => d.key === "voice-selection");
      expect(voice?.value).toBe("voice-xyz");

      // Non-gate decision should not be inherited
      const approve = newThread?.decisions.find((d) => d.key === "approve-voiceover");
      expect(approve?.value).toBeNull();
    });

    it("activates target phase and locks all after it", () => {
      const startState = {
        ...stateWithThread(3, "run-1"),
        currentPhase: 5 as Phase,
        phaseStatuses: {
          1: "completed" as PhaseStatus,
          2: "completed" as PhaseStatus,
          3: "completed" as PhaseStatus,
          4: "completed" as PhaseStatus,
          5: "active" as PhaseStatus,
          6: "locked" as PhaseStatus,
          7: "locked" as PhaseStatus,
        },
      };
      const state = appReducer(startState, { type: "RESTART_FROM_PHASE", phase: 3 });
      expect(state.currentPhase).toBe(3);
      expect(state.phaseStatuses[1]).toBe("completed");
      expect(state.phaseStatuses[2]).toBe("completed");
      expect(state.phaseStatuses[3]).toBe("active");
      expect(state.phaseStatuses[4]).toBe("locked");
      expect(state.phaseStatuses[5]).toBe("locked");
      expect(state.editMode).toBeNull();
      expect(state.viewingPhase).toBe(3);
    });
  });

  describe("SET_PROJECT_PATH", () => {
    it("sets project path", () => {
      const state = appReducer(initialState, { type: "SET_PROJECT_PATH", path: "/home/user/project" });
      expect(state.projectPath).toBe("/home/user/project");
    });

    it("clears project path with null", () => {
      const state = appReducer(
        { ...initialState, projectPath: "/some/path" },
        { type: "SET_PROJECT_PATH", path: null },
      );
      expect(state.projectPath).toBeNull();
    });
  });

  describe("SET_ACTIVE_SESSION", () => {
    it("sets active session ID", () => {
      const state = appReducer(initialState, { type: "SET_ACTIVE_SESSION", sessionId: "sess-123" });
      expect(state.activeSessionId).toBe("sess-123");
    });

    it("clears active session with null", () => {
      const state = appReducer(
        { ...initialState, activeSessionId: "sess-123" },
        { type: "SET_ACTIVE_SESSION", sessionId: null },
      );
      expect(state.activeSessionId).toBeNull();
    });
  });

  describe("SET_FILE_BROWSER_OPEN", () => {
    it("opens file browser", () => {
      const state = appReducer(initialState, { type: "SET_FILE_BROWSER_OPEN", open: true });
      expect(state.fileBrowserOpen).toBe(true);
    });

    it("closes file browser", () => {
      const state = appReducer(
        { ...initialState, fileBrowserOpen: true },
        { type: "SET_FILE_BROWSER_OPEN", open: false },
      );
      expect(state.fileBrowserOpen).toBe(false);
    });
  });

  describe("SET_HISTORY_SIDEBAR_OPEN", () => {
    it("opens the history sidebar", () => {
      const state = appReducer(initialState, { type: "SET_HISTORY_SIDEBAR_OPEN", open: true });
      expect(state.historySidebarOpen).toBe(true);
    });
  });

  describe("SET_RUN_ID", () => {
    it("sets the run ID", () => {
      const state = appReducer(initialState, { type: "SET_RUN_ID", runId: "run-abc" });
      expect(state.runId).toBe("run-abc");
    });
  });

  describe("RESTORE_RUN", () => {
    it("restores all run-related state including threads", () => {
      const thread = createThread("run-xyz", 1, 1);
      const threads = { ...emptyThreads(), 1: [thread] };
      const activeThreadIds = { ...emptyActiveThreadIds(), 1: thread.id };
      const phaseStatuses: Record<Phase, PhaseStatus> = {
        1: "completed",
        2: "completed",
        3: "active",
        4: "locked",
        5: "locked",
        6: "locked",
        7: "locked",
      };
      const state = appReducer(initialState, {
        type: "RESTORE_RUN",
        runId: "run-xyz",
        projectPath: "/path/to/project",
        projectName: "Restored Project",
        currentPhase: 3,
        phaseStatuses,
        threads,
        activeThreadIds,
      });
      expect(state.runId).toBe("run-xyz");
      expect(state.projectPath).toBe("/path/to/project");
      expect(state.projectName).toBe("Restored Project");
      expect(state.currentPhase).toBe(3);
      expect(state.phaseStatuses).toEqual(phaseStatuses);
      expect(state.threads).toBe(threads);
      expect(state.activeThreadIds).toBe(activeThreadIds);
      expect(state.rightPanelContent).toBe(3);
      expect(state.viewingPhase).toBe(3);
      expect(state.editMode).toBeNull();
      expect(state.activeSessionId).toBeNull();
    });
  });

  describe("RESET_STATE", () => {
    it("resets to initial state", () => {
      const modifiedState = {
        ...initialState,
        currentPhase: 5 as Phase,
        projectName: "Something",
        isTyping: true,
      };
      const state = appReducer(modifiedState, { type: "RESET_STATE" });
      expect(state).toEqual(initialState);
    });
  });

  describe("unknown action", () => {
    it("returns the same state for unknown action types", () => {
      const state = appReducer(initialState, { type: "UNKNOWN" } as never);
      expect(state).toBe(initialState);
    });
  });

  // ---------------------------------------------------------------------------
  // Integration: multi-step phase transition flows
  // ---------------------------------------------------------------------------

  describe("phase transition flows", () => {
    it("full startup → folder select → approve flow keeps panel in sync", () => {
      // 1. Start: create runId and thread for phase 1
      let state = appReducer(initialState, { type: "SET_RUN_ID", runId: "run-1" });
      state = appReducer(state, { type: "CREATE_THREAD", phase: 1, runId: "run-1" });

      // 2. Add welcome messages (should land in phase 1 thread)
      const msg1 = makeMessage({ id: "welcome", content: "Welcome to B4U" });
      state = appReducer(state, { type: "ADD_THREAD_MESSAGE", phase: 1, message: msg1 });
      expect(state.threads[1][0].messages).toHaveLength(1);

      // 3. Set folder decision and project path
      state = appReducer(state, { type: "SET_THREAD_DECISION", phase: 1, key: "folder-path", value: "/my/project" });
      state = appReducer(state, { type: "SET_PROJECT_PATH", path: "/my/project" });
      state = appReducer(state, { type: "SET_PROJECT_NAME", name: "my-project" });
      state = appReducer(state, { type: "SET_RIGHT_PANEL", phase: 1 });

      expect(state.rightPanelContent).toBe(1);
      expect(state.viewingPhase).toBe(1);

      // 4. Approve phase 1 → advance to phase 2
      state = appReducer(state, { type: "COMPLETE_PHASE", phase: 1 });
      state = appReducer(state, { type: "CREATE_THREAD", phase: 2, runId: "run-1" });

      // Panel should advance to phase 2 (not stay on 1)
      expect(state.currentPhase).toBe(2);
      expect(state.viewingPhase).toBe(2);
      expect(state.rightPanelContent).toBe(2);
      expect(state.phaseStatuses[1]).toBe("completed");
      expect(state.phaseStatuses[2]).toBe("active");

      // Phase 2 messages should go to the new thread
      const msg2 = makeMessage({ id: "outline-msg", content: "Generating outline..." });
      state = appReducer(state, { type: "ADD_THREAD_MESSAGE", phase: 2, message: msg2 });
      const thread2 = state.threads[2].find((t) => t.id === state.activeThreadIds[2]);
      expect(thread2?.messages).toHaveLength(1);
    });

    it("COMPLETE_PHASE advances rightPanelContent so phase panels stay current", () => {
      const base = stateWithThread(3, "run-1");
      // Simulate phases 1-2 completed, 3 active
      let state = {
        ...base,
        phaseStatuses: {
          ...base.phaseStatuses,
          1: "completed" as PhaseStatus,
          2: "completed" as PhaseStatus,
          3: "active" as PhaseStatus,
        },
        rightPanelContent: 3 as Phase | null,
      };

      // Complete phase 3 → advance to 4
      state = appReducer(state, { type: "COMPLETE_PHASE", phase: 3 });

      // Panel advances to phase 4 (the new active phase)
      expect(state.rightPanelContent).toBe(4);
      expect(state.viewingPhase).toBe(4);
      expect(state.currentPhase).toBe(4);

      // The completed overlay should NOT apply to phase 4 (it's active, not completed)
      const content = state.rightPanelContent;
      const isViewingCompleted =
        content !== null && state.phaseStatuses[content as Phase] === "completed" && content !== state.currentPhase;
      expect(isViewingCompleted).toBe(false);
    });

    it("navigating to a completed phase via SET_VIEWING_PHASE triggers completed overlay", () => {
      // Phase 4 active, phases 1-3 completed
      const base = stateWithThread(4, "run-1");
      let state = {
        ...base,
        currentPhase: 4 as Phase,
        phaseStatuses: {
          ...base.phaseStatuses,
          1: "completed" as PhaseStatus,
          2: "completed" as PhaseStatus,
          3: "completed" as PhaseStatus,
          4: "active" as PhaseStatus,
        },
        rightPanelContent: 4 as Phase | null,
        viewingPhase: 4 as Phase,
      };

      // User clicks phase 2 in stepper
      state = appReducer(state, { type: "SET_VIEWING_PHASE", phase: 2 });

      expect(state.rightPanelContent).toBe(2);
      expect(state.viewingPhase).toBe(2);

      // Overlay should show for phase 2 (completed, not current)
      const content = state.rightPanelContent;
      const isViewingCompleted =
        content !== null && state.phaseStatuses[content as Phase] === "completed" && content !== state.currentPhase;
      expect(isViewingCompleted).toBe(true);
    });

    it("RESTORE_RUN sets panel to currentPhase for immediate data display", () => {
      const thread = createThread("run-restored", 3, 1);
      const state = appReducer(initialState, {
        type: "RESTORE_RUN",
        runId: "run-restored",
        projectPath: "/project",
        projectName: "Restored",
        currentPhase: 3,
        phaseStatuses: {
          1: "completed",
          2: "completed",
          3: "active",
          4: "locked",
          5: "locked",
          6: "locked",
          7: "locked",
        },
        threads: { ...emptyThreads(), 3: [thread] },
        activeThreadIds: { ...emptyActiveThreadIds(), 3: thread.id },
      });

      // Panel should show current phase (3), not a previous completed phase
      expect(state.rightPanelContent).toBe(3);
      expect(state.viewingPhase).toBe(3);

      // No completed overlay (phase 3 is active)
      const content = state.rightPanelContent;
      const isViewingCompleted =
        content !== null && state.phaseStatuses[content as Phase] === "completed" && content !== state.currentPhase;
      expect(isViewingCompleted).toBe(false);
    });

    it("messages dispatched without an active thread are dropped with warning", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      // No threads exist — message should be dropped
      const msg = makeMessage({ id: "orphan" });
      const state = appReducer(initialState, { type: "ADD_THREAD_MESSAGE", phase: 2, message: msg });
      expect(state).toBe(initialState);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("No active thread for phase 2"));

      warnSpy.mockRestore();
    });
  });
});
