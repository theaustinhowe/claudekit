/**
 * GitHub Service Types
 */

export interface RateLimitInfo {
  limit: number;
  remaining: number;
  reset: Date;
  used: number;
}

export interface GitHubComment {
  id: number;
  body: string;
  html_url: string;
  user: {
    login: string;
    type: string;
    avatar_url: string;
  } | null;
  created_at: string;
  updated_at: string;
}

export interface GitHubLabel {
  id: number;
  name: string;
  color: string;
  description: string | null;
}

export interface GitHubUser {
  login: string;
  avatar_url: string;
  html_url: string;
}

export interface GitHubIssue {
  number: number;
  title: string;
  body: string | null;
  html_url: string;
  state: string;
  labels: GitHubLabel[];
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  user: GitHubUser | null;
}

export interface RepoConfig {
  owner: string;
  name: string;
  baseBranch: string;
  triggerLabel: string;
}

export interface CreatePullRequestOptions {
  head: string;
  base: string;
  title: string;
  body: string;
}

export interface PullRequestResult {
  number: number;
  url: string;
  html_url: string;
}

export interface PullRequestInfo {
  number: number;
  state: "open" | "closed";
  merged: boolean;
  merged_at: string | null;
  html_url: string;
  head: {
    ref: string;
    sha: string;
  };
  base: {
    ref: string;
  };
}

export interface PullRequestReviewComment {
  id: number;
  body: string;
  html_url: string;
  user: {
    login: string;
    type: string;
  } | null;
  created_at: string;
  path: string | null;
  line: number | null;
}
