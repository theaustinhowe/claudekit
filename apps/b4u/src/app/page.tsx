"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import { ChatPanel } from "@/components/chat/chat-panel";
import { LayoutShell } from "@/components/layout/layout-shell";
import { SplitPanel } from "@/components/layout/split-panel";
import { RightPanel } from "@/components/phases/right-panel";
import { ErrorBoundary } from "@/components/ui/error-boundary";
import { FileBrowser } from "@/components/ui/file-browser";
import { useRunParam } from "@/lib/hooks/use-run-param";
import { useStateSync } from "@/lib/hooks/use-state-sync";
import { usePhaseController } from "@/lib/phase-controller";
import { AppContext, appReducer, initialState, useApp } from "@/lib/store";
import type { ChatMessage, Phase, PhaseStatus } from "@/lib/types";

function AppShell() {
  const controller = usePhaseController();
  const { state, dispatch } = useApp();
  const startedRef = useRef(false);
  const { initialRunId, setRunId } = useRunParam();

  // Persist state to DB on changes
  useStateSync();

  const restoreRun = useCallback(
    async (runId: string) => {
      try {
        const res = await fetch(`/api/runs/${runId}`);
        if (!res.ok) return false;
        const data = await res.json();
        dispatch({
          type: "RESTORE_RUN",
          runId: data.runId,
          projectPath: data.projectPath,
          projectName: data.projectName,
          currentPhase: data.currentPhase as Phase,
          phaseStatuses: data.phaseStatuses as Record<Phase, PhaseStatus>,
          messages: (data.messages || []) as ChatMessage[],
        });
        return true;
      } catch {
        return false;
      }
    },
    [dispatch],
  );

  // On mount: restore run from URL param, or start fresh
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    if (initialRunId) {
      restoreRun(initialRunId).then((ok) => {
        if (!ok) controller.startPhase1();
      });
    } else {
      controller.startPhase1();
    }
  }, [controller, initialRunId, restoreRun]);

  // Keep URL in sync with runId state changes
  useEffect(() => {
    setRunId(state.runId);
  }, [state.runId, setRunId]);

  const handleNewThread = useCallback(() => {
    dispatch({ type: "RESET_STATE" });
    setRunId(null);
    setTimeout(() => controller.startPhase1(), 0);
  }, [dispatch, setRunId, controller]);

  const handleDeleteRun = useCallback(
    (deletedRunId: string) => {
      if (state.runId === deletedRunId) {
        handleNewThread();
      }
    },
    [state.runId, handleNewThread],
  );

  return (
    <LayoutShell
      onSelectRun={async (runId) => {
        await restoreRun(runId);
      }}
      onDeleteRun={handleDeleteRun}
      onNewThread={handleNewThread}
    >
      <SplitPanel
        left={
          <ErrorBoundary fallbackLabel="Chat panel encountered an error">
            <ChatPanel />
          </ErrorBoundary>
        }
        right={<RightPanel />}
      />
      <FileBrowser
        open={state.fileBrowserOpen}
        onClose={() => dispatch({ type: "SET_FILE_BROWSER_OPEN", open: false })}
        onSelect={(path) => {
          dispatch({ type: "SET_FILE_BROWSER_OPEN", open: false });
          controller.handleFolderSelected(path);
        }}
      />
    </LayoutShell>
  );
}

export default function Home() {
  const [state, dispatch] = useReducer(appReducer, initialState);

  return (
    <AppContext.Provider value={{ state, dispatch }}>
      <AppShell />
    </AppContext.Provider>
  );
}
