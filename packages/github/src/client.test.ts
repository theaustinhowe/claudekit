import { describe, expect, it, vi } from "vitest";

let capturedAfterHook: ((response: { headers: Record<string, unknown> }) => void) | null = null;

function fireAfterHook(headers: Record<string, unknown>) {
  expect(capturedAfterHook).not.toBeNull();
  capturedAfterHook?.({ headers });
}

vi.mock("octokit", () => ({
  Octokit: class MockOctokit {
    hook = {
      after: (_event: string, callback: (response: { headers: Record<string, unknown> }) => void) => {
        capturedAfterHook = callback;
      },
    };
  },
}));

import { GitHubClient } from "./client";

describe("GitHubClient", () => {
  it("creates an Octokit instance and registers after hook", () => {
    capturedAfterHook = null;
    const client = new GitHubClient({ token: "ghp_test_client_1" });
    expect(client.octokit).toBeDefined();
    expect(capturedAfterHook).not.toBeNull();
  });

  it("rateLimits returns null before any requests", () => {
    const client = new GitHubClient({ token: "ghp_test_client_2" });
    expect(client.rateLimits).toBeNull();
  });

  it("shouldThrottle returns throttle: false initially", () => {
    const client = new GitHubClient({ token: "ghp_test_client_3" });
    expect(client.shouldThrottle).toEqual({ throttle: false });
  });

  it("after hook updates rate limits", () => {
    capturedAfterHook = null;
    const _client = new GitHubClient({ token: "ghp_test_client_4" });

    fireAfterHook({
      "x-ratelimit-limit": "5000",
      "x-ratelimit-remaining": "4000",
      "x-ratelimit-reset": String(Math.floor(Date.now() / 1000) + 3600),
      "x-ratelimit-used": "1000",
    });

    expect(_client.rateLimits).not.toBeNull();
    expect(_client.rateLimits?.limit).toBe(5000);
    expect(_client.rateLimits?.remaining).toBe(4000);
  });

  it("after hook with low remaining triggers throttle", () => {
    capturedAfterHook = null;
    const _client = new GitHubClient({ token: "ghp_test_client_5" });

    fireAfterHook({
      "x-ratelimit-limit": "5000",
      "x-ratelimit-remaining": "100",
      "x-ratelimit-reset": String(Math.floor(Date.now() / 1000) + 3600),
      "x-ratelimit-used": "4900",
    });

    expect(_client.shouldThrottle.throttle).toBe(true);
  });
});
