import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("polling", () => {
  let mockQueryOne: ReturnType<typeof vi.fn>;
  let mockGetAllRateLimitInfo: ReturnType<typeof vi.fn>;
  let mockPollForLabeledIssues: ReturnType<typeof vi.fn>;
  let mockPollQueuedJobs: ReturnType<typeof vi.fn>;
  let mockPollReadyToPrJobs: ReturnType<typeof vi.fn>;
  let mockPollPrReviewingJobs: ReturnType<typeof vi.fn>;
  let mockPollNeedsInfoJobs: ReturnType<typeof vi.fn>;
  let mockSetLastPollTime: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
    vi.useFakeTimers();

    mockQueryOne = vi.fn().mockResolvedValue(undefined);

    mockGetAllRateLimitInfo = vi.fn().mockReturnValue({
      tokenCount: 1,
      hasWarning: false,
      hasCritical: false,
      lowestRemaining: null,
    });

    mockPollForLabeledIssues = vi.fn().mockResolvedValue({ checked: 0, created: 0 });
    mockPollQueuedJobs = vi.fn().mockResolvedValue({ started: 0, skipped: 0, errors: [] });
    mockPollReadyToPrJobs = vi.fn().mockResolvedValue(undefined);
    mockPollPrReviewingJobs = vi.fn().mockResolvedValue(undefined);
    mockPollNeedsInfoJobs = vi.fn().mockResolvedValue(undefined);
    mockSetLastPollTime = vi.fn();

    vi.doMock("../db/index.js", () => ({
      getConn: vi.fn(() => ({})),
    }));
    vi.doMock("@devkit/duckdb", () => ({
      queryAll: vi.fn(),
      queryOne: mockQueryOne,
      execute: vi.fn(),
      withTransaction: vi.fn(),
      buildUpdate: vi.fn(),
      buildWhere: vi.fn(),
      buildInClause: vi.fn(),
      checkpoint: vi.fn(),
      parseJsonField: vi.fn((v: unknown, fallback: unknown) => (v === null || v === undefined ? fallback : v)),
    }));
    vi.doMock("./health-events.js", () => ({
      emitHealthEvent: vi.fn(),
    }));
    vi.doMock("../utils/logger.js", () => ({
      createServiceLogger: () => ({
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      }),
    }));
    vi.doMock("./issue-sync.js", () => ({
      syncAllIssues: vi.fn().mockResolvedValue(undefined),
    }));
    vi.doMock("./plan-approval.js", () => ({
      pollPlanApprovalJobs: vi.fn().mockResolvedValue(undefined),
    }));
    vi.doMock("./stale-job-monitor.js", () => ({
      checkStaleJobs: vi.fn().mockResolvedValue(undefined),
    }));
    vi.doMock("./github/index.js", () => ({
      getAllRateLimitInfo: mockGetAllRateLimitInfo,
    }));
    vi.doMock("./issue-polling.js", () => ({
      pollForLabeledIssues: mockPollForLabeledIssues,
    }));
    vi.doMock("./job-auto-start.js", () => ({
      pollQueuedJobs: mockPollQueuedJobs,
    }));
    vi.doMock("./pr-flow.js", () => ({
      pollReadyToPrJobs: mockPollReadyToPrJobs,
    }));
    vi.doMock("./pr-reviewing.js", () => ({
      pollPrReviewingJobs: mockPollPrReviewingJobs,
    }));
    vi.doMock("./needs-info.js", () => ({
      pollNeedsInfoJobs: mockPollNeedsInfoJobs,
    }));
    vi.doMock("../api/health.js", () => ({
      setLastPollTime: mockSetLastPollTime,
    }));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("getThrottleState", () => {
    it("should return non-throttled state initially", async () => {
      const { getThrottleState } = await import("./polling.js");
      const state = getThrottleState();
      expect(state.isThrottled).toBe(false);
    });
  });

  describe("getEffectivePollInterval", () => {
    it("should return default interval when no setting exists", async () => {
      const { getEffectivePollInterval } = await import("./polling.js");
      const interval = await getEffectivePollInterval();
      expect(interval).toBe(60000);
    });

    it("should return 3x interval when rate limit is in warning state", async () => {
      mockGetAllRateLimitInfo.mockReturnValue({
        tokenCount: 1,
        hasWarning: true,
        hasCritical: false,
        lowestRemaining: null,
      });

      const { getEffectivePollInterval } = await import("./polling.js");
      const interval = await getEffectivePollInterval();
      expect(interval).toBe(180000); // 60000 * 3
    });

    it("should use configured interval from database", async () => {
      mockQueryOne.mockResolvedValue({
        key: "poll_interval_ms",
        value: { ms: 30000 },
      });

      const { getEffectivePollInterval } = await import("./polling.js");
      const interval = await getEffectivePollInterval();
      expect(interval).toBe(30000);
    });
  });

  describe("startPolling / stopPolling", () => {
    it("should start and stop polling", async () => {
      const { startPolling, stopPolling, isPollingActive } = await import("./polling.js");

      expect(isPollingActive()).toBe(false);

      await startPolling();
      expect(isPollingActive()).toBe(true);

      stopPolling();
      expect(isPollingActive()).toBe(false);
    });

    it("should be idempotent when already started", async () => {
      const { startPolling, isPollingActive } = await import("./polling.js");

      await startPolling();
      await startPolling(); // Second call should be a no-op

      expect(isPollingActive()).toBe(true);
    });

    it("should run poll cycle immediately on start", async () => {
      const { startPolling, stopPolling } = await import("./polling.js");

      await startPolling();

      // The first poll cycle runs immediately (sync, but the sub-polls are async)
      // Allow microtasks to settle
      await vi.advanceTimersByTimeAsync(0);

      expect(mockPollNeedsInfoJobs).toHaveBeenCalled();
      expect(mockPollForLabeledIssues).toHaveBeenCalled();
      expect(mockPollQueuedJobs).toHaveBeenCalled();
      expect(mockPollReadyToPrJobs).toHaveBeenCalled();
      expect(mockPollPrReviewingJobs).toHaveBeenCalled();

      stopPolling();
    });

    it("should record last poll time on successful cycle", async () => {
      const { startPolling, stopPolling } = await import("./polling.js");

      await startPolling();
      await vi.advanceTimersByTimeAsync(0);

      expect(mockSetLastPollTime).toHaveBeenCalledWith(expect.any(Date));

      stopPolling();
    });
  });

  describe("poll cycle rate limit handling", () => {
    it("should skip poll cycle when rate limit is critical", async () => {
      mockGetAllRateLimitInfo.mockReturnValue({
        tokenCount: 1,
        hasWarning: true,
        hasCritical: true,
        lowestRemaining: { remaining: 5, limit: 5000, reset: new Date() },
      });

      const { startPolling, stopPolling } = await import("./polling.js");

      await startPolling();
      await vi.advanceTimersByTimeAsync(0);

      // Sub-polls should NOT have been called
      expect(mockPollForLabeledIssues).not.toHaveBeenCalled();
      expect(mockPollQueuedJobs).not.toHaveBeenCalled();

      stopPolling();
    });
  });

  describe("poll cycle error handling", () => {
    it("should not crash if a sub-poller throws", async () => {
      mockPollForLabeledIssues.mockRejectedValue(new Error("GitHub API failure"));

      const { startPolling, stopPolling, isPollingActive } = await import("./polling.js");

      await startPolling();
      await vi.advanceTimersByTimeAsync(0);

      // Polling should still be active despite the error
      expect(isPollingActive()).toBe(true);

      stopPolling();
    });
  });
});
