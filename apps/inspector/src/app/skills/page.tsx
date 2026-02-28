import { ContentContainer } from "@/components/layout/content-container";
import { hasValidPAT } from "@/lib/actions/account";
import { getConnectedRepos } from "@/lib/actions/github";
import { getAnalysisHistory } from "@/lib/actions/skills";
import { SkillsListClient } from "./skills-list-client";

export default async function SkillsPage() {
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

  // Fetch analysis history for all repos
  const allHistory = await Promise.all(
    repos.map(async (repo) => {
      const history = await getAnalysisHistory(repo.id);
      return history.map((h) => ({ ...h, repoId: repo.id }));
    }),
  );
  const history = allHistory.flat().sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return (
    <ContentContainer>
      <SkillsListClient history={history} />
    </ContentContainer>
  );
}
