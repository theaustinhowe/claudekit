import { GitHubClient } from "@devkit/github";

let _client: GitHubClient | null = null;

export function getOctokit() {
  if (_client) return _client.octokit;

  const token = process.env.GITHUB_PERSONAL_ACCESS_TOKEN;
  if (!token) {
    throw new Error("GITHUB_PERSONAL_ACCESS_TOKEN environment variable is required. Set it in .env.local");
  }

  _client = new GitHubClient({ token });
  return _client.octokit;
}
