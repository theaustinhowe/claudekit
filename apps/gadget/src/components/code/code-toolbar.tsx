"use client";

import { Badge } from "@claudekit/ui/components/badge";
import { Button } from "@claudekit/ui/components/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@claudekit/ui/components/tooltip";
import { ExternalLink, FileDiff, FolderOpen, GitCommitHorizontal } from "lucide-react";
import { toast } from "sonner";
import { CodeBranchSwitcher } from "@/components/code/code-branch-switcher";
import { CodeBreadcrumb } from "@/components/code/code-breadcrumb";
import { InlineFileSearch } from "@/components/code/inline-file-search";
import { openInFinder } from "@/lib/actions/code-browser";
import type { CodeBranch, CodeTreeEntry } from "@/lib/types";

interface CodeToolbarProps {
  repoId: string;
  repoName: string;
  currentPath: string;
  branches: CodeBranch[];
  currentBranch: string;
  showCommits: boolean;
  showChanges: boolean;
  changedFileCount?: number;
  onNavigate: (path: string) => void;
  onBranchChange: (branch: string) => void;
  onToggleCommits: () => void;
  onToggleChanges: () => void;
  onFileSelect: (entry: CodeTreeEntry) => void;
}

export function CodeToolbar({
  repoId,
  repoName,
  currentPath,
  branches,
  currentBranch,
  showCommits,
  showChanges,
  changedFileCount,
  onNavigate,
  onBranchChange,
  onToggleCommits,
  onToggleChanges,
  onFileSelect,
}: CodeToolbarProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <CodeBranchSwitcher branches={branches} currentBranch={currentBranch} onBranchChange={onBranchChange} />
        <div className="flex-1" />
        <div className="flex items-center gap-1.5 shrink-0">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={async () => {
                    const ok = await openInFinder(repoId, currentPath || undefined);
                    if (!ok) toast.error("Could not open in Finder");
                  }}
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Open in Finder</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <InlineFileSearch repoId={repoId} onFileSelect={onFileSelect} />
          <Button
            variant={showChanges ? "default" : "outline"}
            size="sm"
            className="h-8 gap-1.5"
            onClick={onToggleChanges}
          >
            {showChanges ? <FolderOpen className="w-3.5 h-3.5" /> : <FileDiff className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">{showChanges ? "File Explorer" : "Changes"}</span>
            {!showChanges && changedFileCount !== undefined && changedFileCount > 0 && (
              <Badge variant="secondary" className="h-5 px-1.5 text-[10px] ml-0.5">
                {changedFileCount}
              </Badge>
            )}
          </Button>
          <Button
            variant={showCommits ? "default" : "outline"}
            size="sm"
            className="h-8 gap-1.5"
            onClick={onToggleCommits}
          >
            {showCommits ? <FolderOpen className="w-3.5 h-3.5" /> : <GitCommitHorizontal className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">{showCommits ? "File Explorer" : "Commits"}</span>
          </Button>
        </div>
      </div>
      <CodeBreadcrumb repoName={repoName} currentPath={currentPath} onNavigate={onNavigate} />
    </div>
  );
}
