import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { execute, getDb, queryAll } from "@/lib/db";
import type { ConceptType } from "@/lib/types";
import { generateId } from "@/lib/utils";

export interface DiscoveredConcept {
  concept_type: ConceptType;
  name: string;
  description: string | null;
  relative_path: string;
  content: string | null;
  metadata: Record<string, unknown>;
}

/**
 * Parse YAML-like frontmatter from a markdown file.
 * Handles simple "key: value" lines between "---" delimiters.
 */
export function parseFrontmatter(content: string): { frontmatter: Record<string, string>; body: string } {
  const frontmatter: Record<string, string> = {};
  const trimmed = content.trimStart();
  if (!trimmed.startsWith("---")) {
    return { frontmatter, body: content };
  }

  const endIndex = trimmed.indexOf("---", 3);
  if (endIndex === -1) {
    return { frontmatter, body: content };
  }

  const fmBlock = trimmed.slice(3, endIndex).trim();
  const body = trimmed.slice(endIndex + 3).trim();

  for (const line of fmBlock.split("\n")) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    const value = line.slice(colonIdx + 1).trim();
    if (key) {
      frontmatter[key] = value;
    }
  }

  return { frontmatter, body };
}

export function tryReadFile(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }
}

export function tryReadJson(filePath: string): Record<string, unknown> | null {
  const content = tryReadFile(filePath);
  if (!content) return null;
  try {
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/**
 * Discover skills from .claude/skills/SKILL.md
 */
function discoverSkills(repoPath: string): DiscoveredConcept[] {
  const results: DiscoveredConcept[] = [];
  const skillsDir = path.join(repoPath, ".claude", "skills");
  if (!fs.existsSync(skillsDir)) return results;

  try {
    const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const skillFile = path.join(skillsDir, entry.name, "SKILL.md");
      const content = tryReadFile(skillFile);
      if (!content) continue;

      const { frontmatter, body } = parseFrontmatter(content);
      results.push({
        concept_type: "skill",
        name: frontmatter.name || entry.name,
        description: frontmatter.description || body.split("\n")[0] || null,
        relative_path: `.claude/skills/${entry.name}/SKILL.md`,
        content,
        metadata: { ...frontmatter },
      });
    }
  } catch {
    /* directory not readable */
  }
  return results;
}

/**
 * Discover hooks from .claude/settings.json and .claude/settings.local.json
 */
function discoverHooks(repoPath: string): DiscoveredConcept[] {
  const results: DiscoveredConcept[] = [];
  const settingsFiles = [".claude/settings.json", ".claude/settings.local.json"];

  for (const relPath of settingsFiles) {
    const fullPath = path.join(repoPath, relPath);
    const json = tryReadJson(fullPath);
    if (!json || !json.hooks || typeof json.hooks !== "object") continue;

    const hooks = json.hooks as Record<string, unknown>;
    for (const [hookName, hookConfig] of Object.entries(hooks)) {
      results.push({
        concept_type: "hook",
        name: hookName,
        description: `Hook: ${hookName}`,
        relative_path: `${relPath}#${hookName}`,
        content: JSON.stringify(hookConfig, null, 2),
        metadata: { hook_name: hookName, source_file: relPath, config: hookConfig },
      });
    }
  }
  return results;
}

/**
 * Discover markdown-based concepts (commands or agents) from well-known directories.
 * Each .md file is parsed for frontmatter name/description.
 */
function discoverMarkdownConcepts(repoPath: string, conceptType: ConceptType, dirs: string[]): DiscoveredConcept[] {
  const results: DiscoveredConcept[] = [];

  for (const dir of dirs) {
    const fullDir = path.join(repoPath, dir);
    if (!fs.existsSync(fullDir)) continue;

    try {
      const entries = fs.readdirSync(fullDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
        const filePath = path.join(fullDir, entry.name);
        const content = tryReadFile(filePath);
        if (!content) continue;

        const { frontmatter, body } = parseFrontmatter(content);
        const name = frontmatter.name || entry.name.replace(/\.md$/, "");
        results.push({
          concept_type: conceptType,
          name,
          description: frontmatter.description || body.split("\n")[0] || null,
          relative_path: `${dir}/${entry.name}`,
          content,
          metadata: { ...frontmatter },
        });
      }
    } catch {
      /* directory not readable */
    }
  }
  return results;
}

function discoverCommands(repoPath: string): DiscoveredConcept[] {
  return discoverMarkdownConcepts(repoPath, "command", ["commands", ".claude/commands"]);
}

function discoverAgents(repoPath: string): DiscoveredConcept[] {
  return discoverMarkdownConcepts(repoPath, "agent", ["agents", ".claude/agents"]);
}

/**
 * Discover MCP servers from .mcp.json
 */
function discoverMcpServers(repoPath: string): DiscoveredConcept[] {
  const results: DiscoveredConcept[] = [];
  const mcpPath = path.join(repoPath, ".mcp.json");
  const json = tryReadJson(mcpPath);
  if (!json) return results;

  const servers = (json.mcpServers || json.servers) as Record<string, unknown> | undefined;
  if (!servers || typeof servers !== "object") return results;

  for (const [serverName, serverConfig] of Object.entries(servers)) {
    const config = serverConfig as Record<string, unknown> | null;
    results.push({
      concept_type: "mcp_server",
      name: serverName,
      description: (config?.description as string) || `MCP Server: ${serverName}`,
      relative_path: `.mcp.json#${serverName}`,
      content: JSON.stringify(serverConfig, null, 2),
      metadata: { server_name: serverName, config: serverConfig },
    });
  }
  return results;
}

/**
 * Discover plugins from .claude-plugin/plugin.json
 */
function discoverPlugins(repoPath: string): DiscoveredConcept[] {
  const results: DiscoveredConcept[] = [];
  const pluginPath = path.join(repoPath, ".claude-plugin", "plugin.json");
  const json = tryReadJson(pluginPath);
  if (!json) return results;

  results.push({
    concept_type: "plugin",
    name: (json.name as string) || "plugin",
    description: (json.description as string) || null,
    relative_path: ".claude-plugin/plugin.json",
    content: JSON.stringify(json, null, 2),
    metadata: { ...json },
  });
  return results;
}

/**
 * Discover concepts inside plugin subdirectories (plugins/<name>/...).
 * Runs existing discovery functions against each plugin subdir and qualifies names.
 */
function discoverPluginConcepts(repoPath: string): DiscoveredConcept[] {
  const results: DiscoveredConcept[] = [];
  const pluginsDir = path.join(repoPath, "plugins");
  if (!fs.existsSync(pluginsDir)) return results;

  try {
    const entries = fs.readdirSync(pluginsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const pluginName = entry.name;
      const pluginDir = path.join(pluginsDir, pluginName);

      const pluginConcepts: DiscoveredConcept[] = [];
      pluginConcepts.push(...discoverSkills(pluginDir));
      pluginConcepts.push(...discoverHooks(pluginDir));
      pluginConcepts.push(...discoverCommands(pluginDir));
      pluginConcepts.push(...discoverAgents(pluginDir));
      pluginConcepts.push(...discoverPlugins(pluginDir));

      for (const concept of pluginConcepts) {
        // Prefix relative paths with plugins/<name>/
        concept.relative_path = `plugins/${pluginName}/${concept.relative_path}`;
        concept.metadata.plugin = pluginName;
        // Qualify non-plugin names with plugin prefix
        if (concept.concept_type !== "plugin") {
          concept.name = `${pluginName}:${concept.name}`;
        }
      }
      results.push(...pluginConcepts);
    }
  } catch {
    /* directory not readable */
  }
  return results;
}

/**
 * Enrich concepts with git metadata (last_modified, author) from local git log.
 */
function enrichLocalConceptMetadata(repoPath: string, concepts: DiscoveredConcept[]): void {
  try {
    // Quick check: is this a git repo?
    if (!fs.existsSync(path.join(repoPath, ".git"))) return;

    for (const concept of concepts) {
      try {
        const relativePath = concept.relative_path.split("#")[0];
        const output = execFileSync("git", ["log", "-1", "--format=%aI|%an", "--", relativePath], {
          cwd: repoPath,
          encoding: "utf-8",
          timeout: 5000,
          stdio: ["pipe", "pipe", "pipe"],
        }).trim();
        if (!output) continue;
        const sepIdx = output.indexOf("|");
        if (sepIdx === -1) continue;
        concept.metadata.last_modified = output.slice(0, sepIdx);
        concept.metadata.author = output.slice(sepIdx + 1);
      } catch {
        // Skip individual file errors
      }
    }
  } catch {
    // Not a git repo or git not available — skip silently
  }
}

/**
 * Discover all Claude Code concepts in a repo.
 */
export function discoverConcepts(repoPath: string): DiscoveredConcept[] {
  const results: DiscoveredConcept[] = [];
  results.push(...discoverSkills(repoPath));
  results.push(...discoverHooks(repoPath));
  results.push(...discoverCommands(repoPath));
  results.push(...discoverAgents(repoPath));
  results.push(...discoverMcpServers(repoPath));
  results.push(...discoverPlugins(repoPath));
  results.push(...discoverPluginConcepts(repoPath));
  enrichLocalConceptMetadata(repoPath, results);
  return results;
}

/**
 * Store discovered concepts into the database.
 * Uses upsert-by-path to preserve stable IDs for concept_links.
 * When content changes, marks linked repos as 'stale'.
 */
export async function storeConcepts(
  repoId: string,
  scanId: string | null,
  discovered: DiscoveredConcept[],
  sourceId?: string | null,
): Promise<void> {
  const db = await getDb();

  await execute(db, "BEGIN TRANSACTION");
  try {
    // Fetch existing concepts for this repo
    const existing = await queryAll<{ id: string; relative_path: string; content: string | null }>(
      db,
      "SELECT id, relative_path, content FROM concepts WHERE repo_id = ?",
      [repoId],
    );
    const existingByPath = new Map(existing.map((e) => [e.relative_path, e]));
    const discoveredPaths = new Set(discovered.map((d) => d.relative_path));

    for (const concept of discovered) {
      const match = existingByPath.get(concept.relative_path);
      if (match) {
        // Update existing row (preserve ID)
        const contentChanged = match.content !== concept.content;
        await execute(
          db,
          `UPDATE concepts SET scan_id = ?, concept_type = ?, name = ?, description = ?,
           content = ?, metadata = ?, updated_at = CAST(current_timestamp AS VARCHAR)
           WHERE id = ?`,
          [
            scanId,
            concept.concept_type,
            concept.name,
            concept.description,
            concept.content,
            JSON.stringify(concept.metadata),
            match.id,
          ],
        );
        // If content changed, mark linked repos stale
        if (contentChanged) {
          await execute(
            db,
            "UPDATE concept_links SET sync_status = 'stale' WHERE concept_id = ? AND sync_status = 'synced'",
            [match.id],
          );
        }
      } else {
        // Insert new concept
        await execute(
          db,
          `INSERT INTO concepts (id, repo_id, scan_id, source_id, concept_type, name, description, relative_path, content, metadata)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            generateId(),
            repoId,
            scanId,
            sourceId || null,
            concept.concept_type,
            concept.name,
            concept.description,
            concept.relative_path,
            concept.content,
            JSON.stringify(concept.metadata),
          ],
        );
      }
    }

    // Remove concepts whose relative_path is no longer in discovered set
    for (const [relPath, ex] of existingByPath) {
      if (!discoveredPaths.has(relPath)) {
        // Cascade-delete orphaned links
        await execute(db, "DELETE FROM concept_links WHERE concept_id = ?", [ex.id]);
        await execute(db, "DELETE FROM concepts WHERE id = ?", [ex.id]);
      }
    }

    await execute(db, "COMMIT");
  } catch (err) {
    await execute(db, "ROLLBACK");
    throw err;
  }
}
