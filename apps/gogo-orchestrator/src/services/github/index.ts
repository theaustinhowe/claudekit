/**
 * GitHub Service Layer
 *
 * Provides repo-scoped GitHub operations for the multi-repo architecture.
 * Each repository has its own GitHub token for isolated rate limiting and credentials.
 */

export {
  getAllRateLimitInfo,
  getOctokitForRepo,
} from "./client.js";

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
  isHumanComment,
  isHumanReviewComment,
  removeLabelFromIssue,
} from "./repo-service.js";
export type {
  GitHubComment,
  GitHubIssue,
  PullRequestReviewComment,
} from "./types.js";
