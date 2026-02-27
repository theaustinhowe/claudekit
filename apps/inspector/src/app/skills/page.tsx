import { getAccountPRs, hasValidPAT } from "@/lib/actions/account";
import { getConnectedRepos } from "@/lib/actions/github";
import { getPRsWithComments } from "@/lib/actions/prs";
import { getSkillGroups } from "@/lib/actions/skill-groups";
import { getSkillAnalyses, getSkillsForAnalysis } from "@/lib/actions/skills";
import { SkillsClient } from "./skills-client";

export default async function SkillsPage() {
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

  // Get PRs with comments — either from account or from repo
  const prsWithComments = activeRepo
    ? await getPRsWithComments(activeRepo.id)
    : (await getAccountPRs({ limit: 50 })).filter((p) => p.commentCount > 0);

  // Load skill groups and latest analysis
  const [skillGroups, analyses] = await Promise.all([
    getSkillGroups(),
    activeRepo ? getSkillAnalyses(activeRepo.id) : Promise.resolve([]),
  ]);

  let previousSkills: Awaited<ReturnType<typeof getSkillsForAnalysis>> = [];
  if (analyses.length > 0) {
    previousSkills = await getSkillsForAnalysis(analyses[0].id);
  }

  return (
    <SkillsClient
      repoId={activeRepo?.id ?? null}
      prsWithComments={prsWithComments}
      previousSkills={previousSkills}
      skillGroups={skillGroups}
    />
  );
}
