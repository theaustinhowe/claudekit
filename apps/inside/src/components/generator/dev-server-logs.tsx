"use client";

import type { LogEntry } from "@claudekit/ui/components/session-terminal";
import { SessionTerminal } from "@claudekit/ui/components/session-terminal";
import { useEffect, useMemo, useState } from "react";
import { AutoFixIndicator } from "@/components/generator/auto-fix-indicator";

interface DevServerLogsProps {
  projectId: string;
  projectPath?: string;
  autoFixEnabled?: boolean;
  onToggleAutoFix?: (enabled: boolean) => void;
}

const MAX_LINES = 200;

export function DevServerLogs({ projectId, projectPath, autoFixEnabled, onToggleAutoFix }: DevServerLogsProps) {
  const [lines, setLines] = useState<string[]>([]);

  useEffect(() => {
    let mounted = true;

    const poll = async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}/dev-server`);
        if (!res.ok || !mounted) return;
        const data = await res.json();
        if (data.logs && mounted) {
          const newLines = (data.logs as string[]).slice(-MAX_LINES);
          setLines(newLines);
        }
      } catch {
        // Silently ignore polling errors
      }
    };

    poll();
    const interval = setInterval(poll, 2000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [projectId]);

  const logEntries: LogEntry[] = useMemo(() => lines.map((line) => ({ log: line, logType: "status" })), [lines]);

  return (
    <SessionTerminal
      logs={logEntries}
      progress={null}
      phase={null}
      status={lines.length > 0 ? "streaming" : "idle"}
      error={null}
      elapsed={0}
      title="Dev Server"
      variant="terminal"
      headerExtra={
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-red-500/80" />
            <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
            <div className="w-3 h-3 rounded-full bg-green-500/80" />
          </div>
          {projectPath && onToggleAutoFix && (
            <AutoFixIndicator projectId={projectId} enabled={autoFixEnabled ?? false} onToggle={onToggleAutoFix} />
          )}
        </div>
      }
    />
  );
}
