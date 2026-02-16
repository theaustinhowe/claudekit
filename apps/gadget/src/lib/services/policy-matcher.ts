import type { Policy, RepoType } from "@/lib/types";

interface MatchableRepo {
  repo_type: RepoType | string | null;
  is_monorepo: boolean;
}

/**
 * Match a repo to its best-fitting policy based on repo_type and is_monorepo.
 *
 * Priority:
 * 1. Monorepo match (if repo.is_monorepo, find policy with "monorepo" in repo_types)
 * 2. Exact repo_type match
 * 3. Fallback policy (by ID or first available)
 */
export function matchPolicy(repo: MatchableRepo, policies: Policy[], fallbackPolicyId?: string): Policy | undefined {
  if (policies.length === 0) return undefined;

  // 1. Monorepo match takes priority
  if (repo.is_monorepo) {
    const monorepoPolicy = policies.find((p) => p.repo_types.includes("monorepo"));
    if (monorepoPolicy) return monorepoPolicy;
  }

  // 2. Exact repo_type match
  if (repo.repo_type) {
    const typeMatch = policies.find((p) => p.repo_types.includes(repo.repo_type as RepoType));
    if (typeMatch) return typeMatch;
  }

  // 3. Fallback
  if (fallbackPolicyId) {
    const fallback = policies.find((p) => p.id === fallbackPolicyId);
    if (fallback) return fallback;
  }

  return policies[0];
}
