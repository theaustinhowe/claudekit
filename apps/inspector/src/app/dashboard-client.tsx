"use client";

import { cn } from "@claudekit/ui";
import { Badge } from "@claudekit/ui/components/badge";
import { Button } from "@claudekit/ui/components/button";
import { Card, CardContent } from "@claudekit/ui/components/card";
import { Input } from "@claudekit/ui/components/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@claudekit/ui/components/tooltip";
import {
  AlertTriangle,
  Brain,
  Clock,
  Eye,
  GitBranch,
  GitPullRequest,
  MessageSquareText,
  RefreshCw,
  Scissors,
  Search,
  Settings,
  TrendingDown,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { syncAccountPRs } from "@/lib/actions/account";
import { SIZE_CLASSES, STATUS_COLORS } from "@/lib/constants";
import type { AccountStats, DashboardStats, GitHubUser, PRSize, PRWithComments, UserRelationship } from "@/lib/types";

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

function PRRow({ pr }: { pr: PRWithComments }) {
  const initials = pr.author
    .split(/[\s-]+/)
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="group flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 px-4 py-3 rounded-lg hover:bg-muted/50 transition-colors border-l-[3px] border-transparent hover:border-primary">
      <div className="flex items-center gap-3 min-w-0">
        {pr.authorAvatar ? (
          // biome-ignore lint/performance/noImgElement: external avatar URL
          <img src={pr.authorAvatar} alt={pr.author} className="h-8 w-8 rounded-full shrink-0" />
        ) : (
          <div className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center text-[10px] font-bold text-secondary-foreground shrink-0">
            {initials}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-0.5">
            {pr.repoFullName && (
              <Badge variant="secondary" className="text-[10px] shrink-0 font-mono">
                {pr.repoFullName}
              </Badge>
            )}
            <span className="font-medium text-sm truncate">{pr.title}</span>
            <span className="text-xs text-muted-foreground shrink-0">#{pr.number}</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{pr.author}</span>
            {pr.userRelationship && (
              <>
                <span className="hidden sm:inline">&middot;</span>
                <span className="hidden sm:inline capitalize">{pr.userRelationship}</span>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 pl-11 sm:pl-0 sm:ml-auto shrink-0 flex-wrap">
        <Badge variant="outline" className={cn("text-[10px] border shrink-0", SIZE_CLASSES[pr.size])}>
          {pr.size}
        </Badge>
        {pr.reviewStatus && (
          <Badge variant="secondary" className={cn("text-[10px] shrink-0", STATUS_COLORS[pr.reviewStatus] ?? "")}>
            {pr.reviewStatus}
          </Badge>
        )}
        {pr.commentCount > 0 && (
          <span className="text-xs text-muted-foreground shrink-0">{pr.commentCount} comments</span>
        )}
      </div>

      <div className="hidden sm:flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        {pr.htmlUrl && (
          <a href={pr.htmlUrl} target="_blank" rel="noopener noreferrer">
            <Button size="sm" variant="ghost" className="h-7 text-xs gap-1">
              <GitPullRequest className="h-3 w-3" /> View
            </Button>
          </a>
        )}
        {pr.commentCount > 0 && (
          <Link href={`/skills?pr=${pr.number}`}>
            <Button size="sm" variant="ghost" className="h-7 text-xs gap-1">
              <Brain className="h-3 w-3" /> Skills
            </Button>
          </Link>
        )}
        {(pr.size === "L" || pr.size === "XL") && (
          <Link href={`/splitter?pr=${pr.number}`}>
            <Button size="sm" variant="ghost" className="h-7 text-xs gap-1">
              <GitBranch className="h-3 w-3" /> Split
            </Button>
          </Link>
        )}
      </div>
    </div>
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

const SIZE_OPTIONS: PRSize[] = ["S", "M", "L", "XL"];
const STATUS_OPTIONS = ["Approved", "Changes Requested", "Pending", "Merged", "Draft"];
const RELATIONSHIP_OPTIONS: { label: string; value: UserRelationship }[] = [
  { label: "Authored", value: "authored" },
  { label: "Reviewed", value: "reviewed" },
  { label: "Assigned", value: "assigned" },
];

function FilterChip({
  label,
  active,
  onClick,
  className,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "px-2.5 py-1 rounded-full text-xs font-medium border transition-colors",
        active
          ? "bg-primary/15 text-primary border-primary/30"
          : "bg-muted/50 text-muted-foreground border-transparent hover:bg-muted",
        className,
      )}
    >
      {label}
    </button>
  );
}

function PRList({ prs }: { prs: PRWithComments[] }) {
  const [search, setSearch] = useState("");
  const [sizeFilter, setSizeFilter] = useState<Set<PRSize>>(new Set());
  const [statusFilter, setStatusFilter] = useState<Set<string>>(new Set());
  const [relationshipFilter, setRelationshipFilter] = useState<Set<UserRelationship>>(new Set());

  const hasFilters = search || sizeFilter.size > 0 || statusFilter.size > 0 || relationshipFilter.size > 0;

  const toggleSize = (size: PRSize) => {
    setSizeFilter((prev) => {
      const next = new Set(prev);
      next.has(size) ? next.delete(size) : next.add(size);
      return next;
    });
  };

  const toggleStatus = (status: string) => {
    setStatusFilter((prev) => {
      const next = new Set(prev);
      next.has(status) ? next.delete(status) : next.add(status);
      return next;
    });
  };

  const toggleRelationship = (rel: UserRelationship) => {
    setRelationshipFilter((prev) => {
      const next = new Set(prev);
      next.has(rel) ? next.delete(rel) : next.add(rel);
      return next;
    });
  };

  const clearFilters = () => {
    setSearch("");
    setSizeFilter(new Set());
    setStatusFilter(new Set());
    setRelationshipFilter(new Set());
  };

  const filtered = useMemo(() => {
    let result = prs;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (pr) =>
          pr.title.toLowerCase().includes(q) ||
          pr.author.toLowerCase().includes(q) ||
          String(pr.number).includes(q) ||
          pr.repoFullName?.toLowerCase().includes(q) ||
          pr.branch?.toLowerCase().includes(q),
      );
    }
    if (sizeFilter.size > 0) {
      result = result.filter((pr) => sizeFilter.has(pr.size));
    }
    if (statusFilter.size > 0) {
      result = result.filter((pr) => pr.reviewStatus && statusFilter.has(pr.reviewStatus));
    }
    if (relationshipFilter.size > 0) {
      result = result.filter((pr) => pr.userRelationship && relationshipFilter.has(pr.userRelationship));
    }
    return result;
  }, [prs, search, sizeFilter, statusFilter, relationshipFilter]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Pull Requests</h2>
        {hasFilters && (
          <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={clearFilters}>
            <X className="h-3 w-3" /> Clear filters
          </Button>
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by title, author, repo, or number..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        <span className="text-xs text-muted-foreground self-center mr-1">Role:</span>
        {RELATIONSHIP_OPTIONS.map((opt) => (
          <FilterChip
            key={opt.value}
            label={opt.label}
            active={relationshipFilter.has(opt.value)}
            onClick={() => toggleRelationship(opt.value)}
          />
        ))}
        <span className="text-xs text-muted-foreground self-center ml-2 mr-1">Size:</span>
        {SIZE_OPTIONS.map((size) => (
          <FilterChip
            key={size}
            label={size}
            active={sizeFilter.has(size)}
            onClick={() => toggleSize(size)}
            className={sizeFilter.has(size) ? SIZE_CLASSES[size] : undefined}
          />
        ))}
        <span className="text-xs text-muted-foreground self-center ml-2 mr-1">Status:</span>
        {STATUS_OPTIONS.map((status) => (
          <FilterChip
            key={status}
            label={status}
            active={statusFilter.has(status)}
            onClick={() => toggleStatus(status)}
          />
        ))}
      </div>

      <Card>
        <CardContent className="p-2">
          {prs.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">
              No PRs found. Sync your account to discover PRs across all repositories.
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">
              No PRs match your filters. Try adjusting the search or filter criteria.
            </div>
          ) : (
            <>
              {filtered.map((pr) => (
                <PRRow key={pr.id} pr={pr} />
              ))}
              {hasFilters && (
                <p className="text-xs text-muted-foreground text-center py-2">
                  Showing {filtered.length} of {prs.length} PRs
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

interface DashboardClientProps {
  prs: PRWithComments[];
  stats: DashboardStats;
  hasRepo: boolean;
  sparklineData: number[];
  lastSyncedAt: string | null;
  repoId: string | null;
  user: GitHubUser | null;
  accountStats: AccountStats | null;
}

export function DashboardClient({
  prs,
  stats,
  hasRepo,
  sparklineData,
  lastSyncedAt,
  user,
  accountStats,
}: DashboardClientProps) {
  const [isSyncing, startSync] = useTransition();
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
      {
        icon: Eye,
        title: "Reviewer Insights",
        description: "Understand reviewer patterns, severity distributions, and feedback categories.",
        href: "/insights",
      },
    ];

    return (
      <div className="p-6 max-w-[900px] mx-auto space-y-8">
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
      </div>
    );
  }

  return (
    <div className="p-6 max-w-[1200px] mx-auto space-y-6">
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

      <PRList prs={prs} />
    </div>
  );
}
