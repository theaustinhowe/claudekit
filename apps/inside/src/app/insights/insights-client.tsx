"use client";

import { cn } from "@devkit/ui";
import { Badge } from "@devkit/ui/components/badge";
import { Card, CardContent } from "@devkit/ui/components/card";
import { MessageSquare, Users } from "lucide-react";
import { SEVERITY_COLORS, SEVERITY_LABELS } from "@/lib/constants";
import type { ReviewerStats } from "@/lib/types";

function SeverityBar({ counts }: { counts: Record<string, number> }) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (total === 0) return null;

  const order: string[] = ["blocking", "suggestion", "nit"];

  return (
    <div className="flex h-2 rounded-full overflow-hidden w-full">
      {order.map((severity) => {
        const count = counts[severity] || 0;
        if (count === 0) return null;
        return (
          <div
            key={severity}
            className={cn("h-full", SEVERITY_COLORS[severity])}
            style={{ width: `${(count / total) * 100}%` }}
            title={`${SEVERITY_LABELS[severity] || severity}: ${count}`}
          />
        );
      })}
      {/* unknown severity */}
      {counts.unknown ? (
        <div
          className="h-full bg-muted-foreground/30"
          style={{ width: `${(counts.unknown / total) * 100}%` }}
          title={`Unknown: ${counts.unknown}`}
        />
      ) : null}
    </div>
  );
}

function ReviewerCard({ stats }: { stats: ReviewerStats }) {
  const initials = stats.reviewer
    .split(/[\s-]+/)
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const topCategories = Object.entries(stats.categoryCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3);

  return (
    <Card>
      <CardContent className="p-5 space-y-4">
        <div className="flex items-center gap-3">
          {stats.reviewerAvatar ? (
            // biome-ignore lint/performance/noImgElement: external avatar URL
            <img src={stats.reviewerAvatar} alt={stats.reviewer} className="h-10 w-10 rounded-full" />
          ) : (
            <div className="h-10 w-10 rounded-full bg-secondary flex items-center justify-center text-xs font-bold text-secondary-foreground">
              {initials}
            </div>
          )}
          <div>
            <h3 className="font-semibold text-sm">{stats.reviewer}</h3>
            <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
              <span className="flex items-center gap-1">
                <MessageSquare className="h-3 w-3" />
                {stats.totalComments} comments
              </span>
              <span>{stats.prsReviewed} PRs</span>
            </div>
          </div>
        </div>

        <SeverityBar counts={stats.severityCounts} />

        <div className="flex gap-2 flex-wrap">
          {Object.entries(stats.severityCounts)
            .filter(([k]) => k !== "unknown")
            .map(([severity, count]) => (
              <Badge key={severity} variant="secondary" className="text-[10px]">
                {SEVERITY_LABELS[severity] || severity}: {count}
              </Badge>
            ))}
        </div>

        {topCategories.length > 0 && (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1.5">Top categories</p>
            <div className="space-y-1">
              {topCategories.map(([category, count]) => (
                <div key={category} className="flex items-center justify-between text-xs">
                  <span>{category}</span>
                  <span className="text-muted-foreground tabular-nums">{count}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface InsightsClientProps {
  repoId: string;
  reviewerStats: ReviewerStats[];
}

export function InsightsClient({ reviewerStats }: InsightsClientProps) {
  if (reviewerStats.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center">
        <Users className="h-12 w-12 text-muted-foreground mb-4" />
        <h2 className="text-lg font-semibold mb-2">No Reviewer Data</h2>
        <p className="text-sm text-muted-foreground max-w-md">
          Sync your repository and review comments to see reviewer insights.
        </p>
      </div>
    );
  }

  const totalComments = reviewerStats.reduce((a, b) => a + b.totalComments, 0);

  return (
    <div className="p-6 max-w-[1200px] mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold mb-1">Reviewer Insights</h1>
        <p className="text-sm text-muted-foreground">
          {reviewerStats.length} reviewer{reviewerStats.length !== 1 ? "s" : ""} across {totalComments} comments
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {reviewerStats.map((stats) => (
          <ReviewerCard key={stats.reviewer} stats={stats} />
        ))}
      </div>
    </div>
  );
}
