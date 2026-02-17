export type {
  CreatePullRequestOptions,
  GitHubComment,
  GitHubIssue,
  GitHubLabel,
  GitHubUser,
  PullRequestInfo,
  PullRequestResult,
  PullRequestReviewComment,
  RateLimitInfo,
} from "@devkit/github";

export interface RepoConfig {
  owner: string;
  name: string;
  baseBranch: string;
  triggerLabel: string;
}
