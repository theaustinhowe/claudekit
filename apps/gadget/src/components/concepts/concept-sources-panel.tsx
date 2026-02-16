"use client";

import { Folder, Github, Info, List, Loader2, RefreshCw, Settings, Star, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@devkit/ui/components/badge";
import { Button } from "@devkit/ui/components/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@devkit/ui/components/tooltip";
import { deleteConceptSource, scanConceptSource } from "@/lib/actions/concept-sources";
import { SOURCE_TYPE_LABELS } from "@/lib/constants";
import type { ConceptSourceWithStats } from "@/lib/types";
import { formatNumber, timeAgo } from "@/lib/utils";

const SOURCE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  local_repo: Folder,
  github_repo: Github,
  mcp_list: List,
  curated: Star,
  claude_config: Settings,
};

interface ConceptSourcesPanelProps {
  sources: ConceptSourceWithStats[];
  hiddenGitHubCount?: number;
}

export function ConceptSourcesPanel({ sources, hiddenGitHubCount = 0 }: ConceptSourcesPanelProps) {
  const router = useRouter();
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleRefresh = async (sourceId: string) => {
    setRefreshingId(sourceId);
    try {
      const result = await scanConceptSource(sourceId);
      if (result.success) {
        toast.success(result.message);
        router.refresh();
      } else {
        toast.error(result.message);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Refresh failed");
    } finally {
      setRefreshingId(null);
    }
  };

  const handleDelete = async (sourceId: string) => {
    setDeletingId(sourceId);
    try {
      const result = await deleteConceptSource(sourceId);
      if (result.success) {
        toast.success(result.message);
        router.refresh();
      } else {
        toast.error(result.message);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeletingId(null);
    }
  };

  if (sources.length === 0 && hiddenGitHubCount === 0) return null;

  return (
    <div className="space-y-2">
      {hiddenGitHubCount > 0 && (
        <div className="flex items-center gap-2 p-2.5 rounded-lg border bg-muted/50 text-xs text-muted-foreground">
          <Info className="w-3.5 h-3.5 shrink-0" />
          <span>
            Add a GitHub account to see {formatNumber(hiddenGitHubCount)} suggested repo
            {hiddenGitHubCount !== 1 ? "s" : ""}
          </span>
        </div>
      )}
      {sources.map((source) => {
        const Icon = SOURCE_ICONS[source.source_type] || List;
        const isRefreshing = refreshingId === source.id;
        const isDeleting = deletingId === source.id;

        return (
          <div key={source.id} className="flex items-center gap-3 p-2.5 rounded-lg border bg-card text-sm">
            <div className="w-7 h-7 rounded-md bg-muted flex items-center justify-center shrink-0">
              <Icon className="w-3.5 h-3.5 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium truncate">{source.name}</span>
                <Badge variant="outline" className="text-[10px] shrink-0">
                  {SOURCE_TYPE_LABELS[source.source_type] || source.source_type}
                </Badge>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>
                  {formatNumber(source.concept_count)} concept{source.concept_count !== 1 ? "s" : ""}
                </span>
                {source.last_scanned_at && (
                  <>
                    <span>&middot;</span>
                    <span>{timeAgo(source.last_scanned_at)}</span>
                  </>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => handleRefresh(source.id)}
                      disabled={isRefreshing}
                    >
                      {isRefreshing ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="w-3.5 h-3.5" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Refresh</TooltipContent>
                </Tooltip>
              </TooltipProvider>
              {!source.is_builtin && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => handleDelete(source.id)}
                        disabled={isDeleting}
                      >
                        {isDeleting ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="w-3.5 h-3.5" />
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Delete</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
