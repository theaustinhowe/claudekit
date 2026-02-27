export function buildSkillAnalysisPrompt(
  comments: {
    id: string;
    reviewer: string;
    body: string;
    filePath: string | null;
    lineNumber: number | null;
    prNumber: number;
    prTitle: string;
  }[],
): string {
  const commentList = comments
    .map(
      (c, i) =>
        `[${i + 1}] Comment ID: ${c.id}\n  PR: #${c.prNumber} "${c.prTitle}"\n  Reviewer: ${c.reviewer}\n  File: ${c.filePath || "N/A"}:${c.lineNumber || "N/A"}\n  Text: ${c.body}`,
    )
    .join("\n\n");

  return `Analyze these PR review comments and identify recurring skill patterns/improvement areas.

## Comments

${commentList}

## Instructions

Group the comments into skill categories (e.g., "Error Handling", "Test Coverage", "Naming Conventions", "Type Safety", "API Design", "Performance"). For each skill found, provide:

- name: A clear skill name
- severity: "blocking" | "suggestion" | "nit" (most common severity of the comments)
- frequency: Number of comments in this category
- trend: "Improving" | "Needs attention" | "New pattern" | "Flat"
- topExample: The most illustrative comment quote
- description: A 2-3 sentence description of what this skill area covers
- commentIds: Array of comment IDs that belong to this category
- resources: Array of {title, url} with 2 relevant learning resources
- actionItem: A specific, actionable recommendation

Return ONLY a JSON array of skill objects. No markdown, no explanation.`;
}

export function buildSplitPlanPrompt(pr: {
  number: number;
  title: string;
  filesChanged: number;
  diff: string;
}): string {
  const truncatedDiff =
    pr.diff.length > 50000 ? `${pr.diff.slice(0, 50000)}\n\n... (diff truncated at 50000 chars)` : pr.diff;

  return `Analyze this pull request and create a plan to split it into smaller, logical sub-PRs.

## PR Info
- Number: #${pr.number}
- Title: ${pr.title}
- Files changed: ${pr.filesChanged}

## Diff
\`\`\`
${truncatedDiff}
\`\`\`

## Instructions

Split this PR into 2-5 smaller, independent sub-PRs. Each sub-PR should be a logical unit of work that can be reviewed and merged independently. For each sub-PR, provide:

- index: Sequential number (1, 2, 3...)
- total: Total number of sub-PRs
- title: A concise title for the sub-PR
- size: "S" | "M" | "L" | "XL" based on lines changed (S<100, M<500, L<1000, XL>1000)
- linesChanged: Estimated number of lines
- files: Array of {path, additions, deletions} for each file in this sub-PR
- dependsOn: Array of sub-PR indexes this depends on (empty if independent)
- risk: "Low" | "Medium" | "High"
- riskNote: Short explanation of the risk level
- description: A PR description for this sub-PR
- checklist: Array of review/test items

Return ONLY a JSON array of sub-PR objects. No markdown, no explanation.`;
}

export function buildCommentFixPrompt(
  comments: {
    id: string;
    body: string;
    filePath: string | null;
    lineNumber: number | null;
    fileContent: string | null;
  }[],
): string {
  const commentList = comments
    .map((c, i) => {
      let context = `[${i + 1}] Comment ID: ${c.id}\n  File: ${c.filePath || "N/A"}:${c.lineNumber || "N/A"}\n  Comment: ${c.body}`;
      if (c.fileContent) {
        const truncated =
          c.fileContent.length > 5000 ? `${c.fileContent.slice(0, 5000)}\n... (truncated)` : c.fileContent;
        context += `\n  File content:\n\`\`\`\n${truncated}\n\`\`\``;
      }
      return context;
    })
    .join("\n\n");

  return `Generate code fixes for these PR review comments.

## Comments

${commentList}

## Instructions

For each comment, provide a fix. Return a JSON array where each element has:

- commentId: The comment ID
- suggestedFix: A brief explanation of what the fix does
- fixDiff: A unified diff showing the change (use @@ hunk headers, + for additions, - for deletions)

Return ONLY a JSON array. No markdown, no explanation.`;
}

export function buildSkillRulePrompt(
  comments: {
    id: string;
    reviewer: string;
    body: string;
    filePath: string | null;
    lineNumber: number | null;
    prNumber: number;
    prTitle: string;
  }[],
  diff: string,
): string {
  const commentList = comments
    .map(
      (c, i) =>
        `[${i + 1}] Comment ID: ${c.id}\n  PR: #${c.prNumber} "${c.prTitle}"\n  Reviewer: ${c.reviewer}\n  File: ${c.filePath || "N/A"}:${c.lineNumber || "N/A"}\n  Text: ${c.body}`,
    )
    .join("\n\n");

  const truncatedDiff = diff.length > 30000 ? `${diff.slice(0, 30000)}\n\n... (diff truncated at 30000 chars)` : diff;

  return `Analyze these PR review comments alongside the diff to generate Claude Code SKILL.md rules.

## Comments

${commentList}

## Diff

\`\`\`
${truncatedDiff}
\`\`\`

## Instructions

For each distinct issue identified from the comments, generate a SKILL.md-compatible rule. Each rule should:
1. Identify what mistake was made and what reviewers caught
2. Provide instructions that Claude should follow to avoid the same mistake
3. Be grouped by functionality category

Return a JSON array where each element has:
- name: A kebab-case slug for the skill (e.g., "react-memo-usage", "error-boundary-handling")
- group: Category slug (e.g., "react-components", "css-styling", "testing", "api-design", "type-safety", "error-handling", "state-management", "file-setup", "migrations", "performance")
- severity: "blocking" | "suggestion" | "nit"
- description: One-line description for the SKILL.md frontmatter
- rule_content: Full markdown body for the SKILL.md — the actual instructions Claude should follow. Be specific, include do/don't examples from the diff.
- commentIds: Array of comment IDs this rule addresses

Return ONLY a JSON array. No markdown, no explanation.`;
}
