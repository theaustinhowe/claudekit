import { getConnectedRepos } from "@/lib/actions/github";
import { getLargePRs } from "@/lib/actions/prs";
import { SplitterClient } from "./splitter-client";

export default async function SplitterPage() {
  const repos = await getConnectedRepos();
  const activeRepo = repos[0] ?? null;

  if (!activeRepo) {
    return (
      <div className="flex items-center justify-center h-full p-8">
        <p className="text-muted-foreground">Connect a repository in Settings to get started.</p>
      </div>
    );
  }

  const largePRs = await getLargePRs(activeRepo.id);

  return <SplitterClient repoId={activeRepo.id} largePRs={largePRs} />;
}
