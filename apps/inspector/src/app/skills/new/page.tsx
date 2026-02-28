import { ContentContainer } from "@/components/layout/content-container";
import { hasValidPAT } from "@/lib/actions/account";
import { getConnectedRepos } from "@/lib/actions/github";
import { getPRsWithComments } from "@/lib/actions/prs";
import { NewAnalysisClient } from "./new-analysis-client";

export default async function NewAnalysisPage() {
  const hasPAT = await hasValidPAT();
  if (!hasPAT) {
    return (
      <ContentContainer>
        <div className="flex items-center justify-center h-full p-8">
          <p className="text-muted-foreground">Set up your GitHub PAT in Settings to get started.</p>
        </div>
      </ContentContainer>
    );
  }

  const repos = await getConnectedRepos();
  const prsWithComments = await getPRsWithComments();
  const activeRepo = repos[0] ?? null;

  return (
    <ContentContainer>
      <NewAnalysisClient repoId={activeRepo?.id ?? null} prsWithComments={prsWithComments} />
    </ContentContainer>
  );
}
