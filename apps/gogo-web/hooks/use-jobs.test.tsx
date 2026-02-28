import type { Job, JobLog } from "@claudekit/gogo-shared";
import { cast } from "@claudekit/test-utils";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  appendLogToCache,
  invalidateJobsList,
  jobKeys,
  updateJobInCache,
  useApprovePlan,
  useCheckNeedsInfoResponse,
  useCreateManualJob,
  useCreatePr,
  useHealth,
  useHealthEvents,
  useJob,
  useJobAction,
  useJobEvents,
  useJobLogs,
  useJobs,
  useResumeAgent,
  useStaleJobs,
} from "@/hooks/use-jobs";

// Mock fetch globally
const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

const mockJob = {
  id: "job-1",
  repositoryId: "repo-1",
  issueNumber: 1,
  issueUrl: "https://github.com/test/repo/issues/1",
  issueTitle: "Test Issue",
  issueBody: null,
  status: "queued",
  branch: null,
  worktreePath: null,
  prNumber: null,
  prUrl: null,
  testRetryCount: 0,
  lastTestOutput: null,
  changeSummary: null,
  pauseReason: null,
  failureReason: null,
  needsInfoQuestion: null,
  needsInfoCommentId: null,
  lastCheckedCommentId: null,
  claudeSessionId: null,
  injectMode: "immediate",
  pendingInjection: null,
  processPid: null,
  processStartedAt: null,
  agentType: "claude-code",
  agentSessionData: null,
  planContent: null,
  planCommentId: null,
  lastCheckedPlanCommentId: null,
  source: "github_issue",
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-01T00:00:00Z",
};

const mockJobsResponse = {
  data: [mockJob],
  pagination: { total: 1, limit: 50, offset: 0 },
};

describe("jobKeys", () => {
  it("generates correct key patterns", () => {
    expect(jobKeys.all).toEqual(["jobs"]);
    expect(jobKeys.lists()).toEqual(["jobs", "list"]);
    expect(jobKeys.list()).toEqual(["jobs", "list", {}]);
    expect(jobKeys.list({ status: "running" as const })).toEqual(["jobs", "list", { status: "running" }]);
    expect(jobKeys.stale()).toEqual(["jobs", "stale", 60]);
    expect(jobKeys.stale(30)).toEqual(["jobs", "stale", 30]);
    expect(jobKeys.details()).toEqual(["jobs", "detail"]);
    expect(jobKeys.detail("job-1")).toEqual(["jobs", "detail", "job-1"]);
    expect(jobKeys.events("job-1")).toEqual(["jobs", "detail", "job-1", "events"]);
    expect(jobKeys.logs("job-1")).toEqual(["jobs", "detail", "job-1", "logs"]);
  });
});

describe("useJobs", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches jobs successfully", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockJobsResponse),
    });

    const { result } = renderHook(() => useJobs(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.data).toHaveLength(1);
    expect(result.current.data?.data[0].id).toBe("job-1");
  });

  it("passes filter params to fetch", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          data: [],
          pagination: { total: 0, limit: 50, offset: 0 },
        }),
    });

    renderHook(() => useJobs({ status: "running", repositoryId: "repo-1" }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("status=running");
    expect(url).toContain("repositoryId=repo-1");
  });
});

describe("useStaleJobs", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches stale jobs with default threshold", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: [], thresholdMinutes: 60, count: 0 }),
    });

    const { result } = renderHook(() => useStaleJobs(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining("thresholdMinutes=60"), expect.any(Object));
  });

  it("fetches stale jobs with custom threshold", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: [], thresholdMinutes: 30, count: 0 }),
    });

    const { result } = renderHook(() => useStaleJobs(30), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("thresholdMinutes=30");
  });
});

describe("useJob", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches a single job by ID", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: mockJob }),
    });

    const { result } = renderHook(() => useJob("job-1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.id).toBe("job-1");
  });

  it("returns null when jobId is null", async () => {
    const { result } = renderHook(() => useJob(null), {
      wrapper: createWrapper(),
    });

    // Query should not be enabled
    expect(result.current.fetchStatus).toBe("idle");
  });
});

describe("useJobEvents", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches job events", async () => {
    const mockEvents = [{ id: "evt-1", type: "status_changed", createdAt: "2024-01-01T00:00:00Z" }];
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: mockEvents }),
    });

    const { result } = renderHook(() => useJobEvents("job-1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockEvents);
  });

  it("returns empty array when jobId is null", async () => {
    const { result } = renderHook(() => useJobEvents(null), {
      wrapper: createWrapper(),
    });

    expect(result.current.fetchStatus).toBe("idle");
  });
});

describe("useJobLogs", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches and sorts job logs", async () => {
    const mockLogs = [
      { id: "log-2", sequence: 2, createdAt: "2024-01-01T00:00:02Z", content: "second" },
      { id: "log-1", sequence: 1, createdAt: "2024-01-01T00:00:01Z", content: "first" },
    ];
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: mockLogs }),
    });

    const { result } = renderHook(() => useJobLogs("job-1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    // Should be sorted by timestamp
    expect(result.current.data?.[0].id).toBe("log-1");
    expect(result.current.data?.[1].id).toBe("log-2");
  });

  it("sorts logs by sequence when timestamps match", async () => {
    const sameTime = "2024-01-01T00:00:00Z";
    const mockLogs = [
      { id: "log-2", sequence: 2, createdAt: sameTime, content: "second" },
      { id: "log-1", sequence: 1, createdAt: sameTime, content: "first" },
    ];
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: mockLogs }),
    });

    const { result } = renderHook(() => useJobLogs("job-1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.[0].sequence).toBe(1);
    expect(result.current.data?.[1].sequence).toBe(2);
  });

  it("does not fetch when jobId is null", async () => {
    const { result } = renderHook(() => useJobLogs(null), {
      wrapper: createWrapper(),
    });

    expect(result.current.fetchStatus).toBe("idle");
  });
});

describe("useJobAction", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("performs a pause action", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          data: { ...mockJob, status: "paused" },
        }),
    });

    const { result } = renderHook(() => useJobAction(), {
      wrapper: createWrapper(),
    });

    result.current.mutate({
      jobId: "job-1",
      action: { type: "pause" },
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/jobs/job-1/actions"),
      expect.objectContaining({ method: "POST" }),
    );
  });
});

describe("useCreatePr", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("creates a PR for a job", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ success: true, prUrl: "https://github.com/pr/1", prNumber: 1 }),
    });

    const { result } = renderHook(() => useCreatePr(), {
      wrapper: createWrapper(),
    });

    result.current.mutate("job-1");

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/jobs/job-1/create-pr"),
      expect.objectContaining({ method: "POST" }),
    );
  });
});

describe("useCreateManualJob", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("creates a manual job", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: { id: "job-new" } }),
    });

    const { result } = renderHook(() => useCreateManualJob(), {
      wrapper: createWrapper(),
    });

    result.current.mutate({ repositoryId: "repo-1", title: "Manual task" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/jobs/manual"),
      expect.objectContaining({ method: "POST" }),
    );
  });
});

describe("useApprovePlan", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("approves a plan", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: { ...mockJob, status: "running" } }),
    });

    const { result } = renderHook(() => useApprovePlan(), {
      wrapper: createWrapper(),
    });

    result.current.mutate({ jobId: "job-1", approved: true, message: "LGTM" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/jobs/job-1/approve-plan"),
      expect.objectContaining({ method: "POST" }),
    );
  });
});

describe("useCheckNeedsInfoResponse", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("checks for a needs_info response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ success: true, responseFound: true, message: "Found" }),
    });

    const { result } = renderHook(() => useCheckNeedsInfoResponse(), {
      wrapper: createWrapper(),
    });

    result.current.mutate("job-1");

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/jobs/job-1/check-response"),
      expect.objectContaining({ method: "POST" }),
    );
  });
});

describe("useResumeAgent", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("resumes an agent with message", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    });

    const { result } = renderHook(() => useResumeAgent(), {
      wrapper: createWrapper(),
    });

    result.current.mutate({ jobId: "job-1", message: "Continue", agentType: "claude-code" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/jobs/job-1/resume-agent"),
      expect.objectContaining({ method: "POST" }),
    );
  });
});

describe("useHealth", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("fetches health status", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ status: "ok", uptime: 1000 }),
    });

    const { result } = renderHook(() => useHealth(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.status).toBe("ok");
  });
});

describe("useHealthEvents", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("fetches health events with default limit", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([{ type: "poll", timestamp: "2024-01-01T00:00:00Z", message: "Polled" }]),
    });

    const { result } = renderHook(() => useHealthEvents(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining("limit=50"), expect.any(Object));
  });

  it("fetches health events with custom limit", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([]),
    });

    const { result } = renderHook(() => useHealthEvents(10), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining("limit=10"), expect.any(Object));
  });
});

describe("updateJobInCache", () => {
  it("updates job in detail and list caches", () => {
    const queryClient = createQueryClient();
    const updatedJob = cast<Job>({ ...mockJob, status: "running" });

    // Seed the detail cache
    queryClient.setQueryData(jobKeys.detail("job-1"), mockJob);
    // Seed a list cache
    queryClient.setQueryData(jobKeys.list(), {
      data: [mockJob],
      pagination: { total: 1, limit: 50, offset: 0 },
    });

    updateJobInCache(queryClient, updatedJob);

    // Verify detail cache was updated
    expect(queryClient.getQueryData(jobKeys.detail("job-1"))).toEqual(updatedJob);
  });
});

describe("appendLogToCache", () => {
  it("appends a log entry to the cache", () => {
    const queryClient = createQueryClient();
    const existingLog = {
      id: "log-1",
      sequence: 1,
      createdAt: "2024-01-01T00:00:01Z",
      content: "first",
    };
    queryClient.setQueryData(jobKeys.logs("job-1"), [existingLog]);

    const newLog = cast<JobLog>({
      id: "log-2",
      sequence: 2,
      createdAt: "2024-01-01T00:00:02Z",
      content: "second",
    });

    appendLogToCache(queryClient, "job-1", newLog);

    const logs = queryClient.getQueryData(jobKeys.logs("job-1")) as Array<{ id: string }>;
    expect(logs).toHaveLength(2);
    expect(logs[0].id).toBe("log-1");
    expect(logs[1].id).toBe("log-2");
  });

  it("avoids duplicate log entries", () => {
    const queryClient = createQueryClient();
    const existingLog = {
      id: "log-1",
      sequence: 1,
      createdAt: "2024-01-01T00:00:01Z",
      content: "first",
    };
    queryClient.setQueryData(jobKeys.logs("job-1"), [existingLog]);

    appendLogToCache(queryClient, "job-1", cast<JobLog>(existingLog));

    const logs = queryClient.getQueryData(jobKeys.logs("job-1")) as Array<{ id: string }>;
    expect(logs).toHaveLength(1);
  });

  it("creates new cache entry when none exists", () => {
    const queryClient = createQueryClient();
    const newLog = cast<JobLog>({
      id: "log-1",
      sequence: 1,
      createdAt: "2024-01-01T00:00:01Z",
      content: "first",
    });

    appendLogToCache(queryClient, "job-1", newLog);

    const logs = queryClient.getQueryData(jobKeys.logs("job-1")) as Array<{ id: string }>;
    expect(logs).toHaveLength(1);
    expect(logs[0].id).toBe("log-1");
  });
});

describe("invalidateJobsList", () => {
  it("invalidates all job list queries", () => {
    const queryClient = createQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    invalidateJobsList(queryClient);

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: jobKeys.lists() });
  });
});
