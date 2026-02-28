import { getConnectedRepos } from "@/lib/actions/github";
import { getLargePRs } from "@/lib/actions/prs";
import { SplitterClient } from "./splitter-client";

export default async function SplitterPage() {
  const repos = await getConnectedRepos();

  // Fetch all large PRs across repos — client filters by selected repo
  const largePRs = await getLargePRs();

  if (largePRs.length === 0 && repos.length === 0) {
    return (
      <div className="flex items-center justify-center h-full p-8">
        <p className="text-muted-foreground">
          Connect a repository in Settings or sync your account PRs from the dashboard.
        </p>
      </div>
    );
  }

  return <SplitterClient repoId={repos[0]?.id ?? null} largePRs={largePRs} />;
}
