import { getAccountPRs, getAccountStats, getAuthenticatedUser, hasValidPAT } from "@/lib/actions/account";
import { getConnectedRepos } from "@/lib/actions/github";
import { getWeeklyPRCounts } from "@/lib/actions/prs";
import { DashboardClient } from "./dashboard-client";

export default async function DashboardPage() {
  const hasPAT = await hasValidPAT();

  if (!hasPAT) {
    return (
      <DashboardClient
        prs={[]}
        stats={{ totalPRs: 0, avgLinesChanged: 0, topSkillGap: null, splittablePRs: 0 }}
        hasRepo={false}
        sparklineData={[]}
        lastSyncedAt={null}
        repoId={null}
        user={null}
        accountStats={null}
      />
    );
  }

  const [user, accountPRs, accountStats, sparklineData] = await Promise.all([
    getAuthenticatedUser(),
    getAccountPRs({ limit: 100 }),
    getAccountStats(),
    getWeeklyPRCounts(),
  ]);

  // Find last sync time from repos
  const repos = await getConnectedRepos();
  const lastSyncedAt = repos.reduce<string | null>((latest, repo) => {
    if (!repo.last_synced_at) return latest;
    if (!latest) return repo.last_synced_at;
    return new Date(repo.last_synced_at) > new Date(latest) ? repo.last_synced_at : latest;
  }, null);

  return (
    <DashboardClient
      prs={accountPRs}
      stats={{
        totalPRs: accountStats.totalPRs,
        avgLinesChanged: accountStats.avgLinesChanged,
        topSkillGap: accountStats.topSkillGap,
        splittablePRs: accountStats.splittablePRs,
      }}
      hasRepo={accountStats.totalPRs > 0}
      sparklineData={sparklineData}
      lastSyncedAt={lastSyncedAt}
      repoId={null}
      user={user}
      accountStats={accountStats}
    />
  );
}
