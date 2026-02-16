import { beforeEach, describe, expect, it, vi } from "vitest";
import { GitHubCredentialsError, RepositoryNotFoundError } from "./errors.js";

// Mock the database
vi.mock("../../db/index.js", () => ({
  getConn: vi.fn(() => ({})),
}));

vi.mock("../../db/helpers.js", () => ({
  queryAll: vi.fn(),
  queryOne: vi.fn(),
  execute: vi.fn(),
  withTransaction: vi.fn(),
  buildUpdate: vi.fn(),
  buildWhere: vi.fn(),
  buildInClause: vi.fn(),
  checkpoint: vi.fn(),
}));

import { queryOne } from "../../db/helpers.js";

// Import functions after mocking
import {
  getAllRateLimitInfo,
  getOctokitForRepo,
  getRateLimitInfo,
  shouldThrottleRequests,
  updateRateLimitFromResponse,
} from "./client.js";

describe("GitHub Client", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe("getOctokitForRepo", () => {
    it("throws RepositoryNotFoundError when repository not found", async () => {
      vi.mocked(queryOne).mockResolvedValue(undefined);

      await expect(getOctokitForRepo("nonexistent-id")).rejects.toThrow(RepositoryNotFoundError);
      await expect(getOctokitForRepo("nonexistent-id")).rejects.toThrow("Repository not found: nonexistent-id");
    });

    it("throws GitHubCredentialsError when token not configured", async () => {
      vi.mocked(queryOne).mockResolvedValue({
        id: "repo-1",
        owner: "testowner",
        name: "testrepo",
        github_token: null,
      });

      await expect(getOctokitForRepo("repo-1")).rejects.toThrow(GitHubCredentialsError);
      await expect(getOctokitForRepo("repo-1")).rejects.toThrow(
        "GitHub token not configured for repository: testowner/testrepo",
      );
    });

    it("creates Octokit instance with valid token", async () => {
      vi.mocked(queryOne).mockResolvedValue({
        id: "repo-1",
        owner: "testowner",
        name: "testrepo",
        github_token: "ghp_test_token",
      });

      const octokit = await getOctokitForRepo("repo-1");

      expect(octokit).toBeDefined();
      expect(octokit.rest).toBeDefined();
    });

    it("caches Octokit instances by repository ID", async () => {
      vi.mocked(queryOne).mockResolvedValue({
        id: "repo-cache-test",
        owner: "testowner",
        name: "testrepo",
        github_token: "ghp_cache_token",
      });

      const octokit1 = await getOctokitForRepo("repo-cache-test");
      const octokit2 = await getOctokitForRepo("repo-cache-test");

      expect(octokit1).toBe(octokit2);
    });
  });

  describe("rate limit tracking", () => {
    it("updates rate limit info from response headers", () => {
      const token = "ghp_rate_limit_test";
      const headers = {
        "x-ratelimit-limit": "5000",
        "x-ratelimit-remaining": "4500",
        "x-ratelimit-reset": String(Math.floor(Date.now() / 1000) + 3600),
        "x-ratelimit-used": "500",
      };

      updateRateLimitFromResponse(token, headers);

      const info = getRateLimitInfo(token);
      expect(info).not.toBeNull();
      expect(info?.limit).toBe(5000);
      expect(info?.remaining).toBe(4500);
      expect(info?.used).toBe(500);
    });

    it("returns null for tokens without rate limit info", () => {
      const info = getRateLimitInfo("nonexistent_token");
      expect(info).toBeNull();
    });

    it("tracks rate limits across multiple tokens", () => {
      const token1 = "ghp_multi_1";
      const token2 = "ghp_multi_2";

      updateRateLimitFromResponse(token1, {
        "x-ratelimit-limit": "5000",
        "x-ratelimit-remaining": "4000",
        "x-ratelimit-reset": String(Math.floor(Date.now() / 1000) + 3600),
      });

      updateRateLimitFromResponse(token2, {
        "x-ratelimit-limit": "5000",
        "x-ratelimit-remaining": "3000",
        "x-ratelimit-reset": String(Math.floor(Date.now() / 1000) + 3600),
      });

      const allInfo = getAllRateLimitInfo();
      expect(allInfo.tokenCount).toBeGreaterThanOrEqual(2);
      expect(allInfo.lowestRemaining?.remaining).toBe(3000);
    });
  });

  describe("shouldThrottleRequests", () => {
    it("returns no throttle for healthy rate limits", () => {
      const token = "ghp_healthy_token";
      updateRateLimitFromResponse(token, {
        "x-ratelimit-limit": "5000",
        "x-ratelimit-remaining": "4500",
        "x-ratelimit-reset": String(Math.floor(Date.now() / 1000) + 3600),
      });

      const result = shouldThrottleRequests(token);
      expect(result.shouldThrottle).toBe(false);
    });

    it("returns warning throttle when below 20%", () => {
      const token = "ghp_warning_token";
      updateRateLimitFromResponse(token, {
        "x-ratelimit-limit": "5000",
        "x-ratelimit-remaining": "800", // 16%
        "x-ratelimit-reset": String(Math.floor(Date.now() / 1000) + 3600),
      });

      const result = shouldThrottleRequests(token);
      expect(result.shouldThrottle).toBe(true);
      expect(result.reason).toContain("low");
      expect(result.delayMs).toBe(5000);
    });

    it("returns critical throttle when below 10%", () => {
      const token = "ghp_critical_token";
      updateRateLimitFromResponse(token, {
        "x-ratelimit-limit": "5000",
        "x-ratelimit-remaining": "400", // 8%
        "x-ratelimit-reset": String(Math.floor(Date.now() / 1000) + 3600),
      });

      const result = shouldThrottleRequests(token);
      expect(result.shouldThrottle).toBe(true);
      expect(result.reason).toContain("critical");
    });

    it("returns no throttle for unknown tokens", () => {
      const result = shouldThrottleRequests("unknown_token");
      expect(result.shouldThrottle).toBe(false);
    });
  });

  describe("getAllRateLimitInfo", () => {
    it("aggregates rate limit status across tokens", () => {
      // Set up tokens with different rate limit states
      const warningToken = "ghp_agg_warning";
      updateRateLimitFromResponse(warningToken, {
        "x-ratelimit-limit": "5000",
        "x-ratelimit-remaining": "800",
        "x-ratelimit-reset": String(Math.floor(Date.now() / 1000) + 3600),
      });

      const result = getAllRateLimitInfo();
      expect(result.tokenCount).toBeGreaterThan(0);
      expect(result.hasWarning).toBe(true);
    });
  });
});
