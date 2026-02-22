import { getConnectedRepos } from "@/lib/actions/github";
import { getDashboardStats, getRecentPRs, getWeeklyPRCounts } from "@/lib/actions/prs";
import { DashboardClient } from "./dashboard-client";

export default async function DashboardPage() {
  const repos = await getConnectedRepos();
  const activeRepo = repos[0] ?? null;

  let prs: Awaited<ReturnType<typeof getRecentPRs>> = [];
  let stats: Awaited<ReturnType<typeof getDashboardStats>> = {
    totalPRs: 0,
    avgLinesChanged: 0,
    topSkillGap: null,
    splittablePRs: 0,
  };
  let sparklineData: number[] = [];

  if (activeRepo) {
    [prs, stats, sparklineData] = await Promise.all([
      getRecentPRs(activeRepo.id),
      getDashboardStats(activeRepo.id),
      getWeeklyPRCounts(activeRepo.id),
    ]);
  }

  return (
    <DashboardClient
      prs={prs}
      stats={stats}
      hasRepo={!!activeRepo}
      sparklineData={sparklineData}
      lastSyncedAt={activeRepo?.last_synced_at ?? null}
      repoId={activeRepo?.id ?? null}
    />
  );
}
