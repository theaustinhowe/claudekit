/**
 * GitHub Service Errors
 */

export class RepositoryNotFoundError extends Error {
  constructor(repositoryId: string) {
    super(`Repository not found: ${repositoryId}`);
    this.name = "RepositoryNotFoundError";
  }
}

export class GitHubCredentialsError extends Error {
  constructor(_repositoryId: string, owner: string, name: string) {
    super(
      `GitHub token not configured for repository: ${owner}/${name}. Configure it in Settings > Repositories.`,
    );
    this.name = "GitHubCredentialsError";
  }
}
