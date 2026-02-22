"use client";

import type { SessionStreamEvent } from "@devkit/hooks";
import { useSessionStream } from "@devkit/hooks";
import { Badge } from "@devkit/ui/components/badge";
import { CheckCircle2, FileCode } from "lucide-react";
import { motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SessionTerminal } from "@devkit/ui/components/session-terminal";
import type { StreamEntry } from "@devkit/ui/components/streaming-display";
import { parseStreamLog, resetStreamIdCounter } from "@devkit/ui/components/streaming-display";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ScaffoldStatus = "idle" | "running" | "done" | "error";

interface ScaffoldStats {
  filesCreated: number;
  filesEdited: number;
  commandsRun: number;
}

interface ScaffoldTerminalProps {
  projectId: string;
  projectName?: string;
  onComplete: (stats: ScaffoldStats) => void;
  onCancel: () => void;
  onStatusChange?: (status: ScaffoldStatus, elapsed: number) => void;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function CompletionFooter({ entries }: { entries: StreamEntry[] }) {
  const filesCreated = entries.filter((e) => e.kind === "file-write").length;
  const filesEdited = entries.filter((e) => e.kind === "file-edit").length;
  const commandsRun = entries.filter((e) => e.kind === "bash-command").length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.1 }}
      className="flex items-center gap-3 px-4 py-2.5 border-t border-zinc-800 bg-emerald-500/[0.04]"
    >
      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
      <span className="text-xs text-emerald-400 font-medium">Scaffolding complete</span>
      <div className="flex items-center gap-2 ml-auto text-[11px] text-zinc-500">
        {filesCreated > 0 && (
          <span>
            {filesCreated} file{filesCreated !== 1 ? "s" : ""} created
          </span>
        )}
        {filesEdited > 0 && (
          <span>
            {filesEdited} file{filesEdited !== 1 ? "s" : ""} edited
          </span>
        )}
        {commandsRun > 0 && (
          <span>
            {commandsRun} command{commandsRun !== 1 ? "s" : ""} run
          </span>
        )}
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ScaffoldTerminal({
  projectId,
  projectName,
  onComplete,
  onCancel,
  onStatusChange,
}: ScaffoldTerminalProps) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [parsedLogs, setParsedLogs] = useState<StreamEntry[]>([]);

  const fileCount = useMemo(
    () => parsedLogs.filter((e) => e.kind === "file-write" || e.kind === "file-edit").length,
    [parsedLogs],
  );

  const handleEvent = useCallback((event: SessionStreamEvent) => {
    if (event.log) {
      const newEntries = parseStreamLog(event.log, event.logType ?? "status");
      if (newEntries.length > 0) {
        setParsedLogs((prev) => [...prev, ...newEntries]);
      }
    }
  }, []);

  const handleComplete = useCallback(
    (event: SessionStreamEvent) => {
      if (event.type === "done") {
        const stats: ScaffoldStats = {
          filesCreated: parsedLogs.filter((e) => e.kind === "file-write").length,
          filesEdited: parsedLogs.filter((e) => e.kind === "file-edit").length,
          commandsRun: parsedLogs.filter((e) => e.kind === "bash-command").length,
        };
        onComplete(stats);
      }
    },
    [onComplete, parsedLogs],
  );

  const session = useSessionStream({
    sessionId,
    autoConnect: true,
    onEvent: handleEvent,
    onComplete: handleComplete,
  });

  // Map session status to scaffold status for callbacks
  const scaffoldStatus: ScaffoldStatus =
    session.status === "streaming" || session.status === "connecting"
      ? "running"
      : session.status === "done"
        ? "done"
        : session.status === "error"
          ? "error"
          : "idle";

  // Notify parent of status changes
  // biome-ignore lint/correctness/useExhaustiveDependencies: only fire on status/elapsed changes
  useEffect(() => {
    onStatusChange?.(scaffoldStatus, session.elapsed);
  }, [scaffoldStatus, session.elapsed]);

  const createNewSession = useCallback(
    async (retry = false) => {
      if (!retry) {
        resetStreamIdCounter();
        setParsedLogs([]);
      } else {
        const retryEntry = parseStreamLog("--- Retrying ---", "status");
        setParsedLogs((prev) => [...prev, ...retryEntry]);
      }

      try {
        const res = await fetch("/api/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "scaffold",
            label: `Scaffold: ${projectName || projectId}`,
            contextType: "project",
            contextId: projectId,
            contextName: projectName || projectId,
            metadata: { retry },
          }),
        });

        if (!res.ok) {
          throw new Error(`Failed to create session: ${res.status}`);
        }

        const data = await res.json();
        setSessionId(data.sessionId);
      } catch {
        // Session creation failed — will show error via session status
      }
    },
    [projectId, projectName],
  );

  // On mount, check for an existing scaffold session (running or completed)
  // before creating a new one. This handles:
  // - Reconnecting to a running scaffold after navigating away and back
  // - Replaying completed scaffold logs when revisiting the project
  const startedRef = useRef(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: only run once on mount
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    async function init() {
      try {
        const res = await fetch(`/api/sessions?contextId=${encodeURIComponent(projectId)}&type=scaffold&limit=1`);
        if (res.ok) {
          const sessions = await res.json();
          if (sessions.length > 0) {
            // Found an existing session — reconnect/replay it
            setSessionId(sessions[0].id);
            return;
          }
        }
      } catch {
        // Fall through to create new session
      }
      // No existing session found — create a new one
      createNewSession();
    }

    init();
  }, []);

  const handleRetry = useCallback(() => {
    session.disconnect();
    setSessionId(null);
    createNewSession(true);
  }, [session, createNewSession]);

  const handleCancel = useCallback(() => {
    session.cancel();
    onCancel();
  }, [session, onCancel]);

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 relative min-h-0">
        {/* File counter badge overlay */}
        {fileCount > 0 && (
          <div className="absolute top-2 right-16 z-10">
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-5 gap-1">
              <FileCode className="w-3 h-3" />
              {fileCount}
            </Badge>
          </div>
        )}

        <SessionTerminal
          logs={session.logs}
          progress={session.progress}
          phase={session.phase}
          status={session.status}
          error={session.error}
          elapsed={session.elapsed}
          title="Scaffolding with Claude Code"
          variant="terminal"
          onCancel={handleCancel}
          onRetry={handleRetry}
        />
      </div>

      {/* Completion footer */}
      {scaffoldStatus === "done" && <CompletionFooter entries={parsedLogs} />}
    </div>
  );
}

export type { ScaffoldStats, ScaffoldStatus };
