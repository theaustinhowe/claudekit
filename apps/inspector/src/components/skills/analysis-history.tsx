"use client";

import { Badge } from "@claudekit/ui/components/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@claudekit/ui/components/tooltip";
import { Calendar, Hash, Trash2 } from "lucide-react";
import Link from "next/link";

export interface AnalysisHistoryEntry {
  id: string;
  prNumbers: number[];
  createdAt: string;
  skillCount: number;
  topSkills: { name: string; description: string | null }[];
}

interface AnalysisHistoryProps {
  history: AnalysisHistoryEntry[];
  selectedId?: string;
  linkMode?: boolean;
  onSelect?: (analysisId: string) => void;
  onDelete?: (analysisId: string) => void;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function EntryContent({ entry, onDelete }: { entry: AnalysisHistoryEntry; onDelete?: (analysisId: string) => void }) {
  return (
    <>
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Calendar className="h-3 w-3" />
          {formatDate(entry.createdAt)}
        </div>
        <div className="flex items-center gap-1.5">
          <Badge variant="secondary" className="text-[10px]">
            <Hash className="h-2.5 w-2.5 mr-0.5" />
            {entry.prNumbers.length} PR{entry.prNumbers.length !== 1 ? "s" : ""}
          </Badge>
          <Badge variant="outline" className="text-[10px]">
            {entry.skillCount} skill{entry.skillCount !== 1 ? "s" : ""}
          </Badge>
          {onDelete && (
            <button
              type="button"
              className="ml-1 p-0.5 rounded text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 transition-colors"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onDelete(entry.id);
              }}
            >
              <Trash2 className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>
      {entry.topSkills.length > 0 && (
        <TooltipProvider>
          <div className="flex gap-1.5 flex-wrap">
            {entry.topSkills.map((skill) =>
              skill.description ? (
                <Tooltip key={skill.name}>
                  <TooltipTrigger asChild>
                    <Badge variant="secondary" className="text-[10px] cursor-default">
                      {skill.name}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-xs text-xs">
                    {skill.description}
                  </TooltipContent>
                </Tooltip>
              ) : (
                <Badge key={skill.name} variant="secondary" className="text-[10px]">
                  {skill.name}
                </Badge>
              ),
            )}
          </div>
        </TooltipProvider>
      )}
    </>
  );
}

export function AnalysisHistory({ history, selectedId, linkMode, onSelect, onDelete }: AnalysisHistoryProps) {
  if (history.length === 0) {
    return <p className="text-sm text-muted-foreground">No previous analyses found.</p>;
  }

  return (
    <div className="space-y-2">
      {history.map((entry) => {
        const className = `w-full text-left rounded-lg border p-3 transition-colors hover:bg-muted/50 block ${
          selectedId === entry.id ? "border-primary bg-primary/5" : ""
        }`;

        if (linkMode) {
          return (
            <Link key={entry.id} href={`/skills/${entry.id}`} className={className}>
              <EntryContent entry={entry} onDelete={onDelete} />
            </Link>
          );
        }

        return (
          <button type="button" key={entry.id} onClick={() => onSelect?.(entry.id)} className={className}>
            <EntryContent entry={entry} onDelete={onDelete} />
          </button>
        );
      })}
    </div>
  );
}
