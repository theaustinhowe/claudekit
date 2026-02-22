export const APP_NAME = "Gadget";

export const DEFAULT_EXCLUDE_PATTERNS: string[] = ["node_modules", "dist", ".next", "vendor", "tmp", ".git"];

export const LOCKFILE_TO_PM: Record<string, string> = {
  "pnpm-lock.yaml": "pnpm",
  "package-lock.json": "npm",
  "yarn.lock": "yarn",
  "bun.lockb": "bun",
  "bun.lock": "bun",
};

export const MONOREPO_INDICATORS = ["pnpm-workspace.yaml", "turbo.json", "lerna.json", "nx.json"];

export const CONCEPT_TYPE_LABELS: Record<string, string> = {
  skill: "Skills",
  hook: "Hooks",
  command: "Commands",
  agent: "Agents",
  mcp_server: "MCP Servers",
  plugin: "Plugins",
};

export const CONCEPT_TYPE_SINGULAR: Record<string, string> = {
  skill: "Skill",
  hook: "Hook",
  command: "Command",
  agent: "Agent",
  mcp_server: "MCP Server",
  plugin: "Plugin",
};

export const CONCEPT_DISCOVERY_PATTERNS: Record<string, string[]> = {
  skill: [".claude/skills/*/SKILL.md", "skills/*/SKILL.md", "**/skills/*/SKILL.md"],
  hook: [".claude/settings.json", ".claude/settings.local.json", "**/hooks/hooks.json"],
  command: ["commands/*.md", ".claude/commands/*.md", "**/commands/*.md"],
  agent: ["agents/*.md", ".claude/agents/*.md", "**/agents/*.md"],
  mcp_server: [".mcp.json"],
  plugin: [
    ".claude-plugin/plugin.json",
    ".claude-plugin/marketplace.json",
    "**/.claude-plugin/plugin.json",
    "**/.claude-plugin/marketplace.json",
  ],
};

export const LIBRARY_REPO_ID = "__library__";
export const CURATED_SOURCE_ID = "source-curated-mcp";
export const CLAUDE_CONFIG_SOURCE_ID = "source-claude-config";

export const GITHUB_SOURCE_MCP_SERVERS = "source-gh-mcp-servers";
export const GITHUB_SOURCE_CLAUDE_CODE = "source-gh-claude-code";
export const GITHUB_SOURCE_VERCEL_AI = "source-gh-vercel-ai";

export const SOURCE_TYPE_LABELS: Record<string, string> = {
  local_repo: "Local Repo",
  github_repo: "GitHub Repo",
  mcp_list: "MCP List",
  curated: "Curated",
  claude_config: "Claude Config",
};

export const REPO_TYPE_INDICATORS: Record<string, string[]> = {
  nextjs: ["next.config.js", "next.config.mjs", "next.config.ts"],
  react: ["vite.config.ts", "vite.config.js", "craco.config.js"],
  node: ["src/index.ts", "src/server.ts", "src/app.ts"],
  library: ["tsup.config.ts", "rollup.config.js", "esbuild.config.js"],
  tanstack: ["@tanstack/react-query", "@tanstack/react-router", "@tanstack/start"],
};

export const IMAGE_MIME_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".bmp": "image/bmp",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".tiff": "image/tiff",
  ".tif": "image/tiff",
  ".svg": "image/svg+xml",
};

export const IMAGE_EXTENSIONS = new Set(Object.keys(IMAGE_MIME_TYPES));

// --- Session Constants ---

export const SESSION_EVENT_BUFFER_SIZE = 500;
export const SESSION_LOG_FLUSH_INTERVAL_MS = 2_000;
export const SESSION_HEARTBEAT_INTERVAL_MS = 15_000;

export const SESSION_TYPE_LABELS: Record<string, string> = {
  scan: "Scan",
  quick_improve: "Quick Improve",
  finding_fix: "Finding Fix",
  fix_apply: "Fix Apply",
  ai_file_gen: "AI File Gen",
  cleanup: "Cleanup",
  toolbox_command: "Tool Command",
};

export const DEFAULT_CLEANUP_FILES: string[] = [
  ".prettierrc",
  ".prettierrc.json",
  ".prettierrc.js",
  ".prettierrc.cjs",
  ".prettierrc.mjs",
  ".prettierrc.yaml",
  ".prettierrc.yml",
  ".prettierrc.toml",
  "prettier.config.js",
  "prettier.config.cjs",
  "prettier.config.mjs",
  ".prettierignore",
  ".eslintrc",
  ".eslintrc.js",
  ".eslintrc.cjs",
  ".eslintrc.json",
  ".eslintrc.yaml",
  ".eslintrc.yml",
  ".eslintignore",
  ".stylelintrc",
  ".stylelintrc.json",
  ".stylelintrc.js",
  "stylelint.config.js",
  ".stylelintignore",
  "tslint.json",
  ".huskyrc",
  ".huskyrc.json",
  ".huskyrc.js",
  ".huskyrc.yaml",
  ".huskyrc.yml",
];
