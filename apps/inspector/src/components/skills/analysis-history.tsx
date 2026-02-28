"use client";

import { Badge } from "@claudekit/ui/components/badge";
import { Calendar, Hash } from "lucide-react";
import Link from "next/link";

export interface AnalysisHistoryEntry {
  id: string;
  prNumbers: number[];
  createdAt: string;
  skillCount: number;
  topSkills: string[];
}

interface AnalysisHistoryProps {
  history: AnalysisHistoryEntry[];
  selectedId?: string;
  linkMode?: boolean;
  onSelect?: (analysisId: string) => void;
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

function EntryContent({ entry }: { entry: AnalysisHistoryEntry }) {
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
    </>
  );
}

export function AnalysisHistory({ history, selectedId, linkMode, onSelect }: AnalysisHistoryProps) {
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
              <EntryContent entry={entry} />
            </Link>
          );
        }

        return (
          <button type="button" key={entry.id} onClick={() => onSelect?.(entry.id)} className={className}>
            <EntryContent entry={entry} />
          </button>
        );
      })}
    </div>
  );
}
