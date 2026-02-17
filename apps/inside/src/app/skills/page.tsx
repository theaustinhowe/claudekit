import { getConnectedRepos } from "@/lib/actions/github";
import { getPRsWithComments } from "@/lib/actions/prs";
import { getSkillAnalyses, getSkillsForAnalysis } from "@/lib/actions/skills";
import { SkillsClient } from "./skills-client";

export default async function SkillsPage() {
  const repos = await getConnectedRepos();
  const activeRepo = repos[0] ?? null;

  if (!activeRepo) {
    return (
      <div className="flex items-center justify-center h-full p-8">
        <p className="text-muted-foreground">Connect a repository in Settings to get started.</p>
      </div>
    );
  }

  const [prsWithComments, analyses] = await Promise.all([
    getPRsWithComments(activeRepo.id),
    getSkillAnalyses(activeRepo.id),
  ]);

  // Load latest analysis results if any
  let previousSkills: Awaited<ReturnType<typeof getSkillsForAnalysis>> = [];
  if (analyses.length > 0) {
    previousSkills = await getSkillsForAnalysis(analyses[0].id);
  }

  return <SkillsClient repoId={activeRepo.id} prsWithComments={prsWithComments} previousSkills={previousSkills} />;
}
