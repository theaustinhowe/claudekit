"use client";

import { Button } from "@devkit/ui/components/button";
import { Progress } from "@devkit/ui/components/progress";
import { CheckCircle2, Loader2, Zap } from "lucide-react";
import type { UpgradeTask } from "@/lib/types";

interface UpgradeBannerProps {
  tasks: UpgradeTask[];
  isInitializing: boolean;
  initPhase: string | null;
  activeTaskTitle: string | null;
  onViewTasks: () => void;
  queuedCount?: number;
}

export function UpgradeBanner({
  tasks,
  isInitializing,
  initPhase,
  activeTaskTitle,
  onViewTasks,
  queuedCount = 0,
}: UpgradeBannerProps) {
  const completed = tasks.filter((t) => t.status === "completed").length;
  const total = tasks.length;
  const progress = total > 0 ? Math.round((completed / total) * 100) : 0;
  const allDone = total > 0 && completed === total;

  return (
    <div className="border-b bg-amber-500/5 px-3 py-2 shrink-0">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0 text-xs">
          {allDone ? (
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-green-500" />
          ) : (
            <Zap className="h-3.5 w-3.5 shrink-0 text-amber-500" />
          )}
          <span className="truncate text-muted-foreground">
            {isInitializing && (
              <span className="flex items-center gap-1.5">
                <Loader2 className="h-3 w-3 animate-spin" />
                {initPhase || "Analyzing project..."}
              </span>
            )}
            {!isInitializing && activeTaskTitle && (
              <span className="flex items-center gap-1.5">
                <Loader2 className="h-3 w-3 animate-spin" />
                Running: {activeTaskTitle}
              </span>
            )}
            {!isInitializing && !activeTaskTitle && !allDone && total > 0 && (
              <span>
                Upgrade: {completed}/{total} completed
              </span>
            )}
            {!isInitializing && allDone && <span className="text-green-600 dark:text-green-400">Upgrade complete</span>}
            {!isInitializing && total === 0 && !activeTaskTitle && <span>Upgrade in progress</span>}
          </span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {queuedCount > 0 && (
            <span className="inline-flex items-center rounded-full bg-blue-500/10 text-blue-600 px-1.5 py-0.5 text-[10px] font-medium">
              {queuedCount} queued
            </span>
          )}
          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={onViewTasks}>
            View Tasks &rsaquo;
          </Button>
        </div>
      </div>
      {total > 0 && <Progress value={progress} className="h-1 mt-1.5" />}
    </div>
  );
}
