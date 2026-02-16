import fs from "node:fs";
import path from "node:path";
import { getDb } from "@/lib/db";
import { execute, queryAll } from "@/lib/db/helpers";
import type { Finding, FindingCategory, FixAction, Severity } from "@/lib/types";
import { generateId } from "@/lib/utils";

/** Raw DB row for findings — suggested_actions is stored as JSON text */
interface FindingRow {
  id: string;
  repo_id: string;
  scan_id: string | null;
  category: string;
  severity: string;
  title: string;
  details: string | null;
  evidence: string | null;
  suggested_actions: string;
  created_at: string;
}

interface FixPlan {
  finding: Finding;
  action: Omit<FixAction, "id" | "created_at">;
}

function generateReadmeContent(repoName: string): string {
  return `# ${repoName}

## Overview

TODO: Add project description

## Getting Started

### Prerequisites

- Node.js >= 18
- pnpm (recommended)

### Installation

\`\`\`bash
pnpm install
\`\`\`

### Development

\`\`\`bash
pnpm dev
\`\`\`

### Build

\`\`\`bash
pnpm build
\`\`\`

### Testing

\`\`\`bash
pnpm test
\`\`\`

## Architecture

TODO: Add architecture overview

## Configuration

TODO: Add configuration documentation

## API

TODO: Add API documentation
`;
}

function generateClaudeMdContent(repoName: string): string {
  return `# ${repoName}

## Project Overview

TODO: Describe what this project does and its core purpose.

## Tech Stack

TODO: List the key technologies used.

## Key Concepts

TODO: Describe the main abstractions and patterns used.

## Development Workflow

1. Install dependencies: \`pnpm install\`
2. Run development server: \`pnpm dev\`
3. Run tests: \`pnpm test\`
4. Build for production: \`pnpm build\`

## Important Notes

TODO: Add any gotchas, constraints, or important decisions.
`;
}

function generateContributingContent(): string {
  return `# Contributing

## Development Setup

1. Fork and clone the repository
2. Install dependencies: \`pnpm install\`
3. Create a feature branch: \`git checkout -b feature/my-feature\`
4. Make your changes
5. Run tests: \`pnpm test\`
6. Submit a pull request

## Code Style

- Use TypeScript for all new files
- Follow existing patterns in the codebase
- Run \`pnpm lint\` before committing

## Commit Messages

Use conventional commit format:
- \`feat:\` new features
- \`fix:\` bug fixes
- \`docs:\` documentation changes
- \`chore:\` maintenance tasks
`;
}

async function planSingleFinding(
  finding: FindingRow,
  repoId: string,
  repoPath: string,
  repoName: string,
): Promise<FixPlan | null> {
  const suggestedActions = JSON.parse(finding.suggested_actions || "[]");

  switch (finding.category) {
    case "ai-files": {
      if (finding.title.startsWith("Missing:")) {
        const fileName = finding.title.replace("Missing: ", "");
        let fileContent = "";
        let diffFile = "";

        switch (fileName) {
          case "README":
            diffFile = "README.md";
            fileContent = generateReadmeContent(repoName);
            break;
          case "CLAUDE.md":
            diffFile = "CLAUDE.md";
            fileContent = generateClaudeMdContent(repoName);
            break;
          case "CONTRIBUTING":
            diffFile = "CONTRIBUTING.md";
            fileContent = generateContributingContent();
            break;
          default:
            diffFile = fileName;
            fileContent = `# ${fileName}\n\nTODO: Add content\n`;
        }

        return {
          finding: parseFinding(finding),
          action: {
            repo_id: repoId,
            finding_id: finding.id,
            scan_id: finding.scan_id,
            title: `Create ${diffFile}`,
            description: `Generate ${diffFile} with template content`,
            impact: "docs",
            risk: "low",
            requires_approval: false,
            diff_file: diffFile,
            diff_before: null,
            diff_after: fileContent,
          },
        };
      }
      break;
    }

    case "dependencies": {
      if (finding.title.startsWith("Banned dependency:")) {
        const depName = finding.title.replace("Banned dependency: ", "");
        const pkgPath = path.join(repoPath, "package.json");

        if (fs.existsSync(pkgPath)) {
          try {
            const pkgContent = fs.readFileSync(pkgPath, "utf-8");
            const pkg = JSON.parse(pkgContent);
            const newPkg = { ...pkg };

            if (newPkg.dependencies?.[depName]) {
              delete newPkg.dependencies[depName];
            }
            if (newPkg.devDependencies?.[depName]) {
              delete newPkg.devDependencies[depName];
            }

            const replacement = suggestedActions
              .find((a: string) => a.startsWith("Replace with"))
              ?.replace("Replace with ", "");

            if (replacement && newPkg.dependencies) {
              newPkg.dependencies[replacement] = "latest";
            }

            return {
              finding: parseFinding(finding),
              action: {
                repo_id: repoId,
                finding_id: finding.id,
                scan_id: finding.scan_id,
                title: `Remove banned dependency: ${depName}`,
                description: replacement
                  ? `Replace ${depName} with ${replacement}`
                  : `Remove ${depName} from package.json`,
                impact: "dependencies",
                risk: "medium",
                requires_approval: true,
                diff_file: "package.json",
                diff_before: JSON.stringify(pkg, null, 2),
                diff_after: JSON.stringify(newPkg, null, 2),
              },
            };
          } catch {
            // ignore
          }
        }
      }
      break;
    }

    case "structure": {
      if (finding.title.startsWith("Missing package.json in workspace:")) {
        const pkgName = finding.title.replace("Missing package.json in workspace: ", "").trim();
        const diffFile = `packages/${pkgName}/package.json`;
        const fileContent = generateWorkspacePackageJson(pkgName, repoPath);

        return {
          finding: parseFinding(finding),
          action: {
            repo_id: repoId,
            finding_id: finding.id,
            scan_id: finding.scan_id,
            title: `Create package.json for workspace: ${pkgName}`,
            description: `Generate a starter package.json for the ${pkgName} workspace package`,
            impact: "config",
            risk: "medium",
            requires_approval: true,
            diff_file: diffFile,
            diff_before: null,
            diff_after: fileContent,
          },
        };
      }
      if (finding.title.startsWith("Missing script:")) {
        const scriptName = finding.title.replace("Missing script: ", "");
        const pkgPath = path.join(repoPath, "package.json");

        if (fs.existsSync(pkgPath)) {
          try {
            const pkgContent = fs.readFileSync(pkgPath, "utf-8");
            const pkg = JSON.parse(pkgContent);
            const newPkg = {
              ...pkg,
              scripts: {
                ...pkg.scripts,
                [scriptName]: getDefaultScript(scriptName),
              },
            };

            return {
              finding: parseFinding(finding),
              action: {
                repo_id: repoId,
                finding_id: finding.id,
                scan_id: finding.scan_id,
                title: `Add "${scriptName}" script`,
                description: `Add missing "${scriptName}" script to package.json`,
                impact: "config",
                risk: "low",
                requires_approval: false,
                diff_file: "package.json",
                diff_before: JSON.stringify(pkg, null, 2),
                diff_after: JSON.stringify(newPkg, null, 2),
              },
            };
          } catch {
            // ignore
          }
        }
      }
      break;
    }
  }

  return null;
}

export async function planFixes(
  repoId: string,
  repoPath: string,
  repoName: string,
  scanId?: string,
): Promise<FixPlan[]> {
  const db = await getDb();
  const findings = scanId
    ? await queryAll<FindingRow>(db, "SELECT * FROM findings WHERE repo_id = ? AND scan_id = ?", [repoId, scanId])
    : await queryAll<FindingRow>(db, "SELECT * FROM findings WHERE repo_id = ?", [repoId]);

  const results = await Promise.allSettled(findings.map((f) => planSingleFinding(f, repoId, repoPath, repoName)));

  return results
    .filter((r): r is PromiseFulfilledResult<FixPlan | null> => r.status === "fulfilled")
    .map((r) => r.value)
    .filter((v): v is FixPlan => v !== null);
}

export async function storePlannedFixes(plans: FixPlan[], repoId?: string, scanId?: string) {
  const db = await getDb();

  await execute(db, "BEGIN TRANSACTION");
  try {
    // Delete stale fix actions for this repo+scan before inserting new ones
    if (repoId && scanId) {
      await execute(db, "DELETE FROM fix_actions WHERE repo_id = ? AND scan_id = ?", [repoId, scanId]);
    }
    for (const plan of plans) {
      const a = plan.action;
      await execute(
        db,
        `
        INSERT INTO fix_actions (id, repo_id, finding_id, scan_id, title, description, impact, risk, requires_approval, diff_file, diff_before, diff_after)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
        [
          generateId(),
          a.repo_id,
          a.finding_id,
          a.scan_id,
          a.title,
          a.description,
          a.impact,
          a.risk,
          a.requires_approval ? "true" : "false",
          a.diff_file,
          a.diff_before,
          a.diff_after,
        ],
      );
    }
    await execute(db, "COMMIT");
  } catch (err) {
    await execute(db, "ROLLBACK");
    throw err;
  }
}

function generateWorkspacePackageJson(pkgName: string, repoPath: string): string {
  // Read the root package.json to infer scope
  let scope = "";
  const rootPkgPath = path.join(repoPath, "package.json");
  if (fs.existsSync(rootPkgPath)) {
    try {
      const rootPkg = JSON.parse(fs.readFileSync(rootPkgPath, "utf-8"));
      // Infer scope from root package name (e.g. "@myorg/root" → "@myorg")
      if (rootPkg.name?.startsWith("@")) {
        scope = rootPkg.name.split("/")[0];
      }
    } catch {
      /* ignore */
    }
  }

  const fullName = scope ? `${scope}/${pkgName}` : pkgName;
  const pkg: Record<string, unknown> = {
    name: fullName,
    version: "0.0.0",
    private: true,
    main: "src/index.ts",
    types: "src/index.ts",
    scripts: {
      build: "tsc --build",
      dev: "tsc --build --watch",
      lint: "biome check .",
    },
  };

  return `${JSON.stringify(pkg, null, 2)}\n`;
}

function getDefaultScript(name: string): string {
  switch (name) {
    case "dev":
      return "next dev";
    case "build":
      return "next build";
    case "test":
      return 'echo "Error: no test specified" && exit 1';
    case "lint":
      return "biome check .";
    case "format":
      return "biome format --write .";
    default:
      return `echo "TODO: implement ${name}"`;
  }
}

function parseFinding(row: FindingRow): Finding {
  return {
    ...row,
    category: row.category as FindingCategory,
    severity: row.severity as Severity,
    suggested_actions: JSON.parse(row.suggested_actions || "[]"),
  };
}
