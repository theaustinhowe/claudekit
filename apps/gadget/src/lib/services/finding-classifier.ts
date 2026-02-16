import type { Finding, FixRisk } from "@/lib/types";

interface FindingClassification {
  autoFixable: boolean;
  risk: FixRisk;
  /** Findings with the same batchKey are grouped into one Claude invocation */
  batchKey: string;
  reason?: string;
}

/** Strip workspace prefix like "[package-name] " from a finding title */
function stripWorkspacePrefix(title: string): string {
  return title.replace(/^\[.*?\]\s*/, "");
}

/**
 * Classify whether a finding can be auto-fixed by Claude Code, and at what risk level.
 * Used both client-side (to disable checkboxes) and server-side (to validate API requests).
 */
export function classifyFinding(finding: Finding): FindingClassification {
  const raw = finding.title.toLowerCase();
  // Strip workspace prefix so "[pkg] missing config: .gitignore" matches the same as "missing config: .gitignore"
  const t = stripWorkspacePrefix(raw);
  const cat = finding.category;

  // --- Structure findings ---
  if (cat === "structure") {
    // Invalid JSON — risky to auto-fix (check early since "invalid" is broad)
    if (t.includes("invalid")) {
      return { autoFixable: false, risk: "high", batchKey: "manual", reason: "Requires manual inspection" };
    }
    // Missing package.json in workspace — generate a best-guess scaffold
    if (t.includes("missing package.json in workspace")) {
      return { autoFixable: true, risk: "medium", batchKey: "workspace-packages" };
    }
    // Missing scripts
    if (t.startsWith("missing script:") || t === "missing format script") {
      return { autoFixable: true, risk: "low", batchKey: "scripts" };
    }
    // TS strict mode
    if (t.includes("strict mode")) {
      return { autoFixable: true, risk: "low", batchKey: "tsconfig" };
    }
    // Path aliases
    if (t.includes("path aliases")) {
      return { autoFixable: true, risk: "low", batchKey: "tsconfig" };
    }
    // Missing config files (.gitignore, tsconfig, biome, etc.)
    if (t.startsWith("missing config:")) {
      return { autoFixable: true, risk: "low", batchKey: "config-files" };
    }
    // Missing turbo.json
    if (t.includes("missing turbo")) {
      return { autoFixable: true, risk: "low", batchKey: "config-files" };
    }
    // Any other structure finding — let Claude try
    return { autoFixable: true, risk: "low", batchKey: "structure-other" };
  }

  // --- AI files findings ---
  if (cat === "ai-files") {
    // All AI file findings are fixable — missing files, minimal content, low quality
    return { autoFixable: true, risk: "low", batchKey: "ai-files" };
  }

  // --- Dependency findings ---
  if (cat === "dependencies") {
    // Missing package.json — not auto-fixable
    if (t.includes("no package.json") || t === "missing package.json") {
      return { autoFixable: false, risk: "high", batchKey: "manual", reason: "Fundamental project file missing" };
    }
    // Banned dependencies — medium risk (requires removing/replacing packages)
    if (t.includes("banned dependency") || t.includes("banned package")) {
      return { autoFixable: true, risk: "medium", batchKey: "dependencies-banned" };
    }
    // Outdated versions — medium risk
    if (t.includes("outdated") || t.includes("version")) {
      return { autoFixable: true, risk: "medium", batchKey: "dependencies-versions" };
    }
    // Any other dependency finding — let Claude try at medium risk
    return { autoFixable: true, risk: "medium", batchKey: "dependencies-other" };
  }

  // --- Config findings ---
  if (cat === "config") {
    return { autoFixable: true, risk: "low", batchKey: "config-files" };
  }

  // --- Custom findings ---
  if (cat === "custom") {
    return { autoFixable: false, risk: "medium", batchKey: "manual" };
  }

  // Default: not auto-fixable
  return { autoFixable: false, risk: "high", batchKey: "manual", reason: "Cannot be auto-fixed" };
}
