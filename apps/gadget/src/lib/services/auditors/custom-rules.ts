import fs from "node:fs";
import path from "node:path";
import type { CustomRule } from "@/lib/types";
import type { AuditFinding } from "./index";

/**
 * Evaluate custom rules against a repository path.
 * Each enabled rule produces a finding if the rule condition is violated.
 */
export function auditCustomRules(repoPath: string, rules: CustomRule[]): AuditFinding[] {
  const findings: AuditFinding[] = [];

  for (const rule of rules) {
    if (!rule.is_enabled) continue;

    try {
      const result = evaluateRule(repoPath, rule);
      if (result) {
        findings.push(result);
      }
    } catch {
      // Skip rules that fail to evaluate
    }
  }

  return findings;
}

function evaluateRule(repoPath: string, rule: CustomRule): AuditFinding | null {
  switch (rule.rule_type) {
    case "file_exists":
      return evaluateFileExists(repoPath, rule);
    case "file_missing":
      return evaluateFileMissing(repoPath, rule);
    case "file_contains":
      return evaluateFileContains(repoPath, rule);
    case "json_field":
      return evaluateJsonField(repoPath, rule);
    default:
      return null;
  }
}

function evaluateFileExists(repoPath: string, rule: CustomRule): AuditFinding | null {
  const paths = (rule.config.paths as string[]) || [];
  if (paths.length === 0) return null;

  const anyExists = paths.some((p) => fs.existsSync(path.join(repoPath, p)));
  if (anyExists) return null;

  return {
    category: rule.category,
    severity: rule.severity,
    title: rule.name,
    details: rule.description || `None of the expected files found: ${paths.join(", ")}`,
    evidence: `Checked paths: ${paths.join(", ")}`,
    suggestedActions: rule.suggested_actions,
  };
}

function evaluateFileMissing(repoPath: string, rule: CustomRule): AuditFinding | null {
  const filePath = rule.config.path as string;
  if (!filePath) return null;

  const fullPath = path.join(repoPath, filePath);
  if (!fs.existsSync(fullPath)) return null;

  return {
    category: rule.category,
    severity: rule.severity,
    title: rule.name,
    details: rule.description || `File should not exist: ${filePath}`,
    evidence: `Found: ${filePath}`,
    suggestedActions: rule.suggested_actions,
  };
}

function evaluateFileContains(repoPath: string, rule: CustomRule): AuditFinding | null {
  const filePath = rule.config.file as string;
  const pattern = rule.config.pattern as string;
  const negate = rule.config.negate as boolean;
  if (!filePath || !pattern) return null;

  const fullPath = path.join(repoPath, filePath);
  if (!fs.existsSync(fullPath)) return null;

  let content: string;
  try {
    content = fs.readFileSync(fullPath, "utf-8");
  } catch {
    return null;
  }

  const regex = new RegExp(pattern);
  const matches = regex.test(content);

  // If negate: finding when pattern IS found. Otherwise: finding when pattern NOT found.
  if (negate ? matches : !matches) {
    return {
      category: rule.category,
      severity: rule.severity,
      title: rule.name,
      details:
        rule.description ||
        (negate ? `Pattern "${pattern}" found in ${filePath}` : `Pattern "${pattern}" not found in ${filePath}`),
      evidence: `File: ${filePath}, Pattern: ${pattern}`,
      suggestedActions: rule.suggested_actions,
    };
  }

  return null;
}

function evaluateJsonField(repoPath: string, rule: CustomRule): AuditFinding | null {
  const filePath = rule.config.file as string;
  const fieldPath = rule.config.field as string;
  const expected = rule.config.expected;
  if (!filePath || !fieldPath) return null;

  const fullPath = path.join(repoPath, filePath);
  if (!fs.existsSync(fullPath)) return null;

  let json: Record<string, unknown>;
  try {
    json = JSON.parse(fs.readFileSync(fullPath, "utf-8"));
  } catch {
    return null;
  }

  // Traverse dot-notation path
  const parts = fieldPath.split(".");
  let current: unknown = json;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== "object") {
      current = undefined;
      break;
    }
    current = (current as Record<string, unknown>)[part];
  }

  // Compare values
  if (current === expected) return null;
  if (JSON.stringify(current) === JSON.stringify(expected)) return null;

  return {
    category: rule.category,
    severity: rule.severity,
    title: rule.name,
    details: rule.description || `Expected ${fieldPath} = ${JSON.stringify(expected)}, got ${JSON.stringify(current)}`,
    evidence: `File: ${filePath}, Field: ${fieldPath}, Current: ${JSON.stringify(current)}, Expected: ${JSON.stringify(expected)}`,
    suggestedActions: rule.suggested_actions,
  };
}
