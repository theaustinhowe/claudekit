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
});
