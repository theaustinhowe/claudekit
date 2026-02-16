"use client";

import { useSessionStream } from "@devkit/hooks";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { SessionTerminal } from "@/components/sessions/session-terminal";
import type { Repo } from "@/lib/types";

// --- Types ---

interface AIFileGenSession {
  id: string;
  fileName: string;
}

interface FileGenStatus {
  generating: boolean;
  done: "success" | "error" | "skipped" | null;
  statusText?: string;
}

// --- Hook ---

export function useAIFileGen(repo: Pick<Repo, "id" | "name">) {
  const [sessions, setSessions] = useState<AIFileGenSession[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [fileStatuses, setFileStatuses] = useState<Map<string, FileGenStatus>>(new Map());

  const anyGenerating = [...fileStatuses.values()].some((s) => s.generating);

  const updateFileStatus = useCallback((fileName: string, status: FileGenStatus) => {
    setFileStatuses((prev) => {
      const next = new Map(prev);
      next.set(fileName, status);
      return next;
    });
  }, []);

  const generateFile = useCallback(
    async (fileName: string, action: "create" | "update") => {
      try {
        const res = await fetch("/api/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "ai_file_gen",
            label: `${action === "create" ? "Create" : "Update"} ${fileName}`,
            contextType: "repo",
            contextId: repo.id,
            contextName: repo.name,
            metadata: { repoId: repo.id, fileName, action },
          }),
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Failed to start session");
        }

        const { sessionId } = await res.json();
        setSessions((prev) => [...prev, { id: sessionId, fileName }]);
        updateFileStatus(fileName, { generating: true, done: null, statusText: "Starting..." });
        return sessionId;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Generation failed";
        toast.error(`${fileName}: ${message}`);
        updateFileStatus(fileName, { generating: false, done: "error", statusText: message });
        return null;
      }
    },
    [repo.id, repo.name, updateFileStatus],
  );

  const generateFiles = useCallback(
    async (files: Array<{ path: string; present: boolean }>) => {
      if (files.length === 0) return;

      let firstId: string | null = null;
      for (const file of files) {
        const sid = await generateFile(file.path, file.present ? "update" : "create");
        if (sid && !firstId) firstId = sid;
      }
      if (firstId) setExpandedId(firstId);
    },
    [generateFile],
  );

  const dismissSession = useCallback((id: string) => {
    setSessions((prev) => {
      const session = prev.find((s) => s.id === id);
      if (session) {
        setFileStatuses((fs) => {
          const next = new Map(fs);
          next.delete(session.fileName);
          return next;
        });
      }
      return prev.filter((s) => s.id !== id);
    });
    setExpandedId((prev) => (prev === id ? null : prev));
  }, []);

  const dismissAll = useCallback(() => {
    setSessions([]);
    setFileStatuses(new Map());
    setExpandedId(null);
  }, []);

  const toggleExpand = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  // Recovery: reconnect to running sessions on mount
  useEffect(() => {
    let cancelled = false;

    async function recover() {
      try {
        const res = await fetch(`/api/sessions?contextId=${encodeURIComponent(repo.id)}&type=ai_file_gen&limit=20`);
        if (!res.ok || cancelled) return;

        const fetched = (await res.json()) as Array<{
          id: string;
          status: string;
          metadata_json: string;
          created_at: string;
        }>;

        // Only recover sessions from the last 30 minutes
        const cutoff = Date.now() - 30 * 60 * 1000;
        const recent = fetched.filter((s) => new Date(s.created_at).getTime() > cutoff);
        if (recent.length === 0 || cancelled) return;

        // Deduplicate by fileName — first = most recent (ordered by created_at DESC)
        const seenFiles = new Set<string>();
        const recovered: AIFileGenSession[] = [];
        const statuses = new Map<string, FileGenStatus>();

        for (const session of recent) {
          let meta: Record<string, unknown> = {};
          try {
            meta = JSON.parse(session.metadata_json || "{}");
          } catch {
            continue;
          }
          const fn = meta.fileName as string;
          if (!fn || seenFiles.has(fn)) continue;
          seenFiles.add(fn);

          const isActive = session.status === "running" || session.status === "pending";
          if (isActive) {
            recovered.push({ id: session.id, fileName: fn });
            statuses.set(fn, { generating: true, done: null, statusText: "Reconnecting..." });
          } else {
            // Done sessions — set fileStatuses so file list shows indicators
            const done = session.status === "error" ? "error" : "success";
            statuses.set(fn, { generating: false, done });
          }
        }

        if (cancelled) return;

        if (recovered.length > 0) {
          setSessions((prev) => (prev.length > 0 ? prev : recovered));
        }
        setFileStatuses((prev) => (prev.size > 0 ? prev : statuses));
      } catch {
        // recovery is best-effort
      }
    }

    recover();
    return () => {
      cancelled = true;
    };
  }, [repo.id]);

  return {
    sessions,
    expandedId,
    fileStatuses,
    anyGenerating,
    generateFiles,
    dismissSession,
    dismissAll,
    toggleExpand,
    updateFileStatus,
  };
}

// --- Component ---

interface AIFileGenTerminalProps {
  sessionId: string;
  fileName: string;
  minimized: boolean;
  onToggleMinimize: () => void;
  onDismiss: () => void;
  onStatusChange: (status: FileGenStatus) => void;
}

export function AIFileGenTerminal({
  sessionId,
  fileName,
  minimized,
  onToggleMinimize,
  onDismiss,
  onStatusChange,
}: AIFileGenTerminalProps) {
  const router = useRouter();

  const session = useSessionStream({
    sessionId,
    onEvent: (event) => {
      const statusText = event.phase || event.message || undefined;
      onStatusChange({ generating: true, done: null, statusText });
    },
    onComplete: (event) => {
      if (event.type === "done") {
        const skipped = !!(event.data as Record<string, unknown> | undefined)?.skipped;
        onStatusChange({
          generating: false,
          done: skipped ? "skipped" : "success",
          statusText: skipped ? "Skipped — updated recently" : undefined,
        });
        if (!skipped) router.refresh();
      } else if (event.type === "error") {
        onStatusChange({ generating: false, done: "error", statusText: event.message ?? "Failed" });
      } else if (event.type === "cancelled") {
        onStatusChange({ generating: false, done: "error", statusText: "Cancelled" });
      }
    },
  });

  const isRunning = session.status === "streaming" || session.status === "connecting";

  // Report generating status on mount and when isRunning changes
  // biome-ignore lint/correctness/useExhaustiveDependencies: onStatusChange is stable
  useEffect(() => {
    if (isRunning) {
      onStatusChange({ generating: true, done: null, statusText: session.phase ?? "Generating..." });
    }
  }, [isRunning]);

  return (
    <SessionTerminal
      logs={session.logs}
      progress={session.progress}
      phase={session.phase}
      status={session.status}
      error={session.error}
      elapsed={session.elapsed}
      title={`Generating — ${fileName}`}
      onCancel={session.cancel}
      onDismiss={onDismiss}
      variant="compact"
      minimized={minimized}
      onToggleMinimize={onToggleMinimize}
    />
  );
}
