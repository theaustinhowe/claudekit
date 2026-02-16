"use client";

import type { Job } from "@devkit/gogo-shared";
import { CheckCircle2, ExternalLink, GitPullRequest } from "lucide-react";
import { Button } from "@devkit/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@devkit/ui/components/card";

interface PrOpenedPanelProps {
  job: Job;
}

export function PrOpenedPanel({ job }: PrOpenedPanelProps) {
  return (
    <Card className="border-green-200 dark:border-green-900 bg-green-50 dark:bg-green-950/30">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base text-green-700 dark:text-green-400">
          <GitPullRequest className="h-5 w-5" />
          Pull Request Created
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground">
              {job.prNumber ? `PR #${job.prNumber}` : "Pull Request"} is ready for review
            </p>
            <p className="text-xs text-muted-foreground mt-1">Review the changes on GitHub and merge when ready.</p>
          </div>
        </div>

        {/* Next Steps */}
        <div className="space-y-2">
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Next Steps</h4>
          <ul className="text-sm space-y-1.5 text-muted-foreground">
            <li className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground shrink-0" />
              Review code changes
            </li>
            <li className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground shrink-0" />
              Check CI status
            </li>
            <li className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground shrink-0" />
              Merge when approved
            </li>
          </ul>
        </div>

        {/* What happens next */}
        <div className="text-xs text-muted-foreground bg-green-50/50 dark:bg-green-950/20 rounded-md p-3 border border-green-100 dark:border-green-900/50">
          <p className="font-medium text-green-700 dark:text-green-400 mb-1">What happens next:</p>
          <p>
            The system monitors for review comments. When a reviewer comments, the agent can address feedback
            automatically. You need to merge the PR manually when approved.
          </p>
        </div>

        {/* CTA */}
        {job.prUrl && (
          <Button asChild className="w-full">
            <a href={job.prUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4 mr-2" />
              Review on GitHub
            </a>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
