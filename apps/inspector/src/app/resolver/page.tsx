import { getConnectedRepos } from "@/lib/actions/github";
import { getPRsWithComments } from "@/lib/actions/prs";
import { ResolverClient } from "./resolver-client";

export default async function ResolverPage() {
  const repos = await getConnectedRepos();

  if (repos.length === 0) {
    return (
      <div className="flex items-center justify-center h-full p-8">
        <p className="text-muted-foreground">Connect a repository in Settings to get started.</p>
      </div>
    );
  }

  // Fetch all PRs with comments — client filters by selected repo
  const prsWithComments = await getPRsWithComments();

  return <ResolverClient repoId={repos[0].id} prsWithComments={prsWithComments} />;
}
