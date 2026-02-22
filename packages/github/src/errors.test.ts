import { describe, expect, it } from "vitest";
import {
  GitHubApiError,
  GitHubAuthError,
  GitHubCredentialsError,
  GitHubRateLimitError,
  RepositoryNotFoundError,
} from "./errors";

describe("GitHubApiError", () => {
  it("sets name, message, and statusCode", () => {
    const err = new GitHubApiError("Not Found", 404);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("GitHubApiError");
    expect(err.message).toBe("Not Found");
    expect(err.statusCode).toBe(404);
  });

  it("statusCode is optional", () => {
    const err = new GitHubApiError("Server Error");
    expect(err.statusCode).toBeUndefined();
  });
});

describe("GitHubAuthError", () => {
  it("uses default message", () => {
    const err = new GitHubAuthError();
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("GitHubAuthError");
    expect(err.message).toBe("GitHub authentication failed. Check your token.");
  });

  it("accepts custom message", () => {
    const err = new GitHubAuthError("Token expired");
    expect(err.message).toBe("Token expired");
  });
});

describe("GitHubRateLimitError", () => {
  it("sets resetAt and default message", () => {
    const resetAt = new Date("2025-01-01T00:00:00Z");
    const err = new GitHubRateLimitError(resetAt);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("GitHubRateLimitError");
    expect(err.message).toBe("GitHub API rate limit exceeded");
    expect(err.resetAt).toBe(resetAt);
  });

  it("accepts custom message", () => {
    const err = new GitHubRateLimitError(new Date(), "Custom rate limit msg");
    expect(err.message).toBe("Custom rate limit msg");
  });
});

describe("RepositoryNotFoundError", () => {
  it("includes repository ID in message", () => {
    const err = new RepositoryNotFoundError("repo-123");
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("RepositoryNotFoundError");
    expect(err.message).toBe("Repository not found: repo-123");
  });
});

describe("GitHubCredentialsError", () => {
  it("includes owner/name in message", () => {
    const err = new GitHubCredentialsError("repo-456", "octocat", "hello-world");
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("GitHubCredentialsError");
    expect(err.message).toBe(
      "GitHub token not configured for repository: octocat/hello-world. Configure it in Settings > Repositories.",
    );
  });
});
