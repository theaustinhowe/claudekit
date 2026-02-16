import type { Metadata } from "next";
import { Suspense } from "react";
import { PatternsLibraryClient } from "@/components/patterns/patterns-library-client";
import { getConceptSources } from "@/lib/actions/concept-sources";
import { getAllConcepts, getConceptStats } from "@/lib/actions/concepts";
import { getConfiguredEnvKeyNames, hasGitHubPat } from "@/lib/actions/env-keys";
import { getRepos } from "@/lib/actions/repos";

export const metadata: Metadata = { title: "AI Integrations" };

interface AIIntegrationsPageProps {
  searchParams: Promise<{ type?: string }>;
}

export default async function AIIntegrationsPage({ searchParams }: AIIntegrationsPageProps) {
  const { type } = await searchParams;
  const [concepts, stats, repos, sources, configuredKeys, hasGitPat] = await Promise.all([
    getAllConcepts(),
    getConceptStats(),
    getRepos(),
    getConceptSources(),
    getConfiguredEnvKeyNames(),
    hasGitHubPat(),
  ]);

  return (
    <Suspense>
      <PatternsLibraryClient
        concepts={concepts}
        stats={stats}
        repos={repos.map((r) => ({ id: r.id, name: r.name, local_path: r.local_path }))}
        sources={sources}
        initialType={type}
        configuredKeys={configuredKeys}
        hasGitPat={hasGitPat}
      />
    </Suspense>
  );
}
