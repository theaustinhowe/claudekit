/**
 * Binary validation utility for the GoGo orchestrator.
 *
 * Validates that required CLI tools are installed and accessible.
 * Used during startup to provide clear feedback about missing dependencies.
 */

import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";

const execFile = promisify(execFileCb);

export interface BinaryInfo {
  name: string;
  command: string;
  versionFlag: string;
  required: boolean;
  description: string;
  installHint: string;
}

export interface BinaryCheckResult {
  name: string;
  found: boolean;
  version: string | null;
  path: string | null;
  error: string | null;
}

export interface ValidationResult {
  allRequiredFound: boolean;
  results: BinaryCheckResult[];
  missingRequired: BinaryCheckResult[];
  missingOptional: BinaryCheckResult[];
}

/**
 * List of binaries to check during startup.
 */
const BINARIES: BinaryInfo[] = [
  {
    name: "git",
    command: "git",
    versionFlag: "--version",
    required: true,
    description: "Version control (required for worktrees)",
    installHint:
      "Install via: brew install git (macOS) | apt install git (Linux) | https://git-scm.com",
  },
  {
    name: "node",
    command: "node",
    versionFlag: "--version",
    required: true,
    description: "JavaScript runtime",
    installHint:
      "Install via: https://nodejs.org or nvm (https://github.com/nvm-sh/nvm)",
  },
  {
    name: "claude",
    command: "claude",
    versionFlag: "--version",
    required: false,
    description: "Claude Code CLI (optional, for claude-code agent provider)",
    installHint: "Install via: npm install -g @anthropic-ai/claude-code",
  },
];

/**
 * Get the path to a binary using `which` (Unix) or `where` (Windows).
 */
async function getBinaryPath(command: string): Promise<string | null> {
  try {
    const whichCommand = process.platform === "win32" ? "where" : "which";
    const { stdout } = await execFile(whichCommand, [command], {
      timeout: 5000,
    });
    return stdout.trim().split("\n")[0] || null;
  } catch {
    return null;
  }
}

/**
 * Check if a single binary is available and get its version.
 */
async function checkBinary(info: BinaryInfo): Promise<BinaryCheckResult> {
  const result: BinaryCheckResult = {
    name: info.name,
    found: false,
    version: null,
    path: null,
    error: null,
  };

  try {
    // Get the path first
    result.path = await getBinaryPath(info.command);
    if (!result.path) {
      result.error = `${info.name} not found in PATH`;
      return result;
    }

    // Get version
    const { stdout, stderr } = await execFile(
      info.command,
      [info.versionFlag],
      {
        timeout: 5000,
      },
    );
    const output = stdout || stderr;
    // Extract version number from output (handles various formats)
    const versionMatch = output.match(/\d+\.\d+(\.\d+)?/);
    result.version = versionMatch
      ? versionMatch[0]
      : output.trim().slice(0, 50);
    result.found = true;
  } catch (error) {
    result.error = error instanceof Error ? error.message : "Unknown error";
  }

  return result;
}

/**
 * Check all configured binaries.
 */
export async function checkBinaries(): Promise<ValidationResult> {
  const results = await Promise.all(BINARIES.map(checkBinary));

  const missingRequired = results.filter(
    (r, i) => !r.found && BINARIES[i].required,
  );
  const missingOptional = results.filter(
    (r, i) => !r.found && !BINARIES[i].required,
  );

  return {
    allRequiredFound: missingRequired.length === 0,
    results,
    missingRequired,
    missingOptional,
  };
}

/**
 * Format validation results for console output.
 */
export function formatValidationResults(validation: ValidationResult): string {
  const lines: string[] = [];

  lines.push("Binary Dependencies:");
  lines.push("─".repeat(50));

  for (let i = 0; i < validation.results.length; i++) {
    const result = validation.results[i];
    const info = BINARIES[i];
    const status = result.found
      ? `✓ ${result.version}`
      : `✗ missing${info.required ? " (REQUIRED)" : " (optional)"}`;

    lines.push(`  ${info.name.padEnd(10)} ${status}`);
    if (!result.found) {
      lines.push(`             ${info.installHint}`);
    }
  }

  lines.push("─".repeat(50));

  if (!validation.allRequiredFound) {
    lines.push("");
    lines.push(
      "ERROR: Required binaries are missing. Please install them and restart.",
    );
  }

  return lines.join("\n");
}
