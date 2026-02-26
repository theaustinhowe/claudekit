export type ToolCategory = "package-manager" | "runtime" | "dev-tool" | "vcs" | "ai-tool";

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
  updateCommand?: string;
  shellFunction?: boolean;
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
