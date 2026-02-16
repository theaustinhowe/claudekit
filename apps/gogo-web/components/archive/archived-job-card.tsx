"use client";

import { Badge } from "@devkit/ui/components/badge";
import { Button } from "@devkit/ui/components/button";
import { Card, CardContent } from "@devkit/ui/components/card";
import { formatDistanceToNow } from "date-fns";
import { ExternalLink, GitBranch, RotateCcw } from "lucide-react";
import type { Job } from "@/types/job";
import { JOB_STATUS_CONFIG } from "@/types/job";

interface ArchivedJobCardProps {
  job: Job;
  onUnarchive?: (job: Job) => void;
}

export function ArchivedJobCard({ job, onUnarchive }: ArchivedJobCardProps) {
  const config = JOB_STATUS_CONFIG[job.status];

  return (
    <Card className="transition-shadow hover:shadow-md">
      <CardContent className="p-4">
        <div className="mb-3 flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex items-center gap-2">
              <span className="text-sm font-medium text-muted-foreground">#{job.issueNumber}</span>
              <Badge className={`${config.bgColor} ${config.color} border-0`}>{config.label}</Badge>
            </div>
            <h3 className="truncate text-sm font-semibold">{job.issueTitle}</h3>
          </div>
        </div>

        <div className="mb-3 space-y-1.5 text-xs text-muted-foreground">
          {job.branch && (
            <div className="flex items-center gap-1.5">
              <GitBranch className="h-3 w-3" />
              <span className="truncate font-mono">{job.branch}</span>
            </div>
          )}
          <p>Completed {formatDistanceToNow(new Date(job.updatedAt), { addSuffix: true })}</p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="flex-1 gap-1.5" onClick={() => onUnarchive?.(job)}>
            <RotateCcw className="h-3.5 w-3.5" />
            Restore
          </Button>
          <Button variant="ghost" size="sm" asChild>
            <a href={job.issueUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
