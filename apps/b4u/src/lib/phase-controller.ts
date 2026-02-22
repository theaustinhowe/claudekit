"use client";

import { useCallback, useRef } from "react";
import { useApp } from "./store";
import type { ActionCard, Phase, ProjectSummary } from "./types";
import { PHASE_LABELS } from "./types";
import { delay, uid } from "./utils";

/**
 * Wait for a session to reach a terminal state via SSE.
 * Resolves with the final event data, or rejects on error/cancel.
 */
function waitForSession(sessionId: string): Promise<Record<string, unknown> | undefined> {
  return new Promise((resolve, reject) => {
    const es = new EventSource(`/api/sessions/${sessionId}/stream`);

    es.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data);
        switch (parsed.type) {
          case "done":
            es.close();
            resolve(parsed.data);
            break;
          case "error":
            es.close();
            reject(new Error(parsed.message ?? "Session error"));
            break;
          case "cancelled":
            es.close();
            reject(new Error("Session cancelled"));
            break;
        }
      } catch {
        // ignore parse errors
      }
    };

    es.onerror = () => {
      es.close();
      reject(new Error("Stream connection lost"));
    };
  });
}

export function usePhaseController() {
  const { state, dispatch } = useApp();
  const busyRef = useRef(false);
  const stateRef = useRef(state);
  stateRef.current = state;

  const addAIMessage = useCallback(
    async (content: string, actionCard?: ActionCard, delayMs = 800): Promise<string> => {
      dispatch({ type: "SET_TYPING", isTyping: true });
      await delay(delayMs);
      dispatch({ type: "SET_TYPING", isTyping: false });
      const id = uid();
      dispatch({
        type: "ADD_MESSAGE",
        message: {
          id,
          role: "ai",
          content,
          timestamp: Date.now(),
          actionCard,
        },
      });
      return id;
    },
    [dispatch],
  );

  const addMessage = useCallback(
    (role: "ai" | "user" | "system", content: string, actionCard?: ActionCard) => {
      dispatch({
        type: "ADD_MESSAGE",
        message: { id: uid(), role, content, timestamp: Date.now(), actionCard },
      });
    },
    [dispatch],
  );

  /**
   * POST to an API route to start a session, show a progress card,
   * wait for completion, and return the result.
   */
  const runSessionPhase = useCallback(
    async (
      apiUrl: string,
      body: Record<string, unknown> | null,
      label: string,
    ): Promise<Record<string, unknown> | undefined> => {
      const runId = stateRef.current.runId;
      const merged = { ...(body ?? {}), ...(runId ? { runId } : {}) };
      const res = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(merged),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Request failed" }));
        throw new Error(err.error ?? `API error ${res.status}`);
      }

      const { sessionId } = await res.json();
      dispatch({ type: "SET_ACTIVE_SESSION", sessionId });

      // Show progress card in chat
      addMessage("ai", label, { type: "session-progress", sessionId, label });

      // Wait for the session to complete
      const result = await waitForSession(sessionId);
      dispatch({ type: "SET_ACTIVE_SESSION", sessionId: null });
      return result;
    },
    [dispatch, addMessage],
  );

  // -----------------------------------------------------------------------
  // Phase 1 — Project Selection
  // -----------------------------------------------------------------------

  const startPhase1 = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;

    await addAIMessage(
      "Welcome to B4U. I'll scan your web app's codebase and generate a narrated demo video, walking through every feature automatically.",
      undefined,
      500,
    );
    await delay(300);
    await addAIMessage("Let's start by selecting your project folder.", { type: "folder-select" }, 600);
    dispatch({ type: "SET_RIGHT_PANEL", phase: 1 });
    busyRef.current = false;
  }, [addAIMessage, dispatch]);

  const handleFolderSelected = useCallback(
    async (path: string) => {
      if (busyRef.current) return;
      busyRef.current = true;

      const runId = crypto.randomUUID();
      dispatch({ type: "SET_RUN_ID", runId });
      dispatch({ type: "SET_PROJECT_PATH", path });

      addMessage("user", `Selected: ${path}`);

      const scanningId = await addAIMessage(
        "Scanning project structure...",
        { type: "scanning", label: "Analyzing files and dependencies..." },
        400,
      );

      // Quick scan via fs/tree for immediate feedback
      let projectSummary: ProjectSummary;
      try {
        const treeRes = await fetch("/api/fs/tree", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path }),
        });
        if (!treeRes.ok) throw new Error("Scan failed");
        const scan = await treeRes.json();
        projectSummary = {
          name: scan.name,
          framework: scan.framework,
          directories: scan.directories,
          auth: scan.auth,
          database: scan.database,
        };

        // Persist tree to DB before showing panel (panel fetches it immediately)
        if (scan.tree) {
          try {
            await fetch(`/api/file-tree?runId=${runId}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ tree: scan.tree, name: scan.name }),
            });
          } catch {
            // Tree display is non-critical — continue even if save fails
          }
        }
      } catch {
        projectSummary = {
          name: path.split("/").pop() || "Project",
          framework: "Unknown",
          directories: [],
          auth: "Unknown",
          database: "Unknown",
        };
      }

      dispatch({ type: "SET_PROJECT_NAME", name: projectSummary.name });
      dispatch({ type: "SET_RIGHT_PANEL", phase: 1 });

      // Replace the scanning message with the project summary
      dispatch({
        type: "UPDATE_MESSAGE",
        id: scanningId,
        updates: {
          content: "Project detected! Here's what I found:",
          actionCard: { type: "project-summary", data: projectSummary },
        },
      });

      await addAIMessage(
        "Here's the file tree on the right. When you're ready, I'll run a deep analysis with Claude to map out routes and flows.",
        { type: "approve", phase: 1, label: "Looks good" },
        500,
      );
      busyRef.current = false;
    },
    [addAIMessage, addMessage, dispatch],
  );

  // -----------------------------------------------------------------------
  // Approve & advance
  // -----------------------------------------------------------------------

  const approvePhase = useCallback(
    async (phase: Phase) => {
      if (busyRef.current) return;
      busyRef.current = true;

      addMessage("user", "Approved \u2713");
      dispatch({ type: "COMPLETE_PHASE", phase });

      const nextPhase = (phase + 1) as Phase;

      try {
        switch (nextPhase) {
          // Phase 2 — Outline
          case 2: {
            await addAIMessage(
              "Great. Let me run a deep analysis of your codebase first, then outline the app's user flows and URL structure.",
              undefined,
              600,
            );

            // Deep analysis — maps routes, auth, database, etc. from source code
            const projectPath = stateRef.current.projectPath;
            try {
              await runSessionPhase("/api/analyze/project", { path: projectPath }, "Analyzing codebase with Claude...");
            } catch (err) {
              const msg = err instanceof Error ? err.message : "Analysis failed";
              await addAIMessage(`Deep analysis encountered an issue: ${msg}. Continuing with basic scan results.`);
            }

            const outlineResult = await runSessionPhase("/api/analyze/outline", null, "Generating app outline...");
            dispatch({ type: "SET_RIGHT_PANEL", phase: 2 });

            // Build context summary from result data
            const routeCount = (outlineResult as { routeCount?: number })?.routeCount ?? "several";
            const flowCount = (outlineResult as { flowCount?: number })?.flowCount ?? "multiple";
            await addAIMessage(
              `I've mapped out ${routeCount} routes and ${flowCount} user flows on the right. Review the outline and edit anything that needs adjusting.`,
              { type: "approve", phase: 2 },
              500,
            );
            break;
          }

          // Phase 3 — Data Plan
          case 3: {
            await addAIMessage(
              "Now I'll figure out what mock data and environment setup is needed for the recordings.",
              undefined,
              600,
            );

            const dataPlanResult = await runSessionPhase("/api/analyze/data-plan", null, "Generating data plan...");
            dispatch({ type: "SET_RIGHT_PANEL", phase: 3 });

            const entityCount = (dataPlanResult as { entityCount?: number })?.entityCount ?? "several";
            const authCount = (dataPlanResult as { authCount?: number })?.authCount ?? "some";
            await addAIMessage(
              `The data plan is ready \u2014 ${entityCount} mock data entities and ${authCount} auth overrides configured. Toggle settings on the right.`,
              { type: "approve", phase: 3 },
              700,
            );
            break;
          }

          // Phase 4 — Demo Scripts
          case 4: {
            await addAIMessage(
              "Time to write the demo scripts. I'll create a step-by-step walkthrough for each user flow.",
              undefined,
              600,
            );

            const scriptsResult = await runSessionPhase(
              "/api/analyze/scripts",
              null,
              "Generating demo scripts and voiceover text...",
            );
            dispatch({ type: "SET_RIGHT_PANEL", phase: 4 });

            const scriptFlowCount = (scriptsResult as { flowCount?: number })?.flowCount ?? "multiple";
            const totalSteps = (scriptsResult as { totalSteps?: number })?.totalSteps ?? "several";
            await addAIMessage(
              `Created scripts for ${scriptFlowCount} flows with ${totalSteps} total steps. Each step includes URL, action, expected result, and timing.`,
              undefined,
              800,
            );
            await addAIMessage(
              "Edit anything on the right, or tell me what to adjust.",
              { type: "approve", phase: 4, label: "Scripts look good" },
              500,
            );
            break;
          }

          // Phase 5 — Recording
          case 5: {
            await addAIMessage(
              "Starting the recording process. I'll launch the app, seed the data, and record each flow. Watch the progress on the right.",
              undefined,
              600,
            );
            dispatch({ type: "SET_RIGHT_PANEL", phase: 5 });

            const projectPath = stateRef.current.projectPath;
            await runSessionPhase("/api/recording/start", { projectPath }, "Recording flows...");

            await addAIMessage(
              "All flows recorded! The raw recordings are ready.",
              { type: "recording-complete" },
              400,
            );
            await addAIMessage(
              "Ready to create the voiceover narration?",
              { type: "approve", phase: 5, label: "Continue to voiceover" },
              500,
            );
            break;
          }

          // Phase 6 — Voiceover
          case 6: {
            await addAIMessage(
              "All flows recorded. Now let's create the voiceover narration to go with the video.",
              undefined,
              600,
            );
            // Panel shows data from earlier phases (scripts, voiceover) — safe to show immediately
            dispatch({ type: "SET_RIGHT_PANEL", phase: 6 });
            await addAIMessage(
              "The voiceover script is ready on the right, synced to the video timeline. Pick a voice and preview the audio.",
              undefined,
              800,
            );
            await addAIMessage(
              "Edit the voiceover script to your liking, then approve to generate audio.",
              { type: "approve", phase: 6, label: "Generate audio" },
              500,
            );
            break;
          }

          // Phase 7 — Final Merge
          case 7: {
            await addAIMessage("Generating voiceover audio...", undefined, 400);

            // Generate audio first
            await runSessionPhase(
              "/api/audio/generate",
              { voiceId: "default", speed: 1.0 },
              "Generating voiceover audio...",
            );

            // Then merge video + audio
            await runSessionPhase("/api/video/merge", null, "Merging video and audio...");

            dispatch({ type: "SET_RIGHT_PANEL", phase: 7 });

            await addAIMessage(
              "Your feature walkthrough is ready! You can play it on the right, jump to specific chapters, or download in various formats.",
              { type: "final-ready" },
              500,
            );
            break;
          }

          default:
            break;
        }
      } catch (err) {
        dispatch({ type: "RESTART_FROM_PHASE", phase });
        const msg = err instanceof Error ? err.message : "Something went wrong";
        await addAIMessage(`An error occurred: ${msg}`, {
          type: "approve",
          phase,
          label: "Retry",
        });
      }

      busyRef.current = false;
    },
    [addAIMessage, addMessage, dispatch, runSessionPhase],
  );

  // -----------------------------------------------------------------------
  // Recording complete (called from Phase5Recording onComplete)
  // -----------------------------------------------------------------------

  const handleRecordingComplete = useCallback(async () => {
    await addAIMessage("All flows recorded! The raw recordings are ready.", { type: "recording-complete" }, 400);
    await delay(300);
    await addAIMessage(
      "Ready to create the voiceover narration?",
      { type: "approve", phase: 5, label: "Continue to voiceover" },
      500,
    );
  }, [addAIMessage]);

  // -----------------------------------------------------------------------
  // Free-form user messages
  // -----------------------------------------------------------------------

  const getPhaseContext = useCallback(
    (phase: Phase, message: string): string => {
      const lower = message.toLowerCase();

      if (lower.includes("help") || lower.includes("what") || lower.includes("how")) {
        const contextMap: Record<Phase, string> = {
          1: "Right now we're in the Project Selection phase. Select your project folder and I'll scan the codebase to detect the framework, auth setup, and database. You can also ask me about what B4U does.",
          2: "We're reviewing the App Outline \u2014 I've mapped your routes and user flows on the right panel. You can ask me to add, remove, or modify any routes or flows. Click 'Edit...' on the approve card to request specific changes.",
          3: "This is the Data & Environment phase. The right panel shows mock data entities, auth overrides, and environment config. Toggle settings on the right, or tell me what to change.",
          4: "We're on Demo Scripts. Each tab on the right shows a step-by-step walkthrough for a user flow. You can ask me to adjust timing, reword actions, add or remove steps.",
          5: "Recording is in progress. The flows are being recorded automatically \u2014 you can watch progress on the right. I'll let you know when everything's done.",
          6: "We're editing the Voiceover. Pick a voice, adjust speed, and review the script on the right. You can ask me to rewrite sections, change tone, or adjust timing.",
          7: "Your video is ready! You can play it on the right, jump between chapters, or download in different formats. Let me know if you'd like to re-record or edit anything.",
        };
        return contextMap[phase];
      }

      if (lower.includes("skip") || lower.includes("next") || lower.includes("continue")) {
        if (state.phaseStatuses[phase] === "active") {
          return `To move forward, review the ${PHASE_LABELS[phase]} content on the right panel and click the approve button when you're satisfied. You can also click 'Edit...' to request changes first.`;
        }
        return "That phase is already complete. We'll continue with the current step.";
      }

      if (
        lower.includes("change") ||
        lower.includes("edit") ||
        lower.includes("modify") ||
        lower.includes("update") ||
        lower.includes("add") ||
        lower.includes("remove")
      ) {
        const editMap: Record<Phase, string> = {
          1: "Project selection is straightforward \u2014 just pick your folder and I'll handle the rest. If you want to switch projects, we can start over.",
          2: "Sure, I can adjust the app outline. Tell me specifically which routes or user flows you'd like to change, and I'll update the right panel.",
          3: "I can modify the data plan. Tell me which entities, auth overrides, or environment settings to adjust.",
          4: "I can edit the demo scripts. Tell me which flow and step to change \u2014 I can adjust actions, timing, or expected outcomes.",
          5: "Recording is automated, so I can't change steps mid-recording. But once it's done, we can re-record specific flows if needed.",
          6: "I can rewrite voiceover sections. Tell me which part to change and what tone or content you'd prefer.",
          7: "If you want to make changes, we can go back to edit the voiceover or re-record specific flows. Just let me know.",
        };
        return editMap[phase];
      }

      const defaults: Record<Phase, string> = {
        1: "Got it. We're waiting for you to select a project folder to get started. Click the folder select button above, or ask me anything about the process.",
        2: "Noted. Take a look at the routes and user flows on the right. When you're happy with the outline, approve to continue \u2014 or click 'Edit...' to request changes.",
        3: "Understood. Review the data plan on the right \u2014 toggle any settings you'd like to change, then approve when ready.",
        4: "Okay. Check the demo scripts on the right panel. Each tab walks through a user flow step-by-step. Approve when the scripts look right.",
        5: "Recording is running \u2014 sit tight while I capture each flow. You can watch the progress on the right.",
        6: "Got it. The voiceover editor is on the right \u2014 pick a voice, tweak the script, then approve to generate the audio.",
        7: "Your walkthrough video is ready on the right. Play it, jump to chapters, or download \u2014 let me know what else you need.",
      };
      return defaults[phase];
    },
    [state.phaseStatuses],
  );

  const handleUserMessage = useCallback(
    async (message: string) => {
      if (busyRef.current) return;
      busyRef.current = true;

      addMessage("user", message);
      dispatch({ type: "SET_TYPING", isTyping: true });

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message,
            phase: stateRef.current.currentPhase,
            runId: stateRef.current.runId,
          }),
        });

        dispatch({ type: "SET_TYPING", isTyping: false });

        if (res.ok) {
          const data = await res.json();
          const actionCard =
            data.suggestedAction === "approve"
              ? ({ type: "approve", phase: stateRef.current.currentPhase } as ActionCard)
              : data.suggestedAction === "edit"
                ? ({ type: "approve", phase: stateRef.current.currentPhase, label: "Edit..." } as ActionCard)
                : undefined;
          await addAIMessage(data.response, actionCard, 300);
        } else {
          // Fallback to keyword matching
          const response = getPhaseContext(stateRef.current.currentPhase, message);
          await addAIMessage(response, undefined, 300);
        }
      } catch {
        dispatch({ type: "SET_TYPING", isTyping: false });
        // Fallback to keyword matching on network error
        const response = getPhaseContext(stateRef.current.currentPhase, message);
        await addAIMessage(response, undefined, 300);
      }

      busyRef.current = false;
    },
    [addAIMessage, addMessage, dispatch, getPhaseContext],
  );

  // -----------------------------------------------------------------------
  // Edit handling — calls real edit API
  // -----------------------------------------------------------------------

  const handleEditRequest = useCallback(
    async (phase: Phase) => {
      if (busyRef.current) return;
      busyRef.current = true;

      dispatch({ type: "SET_EDIT_MODE", phase });

      await addAIMessage(
        `What would you like to change in the ${PHASE_LABELS[phase]} phase? Describe your edits below and I'll update accordingly.`,
        undefined,
        400,
      );

      busyRef.current = false;
    },
    [addAIMessage, dispatch],
  );

  const handleEditSubmit = useCallback(
    async (phase: Phase, request: string) => {
      if (busyRef.current) return;
      busyRef.current = true;

      addMessage("user", request);
      dispatch({ type: "SET_EDIT_MODE", phase: null });

      try {
        await runSessionPhase(
          "/api/analyze/edit",
          { phase, editRequest: request },
          `Applying edits to ${PHASE_LABELS[phase]}...`,
        );
        dispatch({ type: "REFRESH_PANEL" });

        await addAIMessage(
          `I've updated the ${PHASE_LABELS[phase]} based on your feedback. Review the changes on the right. Ready to approve?`,
          { type: "approve", phase, label: "Approve & Continue" },
          600,
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Edit failed";
        await addAIMessage(
          `Edit encountered an issue: ${msg}. You can try again or approve as-is.`,
          { type: "approve", phase, label: "Approve & Continue" },
          600,
        );
      }

      busyRef.current = false;
    },
    [addAIMessage, addMessage, dispatch, runSessionPhase],
  );

  // -----------------------------------------------------------------------
  // Go back / restart from a phase
  // -----------------------------------------------------------------------

  /**
   * Check if going back to a phase would discard completed work.
   * Returns the list of phases that would be reset.
   */
  const getAffectedPhases = useCallback((targetPhase: Phase): Phase[] => {
    const affected: Phase[] = [];
    for (let p = targetPhase + 1; p <= 7; p++) {
      const phase = p as Phase;
      if (stateRef.current.phaseStatuses[phase] === "completed") {
        affected.push(phase);
      }
    }
    return affected;
  }, []);

  const handleGoBackToPhase = useCallback(
    async (phase: Phase) => {
      if (busyRef.current) return;
      busyRef.current = true;

      // Check if any completed phases would be lost
      const affected = getAffectedPhases(phase);
      if (affected.length > 0) {
        const phaseNames = affected.map((p) => PHASE_LABELS[p]).join(", ");
        await addAIMessage(
          `Going back will reset completed phases: ${phaseNames}. Continue?`,
          { type: "confirm-restart" as "approve", phase, label: `Yes, go back to ${PHASE_LABELS[phase]}` },
          400,
        );
        busyRef.current = false;
        return;
      }

      dispatch({ type: "RESTART_FROM_PHASE", phase });

      await addAIMessage(
        `Going back to ${PHASE_LABELS[phase]}. I've reset everything from this point forward \u2014 make your changes and approve when ready.`,
        { type: "approve", phase, label: `Re-approve ${PHASE_LABELS[phase]}` },
        600,
      );

      busyRef.current = false;
    },
    [addAIMessage, dispatch, getAffectedPhases],
  );

  const handleEditPhaseFromPanel = useCallback(
    async (phase: Phase) => {
      if (busyRef.current) return;
      busyRef.current = true;

      // Check if any completed phases would be lost
      const affected = getAffectedPhases(phase);
      if (affected.length > 0) {
        const phaseNames = affected.map((p) => PHASE_LABELS[p]).join(", ");
        addMessage("user", `I want to go back and edit ${PHASE_LABELS[phase]}.`);
        await addAIMessage(
          `Going back will reset completed phases: ${phaseNames}. Are you sure?`,
          { type: "approve", phase, label: `Yes, restart from ${PHASE_LABELS[phase]}` },
          400,
        );
        busyRef.current = false;
        return;
      }

      addMessage("user", `I want to go back and edit ${PHASE_LABELS[phase]}.`);
      dispatch({ type: "RESTART_FROM_PHASE", phase });

      await addAIMessage(
        `Restarting from ${PHASE_LABELS[phase]}. Everything after this step has been reset. Make your changes on the right, then approve when you're ready to continue.`,
        { type: "approve", phase, label: `Re-approve ${PHASE_LABELS[phase]}` },
        600,
      );

      busyRef.current = false;
    },
    [addAIMessage, addMessage, dispatch, getAffectedPhases],
  );

  /**
   * Notify the chat when a sidebar edit is made (e.g., route updated, flow reordered).
   */
  const notifySidebarEdit = useCallback(
    (phase: Phase, description: string) => {
      dispatch({ type: "SIDEBAR_EDIT", phase, description });
    },
    [dispatch],
  );

  return {
    startPhase1,
    handleFolderSelected,
    approvePhase,
    handleRecordingComplete,
    handleUserMessage,
    handleEditRequest,
    handleEditSubmit,
    handleGoBackToPhase,
    handleEditPhaseFromPanel,
    notifySidebarEdit,
  };
}
