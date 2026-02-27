"use client";

import { cn } from "@claudekit/ui";
import { Badge } from "@claudekit/ui/components/badge";
import { Button } from "@claudekit/ui/components/button";
import { Card, CardContent } from "@claudekit/ui/components/card";
import { Sheet, SheetBody, SheetContent, SheetHeader, SheetTitle } from "@claudekit/ui/components/sheet";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@claudekit/ui/components/tooltip";
import {
  AlertTriangle,
  Brain,
  Clock,
  FileCode,
  GitBranch,
  GitPullRequest,
  MessageSquare,
  MessageSquareText,
  RefreshCw,
  Scissors,
  Settings,
  TrendingDown,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { syncAccountPRs } from "@/lib/actions/account";
import { getReviewerComments, getReviewerFileStats } from "@/lib/actions/reviewers";
import { SEVERITY_COLORS, SEVERITY_LABELS, SIZE_CLASSES } from "@/lib/constants";
import type { AccountStats, DashboardStats, GitHubUser, ReviewerComment, ReviewerStats } from "@/lib/types";

function Sparkline({ data }: { data: number[] }) {
  const points = data.length > 0 ? data : [0];
  const max = Math.max(...points, 1);
  const w = 80;
  const h = 28;
  const d = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${(i / Math.max(points.length - 1, 1)) * w},${h - (p / max) * h}`)
    .join(" ");
  return (
    <svg width={w} height={h} className="mt-1" aria-hidden="true">
      <defs>
        <linearGradient id="sparkGrad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="hsl(var(--gradient-start))" />
          <stop offset="100%" stopColor="hsl(var(--gradient-end))" />
        </linearGradient>
      </defs>
      <path d={d} fill="none" stroke="url(#sparkGrad)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function StatCard({ label, value, children }: { label: string; value: string | number; children?: React.ReactNode }) {
  return (
    <Card className="flex-1 min-w-[140px]">
      <CardContent className="p-5">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">{label}</p>
        <div className="flex items-end justify-between">
          <span className="text-2xl font-bold">{value}</span>
          {children}
        </div>
      </CardContent>
    </Card>
  );
}

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(diff / (1000 * 60 * 60));
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function SyncBadge({
  lastSyncedAt,
  onSync,
  syncing,
}: {
  lastSyncedAt: string | null;
  onSync?: () => void;
  syncing?: boolean;
}) {
  const isStale = lastSyncedAt ? Date.now() - new Date(lastSyncedAt).getTime() > 24 * 60 * 60 * 1000 : true;

  return (
    <div className="flex items-center gap-2">
      <Badge
        variant={isStale ? "destructive" : "secondary"}
        className={cn("text-xs gap-1", isStale && "bg-status-warning/15 text-status-warning border-status-warning/30")}
      >
        <Clock className="h-3 w-3" />
        {lastSyncedAt ? `Synced ${formatTimeAgo(lastSyncedAt)}` : "Never synced"}
      </Badge>
      {onSync && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={onSync} disabled={syncing}>
                <RefreshCw className={cn("h-3.5 w-3.5", syncing && "animate-spin")} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Sync all account PRs</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  );
}

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

interface UserReviewStats {
  totalPRsAuthored: number;
  totalPRsReviewed: number;
  totalCommentsReceived: number;
  totalCommentsGiven: number;
  topReviewers: { reviewer: string; avatar: string | null; count: number }[];
  topCommentedFiles: { filePath: string; count: number }[];
  severityDistribution: Record<string, number>;
  categoryDistribution: Record<string, number>;
  weeklyActivity: { week: string; authored: number; reviewed: number; comments: number }[];
}

interface DashboardClientProps {
  prs: { id: string }[];
  stats: DashboardStats;
  hasRepo: boolean;
  sparklineData: number[];
  lastSyncedAt: string | null;
  repoId: string | null;
  user: GitHubUser | null;
  accountStats: AccountStats | null;
  reviewerStats: ReviewerStats[];
  userStats: UserReviewStats | null;
}

export function DashboardClient({
  stats,
  hasRepo,
  sparklineData,
  lastSyncedAt,
  repoId,
  user,
  accountStats,
  reviewerStats,
  userStats,
}: DashboardClientProps) {
  const [isSyncing, startSync] = useTransition();
  const [selectedReviewer, setSelectedReviewer] = useState<ReviewerStats | null>(null);
  const [reviewerComments, setReviewerComments] = useState<ReviewerComment[]>([]);
  const [fileStats, setFileStats] = useState<{ filePath: string; count: number }[]>([]);
  const [isLoadingComments, startCommentLoad] = useTransition();
  const router = useRouter();

  const handleSync = () => {
    startSync(async () => {
      try {
        const result = await syncAccountPRs();
        router.refresh();
        toast.success("Account sync complete", {
          description: `Synced ${result.totalSynced} PRs across ${result.reposDiscovered} new repos`,
        });
      } catch (err) {
        toast.error("Sync failed", { description: err instanceof Error ? err.message : "Unknown error" });
      }
    });
  };

  const handleReviewerClick = (rs: ReviewerStats) => {
    if (!repoId) return;
    setSelectedReviewer(rs);
    startCommentLoad(async () => {
      const [comments, files] = await Promise.all([
        getReviewerComments(repoId, rs.reviewer),
        getReviewerFileStats(repoId, rs.reviewer),
      ]);
      setReviewerComments(comments);
      setFileStats(files);
    });
  };

  if (!hasRepo && !user) {
    const features = [
      {
        icon: Brain,
        title: "Skill Builder",
        description: "Analyze review comments to discover skill patterns and generate Claude SKILL.md files.",
        href: "/skills",
      },
      {
        icon: Scissors,
        title: "PR Splitter",
        description: "AI-generated plans to break down large PRs — and execute the split on GitHub.",
        href: "/splitter",
      },
      {
        icon: MessageSquareText,
        title: "Comment Resolver",
        description: "Generate and apply code fixes for review comments directly to your branch.",
        href: "/resolver",
      },
    ];

    return (
      <>
        <div className="text-center pt-8">
          <div className="h-16 w-16 rounded-2xl gradient-primary flex items-center justify-center mb-6 mx-auto">
            <span className="text-2xl font-bold text-primary-foreground">IN</span>
          </div>
          <h1 className="text-2xl font-bold mb-2">Welcome to Inspector</h1>
          <p className="text-muted-foreground max-w-md mx-auto">
            Your local-first GitHub PR analysis toolkit. Set up your GitHub PAT to auto-discover all your PRs.
          </p>
        </div>

        <Card>
          <CardContent className="p-6">
            <h2 className="text-sm font-semibold mb-4">Getting Started</h2>
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="h-6 w-6 rounded-full gradient-primary text-primary-foreground flex items-center justify-center text-xs font-bold shrink-0">
                  1
                </div>
                <div>
                  <p className="text-sm font-medium">Set your GitHub PAT</p>
                  <p className="text-xs text-muted-foreground">
                    Add <code className="font-mono bg-muted px-1 rounded">GITHUB_PERSONAL_ACCESS_TOKEN</code> to your{" "}
                    <code className="font-mono bg-muted px-1 rounded">.env.local</code> file with{" "}
                    <code className="font-mono bg-muted px-1 rounded">repo</code> scope.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="h-6 w-6 rounded-full bg-muted text-muted-foreground flex items-center justify-center text-xs font-bold shrink-0">
                  2
                </div>
                <div>
                  <p className="text-sm font-medium">Auto-discover PRs</p>
                  <p className="text-xs text-muted-foreground">
                    Inspector will automatically find PRs you authored, reviewed, or are assigned across all repos.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="h-6 w-6 rounded-full bg-muted text-muted-foreground flex items-center justify-center text-xs font-bold shrink-0">
                  3
                </div>
                <div>
                  <p className="text-sm font-medium">Explore your insights</p>
                  <p className="text-xs text-muted-foreground">
                    Use the tools below to analyze feedback, split large PRs, resolve comments, and build skills.
                  </p>
                </div>
              </div>
            </div>
            <Link href="/settings" className="block mt-6">
              <Button className="gradient-primary text-primary-foreground w-full">
                <Settings className="h-4 w-4 mr-2" />
                Go to Settings
              </Button>
            </Link>
          </CardContent>
        </Card>

        <div>
          <h2 className="text-sm font-semibold mb-3">What you can do</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {features.map((f) => (
              <Card key={f.title}>
                <CardContent className="p-4 flex items-start gap-3">
                  <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <f.icon className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <h3 className="text-sm font-medium mb-0.5">{f.title}</h3>
                    <p className="text-xs text-muted-foreground">{f.description}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          {user?.avatarUrl && (
            // biome-ignore lint/performance/noImgElement: external avatar URL
            <img src={user.avatarUrl} alt={user.login} className="h-10 w-10 rounded-full" />
          )}
          <div>
            <h1 className="text-2xl font-bold mb-0.5">{user ? `Welcome, ${user.name || user.login}` : "Dashboard"}</h1>
            <p className="text-sm text-muted-foreground">
              {accountStats
                ? `${accountStats.totalPRs} PRs across ${accountStats.totalRepos} repos`
                : "Overview of recent PR activity and insights"}
            </p>
          </div>
        </div>
        <SyncBadge lastSyncedAt={lastSyncedAt} onSync={handleSync} syncing={isSyncing} />
      </div>

      {/* Summary stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard label="Total PRs" value={stats.totalPRs}>
          <Sparkline data={sparklineData} />
        </StatCard>
        <StatCard label="Avg PR Size" value={stats.avgLinesChanged ? `${stats.avgLinesChanged} lines` : "--"}>
          {stats.avgLinesChanged > 0 && (
            <div className="flex items-center gap-1 text-xs text-status-success">
              <TrendingDown className="h-3.5 w-3.5" />
            </div>
          )}
        </StatCard>
        <StatCard label="Top Skill Gap" value="">
          {stats.topSkillGap ? (
            <Link href="/skills">
              <Button variant="secondary" size="sm" className="text-xs">
                <AlertTriangle className="h-3 w-3 mr-1 text-status-warning" />
                {stats.topSkillGap}
              </Button>
            </Link>
          ) : (
            <span className="text-xs text-muted-foreground">Run analysis first</span>
          )}
        </StatCard>
        <StatCard label="Splittable PRs" value={stats.splittablePRs}>
          {stats.splittablePRs > 0 && (
            <Badge className="gradient-primary text-primary-foreground text-xs">{stats.splittablePRs} ready</Badge>
          )}
        </StatCard>
      </div>

      {/* Account activity cards */}
      {accountStats && (
        <div className="grid grid-cols-3 gap-3">
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <GitPullRequest className="h-5 w-5 text-primary" />
              <div>
                <p className="text-lg font-bold">{accountStats.prsAuthored}</p>
                <p className="text-xs text-muted-foreground">Authored</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <Users className="h-5 w-5 text-primary" />
              <div>
                <p className="text-lg font-bold">{accountStats.prsReviewed}</p>
                <p className="text-xs text-muted-foreground">Reviewed</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <MessageSquareText className="h-5 w-5 text-primary" />
              <div>
                <p className="text-lg font-bold">{accountStats.totalComments}</p>
                <p className="text-xs text-muted-foreground">Comments</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Severity & Category Distribution */}
      {userStats && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Object.keys(userStats.severityDistribution).length > 0 && (
            <Card>
              <CardContent className="p-4">
                <h3 className="text-sm font-semibold mb-3">Severity Distribution</h3>
                <div className="space-y-2">
                  {Object.entries(userStats.severityDistribution)
                    .filter(([k]) => k !== "unknown")
                    .sort(([, a], [, b]) => b - a)
                    .map(([severity, count]) => {
                      const total = Object.values(userStats.severityDistribution).reduce((a, b) => a + b, 0);
                      return (
                        <div key={severity} className="space-y-1">
                          <div className="flex justify-between text-xs">
                            <span className="capitalize">{SEVERITY_LABELS[severity] || severity}</span>
                            <span className="text-muted-foreground">{count}</span>
                          </div>
                          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                            <div
                              className={cn("h-full rounded-full", SEVERITY_COLORS[severity] || "bg-muted-foreground")}
                              style={{ width: `${(count / Math.max(total, 1)) * 100}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                </div>
              </CardContent>
            </Card>
          )}

          {Object.keys(userStats.categoryDistribution).length > 0 && (
            <Card>
              <CardContent className="p-4">
                <h3 className="text-sm font-semibold mb-3">Feedback Categories</h3>
                <div className="space-y-2">
                  {Object.entries(userStats.categoryDistribution)
                    .sort(([, a], [, b]) => b - a)
                    .slice(0, 8)
                    .map(([category, count]) => {
                      const total = Object.values(userStats.categoryDistribution).reduce((a, b) => a + b, 0);
                      return (
                        <div key={category} className="space-y-1">
                          <div className="flex justify-between text-xs">
                            <span>{category}</span>
                            <span className="text-muted-foreground">{count}</span>
                          </div>
                          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full gradient-primary"
                              style={{ width: `${(count / Math.max(total, 1)) * 100}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Top Reviewers */}
      {userStats && userStats.topReviewers.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold mb-3">Top Reviewers (Who Reviews Your PRs)</h3>
            <div className="space-y-2">
              {userStats.topReviewers.map((r) => (
                <div key={r.reviewer} className="flex items-center gap-2">
                  {r.avatar ? (
                    // biome-ignore lint/performance/noImgElement: external avatar URL
                    <img src={r.avatar} alt={r.reviewer} className="h-6 w-6 rounded-full" />
                  ) : (
                    <div className="h-6 w-6 rounded-full bg-secondary flex items-center justify-center text-[9px] font-bold">
                      {r.reviewer.slice(0, 2).toUpperCase()}
                    </div>
                  )}
                  <span className="text-sm flex-1">{r.reviewer}</span>
                  <span className="text-xs text-muted-foreground">{r.count} comments</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* File Hotspots */}
      {userStats && userStats.topCommentedFiles.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-1.5">
              <FileCode className="h-4 w-4" /> Most Commented Files
            </h3>
            <div className="space-y-1.5">
              {userStats.topCommentedFiles.map(({ filePath, count }) => (
                <div key={filePath} className="flex items-center justify-between text-xs">
                  <code className="font-mono text-[11px] text-muted-foreground truncate max-w-[80%]">{filePath}</code>
                  <span className="text-muted-foreground tabular-nums">{Number(count)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Reviewer Detail Cards */}
      {reviewerStats.length > 0 && (
        <>
          <h2 className="text-lg font-semibold">Reviewer Details</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {reviewerStats.map((rs) => (
              <ReviewerCard key={rs.reviewer} stats={rs} onClick={() => handleReviewerClick(rs)} />
            ))}
          </div>
        </>
      )}

      {/* Reviewer Drawer */}
      <Sheet open={!!selectedReviewer} onOpenChange={(open) => !open && setSelectedReviewer(null)}>
        <SheetContent side="right" className="sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{selectedReviewer?.reviewer}</SheetTitle>
          </SheetHeader>
          <SheetBody>
            {selectedReviewer && (
              <ReviewerDrawer comments={reviewerComments} fileStats={fileStats} loading={isLoadingComments} />
            )}
          </SheetBody>
        </SheetContent>
      </Sheet>
    </>
  );
}
