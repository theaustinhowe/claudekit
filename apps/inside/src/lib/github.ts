import { Octokit } from "octokit";

let _octokit: Octokit | null = null;

export function getOctokit(): Octokit {
  if (_octokit) return _octokit;

  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error("GITHUB_TOKEN environment variable is required. Set it in .env.local");
  }

  _octokit = new Octokit({ auth: token });
  return _octokit;
}
