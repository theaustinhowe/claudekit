"use client";

import { createContext, useContext } from "react";
import { createThread, emptyActiveThreadIds, emptyThreads, getNextRevision } from "./thread-utils";
import type { ChatMessage, Phase, PhaseStatus, PhaseThread } from "./types";

interface AppState {
  currentPhase: Phase;
  phaseStatuses: Record<Phase, PhaseStatus>;
  threads: Record<Phase, PhaseThread[]>;
  activeThreadIds: Record<Phase, string | null>;
  viewingPhase: Phase;
  isTyping: boolean;
  projectName: string;
  rightPanelContent: Phase | null;
  editMode: Phase | null;
  projectPath: string | null;
  activeSessionId: string | null;
  fileBrowserOpen: boolean;
  historySidebarOpen: boolean;
  runId: string | null;
  panelRefreshKey: number;
}

export const initialState: AppState = {
  currentPhase: 1,
  phaseStatuses: {
    1: "active",
    2: "locked",
    3: "locked",
    4: "locked",
    5: "locked",
    6: "locked",
    7: "locked",
  },
  threads: emptyThreads(),
  activeThreadIds: emptyActiveThreadIds(),
  viewingPhase: 1,
  isTyping: false,
  projectName: "",
  rightPanelContent: null,
  editMode: null,
  projectPath: null,
  activeSessionId: null,
  fileBrowserOpen: false,
  historySidebarOpen: false,
  runId: null,
  panelRefreshKey: 0,
};

type AppAction =
  | { type: "SET_PHASE"; phase: Phase }
  | { type: "COMPLETE_PHASE"; phase: Phase }
  | { type: "SET_TYPING"; isTyping: boolean }
  | { type: "SET_PROJECT_NAME"; name: string }
  | { type: "SET_RIGHT_PANEL"; phase: Phase | null }
  | { type: "SET_EDIT_MODE"; phase: Phase | null }
  | { type: "GOTO_PHASE"; phase: Phase }
  | { type: "RESTART_FROM_PHASE"; phase: Phase }
  | { type: "SET_PROJECT_PATH"; path: string | null }
  | { type: "SET_ACTIVE_SESSION"; sessionId: string | null }
  | { type: "SET_FILE_BROWSER_OPEN"; open: boolean }
  | { type: "SET_HISTORY_SIDEBAR_OPEN"; open: boolean }
  | { type: "SET_RUN_ID"; runId: string }
  | { type: "SET_VIEWING_PHASE"; phase: Phase }
  | { type: "CREATE_THREAD"; phase: Phase; runId: string }
  | { type: "ADD_THREAD_MESSAGE"; phase: Phase; message: ChatMessage }
  | {
      type: "UPDATE_THREAD_MESSAGE";
      phase: Phase;
      messageId: string;
      updates: Partial<Pick<ChatMessage, "content" | "actionCard">>;
    }
  | { type: "SET_THREAD_DECISION"; phase: Phase; key: string; value: string }
  | { type: "COMPLETE_THREAD"; phase: Phase }
  | {
      type: "RESTORE_RUN";
      runId: string;
      projectPath: string;
      projectName: string;
      currentPhase: Phase;
      phaseStatuses: Record<Phase, PhaseStatus>;
      threads: Record<Phase, PhaseThread[]>;
      activeThreadIds: Record<Phase, string | null>;
    }
  | { type: "REFRESH_PANEL" }
  | { type: "RESET_STATE" };

export type { AppAction, AppState };

function updateActiveThread(state: AppState, phase: Phase, updater: (thread: PhaseThread) => PhaseThread): AppState {
  const threadId = state.activeThreadIds[phase];
  if (!threadId) return state;

  const phaseThreads = state.threads[phase].map((t) => (t.id === threadId ? updater(t) : t));
  return {
    ...state,
    threads: { ...state.threads, [phase]: phaseThreads },
  };
}

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "SET_PHASE":
      return {
        ...state,
        currentPhase: action.phase,
        phaseStatuses: {
          ...state.phaseStatuses,
          [action.phase]: "active",
        },
        rightPanelContent: action.phase,
        viewingPhase: action.phase,
      };

    case "COMPLETE_PHASE": {
      const nextPhase = (action.phase + 1) as Phase;
      // Also mark the active thread as completed
      const updatedState = updateActiveThread(state, action.phase, (t) => ({
        ...t,
        status: "completed" as const,
      }));
      return {
        ...updatedState,
        phaseStatuses: {
          ...updatedState.phaseStatuses,
          [action.phase]: "completed",
          ...(nextPhase <= 7 ? { [nextPhase]: "active" } : {}),
        },
        currentPhase: nextPhase <= 7 ? nextPhase : action.phase,
        rightPanelContent: nextPhase <= 7 ? nextPhase : action.phase,
        viewingPhase: nextPhase <= 7 ? nextPhase : action.phase,
      };
    }

    case "CREATE_THREAD": {
      const revision = getNextRevision(state.threads, action.phase);
      const thread = createThread(action.runId, action.phase, revision);
      return {
        ...state,
        threads: {
          ...state.threads,
          [action.phase]: [...state.threads[action.phase], thread],
        },
        activeThreadIds: {
          ...state.activeThreadIds,
          [action.phase]: thread.id,
        },
      };
    }

    case "ADD_THREAD_MESSAGE": {
      const threadId = state.activeThreadIds[action.phase];
      if (!threadId) {
        console.warn(`[B4U] ADD_THREAD_MESSAGE: No active thread for phase ${action.phase}, message dropped`);
        return state;
      }
      return updateActiveThread(state, action.phase, (t) => ({
        ...t,
        messages: [...t.messages, action.message],
      }));
    }

    case "UPDATE_THREAD_MESSAGE": {
      return updateActiveThread(state, action.phase, (t) => ({
        ...t,
        messages: t.messages.map((msg) => (msg.id === action.messageId ? { ...msg, ...action.updates } : msg)),
      }));
    }

    case "SET_THREAD_DECISION": {
      return updateActiveThread(state, action.phase, (t) => ({
        ...t,
        decisions: t.decisions.map((d) =>
          d.key === action.key ? { ...d, value: action.value, decidedAt: Date.now() } : d,
        ),
      }));
    }

    case "COMPLETE_THREAD": {
      return updateActiveThread(state, action.phase, (t) => ({
        ...t,
        status: "completed" as const,
      }));
    }

    case "SET_VIEWING_PHASE":
      return {
        ...state,
        viewingPhase: action.phase,
        rightPanelContent: action.phase,
      };

    case "SET_TYPING":
      return { ...state, isTyping: action.isTyping };

    case "SET_PROJECT_NAME":
      return { ...state, projectName: action.name };

    case "SET_RIGHT_PANEL":
      return { ...state, rightPanelContent: action.phase, panelRefreshKey: state.panelRefreshKey + 1 };

    case "SET_EDIT_MODE":
      return { ...state, editMode: action.phase };

    case "GOTO_PHASE":
      return {
        ...state,
        rightPanelContent: action.phase,
        viewingPhase: action.phase,
      };

    case "RESTART_FROM_PHASE": {
      // Supersede current active thread for the target phase
      const currentThreadId = state.activeThreadIds[action.phase];
      let phaseThreads = state.threads[action.phase].map((t) =>
        t.id === currentThreadId ? { ...t, status: "superseded" as const } : t,
      );

      // Create a new thread for the target phase
      const revision = getNextRevision(state.threads, action.phase);
      const newThread = createThread(state.runId ?? "", action.phase, revision);
      phaseThreads = [...phaseThreads, newThread];

      // Re-activate the target phase, lock everything after it
      // but preserve existing threads (they remain viewable as superseded)
      const newStatuses = { ...state.phaseStatuses };
      for (let p = 1; p <= 7; p++) {
        const phase = p as Phase;
        if (phase < action.phase) {
          newStatuses[phase] = "completed";
        } else if (phase === action.phase) {
          newStatuses[phase] = "active";
        } else {
          newStatuses[phase] = "locked";
        }
      }

      return {
        ...state,
        currentPhase: action.phase,
        phaseStatuses: newStatuses,
        threads: {
          ...state.threads,
          [action.phase]: phaseThreads,
        },
        activeThreadIds: {
          ...state.activeThreadIds,
          [action.phase]: newThread.id,
        },
        rightPanelContent: action.phase,
        viewingPhase: action.phase,
        editMode: null,
      };
    }

    case "SET_PROJECT_PATH":
      return { ...state, projectPath: action.path };

    case "SET_ACTIVE_SESSION":
      return { ...state, activeSessionId: action.sessionId };

    case "SET_FILE_BROWSER_OPEN":
      return { ...state, fileBrowserOpen: action.open };

    case "SET_HISTORY_SIDEBAR_OPEN":
      return { ...state, historySidebarOpen: action.open };

    case "SET_RUN_ID":
      return { ...state, runId: action.runId };

    case "RESTORE_RUN":
      return {
        ...state,
        runId: action.runId,
        projectPath: action.projectPath,
        projectName: action.projectName,
        currentPhase: action.currentPhase,
        phaseStatuses: action.phaseStatuses,
        threads: action.threads,
        activeThreadIds: action.activeThreadIds,
        rightPanelContent: action.currentPhase,
        viewingPhase: action.currentPhase,
        editMode: null,
        activeSessionId: null,
      };

    case "REFRESH_PANEL":
      return { ...state, panelRefreshKey: state.panelRefreshKey + 1 };

    case "RESET_STATE":
      return { ...initialState };

    default:
      return state;
  }
}

interface AppContextValue {
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
}

export const AppContext = createContext<AppContextValue | null>(null);

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
