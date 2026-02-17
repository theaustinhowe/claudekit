import { describe, expect, it } from "vitest";
import { buildCommentFixPrompt, buildSkillAnalysisPrompt, buildSplitPlanPrompt } from "./prompts";

describe("buildSkillAnalysisPrompt", () => {
  it("produces prompt with all comments", () => {
    const comments = [
      {
        id: "c1",
        reviewer: "alice",
        body: "Missing error handling",
        filePath: "src/api.ts",
        lineNumber: 42,
        prNumber: 1,
        prTitle: "Add API",
      },
      {
        id: "c2",
        reviewer: "bob",
        body: "Add tests",
        filePath: null,
        lineNumber: null,
        prNumber: 2,
        prTitle: "Refactor utils",
      },
    ];

    const result = buildSkillAnalysisPrompt(comments);

    expect(result).toContain("Comment ID: c1");
    expect(result).toContain("Comment ID: c2");
    expect(result).toContain("alice");
    expect(result).toContain("Missing error handling");
    expect(result).toContain('PR: #1 "Add API"');
    expect(result).toContain("src/api.ts:42");
    expect(result).toContain("N/A:N/A");
    expect(result).toContain("Return ONLY a JSON array");
  });

  it("numbers comments sequentially", () => {
    const comments = [
      { id: "c1", reviewer: "a", body: "x", filePath: null, lineNumber: null, prNumber: 1, prTitle: "t" },
      { id: "c2", reviewer: "b", body: "y", filePath: null, lineNumber: null, prNumber: 2, prTitle: "t" },
    ];

    const result = buildSkillAnalysisPrompt(comments);
    expect(result).toContain("[1] Comment ID: c1");
    expect(result).toContain("[2] Comment ID: c2");
  });
});

describe("buildSplitPlanPrompt", () => {
  it("includes PR info and diff", () => {
    const result = buildSplitPlanPrompt({
      number: 42,
      title: "Big PR",
      filesChanged: 10,
      diff: "+ added line\n- removed line",
    });

    expect(result).toContain("#42");
    expect(result).toContain("Big PR");
    expect(result).toContain("Files changed: 10");
    expect(result).toContain("+ added line");
    expect(result).toContain("Return ONLY a JSON array");
  });

  it("truncates diff longer than 50000 chars", () => {
    const longDiff = "x".repeat(60000);
    const result = buildSplitPlanPrompt({
      number: 1,
      title: "t",
      filesChanged: 1,
      diff: longDiff,
    });

    expect(result).toContain("diff truncated at 50000 chars");
    expect(result.length).toBeLessThan(longDiff.length);
  });
});

describe("buildCommentFixPrompt", () => {
  it("includes comment body and file context", () => {
    const result = buildCommentFixPrompt([
      {
        id: "c1",
        body: "This function is too long",
        filePath: "src/utils.ts",
        lineNumber: 10,
        fileContent: "function foo() { return 1; }",
      },
    ]);

    expect(result).toContain("Comment ID: c1");
    expect(result).toContain("This function is too long");
    expect(result).toContain("src/utils.ts:10");
    expect(result).toContain("function foo()");
    expect(result).toContain("Return ONLY a JSON array");
  });

  it("handles null file path and content", () => {
    const result = buildCommentFixPrompt([
      { id: "c2", body: "General comment", filePath: null, lineNumber: null, fileContent: null },
    ]);

    expect(result).toContain("N/A:N/A");
    expect(result).not.toContain("File content:");
  });

  it("truncates long file content", () => {
    const longContent = "a".repeat(6000);
    const result = buildCommentFixPrompt([
      { id: "c3", body: "comment", filePath: "a.ts", lineNumber: 1, fileContent: longContent },
    ]);

    expect(result).toContain("(truncated)");
  });
});
