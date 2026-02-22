import { serializeFormToJson } from "@/lib/services/claude-settings-schema";

export interface SettingsPreset {
  id: string;
  label: string;
  description: string;
  icon: string; // lucide icon name
  settings: Record<string, unknown>;
}

export const SETTINGS_PRESETS: SettingsPreset[] = [
  {
    id: "permissive",
    label: "Permissive Dev",
    description: "All tools allowed, fast mode enabled. Best for trusted projects where speed matters.",
    icon: "zap",
    settings: {
      permissions: {
        allow: ["Read", "Write", "Edit", "Bash", "Glob", "Grep", "WebFetch", "WebSearch", "NotebookEdit"],
        defaultMode: "bypassPermissions",
      },
      fastMode: true,
      webSearch: true,
    },
  },
  {
    id: "careful",
    label: "Careful Mode",
    description: "Ask before writes, deny destructive commands. Good for important repos.",
    icon: "shield-check",
    settings: {
      permissions: {
        allow: ["Read", "Glob", "Grep"],
        ask: ["Write", "Edit", "NotebookEdit", "WebFetch"],
        deny: ["Bash(rm -rf *)", "Bash(git push --force*)"],
        defaultMode: "plan",
      },
    },
  },
  {
    id: "sandboxed",
    label: "Sandboxed",
    description: "Full sandbox enabled with auto-allowed Bash. Safe experimentation.",
    icon: "box",
    settings: {
      sandbox: {
        enabled: true,
        autoAllowBashIfSandboxed: true,
      },
      permissions: {
        allow: ["Read", "Write", "Edit", "Bash", "Glob", "Grep"],
      },
    },
  },
  {
    id: "minimal",
    label: "Minimal / CI",
    description: "Disable telemetry, error reporting, and non-essential calls. For CI/CD or privacy.",
    icon: "minimize-2",
    settings: {
      permissions: {
        allow: ["Read", "Write", "Bash", "Glob", "Grep"],
      },
      _env: {
        DISABLE_TELEMETRY: true,
        DISABLE_ERROR_REPORTING: true,
        DISABLE_NON_ESSENTIAL_MODEL_CALLS: true,
        DISABLE_COST_WARNINGS: true,
      },
    },
  },
];

export function getPresetJson(preset: SettingsPreset): string {
  return serializeFormToJson(preset.settings, {});
}
