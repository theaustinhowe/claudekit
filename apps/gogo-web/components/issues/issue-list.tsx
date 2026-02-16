"use client";

import { Inbox } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import type { GitHubIssue } from "@/lib/api";
import { IssueCard } from "./issue-card";

interface IssueListProps {
  issues: GitHubIssue[];
  isLoading?: boolean;
  onIssueClick?: (issue: GitHubIssue) => void;
  onCreateJob: (issueNumber: number) => void;
  creatingJobForIssue?: number | null;
}

export function IssueList({
  issues,
  isLoading = false,
  onIssueClick,
  onCreateJob,
  creatingJobForIssue,
}: IssueListProps) {
  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton placeholders
          <Skeleton key={i} className="h-40 w-full" />
        ))}
      </div>
    );
  }

  if (issues.length === 0) {
    return (
      <div className="flex h-64 flex-col items-center justify-center p-8 text-center">
        <div className="mb-4 rounded-full bg-muted p-4">
          <Inbox className="h-10 w-10 text-muted-foreground" />
        </div>
        <h2 className="mb-2 text-xl font-semibold">No issues found</h2>
        <p className="max-w-md text-muted-foreground">
          There are no issues matching your current filters. Try changing the state filter or create a new issue.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {issues.map((issue) => (
        <IssueCard
          key={issue.number}
          issue={issue}
          onClick={onIssueClick}
          onCreateJob={onCreateJob}
          createJobLoading={creatingJobForIssue === issue.number}
        />
      ))}
    </div>
  );
}
