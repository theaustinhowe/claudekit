import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RepoDetailClient } from "@/components/repos/repo-detail-client";
import { getClaudeConfig, getDefaultClaudeSettings } from "@/lib/actions/claude-config";
import { getBranches, getDirectoryContents, getReadmeContent } from "@/lib/actions/code-browser";
import { getConceptsForRepo, getLinkedConceptsForRepo } from "@/lib/actions/concepts";
import { hasGitHubPat } from "@/lib/actions/env-keys";
import { getAIFilesForRepo, getFindingsForRepo } from "@/lib/actions/findings";
import { getManualFindingsForRepo } from "@/lib/actions/manual-findings";
import { getRepoById, getRepos } from "@/lib/actions/repos";

interface RepoDetailPageProps {
  params: Promise<{ repoId: string }>;
}

export async function generateMetadata({ params }: RepoDetailPageProps): Promise<Metadata> {
  const { repoId } = await params;
  const repo = await getRepoById(repoId);
  return { title: repo?.name ?? "Repository" };
}

export default async function RepoDetailPage({ params }: RepoDetailPageProps) {
  const { repoId } = await params;

  const [
    repo,
    findings,
    aiFiles,
    claudeConfig,
    defaultClaudeSettings,
    concepts,
    linkedConcepts,
    allRepos,
    manualFindings,
    codeBranches,
    codeRootDir,
    codeReadme,
    hasPatConfigured,
  ] = await Promise.all([
    getRepoById(repoId),
    getFindingsForRepo(repoId),
    getAIFilesForRepo(repoId),
    getClaudeConfig(repoId),
    getDefaultClaudeSettings(),
    getConceptsForRepo(repoId),
    getLinkedConceptsForRepo(repoId),
    getRepos(),
    getManualFindingsForRepo(repoId),
    getBranches(repoId),
    getDirectoryContents(repoId, ""),
    getReadmeContent(repoId),
    hasGitHubPat(),
  ]);

  if (!repo) {
    notFound();
  }

  return (
    <RepoDetailClient
      repo={repo}
      findings={findings}
      aiFiles={aiFiles}
      claudeConfig={claudeConfig}
      defaultClaudeSettings={defaultClaudeSettings}
      concepts={concepts}
      linkedConcepts={linkedConcepts}
      repos={allRepos.map((r) => ({ id: r.id, name: r.name, local_path: r.local_path }))}
      manualFindings={manualFindings}
      codeBranches={codeBranches}
      codeRootDir={codeRootDir}
      codeReadme={codeReadme}
      hasGitHubPat={hasPatConfigured}
    />
  );
}
