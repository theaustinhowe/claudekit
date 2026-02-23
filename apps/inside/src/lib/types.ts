import type { FileContent, FileTreeEntry } from "@claudekit/ui";

export type CodeTreeEntry = FileTreeEntry;
export type CodeFileContent = FileContent;

export type PackageManager = "npm" | "pnpm" | "bun" | "yarn";

export interface ProjectTemplate {
  id: string;
  name: string;
  type: string | null;
  description: string | null;
  recommended_pm: PackageManager;
  includes: string[];
  base_files: Record<string, string>;
  is_builtin: boolean;
}

// --- Generator Project Types ---

export type GeneratorProjectStatus =
  | "drafting"
  | "scaffolding"
  | "designing"
  | "upgrading"
  | "archived"
  | "locked"
  | "exported"
  | "error";
export type AiProvider = "claude-code" | "anthropic" | "openai" | "ollama";

export interface GeneratorProject {
  id: string;
  title: string;
  idea_description: string;
  platform: string;
  services: string[];
  constraints: string[];
  project_name: string;
  project_path: string;
  package_manager: PackageManager;
  status: GeneratorProjectStatus;
  active_spec_version: number;
  ai_provider: AiProvider;
  ai_model: string | null;
  template_id: string | null;
  created_at: string;
  updated_at: string;
  exported_at: string | null;
  implementation_prompt: string | null;
  design_vibes: string[];
  inspiration_urls: string[];
  color_scheme: { primary?: string; accent?: string };
  custom_features: string[];
  scaffold_logs: { log: string; logType: string }[] | null;
}

export type UpgradeTaskStatus = "pending" | "in_progress" | "completed" | "failed" | "skipped";

export interface UpgradeTask {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  status: UpgradeTaskStatus;
  order_index: number;
  step_type: "validate" | "implement" | "env_setup";
  claude_output: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface UiSpec {
  version: number;
  pages: UiSpecPage[];
  components: UiSpecComponent[];
  layouts: UiSpecLayout[];
  navigation: UiSpecNavigation;
}

export interface UiSpecPage {
  id: string;
  route: string;
  title: string;
  description: string;
  layout: string | null;
  component_ids: string[];
  is_dynamic: boolean;
  metadata: Record<string, unknown>;
}

interface UiSpecProp {
  name: string;
  type: string;
  required: boolean;
  default_value: string | null;
}

export interface UiSpecComponent {
  id: string;
  name: string;
  component_type: string;
  description: string;
  props: UiSpecProp[];
  data_bindings: string[];
  children_ids: string[];
  is_client: boolean;
}

export interface UiSpecLayout {
  id: string;
  name: string;
  description: string;
  has_sidebar: boolean;
  has_header: boolean;
  regions: string[];
}

export interface UiSpecNavigation {
  type: "sidebar" | "top-nav" | "bottom-nav" | "combined";
  items: Array<{
    label: string;
    route: string;
    icon: string | null;
    children?: Array<{ label: string; route: string }>;
  }>;
}

export interface MockEntity {
  id: string;
  name: string;
  description: string;
  fields: MockEntityField[];
  sample_rows: Record<string, unknown>[];
}

export interface MockEntityField {
  name: string;
  type: string;
  nullable: boolean;
  default_value: unknown;
  enum_values?: string[];
  relation_entity?: string;
}

export interface DesignMessage {
  id: string;
  project_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  spec_diff: SpecDiff | null;
  model_used: string | null;
  progress_logs: { log: string; logType: string }[] | null;
  suggestions: string[] | null;
  created_at: string;
}

export interface SpecDiff {
  pages_added: string[];
  pages_removed: string[];
  pages_modified: string[];
  components_added: string[];
  components_removed: string[];
  components_modified: string[];
  entities_added: string[];
  entities_removed: string[];
  entities_modified: string[];
  summary: string;
}

// --- Auto-Fix Types ---

export type AutoFixStatus = "idle" | "detecting" | "fixing" | "success" | "failed" | "cooldown" | "cancelled";

export interface AutoFixRun {
  id: string;
  project_id: string;
  status: "running" | "success" | "failed" | "cancelled";
  error_signature: string;
  error_message: string;
  claude_output: string | null;
  attempt_number: number;
  logs_json: string;
  started_at: string;
  completed_at: string | null;
}

export interface AutoFixState {
  enabled: boolean;
  status: AutoFixStatus;
  currentRun: AutoFixRun | null;
  consecutiveFailures: number;
  cooldownUntil: string | null;
  lastError: string | null;
}

export interface ProjectScreenshot {
  id: string;
  project_id: string;
  file_path: string;
  label: string | null;
  width: number;
  height: number;
  file_size: number;
  message_id: string | null;
  created_at: string;
}

// --- Session Types ---

export type SessionType = "scaffold" | "upgrade" | "auto_fix" | "upgrade_init" | "chat";

export type SessionStatus = "pending" | "running" | "done" | "error" | "cancelled";

export interface SessionRow {
  id: string;
  session_type: SessionType;
  status: SessionStatus;
  label: string;
  context_type: "project" | null;
  context_id: string | null;
  context_name: string | null;
  metadata_json: string;
  progress: number;
  phase: string | null;
  pid: number | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  error_message: string | null;
  result_json: string;
}

export interface SessionLogRow {
  id: number;
  session_id: string;
  log: string;
  log_type: string;
  created_at: string;
}

// --- Tool Types ---

export type ToolCategory = "package-manager" | "runtime" | "dev-tool" | "vcs" | "ai-tool";

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
