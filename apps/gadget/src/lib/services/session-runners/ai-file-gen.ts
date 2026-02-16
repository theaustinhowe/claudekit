import fs from "node:fs";
import path from "node:path";
import { runClaude } from "@devkit/claude-runner";
import { refreshAIFileFindings } from "@/lib/actions/findings";
import { getDb } from "@/lib/db";
import { queryOne } from "@/lib/db/helpers";
import type { SessionRunner } from "@/lib/services/session-manager";
import { setSessionPid } from "@/lib/services/session-manager";
import { expandTilde } from "@/lib/utils";

function buildPrompt(fileName: string, action: "create" | "update"): string {
  const verb = action === "create" ? "Create" : "Update and improve";

  switch (fileName) {
    case "CLAUDE.md":
      return `${verb} a CLAUDE.md file for this project. Analyze the project structure, package.json, existing source code, and any configuration files to generate a comprehensive CLAUDE.md that includes: Common commands (dev, build, test, lint), Architecture overview with key directories and patterns, Important conventions and patterns used, Environment variables if applicable. Keep it concise and useful for an AI coding assistant. Write the file using the Write tool.`;

    case "AGENTS.md":
      return `${verb} an AGENTS.md file for this project. Analyze the project structure to generate an AGENTS.md that describes how to break work into specialized agents, key areas of the codebase and which agent should own each, and common multi-step workflows. Write the file using the Write tool.`;

    case "README.md":
    case "README":
      return `${verb} a README.md for this project. Analyze the codebase to create a comprehensive README with: Project title and description, Installation/setup instructions, Available scripts/commands, Architecture overview, Configuration/environment variables, Usage examples. Write the file using the Write tool.`;

    case "CONTRIBUTING.md":
    case "CONTRIBUTING":
      return `${verb} a CONTRIBUTING.md for this project. Analyze the codebase to create contribution guidelines including: Development setup steps, Code style and conventions, Pull request process, Testing requirements. Write the file using the Write tool.`;

    case ".github/copilot-instructions.md":
      return `${verb} a .github/copilot-instructions.md file for this project. This file configures GitHub Copilot for code review (see https://docs.github.com/en/copilot/tutorials/use-custom-instructions). Analyze the project to generate instructions covering: Code review standards and what to check for, Project-specific naming conventions and patterns, Testing requirements and coverage expectations, Security considerations for this codebase, Common pitfalls and anti-patterns to flag. Write the file using the Write tool.`;

    case ".claude/settings.local.json":
      return `${verb} a .claude/settings.local.json file for this project. Create a Claude Code settings file with sensible defaults for this project type. Include appropriate allowed tools and permissions. Write the file using the Write tool.`;

    case "docs/architecture.md":
    case "docs/ARCHITECTURE.md":
    case "ARCHITECTURE.md":
      return `${verb} an architecture documentation file for this project. Analyze the codebase to document: system architecture and high-level design, key components and their responsibilities, data flow between components, directory structure and organization, design decisions and trade-offs, technology stack and dependencies. Write the file using the Write tool.`;

    case "docs/api.md":
    case "docs/API.md":
    case "API.md":
      return `${verb} an API reference documentation file for this project. Analyze route handlers, API functions, and exported interfaces to document: all API endpoints with their HTTP methods and paths, request parameters and body schemas, response formats and status codes, authentication and authorization requirements, error responses and codes. Write the file using the Write tool.`;

    case "docs/setup.md":
    case "docs/SETUP.md":
    case "docs/development.md":
      return `${verb} a development setup guide for this project. Analyze package.json, configuration files, and the codebase to document: prerequisites and system requirements, step-by-step installation and setup, environment variables and configuration, available dev scripts and what they do, database setup and migrations, common development workflows and tips. Write the file using the Write tool.`;

    default:
      return `${verb} the file "${fileName}" for this project. Analyze the project structure and generate appropriate content. Write the file using the Write tool.`;
  }
}

/** Strip wrapping markdown code fences if Claude included them */
function stripCodeFences(content: string): string {
  const trimmed = content.trim();
  const match = trimmed.match(/^```(?:\w*)\n([\s\S]*?)\n```$/);
  return match ? match[1] : trimmed;
}

export function createAIFileGenRunner(metadata: Record<string, unknown>): SessionRunner {
  const repoId = metadata.repoId as string;
  const fileName = metadata.fileName as string;
  const action = (metadata.action as "create" | "update") ?? "create";

  return async ({ onProgress, signal, sessionId }) => {
    // Look up repo path
    const db = await getDb();
    const repo = await queryOne<{ local_path: string; name: string }>(
      db,
      "SELECT local_path, name FROM repos WHERE id = ?",
      [repoId],
    );
    if (!repo) throw new Error("Repository not found");

    const repoPath = expandTilde(repo.local_path);
    if (!fs.existsSync(repoPath)) throw new Error("Repository path does not exist on disk");

    // Check file recency — skip if modified within last 10 minutes
    const filePath = path.join(repoPath, fileName);
    if (fs.existsSync(filePath)) {
      const elapsed = Date.now() - fs.statSync(filePath).mtimeMs;
      if (elapsed < 10 * 60 * 1000) {
        return { result: { skipped: true, message: `${fileName} was updated recently — skipped` } };
      }
    }

    onProgress({
      type: "progress",
      phase: "launching",
      message: `Launching Claude Code to ${action} ${fileName}...`,
      progress: 5,
    });

    // Record file state before Claude runs
    const fileExistedBefore = fs.existsSync(filePath);
    const mtimeBefore = fileExistedBefore ? fs.statSync(filePath).mtimeMs : 0;

    const prompt = buildPrompt(fileName, action);

    const claudeResult = await runClaude({
      cwd: repoPath,
      prompt,
      signal,
      onPid: (pid) => setSessionPid(sessionId, pid),
      onProgress: (info) => {
        onProgress({
          type: "log",
          message: info.message,
          log: info.log,
          logType: info.logType,
        });
      },
    });

    if (claudeResult.exitCode !== 0) {
      const errMsg = claudeResult.stderr || `Claude exited with code ${claudeResult.exitCode}`;
      throw new Error(errMsg.slice(0, 500));
    }

    // Check if Claude wrote the file directly via the Write tool
    const fileWrittenByClaude =
      fs.existsSync(filePath) && (!fileExistedBefore || fs.statSync(filePath).mtimeMs > mtimeBefore);

    if (fileWrittenByClaude) {
      onProgress({ type: "log", log: "Claude wrote file directly", logType: "status" });
    } else {
      // Fallback: use captured text output
      const finalContent = stripCodeFences(claudeResult.stdout);
      if (!finalContent) throw new Error("Claude returned empty content");

      onProgress({ type: "progress", phase: "writing", message: `Writing ${fileName}...`, progress: 80 });
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(filePath, `${finalContent}\n`, "utf-8");
    }

    // Verify file exists
    onProgress({ type: "progress", phase: "verifying", message: `Verifying ${fileName}...`, progress: 90 });
    if (!fs.existsSync(filePath)) {
      throw new Error(`Failed to write ${fileName} — file verification failed`);
    }

    // Re-audit AI file findings
    try {
      await refreshAIFileFindings(repoId);
    } catch {
      // Non-fatal
    }

    return {
      result: {
        fileName,
        action,
        message: `${action === "create" ? "Created" : "Updated"} ${fileName}`,
      },
    };
  };
}
