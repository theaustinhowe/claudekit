"use client";

import type { JobSource } from "@claudekit/gogo-shared";
import { Button } from "@claudekit/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@claudekit/ui/components/card";
import { Textarea } from "@claudekit/ui/components/textarea";
import { CheckCircle, ClipboardCheck, ExternalLink, MessageSquare, XCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useApprovePlan } from "@/hooks/use-jobs";
import { formatLastChecked } from "@/lib/utils";

interface PlanApprovalPanelProps {
  jobId: string;
  planContent: string | null;
  issueUrl: string;
  source: JobSource;
  lastCheckedAt?: Date | string | null;
}

export function PlanApprovalPanel({ jobId, planContent, issueUrl, source, lastCheckedAt }: PlanApprovalPanelProps) {
  const { mutate: submitApproval, isPending } = useApprovePlan();
  const [feedback, setFeedback] = useState("");
  const [showFeedback, setShowFeedback] = useState(false);

  const isGitHubJob = source === "github_issue" && issueUrl;

  const handleApprove = () => {
    submitApproval(
      { jobId, approved: true },
      {
        onSuccess: (response) => {
          if (response.data) {
            toast.success("Plan Approved", {
              description: "The agent will now implement the approved plan.",
            });
          } else {
            toast.error("Failed to approve", {
              description: response.error || "Unknown error",
            });
          }
        },
        onError: (err) => {
          toast.error("Failed to approve", { description: err.message });
        },
      },
    );
  };

  const handleReject = () => {
    if (!feedback.trim()) {
      toast.error("Feedback required", {
        description: "Please provide feedback so the agent can revise the plan.",
      });
      return;
    }

    submitApproval(
      { jobId, approved: false, message: feedback.trim() },
      {
        onSuccess: (response) => {
          if (response.data) {
            toast.success("Changes Requested", {
              description: "The agent will revise the plan based on your feedback.",
            });
            setFeedback("");
            setShowFeedback(false);
          } else {
            toast.error("Failed to request changes", {
              description: response.error || "Unknown error",
            });
          }
        },
        onError: (err) => {
          toast.error("Failed to request changes", {
            description: err.message,
          });
        },
      },
    );
  };

  return (
    <Card className="border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base text-amber-700 dark:text-amber-400">
          <ClipboardCheck className="h-5 w-5" />
          Plan Awaiting Approval
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Plan content */}
        {planContent && (
          <div className="bg-white dark:bg-gray-900 rounded-md p-4 text-sm border max-h-80 overflow-y-auto">
            <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap">{planContent}</div>
          </div>
        )}

        {/* Action buttons */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Button
              variant="default"
              size="sm"
              onClick={handleApprove}
              disabled={isPending}
              className="flex-1 bg-green-600 hover:bg-green-700"
            >
              <CheckCircle className="h-4 w-4 mr-2" />
              {isPending ? "Processing..." : "Approve Plan"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowFeedback(!showFeedback)}
              disabled={isPending}
              className="flex-1"
            >
              <MessageSquare className="h-4 w-4 mr-2" />
              Request Changes
            </Button>
          </div>

          {showFeedback && (
            <div className="space-y-2">
              <Textarea
                placeholder="Describe what changes you'd like the agent to make to the plan..."
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                className="min-h-[80px] bg-white dark:bg-gray-900"
                disabled={isPending}
              />
              <Button
                variant="destructive"
                size="sm"
                onClick={handleReject}
                disabled={isPending || !feedback.trim()}
                className="w-full"
              >
                <XCircle className="h-4 w-4 mr-2" />
                {isPending ? "Sending..." : "Send Feedback & Revise"}
              </Button>
            </div>
          )}

          {/* GitHub link - only for GitHub-backed jobs */}
          {isGitHubJob && (
            <a
              href={issueUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm text-primary hover:underline"
            >
              <ExternalLink className="h-4 w-4" />
              View on GitHub (can also approve/comment there)
            </a>
          )}
        </div>

        {/* Polling status footer - only for GitHub-backed jobs */}
        {isGitHubJob && (
          <div className="flex items-center justify-between text-xs text-muted-foreground pt-3 mt-4 border-t border-amber-200 dark:border-amber-900/50">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500" />
              </span>
              <span>Auto-checking for approval on GitHub</span>
            </div>
            {lastCheckedAt && <span>Last: {formatLastChecked(lastCheckedAt)}</span>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
