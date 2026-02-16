import { CONCEPT_DISCOVERY_PATTERNS } from "@/lib/constants";
import type { ConceptType } from "@/lib/types";
import { type DiscoveredConcept, parseFrontmatter } from "./concept-scanner";
import { getFileContent, getFileLastCommit, getRepoInfo, getRepoTree } from "./github-client";

/** Match a file path against glob-like patterns used in CONCEPT_DISCOVERY_PATTERNS */
function matchesPattern(filePath: string, pattern: string): boolean {
  // Convert glob to regex — must handle ** before * to avoid mangling
  const regex = pattern
    .replace(/\./g, "\\.")
    .replace(/\*\*/g, "{{GLOBSTAR}}")
    .replace(/\*/g, "[^/]*")
    .replace(/\{\{GLOBSTAR\}\}/g, ".*");
  return new RegExp(`^${regex}$`).test(filePath);
}

/** Extract plugin name from paths like "plugins/<name>/..." */
function extractPluginPrefix(filePath: string): string | null {
  const match = filePath.match(/^plugins\/([^/]+)\//);
  return match ? match[1] : null;
}

/** Filter tree paths to find concept-relevant files, deduplicating by path+type */
function findConceptFiles(paths: string[]): Array<{ path: string; conceptType: ConceptType; pattern: string }> {
  const matches: Array<{ path: string; conceptType: ConceptType; pattern: string }> = [];
  const seen = new Set<string>();

  for (const filePath of paths) {
    for (const [conceptType, patterns] of Object.entries(CONCEPT_DISCOVERY_PATTERNS)) {
      for (const pattern of patterns) {
        if (matchesPattern(filePath, pattern)) {
          const key = `${filePath}::${conceptType}`;
          if (!seen.has(key)) {
            seen.add(key);
            matches.push({ path: filePath, conceptType: conceptType as ConceptType, pattern });
          }
        }
      }
    }
  }

  return matches;
}

/** Parse MCP servers from .mcp.json content */
function parseMcpServers(content: string, relativePath: string): DiscoveredConcept[] {
  try {
    const json = JSON.parse(content);
    const servers = (json.mcpServers || json.servers) as Record<string, unknown> | undefined;
    if (!servers || typeof servers !== "object") return [];

    return Object.entries(servers).map(([name, config]) => ({
      concept_type: "mcp_server" as ConceptType,
      name,
      description: ((config as Record<string, unknown>)?.description as string) || `MCP Server: ${name}`,
      relative_path: `${relativePath}#${name}`,
      content: JSON.stringify(config, null, 2),
      metadata: { server_name: name, config },
    }));
  } catch {
    return [];
  }
}

/** Parse hooks from settings JSON or hooks.json content */
function parseHooks(content: string, relativePath: string): DiscoveredConcept[] {
  try {
    const json = JSON.parse(content);
    if (!json.hooks || typeof json.hooks !== "object") return [];

    return Object.entries(json.hooks as Record<string, unknown>).map(([hookName, hookConfig]) => ({
      concept_type: "hook" as ConceptType,
      name: hookName,
      description: `Hook: ${hookName}`,
      relative_path: `${relativePath}#${hookName}`,
      content: JSON.stringify(hookConfig, null, 2),
      metadata: { hook_name: hookName, source_file: relativePath, config: hookConfig },
    }));
  } catch {
    return [];
  }
}

/** Re-exported from concept-scanner — single source of truth for frontmatter parsing */

/** Parse a single markdown concept file */
function parseMarkdownConcept(content: string, relativePath: string, conceptType: ConceptType): DiscoveredConcept {
  const { frontmatter, body } = parseFrontmatter(content);
  const fileName = relativePath.split("/").pop()?.replace(/\.md$/, "") || "unknown";

  return {
    concept_type: conceptType,
    name: frontmatter.name || fileName,
    description: frontmatter.description || body.split("\n")[0] || null,
    relative_path: relativePath,
    content,
    metadata: { ...frontmatter },
  };
}

/** Parse plugin.json content */
function parsePlugin(content: string, relativePath: string): DiscoveredConcept[] {
  try {
    const json = JSON.parse(content);
    return [
      {
        concept_type: "plugin",
        name: (json.name as string) || "plugin",
        description: (json.description as string) || null,
        relative_path: relativePath,
        content: JSON.stringify(json, null, 2),
        metadata: { ...json },
      },
    ];
  } catch {
    return [];
  }
}

/** Parse marketplace.json content — each entry in plugins array becomes a plugin concept */
function parseMarketplace(content: string, relativePath: string): DiscoveredConcept[] {
  try {
    const json = JSON.parse(content);
    const plugins = json.plugins as Array<Record<string, unknown>> | undefined;
    if (!Array.isArray(plugins)) return [];

    return plugins.map((entry) => ({
      concept_type: "plugin" as ConceptType,
      name: (entry.name as string) || "plugin",
      description: (entry.description as string) || null,
      relative_path: `${relativePath}#${entry.name || "plugin"}`,
      content: JSON.stringify(entry, null, 2),
      metadata: {
        author: entry.author,
        category: entry.category,
        ...entry,
      },
    }));
  } catch {
    return [];
  }
}

/** Batch fetch values for paths with concurrency limit, returning a Map of path → result */
async function batchFetch<T>(
  paths: string[],
  fetcher: (p: string) => Promise<T>,
  concurrency = 5,
): Promise<Map<string, T>> {
  const results = new Map<string, T>();

  for (let i = 0; i < paths.length; i += concurrency) {
    const batch = paths.slice(i, i + concurrency);
    const settled = await Promise.allSettled(
      batch.map(async (p) => {
        const value = await fetcher(p);
        return { path: p, value };
      }),
    );
    for (const result of settled) {
      if (result.status === "fulfilled" && result.value.value != null) {
        results.set(result.value.path, result.value.value);
      }
    }
  }

  return results;
}

/**
 * Scan a GitHub repo for concepts using the Tree API.
 * Single tree API call + targeted content fetches.
 */
export async function scanGitHubRepoForConcepts(
  pat: string,
  owner: string,
  repo: string,
  branch?: string,
): Promise<DiscoveredConcept[]> {
  const ref = branch || "main";

  // 1. Fetch entire file tree (single API call)
  const treeEntries = await getRepoTree(pat, owner, repo, ref);
  const allPaths = treeEntries.map((e) => e.path);

  // 2. Find concept-relevant files
  const conceptFiles = findConceptFiles(allPaths);
  if (conceptFiles.length === 0) return [];

  // 3. Fetch content for matched files
  const uniquePaths = [...new Set(conceptFiles.map((f) => f.path))];
  const contents = await batchFetch(uniquePaths, (p) => getFileContent(pat, owner, repo, p, ref));

  // 4. Parse each file into concepts
  const discovered: DiscoveredConcept[] = [];

  for (const { path: filePath, conceptType } of conceptFiles) {
    const content = contents.get(filePath);
    if (!content) continue;

    let parsed: DiscoveredConcept[] = [];

    switch (conceptType) {
      case "mcp_server":
        parsed = parseMcpServers(content, filePath);
        break;
      case "hook":
        parsed = parseHooks(content, filePath);
        break;
      case "plugin":
        if (filePath.endsWith("marketplace.json")) {
          parsed = parseMarketplace(content, filePath);
        } else {
          parsed = parsePlugin(content, filePath);
        }
        break;
      case "skill":
      case "command":
      case "agent":
        parsed = [parseMarkdownConcept(content, filePath, conceptType)];
        break;
    }

    // Qualify names for concepts nested inside plugins/<name>/
    const pluginPrefix = extractPluginPrefix(filePath);
    if (pluginPrefix) {
      for (const concept of parsed) {
        if (concept.concept_type !== "plugin") {
          concept.name = `${pluginPrefix}:${concept.name}`;
        }
        concept.metadata.plugin = pluginPrefix;
      }
    }

    discovered.push(...parsed);
  }

  // 5. Stamp GitHub context + fetch repo-level metadata (1 API call)
  for (const concept of discovered) {
    concept.metadata.github_owner = owner;
    concept.metadata.github_repo = repo;
    concept.metadata.github_ref = ref;
  }
  try {
    const repoInfo = await getRepoInfo(pat, owner, repo);
    for (const concept of discovered) {
      concept.metadata.repo_stars = repoInfo.stars;
      concept.metadata.repo_topics = repoInfo.topics;
      concept.metadata.repo_pushed_at = repoInfo.pushed_at;
    }
  } catch {
    // Non-critical — skip repo metadata
  }

  // 6. Fetch file-level last-commit metadata (N API calls, concurrency=5)
  try {
    const filePaths = [...new Set(discovered.map((c) => c.relative_path.split("#")[0]))];
    const commitMap = await batchFetch(filePaths, (p) => getFileLastCommit(pat, owner, repo, p, ref));
    for (const concept of discovered) {
      const basePath = concept.relative_path.split("#")[0];
      const commitInfo = commitMap.get(basePath);
      if (commitInfo) {
        concept.metadata.last_modified = commitInfo.date;
        concept.metadata.author = commitInfo.author;
      }
    }
  } catch {
    // Non-critical — skip file metadata
  }

  return discovered;
}
