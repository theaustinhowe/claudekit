import type {
  ApiResponse,
  Job,
  JobActionType,
  JobEvent,
  JobLog,
  JobStatus,
  NetworkInfo,
  PaginatedResponse,
} from "@devkit/gogo-shared";

export type { JobActionType };

// Dynamically determine API URL based on current browser location
// This allows the app to work when accessed from other devices on the network
function getApiUrl(): string {
  // Use explicit env var if set
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL;
  }

  // In SSR context, fall back to localhost
  if (typeof window === "undefined") {
    return "http://localhost:2101";
  }

  // Use the same hostname the browser is connected to
  const hostname = window.location.hostname;
  const protocol = window.location.protocol;
  const orchestratorPort = process.env.NEXT_PUBLIC_ORCHESTRATOR_PORT || "2101";

  return `${protocol}//${hostname}:${orchestratorPort}`;
}

// Cached API URL to avoid recalculating on every request
let cachedApiUrl: string | null = null;

function getApiUrlCached(): string {
  if (cachedApiUrl === null) {
    cachedApiUrl = getApiUrl();
  }
  return cachedApiUrl;
}

// =============================================================================
// Authentication
// =============================================================================

function getAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("gogo_api_token");
}

function getAuthHeaders(): Record<string, string> {
  const token = getAuthToken();
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

// =============================================================================
// Types
// =============================================================================

export type InjectMode = "immediate" | "queued";

export interface JobAction {
  type: JobActionType;
  payload?: {
    reason?: string;
    message?: string;
    mode?: InjectMode;
  };
}

// Create a manual job (no GitHub issue required)
export async function createManualJob(params: {
  repositoryId: string;
  title: string;
  description?: string;
}): Promise<ApiResponse<Job>> {
  const res = await fetch(`${getApiUrlCached()}/api/jobs/manual`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify(params),
  });
  return res.json();
}

// Fetch jobs with optional filtering and pagination
export async function fetchJobs(params?: {
  status?: JobStatus;
  repositoryId?: string;
  limit?: number;
  offset?: number;
}): Promise<PaginatedResponse<Job>> {
  const searchParams = new URLSearchParams();
  if (params?.status) searchParams.set("status", params.status);
  if (params?.repositoryId) searchParams.set("repositoryId", params.repositoryId);
  if (params?.limit) searchParams.set("limit", String(params.limit));
  if (params?.offset) searchParams.set("offset", String(params.offset));

  const query = searchParams.toString();
  const url = `${getApiUrlCached()}/api/jobs${query ? `?${query}` : ""}`;
  const res = await fetch(url, { headers: getAuthHeaders() });
  return res.json();
}

// Fetch a single job by ID
export async function fetchJob(id: string): Promise<ApiResponse<Job>> {
  const res = await fetch(`${getApiUrlCached()}/api/jobs/${id}`, {
    headers: getAuthHeaders(),
  });
  return res.json();
}

// Stale jobs response type
export interface StaleJobsResponse {
  data: Job[];
  thresholdMinutes: number;
  count: number;
}

// Fetch stale jobs (jobs unchanged for too long in running/needs_info states)
export async function fetchStaleJobs(thresholdMinutes = 60): Promise<StaleJobsResponse> {
  const res = await fetch(`${getApiUrlCached()}/api/jobs/stale?thresholdMinutes=${thresholdMinutes}`, {
    headers: getAuthHeaders(),
  });
  return res.json();
}

// Fetch job events (audit trail)
export async function fetchJobEvents(
  jobId: string,
  params?: {
    limit?: number;
    offset?: number;
    after?: string;
  },
): Promise<ApiResponse<JobEvent[]>> {
  const searchParams = new URLSearchParams();
  if (params?.limit) searchParams.set("limit", String(params.limit));
  if (params?.offset) searchParams.set("offset", String(params.offset));
  if (params?.after) searchParams.set("after", params.after);

  const query = searchParams.toString();
  const url = `${getApiUrlCached()}/api/jobs/${jobId}/events${query ? `?${query}` : ""}`;
  const res = await fetch(url, { headers: getAuthHeaders() });
  return res.json();
}

// Fetch job logs
export async function fetchJobLogs(
  jobId: string,
  params?: {
    limit?: number;
    afterSequence?: number;
    stream?: "stdout" | "stderr" | "system";
  },
): Promise<ApiResponse<JobLog[]>> {
  const searchParams = new URLSearchParams();
  if (params?.limit) searchParams.set("limit", String(params.limit));
  if (params?.afterSequence !== undefined) searchParams.set("afterSequence", String(params.afterSequence));
  if (params?.stream) searchParams.set("stream", params.stream);

  const query = searchParams.toString();
  const url = `${getApiUrlCached()}/api/jobs/${jobId}/logs${query ? `?${query}` : ""}`;
  const res = await fetch(url, { headers: getAuthHeaders() });
  return res.json();
}

// Perform a job action (pause, resume, cancel, inject)
export async function performJobAction(jobId: string, action: JobAction): Promise<ApiResponse<Job>> {
  const res = await fetch(`${getApiUrlCached()}/api/jobs/${jobId}/actions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify(action),
  });
  return res.json();
}

// Resume agent with optional message (for PAUSED or NEEDS_INFO jobs)
// This performs an atomic state transition to RUNNING and starts the agent
export async function resumeAgentWithMessage(
  jobId: string,
  message?: string,
  agentType?: string,
): Promise<{ success: boolean; message?: string; error?: string }> {
  const res = await fetch(`${getApiUrlCached()}/api/jobs/${jobId}/resume-agent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify({ message, agentType }),
  });
  return res.json();
}

// Settings response type
export interface SettingsResponse {
  data: Record<string, unknown>;
}

// Fetch settings
export async function fetchSettings(): Promise<SettingsResponse> {
  const res = await fetch(`${getApiUrlCached()}/api/settings`, {
    headers: getAuthHeaders(),
  });
  return res.json();
}

// =============================================================================
// Agent Management
// =============================================================================

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

// Fetch all registered agents
export async function fetchAgents(): Promise<AgentInfo[]> {
  const res = await fetch(`${getApiUrlCached()}/api/agents`, {
    headers: getAuthHeaders(),
  });
  const json = await res.json();
  return json.data ?? [];
}

// Fetch all known agents (including unconfigured)
export async function fetchAllAgents(): Promise<KnownAgentInfo[]> {
  const res = await fetch(`${getApiUrlCached()}/api/agents/all`, {
    headers: getAuthHeaders(),
  });
  const json = await res.json();
  return json.data ?? [];
}

// Fetch agent status by type
export async function fetchAgentStatus(type: string): Promise<AgentStatusResponse> {
  const res = await fetch(`${getApiUrlCached()}/api/agents/${type}/status`, {
    headers: getAuthHeaders(),
  });
  const json = await res.json();
  return json.data;
}

// Update settings
export async function updateSettings(settings: Record<string, unknown>): Promise<SettingsResponse> {
  const res = await fetch(`${getApiUrlCached()}/api/settings`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify(settings),
  });
  return res.json();
}

// Create PR response type
export interface CreatePrResponse {
  success: boolean;
  prUrl?: string;
  prNumber?: number;
  error?: string;
  message?: string;
  retriedToRunning?: boolean;
}

// Health check response type
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

// Health event from the activity timeline
export interface HealthEvent {
  type: string;
  timestamp: string;
  message: string;
  metadata?: Record<string, unknown>;
}

// Fetch health events (activity timeline)
export async function fetchHealthEvents(limit = 50): Promise<HealthEvent[]> {
  const res = await fetch(`${getApiUrlCached()}/api/health/events?limit=${limit}`, { headers: getAuthHeaders() });
  return res.json();
}

// Trigger PR creation for a job in ready_to_pr state
export async function createPr(jobId: string): Promise<CreatePrResponse> {
  const res = await fetch(`${getApiUrlCached()}/api/jobs/${jobId}/create-pr`, {
    method: "POST",
    headers: getAuthHeaders(),
  });
  return res.json();
}

// Fetch health status
export async function fetchHealth(): Promise<HealthResponse> {
  const res = await fetch(`${getApiUrlCached()}/api/health`, {
    headers: getAuthHeaders(),
  });
  return res.json();
}

// Approve or reject a plan for a job
export interface ApprovePlanResult {
  data?: Job;
  error?: string;
}

export async function approvePlan(jobId: string, approved: boolean, message?: string): Promise<ApprovePlanResult> {
  const res = await fetch(`${getApiUrlCached()}/api/jobs/${jobId}/approve-plan`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify({ approved, message }),
  });
  return res.json();
}

// Check for GitHub response response type
export interface CheckResponseResult {
  success: boolean;
  responseFound: boolean;
  message: string;
  error?: string;
}

// Trigger manual check for GitHub response on a needs_info job
export async function checkNeedsInfoResponse(jobId: string): Promise<CheckResponseResult> {
  const res = await fetch(`${getApiUrlCached()}/api/jobs/${jobId}/check-response`, {
    method: "POST",
    headers: getAuthHeaders(),
  });
  return res.json();
}

// =============================================================================
// Worktree Management
// =============================================================================

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

// Fetch all worktrees with job status
export async function fetchWorktrees(): Promise<{ data: WorktreeInfo[] }> {
  const res = await fetch(`${getApiUrlCached()}/api/worktrees`, {
    headers: getAuthHeaders(),
  });
  return res.json();
}

// PR merge status response
export interface PrMergeStatusResponse {
  merged: boolean;
  prNumber: number | null;
  prUrl: string | null;
}

// Fetch PR merge status for a job's worktree
export async function fetchPrMergeStatus(jobId: string): Promise<PrMergeStatusResponse> {
  const res = await fetch(`${getApiUrlCached()}/api/worktrees/${jobId}/pr-status`, { headers: getAuthHeaders() });
  return res.json();
}

// Single worktree cleanup response
export interface SingleWorktreeCleanupResponse {
  success: boolean;
  error?: string;
  cleaned?: {
    worktreePath: string;
    jobsDir: string;
  };
}

// Cleanup a single worktree (removes worktree + jobs/<issue> dir)
export async function cleanupWorktree(jobId: string): Promise<SingleWorktreeCleanupResponse> {
  const res = await fetch(`${getApiUrlCached()}/api/worktrees/${jobId}/cleanup`, {
    method: "POST",
    headers: getAuthHeaders(),
  });
  return res.json();
}

// Changed file info
export interface ChangedFile {
  path: string;
  status: "added" | "modified" | "deleted" | "renamed" | "copied" | "unknown";
}

// Fetch changed files in a worktree
export interface ChangedFilesResponse {
  files: ChangedFile[];
  baseBranch: string;
  error?: string;
}

export async function fetchChangedFiles(jobId: string): Promise<ChangedFilesResponse> {
  const res = await fetch(`${getApiUrlCached()}/api/worktrees/${jobId}/changes`, { headers: getAuthHeaders() });
  return res.json();
}

// Fetch diff for a specific file
export interface FileDiffResponse {
  diff: string;
  filePath: string;
  baseBranch: string;
  error?: string;
}

export async function fetchFileDiff(jobId: string, filePath: string): Promise<FileDiffResponse> {
  const res = await fetch(`${getApiUrlCached()}/api/worktrees/${jobId}/diff?path=${encodeURIComponent(filePath)}`, {
    headers: getAuthHeaders(),
  });
  return res.json();
}

// Fetch changed files by worktree path (for orphaned worktrees)
export async function fetchChangedFilesByPath(worktreePath: string): Promise<ChangedFilesResponse> {
  const res = await fetch(
    `${getApiUrlCached()}/api/worktrees/by-path/changes?worktreePath=${encodeURIComponent(worktreePath)}`,
    { headers: getAuthHeaders() },
  );
  return res.json();
}

// Fetch diff by worktree path (for orphaned worktrees)
export async function fetchFileDiffByPath(worktreePath: string, filePath: string): Promise<FileDiffResponse> {
  const res = await fetch(
    `${getApiUrlCached()}/api/worktrees/by-path/diff?worktreePath=${encodeURIComponent(worktreePath)}&path=${encodeURIComponent(filePath)}`,
    { headers: getAuthHeaders() },
  );
  return res.json();
}

// =============================================================================
// Setup Wizard
// =============================================================================

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

export interface CompleteSetupResponse {
  success: boolean;
  error?: string;
  data?: {
    id: string;
    owner: string;
    name: string;
    isNew: boolean;
  };
}

export interface DiscoveredRepo {
  path: string;
  owner: string | null;
  name: string | null;
  remoteUrl: string | null;
  currentBranch: string;
}

export interface DiscoverReposResponse {
  success: boolean;
  error?: string;
  data?: {
    repos: DiscoveredRepo[];
    scannedPath: string;
  };
}

// Fetch setup status
export async function fetchSetupStatus(): Promise<SetupStatusResponse> {
  const res = await fetch(`${getApiUrlCached()}/api/setup/status`, {
    headers: getAuthHeaders(),
  });
  return res.json();
}

// Verify GitHub token
export async function verifyGitHub(token: string): Promise<VerifyGitHubResponse> {
  const res = await fetch(`${getApiUrlCached()}/api/setup/verify-github`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify({ token }),
  });
  return res.json();
}

// Verify repository access
export async function verifyRepository(
  owner: string,
  name: string,
  options: { token?: string; reuseTokenFromRepoId?: string },
): Promise<VerifyRepositoryResponse> {
  const res = await fetch(`${getApiUrlCached()}/api/setup/verify-repository`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify({ owner, name, ...options }),
  });
  return res.json();
}

// Verify workspace directory
export async function verifyWorkspace(path: string): Promise<VerifyWorkspaceResponse> {
  const res = await fetch(`${getApiUrlCached()}/api/setup/verify-workspace`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify({ path }),
  });
  return res.json();
}

// Complete setup
export async function completeSetup(data: {
  githubToken?: string;
  reuseTokenFromRepoId?: string;
  owner: string;
  name: string;
  triggerLabel: string;
  baseBranch: string;
  workdirPath: string;
}): Promise<CompleteSetupResponse> {
  const res = await fetch(`${getApiUrlCached()}/api/setup/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify(data),
  });
  return res.json();
}

// Browse directory - list subdirectories for directory picker
export interface BrowseDirectoryResponse {
  success: boolean;
  error?: string;
  data?: {
    path: string;
    parent: string;
    directories: string[];
  };
}

export async function browseDirectory(browsePath: string): Promise<BrowseDirectoryResponse> {
  const res = await fetch(`${getApiUrlCached()}/api/setup/browse-directory`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify({ path: browsePath }),
  });
  return res.json();
}

// Discover git repositories in a directory
export async function discoverRepos(scanPath: string, maxDepth = 3): Promise<DiscoverReposResponse> {
  const res = await fetch(`${getApiUrlCached()}/api/setup/discover-repos`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify({ path: scanPath, maxDepth }),
  });
  return res.json();
}

// =============================================================================
// Repository Management (Multi-Repo Support)
// =============================================================================

export interface RepositoryInfo {
  id: string;
  owner: string;
  name: string;
  displayName: string | null;
  githubToken: string; // Will be masked (***) from server
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

// Fetch all repositories
export async function fetchRepositories(): Promise<RepositoryInfo[]> {
  const res = await fetch(`${getApiUrlCached()}/api/repositories`, {
    headers: getAuthHeaders(),
  });
  const json = await res.json();
  return json.data ?? [];
}

// Fetch repository settings
export async function fetchRepositorySettings(repositoryId: string): Promise<RepositorySettings> {
  const res = await fetch(`${getApiUrlCached()}/api/repositories/${repositoryId}/settings`, {
    headers: getAuthHeaders(),
  });
  const json = await res.json();
  return json.data;
}

// Update repository settings
export async function updateRepositorySettings(
  repositoryId: string,
  settings: {
    pollIntervalMs?: number;
    testCommand?: string | null;
    agentProvider?: string;
    triggerLabel?: string;
    branchPattern?: string;
    baseBranch?: string;
    autoCleanup?: boolean;
    autoStartJobs?: boolean;
    autoCreatePr?: boolean;
  },
): Promise<RepositorySettings> {
  const res = await fetch(`${getApiUrlCached()}/api/repositories/${repositoryId}/settings`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify(settings),
  });
  const json = await res.json();
  return json.data;
}

// Fetch branches for a repository
export interface BranchInfo {
  name: string;
  isDefault: boolean;
  protected: boolean;
}

export async function fetchRepositoryBranches(
  repositoryId: string,
): Promise<{ branches: BranchInfo[]; defaultBranch: string }> {
  const res = await fetch(`${getApiUrlCached()}/api/repositories/${repositoryId}/branches`, {
    headers: getAuthHeaders(),
  });
  const json = await res.json();
  return { branches: json.data ?? [], defaultBranch: json.defaultBranch };
}

// =============================================================================
// System / Network Info
// =============================================================================

// Fetch network info for device connection
export async function fetchNetworkInfo(): Promise<ApiResponse<NetworkInfo>> {
  const res = await fetch(`${getApiUrlCached()}/api/system/network-info`, {
    headers: getAuthHeaders(),
  });
  return res.json();
}

// =============================================================================
// Research
// =============================================================================

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

// Fetch all research sessions
export async function fetchResearchSessions(): Promise<{
  data: ResearchSessionInfo[];
}> {
  const res = await fetch(`${getApiUrlCached()}/api/research/sessions`, {
    headers: getAuthHeaders(),
  });
  return res.json();
}

// Fetch single research session with suggestions
export async function fetchResearchSession(id: string): Promise<{ data: ResearchSessionDetail }> {
  const res = await fetch(`${getApiUrlCached()}/api/research/${id}`, {
    headers: getAuthHeaders(),
  });
  return res.json();
}

// Start a new research session
export async function startResearch(params: {
  repositoryId: string;
  focusAreas: string[];
}): Promise<{ data?: ResearchSessionInfo; error?: string }> {
  const res = await fetch(`${getApiUrlCached()}/api/research/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify(params),
  });
  return res.json();
}

// Cancel a running research session
export async function cancelResearch(sessionId: string): Promise<{ success?: boolean; error?: string }> {
  const res = await fetch(`${getApiUrlCached()}/api/research/${sessionId}`, {
    method: "DELETE",
    headers: getAuthHeaders(),
  });
  return res.json();
}

// Convert a suggestion to a job or issue
export async function convertSuggestion(
  sessionId: string,
  suggestionId: string,
  convertTo: "github_issue" | "manual_job",
): Promise<{
  data?: { convertedTo: string; convertedId: string | null };
  error?: string;
}> {
  const res = await fetch(`${getApiUrlCached()}/api/research/${sessionId}/suggestions/${suggestionId}/convert`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify({ convertTo }),
  });
  return res.json();
}

// =============================================================================
// Issues Management
// =============================================================================

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

export interface IssuesResponse {
  data: GitHubIssue[];
  pagination: {
    page: number;
    per_page: number;
  };
}

export interface CreateIssueParams {
  title: string;
  body?: string;
  labels?: string[];
}

export interface CreateJobFromIssueResponse {
  success: boolean;
  jobId: string;
  message: string;
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

export interface IssueCommentsResponse {
  data: GitHubComment[];
}

// Fetch issues for a repository
export async function fetchIssues(
  repositoryId: string,
  params?: {
    state?: "open" | "closed" | "all";
    labels?: string;
    per_page?: number;
    page?: number;
  },
): Promise<IssuesResponse> {
  const searchParams = new URLSearchParams();
  if (params?.state) searchParams.set("state", params.state);
  if (params?.labels) searchParams.set("labels", params.labels);
  if (params?.per_page) searchParams.set("per_page", String(params.per_page));
  if (params?.page) searchParams.set("page", String(params.page));

  const query = searchParams.toString();
  const url = `${getApiUrlCached()}/api/repositories/${repositoryId}/issues${query ? `?${query}` : ""}`;
  const res = await fetch(url, { headers: getAuthHeaders() });
  return res.json();
}

// Create a new issue on GitHub
export async function createIssue(repositoryId: string, params: CreateIssueParams): Promise<{ data: GitHubIssue }> {
  const res = await fetch(`${getApiUrlCached()}/api/repositories/${repositoryId}/issues`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify(params),
  });
  return res.json();
}

// Create a job from an existing issue
export async function createJobFromIssue(
  repositoryId: string,
  issueNumber: number,
): Promise<CreateJobFromIssueResponse> {
  const res = await fetch(`${getApiUrlCached()}/api/repositories/${repositoryId}/issues/${issueNumber}/job`, {
    method: "POST",
    headers: getAuthHeaders(),
  });
  return res.json();
}

// Fetch comments for an issue
export async function fetchIssueComments(repositoryId: string, issueNumber: number): Promise<IssueCommentsResponse> {
  const res = await fetch(`${getApiUrlCached()}/api/repositories/${repositoryId}/issues/${issueNumber}/comments`, {
    headers: getAuthHeaders(),
  });
  return res.json();
}

// Create a comment on an issue
export async function createIssueComment(
  repositoryId: string,
  issueNumber: number,
  body: string,
): Promise<{ data: GitHubComment }> {
  const res = await fetch(`${getApiUrlCached()}/api/repositories/${repositoryId}/issues/${issueNumber}/comments`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify({ body }),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.message || "Failed to create comment");
  }
  return res.json();
}
