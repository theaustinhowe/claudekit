"use client";

import { GitBranch } from "lucide-react";
import { Badge } from "@devkit/ui/components/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@devkit/ui/components/tooltip";
import { useRepositoryContext } from "@/contexts/repository-context";

interface RepoBadgeProps {
  repositoryId: string | null;
  className?: string;
}

export function RepoBadge({ repositoryId, className }: RepoBadgeProps) {
  const { repositories, selectedRepoId } = useRepositoryContext();

  // Don't show badge if viewing a single repo
  if (selectedRepoId !== "all") {
    return null;
  }

  // Don't show badge if no repositoryId
  if (!repositoryId) {
    return null;
  }

  const repo = repositories.find((r) => r.id === repositoryId);
  if (!repo) {
    return null;
  }

  const displayName = repo.displayName || repo.name;
  const fullName = `${repo.owner}/${repo.name}`;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="outline" className={`gap-1 font-normal ${className}`}>
          <GitBranch className="h-3 w-3" />
          <span className="max-w-20 truncate">{displayName}</span>
        </Badge>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        <p className="text-xs">{fullName}</p>
      </TooltipContent>
    </Tooltip>
  );
}
