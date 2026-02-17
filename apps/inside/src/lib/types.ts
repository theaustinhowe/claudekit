export type PRSize = "S" | "M" | "L" | "XL";
export type SkillTrend = "Improving" | "Needs attention" | "New pattern" | "Flat";
export type Severity = "blocking" | "suggestion" | "nit";
export type RiskLevel = "Low" | "Medium" | "High";
export type CommentStatus = "open" | "fixing" | "fixed" | "resolved";

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
