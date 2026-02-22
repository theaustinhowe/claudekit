import { getConnectedRepos } from "@/lib/actions/github";
import { getReviewerStats } from "@/lib/actions/reviewers";
import { InsightsClient } from "./insights-client";

export default async function InsightsPage() {
  const repos = await getConnectedRepos();
  const activeRepo = repos[0] ?? null;

  if (!activeRepo) {
    return (
      <div className="flex items-center justify-center h-full p-8">
        <p className="text-muted-foreground">Connect a repository in Settings to get started.</p>
      </div>
    );
  }

  const reviewerStats = await getReviewerStats(activeRepo.id);

  return <InsightsClient repoId={activeRepo.id} reviewerStats={reviewerStats} />;
}
