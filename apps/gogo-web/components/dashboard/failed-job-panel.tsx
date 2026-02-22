"use client";

import type { Job } from "@claudekit/gogo-shared";
import { Button } from "@claudekit/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@claudekit/ui/components/card";
import { Collapsible, CollapsibleTrigger } from "@claudekit/ui/components/collapsible";
import { AlertTriangle, ChevronDown, ChevronRight, RefreshCw, XCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useJobAction } from "@/hooks/use-jobs";

interface FailedJobPanelProps {
  job: Job;
  onActionComplete?: () => void;
}

/**
 * Truncate text to a maximum length, adding ellipsis if needed
 */
function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).trim()}...`;
}

/**
 * Extract a user-friendly error summary from the failure reason
 */
function getErrorSummary(failureReason: string | null): { summary: string; isTransient: boolean } | null {
  if (!failureReason) return null;

  // Transient error patterns - suggest retry
  const transientPatterns = [
    { pattern: /timeout/i, summary: "Operation timed out" },
    { pattern: /network/i, summary: "Network error" },
    { pattern: /rate limit/i, summary: "Rate limit exceeded" },
    { pattern: /connection refused/i, summary: "Connection refused" },
    { pattern: /econnreset/i, summary: "Connection reset" },
    { pattern: /orchestrator restart/i, summary: "Orchestrator restarted" },
    { pattern: /process.*exit/i, summary: "Process exited unexpectedly" },
  ];

  for (const { pattern, summary } of transientPatterns) {
    if (pattern.test(failureReason)) {
      return { summary, isTransient: true };
    }
  }

  // Non-transient patterns
  const fundamentalPatterns = [
    { pattern: /syntax error/i, summary: "Syntax error in code" },
    { pattern: /type error/i, summary: "Type error" },
    { pattern: /cannot find module/i, summary: "Missing dependency" },
    { pattern: /test.*fail/i, summary: "Tests failed" },
    { pattern: /build.*fail/i, summary: "Build failed" },
    { pattern: /permission denied/i, summary: "Permission denied" },
    { pattern: /not found/i, summary: "Resource not found" },
  ];

  for (const { pattern, summary } of fundamentalPatterns) {
    if (pattern.test(failureReason)) {
      return { summary, isTransient: false };
    }
  }

  return null;
}

export function FailedJobPanel({ job, onActionComplete }: FailedJobPanelProps) {
  const { mutate: performAction, isPending } = useJobAction();
  const [showFullReason, setShowFullReason] = useState(false);

  const errorInfo = getErrorSummary(job.failureReason);
  const hasFailureReason = Boolean(job.failureReason);
  const truncatedReason = job.failureReason ? truncateText(job.failureReason, 200) : null;

  const handleRetry = () => {
    performAction(
      { jobId: job.id, action: { type: "retry" } },
      {
        onSuccess: () => {
          toast.success("Job Requeued", {
            description: "The job will restart from the beginning.",
          });
          onActionComplete?.();
        },
        onError: (err) => {
          toast.error("Failed to retry", { description: err.message });
        },
      },
    );
  };

  return (
    <Card className="border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base text-red-700 dark:text-red-400">
          <XCircle className="h-5 w-5" />
          Job Failed
          {errorInfo && <span className="text-sm font-normal ml-1">— {errorInfo.summary}</span>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Failure reason display */}
        {hasFailureReason && (
          <div className="bg-white dark:bg-gray-900 rounded-md border border-red-200 dark:border-red-900/50">
            <Collapsible open={showFullReason} onOpenChange={setShowFullReason}>
              <div className="p-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-red-800 dark:text-red-200 font-mono whitespace-pre-wrap break-words">
                      {showFullReason ? job.failureReason : truncatedReason}
                    </p>
                  </div>
                </div>
              </div>
              {job.failureReason && job.failureReason.length > 200 && (
                <CollapsibleTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 rounded-t-none border-t border-red-200 dark:border-red-900/50"
                  >
                    {showFullReason ? (
                      <>
                        <ChevronDown className="h-4 w-4 mr-1" />
                        Show less
                      </>
                    ) : (
                      <>
                        <ChevronRight className="h-4 w-4 mr-1" />
                        Show full error
                      </>
                    )}
                  </Button>
                </CollapsibleTrigger>
              )}
            </Collapsible>
          </div>
        )}

        {/* Action guidance */}
        <div className="text-sm text-muted-foreground">
          {errorInfo?.isTransient ? (
            <p>
              This looks like a <strong>transient error</strong>. Try <strong>Retry</strong> to restart the job.
            </p>
          ) : (
            <p>
              Use <strong>Retry</strong> to restart the job from the beginning.
            </p>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          <Button variant="default" size="sm" onClick={handleRetry} disabled={isPending} className="flex-1">
            <RefreshCw className={`h-4 w-4 mr-2 ${isPending ? "animate-spin" : ""}`} />
            Retry Job
          </Button>
        </div>

        {/* What happens next */}
        <div className="text-xs text-muted-foreground bg-red-50/50 dark:bg-red-950/20 rounded-md p-3 border border-red-100 dark:border-red-900/50">
          <p className="font-medium text-red-700 dark:text-red-400 mb-1">What happens next:</p>
          <ul className="list-disc list-inside space-y-0.5">
            <li>
              <strong>Retry</strong> re-queues the job from scratch with a fresh agent session
            </li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
