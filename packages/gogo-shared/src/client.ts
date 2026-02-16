import type { JobActionType } from "./constants";
import type {
  ApiResponse,
  InjectMode,
  Job,
  JobEvent,
  JobLog,
  JobStatus,
  NetworkInfo,
  PaginatedResponse,
  ResearchCategory,
  ResearchSeverity,
} from "./types";

// ---------------------------------------------------------------------------
// Response types (shared between client and server)
// ---------------------------------------------------------------------------

export interface HealthResponse {
  status: string;
  uptime: number;
  uptimeFormatted: string;
  activeJobs: {
    running: number;
    queued: number;
    needs_info: number;
    ready_to_pr: number;
    paused: number;
    total: number;
  };
  polling: {
    active: boolean;
    lastPoll: string | null;
    pollIntervalMs: number;
    throttled?: boolean;
    throttleReason?: string | null;
    throttleResetAt?: string | null;
  };
  agents: {
    active: number;
    registered: number;
    types: string[];
  };
  database: {
    connected: boolean;
  };
  github?: {
    rateLimitTracked: boolean;
    rateLimitWarning: boolean;
    rateLimitCritical: boolean;
    lowestRateLimit: {
      remaining: number;
      limit: number;
      resetsAt: string;
    } | null;
  };
  shutdown?: {
    inProgress: boolean;
  };
  websocket?: {
    clientCount: number;
  };
}

export interface HealthEvent {
  type: string;
  timestamp: string;
  message: string;
  metadata?: Record<string, unknown>;
}

export interface AgentInfo {
  type: string;
  displayName: string;
  capabilities: {
    canResume: boolean;
    canInject: boolean;
    supportsStreaming: boolean;
  };
}

export interface AgentStatusResponse {
  type: string;
  available: boolean;
  configured: boolean;
  featureFlagEnabled?: boolean;
  apiKeySet?: boolean;
  registered: boolean;
  message: string;
}

export interface KnownAgentInfo {
  type: string;
  displayName: string;
  description: string;
  capabilities: {
    canResume: boolean;
    canInject: boolean;
    supportsStreaming: boolean;
  };
  envVars: Array<{
    name: string;
    description: string;
    required: boolean;
  }>;
  docsUrl: string | null;
  installInstructions: string;
  registered: boolean;
  status: {
    available: boolean;
    configured: boolean;
    message: string;
    details?: Record<string, unknown>;
  };
}

export interface RepositoryInfo {
  id: string;
  owner: string;
  name: string;
  displayName: string | null;
  githubToken: string;
  baseBranch: string;
  triggerLabel: string;
  workdirPath: string;
  isActive: boolean;
  autoCreateJobs: boolean;
  removeLabelAfterCreate: boolean;
  pollIntervalMs: number | null;
  testCommand: string | null;
  agentProvider: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RepositorySettings {
  pollIntervalMs: number | null;
  testCommand: string | null;
  agentProvider: string | null;
  triggerLabel: string;
  branchPattern: string | null;
  baseBranch: string;
  autoCleanup: boolean | null;
  autoStartJobs: boolean | null;
  autoCreatePr: boolean | null;
}

export interface BranchInfo {
  name: string;
  isDefault: boolean;
  protected: boolean;
}

export interface WorktreeInfo {
  path: string;
  branch: string;
  commit: string;
  job: {
    id: string;
    issueNumber: number;
    issueTitle: string;
    status: string;
    prNumber: number | null;
    prUrl: string | null;
    updatedAt: string | null;
  } | null;
  repository: {
    id: string;
    owner: string;
    name: string;
    displayName: string | null;
  } | null;
}

export interface ChangedFile {
  path: string;
  status: "added" | "modified" | "deleted" | "renamed" | "copied" | "unknown";
}

export interface CreatePrResponse {
  success: boolean;
  prUrl?: string;
  prNumber?: number;
  error?: string;
  message?: string;
  retriedToRunning?: boolean;
}

export interface SetupStatusResponse {
  needsSetup: boolean;
  repositoryCount: number;
}

export interface VerifyGitHubResponse {
  success: boolean;
  error?: string;
  data?: {
    username: string;
    name: string | null;
    avatarUrl: string;
    scopes: string[];
    rateLimit: {
      limit: number;
      remaining: number;
      reset: string;
    };
  };
}

export interface VerifyRepositoryResponse {
  success: boolean;
  error?: string;
  data?: {
    fullName: string;
    visibility: string;
    defaultBranch: string;
    openIssuesCount: number;
    canPush: boolean;
    description: string | null;
  };
}

export interface VerifyWorkspaceResponse {
  success: boolean;
  error?: string;
  data?: {
    path: string;
    exists: boolean;
    writable: boolean;
    canCreate: boolean;
  };
}

export interface DiscoveredRepo {
  path: string;
  owner: string | null;
  name: string | null;
  remoteUrl: string | null;
  currentBranch: string;
}

export interface GitHubLabel {
  id: number;
  name: string;
  color: string;
  description: string | null;
}

export interface GitHubUser {
  login: string;
  avatar_url: string;
  html_url: string;
}

export interface GitHubIssue {
  number: number;
  title: string;
  body: string | null;
  html_url: string;
  state: string;
  labels: GitHubLabel[];
  created_at: string;
  user: GitHubUser | null;
  hasJob: boolean;
  jobId: string | null;
}

export interface GitHubCommentUser {
  login: string;
  type: string;
  avatar_url: string;
}

export interface GitHubComment {
  id: number;
  body: string;
  html_url: string;
  user: GitHubCommentUser | null;
  created_at: string;
}

export interface ResearchSessionInfo {
  id: string;
  repositoryId: string;
  status: "running" | "completed" | "failed" | "cancelled";
  focusAreas: string[];
  claudeSessionId: string | null;
  processPid: number | null;
  output: string | null;
  suggestionCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface ResearchSuggestionInfo {
  id: string;
  sessionId: string;
  category: string;
  severity: string;
  title: string;
  description: string;
  filePaths: string[] | null;
  convertedTo: string | null;
  convertedId: string | null;
  createdAt: string;
}

export interface ResearchSessionDetail extends ResearchSessionInfo {
  suggestions: ResearchSuggestionInfo[];
}

// ---------------------------------------------------------------------------
// Client configuration
// ---------------------------------------------------------------------------

export interface GoGoClientConfig {
  baseUrl: string;
  getAuthHeaders?: () => Record<string, string>;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function buildQuery(params: Record<string, string | number | boolean | undefined | null>): string {
  const sp = new URLSearchParams();
  for (const [key, val] of Object.entries(params)) {
    if (val !== undefined && val !== null) sp.set(key, String(val));
  }
  const qs = sp.toString();
  return qs ? `?${qs}` : "";
}

// ---------------------------------------------------------------------------
// Client factory
// ---------------------------------------------------------------------------

export function createGoGoClient(config: GoGoClientConfig) {
  const { baseUrl } = config;

  function headers(json = false): Record<string, string> {
    const h: Record<string, string> = { ...config.getAuthHeaders?.() };
    if (json) h["Content-Type"] = "application/json";
    return h;
  }

  async function get<T>(path: string): Promise<T> {
    const res = await fetch(`${baseUrl}${path}`, { headers: headers() });
    return res.json();
  }

  async function post<T>(path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: headers(body !== undefined),
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    return res.json();
  }

  async function put<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${baseUrl}${path}`, {
      method: "PUT",
      headers: headers(true),
      body: JSON.stringify(body),
    });
    return res.json();
  }

  async function patch<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${baseUrl}${path}`, {
      method: "PATCH",
      headers: headers(true),
      body: JSON.stringify(body),
    });
    return res.json();
  }

  async function del<T>(path: string): Promise<T> {
    const res = await fetch(`${baseUrl}${path}`, {
      method: "DELETE",
      headers: headers(),
    });
    return res.json();
  }

  return {
    // =====================================================================
    // Health
    // =====================================================================

    health: {
      get: () => get<HealthResponse>("/api/health"),
      events: (limit = 50) => get<HealthEvent[]>(`/api/health/events?limit=${limit}`),
    },

    // =====================================================================
    // System
    // =====================================================================

    system: {
      networkInfo: () => get<ApiResponse<NetworkInfo>>("/api/system/network-info"),
    },

    // =====================================================================
    // Agents
    // =====================================================================

    agents: {
      list: () => get<{ data: AgentInfo[] }>("/api/agents").then((r) => r.data ?? []),
      listAll: () => get<{ data: KnownAgentInfo[] }>("/api/agents/all").then((r) => r.data ?? []),
      status: (type: string) => get<{ data: AgentStatusResponse }>(`/api/agents/${type}/status`).then((r) => r.data),
    },

    // =====================================================================
    // Jobs
    // =====================================================================

    jobs: {
      list: (params?: { status?: JobStatus; repositoryId?: string; limit?: number; offset?: number }) =>
        get<PaginatedResponse<Job>>(`/api/jobs${buildQuery(params ?? {})}`),

      get: (id: string) => get<ApiResponse<Job>>(`/api/jobs/${id}`),

      stale: (thresholdMinutes = 60) =>
        get<{ data: Job[]; thresholdMinutes: number; count: number }>(
          `/api/jobs/stale?thresholdMinutes=${thresholdMinutes}`,
        ),

      createManual: (params: { repositoryId: string; title: string; description?: string }) =>
        post<ApiResponse<Job>>("/api/jobs/manual", params),

      action: (
        jobId: string,
        action: { type: JobActionType; payload?: { reason?: string; message?: string; mode?: InjectMode } },
      ) => post<ApiResponse<Job>>(`/api/jobs/${jobId}/actions`, action),

      events: (jobId: string, params?: { limit?: number; offset?: number; after?: string }) =>
        get<ApiResponse<JobEvent[]>>(`/api/jobs/${jobId}/events${buildQuery(params ?? {})}`),

      logs: (
        jobId: string,
        params?: { limit?: number; afterSequence?: number; stream?: "stdout" | "stderr" | "system" },
      ) => get<ApiResponse<JobLog[]>>(`/api/jobs/${jobId}/logs${buildQuery(params ?? {})}`),

      start: (jobId: string) => post<{ success: boolean; message?: string }>(`/api/jobs/${jobId}/start`),

      startAgent: (jobId: string, agentType?: string) =>
        post<{ success: boolean; message?: string }>(`/api/jobs/${jobId}/start-agent`, { agentType }),

      resumeAgent: (jobId: string, message?: string, agentType?: string) =>
        post<{ success: boolean; message?: string; error?: string }>(`/api/jobs/${jobId}/resume-agent`, {
          message,
          agentType,
        }),

      createPr: (jobId: string) => post<CreatePrResponse>(`/api/jobs/${jobId}/create-pr`),

      approvePlan: (jobId: string, approved: boolean, message?: string) =>
        post<{ data?: Job; error?: string }>(`/api/jobs/${jobId}/approve-plan`, { approved, message }),

      checkResponse: (jobId: string) =>
        post<{ success: boolean; responseFound: boolean; message: string; error?: string }>(
          `/api/jobs/${jobId}/check-response`,
        ),
    },

    // =====================================================================
    // Settings
    // =====================================================================

    settings: {
      get: () => get<{ data: Record<string, unknown> }>("/api/settings").then((r) => r.data),
      update: (settings: Record<string, unknown>) =>
        put<{ data: Record<string, unknown> }>("/api/settings", settings).then((r) => r.data),
    },

    // =====================================================================
    // Repositories
    // =====================================================================

    repositories: {
      list: () => get<{ data: RepositoryInfo[] }>("/api/repositories").then((r) => r.data ?? []),

      get: (id: string) => get<{ data: RepositoryInfo }>(`/api/repositories/${id}`).then((r) => r.data),

      jobs: (id: string, params?: { status?: JobStatus; limit?: number; offset?: number }) =>
        get<PaginatedResponse<Job>>(`/api/repositories/${id}/jobs${buildQuery(params ?? {})}`),

      settings: (id: string) =>
        get<{ data: RepositorySettings }>(`/api/repositories/${id}/settings`).then((r) => r.data),

      updateSettings: (
        id: string,
        settings: Partial<
          Pick<
            RepositorySettings,
            | "pollIntervalMs"
            | "testCommand"
            | "agentProvider"
            | "triggerLabel"
            | "branchPattern"
            | "baseBranch"
            | "autoCleanup"
            | "autoStartJobs"
            | "autoCreatePr"
          >
        >,
      ) => patch<{ data: RepositorySettings }>(`/api/repositories/${id}/settings`, settings).then((r) => r.data),

      branches: (id: string) =>
        get<{ data: BranchInfo[]; defaultBranch: string }>(`/api/repositories/${id}/branches`).then((r) => ({
          branches: r.data ?? [],
          defaultBranch: r.defaultBranch,
        })),

      // Issues
      issues: (
        id: string,
        params?: { state?: "open" | "closed" | "all"; labels?: string; per_page?: number; page?: number },
      ) =>
        get<{ data: GitHubIssue[]; pagination: { page: number; per_page: number } }>(
          `/api/repositories/${id}/issues${buildQuery(params ?? {})}`,
        ),

      createIssue: (id: string, params: { title: string; body?: string; labels?: string[] }) =>
        post<{ data: GitHubIssue }>(`/api/repositories/${id}/issues`, params),

      createJobFromIssue: (id: string, issueNumber: number) =>
        post<{ success: boolean; jobId: string; message: string }>(`/api/repositories/${id}/issues/${issueNumber}/job`),

      issueComments: (id: string, issueNumber: number) =>
        get<{ data: GitHubComment[] }>(`/api/repositories/${id}/issues/${issueNumber}/comments`),

      createIssueComment: (id: string, issueNumber: number, body: string) =>
        post<{ data: GitHubComment }>(`/api/repositories/${id}/issues/${issueNumber}/comments`, { body }),

      syncIssues: (id: string) =>
        post<{ success: boolean; synced: number; comments: number }>(`/api/repositories/${id}/issues/sync`),
    },

    // =====================================================================
    // Worktrees
    // =====================================================================

    worktrees: {
      list: () => get<{ data: WorktreeInfo[] }>("/api/worktrees").then((r) => r.data),

      prStatus: (jobId: string) =>
        get<{ merged: boolean; prNumber: number | null; prUrl: string | null }>(`/api/worktrees/${jobId}/pr-status`),

      changes: (jobId: string) =>
        get<{ files: ChangedFile[]; baseBranch: string; error?: string }>(`/api/worktrees/${jobId}/changes`),

      diff: (jobId: string, filePath: string) =>
        get<{ diff: string; filePath: string; baseBranch: string; error?: string }>(
          `/api/worktrees/${jobId}/diff?path=${encodeURIComponent(filePath)}`,
        ),

      changesByPath: (worktreePath: string) =>
        get<{ files: ChangedFile[]; baseBranch: string; error?: string }>(
          `/api/worktrees/by-path/changes?worktreePath=${encodeURIComponent(worktreePath)}`,
        ),

      diffByPath: (worktreePath: string, filePath: string) =>
        get<{ diff: string; filePath: string; baseBranch: string; error?: string }>(
          `/api/worktrees/by-path/diff?worktreePath=${encodeURIComponent(worktreePath)}&path=${encodeURIComponent(filePath)}`,
        ),

      cleanup: (jobId: string) =>
        post<{ success: boolean; error?: string; cleaned?: { worktreePath: string; jobsDir: string } }>(
          `/api/worktrees/${jobId}/cleanup`,
        ),

      bulkCleanup: (params?: { dryRun?: boolean; jobIds?: string[]; includeStatuses?: string[] }) =>
        post<{ data: unknown }>("/api/worktrees/cleanup", params),
    },

    // =====================================================================
    // Setup
    // =====================================================================

    setup: {
      status: () => get<SetupStatusResponse>("/api/setup/status"),

      verifyGitHub: (token: string) => post<VerifyGitHubResponse>("/api/setup/verify-github", { token }),

      verifyRepository: (owner: string, name: string, options: { token?: string; reuseTokenFromRepoId?: string }) =>
        post<VerifyRepositoryResponse>("/api/setup/verify-repository", { owner, name, ...options }),

      verifyWorkspace: (path: string) => post<VerifyWorkspaceResponse>("/api/setup/verify-workspace", { path }),

      browseDirectory: (path: string) =>
        post<{
          success: boolean;
          error?: string;
          data?: { path: string; parent: string; directories: string[] };
        }>("/api/setup/browse-directory", { path }),

      discoverRepos: (path: string, maxDepth = 3) =>
        post<{
          success: boolean;
          error?: string;
          data?: { repos: DiscoveredRepo[]; scannedPath: string };
        }>("/api/setup/discover-repos", { path, maxDepth }),

      complete: (data: {
        githubToken?: string;
        reuseTokenFromRepoId?: string;
        owner: string;
        name: string;
        triggerLabel: string;
        baseBranch: string;
        workdirPath: string;
      }) =>
        post<{
          success: boolean;
          error?: string;
          data?: { id: string; owner: string; name: string; isNew: boolean };
        }>("/api/setup/complete", data),
    },

    // =====================================================================
    // Research
    // =====================================================================

    research: {
      sessions: () => get<{ data: ResearchSessionInfo[] }>("/api/research/sessions"),

      session: (id: string) => get<{ data: ResearchSessionDetail }>(`/api/research/${id}`),

      start: (params: { repositoryId: string; focusAreas: (ResearchCategory | string)[] }) =>
        post<{ data?: ResearchSessionInfo; error?: string }>("/api/research/sessions", params),

      cancel: (sessionId: string) => del<{ success?: boolean; error?: string }>(`/api/research/${sessionId}`),

      suggestions: (params?: { sessionId?: string; category?: ResearchCategory; severity?: ResearchSeverity }) =>
        get<{ data: ResearchSuggestionInfo[] }>(`/api/research/suggestions${buildQuery(params ?? {})}`),

      convertSuggestion: (sessionId: string, suggestionId: string, convertTo: "github_issue" | "manual_job") =>
        post<{ data?: { convertedTo: string; convertedId: string | null }; error?: string }>(
          `/api/research/${sessionId}/suggestions/${suggestionId}/convert`,
          { convertTo },
        ),
    },
  };
}

export type GoGoClient = ReturnType<typeof createGoGoClient>;
