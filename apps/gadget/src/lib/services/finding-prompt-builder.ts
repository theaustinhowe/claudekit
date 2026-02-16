import type { Finding } from "@/lib/types";

/**
 * Build a prompt for Claude Code to fix a batch of findings.
 * Each batch groups related findings so Claude can fix them together efficiently.
 */
export function buildFindingsFixPrompt(findings: Finding[], repoPath: string): string {
  const lines: string[] = [
    `You are fixing issues in the repository at ${repoPath}.`,
    "",
    "Fix the following issues. For each issue, read relevant files first, then make minimal targeted changes.",
    "Use the Write tool to write files. Do NOT use Bash or Edit.",
    "",
  ];

  for (let i = 0; i < findings.length; i++) {
    const f = findings[i];
    lines.push(`## Issue ${i + 1}: ${f.title}`);
    if (f.details) lines.push(`Details: ${f.details}`);
    if (f.evidence) lines.push(`Evidence: ${f.evidence}`);
    if (f.suggested_actions.length > 0) {
      lines.push("Suggested actions:");
      for (const action of f.suggested_actions) {
        lines.push(`  - ${action}`);
      }
    }
    lines.push("");
  }

  lines.push("Important:");
  lines.push("- Read existing files before modifying them to preserve existing content");
  lines.push("- Make minimal changes — only fix what is described above");
  lines.push("- Do not reformat or restructure unrelated code");
  lines.push("- If a file needs to be created, generate sensible defaults for this project type");

  return lines.join("\n");
}
