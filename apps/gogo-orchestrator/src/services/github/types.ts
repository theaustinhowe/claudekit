export type {
  CreatePullRequestOptions,
  GitHubComment,
  GitHubIssue,
  PullRequestInfo,
  PullRequestResult,
  PullRequestReviewComment,
} from "@devkit/github";

export interface RepoConfig {
  owner: string;
  name: string;
  baseBranch: string;
  triggerLabel: string;
}
