"use client";

import { Button } from "@claudekit/ui/components/button";
import { Progress } from "@claudekit/ui/components/progress";
import type { StreamEntry } from "@claudekit/ui/components/streaming-display";
import { StreamingDisplay } from "@claudekit/ui/components/streaming-display";
import { BookOpen, Brain, Square } from "lucide-react";

interface AnalysisProgressProps {
  variant: "analyzing" | "generating_rules";
  progress: number;
  phase: string | null;
  entries: StreamEntry[];
  isStreaming: boolean;
  elapsed: number;
  onCancel: () => void;
}

export function AnalysisProgress({
  variant,
  progress,
  phase,
  entries,
  isStreaming,
  elapsed,
  onCancel,
}: AnalysisProgressProps) {
  const isRules = variant === "generating_rules";

  return (
    <div className="flex flex-col items-center justify-center h-full p-8">
      {isRules ? (
        <BookOpen className="h-12 w-12 text-primary mb-6 animate-pulse" />
      ) : (
        <Brain className="h-12 w-12 text-primary mb-6 animate-pulse" />
      )}
      <h2 className="text-xl font-bold mb-2">{isRules ? "Generating SKILL.md Rules" : "Analyzing Skills"}</h2>
      {isRules && (
        <p className="text-sm text-muted-foreground mb-6">Analyzing PR diffs and comments to create actionable rules</p>
      )}
      <div className="w-full max-w-md space-y-4">
        <Progress value={progress} className="h-2" />
        {phase && <p className="text-center text-sm font-medium">{phase}</p>}
        {entries.length > 0 && (
          <div className="max-h-[50vh] overflow-y-auto">
            <StreamingDisplay entries={entries} variant="chat" live={isStreaming} />
          </div>
        )}
        {elapsed > 0 && <p className="text-center text-xs text-muted-foreground">{elapsed}s elapsed</p>}
      </div>
      <Button variant="outline" className="w-full max-w-md" onClick={onCancel}>
        <Square className="h-3 w-3 mr-2" />
        Cancel
      </Button>
    </div>
  );
}
