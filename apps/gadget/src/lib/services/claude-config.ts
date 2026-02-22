import fs from "node:fs";
import path from "node:path";

const CLAUDE_SETTINGS_REL = ".claude/settings.local.json";
const CLAUDE_MD_REL = "CLAUDE.md";

export async function readSettingsJson(repoPath: string): Promise<{ content: string; parsed: object } | null> {
  const fullPath = path.join(repoPath, CLAUDE_SETTINGS_REL);
  try {
    const content = fs.readFileSync(fullPath, "utf-8");
    const parsed = JSON.parse(content);
    return { content, parsed };
  } catch {
    return null;
  }
}

export async function writeSettingsJson(repoPath: string, content: string): Promise<void> {
  const fullPath = path.join(repoPath, CLAUDE_SETTINGS_REL);
  const dir = path.dirname(fullPath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(fullPath, content, "utf-8");
}

export async function readClaudeMd(repoPath: string): Promise<string | null> {
  const fullPath = path.join(repoPath, CLAUDE_MD_REL);
  try {
    return fs.readFileSync(fullPath, "utf-8");
  } catch {
    return null;
  }
}

export async function writeClaudeMd(repoPath: string, content: string): Promise<void> {
  const fullPath = path.join(repoPath, CLAUDE_MD_REL);
  fs.writeFileSync(fullPath, content, "utf-8");
}

const CLAUDE_SHARED_SETTINGS_REL = ".claude/settings.json";
const CLAUDE_RULES_DIR_REL = ".claude/rules";

export async function readSharedSettingsJson(repoPath: string): Promise<{ content: string; parsed: object } | null> {
  const fullPath = path.join(repoPath, CLAUDE_SHARED_SETTINGS_REL);
  try {
    const content = fs.readFileSync(fullPath, "utf-8");
    const parsed = JSON.parse(content);
    return { content, parsed };
  } catch {
    return null;
  }
}

export async function writeSharedSettingsJson(repoPath: string, content: string): Promise<void> {
  const fullPath = path.join(repoPath, CLAUDE_SHARED_SETTINGS_REL);
  const dir = path.dirname(fullPath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(fullPath, content, "utf-8");
}

export async function readRulesFiles(repoPath: string): Promise<{ name: string; content: string }[]> {
  const rulesDir = path.join(repoPath, CLAUDE_RULES_DIR_REL);
  try {
    const entries = fs.readdirSync(rulesDir);
    return entries
      .filter((e) => e.endsWith(".md"))
      .sort()
      .map((name) => ({
        name,
        content: fs.readFileSync(path.join(rulesDir, name), "utf-8"),
      }));
  } catch {
    return [];
  }
}

export async function writeRuleFile(repoPath: string, name: string, content: string): Promise<void> {
  // Sanitize filename - only allow alphanumeric, hyphens, underscores, and .md extension
  const safeName = name.replace(/[^a-zA-Z0-9_-]/g, "");
  const fileName = safeName.endsWith(".md") ? safeName : `${safeName}.md`;
  const rulesDir = path.join(repoPath, CLAUDE_RULES_DIR_REL);
  fs.mkdirSync(rulesDir, { recursive: true });
  fs.writeFileSync(path.join(rulesDir, fileName), content, "utf-8");
}

export async function deleteRuleFile(repoPath: string, name: string): Promise<void> {
  const filePath = path.join(repoPath, CLAUDE_RULES_DIR_REL, name);
  try {
    fs.unlinkSync(filePath);
  } catch {
    // File may not exist
  }
}
