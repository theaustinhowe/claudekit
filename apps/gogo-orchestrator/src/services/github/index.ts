/**
 * GitHub Service Layer
 *
 * Provides repo-scoped GitHub operations for the multi-repo architecture.
 * Each repository has its own GitHub token for isolated rate limiting and credentials.
 */

// Re-export client functions (rate limiting and Octokit management)
export {
  getAllRateLimitInfo,
  getOctokitForRepo,
  getRateLimitInfo,
  shouldThrottleRequests,
} from "./client.js";

// Re-export errors
export { GitHubCredentialsError, RepositoryNotFoundError } from "./errors.js";
// Re-export option types
export type {
  CreateIssueOptions,
  GetIssuesOptions,
  OpenPullRequest,
} from "./repo-service.js";
// Re-export repo-scoped operations
export {
  AGENT_COMMENT_MARKER,
  createIssueCommentForRepo,
  createIssueForRepo,
  createPullRequestForRepo,
  findExistingPrForRepo,
  getIssueByNumber,
  getIssueCommentsForRepo,
  getIssuesForRepo,
  getIssuesWithLabel,
  getOpenPullRequestsForRepo,
  getPullRequestByNumber,
  getPullRequestIssueComments,
  getPullRequestReviewComments,
  getRepoConfigById,
  hasAgentMarker,
  isHumanComment,
  isHumanReviewComment,
  removeLabelFromIssue,
} from "./repo-service.js";
// Re-export types
export type {
  CreatePullRequestOptions,
  GitHubComment,
  GitHubIssue,
  GitHubLabel,
  PullRequestInfo,
  PullRequestResult,
  PullRequestReviewComment,
  RateLimitInfo,
  RepoConfig,
} from "./types.js";
