export type ToolCategory = "package-manager" | "runtime" | "dev-tool" | "vcs" | "ai-tool";

export type InstallMethod = "homebrew" | "npm" | "curl" | "native" | "bundled" | "unknown";

export type VersionParser = "semver-line" | "first-line" | "regex";

export type LatestVersionSource =
  | { type: "npm"; package: string }
  | { type: "github-release"; repo: string }
  | { type: "url"; url: string; parser: "nodejs-lts" | "python-eol" }
  | { type: "none" };

export interface ToolDefinition {
  id: string;
  name: string;
  category: ToolCategory;
  description: string;
  binary: string;
  versionCommand: string;
  versionParser: VersionParser;
  versionRegex?: string;
  installUrl: string;
  installCommand?: string;
  latestCommand?: string;
  latestVersionSource?: LatestVersionSource;
  /** Per-install-method update commands. */
  updateCommands?: Partial<Record<InstallMethod | "default", string>>;
  /** Whether to auto-detect install method via `which`. Default true. Set false for tools where detection is irrelevant. */
  detectInstallMethod?: boolean;
  /** Homebrew package name when it differs from binary (e.g. claude-code vs claude) */
  brewPackage?: string;
  shellFunction?: boolean;
  /** Short description of what projects/apps need this tool */
  usedFor?: string;
}

export interface ToolCheckResult {
  toolId: string;
  installed: boolean;
  currentVersion: string | null;
  latestVersion: string | null;
  updateAvailable: boolean;
  error: string | null;
  checkedAt: string;
  durationMs: number;
  metadata?: Record<string, string | null>;
}
