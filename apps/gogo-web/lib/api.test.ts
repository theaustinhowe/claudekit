import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

let api: typeof import("@/lib/api");

describe("getApiUrl behavior", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("uses NEXT_PUBLIC_API_URL env var when set", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "http://custom-api:9000");
    api = await import("@/lib/api");

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: {} }),
    });

    await api.fetchSettings();
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("http://custom-api:9000");
  });

  it("uses browser hostname and default port when no env var set", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "");
    Object.defineProperty(globalThis, "window", {
      value: {
        location: {
          hostname: "192.168.1.50",
          protocol: "http:",
        },
        localStorage: {
          getItem: () => null,
          setItem: () => {},
        },
      },
      writable: true,
      configurable: true,
    });

    api = await import("@/lib/api");

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: {} }),
    });

    await api.fetchSettings();
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("http://192.168.1.50:2201");
  });
});

describe("API functions", () => {
  beforeEach(async () => {
    mockFetch.mockReset();
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_API_URL", "http://localhost:2201");
    api = await import("@/lib/api");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  describe("fetchJobs", () => {
    it("fetches jobs without params", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: [], pagination: { total: 0, limit: 50, offset: 0 } }),
      });

      const result = await api.fetchJobs();
      expect(mockFetch).toHaveBeenCalledWith("http://localhost:2201/api/jobs", expect.any(Object));
      expect(result.data).toEqual([]);
    });

    it("appends query params when provided", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: [], pagination: { total: 0, limit: 10, offset: 0 } }),
      });

      await api.fetchJobs({ status: "running" as const, repositoryId: "repo-1", limit: 10 });
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain("status=running");
      expect(url).toContain("repositoryId=repo-1");
      expect(url).toContain("limit=10");
    });
  });

  describe("fetchJob", () => {
    it("fetches a single job by ID", async () => {
      const mockJob = { id: "job-1", status: "running" };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: mockJob }),
      });

      const result = await api.fetchJob("job-1");
      expect(mockFetch).toHaveBeenCalledWith("http://localhost:2201/api/jobs/job-1", expect.any(Object));
      expect(result.data).toEqual(mockJob);
    });
  });

  describe("performJobAction", () => {
    it("sends POST with action payload", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: { id: "job-1", status: "paused" } }),
      });

      await api.performJobAction("job-1", { type: "pause" });
      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:2201/api/jobs/job-1/actions",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ type: "pause" }),
        }),
      );
    });
  });

  describe("fetchSettings", () => {
    it("fetches settings from the API", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: { maxConcurrent: 3 } }),
      });

      const result = await api.fetchSettings();
      expect(result.data).toEqual({ maxConcurrent: 3 });
    });
  });

  describe("updateSettings", () => {
    it("sends PUT with settings", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: { maxConcurrent: 5 } }),
      });

      await api.updateSettings({ maxConcurrent: 5 });
      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:2201/api/settings",
        expect.objectContaining({
          method: "PUT",
          body: JSON.stringify({ maxConcurrent: 5 }),
        }),
      );
    });
  });

  describe("fetchWorktrees", () => {
    it("fetches worktrees", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: [] }),
      });

      const result = await api.fetchWorktrees();
      expect(mockFetch).toHaveBeenCalledWith("http://localhost:2201/api/worktrees", expect.any(Object));
      expect(result.data).toEqual([]);
    });
  });

  describe("cleanupWorktree", () => {
    it("sends POST to cleanup endpoint", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });

      await api.cleanupWorktree("job-1");
      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:2201/api/worktrees/job-1/cleanup",
        expect.objectContaining({ method: "POST" }),
      );
    });
  });

  describe("fetchAgents", () => {
    it("fetches agents and returns data array", async () => {
      const agents = [{ type: "claude-code", displayName: "Claude Code" }];
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: agents }),
      });

      const result = await api.fetchAgents();
      expect(result).toEqual(agents);
    });

    it("returns empty array when data is null", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: null }),
      });

      const result = await api.fetchAgents();
      expect(result).toEqual([]);
    });
  });

  describe("fetchAllAgents", () => {
    it("fetches all known agents", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: [] }),
      });

      const result = await api.fetchAllAgents();
      expect(mockFetch).toHaveBeenCalledWith("http://localhost:2201/api/agents/all", expect.any(Object));
      expect(result).toEqual([]);
    });
  });

  describe("fetchAgentStatus", () => {
    it("fetches agent status by type", async () => {
      const status = { type: "claude-code", available: true, configured: true, registered: true, message: "ok" };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: status }),
      });

      const result = await api.fetchAgentStatus("claude-code");
      expect(mockFetch).toHaveBeenCalledWith("http://localhost:2201/api/agents/claude-code/status", expect.any(Object));
      expect(result).toEqual(status);
    });
  });

  describe("fetchIssues", () => {
    it("fetches issues for a repository", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: [], pagination: { page: 1, per_page: 30 } }),
      });

      await api.fetchIssues("repo-1", { state: "open", labels: "agent" });
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain("/api/repositories/repo-1/issues");
      expect(url).toContain("state=open");
      expect(url).toContain("labels=agent");
    });
  });

  describe("createIssue", () => {
    it("creates an issue with POST", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: { number: 42, title: "New Issue" } }),
      });

      await api.createIssue("repo-1", { title: "New Issue", body: "Description" });
      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:2201/api/repositories/repo-1/issues",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ title: "New Issue", body: "Description" }),
        }),
      );
    });
  });

  describe("fetchResearchSessions", () => {
    it("fetches research sessions", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: [] }),
      });

      const result = await api.fetchResearchSessions();
      expect(mockFetch).toHaveBeenCalledWith("http://localhost:2201/api/research/sessions", expect.any(Object));
      expect(result.data).toEqual([]);
    });
  });

  describe("startResearch", () => {
    it("starts a research session with POST", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: { id: "session-1", status: "running" } }),
      });

      await api.startResearch({ repositoryId: "repo-1", focusAreas: ["security"] });
      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:2201/api/research/sessions",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ repositoryId: "repo-1", focusAreas: ["security"] }),
        }),
      );
    });
  });

  describe("cancelResearch", () => {
    it("cancels a research session with DELETE", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });

      await api.cancelResearch("session-1");
      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:2201/api/research/session-1",
        expect.objectContaining({ method: "DELETE" }),
      );
    });
  });

  describe("convertSuggestion", () => {
    it("converts a suggestion with POST", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: { convertedTo: "github_issue", convertedId: "123" } }),
      });

      await api.convertSuggestion("session-1", "sug-1", "github_issue");
      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:2201/api/research/session-1/suggestions/sug-1/convert",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ convertTo: "github_issue" }),
        }),
      );
    });
  });

  describe("fetchSetupStatus", () => {
    it("fetches setup status", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ needsSetup: true, repositoryCount: 0 }),
      });

      const result = await api.fetchSetupStatus();
      expect(result.needsSetup).toBe(true);
    });
  });

  describe("verifyGitHub", () => {
    it("verifies a GitHub token", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, data: { username: "testuser" } }),
      });

      await api.verifyGitHub("ghp_test123");
      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:2201/api/setup/verify-github",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ token: "ghp_test123" }),
        }),
      );
    });
  });

  describe("completeSetup", () => {
    it("completes setup with POST", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, data: { id: "repo-1" } }),
      });

      await api.completeSetup({
        githubToken: "ghp_test",
        owner: "testowner",
        name: "testrepo",
        triggerLabel: "agent",
        baseBranch: "main",
        workdirPath: "/tmp/work",
      });

      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:2201/api/setup/complete",
        expect.objectContaining({ method: "POST" }),
      );
    });
  });

  describe("fetchHealth", () => {
    it("fetches health status", async () => {
      const healthData = { status: "ok", uptime: 1000 };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(healthData),
      });

      const result = await api.fetchHealth();
      expect(result.status).toBe("ok");
    });
  });

  describe("createManualJob", () => {
    it("creates a manual job with POST", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: { id: "job-new" } }),
      });

      await api.createManualJob({ repositoryId: "repo-1", title: "Manual task" });
      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:2201/api/jobs/manual",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ repositoryId: "repo-1", title: "Manual task" }),
        }),
      );
    });
  });

  describe("fetchStaleJobs", () => {
    it("fetches stale jobs with default threshold", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: [], thresholdMinutes: 60, count: 0 }),
      });

      const result = await api.fetchStaleJobs();
      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:2201/api/jobs/stale?thresholdMinutes=60",
        expect.any(Object),
      );
      expect(result.count).toBe(0);
    });

    it("fetches stale jobs with custom threshold", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: [], thresholdMinutes: 30, count: 0 }),
      });

      await api.fetchStaleJobs(30);
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain("thresholdMinutes=30");
    });
  });

  describe("fetchJobEvents", () => {
    it("fetches job events without params", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: [] }),
      });

      const result = await api.fetchJobEvents("job-1");
      expect(mockFetch).toHaveBeenCalledWith("http://localhost:2201/api/jobs/job-1/events", expect.any(Object));
      expect(result.data).toEqual([]);
    });

    it("appends query params when provided", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: [] }),
      });

      await api.fetchJobEvents("job-1", { limit: 10, offset: 5, after: "2024-01-01" });
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain("limit=10");
      expect(url).toContain("offset=5");
      expect(url).toContain("after=2024-01-01");
    });
  });

  describe("fetchJobLogs", () => {
    it("fetches job logs without params", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: [] }),
      });

      const result = await api.fetchJobLogs("job-1");
      expect(mockFetch).toHaveBeenCalledWith("http://localhost:2201/api/jobs/job-1/logs", expect.any(Object));
      expect(result.data).toEqual([]);
    });

    it("appends query params when provided", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: [] }),
      });

      await api.fetchJobLogs("job-1", { limit: 50, afterSequence: 100, stream: "stderr" });
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain("limit=50");
      expect(url).toContain("afterSequence=100");
      expect(url).toContain("stream=stderr");
    });
  });

  describe("resumeAgentWithMessage", () => {
    it("sends POST with message and agentType", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });

      await api.resumeAgentWithMessage("job-1", "Continue working", "claude-code");
      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:2201/api/jobs/job-1/resume-agent",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ message: "Continue working", agentType: "claude-code" }),
        }),
      );
    });
  });

  describe("fetchHealthEvents", () => {
    it("fetches health events with default limit", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([]),
      });

      const result = await api.fetchHealthEvents();
      expect(mockFetch).toHaveBeenCalledWith("http://localhost:2201/api/health/events?limit=50", expect.any(Object));
      expect(result).toEqual([]);
    });

    it("fetches health events with custom limit", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([]),
      });

      await api.fetchHealthEvents(10);
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain("limit=10");
    });
  });

  describe("createPr", () => {
    it("sends POST to create-pr endpoint", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, prUrl: "https://github.com/pr/1", prNumber: 1 }),
      });

      const result = await api.createPr("job-1");
      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:2201/api/jobs/job-1/create-pr",
        expect.objectContaining({ method: "POST" }),
      );
      expect(result.success).toBe(true);
    });
  });

  describe("approvePlan", () => {
    it("sends POST to approve-plan endpoint", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: { id: "job-1", status: "running" } }),
      });

      await api.approvePlan("job-1", true, "Looks good");
      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:2201/api/jobs/job-1/approve-plan",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ approved: true, message: "Looks good" }),
        }),
      );
    });
  });

  describe("checkNeedsInfoResponse", () => {
    it("sends POST to check-response endpoint", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, responseFound: true, message: "Found response" }),
      });

      const result = await api.checkNeedsInfoResponse("job-1");
      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:2201/api/jobs/job-1/check-response",
        expect.objectContaining({ method: "POST" }),
      );
      expect(result.responseFound).toBe(true);
    });
  });

  describe("fetchPrMergeStatus", () => {
    it("fetches PR merge status for a job", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ merged: true, prNumber: 42, prUrl: "https://github.com/pr/42" }),
      });

      const result = await api.fetchPrMergeStatus("job-1");
      expect(mockFetch).toHaveBeenCalledWith("http://localhost:2201/api/worktrees/job-1/pr-status", expect.any(Object));
      expect(result.merged).toBe(true);
    });
  });

  describe("fetchChangedFiles", () => {
    it("fetches changed files for a job", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ files: [{ path: "src/index.ts", status: "modified" }], baseBranch: "main" }),
      });

      const result = await api.fetchChangedFiles("job-1");
      expect(mockFetch).toHaveBeenCalledWith("http://localhost:2201/api/worktrees/job-1/changes", expect.any(Object));
      expect(result.files).toHaveLength(1);
    });
  });

  describe("fetchFileDiff", () => {
    it("fetches diff for a specific file", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ diff: "+new line", filePath: "src/index.ts", baseBranch: "main" }),
      });

      const result = await api.fetchFileDiff("job-1", "src/index.ts");
      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:2201/api/worktrees/job-1/diff?path=src%2Findex.ts",
        expect.any(Object),
      );
      expect(result.diff).toBe("+new line");
    });
  });

  describe("fetchChangedFilesByPath", () => {
    it("fetches changed files by worktree path", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ files: [], baseBranch: "main" }),
      });

      await api.fetchChangedFilesByPath("/tmp/worktree");
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain("worktreePath=%2Ftmp%2Fworktree");
    });
  });

  describe("fetchFileDiffByPath", () => {
    it("fetches diff by worktree path", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ diff: "+line", filePath: "a.ts", baseBranch: "main" }),
      });

      await api.fetchFileDiffByPath("/tmp/worktree", "a.ts");
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain("worktreePath=%2Ftmp%2Fworktree");
      expect(url).toContain("path=a.ts");
    });
  });

  describe("verifyRepository", () => {
    it("verifies a repository with token", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, data: { fullName: "owner/repo" } }),
      });

      await api.verifyRepository("owner", "repo", { token: "ghp_test" });
      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:2201/api/setup/verify-repository",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ owner: "owner", name: "repo", token: "ghp_test" }),
        }),
      );
    });
  });

  describe("verifyWorkspace", () => {
    it("verifies a workspace path", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, data: { path: "/tmp/work", exists: true, writable: true } }),
      });

      await api.verifyWorkspace("/tmp/work");
      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:2201/api/setup/verify-workspace",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ path: "/tmp/work" }),
        }),
      );
    });
  });

  describe("browseDirectory", () => {
    it("browses a directory", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, data: { path: "/home", parent: "/", directories: ["user"] } }),
      });

      await api.browseDirectory("/home");
      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:2201/api/setup/browse-directory",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ path: "/home" }),
        }),
      );
    });
  });

  describe("discoverRepos", () => {
    it("discovers repos with default maxDepth", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, data: { repos: [], scannedPath: "/home" } }),
      });

      await api.discoverRepos("/home");
      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:2201/api/setup/discover-repos",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ path: "/home", maxDepth: 3 }),
        }),
      );
    });

    it("discovers repos with custom maxDepth", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, data: { repos: [], scannedPath: "/home" } }),
      });

      await api.discoverRepos("/home", 5);
      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:2201/api/setup/discover-repos",
        expect.objectContaining({
          body: JSON.stringify({ path: "/home", maxDepth: 5 }),
        }),
      );
    });
  });

  describe("fetchRepositories", () => {
    it("fetches all repositories", async () => {
      const repos = [{ id: "repo-1", owner: "test", name: "repo" }];
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: repos }),
      });

      const result = await api.fetchRepositories();
      expect(mockFetch).toHaveBeenCalledWith("http://localhost:2201/api/repositories", expect.any(Object));
      expect(result).toEqual(repos);
    });

    it("returns empty array when data is null", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: null }),
      });

      const result = await api.fetchRepositories();
      expect(result).toEqual([]);
    });
  });

  describe("fetchRepositorySettings", () => {
    it("fetches settings for a repository", async () => {
      const settings = { pollIntervalMs: 5000, triggerLabel: "agent" };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: settings }),
      });

      const result = await api.fetchRepositorySettings("repo-1");
      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:2201/api/repositories/repo-1/settings",
        expect.any(Object),
      );
      expect(result).toEqual(settings);
    });
  });

  describe("updateRepositorySettings", () => {
    it("sends PATCH with settings", async () => {
      const settings = { pollIntervalMs: 10000 };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: settings }),
      });

      await api.updateRepositorySettings("repo-1", settings);
      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:2201/api/repositories/repo-1/settings",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify(settings),
        }),
      );
    });
  });

  describe("fetchRepositoryBranches", () => {
    it("fetches branches for a repository", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: [{ name: "main", isDefault: true }], defaultBranch: "main" }),
      });

      const result = await api.fetchRepositoryBranches("repo-1");
      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:2201/api/repositories/repo-1/branches",
        expect.any(Object),
      );
      expect(result.branches).toHaveLength(1);
      expect(result.defaultBranch).toBe("main");
    });
  });

  describe("fetchNetworkInfo", () => {
    it("fetches network info", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: { hostname: "192.168.1.1" } }),
      });

      const result = await api.fetchNetworkInfo();
      expect(mockFetch).toHaveBeenCalledWith("http://localhost:2201/api/system/network-info", expect.any(Object));
      expect(result.data).toEqual({ hostname: "192.168.1.1" });
    });
  });

  describe("fetchResearchSession", () => {
    it("fetches a single research session", async () => {
      const session = { id: "session-1", status: "completed", suggestions: [] };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: session }),
      });

      const result = await api.fetchResearchSession("session-1");
      expect(mockFetch).toHaveBeenCalledWith("http://localhost:2201/api/research/session-1", expect.any(Object));
      expect(result.data).toEqual(session);
    });
  });

  describe("createJobFromIssue", () => {
    it("creates a job from an issue", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, jobId: "job-1", message: "Created" }),
      });

      const result = await api.createJobFromIssue("repo-1", 42);
      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:2201/api/repositories/repo-1/issues/42/job",
        expect.objectContaining({ method: "POST" }),
      );
      expect(result.success).toBe(true);
    });
  });

  describe("fetchIssueComments", () => {
    it("fetches comments for an issue", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: [{ id: 1, body: "A comment" }] }),
      });

      const result = await api.fetchIssueComments("repo-1", 42);
      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:2201/api/repositories/repo-1/issues/42/comments",
        expect.any(Object),
      );
      expect(result.data).toHaveLength(1);
    });
  });

  describe("createIssueComment", () => {
    it("creates a comment on an issue", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: { id: 1, body: "New comment" } }),
      });

      const result = await api.createIssueComment("repo-1", 42, "New comment");
      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:2201/api/repositories/repo-1/issues/42/comments",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ body: "New comment" }),
        }),
      );
      expect(result.data.body).toBe("New comment");
    });

    it("throws on non-ok response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ message: "Forbidden" }),
      });

      await expect(api.createIssueComment("repo-1", 42, "test")).rejects.toThrow("Forbidden");
    });
  });
});
