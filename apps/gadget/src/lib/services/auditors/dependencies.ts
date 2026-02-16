import fs from "node:fs";
import path from "node:path";
import type { PackageManager, Policy } from "@/lib/types";
import type { AuditFinding } from "./index";

interface PackageJson {
  name?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  packageManager?: string;
}

function readPackageJson(repoPath: string): PackageJson | null {
  const pkgPath = path.join(repoPath, "package.json");
  if (!fs.existsSync(pkgPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
  } catch {
    return null;
  }
}

function semverSatisfies(actual: string, expected: string): boolean {
  // Simple semver check: strip prefixes and compare major.minor
  const clean = (v: string) =>
    v
      .replace(/^[\^~>=<]+/, "")
      .split(".")
      .map(Number);
  const a = clean(actual);
  const e = clean(expected);

  // If expected is a caret range (^major.minor), actual major must match
  if (expected.startsWith("^")) {
    return a[0] === e[0] && (a[1] > e[1] || (a[1] === e[1] && a[2] >= e[2]));
  }

  // If expected is >=, actual must be >= expected
  if (expected.startsWith(">=")) {
    return a[0] > e[0] || (a[0] === e[0] && a[1] >= e[1]);
  }

  // Default: major must match, minor must be >= expected
  return a[0] === e[0] && a[1] >= e[1];
}

export function auditDependencies(repoPath: string, policy: Policy): AuditFinding[] {
  const findings: AuditFinding[] = [];
  const pkg = readPackageJson(repoPath);

  if (!pkg) {
    findings.push({
      category: "dependencies",
      severity: "warning",
      title: "Missing package.json",
      details: "No package.json found in repository root",
      suggestedActions: ["Create a package.json file"],
    });
    return findings;
  }

  const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };

  // Check expected versions
  for (const [depName, expectedVersion] of Object.entries(policy.expected_versions)) {
    const actualVersion = allDeps[depName];

    if (!actualVersion) {
      // Only flag if this is a common dependency that should exist
      continue;
    }

    if (!semverSatisfies(actualVersion, expectedVersion)) {
      findings.push({
        category: "dependencies",
        severity: "warning",
        title: `Outdated: ${depName}`,
        details: `Expected ${expectedVersion}, found ${actualVersion}`,
        evidence: `"${depName}": "${actualVersion}" in package.json`,
        suggestedActions: [
          `Update ${depName} to ${expectedVersion}`,
          `Run: npm install ${depName}@${expectedVersion.replace(/^[\^~>=<]+/, "")}`,
        ],
      });
    }
  }

  // Check banned dependencies
  for (const banned of policy.banned_dependencies) {
    if (allDeps[banned.name]) {
      findings.push({
        category: "dependencies",
        severity: "critical",
        title: `Banned dependency: ${banned.name}`,
        details: banned.reason || `${banned.name} is banned by policy`,
        evidence: `"${banned.name}": "${allDeps[banned.name]}" in package.json`,
        suggestedActions: [
          `Remove ${banned.name}`,
          ...(banned.replacement ? [`Replace with ${banned.replacement}`] : []),
        ],
      });
    }
  }

  // Check package manager
  if (policy.allowed_package_managers.length > 0) {
    const lockfiles: Record<string, string> = {
      "package-lock.json": "npm",
      "pnpm-lock.yaml": "pnpm",
      "bun.lockb": "bun",
      "yarn.lock": "yarn",
    };

    let detectedPM: string | null = null;
    for (const [lockfile, pm] of Object.entries(lockfiles)) {
      if (fs.existsSync(path.join(repoPath, lockfile))) {
        detectedPM = pm;
        break;
      }
    }

    if (detectedPM && !policy.allowed_package_managers.includes(detectedPM as PackageManager)) {
      findings.push({
        category: "dependencies",
        severity: "warning",
        title: `Non-preferred package manager: ${detectedPM}`,
        details: `Using ${detectedPM}, but policy prefers ${policy.preferred_package_manager}`,
        suggestedActions: [
          `Migrate to ${policy.preferred_package_manager}`,
          `Remove the ${detectedPM} lockfile`,
          `Run: ${policy.preferred_package_manager} install`,
        ],
      });
    }
  }

  return findings;
}
