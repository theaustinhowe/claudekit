import type { FileContent, FileTreeEntry } from "@claudekit/ui";

export type RepoType = "nextjs" | "node" | "react" | "library" | "monorepo" | "tanstack";
export type PackageManager = "npm" | "pnpm" | "bun" | "yarn";
export type Severity = "critical" | "warning" | "info";
export type FindingCategory = "dependencies" | "ai-files" | "structure" | "config" | "custom";

export type CustomRuleType = "file_exists" | "file_missing" | "file_contains" | "json_field";

export interface CustomRule {
  id: string;
  name: string;
  description: string | null;
  category: FindingCategory;
  severity: Severity;
  rule_type: CustomRuleType;
  config: Record<string, unknown>;
  suggested_actions: string[];
  policy_id: string | null;
  is_enabled: boolean;
  is_builtin: boolean;
  created_at: string;
  updated_at: string;
}

export interface ManualFinding {
  id: string;
  repo_id: string;
  category: FindingCategory;
  severity: Severity;
  title: string;
  details: string | null;
  evidence: string | null;
  suggested_actions: string[];
  is_resolved: boolean;
  resolved_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type FixImpact = "docs" | "config" | "dependencies" | "structure";
export type FixRisk = "low" | "medium" | "high";

export interface ScanRoot {
  id: string;
  path: string;
  created_at: string;
  last_scanned_at: string | null;
}

export type RepoSource = "local" | "github" | "both" | "library";

export interface Repo {
  id: string;
  name: string;
  local_path: string;
  git_remote: string | null;
  default_branch: string;
  package_manager: PackageManager | null;
  repo_type: RepoType | null;
  is_monorepo: boolean;
  last_scanned_at: string | null;
  last_modified_at?: string | null;
  created_at: string;
  github_url?: string | null;
  github_account_id?: string | null;
  source?: RepoSource;
}

export interface RepoWithCounts extends Repo {
  critical_count: number;
  warning_count: number;
  info_count: number;
}

export interface Policy {
  id: string;
  name: string;
  description: string | null;
  expected_versions: Record<string, string>;
  banned_dependencies: Array<{
    name: string;
    replacement?: string;
    reason: string;
  }>;
  allowed_package_managers: PackageManager[];
  preferred_package_manager: PackageManager;
  ignore_patterns: string[];
  repo_types: RepoType[];
  is_builtin: boolean;
  created_at: string;
  updated_at: string;
}

export interface Finding {
  id: string;
  repo_id: string;
  scan_id: string | null;
  category: FindingCategory;
  severity: Severity;
  title: string;
  details: string | null;
  evidence: string | null;
  suggested_actions: string[];
  created_at: string;
}

export interface FixAction {
  id: string;
  repo_id: string;
  finding_id: string | null;
  scan_id: string | null;
  title: string;
  description: string | null;
  impact: FixImpact | null;
  risk: FixRisk | null;
  requires_approval: boolean;
  diff_file: string | null;
  diff_before: string | null;
  diff_after: string | null;
  created_at: string;
}

export interface AIFile {
  name: string;
  path: string;
  present: boolean;
  quality?: number;
  suggestions?: string[];
}

export type ConceptType = "skill" | "hook" | "command" | "agent" | "mcp_server" | "plugin";

export type ConceptSourceType = "local_repo" | "github_repo" | "mcp_list" | "curated" | "claude_config";

interface ConceptSource {
  id: string;
  source_type: ConceptSourceType;
  name: string;
  description: string | null;
  repo_id: string | null;
  github_owner: string | null;
  github_repo: string | null;
  github_default_branch: string | null;
  github_url: string | null;
  list_url: string | null;
  is_builtin: boolean;
  last_scanned_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ConceptSourceWithStats extends ConceptSource {
  concept_count: number;
}

export interface McpServerListEntry {
  name: string;
  description?: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  tags?: string[];
}

export interface McpServerList {
  name: string;
  description?: string;
  servers: McpServerListEntry[];
}

export interface Concept {
  id: string;
  repo_id: string;
  scan_id: string | null;
  source_id: string | null;
  concept_type: ConceptType;
  name: string;
  description: string | null;
  relative_path: string;
  content: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface ConceptWithRepo extends Concept {
  repo_name: string;
  repo_path: string;
  link_count?: number;
  source_type?: ConceptSourceType;
  source_name?: string;
  all_repo_names?: string;
  all_repo_ids?: string;
}

type ConceptSyncStatus = "pending" | "synced" | "stale";

interface ConceptLink {
  id: string;
  concept_id: string;
  repo_id: string;
  sync_status: ConceptSyncStatus;
  synced_at: string | null;
  created_at: string;
}

export interface ConceptLinkWithConcept extends ConceptLink {
  concept_name: string;
  concept_type: ConceptType;
  concept_description: string | null;
  concept_content: string | null;
  concept_relative_path: string;
  concept_metadata: Record<string, unknown>;
  origin_repo_id: string;
  origin_repo_name: string;
  origin_repo_path: string;
}

export type { ClaudeRateLimits, ClaudeUsageStats } from "@claudekit/claude-usage";

export interface OnboardingState {
  hasScanRoots: boolean;
  hasCompletedScan: boolean;
  hasAppliedFix: boolean;
}

export interface AttentionRepo {
  id: string;
  name: string;
  local_path: string;
  critical_count: number;
  warning_count: number;
  last_scanned_at: string | null;
  is_stale: boolean;
}

export interface DashboardStats {
  reposAudited: number;
  criticalFindings: number;
  warningFindings: number;
  pendingFixes: number;
  staleRepoCount: number;
  criticalRepoCount: number;
  lastScanCompletedAt: string | null;
  conceptCount: number;
  staleSources: number;
  policyCount: number;
}

// --- Git Changes Types ---

export type GitFileStatus = "modified" | "added" | "deleted" | "renamed" | "untracked";

export interface GitStatusFile {
  path: string;
  status: GitFileStatus;
  staged: boolean;
  patch?: string;
}

export interface GitStatusResult {
  files: GitStatusFile[];
  branch: string;
  ahead: number;
  behind: number;
}

// --- Code Browser Types ---

export type CodeTreeEntry = FileTreeEntry;
export type CodeFileContent = FileContent;

export interface CodeCommitInfo {
  sha: string;
  message: string;
  author: string;
  authorEmail?: string;
  date: string;
}

export interface CodeBranch {
  name: string;
  sha: string;
  isCurrent: boolean;
  isDefault: boolean;
}

export type CommitFileStatus = "added" | "modified" | "deleted" | "renamed" | "copied";

export interface CommitFile {
  path: string;
  status: CommitFileStatus;
  additions: number;
  deletions: number;
  previousPath?: string;
  patch?: string;
}

export interface CommitDetail {
  sha: string;
  message: string;
  author: string;
  authorEmail?: string;
  date: string;
  files: CommitFile[];
  stats: { additions: number; deletions: number; total: number };
}

// --- Session Types ---

export type SessionType = "scan" | "quick_improve" | "finding_fix" | "fix_apply" | "ai_file_gen" | "cleanup";

export type SessionStatus = "pending" | "running" | "done" | "error" | "cancelled";

export interface SessionEvent {
  type: "progress" | "log" | "done" | "error" | "cancelled" | "heartbeat" | "init";
  message?: string;
  progress?: number;
  phase?: string;
  log?: string;
  logType?: "tool" | "thinking" | "status";
  data?: Record<string, unknown>;
}

export interface SessionRow {
  id: string;
  session_type: SessionType;
  status: SessionStatus;
  label: string;
  context_type: "repo" | null;
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
