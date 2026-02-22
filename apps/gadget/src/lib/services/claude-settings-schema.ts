// Schema and field definitions for Claude Code settings.local.json
// Supports round-trip editing: known fields get form controls, unknown fields are preserved.

// --- Field definitions by category ---

export type FieldType =
  | "boolean"
  | "string"
  | "select"
  | "textarea"
  | "string-array"
  | "permission-rules"
  | "key-value"
  | "hooks";

export interface FieldDef {
  path: string;
  label: string;
  description: string;
  type: FieldType;
  placeholder?: string;
  options?: string[]; // for select
  envKey?: string; // if set, value is stored in env[envKey] instead of at path directly
}

export interface SettingsCategory {
  id: string;
  label: string;
  icon: string;
  fields: FieldDef[];
}

export const SETTINGS_CATEGORIES: SettingsCategory[] = [
  {
    id: "permissions",
    label: "Permissions",
    icon: "shield",
    fields: [
      {
        path: "permissions.allow",
        label: "Allow Rules",
        description: "Tool permission rules that are always allowed. Format: Tool(pattern)",
        type: "permission-rules",
        placeholder: "e.g. Bash(npm test)",
      },
      {
        path: "permissions.deny",
        label: "Deny Rules",
        description: "Tool permission rules that are always denied.",
        type: "permission-rules",
        placeholder: "e.g. Bash(rm -rf *)",
      },
      {
        path: "permissions.ask",
        label: "Ask Rules",
        description: "Tool permission rules that require user confirmation each time.",
        type: "permission-rules",
        placeholder: "e.g. WebFetch",
      },
      {
        path: "permissions.defaultMode",
        label: "Default Permission Mode",
        description: "Default behavior for tools not covered by allow/deny/ask rules.",
        type: "select",
        options: ["", "default", "plan", "acceptEdits", "bypassPermissions", "delegate", "dontAsk"],
      },
      {
        path: "permissions.additionalDirectories",
        label: "Additional Directories",
        description: "Extra directories Claude is allowed to access beyond the project root.",
        type: "string-array",
        placeholder: "/path/to/directory",
      },
      {
        path: "permissions.disableBypassPermissionsMode",
        label: "Disable Bypass Permissions Mode",
        description: "Prevent users from entering bypass permissions mode.",
        type: "select",
        options: ["", "disable"],
      },
      {
        path: "disableAllHooks",
        label: "Disable All Hooks",
        description: "Disable all hook scripts from running.",
        type: "boolean",
      },
      {
        path: "hooks",
        label: "Hooks",
        description: "Shell commands that run in response to Claude Code events (PreToolUse, PostToolUse, Stop, etc.).",
        type: "hooks",
      },
    ],
  },
  {
    id: "model",
    label: "Model",
    icon: "brain",
    fields: [
      {
        path: "model",
        label: "Model",
        description: "Default model to use for Claude Code sessions.",
        type: "select",
        options: [
          "",
          "claude-sonnet-4-6",
          "claude-opus-4-6",
          "claude-haiku-4-5-20251001",
          "claude-sonnet-4-5-20250929",
          "claude-opus-4-5-20250918",
        ],
      },
      {
        path: "alwaysThinkingEnabled",
        label: "Always Use Extended Thinking",
        description: "Enable extended thinking mode for all queries.",
        type: "boolean",
      },
      {
        path: "language",
        label: "Language",
        description: "Preferred language for Claude's responses.",
        type: "select",
        options: ["", "english", "japanese", "spanish", "french", "german", "portuguese", "chinese", "korean"],
      },
      {
        path: "outputStyle",
        label: "Output Style",
        description:
          "Adjusts Claude's system prompt. Built-in styles: Explanatory (educational insights) and Learning (collaborative, learn-by-doing).",
        type: "select",
        options: ["", "Explanatory", "Learning"],
      },
      {
        path: "availableModels",
        label: "Available Models",
        description: "List of model IDs available for selection in Claude Code.",
        type: "string-array",
        placeholder: "e.g. claude-opus-4-6",
      },
      {
        path: "_env.CLAUDE_CODE_EFFORT_LEVEL",
        label: "Effort Level",
        description: "Controls how much effort Claude puts into responses (low, medium, high).",
        type: "select",
        options: ["", "low", "medium", "high"],
        envKey: "CLAUDE_CODE_EFFORT_LEVEL",
      },
      {
        path: "_env.MAX_THINKING_TOKENS",
        label: "Max Thinking Tokens",
        description: "Maximum number of tokens for extended thinking.",
        type: "string",
        placeholder: "e.g. 10000",
        envKey: "MAX_THINKING_TOKENS",
      },
      {
        path: "_env.CLAUDE_CODE_SUBAGENT_MODEL",
        label: "Subagent Model",
        description: "Model to use for subagent (Task tool) invocations.",
        type: "string",
        placeholder: "e.g. claude-sonnet-4-5-20250929",
        envKey: "CLAUDE_CODE_SUBAGENT_MODEL",
      },
      {
        path: "_env.ANTHROPIC_DEFAULT_OPUS_MODEL",
        label: "Default Opus Model",
        description: "Override the default Opus model ID.",
        type: "string",
        placeholder: "e.g. claude-opus-4-6",
        envKey: "ANTHROPIC_DEFAULT_OPUS_MODEL",
      },
      {
        path: "_env.ANTHROPIC_DEFAULT_SONNET_MODEL",
        label: "Default Sonnet Model",
        description: "Override the default Sonnet model ID.",
        type: "string",
        placeholder: "e.g. claude-sonnet-4-5-20250929",
        envKey: "ANTHROPIC_DEFAULT_SONNET_MODEL",
      },
      {
        path: "_env.ANTHROPIC_DEFAULT_HAIKU_MODEL",
        label: "Default Haiku Model",
        description: "Override the default Haiku model ID.",
        type: "string",
        placeholder: "e.g. claude-haiku-4-5-20251001",
        envKey: "ANTHROPIC_DEFAULT_HAIKU_MODEL",
      },
      {
        path: "_env.CLAUDE_CODE_MAX_OUTPUT_TOKENS",
        label: "Max Output Tokens",
        description: "Maximum number of output tokens per response.",
        type: "string",
        placeholder: "e.g. 16000",
        envKey: "CLAUDE_CODE_MAX_OUTPUT_TOKENS",
      },
      {
        path: "fastMode",
        label: "Fast Mode",
        description: "Use fast output mode (same model, faster output)",
        type: "boolean",
      },
      {
        path: "effortLevel",
        label: "Effort Level",
        description: "Top-level effort level setting",
        type: "select",
        options: ["", "low", "medium", "high"],
      },
    ],
  },
  {
    id: "env",
    label: "Environment",
    icon: "terminal",
    fields: [
      {
        path: "env",
        label: "Environment Variables",
        description: "Environment variable overrides for Claude Code sessions.",
        type: "key-value",
      },
    ],
  },
  {
    id: "mcp",
    label: "MCP Servers",
    icon: "plug",
    fields: [
      {
        path: "enableAllProjectMcpServers",
        label: "Enable All Project MCP Servers",
        description: "Automatically enable all MCP servers defined in .mcp.json files.",
        type: "boolean",
      },
      {
        path: "enabledMcpjsonServers",
        label: "Enabled MCP Servers",
        description: "Specific MCP server names to enable from .mcp.json files.",
        type: "string-array",
        placeholder: "Server name",
      },
      {
        path: "disabledMcpjsonServers",
        label: "Disabled MCP Servers",
        description: "Specific MCP server names to disable from .mcp.json files.",
        type: "string-array",
        placeholder: "Server name",
      },
    ],
  },
  {
    id: "teams",
    label: "Agent Teams",
    icon: "users",
    fields: [
      {
        path: "teammateMode",
        label: "Teammate Display Mode",
        description:
          "How teammates are displayed. 'auto' uses split panes in tmux, in-process otherwise. The required env var is set automatically.",
        type: "select",
        options: ["", "auto", "in-process", "tmux"],
        envKey: "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS",
      },
    ],
  },
  {
    id: "execution",
    label: "Execution",
    icon: "gauge",
    fields: [
      {
        path: "maxTurnsCostUsd",
        label: "Max Turn Cost (USD)",
        description: "Maximum cost in USD per agentic turn before stopping.",
        type: "string",
        placeholder: "e.g. 5.00",
      },
      {
        path: "apiKeyHelper",
        label: "API Key Helper",
        description: "Shell command to retrieve the API key dynamically.",
        type: "string",
        placeholder: "e.g. op read op://vault/anthropic-key",
      },
      {
        path: "webSearch",
        label: "Web Search",
        description: "Allow Claude to search the web for information.",
        type: "boolean",
      },
      {
        path: "hasCompletedOnboarding",
        label: "Has Completed Onboarding",
        description: "Whether the onboarding flow has been completed.",
        type: "boolean",
      },
      {
        path: "_env.BASH_DEFAULT_TIMEOUT_MS",
        label: "Bash Default Timeout (ms)",
        description: "Default timeout in milliseconds for Bash commands.",
        type: "string",
        placeholder: "e.g. 120000",
        envKey: "BASH_DEFAULT_TIMEOUT_MS",
      },
      {
        path: "_env.BASH_MAX_TIMEOUT_MS",
        label: "Bash Max Timeout (ms)",
        description: "Maximum allowed timeout in milliseconds for Bash commands.",
        type: "string",
        placeholder: "e.g. 600000",
        envKey: "BASH_MAX_TIMEOUT_MS",
      },
      {
        path: "_env.BASH_MAX_OUTPUT_LENGTH",
        label: "Bash Max Output Length",
        description: "Maximum number of characters captured from Bash command output.",
        type: "string",
        placeholder: "e.g. 30000",
        envKey: "BASH_MAX_OUTPUT_LENGTH",
      },
      {
        path: "_env.CLAUDE_BASH_MAINTAIN_PROJECT_WORKING_DIR",
        label: "Maintain Project Working Directory",
        description: "Keep Bash commands in the project root directory instead of allowing cd.",
        type: "boolean",
        envKey: "CLAUDE_BASH_MAINTAIN_PROJECT_WORKING_DIR",
      },
      {
        path: "_env.MAX_MCP_OUTPUT_TOKENS",
        label: "Max MCP Output Tokens",
        description: "Maximum number of tokens for MCP tool output.",
        type: "string",
        placeholder: "e.g. 25000",
        envKey: "MAX_MCP_OUTPUT_TOKENS",
      },
      {
        path: "_env.ENABLE_TOOL_SEARCH",
        label: "Enable Tool Search",
        description: "Control tool search behavior. 'auto' enables when MCP servers are configured.",
        type: "select",
        options: ["", "auto", "true", "false"],
        envKey: "ENABLE_TOOL_SEARCH",
      },
      {
        path: "_env.DISABLE_PROMPT_CACHING",
        label: "Disable Prompt Caching",
        description: "Disable prompt caching for API requests.",
        type: "boolean",
        envKey: "DISABLE_PROMPT_CACHING",
      },
      {
        path: "_env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE",
        label: "Auto-Compact Threshold (%)",
        description: "Context window percentage at which auto-compaction triggers.",
        type: "string",
        placeholder: "e.g. 80",
        envKey: "CLAUDE_AUTOCOMPACT_PCT_OVERRIDE",
      },
      {
        path: "_env.CLAUDE_CODE_DISABLE_1M_CONTEXT",
        label: "Disable 1M Context",
        description: "Disable 1M token context window",
        type: "boolean",
        envKey: "CLAUDE_CODE_DISABLE_1M_CONTEXT",
      },
      {
        path: "_env.CLAUDE_CODE_ENABLE_TASKS",
        label: "Enable Tasks",
        description: "Enable the task management feature",
        type: "boolean",
        envKey: "CLAUDE_CODE_ENABLE_TASKS",
      },
      {
        path: "_env.CLAUDE_CODE_SIMPLE",
        label: "Simple Mode",
        description: "Run Claude Code in simplified mode",
        type: "boolean",
        envKey: "CLAUDE_CODE_SIMPLE",
      },
      {
        path: "_env.CLAUDE_CODE_FILE_READ_MAX_OUTPUT_TOKENS",
        label: "File Read Max Output Tokens",
        description: "Max output tokens for file reads",
        type: "string",
        placeholder: "e.g. 16000",
        envKey: "CLAUDE_CODE_FILE_READ_MAX_OUTPUT_TOKENS",
      },
    ],
  },
  {
    id: "sandbox",
    label: "Sandbox",
    icon: "box",
    fields: [
      {
        path: "sandbox.enabled",
        label: "Enable Sandbox",
        description: "Run commands in a sandboxed environment for safety.",
        type: "boolean",
      },
      {
        path: "sandbox.autoAllowBashIfSandboxed",
        label: "Auto-Allow Bash When Sandboxed",
        description: "Automatically allow all Bash commands when sandbox is enabled.",
        type: "boolean",
      },
      {
        path: "sandbox.excludedCommands",
        label: "Excluded Commands",
        description: "Commands that bypass the sandbox even when it's enabled.",
        type: "string-array",
        placeholder: "e.g. git push",
      },
      {
        path: "sandbox.network.allowedDomains",
        label: "Allowed Network Domains",
        description: "Domains the sandbox is allowed to access for network requests.",
        type: "string-array",
        placeholder: "e.g. api.example.com",
      },
      {
        path: "sandbox.network.allowUnixSockets",
        label: "Allowed Unix Sockets",
        description: "Unix socket paths the sandbox is allowed to access.",
        type: "string-array",
        placeholder: "e.g. /tmp/my.sock",
      },
      {
        path: "sandbox.network.allowAllUnixSockets",
        label: "Allow All Unix Sockets",
        description: "Allow the sandbox to access all Unix sockets.",
        type: "boolean",
      },
      {
        path: "sandbox.network.allowLocalBinding",
        label: "Allow Local Binding",
        description: "Allow the sandbox to bind to local network ports.",
        type: "boolean",
      },
      {
        path: "enableWeakerNestedSandbox",
        label: "Enable Weaker Nested Sandbox",
        description: "Use a less restrictive sandbox for nested processes (may be needed for some tools).",
        type: "boolean",
      },
      {
        path: "sandbox.allowUnsandboxedCommands",
        label: "Allow Unsandboxed Commands",
        description: "Allow certain commands to run outside the sandbox",
        type: "boolean",
      },
      {
        path: "sandbox.network.httpProxyPort",
        label: "HTTP Proxy Port",
        description: "Port for the sandbox HTTP proxy",
        type: "string",
        placeholder: "e.g. 8080",
      },
      {
        path: "sandbox.network.socksProxyPort",
        label: "SOCKS Proxy Port",
        description: "Port for the sandbox SOCKS proxy",
        type: "string",
        placeholder: "e.g. 1080",
      },
    ],
  },
  {
    id: "privacy",
    label: "Privacy",
    icon: "eye-off",
    fields: [
      {
        path: "_env.DISABLE_TELEMETRY",
        label: "Disable Telemetry",
        description: "Disable anonymous usage telemetry collection.",
        type: "boolean",
        envKey: "DISABLE_TELEMETRY",
      },
      {
        path: "_env.DISABLE_ERROR_REPORTING",
        label: "Disable Error Reporting",
        description: "Disable automatic error reporting to Anthropic.",
        type: "boolean",
        envKey: "DISABLE_ERROR_REPORTING",
      },
      {
        path: "_env.DISABLE_COST_WARNINGS",
        label: "Disable Cost Warnings",
        description: "Disable warnings when API costs exceed thresholds.",
        type: "boolean",
        envKey: "DISABLE_COST_WARNINGS",
      },
      {
        path: "_env.DISABLE_NON_ESSENTIAL_MODEL_CALLS",
        label: "Disable Non-Essential Model Calls",
        description: "Disable model calls not directly related to user requests (e.g. summaries, tips).",
        type: "boolean",
        envKey: "DISABLE_NON_ESSENTIAL_MODEL_CALLS",
      },
      {
        path: "_env.CLAUDE_CODE_HIDE_ACCOUNT_INFO",
        label: "Hide Account Info",
        description: "Hide account information from the Claude Code UI.",
        type: "boolean",
        envKey: "CLAUDE_CODE_HIDE_ACCOUNT_INFO",
      },
    ],
  },
  {
    id: "attribution",
    label: "Attribution",
    icon: "git-commit",
    fields: [
      {
        path: "attribution.commit",
        label: "Commit Attribution",
        description: "Template for the Co-Authored-By trailer added to commits.",
        type: "textarea",
        placeholder: "Co-Authored-By: Claude <noreply@anthropic.com>",
      },
      {
        path: "attribution.pr",
        label: "PR Attribution",
        description: "Template for attribution text added to pull request descriptions.",
        type: "textarea",
        placeholder: "Generated with Claude Code",
      },
    ],
  },
  {
    id: "ui",
    label: "Display",
    icon: "monitor",
    fields: [
      {
        path: "showTurnDuration",
        label: "Show Turn Duration",
        description: "Display how long each turn takes to complete.",
        type: "boolean",
      },
      {
        path: "spinnerTipsEnabled",
        label: "Spinner Tips",
        description: "Show helpful tips in the loading spinner.",
        type: "boolean",
      },
      {
        path: "terminalProgressBarEnabled",
        label: "Terminal Progress Bar",
        description: "Show a progress bar in the terminal title bar.",
        type: "boolean",
      },
      {
        path: "prefersReducedMotion",
        label: "Reduced Motion",
        description: "Minimize animations and transitions in the UI.",
        type: "boolean",
      },
      {
        path: "respectGitignore",
        label: "Respect .gitignore",
        description: "Honor .gitignore patterns when searching and listing files.",
        type: "boolean",
      },
      {
        path: "autoUpdatesChannel",
        label: "Auto-Updates Channel",
        description: "Channel for automatic updates (latest or stable).",
        type: "select",
        options: ["", "latest", "stable"],
      },
      {
        path: "_env.CLAUDE_CODE_DISABLE_TERMINAL_TITLE",
        label: "Disable Terminal Title",
        description: "Prevent Claude Code from modifying the terminal title.",
        type: "boolean",
        envKey: "CLAUDE_CODE_DISABLE_TERMINAL_TITLE",
      },
      {
        path: "skipWebFetchPreflight",
        label: "Skip WebFetch Preflight",
        description: "Skip preflight checks for WebFetch tool",
        type: "boolean",
      },
      {
        path: "statusLine.type",
        label: "Status Line Type",
        description: "Type of status line",
        type: "select",
        options: ["", "command"],
      },
      {
        path: "statusLine.command",
        label: "Status Line Command",
        description: "Shell command for custom status line",
        type: "string",
        placeholder: "e.g. echo 'Custom status'",
      },
    ],
  },
  {
    id: "memory",
    label: "Memory & Tasks",
    icon: "database",
    fields: [
      {
        path: "cleanupPeriodDays",
        label: "Cleanup Period (days)",
        description: "Number of days before old sessions and data are automatically cleaned up.",
        type: "string",
        placeholder: "e.g. 30",
      },
      {
        path: "plansDirectory",
        label: "Plans Directory",
        description: "Directory where Claude Code stores plan files.",
        type: "string",
        placeholder: "e.g. ~/.claude/plans",
      },
      {
        path: "_env.CLAUDE_CODE_DISABLE_AUTO_MEMORY",
        label: "Disable Auto Memory",
        description: "Disable automatic memory creation and updates.",
        type: "boolean",
        envKey: "CLAUDE_CODE_DISABLE_AUTO_MEMORY",
      },
      {
        path: "_env.CLAUDE_CODE_DISABLE_BACKGROUND_TASKS",
        label: "Disable Background Tasks",
        description: "Disable background task execution.",
        type: "boolean",
        envKey: "CLAUDE_CODE_DISABLE_BACKGROUND_TASKS",
      },
    ],
  },
  {
    id: "plugins",
    label: "Plugins",
    icon: "puzzle",
    fields: [
      {
        path: "enabledPlugins",
        label: "Enabled Plugins",
        description: "Enabled Claude Code plugins",
        type: "key-value",
      },
      {
        path: "extraKnownMarketplaces",
        label: "Extra Marketplaces",
        description: "Additional plugin marketplace sources",
        type: "key-value",
      },
    ],
  },
];

// --- Dot-path accessors ---

export function getFieldValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current == null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

export function setFieldValue(obj: Record<string, unknown>, path: string, value: unknown): Record<string, unknown> {
  const result = { ...obj };
  const parts = path.split(".");
  let current: Record<string, unknown> = result;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (current[part] == null || typeof current[part] !== "object") {
      current[part] = {};
    }
    current[part] = { ...(current[part] as Record<string, unknown>) };
    current = current[part] as Record<string, unknown>;
  }

  current[parts[parts.length - 1]] = value;
  return result;
}

// --- Collect all env keys that have dedicated fields ---

const ENV_KEY_FIELDS: FieldDef[] = [];
for (const cat of SETTINGS_CATEGORIES) {
  for (const field of cat.fields) {
    if (field.envKey) {
      ENV_KEY_FIELDS.push(field);
    }
  }
}

// --- All known top-level and nested paths ---

const KNOWN_PATHS = new Set<string>();
for (const cat of SETTINGS_CATEGORIES) {
  for (const field of cat.fields) {
    // Register the top-level key (e.g. "permissions" from "permissions.allow")
    // Skip _env paths — they are stored in the env object, not as top-level keys
    if (!field.envKey) {
      KNOWN_PATHS.add(field.path.split(".")[0]);
    }
  }
}

// --- Parse / Serialize ---

interface FormState {
  settings: Record<string, unknown>;
  unknownFields: Record<string, unknown>;
}

export function parseJsonToFormState(jsonStr: string): FormState {
  const parsed = JSON.parse(jsonStr) as Record<string, unknown>;
  const settings: Record<string, unknown> = {};
  const unknownFields: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(parsed)) {
    if (KNOWN_PATHS.has(key)) {
      settings[key] = value;
    } else {
      unknownFields[key] = value;
    }
  }

  // Extract dedicated env keys from the env object into _env form state
  const envObj = (settings.env ?? {}) as Record<string, string>;
  const filteredEnv: Record<string, string> = {};
  const envFormState: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(envObj)) {
    const field = ENV_KEY_FIELDS.find((f) => f.envKey === key);
    if (field) {
      // For boolean env vars, "1" means true
      if (field.type === "boolean") {
        envFormState[key] = value === "1";
      } else {
        envFormState[key] = value;
      }
    } else {
      filteredEnv[key] = value;
    }
  }

  // Special handling for teammateMode: the envKey is CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS
  // but the actual setting value is in settings.teammateMode, not derived from the env var.
  // Just remove the env key since it's managed automatically.

  settings.env = filteredEnv;
  settings._env = envFormState;

  return { settings, unknownFields };
}

function isEmptyValue(value: unknown): boolean {
  if (value === "" || value === undefined || value === null) return true;
  if (value === false) return false; // booleans are not empty
  if (Array.isArray(value) && value.length === 0) return true;
  if (typeof value === "object" && value !== null && Object.keys(value).length === 0) return true;
  return false;
}

function stripEmptyValues(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      const cleaned = stripEmptyValues(value as Record<string, unknown>);
      if (Object.keys(cleaned).length > 0) {
        result[key] = cleaned;
      }
    } else if (!isEmptyValue(value)) {
      result[key] = value;
    }
  }
  return result;
}

export function serializeFormToJson(settings: Record<string, unknown>, unknownFields: Record<string, unknown>): string {
  const toSerialize = { ...settings };

  // Merge _env form state back into the env object
  const envFormState = (toSerialize._env ?? {}) as Record<string, unknown>;
  const existingEnv = (toSerialize.env ?? {}) as Record<string, string>;
  const mergedEnv: Record<string, string> = { ...existingEnv };

  for (const field of ENV_KEY_FIELDS) {
    const envKey = field.envKey as string;
    // Skip teammateMode — it's handled separately below
    if (field.path === "teammateMode") continue;

    const value = envFormState[envKey];
    if (field.type === "boolean") {
      if (value === true) {
        mergedEnv[envKey] = "1";
      } else {
        delete mergedEnv[envKey];
      }
    } else if (value && value !== "" && value !== "__none__") {
      mergedEnv[envKey] = String(value);
    } else {
      delete mergedEnv[envKey];
    }
  }

  // Handle teammateMode env var
  const teammateMode = toSerialize.teammateMode;
  if (teammateMode && teammateMode !== "" && teammateMode !== "__none__") {
    mergedEnv.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS = "1";
  } else {
    delete mergedEnv.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS;
  }

  toSerialize.env = mergedEnv;
  delete toSerialize._env;

  const cleaned = stripEmptyValues(toSerialize);
  const merged = { ...cleaned, ...unknownFields };
  return JSON.stringify(merged, null, 2);
}

export function getDefaultSettings(): Record<string, unknown> {
  return {
    permissions: {
      allow: ["Read", "Write", "Bash", "Glob", "Grep"],
    },
  };
}
