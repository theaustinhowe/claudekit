"use client";

import { cn } from "@devkit/ui";
import { Card, CardContent } from "@devkit/ui/components/card";
import { SEVERITY_COLORS, TREND_ICONS } from "@/lib/constants";
import type { SkillWithComments } from "@/lib/types";

interface SkillCardProps {
  skill: SkillWithComments;
  onClick?: () => void;
}

export function SkillCard({ skill, onClick }: SkillCardProps) {
  const severityVar =
    skill.severity === "blocking"
      ? "status-error"
      : skill.severity === "suggestion"
        ? "status-warning"
        : "status-success";

  return (
    <Card
      className="cursor-pointer hover:shadow-md transition-shadow border-l-[3px]"
      style={{ borderLeftColor: `hsl(var(--${severityVar}))` }}
      onClick={onClick}
    >
      <CardContent className="p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={cn("h-2.5 w-2.5 rounded-full", SEVERITY_COLORS[skill.severity])} />
            <h3 className="font-semibold text-sm">{skill.name}</h3>
          </div>
          <span className="text-xs text-muted-foreground">
            {TREND_ICONS[skill.trend ?? ""] ?? ""} {skill.trend}
          </span>
        </div>

        <div className="space-y-1">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Frequency</span>
            <span>
              {skill.frequency}/{skill.totalPRs} PRs
            </span>
          </div>
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full gradient-primary rounded-full"
              style={{ width: `${(skill.frequency / Math.max(skill.totalPRs, 1)) * 100}%` }}
            />
          </div>
        </div>

        {skill.topExample && (
          <p className="text-xs text-muted-foreground italic leading-relaxed line-clamp-2">
            &ldquo;{skill.topExample}&rdquo;
          </p>
        )}
      </CardContent>
    </Card>
  );
}
