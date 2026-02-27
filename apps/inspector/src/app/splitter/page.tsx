import { getConnectedRepos } from "@/lib/actions/github";
import { getLargePRs } from "@/lib/actions/prs";
import { SplitterClient } from "./splitter-client";

export default async function SplitterPage() {
  const repos = await getConnectedRepos();
  const activeRepo = repos[0] ?? null;

  const largePRs = await getLargePRs(activeRepo?.id);

  if (largePRs.length === 0) {
    return (
      <div className="flex items-center justify-center h-full p-8">
        <p className="text-muted-foreground">
          {activeRepo
            ? "No large PRs (500+ lines) found. Sync your account PRs from the dashboard."
            : "Connect a repository in Settings or sync your account PRs from the dashboard."}
        </p>
      </div>
    );
  }

  return <SplitterClient repoId={activeRepo?.id ?? null} largePRs={largePRs} />;
}
