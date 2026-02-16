import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ConceptType } from "@/lib/types";
import { type DiscoveredConcept, parseFrontmatter, tryReadFile, tryReadJson } from "./concept-scanner";

/**
 * Discover hooks from ~/.claude/settings.json and settings.local.json
 */
function discoverGlobalHooks(basePath: string): DiscoveredConcept[] {
  const results: DiscoveredConcept[] = [];
  const settingsFiles = ["settings.json", "settings.local.json"];

  for (const relPath of settingsFiles) {
    const fullPath = path.join(basePath, relPath);
    const json = tryReadJson(fullPath);
    if (!json || !json.hooks || typeof json.hooks !== "object") continue;

    const hooks = json.hooks as Record<string, unknown>;
    for (const [hookName, hookConfig] of Object.entries(hooks)) {
      results.push({
        concept_type: "hook",
        name: hookName,
        description: `Global hook: ${hookName}`,
        relative_path: `${relPath}#${hookName}`,
        content: JSON.stringify(hookConfig, null, 2),
        metadata: { hook_name: hookName, source_file: relPath, config: hookConfig, scope: "global" },
      });
    }
  }
  return results;
}

/**
 * Discover enabled plugins from ~/.claude/settings.json
 */
function discoverGlobalPlugins(basePath: string): DiscoveredConcept[] {
  const results: DiscoveredConcept[] = [];
  const settingsFiles = ["settings.json", "settings.local.json"];

  for (const relPath of settingsFiles) {
    const fullPath = path.join(basePath, relPath);
    const json = tryReadJson(fullPath);
    if (!json || !Array.isArray(json.enabledPlugins)) continue;

    for (const pluginName of json.enabledPlugins) {
      if (typeof pluginName !== "string") continue;
      results.push({
        concept_type: "plugin",
        name: pluginName,
        description: `Global plugin: ${pluginName}`,
        relative_path: `${relPath}#${pluginName}`,
        content: null,
        metadata: { plugin_name: pluginName, source_file: relPath, scope: "global" },
      });
    }
  }
  return results;
}

/**
 * Discover markdown-based global concepts (commands or agents) from a subdirectory.
 * Each .md file is parsed for frontmatter name/description.
 */
function discoverGlobalMarkdownConcepts(
  basePath: string,
  conceptType: ConceptType,
  subdir: string,
): DiscoveredConcept[] {
  const results: DiscoveredConcept[] = [];
  const dir = path.join(basePath, subdir);
  if (!fs.existsSync(dir)) return results;

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
      const filePath = path.join(dir, entry.name);
      const content = tryReadFile(filePath);
      if (!content) continue;

      const { frontmatter, body } = parseFrontmatter(content);
      const name = frontmatter.name || entry.name.replace(/\.md$/, "");
      results.push({
        concept_type: conceptType,
        name,
        description: frontmatter.description || body.split("\n")[0] || null,
        relative_path: `${subdir}/${entry.name}`,
        content,
        metadata: { ...frontmatter, scope: "global" },
      });
    }
  } catch {
    /* directory not readable */
  }
  return results;
}

/** Discover global skills from ~/.claude/skills/{name}/SKILL.md */
function discoverGlobalSkills(basePath: string): DiscoveredConcept[] {
  const results: DiscoveredConcept[] = [];
  const skillsDir = path.join(basePath, "skills");
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
        relative_path: `skills/${entry.name}/SKILL.md`,
        content,
        metadata: { ...frontmatter, scope: "global" },
      });
    }
  } catch {
    /* directory not readable */
  }
  return results;
}

/**
 * Discover all Claude Code concepts from the user's global ~/.claude directory.
 */
export function discoverClaudeConfigConcepts(): DiscoveredConcept[] {
  const basePath = path.join(os.homedir(), ".claude");
  if (!fs.existsSync(basePath)) return [];

  const results: DiscoveredConcept[] = [];
  results.push(...discoverGlobalHooks(basePath));
  results.push(...discoverGlobalPlugins(basePath));
  results.push(...discoverGlobalMarkdownConcepts(basePath, "command", "commands"));
  results.push(...discoverGlobalSkills(basePath));
  results.push(...discoverGlobalMarkdownConcepts(basePath, "agent", "agents"));
  return results;
}
