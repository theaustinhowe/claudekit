"use client";

import { useSessionStream } from "@claudekit/hooks";
import { cn } from "@claudekit/ui";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@claudekit/ui/components/alert-dialog";
import { Button } from "@claudekit/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@claudekit/ui/components/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@claudekit/ui/components/tooltip";
import {
  AlertCircle,
  Camera,
  CheckCircle2,
  Film,
  Loader2,
  MoreVertical,
  PanelLeftClose,
  PanelLeftOpen,
  Rocket,
  RotateCcw,
  Settings2,
  TerminalSquare,
  Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ChatPanel, type ChatPanelHandle } from "@/components/generator/chat-panel";
import { PreviewPanel } from "@/components/generator/preview-panel";
import { ProjectSettingsDialog } from "@/components/generator/project-settings-dialog";
import { ScaffoldLogDialog } from "@/components/generator/scaffold-log-dialog";
import { type ScaffoldStats, type ScaffoldStatus, ScaffoldTerminal } from "@/components/generator/scaffold-terminal";
import { UpgradeBanner } from "@/components/generator/upgrade-banner";
import { UpgradeChatView } from "@/components/generator/upgrade-chat-view";
import { UpgradeDialog } from "@/components/generator/upgrade-dialog";
import { createDesignMessage, updateGeneratorProject } from "@/lib/actions/generator-projects";
import type {
  DesignMessage,
  GeneratorProject,
  GeneratorProjectStatus,
  UpgradeTask,
  UpgradeTaskStatus,
} from "@/lib/types";

const stageConfig: Record<GeneratorProjectStatus, { label: string; color: string }> = {
  drafting: { label: "Draft", color: "bg-blue-500/10 text-blue-600" },
  scaffolding: { label: "Scaffolding", color: "bg-cyan-500/10 text-cyan-600" },
  designing: { label: "Designing", color: "bg-violet-500/10 text-violet-600" },
  upgrading: { label: "Upgrading", color: "bg-amber-500/10 text-amber-600" },
  archived: { label: "Archived", color: "bg-zinc-500/10 text-zinc-500" },
  locked: { label: "Locked", color: "bg-purple-500/10 text-purple-600" },
  exported: { label: "Exported", color: "bg-green-500/10 text-green-600" },
  error: { label: "Error", color: "bg-red-500/10 text-red-600" },
};

function StageBadge({ status }: { status: GeneratorProjectStatus }) {
  const { label, color } = stageConfig[status];
  const isActive = status === "scaffolding" || status === "designing" || status === "upgrading";
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium", color)}>
      {isActive && <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" />}
      {label}
    </span>
  );
}

interface DesignWorkspaceProps {
  project: GeneratorProject;
  initialMessages: DesignMessage[];
}

export function DesignWorkspace({ project, initialMessages }: DesignWorkspaceProps) {
  const router = useRouter();

  const [scaffolding, setScaffolding] = useState(project.status === "scaffolding");
  const [messages, setMessages] = useState<DesignMessage[]>(initialMessages);
  const [devServer, setDevServer] = useState<{
    port: number;
    status: "starting" | "ready" | "error" | "stopped";
  } | null>(null);
  const [scaffoldStatus, setScaffoldStatus] = useState<ScaffoldStatus>("idle");
  const [scaffoldElapsed, setScaffoldElapsed] = useState(0);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [autoFixEnabled, setAutoFixEnabled] = useState(false);
  const [previewTab, setPreviewTab] = useState(
    project.status === "upgrading" || project.status === "archived" ? "tasks" : "app",
  );
  const [scaffoldLogOpen, setScaffoldLogOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const initialScreenshotTaken = useRef(false);

  // Upgrade state
  const [upgradeDialogOpen, setUpgradeDialogOpen] = useState(false);
  const [projectStatus, setProjectStatus] = useState(project.status === "scaffolding" ? "designing" : project.status);
  const [upgradeTasks, setUpgradeTasks] = useState<UpgradeTask[]>([]);
  const [upgradeInitSessionId, setUpgradeInitSessionId] = useState<string | null>(null);
  const [activeUpgradeTaskTitle, setActiveUpgradeTaskTitle] = useState<string | null>(null);
  const [upgradeInitPhase, setUpgradeInitPhase] = useState<string | null>(null);

  // Queue state for upgrade mode
  const [messageQueue, setMessageQueue] = useState<string[]>([]);
  const messageQueueRef = useRef<string[]>([]);
  const [isTaskRunning, setIsTaskRunning] = useState(false);
  const [isProcessingQueue, setIsProcessingQueue] = useState(false);
  const chatPanelRef = useRef<ChatPanelHandle>(null);

  // Keep ref in sync with state
  useEffect(() => {
    messageQueueRef.current = messageQueue;
  }, [messageQueue]);

  useSessionStream({
    sessionId: upgradeInitSessionId,
    onEvent: (event) => {
      if (event.type === "progress" && event.data?.tasks) {
        setUpgradeTasks(event.data.tasks as UpgradeTask[]);
      }
      if (event.phase) {
        setUpgradeInitPhase(event.phase);
      }
    },
    onComplete: (event) => {
      if (event.type === "done" && event.data?.tasks) {
        setUpgradeTasks(event.data.tasks as UpgradeTask[]);
      } else if (event.type === "error") {
        toast.error(event.message ?? "Upgrade initialization failed");
        setProjectStatus("designing");
      }
      setUpgradeInitSessionId(null);
      setUpgradeInitPhase(null);
    },
  });

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const handleScaffoldStatusChange = useCallback((status: ScaffoldStatus, elapsed: number) => {
    setScaffoldStatus(status);
    setScaffoldElapsed(elapsed);
  }, []);

  // Resizable split pane
  const [splitRatio, setSplitRatio] = useState(0.38);
  const [chatCollapsed, setChatCollapsed] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  const handleMouseDown = useCallback(() => {
    isDragging.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const ratio = (e.clientX - rect.left) / rect.width;
      setSplitRatio(Math.max(0.25, Math.min(0.6, ratio)));
    };
    const handleMouseUp = () => {
      isDragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  const startDevServer = useCallback(async () => {
    setDevServer({ port: 0, status: "starting" });
    try {
      const res = await fetch(`/api/projects/${project.id}/dev-server`, { method: "POST" });
      if (!res.ok) {
        setDevServer({ port: 0, status: "error" });
        return;
      }
      const data = await res.json();
      setDevServer({ port: data.port, status: "ready" });
      // No port detected (non-web project) — show terminal instead of blank preview
      if (!data.port) {
        setPreviewTab("terminal");
      }
    } catch {
      setDevServer({ port: 0, status: "error" });
    }
  }, [project.id]);

  const restartDevServer = useCallback(async () => {
    // Stop existing server first
    try {
      await fetch(`/api/projects/${project.id}/dev-server`, { method: "DELETE" });
    } catch {}
    // Start fresh
    await startDevServer();
  }, [project.id, startDevServer]);

  const handleScaffoldComplete = useCallback(
    async (stats: ScaffoldStats) => {
      setScaffolding(false);
      setProjectStatus("designing");
      startDevServer();
      // Ensure DB status is updated (safety net — scaffold route also does this)
      updateGeneratorProject(project.id, { status: "designing" }).catch(() => {});

      // Build initial welcome message summarizing what was scaffolded
      const parts: string[] = [];
      if (stats.filesCreated > 0)
        parts.push(`**${stats.filesCreated}** file${stats.filesCreated !== 1 ? "s" : ""} created`);
      if (stats.filesEdited > 0)
        parts.push(`**${stats.filesEdited}** file${stats.filesEdited !== 1 ? "s" : ""} edited`);
      if (stats.commandsRun > 0)
        parts.push(`**${stats.commandsRun}** command${stats.commandsRun !== 1 ? "s" : ""} run`);

      const statsLine = parts.length > 0 ? ` ${parts.join(", ")}.` : "";
      const content = `Your project **${project.title}** has been scaffolded!${statsLine}\n\nThe dev server is starting up and you'll see a preview on the right shortly. You can now describe any changes you'd like to make.`;

      const suggestions = [
        "Refine the layout and spacing",
        "Add more pages or sections",
        "Improve the color scheme and typography",
        "Add animations and transitions",
      ];

      try {
        const msg = await createDesignMessage({
          project_id: project.id,
          role: "assistant",
          content,
          suggestions,
        });
        setMessages((prev) => [...prev, msg]);
      } catch {
        // Non-critical — chat still works without the welcome message
      }
    },
    [startDevServer, project.id, project.title],
  );

  // Capture initial screenshot once dev server is ready after scaffolding
  useEffect(() => {
    if (devServer?.status === "ready" && devServer.port > 0 && !initialScreenshotTaken.current && !scaffolding) {
      initialScreenshotTaken.current = true;
      // Check if an initial screenshot already exists (ref resets on remount)
      fetch(`/api/projects/${project.id}/screenshots`)
        .then((res) => (res.ok ? res.json() : { screenshots: [] }))
        .then(({ screenshots }) => {
          const hasInitial = screenshots.some((s: { label: string }) => s.label === "Initial scaffold");
          if (!hasInitial) {
            fetch(`/api/projects/${project.id}/screenshots`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ port: devServer.port, label: "Initial scaffold" }),
            }).catch(() => {});
          }
        })
        .catch(() => {});
    }
  }, [devServer?.status, devServer?.port, scaffolding, project.id]);

  // Start dev server if already past scaffolding
  // biome-ignore lint/correctness/useExhaustiveDependencies: only on mount
  useEffect(() => {
    if (!scaffolding && project.status !== "scaffolding") {
      startDevServer();
    }
  }, []);

  // Load auto-fix state on mount
  // biome-ignore lint/correctness/useExhaustiveDependencies: only on mount
  useEffect(() => {
    fetch(`/api/projects/${project.id}/auto-fix`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.enabled) setAutoFixEnabled(true);
      })
      .catch(() => {});
  }, []);

  // Load upgrade tasks if in upgrading state
  // biome-ignore lint/correctness/useExhaustiveDependencies: only on mount
  useEffect(() => {
    if (project.status === "upgrading" || project.status === "archived") {
      fetch(`/api/projects/${project.id}/upgrade`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data?.tasks) {
            setUpgradeTasks(data.tasks);
            setPreviewTab("tasks");
          }
        })
        .catch(() => {});
    }
  }, []);

  const handleToggleAutoFix = useCallback(
    async (enabled: boolean) => {
      setAutoFixEnabled(enabled);
      try {
        await fetch(`/api/projects/${project.id}/auto-fix`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: enabled ? "enable" : "disable",
            projectDir: project.project_path,
          }),
        });
      } catch {
        setAutoFixEnabled(!enabled); // revert on error
      }
    },
    [project.id, project.project_path],
  );

  // Stop dev server on unmount
  useEffect(() => {
    return () => {
      fetch(`/api/projects/${project.id}/dev-server`, { method: "DELETE" }).catch(() => {});
    };
  }, [project.id]);

  const isUpgrading = projectStatus === "upgrading" || projectStatus === "archived";

  const handleNewMessage = useCallback(
    (msg: DesignMessage) => {
      setMessages((prev) => [...prev, msg]);

      // Capture screenshot after each assistant response
      if (msg.role === "assistant" && devServer?.status === "ready" && devServer.port > 0) {
        fetch(`/api/projects/${project.id}/screenshots`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ port: devServer.port, label: "Design update", messageId: msg.id }),
        }).catch(() => {});
      }

      // In upgrade mode, when an assistant message arrives, check for queued messages
      if (msg.role === "assistant" && isUpgrading) {
        setIsProcessingQueue(false);
        // Re-fetch tasks in case mutations were applied
        fetch(`/api/projects/${project.id}/upgrade`)
          .then((res) => (res.ok ? res.json() : null))
          .then((data) => {
            if (data?.tasks) setUpgradeTasks(data.tasks);
          })
          .catch(() => {});
        // Check if more queued messages remain
        if (messageQueueRef.current.length > 0) {
          const [next, ...rest] = messageQueueRef.current;
          messageQueueRef.current = rest;
          setMessageQueue(rest);
          setIsProcessingQueue(true);
          // Small delay to let React update before triggering next send
          setTimeout(() => chatPanelRef.current?.sendProgrammatic(next), 100);
        }
      }
    },
    [devServer?.status, devServer?.port, project.id, isUpgrading],
  );

  const handleActiveTaskChange = useCallback((taskId: string | null, title: string | null) => {
    setActiveUpgradeTaskTitle(title);
    setIsTaskRunning(taskId !== null);
  }, []);

  const handleTaskFinished = useCallback(
    async (_taskId: string, _status: UpgradeTaskStatus) => {
      setIsTaskRunning(false);

      // Re-fetch tasks to get latest status
      try {
        const res = await fetch(`/api/projects/${project.id}/upgrade`);
        if (res.ok) {
          const data = await res.json();
          if (data.tasks) setUpgradeTasks(data.tasks);
        }
      } catch {
        // ignore
      }

      // Dequeue first message and send it as an upgrade-aware chat
      if (messageQueueRef.current.length > 0) {
        const [nextMsg, ...rest] = messageQueueRef.current;
        messageQueueRef.current = rest;
        setMessageQueue(rest);
        setIsProcessingQueue(true);
        setTimeout(() => chatPanelRef.current?.sendProgrammatic(nextMsg), 100);
      }
    },
    [project.id],
  );

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await fetch(`/api/projects/${project.id}/dev-server`, { method: "DELETE" }).catch(() => {});
      const res = await fetch(`/api/projects/${project.id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Delete failed");
      }
      toast.success("Project deleted");
      router.push("/projects");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
      setDeleting(false);
      setDeleteOpen(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Upgrade handlers
  // ---------------------------------------------------------------------------

  const handleStartUpgrade = useCallback(async () => {
    setUpgradeDialogOpen(false);
    setProjectStatus("upgrading");
    setPreviewTab("tasks");

    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "upgrade_init",
          label: `Upgrade Init: ${project.project_name}`,
          contextType: "project",
          contextId: project.id,
          contextName: project.project_name,
          metadata: {},
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Upgrade failed" }));
        toast.error(err.error || "Upgrade failed");
        setProjectStatus("designing");
        return;
      }

      const { sessionId } = await res.json();
      setUpgradeInitSessionId(sessionId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upgrade failed");
      setProjectStatus("designing");
    }
  }, [project.id, project.project_name]);

  const handleUpgradeComplete = useCallback(async () => {
    // Capture a final screenshot before stopping the server
    if (devServer?.status === "ready" && devServer.port > 0) {
      fetch(`/api/projects/${project.id}/screenshots`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ port: devServer.port, label: "Post-upgrade" }),
      }).catch(() => {});
    }

    // Persist archived status to DB
    await updateGeneratorProject(project.id, {
      status: "archived",
      exported_at: new Date().toISOString(),
    });

    // Stop the dev server
    fetch(`/api/projects/${project.id}/dev-server`, { method: "DELETE" }).catch(() => {});
    setDevServer(null);

    setProjectStatus("archived");
    toast.success("Upgrade complete! Project is now archived.");
  }, [devServer?.status, devServer?.port, project.id]);

  // Scaffolding view — full-width terminal
  if (scaffolding) {
    return (
      <div className="h-[calc(100vh-3.5rem)] flex flex-col">
        <div className="border-b px-4 py-2 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <h2 className="font-semibold text-sm">{project.title}</h2>
            <StageBadge status="scaffolding" />
          </div>
          <div className="flex items-center gap-2 text-xs">
            {scaffoldStatus === "running" && (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                <span className="text-muted-foreground">Generating... ({formatTime(scaffoldElapsed)})</span>
              </>
            )}
            {scaffoldStatus === "done" && (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                <span className="text-green-600 dark:text-green-400">Complete ({formatTime(scaffoldElapsed)})</span>
              </>
            )}
            {scaffoldStatus === "error" && (
              <>
                <AlertCircle className="w-3.5 h-3.5 text-destructive" />
                <span className="text-destructive">Failed ({formatTime(scaffoldElapsed)})</span>
              </>
            )}
          </div>
        </div>
        <div className="flex-1 p-4 overflow-hidden">
          <ScaffoldTerminal
            projectId={project.id}
            onComplete={handleScaffoldComplete}
            onCancel={() => setDeleteOpen(true)}
            onStatusChange={handleScaffoldStatusChange}
          />
        </div>

        <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Cancel scaffolding?</AlertDialogTitle>
              <AlertDialogDescription>
                This will stop scaffolding and permanently delete this project. This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleting}>Keep going</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                disabled={deleting}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deleting && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
                Cancel & Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }

  // Design / Upgrade view — split pane with chat/tasks + preview
  return (
    <div className="h-[calc(100vh-3.5rem)] flex flex-col" data-workspace-status={projectStatus}>
      {/* Toolbar */}
      <div className="border-b px-4 py-2 flex items-center justify-between shrink-0 workspace-accent">
        <div className="flex items-center gap-2.5">
          <h2 className="font-semibold text-sm">{project.title}</h2>
          <StageBadge status={projectStatus} />
        </div>
        <TooltipProvider>
          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <MoreVertical className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent>Actions</TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="end" className="p-1">
              <DropdownMenuItem
                disabled={!devServer || devServer.status !== "ready"}
                onClick={() => {
                  if (devServer?.port) {
                    fetch(`/api/projects/${project.id}/screenshots`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ port: devServer.port, label: "Manual screenshot" }),
                    })
                      .then(() => toast.success("Screenshot captured"))
                      .catch(() => toast.error("Screenshot failed"));
                  }
                }}
              >
                <Camera className="w-4 h-4" />
                Take screenshot
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setPreviewTab("history")}>
                <Film className="w-4 h-4" />
                View history
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSettingsOpen(true)}>
                <Settings2 className="w-4 h-4" />
                Project settings
              </DropdownMenuItem>
              {project.scaffold_logs && project.scaffold_logs.length > 0 && (
                <DropdownMenuItem onClick={() => setScaffoldLogOpen(true)}>
                  <TerminalSquare className="w-4 h-4" />
                  View scaffold log
                </DropdownMenuItem>
              )}
              <DropdownMenuItem disabled={!devServer || devServer.status === "starting"} onClick={restartDevServer}>
                <RotateCcw className="w-4 h-4" />
                Restart dev server
              </DropdownMenuItem>
              {projectStatus === "designing" && (
                <DropdownMenuItem
                  className="text-amber-600 focus:text-amber-600"
                  onClick={() => setUpgradeDialogOpen(true)}
                >
                  <Rocket className="w-4 h-4" />
                  Upgrade to full implementation
                </DropdownMenuItem>
              )}
              <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setDeleteOpen(true)}>
                <Trash2 className="w-4 h-4" />
                Delete project
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </TooltipProvider>
      </div>

      {/* Split Pane */}
      <div ref={containerRef} className="flex-1 flex overflow-hidden">
        {/* Left Panel (Chat or Tasks) */}
        <div
          className="overflow-hidden border-r transition-[width] duration-200"
          style={{ width: chatCollapsed ? "0px" : `${splitRatio * 100}%` }}
        >
          <div className="h-full flex flex-col">
            {isUpgrading && (
              <UpgradeBanner
                tasks={upgradeTasks}
                isInitializing={!!upgradeInitSessionId && upgradeTasks.length === 0}
                initPhase={upgradeInitPhase}
                activeTaskTitle={activeUpgradeTaskTitle}
                onViewTasks={() => setPreviewTab("tasks")}
                queuedCount={messageQueue.length}
              />
            )}
            <div className="flex-1 overflow-hidden">
              <ChatPanel
                ref={chatPanelRef}
                projectId={project.id}
                projectName={project.project_name}
                messages={messages}
                onNewMessage={handleNewMessage}
                upgradeMode={isUpgrading}
                isQueuing={isTaskRunning}
                onQueueMessage={(text) => setMessageQueue((prev) => [...prev, text])}
              />
            </div>
          </div>
        </div>

        {/* Collapse / Expand toggle + Divider */}
        <div className="flex flex-col shrink-0">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => setChatCollapsed((c) => !c)}
                  className="flex items-center justify-center h-8 w-5 hover:bg-accent/50 text-accent-foreground transition-colors border-b"
                >
                  {chatCollapsed ? (
                    <PanelLeftOpen className="w-3.5 h-3.5" />
                  ) : (
                    <PanelLeftClose className="w-3.5 h-3.5" />
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent>{chatCollapsed ? "Show panel" : "Hide panel"}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          {/* biome-ignore lint/a11y/noStaticElementInteractions: drag divider needs mouse events */}
          <div
            className="flex-1 w-5 bg-border/0 hover:bg-primary/10 cursor-col-resize transition-colors flex justify-center"
            onMouseDown={handleMouseDown}
          >
            <div className="w-px bg-border h-full" />
          </div>
        </div>

        {/* Preview Panel (Right) */}
        <div className="flex-1 overflow-hidden">
          <PreviewPanel
            projectId={project.id}
            projectPath={project.project_path}
            projectName={project.project_name}
            port={devServer?.port ?? null}
            devServerStatus={devServer?.status ?? "stopped"}
            onStartServer={startDevServer}
            autoFixEnabled={autoFixEnabled}
            onToggleAutoFix={handleToggleAutoFix}
            activeTab={previewTab}
            onTabChange={setPreviewTab}
            showTasksTab={isUpgrading}
            disableAppTab={isUpgrading || !devServer?.port}
            tasksContent={
              isUpgrading ? (
                upgradeTasks.length === 0 && upgradeInitSessionId ? (
                  <div className="flex-1 flex items-center justify-center p-8 h-full">
                    <div className="text-center space-y-3">
                      <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" />
                      <p className="text-sm text-muted-foreground">
                        {upgradeInitPhase || "Analyzing project and generating tasks..."}
                      </p>
                    </div>
                  </div>
                ) : (
                  <UpgradeChatView
                    projectId={project.id}
                    tasks={upgradeTasks}
                    onTasksUpdate={setUpgradeTasks}
                    onComplete={handleUpgradeComplete}
                    onActiveTaskChange={handleActiveTaskChange}
                    onTaskFinished={handleTaskFinished}
                    canStartTask={!isProcessingQueue}
                  />
                )
              ) : undefined
            }
          />
        </div>
      </div>

      {/* Upgrade Dialog */}
      <UpgradeDialog
        project={project}
        open={upgradeDialogOpen}
        onOpenChange={setUpgradeDialogOpen}
        onConfirm={handleStartUpgrade}
      />

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {project.title}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this project and its files. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {project.scaffold_logs && project.scaffold_logs.length > 0 && (
        <ScaffoldLogDialog open={scaffoldLogOpen} onOpenChange={setScaffoldLogOpen} logs={project.scaffold_logs} />
      )}

      <ProjectSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} project={project} />
    </div>
  );
}
