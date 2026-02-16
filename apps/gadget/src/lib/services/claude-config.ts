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
