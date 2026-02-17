"use client";

import { cn } from "@devkit/ui";
import { Badge } from "@devkit/ui/components/badge";
import { ArrowDown, ArrowUp, Minus, Plus, X } from "lucide-react";
import type { ComparisonSkill } from "@/lib/actions/skills";

const STATUS_CONFIG: Record<
  ComparisonSkill["status"],
  { label: string; color: string; icon: typeof Plus; bg: string }
> = {
  new: { label: "New", color: "text-status-info", icon: Plus, bg: "bg-status-info/10" },
  resolved: { label: "Resolved", color: "text-status-success", icon: X, bg: "bg-status-success/10" },
  improved: { label: "Improved", color: "text-status-success", icon: ArrowDown, bg: "bg-status-success/10" },
  worsened: { label: "Worsened", color: "text-status-error", icon: ArrowUp, bg: "bg-status-error/10" },
  unchanged: { label: "Unchanged", color: "text-muted-foreground", icon: Minus, bg: "bg-muted" },
};

interface AnalysisComparisonProps {
  comparison: ComparisonSkill[];
}

export function AnalysisComparison({ comparison }: AnalysisComparisonProps) {
  if (comparison.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-4">No skills to compare.</p>;
  }

  const summary = {
    new: comparison.filter((c) => c.status === "new").length,
    resolved: comparison.filter((c) => c.status === "resolved").length,
    improved: comparison.filter((c) => c.status === "improved").length,
    worsened: comparison.filter((c) => c.status === "worsened").length,
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        {summary.improved > 0 && (
          <Badge variant="secondary" className="bg-status-success/10 text-status-success text-xs">
            {summary.improved} improved
          </Badge>
        )}
        {summary.worsened > 0 && (
          <Badge variant="secondary" className="bg-status-error/10 text-status-error text-xs">
            {summary.worsened} worsened
          </Badge>
        )}
        {summary.new > 0 && (
          <Badge variant="secondary" className="bg-status-info/10 text-status-info text-xs">
            {summary.new} new
          </Badge>
        )}
        {summary.resolved > 0 && (
          <Badge variant="secondary" className="bg-status-success/10 text-status-success text-xs">
            {summary.resolved} resolved
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-4 gap-y-2 text-sm">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Skill</div>
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide text-right">Before</div>
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide text-right">After</div>
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Status</div>

        {comparison.map((skill) => {
          const config = STATUS_CONFIG[skill.status];
          const Icon = config.icon;
          return (
            <div key={skill.name} className="contents">
              <div className="font-medium truncate py-1">{skill.name}</div>
              <div className="text-right text-muted-foreground tabular-nums py-1">{skill.frequencyA ?? "-"}</div>
              <div className="text-right tabular-nums py-1">{skill.frequencyB ?? "-"}</div>
              <div className={cn("flex items-center gap-1 py-1", config.color)}>
                <Icon className="h-3 w-3" />
                <span className="text-xs">{config.label}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
