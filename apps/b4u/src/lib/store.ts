"use client";

import { createContext, useContext } from "react";
import type { ChatMessage, Phase, PhaseStatus } from "./types";

interface AppState {
  currentPhase: Phase;
  phaseStatuses: Record<Phase, PhaseStatus>;
  messages: ChatMessage[];
  isTyping: boolean;
  projectName: string;
  rightPanelContent: Phase | null;
  editMode: Phase | null;
  projectPath: string | null;
  activeSessionId: string | null;
  fileBrowserOpen: boolean;
  historySidebarOpen: boolean;
  runId: string | null;
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
  messages: [],
  isTyping: false,
  projectName: "",
  rightPanelContent: null,
  editMode: null,
  projectPath: null,
  activeSessionId: null,
  fileBrowserOpen: false,
  historySidebarOpen: false,
  runId: null,
};

type AppAction =
  | { type: "SET_PHASE"; phase: Phase }
  | { type: "COMPLETE_PHASE"; phase: Phase }
  | { type: "ADD_MESSAGE"; message: ChatMessage }
  | { type: "SET_TYPING"; isTyping: boolean }
  | { type: "SET_PROJECT_NAME"; name: string }
  | { type: "SET_RIGHT_PANEL"; phase: Phase | null }
  | { type: "SET_EDIT_MODE"; phase: Phase | null }
  | { type: "GOTO_PHASE"; phase: Phase }
  | { type: "RESTART_FROM_PHASE"; phase: Phase }
  | { type: "SET_PROJECT_PATH"; path: string | null }
  | { type: "SET_ACTIVE_SESSION"; sessionId: string | null }
  | { type: "SET_FILE_BROWSER_OPEN"; open: boolean }
  | { type: "UPDATE_MESSAGE"; id: string; updates: Partial<Pick<ChatMessage, "content" | "actionCard">> }
  | { type: "SET_HISTORY_SIDEBAR_OPEN"; open: boolean }
  | { type: "SET_RUN_ID"; runId: string }
  | {
      type: "RESTORE_RUN";
      runId: string;
      projectPath: string;
      projectName: string;
      currentPhase: Phase;
      phaseStatuses: Record<Phase, PhaseStatus>;
      messages: ChatMessage[];
    }
  | { type: "RESET_STATE" };

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
      };

    case "COMPLETE_PHASE": {
      const nextPhase = (action.phase + 1) as Phase;
      return {
        ...state,
        phaseStatuses: {
          ...state.phaseStatuses,
          [action.phase]: "completed",
          ...(nextPhase <= 7 ? { [nextPhase]: "active" } : {}),
        },
        currentPhase: nextPhase <= 7 ? nextPhase : action.phase,
        rightPanelContent: nextPhase <= 7 ? nextPhase : action.phase,
      };
    }

    case "ADD_MESSAGE":
      return {
        ...state,
        messages: [...state.messages, action.message],
      };

    case "SET_TYPING":
      return { ...state, isTyping: action.isTyping };

    case "SET_PROJECT_NAME":
      return { ...state, projectName: action.name };

    case "SET_RIGHT_PANEL":
      return { ...state, rightPanelContent: action.phase };

    case "SET_EDIT_MODE":
      return { ...state, editMode: action.phase };

    case "GOTO_PHASE":
      // Navigate to a completed phase to view it (no status change)
      return {
        ...state,
        rightPanelContent: action.phase,
      };

    case "RESTART_FROM_PHASE": {
      // Re-activate the target phase, lock everything after it
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
        rightPanelContent: action.phase,
        editMode: null,
      };
    }

    case "SET_PROJECT_PATH":
      return { ...state, projectPath: action.path };

    case "SET_ACTIVE_SESSION":
      return { ...state, activeSessionId: action.sessionId };

    case "SET_FILE_BROWSER_OPEN":
      return { ...state, fileBrowserOpen: action.open };

    case "UPDATE_MESSAGE":
      return {
        ...state,
        messages: state.messages.map((msg) => (msg.id === action.id ? { ...msg, ...action.updates } : msg)),
      };

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
        messages: action.messages,
        rightPanelContent: action.currentPhase,
        editMode: null,
        activeSessionId: null,
      };

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
