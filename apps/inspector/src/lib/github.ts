import { GitHubClient } from "@claudekit/github";

let _client: GitHubClient | null = null;

function ensureClient(): GitHubClient {
  if (_client) return _client;

  const token = process.env.GITHUB_PERSONAL_ACCESS_TOKEN;
  if (!token) {
    throw new Error("GITHUB_PERSONAL_ACCESS_TOKEN environment variable is required. Set it in .env.local");
  }

  _client = new GitHubClient({ token });
  return _client;
}

export function getOctokit() {
  return ensureClient().octokit;
}

export function hasValidPATSync(): boolean {
  return !!process.env.GITHUB_PERSONAL_ACCESS_TOKEN;
}
