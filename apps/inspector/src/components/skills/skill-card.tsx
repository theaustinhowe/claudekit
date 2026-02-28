"use client";

import { Badge } from "@claudekit/ui/components/badge";
import { Card, CardContent } from "@claudekit/ui/components/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@claudekit/ui/components/tooltip";
import { Star } from "lucide-react";
import { TREND_ICONS } from "@/lib/constants";
import type { SkillWithComments } from "@/lib/types";

interface SkillCardProps {
  skill: SkillWithComments;
  groupName?: string | null;
  groupColor?: string;
  onClick?: () => void;
}

function formatSkillName(name: string): string {
  return name.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function SkillCard({ skill, groupName, groupColor, onClick }: SkillCardProps) {
  const severityVar =
    skill.severity === "blocking"
      ? "status-error"
      : skill.severity === "suggestion"
        ? "status-warning"
        : "status-success";

  return (
    <Card
      className="cursor-pointer hover:shadow-md transition-shadow border-l-[3px]"
      style={{ borderLeftColor: groupColor ?? `hsl(var(--${severityVar}))` }}
      onClick={onClick}
    >
      <CardContent className="p-5 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold text-sm leading-tight min-w-0">{formatSkillName(skill.name)}</h3>
          {skill.trend === "New pattern" ? (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="text-amber-500 shrink-0">
                    <Star className="h-3.5 w-3.5 fill-current" />
                  </span>
                </TooltipTrigger>
                <TooltipContent>New pattern</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : (
            <span className="text-xs text-muted-foreground shrink-0">
              {TREND_ICONS[skill.trend ?? ""] ?? ""} {skill.trend}
            </span>
          )}
        </div>

        {skill.description && (
          <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">{skill.description}</p>
        )}

        <div className="space-y-1">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Frequency</span>
            <span>
              {skill.frequency.toLocaleString()}/{skill.totalPRs.toLocaleString()} PRs
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

        {groupName && (
          <Badge
            variant="secondary"
            className="text-[10px] w-fit border"
            style={groupColor ? { borderColor: groupColor, color: groupColor } : undefined}
          >
            {groupName}
          </Badge>
        )}
      </CardContent>
    </Card>
  );
}
