import { getAccountPRs, getAccountStats, getAuthenticatedUser, hasValidPAT } from "@/lib/actions/account";
import { getConnectedRepos } from "@/lib/actions/github";
import { getWeeklyPRCounts } from "@/lib/actions/prs";
import { getReviewerStats, getUserReviewStats } from "@/lib/actions/reviewers";
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
        reviewerStats={[]}
        userStats={null}
      />
    );
  }

  const [user, accountPRs, accountStats, sparklineData, repos] = await Promise.all([
    getAuthenticatedUser(),
    getAccountPRs({ limit: 100 }),
    getAccountStats(),
    getWeeklyPRCounts(),
    getConnectedRepos(),
  ]);

  const activeRepo = repos[0] ?? null;
  const lastSyncedAt = repos.reduce<string | null>((latest, repo) => {
    if (!repo.last_synced_at) return latest;
    if (!latest) return repo.last_synced_at;
    return new Date(repo.last_synced_at) > new Date(latest) ? repo.last_synced_at : latest;
  }, null);

  const [reviewerStats, userStats] = await Promise.all([
    activeRepo ? getReviewerStats(activeRepo.id) : Promise.resolve([]),
    getUserReviewStats(activeRepo?.id),
  ]);

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
      repoId={activeRepo?.id ?? null}
      user={user}
      accountStats={accountStats}
      reviewerStats={reviewerStats}
      userStats={userStats}
    />
  );
}
