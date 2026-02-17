import type { SubPR } from "./types";

export function exportSplitPlanToMarkdown(plan: {
  prNumber: number;
  prTitle: string;
  totalLines: number;
  subPRs: SubPR[];
}): string {
  const lines: string[] = [
    `# Split Plan: #${plan.prNumber} — ${plan.prTitle}`,
    "",
    `**Total lines:** ${plan.totalLines} | **Sub-PRs:** ${plan.subPRs.length}`,
    "",
  ];

  for (const sp of plan.subPRs) {
    lines.push(`## ${sp.index}/${sp.total}: ${sp.title}`);
    lines.push("");
    lines.push(`- **Size:** ${sp.size} (${sp.linesChanged} lines)`);
    lines.push(`- **Risk:** ${sp.risk} — ${sp.riskNote}`);
    if (sp.dependsOn.length > 0) {
      lines.push(`- **Depends on:** ${sp.dependsOn.map((d) => `#${d}`).join(", ")}`);
    }
    lines.push("");
    lines.push(sp.description);
    lines.push("");

    if (sp.files && sp.files.length > 0) {
      lines.push("**Files:**");
      for (const f of sp.files) {
        lines.push(`- \`${f.path}\` (+${f.additions}, -${f.deletions})`);
      }
      lines.push("");
    }

    if (sp.checklist && sp.checklist.length > 0) {
      lines.push("**Checklist:**");
      for (const item of sp.checklist) {
        lines.push(`- [ ] ${item}`);
      }
      lines.push("");
    }

    lines.push("---");
    lines.push("");
  }

  return lines.join("\n");
}

export function exportFixesToMarkdown(
  fixes: {
    commentId: string;
    suggestedFix: string | null;
    fixDiff: string | null;
  }[],
  comments: {
    id: string;
    reviewer: string;
    body: string;
    file_path: string | null;
    line_number: number | null;
  }[],
): string {
  const commentMap = new Map(comments.map((c) => [c.id, c]));
  const lines: string[] = ["# Comment Fixes", ""];

  for (const fix of fixes) {
    const comment = commentMap.get(fix.commentId);
    if (!comment) continue;

    lines.push(`## ${comment.reviewer}: ${comment.body.slice(0, 80)}`);
    lines.push("");
    if (comment.file_path) {
      lines.push(`**File:** \`${comment.file_path}:${comment.line_number ?? ""}\``);
      lines.push("");
    }
    if (fix.suggestedFix) {
      lines.push(`**Fix:** ${fix.suggestedFix}`);
      lines.push("");
    }
    if (fix.fixDiff) {
      lines.push("```diff");
      lines.push(fix.fixDiff);
      lines.push("```");
      lines.push("");
    }
    lines.push("---");
    lines.push("");
  }

  return lines.join("\n");
}
