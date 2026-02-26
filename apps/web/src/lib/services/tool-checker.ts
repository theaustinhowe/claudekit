import { exec, execFile, execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type { InstallMethod, ToolCheckResult, ToolDefinition } from "@/lib/types/toolbox";
import { isNewerVersion, resolveLatestVersion } from "./version-resolver";

const execFileAsync = promisify(execFile);
const execAsync = promisify(exec);

const CHECK_TIMEOUT_MS = 5000;
const MAX_CONCURRENCY = 4;

/** Build PATH that includes common tool install directories the server might not have at startup. */
function getAugmentedPath(): string {
  const home = homedir();
  const extra = [
    join(home, ".bun", "bin"),
    join(home, ".local", "bin"),
    join(home, ".cargo", "bin"),
    "/opt/homebrew/bin",
    "/opt/homebrew/sbin",
    "/usr/local/bin",
  ];
  const current = process.env.PATH ?? "";
  const existing = new Set(current.split(":"));
  const additions = extra.filter((p) => !existing.has(p) && existsSync(p));
  return additions.length > 0 ? `${additions.join(":")}:${current}` : current;
}

let _augmentedPath: string | null = null;
function augmentedPath(): string {
  if (_augmentedPath === null) _augmentedPath = getAugmentedPath();
  return _augmentedPath;
}

/** Shared env for all child processes — uses augmented PATH. */
function checkerEnv(): NodeJS.ProcessEnv {
  return { ...process.env, PATH: augmentedPath() };
}

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

    let stdout: string;
    let stderr: string;

    if (tool.shellFunction) {
      // Shell functions (e.g. nvm) need shell interpretation for quoting/pipes
      ({ stdout, stderr } = await execAsync(tool.versionCommand, {
        timeout: CHECK_TIMEOUT_MS,
        env: checkerEnv(),
      }));
    } else {
      const parts = tool.versionCommand.split(" ");
      ({ stdout, stderr } = await execFileAsync(parts[0], parts.slice(1), {
        timeout: CHECK_TIMEOUT_MS,
        env: checkerEnv(),
      }));
    }

    const output = stdout || stderr;
    const version = parseVersion(output, tool);

    let latestVersion: string | null = null;
    let updateAvailable = false;
    if (version && tool.latestVersionSource && tool.latestVersionSource.type !== "none") {
      latestVersion = await resolveLatestVersion(tool.latestVersionSource);
      if (latestVersion) {
        updateAvailable = isNewerVersion(version, latestVersion);
      }
    }

    let metadata: Record<string, string | null> | undefined;

    // Detect install method for all tools (unless opted out)
    if (tool.detectInstallMethod !== false) {
      const method = detectInstallMethod(tool);
      metadata = { installMethod: method, binaryPath: null };
      try {
        const binaryName = tool.shellFunction ? undefined : tool.binary;
        if (binaryName) {
          const stdout = execFileSync("which", [binaryName], { encoding: "utf-8", timeout: 3000, env: checkerEnv() });
          metadata.binaryPath = stdout.trim();
        }
      } catch {
        // ignore
      }
    }

    // Claude-specific metadata (auth, plan)
    if (tool.id === "claude") {
      const claudeMeta = detectClaudeSpecificMetadata();
      metadata = { ...metadata, ...claudeMeta };
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

function detectInstallMethod(tool: ToolDefinition): InstallMethod {
  const binaryName = tool.binary;
  if (!binaryName) return "unknown";

  try {
    const stdout = execFileSync("which", [binaryName], { encoding: "utf-8", timeout: 3000, env: checkerEnv() });
    const binPath = stdout.trim();
    if (!binPath) return "unknown";

    if (binPath.includes("/opt/homebrew/") || binPath.includes("/usr/local/Cellar/")) return "homebrew";
    if (binPath.includes("node_modules") || binPath.includes("/npm/")) return "npm";
    if (binPath.includes(".nvm/versions/")) return "npm";
    if (binPath.includes(".bun/bin/")) return "curl";
    if (binPath.includes(".local/bin/") || binPath.includes(".cargo/bin/")) return "curl";
    if (binPath.startsWith("/usr/bin/")) return "native";

    return "unknown";
  } catch {
    return "unknown";
  }
}

function detectClaudeSpecificMetadata(): Record<string, string | null> {
  const meta: Record<string, string | null> = {};
  const home = homedir();

  let authMethod: string | null = null;
  let planType: string | null = null;

  const mainConfig = join(home, ".claude.json");
  if (existsSync(mainConfig)) {
    try {
      const content = JSON.parse(readFileSync(mainConfig, "utf-8"));
      if (content.oauthAccount || content.oauth) {
        authMethod = "oauth";
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

  meta.authMethod = authMethod;
  meta.planType = planType;

  return meta;
}

export async function checkTools(tools: ToolDefinition[]): Promise<ToolCheckResult[]> {
  // Recompute augmented PATH each run in case tools were installed since last check
  _augmentedPath = null;
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

  const orderMap = new Map(tools.map((t, i) => [t.id, i]));
  results.sort((a, b) => (orderMap.get(a.toolId) ?? 0) - (orderMap.get(b.toolId) ?? 0));

  return results;
}
