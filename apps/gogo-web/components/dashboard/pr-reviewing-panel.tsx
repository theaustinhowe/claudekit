"use client";

import type { Job } from "@claudekit/gogo-shared";
import { Button } from "@claudekit/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@claudekit/ui/components/card";
import { CheckCircle2, ExternalLink, Eye, GitMerge, MessageSquare } from "lucide-react";

interface PrReviewingPanelProps {
  job: Job;
}

export function PrReviewingPanel({ job }: PrReviewingPanelProps) {
  return (
    <Card className="border-cyan-200 dark:border-cyan-900 bg-cyan-50 dark:bg-cyan-950/30">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base text-cyan-700 dark:text-cyan-400">
          <Eye className="h-5 w-5" />
          Monitoring for Reviews
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-start gap-3">
          <MessageSquare className="h-5 w-5 text-cyan-600 dark:text-cyan-400 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground">
              {job.prNumber ? `PR #${job.prNumber}` : "Pull Request"} is open and being monitored
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              The agent is watching for review comments and will respond or make fixes automatically.
            </p>
          </div>
        </div>

        {/* Status indicator */}
        <div className="flex items-center gap-3 p-3 rounded-lg bg-cyan-100 dark:bg-cyan-900/30">
          <div className="relative">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-75" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-cyan-500" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-cyan-700 dark:text-cyan-300">Listening for PR activity...</p>
            <p className="text-xs text-cyan-600 dark:text-cyan-400">Checks for new comments every 30 seconds</p>
          </div>
        </div>

        {/* What happens */}
        <div className="space-y-2">
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Agent will respond to:</h4>
          <ul className="text-sm space-y-1.5 text-muted-foreground">
            <li className="flex items-center gap-2">
              <CheckCircle2 className="h-3.5 w-3.5 text-cyan-500 shrink-0" />
              Review comments requesting changes
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="h-3.5 w-3.5 text-cyan-500 shrink-0" />
              Questions about implementation
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="h-3.5 w-3.5 text-cyan-500 shrink-0" />
              Requested code improvements
            </li>
          </ul>
        </div>

        {/* Completion info */}
        <div className="text-xs text-muted-foreground bg-cyan-50/50 dark:bg-cyan-950/20 rounded-md p-3 border border-cyan-100 dark:border-cyan-900/50">
          <p className="font-medium text-cyan-700 dark:text-cyan-400 mb-1 flex items-center gap-1">
            <GitMerge className="h-3.5 w-3.5" />
            When review is approved:
          </p>
          <p>The PR will be merged, the issue closed, and the worktree cleaned up automatically.</p>
        </div>

        {/* CTA */}
        {job.prUrl && (
          <Button asChild variant="outline" className="w-full">
            <a href={job.prUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4 mr-2" />
              View on GitHub
            </a>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
