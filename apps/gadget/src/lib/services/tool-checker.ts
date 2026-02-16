import { execFile, execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type { ToolDefinition } from "@/lib/constants/tools";
import type { ToolCheckResult } from "@/lib/types";
import { isNewerVersion, resolveLatestVersion } from "./version-resolver";

const execFileAsync = promisify(execFile);

const CHECK_TIMEOUT_MS = 5000;
const MAX_CONCURRENCY = 4;

/** Returns true if the error indicates the tool binary was not found (missing), not a real failure */
function isNotFoundError(err: NodeJS.ErrnoException): boolean {
  if (err.code === "ENOENT") return true;
  const msg = (err.message || "").toLowerCase();
  return msg.includes("command not found") || msg.includes("not found") || msg.includes("no such file");
}

function parseVersion(output: string, tool: ToolDefinition): string | null {
  const text = output.trim();
  if (!text) return null;

  switch (tool.versionParser) {
    case "semver-line": {
      const match = text.match(/v?(\d+\.\d+\.\d+)/);
      return match ? match[1] : text.split("\n")[0].trim();
    }
    case "first-line":
      return text.split("\n")[0].trim();
    case "regex": {
      if (!tool.versionRegex) return text.split("\n")[0].trim();
      const regex = new RegExp(tool.versionRegex);
      const match = text.match(regex);
      return match ? match[1] : text.split("\n")[0].trim();
    }
    default:
      return text.split("\n")[0].trim();
  }
}

async function checkTool(tool: ToolDefinition): Promise<ToolCheckResult> {
  const start = Date.now();

  try {
    // Special case: nvm is a shell function, not a binary
    if (tool.shellFunction && tool.id === "nvm") {
      const nvmDir = process.env.NVM_DIR || join(homedir(), ".nvm");
      const nvmScript = join(nvmDir, "nvm.sh");

      if (!existsSync(nvmScript)) {
        return {
          toolId: tool.id,
          installed: false,
          currentVersion: null,
          latestVersion: null,
          updateAvailable: false,
          error: null,
          checkedAt: new Date().toISOString(),
          durationMs: Date.now() - start,
        };
      }
    }

    // Parse the version command into executable and args
    const parts = tool.versionCommand.split(" ");
    const cmd = parts[0];
    const args = parts.slice(1);

    const { stdout, stderr } = await execFileAsync(cmd, args, {
      timeout: CHECK_TIMEOUT_MS,
      env: { ...process.env, PATH: process.env.PATH },
    });

    // Some tools output version to stderr (e.g. java)
    const output = stdout || stderr;
    const version = parseVersion(output, tool);

    // Resolve latest version in parallel (non-blocking on failure)
    let latestVersion: string | null = null;
    let updateAvailable = false;
    if (version && tool.latestVersionSource && tool.latestVersionSource.type !== "none") {
      latestVersion = await resolveLatestVersion(tool.latestVersionSource);
      if (latestVersion) {
        updateAvailable = isNewerVersion(version, latestVersion);
      }
    }

    // Collect metadata for Claude Code
    let metadata: Record<string, string | null> | undefined;
    if (tool.id === "claude") {
      metadata = detectClaudeMetadata();
    }

    return {
      toolId: tool.id,
      installed: true,
      currentVersion: version,
      latestVersion,
      updateAvailable,
      error: null,
      checkedAt: new Date().toISOString(),
      durationMs: Date.now() - start,
      metadata,
    };
  } catch (err: unknown) {
    const error = err as NodeJS.ErrnoException & { killed?: boolean };

    // Tool binary not found — treat as "missing" (not an error)
    if (isNotFoundError(error)) {
      return {
        toolId: tool.id,
        installed: false,
        currentVersion: null,
        latestVersion: null,
        updateAvailable: false,
        error: null,
        checkedAt: new Date().toISOString(),
        durationMs: Date.now() - start,
      };
    }

    if (error.killed) {
      return {
        toolId: tool.id,
        installed: false,
        currentVersion: null,
        latestVersion: null,
        updateAvailable: false,
        error: "Timed out",
        checkedAt: new Date().toISOString(),
        durationMs: Date.now() - start,
      };
    }

    return {
      toolId: tool.id,
      installed: false,
      currentVersion: null,
      latestVersion: null,
      updateAvailable: false,
      error: error.message || "Unknown error",
      checkedAt: new Date().toISOString(),
      durationMs: Date.now() - start,
    };
  }
}

function detectClaudeMetadata(): Record<string, string | null> {
  const meta: Record<string, string | null> = {};

  // Detect binary path
  try {
    const stdout = execFileSync("which", ["claude"], {
      encoding: "utf-8",
      timeout: 3000,
    });
    meta.binaryPath = stdout.trim();
  } catch {
    meta.binaryPath = null;
  }

  // Read config files for install method, auth, and plan info
  const home = homedir();

  let authMethod: string | null = null;
  let planType: string | null = null;
  let installMethod: string | null = null;

  // Check ~/.claude.json for primary config
  const mainConfig = join(home, ".claude.json");
  if (existsSync(mainConfig)) {
    try {
      const content = JSON.parse(readFileSync(mainConfig, "utf-8"));
      if (content.installMethod) {
        installMethod = String(content.installMethod);
      }
      if (content.oauthAccount || content.oauth) {
        authMethod = "oauth";
        // Extract plan/billing info from oauthAccount
        const account = content.oauthAccount || content.oauth;
        if (account.billingType) {
          planType = String(account.billingType).replace(/_/g, " ");
        }
      }
      if (!planType && (content.planType || content.plan)) {
        planType = String(content.planType || content.plan);
      }
    } catch {
      // ignore parse errors
    }
  }

  // Detect install method from binary path (more accurate than config file)
  if (meta.binaryPath) {
    const binPath = meta.binaryPath;
    if (binPath.includes("homebrew") || binPath.includes("Cellar")) {
      installMethod = "homebrew";
    } else if (binPath.includes("node_modules") || binPath.includes("npm") || binPath.includes("pnpm")) {
      installMethod = "npm";
    }
  }

  meta.installMethod = installMethod;
  meta.authMethod = authMethod;
  meta.planType = planType;

  return meta;
}

export async function checkTools(tools: ToolDefinition[]): Promise<ToolCheckResult[]> {
  const results: ToolCheckResult[] = [];
  const queue = [...tools];

  async function worker() {
    while (queue.length > 0) {
      const tool = queue.shift();
      if (!tool) break;
      const result = await checkTool(tool);
      results.push(result);
    }
  }

  const workers = Array.from({ length: Math.min(MAX_CONCURRENCY, tools.length) }, () => worker());
  await Promise.all(workers);

  // Return in original order
  const orderMap = new Map(tools.map((t, i) => [t.id, i]));
  results.sort((a, b) => (orderMap.get(a.toolId) ?? 0) - (orderMap.get(b.toolId) ?? 0));

  return results;
}
