"use client";

import { cn } from "@claudekit/ui";
import { Badge } from "@claudekit/ui/components/badge";
import { Card, CardContent } from "@claudekit/ui/components/card";
import { Sheet, SheetBody, SheetContent, SheetHeader, SheetTitle } from "@claudekit/ui/components/sheet";
import { FileCode, MessageSquare, Users } from "lucide-react";
import { useState, useTransition } from "react";
import { getReviewerComments, getReviewerFileStats } from "@/lib/actions/reviewers";
import { SEVERITY_COLORS, SEVERITY_LABELS } from "@/lib/constants";
import type { ReviewerComment, ReviewerStats } from "@/lib/types";

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

function SeverityBadge({ severity }: { severity: string | null }) {
  if (!severity) return null;
  const colorMap: Record<string, string> = {
    blocking: "bg-status-error/15 text-status-error",
    suggestion: "bg-status-warning/15 text-status-warning",
    nit: "bg-status-success/15 text-status-success",
  };
  return (
    <Badge variant="outline" className={cn("text-[10px] border-none", colorMap[severity] ?? "")}>
      {SEVERITY_LABELS[severity] || severity}
    </Badge>
  );
}

function ReviewerCard({ stats, onClick }: { stats: ReviewerStats; onClick: () => void }) {
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
    <Card className="cursor-pointer hover:border-primary/50 transition-colors" onClick={onClick}>
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

function ReviewerDrawer({
  comments,
  fileStats,
  loading,
}: {
  comments: ReviewerComment[];
  fileStats: { filePath: string; count: number }[];
  loading: boolean;
}) {
  return (
    <div className="space-y-6">
      {/* Most commented files */}
      {fileStats.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
            <FileCode className="h-4 w-4" /> Most Commented Files
          </h4>
          <div className="space-y-1.5">
            {fileStats.map(({ filePath, count }) => (
              <div key={filePath} className="flex items-center justify-between text-xs">
                <code className="font-mono text-[11px] text-muted-foreground truncate max-w-[80%]">{filePath}</code>
                <span className="text-muted-foreground tabular-nums">{Number(count)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Comment timeline */}
      <div>
        <h4 className="text-sm font-semibold mb-3 flex items-center gap-1.5">
          <MessageSquare className="h-4 w-4" /> Comments ({comments.length})
        </h4>
        {loading ? (
          <p className="text-sm text-muted-foreground animate-pulse">Loading comments...</p>
        ) : comments.length === 0 ? (
          <p className="text-sm text-muted-foreground">No comments found.</p>
        ) : (
          <div className="space-y-3">
            {comments.map((comment) => (
              <div key={comment.id} className="border rounded-lg p-3 space-y-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-medium">
                    #{comment.prNumber} {comment.prTitle}
                  </span>
                  <SeverityBadge severity={comment.severity} />
                  {comment.category && (
                    <Badge variant="secondary" className="text-[10px]">
                      {comment.category}
                    </Badge>
                  )}
                </div>
                {comment.filePath && (
                  <code className="text-[11px] font-mono text-muted-foreground block">
                    {comment.filePath}
                    {comment.lineNumber ? `:${comment.lineNumber}` : ""}
                  </code>
                )}
                <p className="text-sm text-muted-foreground line-clamp-3">{comment.body}</p>
                {comment.createdAt && (
                  <p className="text-[10px] text-muted-foreground">
                    {new Date(comment.createdAt).toLocaleDateString()}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface InsightsClientProps {
  repoId: string;
  reviewerStats: ReviewerStats[];
}

export function InsightsClient({ repoId, reviewerStats }: InsightsClientProps) {
  const [selectedReviewer, setSelectedReviewer] = useState<ReviewerStats | null>(null);
  const [reviewerComments, setReviewerComments] = useState<ReviewerComment[]>([]);
  const [fileStats, setFileStats] = useState<{ filePath: string; count: number }[]>([]);
  const [isPending, startTransition] = useTransition();

  const handleReviewerClick = (stats: ReviewerStats) => {
    setSelectedReviewer(stats);
    startTransition(async () => {
      const [comments, files] = await Promise.all([
        getReviewerComments(repoId, stats.reviewer),
        getReviewerFileStats(repoId, stats.reviewer),
      ]);
      setReviewerComments(comments);
      setFileStats(files);
    });
  };

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
          <ReviewerCard key={stats.reviewer} stats={stats} onClick={() => handleReviewerClick(stats)} />
        ))}
      </div>

      <Sheet open={!!selectedReviewer} onOpenChange={(open) => !open && setSelectedReviewer(null)}>
        <SheetContent side="right" className="sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{selectedReviewer?.reviewer}</SheetTitle>
          </SheetHeader>
          <SheetBody>
            {selectedReviewer && (
              <ReviewerDrawer comments={reviewerComments} fileStats={fileStats} loading={isPending} />
            )}
          </SheetBody>
        </SheetContent>
      </Sheet>
    </div>
  );
}
