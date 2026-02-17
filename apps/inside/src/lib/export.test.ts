import { describe, expect, it } from "vitest";
import { exportFixesToMarkdown, exportSplitPlanToMarkdown } from "./export";

describe("exportSplitPlanToMarkdown", () => {
  const basePlan = {
    prNumber: 42,
    prTitle: "Big feature",
    totalLines: 1500,
    subPRs: [
      {
        id: "sub-1",
        index: 1,
        total: 2,
        title: "Database layer",
        size: "M" as const,
        linesChanged: 400,
        files: [{ path: "src/db.ts", additions: 300, deletions: 100 }],
        dependsOn: [] as number[],
        risk: "Low" as const,
        riskNote: "Simple schema changes",
        description: "Add database tables",
        checklist: ["Run migrations", "Verify schema"],
      },
      {
        id: "sub-2",
        index: 2,
        total: 2,
        title: "API layer",
        size: "L" as const,
        linesChanged: 1100,
        files: [],
        dependsOn: [1],
        risk: "High" as const,
        riskNote: "Complex logic",
        description: "Add API endpoints",
        checklist: [],
      },
    ],
  };

  it("generates correct heading with PR number and title", () => {
    const md = exportSplitPlanToMarkdown(basePlan);
    expect(md).toContain("# Split Plan: #42 — Big feature");
    expect(md).toContain("**Total lines:** 1500 | **Sub-PRs:** 2");
  });

  it("renders sub-PR sections with size, risk, dependencies", () => {
    const md = exportSplitPlanToMarkdown(basePlan);
    expect(md).toContain("## 1/2: Database layer");
    expect(md).toContain("**Size:** M (400 lines)");
    expect(md).toContain("**Risk:** Low — Simple schema changes");
    expect(md).toContain("## 2/2: API layer");
    expect(md).toContain("**Depends on:** #1");
  });

  it("renders files list and checklist when present", () => {
    const md = exportSplitPlanToMarkdown(basePlan);
    expect(md).toContain("**Files:**");
    expect(md).toContain("- `src/db.ts` (+300, -100)");
    expect(md).toContain("**Checklist:**");
    expect(md).toContain("- [ ] Run migrations");
  });

  it("handles empty dependencies, files, and checklist", () => {
    const md = exportSplitPlanToMarkdown(basePlan);
    // Sub-PR 1 has no dependencies — "Depends on" should not appear for it
    const sub1Section = md.split("## 2/2")[0];
    expect(sub1Section).not.toContain("**Depends on:**");
    // Sub-PR 2 has no files or checklist
    const sub2Section = md.split("## 2/2")[1];
    expect(sub2Section).not.toContain("**Files:**");
    expect(sub2Section).not.toContain("**Checklist:**");
  });
});

describe("exportFixesToMarkdown", () => {
  const comments = [
    { id: "c1", reviewer: "alice", body: "Fix the error handling here", file_path: "src/api.ts", line_number: 42 },
    { id: "c2", reviewer: "bob", body: "Missing null check", file_path: null, line_number: null },
  ];

  it("generates correct fix sections with reviewer, body, file path", () => {
    const fixes = [{ commentId: "c1", suggestedFix: "Add try-catch", fixDiff: null }];
    const md = exportFixesToMarkdown(fixes, comments);
    expect(md).toContain("# Comment Fixes");
    expect(md).toContain("## alice: Fix the error handling here");
    expect(md).toContain("**File:** `src/api.ts:42`");
    expect(md).toContain("**Fix:** Add try-catch");
  });

  it("includes diff blocks when fixDiff is present", () => {
    const fixes = [{ commentId: "c1", suggestedFix: "Add try-catch", fixDiff: "- old\n+ new" }];
    const md = exportFixesToMarkdown(fixes, comments);
    expect(md).toContain("```diff");
    expect(md).toContain("- old\n+ new");
    expect(md).toContain("```");
  });

  it("skips fixes whose commentId does not match any comment", () => {
    const fixes = [
      { commentId: "nonexistent", suggestedFix: "Fix", fixDiff: null },
      { commentId: "c2", suggestedFix: "Add check", fixDiff: null },
    ];
    const md = exportFixesToMarkdown(fixes, comments);
    expect(md).not.toContain("nonexistent");
    expect(md).toContain("## bob: Missing null check");
  });
});
