"use client";

import { Button } from "@claudekit/ui/components/button";
import { Brain, Plus } from "lucide-react";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { AnalysisHistory, type AnalysisHistoryEntry } from "@/components/skills/analysis-history";
import { useRepoContext } from "@/contexts/repo-context";
import { deleteAnalysis } from "@/lib/actions/skills";

interface HistoryEntryWithRepo extends AnalysisHistoryEntry {
  repoId: string;
}

interface SkillsListClientProps {
  history: HistoryEntryWithRepo[];
}

export function SkillsListClient({ history: initialHistory }: SkillsListClientProps) {
  const { selectedRepoId } = useRepoContext();
  const [history, setHistory] = useState(initialHistory);
  const [, startTransition] = useTransition();

  const filtered = useMemo(
    () => (selectedRepoId === "all" ? history : history.filter((h) => h.repoId === selectedRepoId)),
    [history, selectedRepoId],
  );

  const handleDelete = (analysisId: string) => {
    setHistory((prev) => prev.filter((h) => h.id !== analysisId));
    startTransition(async () => {
      try {
        await deleteAnalysis(analysisId);
        toast.success("Analysis deleted");
      } catch {
        setHistory(initialHistory);
        toast.error("Failed to delete analysis");
      }
    });
  };

  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold mb-1">Skill Builder</h1>
          <p className="text-sm text-muted-foreground">
            {filtered.length > 0
              ? `${filtered.length.toLocaleString()} past analysis${filtered.length !== 1 ? "es" : ""}`
              : "Analyze PR feedback to uncover skill growth areas"}
          </p>
        </div>
        <Button className="gradient-primary text-primary-foreground" asChild>
          <Link href="/skills/new">
            <Plus className="h-4 w-4 mr-2" />
            New Analysis
          </Link>
        </Button>
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-4">
          <Brain className="h-12 w-12 text-muted-foreground/50" />
          <div className="text-center">
            <h2 className="text-lg font-semibold mb-1">No analyses yet</h2>
            <p className="text-sm text-muted-foreground">
              Select PRs with review feedback to identify skill patterns and growth areas.
            </p>
          </div>
          <Button className="gradient-primary text-primary-foreground" asChild>
            <Link href="/skills/new">
              <Plus className="h-4 w-4 mr-2" />
              Start Your First Analysis
            </Link>
          </Button>
        </div>
      ) : (
        <AnalysisHistory history={filtered} linkMode onDelete={handleDelete} />
      )}
    </>
  );
}
