"use client";

import { Badge } from "@claudekit/ui/components/badge";
import { Calendar, Hash } from "lucide-react";

interface AnalysisHistoryEntry {
  id: string;
  prNumbers: number[];
  createdAt: string;
  skillCount: number;
  topSkills: string[];
}

interface AnalysisHistoryProps {
  history: AnalysisHistoryEntry[];
  onSelect: (analysisId: string) => void;
  selectedId?: string;
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

export function AnalysisHistory({ history, onSelect, selectedId }: AnalysisHistoryProps) {
  if (history.length === 0) {
    return <p className="text-sm text-muted-foreground">No previous analyses found.</p>;
  }

  return (
    <div className="space-y-2">
      {history.map((entry) => (
        <button
          type="button"
          key={entry.id}
          onClick={() => onSelect(entry.id)}
          className={`w-full text-left rounded-lg border p-3 transition-colors hover:bg-muted/50 ${
            selectedId === entry.id ? "border-primary bg-primary/5" : ""
          }`}
        >
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
            </div>
          </div>
          {entry.topSkills.length > 0 && (
            <div className="flex gap-1.5 flex-wrap">
              {entry.topSkills.map((skill) => (
                <span key={skill} className="text-xs text-muted-foreground">
                  {skill}
                </span>
              ))}
            </div>
          )}
        </button>
      ))}
    </div>
  );
}
