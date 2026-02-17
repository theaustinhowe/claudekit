import { describe, expect, it } from "vitest";
import { classifyComment } from "./comment-classifier";

describe("classifyComment", () => {
  describe("severity classification", () => {
    it("classifies security-related comments as blocking", () => {
      expect(classifyComment("This has a security vulnerability").severity).toBe("blocking");
      expect(classifyComment("Possible XSS injection here").severity).toBe("blocking");
    });

    it("classifies bug-related comments as blocking", () => {
      expect(classifyComment("This will crash on null input").severity).toBe("blocking");
      expect(classifyComment("This is a bug - it breaks the login").severity).toBe("blocking");
    });

    it("classifies must-fix comments as blocking", () => {
      expect(classifyComment("Must fix this before merging").severity).toBe("blocking");
    });

    it("classifies improvement suggestions as suggestion", () => {
      expect(classifyComment("You should consider using a Map here").severity).toBe("suggestion");
      expect(classifyComment("Could refactor this into smaller functions").severity).toBe("suggestion");
    });

    it("classifies style/formatting comments as nit", () => {
      expect(classifyComment("nit: extra whitespace here").severity).toBe("nit");
      expect(classifyComment("Typo in variable name").severity).toBe("nit");
      expect(classifyComment("Minor formatting issue").severity).toBe("nit");
    });

    it("defaults to suggestion for ambiguous comments", () => {
      expect(classifyComment("I have some thoughts about this approach").severity).toBe("suggestion");
    });
  });

  describe("category classification", () => {
    it("classifies error handling comments", () => {
      expect(classifyComment("Missing error handling in this function").category).toBe("Error Handling");
      expect(classifyComment("Need a try-catch block here").category).toBe("Error Handling");
    });

    it("classifies test-related comments", () => {
      expect(classifyComment("Should add unit tests for this").category).toBe("Test Coverage");
      expect(classifyComment("Missing test coverage").category).toBe("Test Coverage");
    });

    it("classifies naming comments", () => {
      expect(classifyComment("This variable name is not descriptive enough").category).toBe("Naming Conventions");
      expect(classifyComment("Rename to follow camelCase convention").category).toBe("Naming Conventions");
    });

    it("classifies type safety comments", () => {
      expect(classifyComment("Don't use any type here, add proper interface").category).toBe("Type Safety");
      expect(classifyComment("Add null check before accessing property").category).toBe("Type Safety");
    });

    it("classifies API design comments", () => {
      expect(classifyComment("This API endpoint needs request validation").category).toBe("API Design");
    });

    it("classifies performance comments", () => {
      expect(classifyComment("This is O(n^2) and could be optimized with caching").category).toBe("Performance");
      expect(classifyComment("Memory leak - unsubscribe on cleanup").category).toBe("Performance");
    });

    it("defaults to General for unclassifiable comments", () => {
      expect(classifyComment("Looks good to me overall").category).toBe("General");
    });
  });
});
