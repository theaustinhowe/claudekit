"use client";

import { Badge } from "@claudekit/ui/components/badge";
import { Button } from "@claudekit/ui/components/button";
import { Card, CardContent } from "@claudekit/ui/components/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@claudekit/ui/components/tooltip";
import { format, formatDistanceToNow } from "date-fns";
import { ExternalLink, Loader2, Play, User, Zap } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { GitHubIssue } from "@/lib/api";

interface IssueCardProps {
  issue: GitHubIssue;
  onClick?: (issue: GitHubIssue) => void;
  onCreateJob: (issueNumber: number) => void;
  createJobLoading?: boolean;
}

export function IssueCard({ issue, onClick, onCreateJob, createJobLoading = false }: IssueCardProps) {
  const isLoading = createJobLoading;

  const handleCardClick = () => {
    onClick?.(issue);
  };

  const handleButtonClick = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  return (
    <TooltipProvider>
      <Card
        className="transition-all duration-base hover:shadow-elevation-2 hover:-translate-y-0.5 hover:border-primary/50 cursor-pointer"
        onClick={handleCardClick}
      >
        <CardContent className="p-4">
          {/* Header: Issue number, state, and actions */}
          <div className="mb-3 flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              {/* Issue number and state */}
              <div className="mb-1.5 flex items-center gap-2">
                <span className="text-sm font-medium text-muted-foreground">#{issue.number}</span>
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
              </div>
              {/* Title */}
              <h3 className="truncate text-sm font-semibold">{issue.title}</h3>
            </div>

            {/* External link to GitHub */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleButtonClick} asChild>
                  <a href={issue.html_url} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">Open on GitHub</p>
              </TooltipContent>
            </Tooltip>
          </div>

          {/* Labels */}
          {issue.labels.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-1.5">
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

          {/* Footer: Author, created time, and actions */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              {issue.user ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Image
                      src={issue.user.avatar_url}
                      alt={issue.user.login}
                      width={20}
                      height={20}
                      className="h-5 w-5 rounded-full"
                      unoptimized
                    />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="text-xs">{issue.user.login}</p>
                  </TooltipContent>
                </Tooltip>
              ) : (
                <div className="h-5 w-5 rounded-full bg-muted flex items-center justify-center">
                  <User className="h-3 w-3 text-muted-foreground" />
                </div>
              )}
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="text-xs text-muted-foreground cursor-default">
                    {formatDistanceToNow(new Date(issue.created_at), {
                      addSuffix: true,
                    })}
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs">{format(new Date(issue.created_at), "MMM d, yyyy 'at' h:mm a")}</p>
                </TooltipContent>
              </Tooltip>
            </div>

            {/* Job action button */}
            {issue.hasJob && issue.jobId ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={handleButtonClick} asChild>
                    <Link href={`/?job=${issue.jobId}`}>
                      <Zap className="h-3.5 w-3.5" />
                      View Job
                    </Link>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs">Job already exists for this issue</p>
                </TooltipContent>
              </Tooltip>
            ) : (
              <Button
                variant="default"
                size="sm"
                className="gap-1.5"
                onClick={(e) => {
                  handleButtonClick(e);
                  onCreateJob(issue.number);
                }}
                disabled={isLoading}
              >
                {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                Create Job
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </TooltipProvider>
  );
}
