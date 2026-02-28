"use client";

import { cn } from "@claudekit/ui";
import { Card, CardContent } from "@claudekit/ui/components/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@claudekit/ui/components/tooltip";
import { Star } from "lucide-react";
import { SEVERITY_COLORS, TREND_ICONS } from "@/lib/constants";
import type { SkillWithComments } from "@/lib/types";

interface SkillCardProps {
  skill: SkillWithComments;
  onClick?: () => void;
}

function formatSkillName(name: string): string {
  return name.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
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
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2 min-w-0">
            <div className={cn("h-2.5 w-2.5 rounded-full mt-1 shrink-0", SEVERITY_COLORS[skill.severity])} />
            <h3 className="font-semibold text-sm leading-tight">{formatSkillName(skill.name)}</h3>
          </div>
          {skill.trend === "New pattern" ? (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="text-muted-foreground shrink-0">
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

        {skill.ruleContent && (
          <div className="pt-2 border-t border-border/50">
            <p className="text-[10px] font-medium text-muted-foreground mb-1">SKILL.md Rule</p>
            <pre className="text-[10px] font-mono text-muted-foreground bg-muted/50 rounded p-2 overflow-x-auto whitespace-pre-wrap line-clamp-4">
              {skill.ruleContent}
            </pre>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
