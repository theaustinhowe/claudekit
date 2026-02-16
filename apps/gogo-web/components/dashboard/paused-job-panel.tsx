"use client";

import type { Job } from "@devkit/gogo-shared";
import { PauseCircle, Play, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@devkit/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@devkit/ui/components/card";
import { useResumeAgent } from "@/hooks/use-jobs";
import { InjectModal } from "./inject-modal";

interface PausedJobPanelProps {
  job: Job;
  onActionComplete?: () => void;
}

/**
 * Analyze pause reason to determine recommended action
 */
function analyzePauseReason(reason: string | null): {
  type: "orchestrator" | "user" | "error" | "unknown";
  recommendation: "resume" | "inject";
  message: string;
} {
  if (!reason) {
    return {
      type: "unknown",
      recommendation: "resume",
      message: "Job was paused. Resume to continue.",
    };
  }

  const lowerReason = reason.toLowerCase();

  if (lowerReason.includes("orchestrator restart")) {
    return {
      type: "orchestrator",
      recommendation: "resume",
      message: "The orchestrator was restarted. Resume to continue from where the agent left off.",
    };
  }

  if (lowerReason.includes("user") || lowerReason.includes("manual") || lowerReason.includes("paused by")) {
    return {
      type: "user",
      recommendation: "resume",
      message: "Job was paused manually. Resume when ready to continue.",
    };
  }

  if (lowerReason.includes("error") || lowerReason.includes("failed") || lowerReason.includes("exception")) {
    return {
      type: "error",
      recommendation: "inject",
      message: "Job paused due to an error. Consider injecting guidance before resuming.",
    };
  }

  return {
    type: "unknown",
    recommendation: "resume",
    message: "Job is paused. Resume to continue.",
  };
}

export function PausedJobPanel({ job, onActionComplete }: PausedJobPanelProps) {
  const { mutate: resumeAgent, isPending } = useResumeAgent();

  const analysis = analyzePauseReason(job.pauseReason);

  const handleResume = () => {
    resumeAgent(
      { jobId: job.id },
      {
        onSuccess: (response) => {
          if (response.success) {
            toast.success("Job Resumed", {
              description: "The agent will continue working.",
            });
            onActionComplete?.();
          } else {
            toast.error("Failed to resume", {
              description: response.error || "Unknown error",
            });
          }
        },
        onError: (err) => {
          toast.error("Failed to resume", { description: err.message });
        },
      },
    );
  };

  // Determine which button should be primary based on analysis
  const isResumePrimary = analysis.recommendation === "resume";

  return (
    <Card className="border-yellow-200 dark:border-yellow-900 bg-yellow-50 dark:bg-yellow-950/30">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base text-yellow-700 dark:text-yellow-400">
          <PauseCircle className="h-5 w-5" />
          Job Paused
          {analysis.type === "orchestrator" && (
            <span className="text-sm font-normal ml-1 flex items-center gap-1">
              <RefreshCw className="h-3 w-3" />
              Orchestrator restarted
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Pause reason if not orchestrator (already shown in header) */}
        {job.pauseReason && analysis.type !== "orchestrator" && (
          <div className="bg-white dark:bg-gray-900 rounded-md p-3 text-sm border">{job.pauseReason}</div>
        )}

        {/* Recommendation message */}
        <p className="text-sm text-muted-foreground">{analysis.message}</p>

        {/* Action buttons - primary action is prominent */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant={isResumePrimary ? "default" : "outline"}
            size="sm"
            onClick={handleResume}
            disabled={isPending}
            className={isResumePrimary ? "flex-1" : ""}
          >
            <Play className={`h-4 w-4 mr-2 ${isPending ? "animate-pulse" : ""}`} />
            {isPending ? "Resuming..." : "Resume"}
          </Button>

          <InjectModal
            jobId={job.id}
            disabled={isPending}
            variant={analysis.recommendation === "inject" ? "prominent" : "default"}
          />
        </div>

        {/* What happens next */}
        <div className="text-xs text-muted-foreground bg-yellow-50/50 dark:bg-yellow-950/20 rounded-md p-3 border border-yellow-100 dark:border-yellow-900/50">
          <p className="font-medium text-yellow-700 dark:text-yellow-400 mb-1">What happens next:</p>
          <ul className="list-disc list-inside space-y-0.5">
            <li>
              <strong>Resume</strong> continues from the agent's last checkpoint
            </li>
            <li>
              <strong>Inject</strong> lets you add guidance before resuming
            </li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
