"use client";

import { Badge } from "@devkit/ui/components/badge";
import { Button } from "@devkit/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@devkit/ui/components/card";
import {
  Activity,
  ArrowRight,
  Bot,
  Brush,
  CheckCircle,
  Clock,
  Eye,
  FolderGit2,
  Hammer,
  MessageSquare,
  Play,
  ScanSearch,
  ScrollText,
  ShieldCheck,
  Sparkles,
  Terminal,
  Wrench,
  Zap,
} from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { SessionBadge } from "@/components/sessions/session-badge";
import { SESSION_TYPE_LABELS } from "@/lib/constants";
import type { AttentionRepo, DashboardStats, OnboardingState, SessionRow } from "@/lib/types";
import { formatNumber, timeAgo } from "@/lib/utils";

type DashboardState = "empty" | "configured" | "active" | "active-clean";

interface DashboardClientProps {
  stats: DashboardStats;
  onboardingState: OnboardingState;
  attentionRepos: AttentionRepo[];
  recentSessions: SessionRow[];
}

function determineDashboardState(stats: DashboardStats, onboarding: OnboardingState): DashboardState {
  if (!onboarding.hasScanRoots && stats.reposAudited === 0) return "empty";
  if (stats.reposAudited === 0) return "configured";
  if (stats.criticalFindings > 0 || stats.warningFindings > 0 || stats.staleRepoCount > 0) return "active";
  return "active-clean";
}

export function DashboardClient({ stats, onboardingState, attentionRepos, recentSessions }: DashboardClientProps) {
  const state = determineDashboardState(stats, onboardingState);

  if (state === "empty" || state === "configured") {
    return (
      <div className="flex-1">
        <div className="p-4 sm:p-6 space-y-6 max-w-3xl mx-auto">
          <GettingStartedChecklist onboarding={onboardingState} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1">
      <div className="p-4 sm:p-6 flex flex-col gap-5 max-w-7xl mx-auto">
        {/* Workspace Pulse */}
        <div className="shrink-0">
          <WorkspacePulse stats={stats} isClean={state === "active-clean"} />
        </div>

        {/* Two-column layout: Needs Attention + Recent Sessions */}
        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-5 gap-5">
          <div className="lg:col-span-3 min-h-0">
            {state === "active-clean" ? (
              <WorkspaceHealth stats={stats} />
            ) : (
              <NeedsAttentionList repos={attentionRepos} />
            )}
          </div>
          <div className="lg:col-span-2 min-h-0">
            <RecentSessionsFeed sessions={recentSessions} />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Getting Started Checklist ──────────────────────────────────── */

function GettingStartedChecklist({ onboarding }: { onboarding: OnboardingState }) {
  const steps = [
    {
      step: "Configure scan directories",
      href: "/settings",
      done: onboarding.hasScanRoots,
    },
    {
      step: "Run your first scan",
      href: "/scans/new",
      done: onboarding.hasCompletedScan,
    },
    {
      step: "Review findings & apply fixes",
      href: "/repositories",
      done: onboarding.hasAppliedFix,
    },
  ];

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Getting Started</CardTitle>
          <p className="text-sm text-muted-foreground">Set up your workspace in three steps.</p>
        </CardHeader>
        <CardContent className="space-y-1">
          {steps.map((item) => (
            <Link key={item.step} href={item.href}>
              <div className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer">
                <div
                  className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 ${
                    item.done ? "border-success bg-success/10" : "border-muted-foreground/30"
                  }`}
                >
                  {item.done && <CheckCircle className="w-4 h-4 text-success" />}
                </div>
                <span className={`text-sm font-medium ${item.done ? "line-through text-muted-foreground" : ""}`}>
                  {item.step}
                </span>
                <ArrowRight className="w-4 h-4 ml-auto text-muted-foreground" />
              </div>
            </Link>
          ))}
        </CardContent>
      </Card>

      <div className="mt-4 text-center">
        <Link
          href="/projects"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1.5"
        >
          <Sparkles className="w-4 h-4" />
          Or, generate a new project
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    </motion.div>
  );
}

/* ─── Needs Attention List ───────────────────────────────────────── */

function getRepoAction(repo: AttentionRepo): {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
} {
  if (repo.is_stale) return { label: "Scan", icon: Play };
  if (repo.critical_count > 0 || repo.warning_count > 0) return { label: "Review", icon: Eye };
  return { label: "View", icon: ArrowRight };
}

function NeedsAttentionList({ repos }: { repos: AttentionRepo[] }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
      className="h-full min-h-0"
    >
      <Card className="h-full flex flex-col">
        <CardHeader className="pb-3 shrink-0">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Needs Attention</CardTitle>
            <Link href="/repositories">
              <Button variant="ghost" size="sm">
                View all repos
                <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent className="flex-1 min-h-0 overflow-y-auto">
          {repos.length === 0 ? (
            <div className="flex items-center gap-3 py-6 justify-center text-muted-foreground">
              <ShieldCheck className="w-5 h-5 text-success" />
              <p className="text-sm">No repos need attention. Nice work.</p>
            </div>
          ) : (
            <div className="space-y-1">
              {repos.map((repo) => {
                const action = getRepoAction(repo);
                return (
                  <Link key={repo.id} href={`/repositories/${repo.id}`}>
                    <div className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer group">
                      <FolderGit2 className="w-5 h-5 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{repo.name}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {repo.critical_count > 0 && (
                          <Badge variant="destructive" className="text-xs tabular-nums">
                            {formatNumber(repo.critical_count)} critical
                          </Badge>
                        )}
                        {repo.warning_count > 0 && repo.critical_count === 0 && (
                          <Badge
                            variant="secondary"
                            className="text-xs bg-warning/10 text-warning border-warning/20 tabular-nums"
                          >
                            {formatNumber(repo.warning_count)} warning
                            {repo.warning_count !== 1 ? "s" : ""}
                          </Badge>
                        )}
                        {repo.is_stale && (
                          <Badge variant="outline" className="text-xs text-muted-foreground">
                            {repo.last_scanned_at ? timeAgo(repo.last_scanned_at) : "Not scanned"}
                          </Badge>
                        )}
                        {!repo.is_stale && repo.last_scanned_at && (
                          <span className="text-xs text-muted-foreground hidden sm:inline">
                            {timeAgo(repo.last_scanned_at)}
                          </span>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <action.icon className="w-3.5 h-3.5 mr-1" />
                          {action.label}
                        </Button>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

/* ─── Workspace Health (active-clean state) ──────────────────────── */

function WorkspaceHealth({ stats }: { stats: DashboardStats }) {
  const scanAge = stats.lastScanCompletedAt ? timeAgo(stats.lastScanCompletedAt) : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
      className="h-full"
    >
      <Card className="h-full">
        <CardContent className="flex flex-col items-center justify-center py-10 text-center gap-4">
          <div className="w-12 h-12 rounded-full bg-success/10 flex items-center justify-center">
            <ShieldCheck className="w-6 h-6 text-success" />
          </div>
          <div>
            <p className="text-lg font-semibold">
              All {formatNumber(stats.reposAudited)} repo
              {stats.reposAudited !== 1 ? "s" : ""} clean
            </p>
            {scanAge && <p className="text-sm text-muted-foreground mt-1">Last scan: {scanAge}</p>}
          </div>
          <Link href="/scans/new">
            <Button variant="outline" size="sm" className="gap-2">
              <Play className="w-4 h-4" />
              Re-scan
            </Button>
          </Link>
        </CardContent>
      </Card>
    </motion.div>
  );
}

/* ─── Recent Sessions Feed ───────────────────────────────────────── */

const sessionTypeIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  scan: ScanSearch,
  quick_improve: Sparkles,
  finding_fix: Wrench,
  chat: MessageSquare,
  scaffold: Hammer,
  upgrade: Zap,
  auto_fix: Bot,
  fix_apply: Hammer,
  upgrade_init: Zap,
  ai_file_gen: Sparkles,
  cleanup: Brush,
  toolbox_command: Terminal,
};

/** Map session types to the relevant page link */
function getSessionLink(session: SessionRow): string | null {
  if (!session.context_type || !session.context_id) return null;
  const base =
    session.context_type === "repo"
      ? `/repositories/${session.context_id}`
      : session.context_type === "project"
        ? `/projects/${session.context_id}`
        : null;
  return base;
}

function SessionFeedItem({ session }: { session: SessionRow }) {
  const Icon = sessionTypeIcons[session.session_type] || Activity;
  const typeLabel = SESSION_TYPE_LABELS[session.session_type] ?? session.session_type;
  const link = getSessionLink(session);
  const timestamp = session.completed_at ?? session.started_at ?? session.created_at;

  const inner = (
    <div
      className={`flex items-start gap-3 p-2.5 rounded-lg transition-colors ${link ? "hover:bg-muted/50 cursor-pointer" : ""}`}
    >
      <div className="mt-0.5 shrink-0">
        <Icon className="w-4 h-4 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm truncate">{session.label}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[11px] text-muted-foreground">{typeLabel}</span>
          {session.context_name && (
            <>
              <span className="text-[11px] text-muted-foreground/50">&middot;</span>
              <span className="text-[11px] text-muted-foreground truncate">{session.context_name}</span>
            </>
          )}
          <span className="text-[11px] text-muted-foreground/50">&middot;</span>
          <span className="text-[11px] text-muted-foreground">{timeAgo(timestamp)}</span>
        </div>
      </div>
      <div className="shrink-0 mt-0.5">
        <SessionBadge status={session.status} />
      </div>
    </div>
  );

  return link ? <Link href={link}>{inner}</Link> : inner;
}

function RecentSessionsFeed({ sessions }: { sessions: SessionRow[] }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15 }}
      className="h-full min-h-0"
    >
      <Card className="h-full flex flex-col">
        <CardHeader className="pb-3 shrink-0">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Recent Sessions</CardTitle>
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Activity className="w-4 h-4" />
              <span className="text-xs">
                {sessions.filter((s) => s.status === "running" || s.status === "pending").length} active
              </span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex-1 min-h-0 overflow-y-auto">
          {sessions.length === 0 ? (
            <div className="flex items-center gap-3 py-6 justify-center text-muted-foreground">
              <Clock className="w-5 h-5" />
              <p className="text-sm">No sessions yet.</p>
            </div>
          ) : (
            <div className="space-y-1">
              {sessions.map((session) => (
                <SessionFeedItem key={session.id} session={session} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

/* ─── Workspace Pulse ────────────────────────────────────────────── */

function WorkspacePulse({ stats, isClean }: { stats: DashboardStats; isClean: boolean }) {
  const lastScanAge = stats.lastScanCompletedAt
    ? Math.floor((Date.now() - new Date(stats.lastScanCompletedAt).getTime()) / (1000 * 60 * 60 * 24))
    : null;
  const scanAgeLabel = stats.lastScanCompletedAt ? timeAgo(stats.lastScanCompletedAt) : "Never";
  const scanAgeWarn = lastScanAge === null || lastScanAge > 7;

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
      <Card>
        <CardContent className="p-3 sm:p-4">
          <div className="flex items-center gap-4 sm:gap-6 flex-wrap text-sm">
            <Link
              href="/repositories"
              className="flex items-center gap-2 hover:text-foreground text-muted-foreground transition-colors"
            >
              <FolderGit2 className="w-4 h-4" />
              <span className="font-medium tabular-nums">{formatNumber(stats.reposAudited)}</span>
              <span className="text-xs">repos</span>
            </Link>

            <Link
              href="/ai-integrations"
              className="flex items-center gap-2 hover:text-foreground text-muted-foreground transition-colors"
            >
              <ScrollText className="w-4 h-4" />
              <span className="font-medium tabular-nums">{formatNumber(stats.conceptCount)}</span>
              <span className="text-xs">concepts</span>
              {stats.staleSources > 0 && (
                <span
                  className="w-2 h-2 rounded-full bg-warning"
                  title={`${formatNumber(stats.staleSources)} stale source${stats.staleSources !== 1 ? "s" : ""}`}
                />
              )}
            </Link>

            <Link
              href="/policies"
              className="flex items-center gap-2 hover:text-foreground text-muted-foreground transition-colors"
            >
              <ShieldCheck className="w-4 h-4" />
              <span className="font-medium tabular-nums">{formatNumber(stats.policyCount)}</span>
              <span className="text-xs">policies</span>
            </Link>

            <Link
              href="/scans/new"
              className={`flex items-center gap-2 hover:text-foreground transition-colors ${scanAgeWarn ? "text-warning" : "text-muted-foreground"}`}
            >
              <Clock className="w-4 h-4" />
              <span className="text-xs">Last scan: {scanAgeLabel}</span>
            </Link>

            <div className="flex items-center gap-2 ml-auto">
              <Link href="/scans/new">
                <Button variant="default" size="sm" className="gap-1.5 h-7 text-xs">
                  <Play className="w-3.5 h-3.5" />
                  {isClean ? "Run a fresh scan" : "Run a scan"}
                </Button>
              </Link>
              <Link href="/projects">
                <Button variant="outline" size="sm" className="gap-1.5 h-7 text-xs">
                  <Sparkles className="w-3.5 h-3.5" />
                  New project
                </Button>
              </Link>
              {isClean && (
                <Link href="/ai-integrations">
                  <Button variant="outline" size="sm" className="gap-1.5 h-7 text-xs">
                    <ScanSearch className="w-3.5 h-3.5" />
                    AI integrations
                  </Button>
                </Link>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
