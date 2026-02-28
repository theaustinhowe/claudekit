// --- Session Types ---

export type SessionType =
  | "skill_analysis"
  | "split_analysis"
  | "comment_fix"
  | "skill_rule_analysis"
  | "split_execution"
  | "fix_execution"
  | "account_sync";
export type SessionStatus = "pending" | "running" | "done" | "error" | "cancelled";

export interface SessionRow {
  id: string;
  session_type: SessionType;
  status: SessionStatus;
  label: string;
  context_type: string | null;
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

// --- Domain Types ---

export type PRSize = "S" | "M" | "L" | "XL";
export type SkillTrend = "Improving" | "Needs attention" | "New pattern" | "Flat";
export type Severity = "blocking" | "suggestion" | "nit";
export type RiskLevel = "Low" | "Medium" | "High";
export type CommentStatus = "open" | "fixing" | "fixed" | "resolved";
export type UserRelationship = "authored" | "reviewed" | "assigned" | "mentioned";
export type SplitExecutionStatus = "pending" | "in_progress" | "completed" | "failed";
export interface GitHubUser {
  id: string;
  login: string;
  avatarUrl: string | null;
  name: string | null;
}

export interface PR {
  id: string;
  repoId: string;
  number: number;
  title: string;
  author: string;
  authorAvatar: string | null;
  branch: string | null;
  size: PRSize;
  linesAdded: number;
  linesDeleted: number;
  filesChanged: number;
  reviewStatus: string | null;
  state: string;
  complexity: number | null;
  githubCreatedAt: string | null;
  githubUpdatedAt: string | null;
  fetchedAt: string;
  userRelationship: UserRelationship | null;
  htmlUrl: string | null;
  repoFullName: string | null;
}

export interface Skill {
  id: string;
  analysisId: string;
  name: string;
  frequency: number;
  totalPRs: number;
  trend: SkillTrend | null;
  severity: Severity;
  topExample: string | null;
  description: string | null;
  resources: string | null;
  actionItem: string | null;
  addressed: boolean;
  ruleContent: string | null;
  groupId: string | null;
}

export interface SubPR {
  id: string;
  index: number;
  total: number;
  title: string;
  size: PRSize;
  linesChanged: number;
  files: { path: string; additions: number; deletions: number }[];
  dependsOn: number[];
  risk: RiskLevel;
  riskNote: string;
  description: string;
  checklist: string[];
}

/** Dashboard aggregate stats */
export interface DashboardStats {
  totalPRs: number;
  avgLinesChanged: number;
  topSkillGap: string | null;
  splittablePRs: number;
}

/** PR with computed comment count for display */
export interface PRWithComments extends PR {
  commentCount: number;
  feedbackCategories: string[];
}

/** Reviewer aggregate stats */
export interface ReviewerStats {
  reviewer: string;
  reviewerAvatar: string | null;
  totalComments: number;
  prsReviewed: number;
  severityCounts: Record<string, number>;
  categoryCounts: Record<string, number>;
}

/** Single comment from a reviewer for the deep-dive view */
export interface ReviewerComment {
  id: string;
  body: string;
  filePath: string | null;
  lineNumber: number | null;
  severity: string | null;
  category: string | null;
  createdAt: string | null;
  prNumber: number;
  prTitle: string;
}

/** Skill with related comments hydrated */
export interface SkillWithComments extends Skill {
  comments: {
    id: string;
    prNumber: number;
    prTitle: string;
    reviewer: string;
    reviewerAvatar: string | null;
    text: string;
    file: string | null;
    line: number | null;
  }[];
}

/** Skill group for organizing skills by functionality */
export interface SkillGroup {
  id: string;
  name: string;
  category: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  skillCount: number;
}

/** Split execution tracking for individual sub-PRs */
export interface SplitExecution {
  id: string;
  planId: string;
  subPRIndex: number;
  status: SplitExecutionStatus;
  branchName: string | null;
  prNumber: number | null;
  prUrl: string | null;
  errorMessage: string | null;
  createdAt: string;
  completedAt: string | null;
}

/** PR filtering and sorting types */
export type PRSortField = "created" | "updated" | "size" | "comments" | "title";
export type PRSortDirection = "asc" | "desc";

export interface PRFilters {
  search: string;
  state: "all" | "open" | "closed";
  size: "all" | PRSize;
  sortField: PRSortField;
  sortDirection: PRSortDirection;
}

/** Account-wide stats */
export interface AccountStats {
  totalPRs: number;
  totalRepos: number;
  totalComments: number;
  prsAuthored: number;
  prsReviewed: number;
  avgLinesChanged: number;
  topSkillGap: string | null;
  splittablePRs: number;
}
