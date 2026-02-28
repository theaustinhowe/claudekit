import type { Policy } from "@/lib/types";

export {
  expandTilde,
  formatElapsed,
  formatNumber,
  generateId,
  nowTimestamp,
  parseGitHubUrl,
  removeDirectory,
  timeAgo,
} from "@claudekit/ui";

function parseField<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return value as T;
}

export function parsePolicy(row: Record<string, unknown>): Policy {
  return {
    id: row.id as string,
    name: row.name as string,
    description: (row.description ?? null) as string | null,
    expected_versions: parseField(row.expected_versions, {}),
    banned_dependencies: parseField(row.banned_dependencies, []),
    allowed_package_managers: parseField(row.allowed_package_managers, []),
    preferred_package_manager: row.preferred_package_manager as Policy["preferred_package_manager"],
    ignore_patterns: parseField(row.ignore_patterns, []),
    repo_types: parseField(row.repo_types, []),
    is_builtin: row.is_builtin as boolean,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}
