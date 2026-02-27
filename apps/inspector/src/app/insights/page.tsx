import { hasValidPAT } from "@/lib/actions/account";
import { getConnectedRepos } from "@/lib/actions/github";
import { getReviewerStats, getUserReviewStats } from "@/lib/actions/reviewers";
import { InsightsClient } from "./insights-client";

export default async function InsightsPage() {
  const hasPAT = await hasValidPAT();
  if (!hasPAT) {
    return (
      <div className="flex items-center justify-center h-full p-8">
        <p className="text-muted-foreground">Set up your GitHub PAT in Settings to get started.</p>
      </div>
    );
  }

  const repos = await getConnectedRepos();
  const activeRepo = repos[0] ?? null;

  const [reviewerStats, userStats] = await Promise.all([
    activeRepo ? getReviewerStats(activeRepo.id) : Promise.resolve([]),
    getUserReviewStats(activeRepo?.id),
  ]);

  return <InsightsClient repoId={activeRepo?.id ?? null} reviewerStats={reviewerStats} userStats={userStats} />;
}
