export class GitHubApiError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
  ) {
    super(message);
    this.name = "GitHubApiError";
  }
}

export class GitHubAuthError extends Error {
  constructor(message = "GitHub authentication failed. Check your token.") {
    super(message);
    this.name = "GitHubAuthError";
  }
}

export class GitHubRateLimitError extends Error {
  constructor(
    public resetAt: Date,
    message = "GitHub API rate limit exceeded",
  ) {
    super(message);
    this.name = "GitHubRateLimitError";
  }
}

export class RepositoryNotFoundError extends Error {
  constructor(repositoryId: string) {
    super(`Repository not found: ${repositoryId}`);
    this.name = "RepositoryNotFoundError";
  }
}

export class GitHubCredentialsError extends Error {
  constructor(_repositoryId: string, owner: string, name: string) {
    super(`GitHub token not configured for repository: ${owner}/${name}. Configure it in Settings > Repositories.`);
    this.name = "GitHubCredentialsError";
  }
}
