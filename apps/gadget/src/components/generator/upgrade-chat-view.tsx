"use client";

import type { SessionStreamEvent } from "@devkit/hooks";
import { useSessionStream } from "@devkit/hooks";
import { Button } from "@devkit/ui/components/button";
import { Progress } from "@devkit/ui/components/progress";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  Loader2,
  Play,
  RotateCcw,
  Square,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { MarkdownRenderer } from "@/components/code/markdown-renderer";
import type { StreamEntry } from "@/components/generator/streaming-display";
import { parseStreamLog, StreamingDisplay } from "@/components/generator/streaming-display";
import type { UpgradeTask, UpgradeTaskStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

interface UpgradeChatViewProps {
  projectId: string;
  projectTitle?: string;
  tasks: UpgradeTask[];
  onTasksUpdate: (tasks: UpgradeTask[]) => void;
  onComplete: () => void;
  onActiveTaskChange?: (taskId: string | null, taskTitle: string | null) => void;
  onTaskFinished?: (taskId: string, status: UpgradeTaskStatus) => void;
  canStartTask?: boolean;
}

export function UpgradeChatView({
  projectId,
  projectTitle,
  tasks,
  onTasksUpdate,
  onComplete,
  onActiveTaskChange,
  onTaskFinished,
  canStartTask = true,
}: UpgradeChatViewProps) {
  const [taskEntries, setTaskEntries] = useState<Record<string, StreamEntry[]>>({});
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [executionStarted, setExecutionStarted] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [statusMap, setStatusMap] = useState<Record<string, UpgradeTaskStatus>>({});
  const statusRef = useRef<Record<string, UpgradeTaskStatus>>({});
  const tasksRef = useRef(tasks);
  const scrollRef = useRef<HTMLDivElement>(null);
  const taskElementsRef = useRef<Record<string, HTMLDivElement | null>>({});
  const taskStartTimesRef = useRef<Record<string, number>>({});
  const [taskDurations, setTaskDurations] = useState<Record<string, number>>({});
  const [autoAdvancePending, setAutoAdvancePending] = useState(false);
  const lastTaskStatusRef = useRef<UpgradeTaskStatus | null>(null);
  const [expandedTasks, setExpandedTasks] = useState<Record<string, boolean>>({});

  // Keep refs in sync
  tasksRef.current = tasks;
  useEffect(() => {
    if (tasks.length > 0 && Object.keys(statusRef.current).length === 0) {
      const initial: Record<string, UpgradeTaskStatus> = {};
      for (const t of tasks) {
        initial[t.id] = t.status;
      }
      statusRef.current = initial;
      setStatusMap(initial);
    }
  }, [tasks]);

  // Sync statusMap when tasks prop changes externally (e.g. after mutation refetch)
  useEffect(() => {
    if (tasks.length > 0) {
      const updated: Record<string, UpgradeTaskStatus> = {};
      for (const t of tasks) {
        updated[t.id] = t.status;
      }
      statusRef.current = updated;
      setStatusMap(updated);
    }
  }, [tasks]);

  const completed = Object.values(statusMap).filter((s) => s === "completed").length;
  const failed = Object.values(statusMap).filter((s) => s === "failed").length;
  const total = tasks.length;
  const progress = total > 0 ? Math.round((completed / total) * 100) : 0;
  const allDone = total > 0 && completed === total;

  // Find the next runnable task (failed first, then pending)
  const nextFailedIndex = tasks.findIndex((t) => (statusMap[t.id] || t.status) === "failed");
  const nextPendingIndex = tasks.findIndex((t) => (statusMap[t.id] || t.status) === "pending");
  const nextRunnableIndex = nextFailedIndex >= 0 ? nextFailedIndex : nextPendingIndex;
  const nextRunnableTaskId = nextRunnableIndex >= 0 ? tasks[nextRunnableIndex].id : null;
  const hasRunnable = nextRunnableIndex >= 0;

  const formatDuration = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return s > 0 ? `${m}m ${s}s` : `${m}m`;
  };

  const isNearBottomRef = useRef(true);

  const scrollToTask = useCallback((taskId: string) => {
    requestAnimationFrame(() => {
      const el = taskElementsRef.current[taskId];
      if (el && scrollRef.current) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  }, []);

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      if (scrollRef.current && isNearBottomRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    });
  }, []);

  const updateTaskStatus = useCallback(
    (taskId: string, status: UpgradeTaskStatus) => {
      statusRef.current = { ...statusRef.current, [taskId]: status };
      setStatusMap({ ...statusRef.current });
      onTasksUpdate(tasksRef.current.map((t) => (t.id === taskId ? { ...t, status } : t)));
    },
    [onTasksUpdate],
  );

  const handleEvent = useCallback(
    (event: SessionStreamEvent) => {
      // Track per-task status from event.data
      const taskId = event.data?.taskId as string | undefined;
      const taskStatus = event.data?.taskStatus as UpgradeTaskStatus | undefined;

      if (taskId && taskStatus) {
        if (taskStatus === "in_progress") {
          setActiveTaskId(taskId);
          setExpandedTasks((prev) => ({ ...prev, [taskId]: true }));
          taskStartTimesRef.current[taskId] = Date.now();
          const taskTitle = tasksRef.current.find((t) => t.id === taskId)?.title ?? null;
          onActiveTaskChange?.(taskId, taskTitle);
        }
        updateTaskStatus(taskId, taskStatus);
        if (taskStatus === "completed" || taskStatus === "failed") {
          setActiveTaskId(null);
          onActiveTaskChange?.(null, null);
          lastTaskStatusRef.current = taskStatus;
          setExpandedTasks((prev) => ({ ...prev, [taskId]: false }));
          const startTime = taskStartTimesRef.current[taskId];
          if (startTime) {
            setTaskDurations((prev) => ({ ...prev, [taskId]: Math.floor((Date.now() - startTime) / 1000) }));
          }
          // Notify parent about task completion
          onTaskFinished?.(taskId, taskStatus);
        }
      }

      // Collect log entries per task
      if (event.log) {
        const logTaskId = taskId || activeTaskId;
        if (logTaskId) {
          const newEntries = parseStreamLog(event.log, event.logType ?? "status");
          if (newEntries.length > 0) {
            setTaskEntries((prev) => ({
              ...prev,
              [logTaskId]: [...(prev[logTaskId] || []), ...newEntries],
            }));
          }
        }
      }
    },
    [activeTaskId, updateTaskStatus, onActiveTaskChange, onTaskFinished],
  );

  const handleComplete = useCallback(
    (event: SessionStreamEvent) => {
      setActiveTaskId(null);
      onActiveTaskChange?.(null, null);
      if (event.type === "cancelled") {
        toast.info("Task cancelled");
      } else if (lastTaskStatusRef.current === "completed") {
        // Queue auto-advance to next pending task (effect will check conditions)
        setAutoAdvancePending(true);
      }
      lastTaskStatusRef.current = null;
    },
    [onActiveTaskChange],
  );

  const session = useSessionStream({
    sessionId,
    autoConnect: true,
    onEvent: handleEvent,
    onComplete: handleComplete,
  });

  const startExecution = useCallback(
    async (singleTaskId?: string) => {
      setExecutionStarted(true);

      try {
        const res = await fetch("/api/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "upgrade",
            label: `Upgrade: ${projectTitle || projectId}`,
            contextType: "project",
            contextId: projectId,
            contextName: projectTitle || projectId,
            metadata: { taskId: singleTaskId },
          }),
        });

        if (!res.ok) {
          throw new Error(`Failed to create session: ${res.status}`);
        }

        const data = await res.json();
        setSessionId(data.sessionId);
      } catch {
        // Session creation failed
      }
    },
    [projectId, projectTitle],
  );

  const startSingleTask = useCallback(
    (taskId: string) => {
      session.disconnect();
      setSessionId(null);
      startExecution(taskId);
    },
    [session, startExecution],
  );

  const retryTask = useCallback(
    (task: UpgradeTask) => {
      // Append retry separator instead of clearing entries
      setTaskEntries((prev) => ({
        ...prev,
        [task.id]: [
          ...(prev[task.id] || []),
          { id: Date.now(), kind: "status" as const, rawText: "--- Retry ---", statusText: "--- Retry ---" },
        ],
      }));
      updateTaskStatus(task.id, "pending");

      // Disconnect old session, start new one for this task
      session.disconnect();
      setSessionId(null);
      startExecution(task.id);
    },
    [session, startExecution, updateTaskStatus],
  );

  // Reconnect to an existing running session on page reload
  const reconnectRef = useRef(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: only trigger when tasks first appear
  useEffect(() => {
    if (reconnectRef.current) return;
    if (tasks.length === 0 || executionStarted || activeTaskId) return;

    const hasInProgress = tasks.some((t) => t.status === "in_progress");

    if (hasInProgress) {
      reconnectRef.current = true;
      setExecutionStarted(true);
      fetch(`/api/sessions?status=running&contextType=project&contextId=${projectId}&type=upgrade&limit=1`)
        .then((res) => (res.ok ? res.json() : []))
        .then((sessions) => {
          if (Array.isArray(sessions) && sessions.length > 0) {
            setSessionId(sessions[0].id);
          }
        })
        .catch(() => {});
    }
  }, [tasks.length]);

  // Auto-advance to next pending task after a successful completion
  // Waits for canStartTask (no queued messages being processed) and no failed tasks
  // Note: no cleanup — setAutoAdvancePending(false) triggers a re-render which would
  // cancel the timeout if we returned a cleanup function
  // biome-ignore lint/correctness/useExhaustiveDependencies: only fire on condition changes
  useEffect(() => {
    if (autoAdvancePending && !activeTaskId && canStartTask && nextPendingIndex >= 0 && failed === 0) {
      setAutoAdvancePending(false);
      const nextId = tasks[nextPendingIndex].id;
      setTimeout(() => startSingleTask(nextId), 300);
    }
  }, [autoAdvancePending, activeTaskId, canStartTask, nextPendingIndex, failed]);

  // Track scroll position to decide whether to auto-scroll
  const handleScroll = useCallback(() => {
    if (scrollRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
      isNearBottomRef.current = scrollHeight - scrollTop - clientHeight < 100;
    }
  }, []);

  // Auto-scroll when entries change (only if user is near bottom)
  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll on entry changes
  useEffect(() => {
    scrollToBottom();
  }, [taskEntries]);

  // Scroll active task into view when it starts
  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll on task transition
  useEffect(() => {
    if (activeTaskId) {
      scrollToTask(activeTaskId);
    }
  }, [activeTaskId]);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Progress header */}
      <div className="px-4 py-3 border-b space-y-2 shrink-0">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">
            Upgrade Progress: {completed}/{total}
            {failed > 0 && <span className="text-destructive ml-1">({failed} failed)</span>}
          </span>
          {session.elapsed > 0 && (
            <span className="text-[10px] text-muted-foreground tabular-nums ml-2">
              {formatDuration(session.elapsed)}
            </span>
          )}
          {!activeTaskId && hasRunnable && canStartTask && nextRunnableTaskId && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() => startSingleTask(nextRunnableTaskId)}
            >
              <Play className="h-3 w-3 mr-1" />
              {nextFailedIndex >= 0 ? "Retry Failed Task" : "Run Next Task"}
            </Button>
          )}
          {activeTaskId && (
            <span className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Running...
              <Button size="sm" variant="ghost" className="h-6 px-2 ml-1 text-xs" onClick={() => session.cancel()}>
                <Square className="h-3 w-3 mr-1" />
                Cancel
              </Button>
            </span>
          )}
          {!activeTaskId && allDone && (
            <Button size="sm" variant="default" onClick={onComplete}>
              Complete Upgrade
            </Button>
          )}
          {session.status === "reconnecting" && (
            <span className="text-xs text-amber-500 flex items-center gap-1.5">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Reconnecting...
            </span>
          )}
        </div>
        <Progress value={progress} className="h-1.5" />
      </div>

      {/* Chat-style task list */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto" onScroll={handleScroll}>
        {tasks.map((task, idx) => {
          const entries = taskEntries[task.id] || [];
          const status = statusMap[task.id] || task.status;
          const isActive = task.id === activeTaskId;
          const isCompleted = status === "completed";
          const isFailed = status === "failed";
          const isPending = status === "pending";

          const hasDetails = entries.length > 0 || !!task.claude_output || isFailed;
          const isExpanded = expandedTasks[task.id] ?? isActive;
          const canToggle = hasDetails && !isPending;

          return (
            <div
              key={task.id}
              ref={(el) => {
                taskElementsRef.current[task.id] = el;
              }}
              className={cn("border-b", isActive && "bg-primary/[0.03]")}
            >
              {/* Task header */}
              {/* biome-ignore lint/a11y/noStaticElementInteractions: role/tabIndex/onKeyDown are set when canToggle */}
              <div
                className={cn("px-4 py-3 flex items-start gap-3", canToggle && "cursor-pointer hover:bg-muted/30")}
                role={canToggle ? "button" : undefined}
                tabIndex={canToggle ? 0 : undefined}
                onClick={
                  canToggle ? () => setExpandedTasks((prev) => ({ ...prev, [task.id]: !isExpanded })) : undefined
                }
                onKeyDown={
                  canToggle
                    ? (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setExpandedTasks((prev) => ({ ...prev, [task.id]: !isExpanded }));
                        }
                      }
                    : undefined
                }
              >
                <div className="mt-0.5 shrink-0">
                  {isActive && <Loader2 className="h-4 w-4 text-primary animate-spin" />}
                  {isCompleted && <CheckCircle2 className="h-4 w-4 text-green-500" />}
                  {isFailed && <AlertCircle className="h-4 w-4 text-destructive" />}
                  {isPending && <Circle className="h-4 w-4 text-muted-foreground" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className={cn("text-sm font-medium", isPending && "text-muted-foreground")}>
                      Task {idx + 1}/{total}: {task.title}
                    </span>
                    {(isCompleted || isFailed) && taskDurations[task.id] !== undefined && (
                      <span className="text-[10px] text-muted-foreground tabular-nums">
                        {formatDuration(taskDurations[task.id])}
                      </span>
                    )}
                    {isActive && (
                      <span className="text-[10px] text-muted-foreground tabular-nums">
                        {formatDuration(session.elapsed)}
                      </span>
                    )}
                  </div>
                  {task.description && (
                    <p
                      className={cn(
                        "text-xs mt-0.5 line-clamp-1",
                        isPending ? "text-muted-foreground" : "text-muted-foreground/70",
                      )}
                    >
                      {task.description}
                    </p>
                  )}
                </div>
                {isFailed && !activeTaskId && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="shrink-0 h-7 text-xs"
                    onClick={(e) => {
                      e.stopPropagation();
                      retryTask(task);
                    }}
                  >
                    <RotateCcw className="h-3 w-3 mr-1" />
                    Retry
                  </Button>
                )}
                {canToggle && (
                  <div className="mt-0.5 shrink-0 text-muted-foreground">
                    {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                  </div>
                )}
              </div>

              {/* Streaming display for active/completed/failed tasks (collapsible) */}
              {isExpanded && entries.length > 0 && (
                <div className="px-4 pb-3 pl-11">
                  <StreamingDisplay entries={entries} variant="chat" live={isActive} />
                </div>
              )}

              {/* Stored output fallback when no streaming entries (e.g. after page refresh) */}
              {isExpanded && entries.length === 0 && (isCompleted || isFailed) && task.claude_output && (
                <div
                  className={cn(
                    "px-4 pb-3 pl-11 max-h-[300px] overflow-y-auto text-xs [&>div]:text-xs",
                    isFailed && "text-destructive",
                  )}
                >
                  <MarkdownRenderer content={task.claude_output.slice(0, 5000)} />
                </div>
              )}

              {/* Error fallback when no output at all */}
              {isExpanded && isFailed && entries.length === 0 && !task.claude_output && (
                <div className="px-4 pb-3 pl-11">
                  <p className="text-xs text-destructive">Task failed. Click retry to try again.</p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
