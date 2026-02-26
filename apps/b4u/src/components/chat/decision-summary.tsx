"use client";

import type { PhaseDecision } from "@/lib/types";

interface DecisionSummaryProps {
  decisions: PhaseDecision[];
}

export function DecisionSummary({ decisions }: DecisionSummaryProps) {
  const completed = decisions.filter((d) => d.value !== null);
  if (completed.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5 px-4 py-2 border-t border-border/50">
      {completed.map((decision) => (
        <span
          key={decision.id}
          className="inline-flex items-center gap-1 px-2 py-0.5 text-2xs rounded-full bg-primary/10 text-primary"
        >
          <span className="text-[9px]">{"\u2713"}</span>
          <span>{decision.label}</span>
        </span>
      ))}
    </div>
  );
}
