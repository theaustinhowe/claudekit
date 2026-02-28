import { notFound } from "next/navigation";
import { getSkillGroups } from "@/lib/actions/skill-groups";
import { getAnalysisById, getSkillsForAnalysis } from "@/lib/actions/skills";
import { AnalysisDashboardClient } from "./analysis-dashboard-client";

interface AnalysisPageProps {
  params: Promise<{ analysisId: string }>;
}

export default async function AnalysisPage({ params }: AnalysisPageProps) {
  const { analysisId } = await params;
  const analysis = await getAnalysisById(analysisId);

  if (!analysis) {
    notFound();
  }

  const [skills, skillGroups] = await Promise.all([getSkillsForAnalysis(analysisId), getSkillGroups()]);

  return (
    <AnalysisDashboardClient
      analysisId={analysisId}
      repoId={analysis.repo_id}
      prNumbers={JSON.parse(analysis.pr_numbers) as number[]}
      createdAt={analysis.created_at}
      skills={skills}
      skillGroups={skillGroups}
    />
  );
}
