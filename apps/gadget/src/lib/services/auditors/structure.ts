import fs from "node:fs";
import path from "node:path";
import type { Policy } from "@/lib/types";
import type { AuditFinding } from "./index";

interface WorkspacePackage {
  name: string;
  path: string;
}

/**
 * Resolve workspace packages from pnpm-workspace.yaml or package.json workspaces.
 * Returns an array of { name, path } for each workspace package that has a package.json.
 */
export function resolveWorkspacePackages(repoPath: string): WorkspacePackage[] {
  const packages: WorkspacePackage[] = [];
  const globs: string[] = [];

  // Try pnpm-workspace.yaml first
  const pnpmWsPath = path.join(repoPath, "pnpm-workspace.yaml");
  if (fs.existsSync(pnpmWsPath)) {
    try {
      const content = fs.readFileSync(pnpmWsPath, "utf-8");
      // Simple YAML parse: extract lines like "  - packages/*" or "  - 'apps/*'"
      for (const line of content.split("\n")) {
        const match = line.match(/^\s*-\s+['"]?([^'"#\s]+)['"]?\s*$/);
        if (match) {
          globs.push(match[1]);
        }
      }
    } catch {
      /* ignore read errors */
    }
  }

  // Fallback: package.json workspaces field
  if (globs.length === 0) {
    const pkgPath = path.join(repoPath, "package.json");
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
        const workspaces = Array.isArray(pkg.workspaces)
          ? pkg.workspaces
          : Array.isArray(pkg.workspaces?.packages)
            ? pkg.workspaces.packages
            : [];
        globs.push(...workspaces);
      } catch {
        /* ignore parse errors */
      }
    }
  }

  // Resolve globs to actual directories (supports simple "dir/*" patterns)
  for (const glob of globs) {
    const basePath = glob.replace(/\/?\*$/, "");
    const fullBase = path.join(repoPath, basePath);

    if (glob.endsWith("/*") || glob.endsWith("/**")) {
      // Enumerate subdirectories
      if (fs.existsSync(fullBase) && fs.statSync(fullBase).isDirectory()) {
        try {
          const entries = fs.readdirSync(fullBase, { withFileTypes: true });
          for (const entry of entries) {
            if (!entry.isDirectory()) continue;
            const pkgDir = path.join(fullBase, entry.name);
            const pkgJsonPath = path.join(pkgDir, "package.json");
            if (fs.existsSync(pkgJsonPath)) {
              try {
                const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, "utf-8"));
                packages.push({
                  name: pkgJson.name || entry.name,
                  path: pkgDir,
                });
              } catch {
                packages.push({ name: entry.name, path: pkgDir });
              }
            }
          }
        } catch {
          /* ignore read errors */
        }
      }
    } else {
      // Exact path
      const pkgJsonPath = path.join(fullBase, "package.json");
      if (fs.existsSync(pkgJsonPath)) {
        try {
          const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, "utf-8"));
          packages.push({ name: pkgJson.name || basePath, path: fullBase });
        } catch {
          packages.push({ name: basePath, path: fullBase });
        }
      }
    }
  }

  return packages;
}

const EXPECTED_SCRIPTS = ["dev", "build", "test", "lint"];

const CONFIG_FILES = [
  { name: "tsconfig.json", importance: "warning" as const },
  {
    name: "biome.json",
    importance: "info" as const,
    alternatives: [
      "biome.jsonc",
      ".eslintrc.json",
      ".eslintrc.js",
      ".eslintrc.cjs",
      "eslint.config.js",
      "eslint.config.mjs",
      ".prettierrc",
      ".prettierrc.json",
      ".prettierrc.js",
      "prettier.config.js",
    ],
  },
  { name: ".gitignore", importance: "warning" as const },
];

export function auditStructure(repoPath: string, _policy: Policy): AuditFinding[] {
  const findings: AuditFinding[] = [];

  // Check for expected scripts
  const pkgPath = path.join(repoPath, "package.json");
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
      const scripts = pkg.scripts || {};

      for (const script of EXPECTED_SCRIPTS) {
        if (!scripts[script]) {
          findings.push({
            category: "structure",
            severity: "warning",
            title: `Missing script: ${script}`,
            details: `No "${script}" script defined in package.json`,
            suggestedActions: [`Add a "${script}" script to package.json`],
          });
        }
      }

      // Check for format script — accept biome, prettier, or dedicated format scripts
      const hasFormatScript =
        scripts.format ||
        Object.values(scripts).some(
          (v) => typeof v === "string" && (/\bbiome\s+(format|check)\b/.test(v) || /\bprettier\b/.test(v)),
        );
      if (!hasFormatScript) {
        findings.push({
          category: "structure",
          severity: "info",
          title: "Missing format script",
          details: "No formatting script found in package.json",
          suggestedActions: ['Add "format": "biome format --write ." to package.json scripts'],
        });
      }
    } catch {
      findings.push({
        category: "structure",
        severity: "warning",
        title: "Invalid package.json",
        details: "package.json could not be parsed — script checks skipped",
        suggestedActions: ["Fix JSON syntax in package.json"],
      });
    }
  }

  // Check for config files
  for (const config of CONFIG_FILES) {
    const allPaths = [config.name, ...(config.alternatives || [])];
    const exists = allPaths.some((p) => fs.existsSync(path.join(repoPath, p)));

    if (!exists) {
      findings.push({
        category: "structure",
        severity: config.importance,
        title: `Missing config: ${config.name}`,
        details: `No ${config.name} found. Checked: ${allPaths.join(", ")}`,
        suggestedActions: [`Create ${config.name}`],
      });
    }
  }

  // Check tsconfig quality
  const tsconfigPath = path.join(repoPath, "tsconfig.json");
  if (fs.existsSync(tsconfigPath)) {
    try {
      const tsconfig = JSON.parse(fs.readFileSync(tsconfigPath, "utf-8"));
      const compilerOptions = tsconfig.compilerOptions || {};

      if (!compilerOptions.strict && compilerOptions.strict !== true) {
        findings.push({
          category: "structure",
          severity: "warning",
          title: "TypeScript strict mode disabled",
          details: 'tsconfig.json does not have "strict": true',
          suggestedActions: ['Enable "strict": true in tsconfig.json compilerOptions'],
        });
      }

      if (!compilerOptions.paths) {
        findings.push({
          category: "structure",
          severity: "info",
          title: "No path aliases configured",
          details: "tsconfig.json has no path aliases. Consider adding @/* alias.",
          suggestedActions: ['Add "paths": { "@/*": ["./src/*"] } to tsconfig.json'],
        });
      }
    } catch {
      findings.push({
        category: "structure",
        severity: "warning",
        title: "Invalid tsconfig.json",
        details: "tsconfig.json could not be parsed",
        suggestedActions: ["Fix JSON syntax in tsconfig.json"],
      });
    }
  }

  // Check for monorepo workspace configuration
  const isMonorepo =
    fs.existsSync(path.join(repoPath, "pnpm-workspace.yaml")) ||
    fs.existsSync(path.join(repoPath, "turbo.json")) ||
    fs.existsSync(path.join(repoPath, "lerna.json"));

  if (isMonorepo) {
    // Check for turbo.json
    if (!fs.existsSync(path.join(repoPath, "turbo.json"))) {
      findings.push({
        category: "structure",
        severity: "info",
        title: "Missing turbo.json",
        details: "Monorepo detected but no Turborepo config found",
        suggestedActions: ["Consider adding turbo.json for build orchestration"],
      });
    }

    // Check for workspace packages
    if (fs.existsSync(path.join(repoPath, "packages"))) {
      const packagesDir = path.join(repoPath, "packages");
      try {
        const packages = fs.readdirSync(packagesDir, { withFileTypes: true });
        for (const pkg of packages) {
          if (!pkg.isDirectory()) continue;
          const subPkgPath = path.join(packagesDir, pkg.name, "package.json");
          if (!fs.existsSync(subPkgPath)) {
            findings.push({
              category: "structure",
              severity: "warning",
              title: `Missing package.json in workspace: ${pkg.name}`,
              details: `Workspace package ${pkg.name} has no package.json`,
              suggestedActions: [`Create package.json in packages/${pkg.name}`],
            });
          }
        }
      } catch {
        findings.push({
          category: "structure",
          severity: "info",
          title: "Could not read packages directory",
          details: "Permission denied or other error reading packages/ directory",
          suggestedActions: ["Check directory permissions"],
        });
      }
    }
  }

  return findings;
}
