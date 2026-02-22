import { getConnectedRepos } from "@/lib/actions/github";
import { getPRsWithComments } from "@/lib/actions/prs";
import { ResolverClient } from "./resolver-client";

export default async function ResolverPage() {
  const repos = await getConnectedRepos();
  const activeRepo = repos[0] ?? null;

  if (!activeRepo) {
    return (
      <div className="flex items-center justify-center h-full p-8">
        <p className="text-muted-foreground">Connect a repository in Settings to get started.</p>
      </div>
    );
  }

  const prsWithComments = await getPRsWithComments(activeRepo.id);

  return <ResolverClient repoId={activeRepo.id} prsWithComments={prsWithComments} />;
}
