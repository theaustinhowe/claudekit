import { Octokit } from "octokit";
import { getRateLimitInfo, shouldThrottleRequests, updateRateLimitFromResponse } from "./rate-limits";
import type { RateLimitInfo } from "./types";

export class GitHubClient {
  readonly octokit: Octokit;
  private readonly token: string;

  constructor(config: { token: string }) {
    this.token = config.token;
    this.octokit = new Octokit({ auth: config.token });

    this.octokit.hook.after("request", (response) => {
      if (response.headers) {
        updateRateLimitFromResponse(this.token, response.headers);
      }
    });
  }

  get rateLimits(): RateLimitInfo | null {
    return getRateLimitInfo(this.token);
  }

  get shouldThrottle(): { throttle: boolean; reason?: string; delayMs?: number } {
    const result = shouldThrottleRequests(this.token);
    return {
      throttle: result.shouldThrottle,
      reason: result.reason,
      delayMs: result.delayMs,
    };
  }
}
