export type PRSize = "S" | "M" | "L" | "XL";
export type ReviewStatus = "Approved" | "Changes Requested" | "Pending" | "Merged" | "Draft";
export type SkillTrend = "Improving" | "Needs attention" | "New pattern" | "Flat";
export type Severity = "blocking" | "suggestion" | "nit";
export type RiskLevel = "Low" | "Medium" | "High";
export type CommentStatus = "open" | "fixing" | "fixed" | "resolved";

export interface Repo {
  id: string;
  owner: string;
  name: string;
  fullName: string;
  defaultBranch: string;
  lastSyncedAt: string | null;
  createdAt: string;
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
}

export interface PRComment {
  id: string;
  prId: string;
  githubId: number | null;
  reviewer: string;
  reviewerAvatar: string | null;
  body: string;
  filePath: string | null;
  lineNumber: number | null;
  severity: Severity | null;
  category: string | null;
  createdAt: string | null;
  fetchedAt: string;
}

export interface SkillAnalysis {
  id: string;
  repoId: string;
  prNumbers: string;
  createdAt: string;
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
}

export interface SplitPlan {
  id: string;
  prId: string;
  totalLines: number | null;
  subPRs: string;
  createdAt: string;
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

export interface CommentFix {
  id: string;
  commentId: string;
  suggestedFix: string | null;
  fixDiff: string | null;
  status: string;
  createdAt: string;
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
