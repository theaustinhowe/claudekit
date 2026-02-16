import { describe, expect, it } from "vitest";
import { classifyFinding } from "@/lib/services/finding-classifier";
import type { Finding } from "@/lib/types";

function makeFinding(category: Finding["category"], title: string): Finding {
  return {
    id: "f1",
    repo_id: "r1",
    scan_id: "s1",
    category,
    severity: "warning",
    title,
    details: null,
    evidence: null,
    suggested_actions: [],
    created_at: "",
  };
}

describe("classifyFinding", () => {
  describe("structure category", () => {
    it("marks 'invalid' as not auto-fixable, high risk", () => {
      const result = classifyFinding(makeFinding("structure", "Invalid tsconfig.json"));
      expect(result.autoFixable).toBe(false);
      expect(result.risk).toBe("high");
      expect(result.batchKey).toBe("manual");
    });

    it("marks missing package.json in workspace as medium risk", () => {
      const result = classifyFinding(makeFinding("structure", "Missing package.json in workspace packages/foo"));
      expect(result.autoFixable).toBe(true);
      expect(result.risk).toBe("medium");
      expect(result.batchKey).toBe("workspace-packages");
    });

    it("marks missing script as low risk", () => {
      const result = classifyFinding(makeFinding("structure", "Missing script: test"));
      expect(result.autoFixable).toBe(true);
      expect(result.risk).toBe("low");
      expect(result.batchKey).toBe("scripts");
    });

    it("marks 'missing format script' as low risk scripts batch", () => {
      const result = classifyFinding(makeFinding("structure", "Missing format script"));
      expect(result.autoFixable).toBe(true);
      expect(result.risk).toBe("low");
      expect(result.batchKey).toBe("scripts");
    });

    it("marks strict mode as low risk tsconfig batch", () => {
      const result = classifyFinding(makeFinding("structure", "TypeScript strict mode not enabled"));
      expect(result.autoFixable).toBe(true);
      expect(result.risk).toBe("low");
      expect(result.batchKey).toBe("tsconfig");
    });

    it("marks path aliases as low risk tsconfig batch", () => {
      const result = classifyFinding(makeFinding("structure", "No path aliases configured"));
      expect(result.autoFixable).toBe(true);
      expect(result.risk).toBe("low");
      expect(result.batchKey).toBe("tsconfig");
    });

    it("marks missing config file as low risk", () => {
      const result = classifyFinding(makeFinding("structure", "Missing config: .gitignore"));
      expect(result.autoFixable).toBe(true);
      expect(result.risk).toBe("low");
      expect(result.batchKey).toBe("config-files");
    });

    it("marks missing turbo as low risk config-files", () => {
      const result = classifyFinding(makeFinding("structure", "Missing turbo.json"));
      expect(result.autoFixable).toBe(true);
      expect(result.risk).toBe("low");
      expect(result.batchKey).toBe("config-files");
    });

    it("defaults other structure findings to low risk structure-other", () => {
      const result = classifyFinding(makeFinding("structure", "Some other structure issue"));
      expect(result.autoFixable).toBe(true);
      expect(result.risk).toBe("low");
      expect(result.batchKey).toBe("structure-other");
    });

    it("strips workspace prefix before matching", () => {
      const result = classifyFinding(makeFinding("structure", "[my-pkg] Missing script: lint"));
      expect(result.autoFixable).toBe(true);
      expect(result.batchKey).toBe("scripts");
    });
  });

  describe("ai-files category", () => {
    it("marks all ai-files as auto-fixable low risk", () => {
      const result = classifyFinding(makeFinding("ai-files", "Missing CLAUDE.md"));
      expect(result.autoFixable).toBe(true);
      expect(result.risk).toBe("low");
      expect(result.batchKey).toBe("ai-files");
    });
  });

  describe("dependencies category", () => {
    it("marks no package.json as not auto-fixable", () => {
      const result = classifyFinding(makeFinding("dependencies", "No package.json found"));
      expect(result.autoFixable).toBe(false);
      expect(result.risk).toBe("high");
    });

    it("marks 'missing package.json' exactly as not auto-fixable", () => {
      const result = classifyFinding(makeFinding("dependencies", "Missing package.json"));
      expect(result.autoFixable).toBe(false);
      expect(result.risk).toBe("high");
    });

    it("marks banned dependency as medium risk", () => {
      const result = classifyFinding(makeFinding("dependencies", "Banned dependency: moment"));
      expect(result.autoFixable).toBe(true);
      expect(result.risk).toBe("medium");
      expect(result.batchKey).toBe("dependencies-banned");
    });

    it("marks outdated version as medium risk", () => {
      const result = classifyFinding(makeFinding("dependencies", "Outdated: react@17"));
      expect(result.autoFixable).toBe(true);
      expect(result.risk).toBe("medium");
      expect(result.batchKey).toBe("dependencies-versions");
    });

    it("marks version-related finding as medium risk", () => {
      const result = classifyFinding(makeFinding("dependencies", "Node version mismatch"));
      expect(result.autoFixable).toBe(true);
      expect(result.risk).toBe("medium");
      expect(result.batchKey).toBe("dependencies-versions");
    });

    it("defaults other dependency findings to medium risk", () => {
      const result = classifyFinding(makeFinding("dependencies", "Some other dep issue"));
      expect(result.autoFixable).toBe(true);
      expect(result.risk).toBe("medium");
      expect(result.batchKey).toBe("dependencies-other");
    });
  });

  describe("config category", () => {
    it("marks config findings as auto-fixable low risk", () => {
      const result = classifyFinding(makeFinding("config", "Missing biome.json"));
      expect(result.autoFixable).toBe(true);
      expect(result.risk).toBe("low");
      expect(result.batchKey).toBe("config-files");
    });
  });

  describe("custom category", () => {
    it("marks custom findings as not auto-fixable, medium risk", () => {
      const result = classifyFinding(makeFinding("custom", "Custom rule violation"));
      expect(result.autoFixable).toBe(false);
      expect(result.risk).toBe("medium");
      expect(result.batchKey).toBe("manual");
    });
  });

  describe("unknown category", () => {
    it("defaults to not auto-fixable, high risk", () => {
      const result = classifyFinding(makeFinding("dependencies" as Finding["category"], ""));
      expect(result).toBeDefined();

      const unknownResult = classifyFinding({
        ...makeFinding("dependencies", "test"),
        category: "unknown" as Finding["category"],
      });
      expect(unknownResult.autoFixable).toBe(false);
      expect(unknownResult.risk).toBe("high");
      expect(unknownResult.batchKey).toBe("manual");
    });
  });
});
