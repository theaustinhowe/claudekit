export type {
  CreatePullRequestOptions,
  GitHubComment,
  GitHubIssue,
  PullRequestInfo,
  PullRequestResult,
  PullRequestReviewComment,
} from "@claudekit/github";

export interface RepoConfig {
  owner: string;
  name: string;
  baseBranch: string;
  triggerLabel: string;
}
