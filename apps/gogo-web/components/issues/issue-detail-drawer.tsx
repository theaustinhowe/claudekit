"use client";

import { Badge } from "@claudekit/ui/components/badge";
import { Button } from "@claudekit/ui/components/button";
import { ScrollArea } from "@claudekit/ui/components/scroll-area";
import { Separator } from "@claudekit/ui/components/separator";
import { Sheet, SheetBody, SheetContent, SheetHeader, SheetTitle } from "@claudekit/ui/components/sheet";
import { TooltipProvider } from "@claudekit/ui/components/tooltip";
import { ExternalLink, Loader2, Play, Zap } from "lucide-react";
import Link from "next/link";
import type { GitHubIssue } from "@/lib/api";
import { IssueAuthorInfo, IssueComments, IssueDescription } from "./issue-content";

interface IssueDetailDrawerProps {
  issue: GitHubIssue | null;
  repositoryId: string | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreateJob: (issueNumber: number) => void;
  createJobLoading?: boolean;
}

export function IssueDetailDrawer({
  issue,
  repositoryId,
  open,
  onOpenChange,
  onCreateJob,
  createJobLoading = false,
}: IssueDetailDrawerProps) {
  if (!issue) return null;

  return (
    <TooltipProvider>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full sm:max-w-lg flex flex-col">
          <SheetHeader className="space-y-2 pb-4 border-b">
            {/* Title row */}
            <SheetTitle className="text-left">{issue.title}</SheetTitle>

            {/* Meta line: #number • state with GitHub link */}
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="font-medium">#{issue.number}</span>
              <span>•</span>
              <Badge
                variant={issue.state === "open" ? "default" : "secondary"}
                className={
                  issue.state === "open"
                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-0"
                    : "bg-muted text-muted-foreground border-0"
                }
              >
                {issue.state}
              </Badge>
              <span>•</span>
              <a
                href={issue.html_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
              >
                GitHub
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </SheetHeader>

          <SheetBody>
            <ScrollArea className="flex-1 -mx-6 px-6">
              <div className="space-y-4 py-4">
                {/* Author info */}
                {issue.user && <IssueAuthorInfo user={issue.user} createdAt={issue.created_at} />}

                {/* Labels */}
                {issue.labels.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {issue.labels.map((label) => (
                      <Badge
                        key={label.id}
                        variant="outline"
                        style={{
                          backgroundColor: `#${label.color}20`,
                          borderColor: `#${label.color}`,
                          color: `#${label.color}`,
                        }}
                        className="text-xs"
                      >
                        {label.name}
                      </Badge>
                    ))}
                  </div>
                )}

                {/* Description */}
                <IssueDescription body={issue.body} />

                {/* Comments section */}
                {repositoryId && (
                  <>
                    <Separator className="my-4" />
                    <IssueComments repositoryId={repositoryId} issueNumber={issue.number} />
                  </>
                )}
              </div>
            </ScrollArea>
          </SheetBody>

          {/* Actions footer */}
          <div className="border-t pt-4">
            {issue.hasJob && issue.jobId ? (
              <Button className="w-full gap-2" asChild>
                <Link href={`/?job=${issue.jobId}`}>
                  <Zap className="h-4 w-4" />
                  View Job
                </Link>
              </Button>
            ) : (
              <Button className="w-full gap-2" onClick={() => onCreateJob(issue.number)} disabled={createJobLoading}>
                {createJobLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                Create Job
              </Button>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </TooltipProvider>
  );
}
