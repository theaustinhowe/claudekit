"use client";

import { cn } from "@claudekit/ui";
import { Badge } from "@claudekit/ui/components/badge";
import { Button } from "@claudekit/ui/components/button";
import { Card, CardContent } from "@claudekit/ui/components/card";
import { Input } from "@claudekit/ui/components/input";
import {
  AlertTriangle,
  Brain,
  Clock,
  Eye,
  GitBranch,
  MessageSquareText,
  RefreshCw,
  Scissors,
  Search,
  Settings,
  TrendingDown,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { syncAllCommentsForRepo, syncPRs } from "@/lib/actions/github";
import { SIZE_CLASSES, STATUS_COLORS } from "@/lib/constants";
import type { DashboardStats, PRSize, PRWithComments } from "@/lib/types";

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
  const _linesChanged = pr.linesAdded + pr.linesDeleted;
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
            <span className="font-medium text-sm truncate">{pr.title}</span>
            <span className="text-xs text-muted-foreground shrink-0">#{pr.number}</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{pr.author}</span>
            <span className="hidden sm:inline">&middot;</span>
            {pr.branch && <code className="font-mono text-[11px] hidden sm:inline">{pr.branch}</code>}
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
  repoId,
  externalSyncing,
}: {
  lastSyncedAt: string | null;
  repoId?: string;
  externalSyncing?: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const syncing = isPending || !!externalSyncing;

  const isStale = lastSyncedAt ? Date.now() - new Date(lastSyncedAt).getTime() > 24 * 60 * 60 * 1000 : true;

  const handleResync = () => {
    if (!repoId) return;
    startTransition(async () => {
      try {
        await syncPRs(repoId);
        await syncAllCommentsForRepo(repoId);
        router.refresh();
        toast.success("Sync complete");
      } catch (err) {
        toast.error("Sync failed", { description: err instanceof Error ? err.message : "Unknown error" });
      }
    });
  };

  return (
    <div className="flex items-center gap-2">
      <Badge
        variant={isStale ? "destructive" : "secondary"}
        className={cn("text-xs gap-1", isStale && "bg-status-warning/15 text-status-warning border-status-warning/30")}
      >
        <Clock className="h-3 w-3" />
        {lastSyncedAt ? `Synced ${formatTimeAgo(lastSyncedAt)}` : "Never synced"}
      </Badge>
      {repoId && (
        <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={handleResync} disabled={syncing}>
          <RefreshCw className={cn("h-3.5 w-3.5", syncing && "animate-spin")} />
        </Button>
      )}
    </div>
  );
}

const SIZE_OPTIONS: PRSize[] = ["S", "M", "L", "XL"];
const STATUS_OPTIONS = ["Approved", "Changes Requested", "Pending", "Merged", "Draft"];

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

  const hasFilters = search || sizeFilter.size > 0 || statusFilter.size > 0;

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

  const clearFilters = () => {
    setSearch("");
    setSizeFilter(new Set());
    setStatusFilter(new Set());
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
          pr.branch?.toLowerCase().includes(q),
      );
    }
    if (sizeFilter.size > 0) {
      result = result.filter((pr) => sizeFilter.has(pr.size));
    }
    if (statusFilter.size > 0) {
      result = result.filter((pr) => pr.reviewStatus && statusFilter.has(pr.reviewStatus));
    }
    return result;
  }, [prs, search, sizeFilter, statusFilter]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Recent Pull Requests</h2>
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
            placeholder="Search by title, author, number, or branch..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        <span className="text-xs text-muted-foreground self-center mr-1">Size:</span>
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
              No PRs found. Sync your repository from Settings to get started.
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
}

export function DashboardClient({ prs, stats, hasRepo, sparklineData, lastSyncedAt, repoId }: DashboardClientProps) {
  const [isSyncing, startSync] = useTransition();
  const router = useRouter();
  const autoSyncTriggered = useRef(false);

  // Auto-sync if data is stale (>24hrs) on page load
  useEffect(() => {
    if (!repoId || autoSyncTriggered.current) return;
    const isStale = lastSyncedAt ? Date.now() - new Date(lastSyncedAt).getTime() > 24 * 60 * 60 * 1000 : true;
    if (!isStale) return;

    autoSyncTriggered.current = true;
    startSync(async () => {
      try {
        await syncPRs(repoId);
        await syncAllCommentsForRepo(repoId);
        router.refresh();
        toast.success("Auto-sync complete", { description: "Repository data has been refreshed" });
      } catch {
        // Silent fail for auto-sync — user can manually retry
      }
    });
  }, [repoId, lastSyncedAt, router]);

  if (!hasRepo) {
    const features = [
      {
        icon: Brain,
        title: "Skill Builder",
        description: "Analyze review comments to discover skill patterns and track growth areas over time.",
        href: "/skills",
      },
      {
        icon: Scissors,
        title: "PR Splitter",
        description: "AI-generated plans to break down large PRs into smaller, reviewable chunks.",
        href: "/splitter",
      },
      {
        icon: MessageSquareText,
        title: "Comment Resolver",
        description: "Generate code fixes for review comments with AI-powered diff suggestions.",
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
            Your local-first GitHub PR analysis toolkit. Connect a repository to get started.
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
                  <p className="text-sm font-medium">Connect a repository</p>
                  <p className="text-xs text-muted-foreground">
                    Go to Settings and add a GitHub repository using your personal access token.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="h-6 w-6 rounded-full bg-muted text-muted-foreground flex items-center justify-center text-xs font-bold shrink-0">
                  2
                </div>
                <div>
                  <p className="text-sm font-medium">Sync pull requests</p>
                  <p className="text-xs text-muted-foreground">
                    Inspector will automatically fetch your PRs and review comments from GitHub.
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
                    Use the tools below to analyze feedback, split large PRs, and resolve comments.
                  </p>
                </div>
              </div>
            </div>
            <Link href="/settings" className="block mt-6">
              <Button className="gradient-primary text-primary-foreground w-full">
                <Settings className="h-4 w-4 mr-2" />
                Add Repository
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
        <div>
          <h1 className="text-2xl font-bold mb-1">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Overview of recent PR activity and insights</p>
        </div>
        <SyncBadge lastSyncedAt={lastSyncedAt} repoId={repoId ?? undefined} externalSyncing={isSyncing} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard label="PRs Analyzed" value={stats.totalPRs}>
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

      <PRList prs={prs} />
    </div>
  );
}
