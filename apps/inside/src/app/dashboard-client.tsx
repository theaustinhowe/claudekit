"use client";

import { cn } from "@devkit/ui";
import { Badge } from "@devkit/ui/components/badge";
import { Button } from "@devkit/ui/components/button";
import { Card, CardContent } from "@devkit/ui/components/card";
import { AlertTriangle, Brain, GitBranch, Settings, TrendingDown } from "lucide-react";
import Link from "next/link";
import { SIZE_CLASSES, STATUS_COLORS } from "@/lib/constants";
import type { DashboardStats, PRWithComments } from "@/lib/types";

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

interface DashboardClientProps {
  prs: PRWithComments[];
  stats: DashboardStats;
  hasRepo: boolean;
  sparklineData: number[];
}

export function DashboardClient({ prs, stats, hasRepo, sparklineData }: DashboardClientProps) {
  if (!hasRepo) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center">
        <div className="h-16 w-16 rounded-2xl gradient-primary flex items-center justify-center mb-6">
          <span className="text-2xl font-bold text-primary-foreground">IN</span>
        </div>
        <h1 className="text-2xl font-bold mb-2">Welcome to Inside</h1>
        <p className="text-muted-foreground mb-6 max-w-md">
          Connect a GitHub repository to start analyzing pull requests, building skills, and splitting large PRs.
        </p>
        <Link href="/settings">
          <Button className="gradient-primary text-primary-foreground">
            <Settings className="h-4 w-4 mr-2" />
            Add Repository
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-[1200px] mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold mb-1">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Overview of recent PR activity and insights</p>
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

      <div>
        <h2 className="text-lg font-semibold mb-3">Recent Pull Requests</h2>
        <Card>
          <CardContent className="p-2">
            {prs.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground text-sm">
                No PRs found. Sync your repository from Settings to get started.
              </div>
            ) : (
              prs.map((pr) => <PRRow key={pr.id} pr={pr} />)
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
