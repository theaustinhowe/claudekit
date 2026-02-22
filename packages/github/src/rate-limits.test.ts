import { describe, expect, it } from "vitest";
import {
  getAllRateLimitInfo,
  getRateLimitInfo,
  shouldThrottleRequests,
  updateRateLimitFromResponse,
} from "./rate-limits";

function makeHeaders(opts: {
  limit: number;
  remaining: number;
  reset: number;
  used?: number;
}): Record<string, unknown> {
  const h: Record<string, unknown> = {
    "x-ratelimit-limit": String(opts.limit),
    "x-ratelimit-remaining": String(opts.remaining),
    "x-ratelimit-reset": String(opts.reset),
  };
  if (opts.used !== undefined) {
    h["x-ratelimit-used"] = String(opts.used);
  }
  return h;
}

describe("updateRateLimitFromResponse", () => {
  it("returns no warning/critical when plenty remaining", () => {
    const result = updateRateLimitFromResponse(
      "token-plenty-1",
      makeHeaders({ limit: 5000, remaining: 4000, reset: Math.floor(Date.now() / 1000) + 3600 }),
    );
    expect(result).toEqual({ warning: false, critical: false });
  });

  it("returns warning at 20% threshold", () => {
    const result = updateRateLimitFromResponse(
      "token-warning-1",
      makeHeaders({ limit: 5000, remaining: 1000, reset: Math.floor(Date.now() / 1000) + 3600 }),
    );
    expect(result).toEqual({ warning: true, critical: false });
  });

  it("returns warning and critical at 10% threshold", () => {
    const result = updateRateLimitFromResponse(
      "token-critical-1",
      makeHeaders({ limit: 5000, remaining: 500, reset: Math.floor(Date.now() / 1000) + 3600 }),
    );
    expect(result).toEqual({ warning: true, critical: true });
  });

  it("returns no warning/critical when headers are missing", () => {
    const result = updateRateLimitFromResponse("token-missing-1", {});
    expect(result).toEqual({ warning: false, critical: false });
  });

  it("computes used from limit - remaining when x-ratelimit-used absent", () => {
    updateRateLimitFromResponse(
      "token-computed-used-1",
      makeHeaders({ limit: 5000, remaining: 3000, reset: Math.floor(Date.now() / 1000) + 3600 }),
    );
    const info = getRateLimitInfo("token-computed-used-1");
    expect(info).not.toBeNull();
    expect(info?.used).toBe(2000);
  });

  it("uses explicit x-ratelimit-used when present", () => {
    updateRateLimitFromResponse(
      "token-explicit-used-1",
      makeHeaders({ limit: 5000, remaining: 3000, reset: Math.floor(Date.now() / 1000) + 3600, used: 1999 }),
    );
    const info = getRateLimitInfo("token-explicit-used-1");
    expect(info).not.toBeNull();
    expect(info?.used).toBe(1999);
  });

  it("converts reset unix timestamp to Date", () => {
    const resetTs = Math.floor(Date.now() / 1000) + 7200;
    updateRateLimitFromResponse("token-reset-date-1", makeHeaders({ limit: 5000, remaining: 4000, reset: resetTs }));
    const info = getRateLimitInfo("token-reset-date-1");
    expect(info).not.toBeNull();
    expect(info?.reset).toEqual(new Date(resetTs * 1000));
  });

  it("overwrites previous data for same token", () => {
    const token = "token-overwrite-1";
    updateRateLimitFromResponse(token, makeHeaders({ limit: 5000, remaining: 4000, reset: 1000000 }));
    updateRateLimitFromResponse(token, makeHeaders({ limit: 5000, remaining: 100, reset: 2000000 }));
    const info = getRateLimitInfo(token);
    expect(info).not.toBeNull();
    expect(info?.remaining).toBe(100);
  });
});

describe("getRateLimitInfo", () => {
  it("returns null for unknown token", () => {
    expect(getRateLimitInfo("token-unknown-999")).toBeNull();
  });

  it("returns stored info after update", () => {
    updateRateLimitFromResponse(
      "token-stored-1",
      makeHeaders({ limit: 5000, remaining: 2500, reset: Math.floor(Date.now() / 1000) + 3600 }),
    );
    const info = getRateLimitInfo("token-stored-1");
    expect(info).not.toBeNull();
    expect(info?.limit).toBe(5000);
    expect(info?.remaining).toBe(2500);
  });
});

describe("shouldThrottleRequests", () => {
  it("returns shouldThrottle: false when no data exists", () => {
    const result = shouldThrottleRequests("token-no-data-1");
    expect(result).toEqual({ shouldThrottle: false });
  });

  it("returns shouldThrottle: false when remaining > 20%", () => {
    updateRateLimitFromResponse(
      "token-no-throttle-1",
      makeHeaders({ limit: 5000, remaining: 4000, reset: Math.floor(Date.now() / 1000) + 3600 }),
    );
    const result = shouldThrottleRequests("token-no-throttle-1");
    expect(result).toEqual({ shouldThrottle: false });
  });

  it("returns shouldThrottle: true with 5000ms delay at warning level", () => {
    updateRateLimitFromResponse(
      "token-throttle-warn-1",
      makeHeaders({ limit: 5000, remaining: 900, reset: Math.floor(Date.now() / 1000) + 3600 }),
    );
    const result = shouldThrottleRequests("token-throttle-warn-1");
    expect(result.shouldThrottle).toBe(true);
    expect(result.delayMs).toBe(5000);
  });

  it("returns shouldThrottle: true with capped delay at critical level", () => {
    updateRateLimitFromResponse(
      "token-throttle-crit-1",
      makeHeaders({ limit: 5000, remaining: 100, reset: Math.floor(Date.now() / 1000) + 120 }),
    );
    const result = shouldThrottleRequests("token-throttle-crit-1");
    expect(result.shouldThrottle).toBe(true);
    expect(result.delayMs).toBeDefined();
    expect(result.delayMs).toBeLessThanOrEqual(60000);
  });

  it("caps delay at 60000ms even with far-future reset", () => {
    updateRateLimitFromResponse(
      "token-cap-delay-1",
      makeHeaders({ limit: 5000, remaining: 10, reset: Math.floor(Date.now() / 1000) + 999999 }),
    );
    const result = shouldThrottleRequests("token-cap-delay-1");
    expect(result.shouldThrottle).toBe(true);
    expect(result.delayMs).toBe(60000);
  });
});

describe("getAllRateLimitInfo", () => {
  it("finds lowest remaining across multiple tokens", () => {
    updateRateLimitFromResponse(
      "token-multi-a",
      makeHeaders({ limit: 5000, remaining: 3000, reset: Math.floor(Date.now() / 1000) + 3600 }),
    );
    updateRateLimitFromResponse(
      "token-multi-b",
      makeHeaders({ limit: 5000, remaining: 500, reset: Math.floor(Date.now() / 1000) + 3600 }),
    );
    const all = getAllRateLimitInfo();
    expect(all.tokenCount).toBeGreaterThanOrEqual(2);
    expect(all.lowestRemaining).not.toBeNull();
    expect(all.lowestRemaining?.remaining).toBeLessThanOrEqual(500);
  });

  it("detects warning and critical states", () => {
    updateRateLimitFromResponse(
      "token-allinfo-warn",
      makeHeaders({ limit: 5000, remaining: 900, reset: Math.floor(Date.now() / 1000) + 3600 }),
    );
    updateRateLimitFromResponse(
      "token-allinfo-crit",
      makeHeaders({ limit: 5000, remaining: 100, reset: Math.floor(Date.now() / 1000) + 3600 }),
    );
    const all = getAllRateLimitInfo();
    expect(all.hasCritical).toBe(true);
  });
});
