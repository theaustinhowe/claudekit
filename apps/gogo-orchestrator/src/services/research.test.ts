import { describe, expect, it } from "vitest";

// Import only the pure functions that don't need mocking
import { buildResearchPrompt, extractCompleteSuggestions, extractText, parseSuggestionBlock } from "./research.js";

describe("extractText", () => {
  it("extracts text from content_block_delta", () => {
    const line = JSON.stringify({ type: "content_block_delta", delta: { text: "Hello world" } });
    expect(extractText(line)).toBe("Hello world");
  });

  it("extracts text from message content blocks", () => {
    const line = JSON.stringify({
      type: "message",
      message: {
        content: [
          { type: "text", text: "First" },
          { type: "text", text: "Second" },
        ],
      },
    });
    expect(extractText(line)).toBe("First\nSecond");
  });

  it("extracts text from assistant content blocks", () => {
    const line = JSON.stringify({
      type: "assistant",
      message: { content: [{ type: "text", text: "Analysis result" }] },
    });
    expect(extractText(line)).toBe("Analysis result");
  });

  it("returns null for non-text content blocks", () => {
    const line = JSON.stringify({
      type: "message",
      message: { content: [{ type: "tool_use" }] },
    });
    expect(extractText(line)).toBeNull();
  });

  it("returns null for unrecognized JSON types", () => {
    const line = JSON.stringify({ type: "ping" });
    expect(extractText(line)).toBeNull();
  });

  it("treats non-JSON as plain text", () => {
    expect(extractText("Hello from stderr")).toBe("Hello from stderr");
  });

  it("returns null for empty/whitespace-only non-JSON", () => {
    expect(extractText("   ")).toBeNull();
  });
});

describe("parseSuggestionBlock", () => {
  it("parses a complete suggestion block", () => {
    const block = `category: security
severity: high
title: SQL injection in user input
description: The login form passes unsanitized input to the database query.
files: src/auth.ts, src/db.ts`;

    const result = parseSuggestionBlock(block);
    expect(result).toEqual({
      category: "security",
      severity: "high",
      title: "SQL injection in user input",
      description: "The login form passes unsanitized input to the database query.",
      filePaths: ["src/auth.ts", "src/db.ts"],
    });
  });

  it("defaults category to documentation for unknown categories", () => {
    const block = `category: unknown_thing
title: Some finding
description: Something was found`;

    const result = parseSuggestionBlock(block);
    expect(result?.category).toBe("documentation");
  });

  it("defaults severity to medium for missing severity", () => {
    const block = `category: ui
title: Button misalignment
description: The submit button is misaligned on mobile`;

    const result = parseSuggestionBlock(block);
    expect(result?.severity).toBe("medium");
  });

  it("returns null when required fields are missing", () => {
    const block = `category: ui
severity: low`;

    expect(parseSuggestionBlock(block)).toBeNull();
  });

  it("returns null for empty block", () => {
    expect(parseSuggestionBlock("")).toBeNull();
  });

  it("handles null filePaths when no files field", () => {
    const block = `category: performance
title: Slow query
description: The dashboard query takes too long`;

    const result = parseSuggestionBlock(block);
    expect(result?.filePaths).toBeNull();
  });

  it("concatenates multi-line descriptions", () => {
    const block = `category: testing
title: Missing tests
description: The auth module has no tests.
description: This is a critical gap in coverage.`;

    const result = parseSuggestionBlock(block);
    expect(result?.description).toBe("The auth module has no tests. This is a critical gap in coverage.");
  });
});

describe("extractCompleteSuggestions", () => {
  it("extracts a single suggestion", () => {
    const text = `Some preamble text.

SUGGESTION_START
category: security
severity: high
title: XSS vulnerability
description: User input is rendered without sanitization
files: src/render.ts
SUGGESTION_END

Some trailing text.`;

    const result = extractCompleteSuggestions(text);
    expect(result.suggestions).toHaveLength(1);
    expect(result.suggestions[0].title).toBe("XSS vulnerability");
    expect(result.suggestions[0].category).toBe("security");
  });

  it("extracts multiple suggestions", () => {
    const text = `SUGGESTION_START
category: ui
title: First
description: First issue
SUGGESTION_END

SUGGESTION_START
category: performance
title: Second
description: Second issue
SUGGESTION_END`;

    const result = extractCompleteSuggestions(text);
    expect(result.suggestions).toHaveLength(2);
    expect(result.suggestions[0].title).toBe("First");
    expect(result.suggestions[1].title).toBe("Second");
  });

  it("preserves remaining text after last suggestion", () => {
    const text = `SUGGESTION_START
category: ui
title: Finding
description: Something found
SUGGESTION_END
This is remaining text that might contain more.`;

    const result = extractCompleteSuggestions(text);
    expect(result.suggestions).toHaveLength(1);
    expect(result.remaining).toContain("remaining text");
  });

  it("keeps text with partial SUGGESTION_START", () => {
    const text = "Some text... SUGGESTION_START\ncategory: ui\n";
    const result = extractCompleteSuggestions(text);
    expect(result.suggestions).toHaveLength(0);
    expect(result.remaining).toContain("SUGGESTION_START");
  });

  it("handles empty text", () => {
    const result = extractCompleteSuggestions("");
    expect(result.suggestions).toHaveLength(0);
    expect(result.remaining).toBe("");
  });

  it("skips invalid suggestion blocks", () => {
    const text = `SUGGESTION_START
just some random text without proper fields
SUGGESTION_END

SUGGESTION_START
category: testing
title: Valid suggestion
description: This one is valid
SUGGESTION_END`;

    const result = extractCompleteSuggestions(text);
    expect(result.suggestions).toHaveLength(1);
    expect(result.suggestions[0].title).toBe("Valid suggestion");
  });
});

describe("buildResearchPrompt", () => {
  it("includes selected focus areas", () => {
    const prompt = buildResearchPrompt(["security", "performance"]);
    expect(prompt).toContain("Security");
    expect(prompt).toContain("Performance");
    expect(prompt).not.toContain("Testing:");
  });

  it("includes suggestion format instructions", () => {
    const prompt = buildResearchPrompt(["ui"]);
    expect(prompt).toContain("SUGGESTION_START");
    expect(prompt).toContain("SUGGESTION_END");
    expect(prompt).toContain("category:");
    expect(prompt).toContain("severity:");
  });

  it("handles all categories", () => {
    const allCategories = [
      "ui",
      "ux",
      "security",
      "durability",
      "performance",
      "testing",
      "accessibility",
      "documentation",
    ] as const;
    const prompt = buildResearchPrompt([...allCategories]);
    expect(prompt).toContain("UI:");
    expect(prompt).toContain("UX:");
    expect(prompt).toContain("Security:");
    expect(prompt).toContain("Accessibility:");
  });
});
