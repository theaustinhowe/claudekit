import fs from "node:fs";
import path from "node:path";
import type { AIFile } from "@/lib/types";
import type { AuditFinding } from "./index";

interface AIFileCheck {
  name: string;
  paths: string[];
  importance: "critical" | "warning" | "info";
  description: string;
}

const AI_FILE_CHECKS: AIFileCheck[] = [
  {
    name: "README",
    paths: ["README.md", "README", "readme.md"],
    importance: "critical",
    description: "Project documentation for developers and AI assistants",
  },
  {
    name: "CLAUDE.md",
    paths: ["CLAUDE.md"],
    importance: "warning",
    description: "Claude Code assistant instructions",
  },
  {
    name: "AGENTS.md",
    paths: ["AGENTS.md"],
    importance: "info",
    description: "Multi-agent workflow instructions",
  },
  {
    name: "copilot-instructions",
    paths: [".github/copilot-instructions.md"],
    importance: "info",
    description: "GitHub Copilot custom instructions for code review",
  },
  {
    name: "CONTRIBUTING",
    paths: ["CONTRIBUTING.md", "CONTRIBUTING"],
    importance: "warning",
    description: "Contribution guidelines for developers and AI",
  },
  {
    name: "Architecture Docs",
    paths: ["docs/architecture.md", "docs/ARCHITECTURE.md", "ARCHITECTURE.md"],
    importance: "info",
    description: "System architecture and design documentation for developers and AI",
  },
  {
    name: "API Docs",
    paths: ["docs/api.md", "docs/API.md", "API.md"],
    importance: "info",
    description: "API reference documentation",
  },
  {
    name: "Setup Guide",
    paths: ["docs/setup.md", "docs/SETUP.md", "docs/development.md"],
    importance: "info",
    description: "Development environment setup and local workflow guide",
  },
];

function fileExists(repoPath: string, filePaths: string[]): string | null {
  for (const filePath of filePaths) {
    const fullPath = path.join(repoPath, filePath);
    if (fs.existsSync(fullPath)) return fullPath;
  }
  return null;
}

function assessReadmeQuality(content: string): {
  score: number;
  missing: string[];
} {
  const sections = [
    { name: "Title/Heading", pattern: /^#\s+.+/m },
    { name: "Description", pattern: /^(?!#).{20,}/m },
    { name: "Installation", pattern: /install|setup|getting started/i },
    { name: "Usage", pattern: /usage|how to|example/i },
    { name: "Scripts/Commands", pattern: /npm|pnpm|yarn|bun|script/i },
    { name: "Architecture", pattern: /architecture|structure|overview|design/i },
    { name: "API/Endpoints", pattern: /api|endpoint|route/i },
    { name: "Configuration", pattern: /config|environment|env/i },
  ];

  const missing: string[] = [];
  let found = 0;

  for (const section of sections) {
    if (section.pattern.test(content)) {
      found++;
    } else {
      missing.push(section.name);
    }
  }

  return {
    score: Math.round((found / sections.length) * 100),
    missing,
  };
}

export function scanAIFiles(repoPath: string): AIFile[] {
  const results: AIFile[] = [];

  for (const check of AI_FILE_CHECKS) {
    const existingPath = fileExists(repoPath, check.paths);

    if (!existingPath) {
      results.push({
        name: check.name,
        path: check.paths[0],
        present: false,
      });
    } else {
      const file: AIFile = {
        name: check.name,
        path:
          check.paths.find((p) => {
            const full = path.join(repoPath, p);
            return fs.existsSync(full);
          }) || check.paths[0],
        present: true,
      };

      try {
        const content = fs.readFileSync(existingPath, "utf-8");
        if (check.name === "README") {
          const { score, missing } = assessReadmeQuality(content);
          file.quality = score;
          if (missing.length > 0) {
            file.suggestions = missing.map((s) => `Add "${s}" section`);
          }
        } else {
          // Simple quality heuristic based on content length
          const len = content.trim().length;
          file.quality = len < 50 ? 20 : len < 200 ? 50 : len < 500 ? 70 : 90;
          if (len < 50) {
            file.suggestions = [`Expand ${check.name} with more detailed content`];
          }
        }
      } catch {
        file.quality = 0;
      }

      results.push(file);
    }
  }

  return results;
}

export function auditAIFiles(repoPath: string): AuditFinding[] {
  const findings: AuditFinding[] = [];

  for (const check of AI_FILE_CHECKS) {
    const existingPath = fileExists(repoPath, check.paths);

    if (!existingPath) {
      findings.push({
        category: "ai-files",
        severity: check.importance,
        title: `Missing: ${check.name}`,
        details: `${check.description}. File not found at: ${check.paths.join(", ")}`,
        suggestedActions: [`Create ${check.paths[0]} with appropriate content`],
      });
    } else {
      // Check quality for README
      if (check.name === "README") {
        try {
          const content = fs.readFileSync(existingPath, "utf-8");
          const { score, missing } = assessReadmeQuality(content);

          if (score < 50) {
            findings.push({
              category: "ai-files",
              severity: "warning",
              title: `Low quality README (${score}%)`,
              details: `README is missing key sections: ${missing.join(", ")}`,
              evidence: `Quality score: ${score}/100. File length: ${content.length} chars`,
              suggestedActions: missing.map((s) => `Add "${s}" section to README.md`),
            });
          }
        } catch {
          // ignore read errors
        }
      }

      // Check file length for all AI files
      try {
        const content = fs.readFileSync(existingPath, "utf-8");
        if (content.trim().length < 50) {
          findings.push({
            category: "ai-files",
            severity: "info",
            title: `Minimal content: ${check.name}`,
            details: `${check.name} exists but has very little content (${content.trim().length} chars)`,
            suggestedActions: [`Expand ${check.paths[0]} with more detailed instructions`],
          });
        }
      } catch {
        // ignore
      }
    }
  }

  return findings;
}
