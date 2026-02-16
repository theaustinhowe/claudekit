import { describe, expect, it } from "vitest";
import { appReducer, initialState } from "@/lib/store";
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

describe("appReducer", () => {
  describe("SET_PHASE", () => {
    it("sets the current phase and marks it active", () => {
      const state = appReducer(initialState, { type: "SET_PHASE", phase: 3 });
      expect(state.currentPhase).toBe(3);
      expect(state.phaseStatuses[3]).toBe("active");
      expect(state.rightPanelContent).toBe(3);
    });
  });

  describe("COMPLETE_PHASE", () => {
    it("marks phase as completed and advances to next", () => {
      const state = appReducer(initialState, { type: "COMPLETE_PHASE", phase: 1 });
      expect(state.phaseStatuses[1]).toBe("completed");
      expect(state.phaseStatuses[2]).toBe("active");
      expect(state.currentPhase).toBe(2);
      expect(state.rightPanelContent).toBe(2);
    });

    it("stays on phase 7 when completing the last phase", () => {
      const state = appReducer(
        { ...initialState, currentPhase: 7, phaseStatuses: { ...initialState.phaseStatuses, 7: "active" } },
        { type: "COMPLETE_PHASE", phase: 7 },
      );
      expect(state.phaseStatuses[7]).toBe("completed");
      expect(state.currentPhase).toBe(7);
    });

    it("completes middle phases correctly", () => {
      const state = appReducer(
        { ...initialState, currentPhase: 4, phaseStatuses: { ...initialState.phaseStatuses, 4: "active" } },
        { type: "COMPLETE_PHASE", phase: 4 },
      );
      expect(state.phaseStatuses[4]).toBe("completed");
      expect(state.phaseStatuses[5]).toBe("active");
      expect(state.currentPhase).toBe(5);
    });
  });

  describe("ADD_MESSAGE", () => {
    it("appends a message to the messages array", () => {
      const msg = makeMessage();
      const state = appReducer(initialState, { type: "ADD_MESSAGE", message: msg });
      expect(state.messages).toHaveLength(1);
      expect(state.messages[0]).toBe(msg);
    });

    it("preserves existing messages", () => {
      const msg1 = makeMessage({ id: "msg-1" });
      const msg2 = makeMessage({ id: "msg-2" });
      const s1 = appReducer(initialState, { type: "ADD_MESSAGE", message: msg1 });
      const s2 = appReducer(s1, { type: "ADD_MESSAGE", message: msg2 });
      expect(s2.messages).toHaveLength(2);
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
    it("updates rightPanelContent without changing currentPhase", () => {
      const state = appReducer(initialState, { type: "GOTO_PHASE", phase: 5 });
      expect(state.rightPanelContent).toBe(5);
      expect(state.currentPhase).toBe(1);
    });
  });

  describe("RESTART_FROM_PHASE", () => {
    it("activates target phase and locks all after it", () => {
      const startState = {
        ...initialState,
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
      expect(state.phaseStatuses[6]).toBe("locked");
      expect(state.phaseStatuses[7]).toBe("locked");
      expect(state.editMode).toBeNull();
      expect(state.rightPanelContent).toBe(3);
    });

    it("restarting from phase 1 locks all phases except phase 1", () => {
      const state = appReducer(initialState, { type: "RESTART_FROM_PHASE", phase: 1 });
      expect(state.phaseStatuses[1]).toBe("active");
      for (let p = 2; p <= 7; p++) {
        expect(state.phaseStatuses[p as Phase]).toBe("locked");
      }
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

  describe("UPDATE_MESSAGE", () => {
    it("updates the content of a specific message", () => {
      const msg = makeMessage({ id: "msg-42", content: "Original" });
      const s1 = appReducer(initialState, { type: "ADD_MESSAGE", message: msg });
      const s2 = appReducer(s1, { type: "UPDATE_MESSAGE", id: "msg-42", updates: { content: "Updated" } });
      expect(s2.messages[0].content).toBe("Updated");
    });

    it("does not modify other messages", () => {
      const msg1 = makeMessage({ id: "msg-1", content: "First" });
      const msg2 = makeMessage({ id: "msg-2", content: "Second" });
      let state = appReducer(initialState, { type: "ADD_MESSAGE", message: msg1 });
      state = appReducer(state, { type: "ADD_MESSAGE", message: msg2 });
      state = appReducer(state, { type: "UPDATE_MESSAGE", id: "msg-2", updates: { content: "Changed" } });
      expect(state.messages[0].content).toBe("First");
      expect(state.messages[1].content).toBe("Changed");
    });

    it("does nothing if message ID is not found", () => {
      const msg = makeMessage({ id: "msg-1" });
      const s1 = appReducer(initialState, { type: "ADD_MESSAGE", message: msg });
      const s2 = appReducer(s1, { type: "UPDATE_MESSAGE", id: "nonexistent", updates: { content: "Nope" } });
      expect(s2.messages[0].content).toBe(msg.content);
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
    it("restores all run-related state", () => {
      const messages = [makeMessage({ id: "msg-r1" })];
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
        messages,
      });
      expect(state.runId).toBe("run-xyz");
      expect(state.projectPath).toBe("/path/to/project");
      expect(state.projectName).toBe("Restored Project");
      expect(state.currentPhase).toBe(3);
      expect(state.phaseStatuses).toEqual(phaseStatuses);
      expect(state.messages).toBe(messages);
      expect(state.rightPanelContent).toBe(3);
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
        messages: [makeMessage()],
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
});
