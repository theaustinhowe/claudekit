"use client";

import type { Job, JobLog, JobStatus } from "@devkit/gogo-shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  approvePlan,
  checkNeedsInfoResponse,
  createManualJob,
  createPr,
  fetchHealth,
  fetchHealthEvents,
  fetchJob,
  fetchJobEvents,
  fetchJobLogs,
  fetchJobs,
  fetchStaleJobs,
  type JobAction,
  performJobAction,
  resumeAgentWithMessage,
} from "@/lib/api";

// Query key factory for consistent keys
export const jobKeys = {
  all: ["jobs"] as const,
  lists: () => [...jobKeys.all, "list"] as const,
  list: (params?: { status?: JobStatus; repositoryId?: string; limit?: number; offset?: number }) =>
    [...jobKeys.lists(), params ?? {}] as const,
  stale: (thresholdMinutes?: number) => [...jobKeys.all, "stale", thresholdMinutes ?? 60] as const,
  details: () => [...jobKeys.all, "detail"] as const,
  detail: (id: string) => [...jobKeys.details(), id] as const,
  events: (id: string) => [...jobKeys.detail(id), "events"] as const,
  logs: (id: string) => [...jobKeys.detail(id), "logs"] as const,
};

// Fetch all jobs with optional filtering
export function useJobs(params?: { status?: JobStatus; repositoryId?: string; limit?: number; offset?: number }) {
  return useQuery({
    queryKey: jobKeys.list(params),
    queryFn: () => fetchJobs(params),
    refetchInterval: 5000, // Poll every 5 seconds to catch status changes
  });
}

// Fetch stale jobs (unchanged for too long in running/needs_info states)
export function useStaleJobs(thresholdMinutes = 60) {
  return useQuery({
    queryKey: jobKeys.stale(thresholdMinutes),
    queryFn: () => fetchStaleJobs(thresholdMinutes),
    refetchInterval: 30000, // Poll every 30 seconds (stale detection doesn't need to be fast)
  });
}

// Fetch a single job by ID
export function useJob(jobId: string | null) {
  return useQuery({
    queryKey: jobKeys.detail(jobId ?? ""),
    queryFn: async () => {
      if (!jobId) return null;
      const response = await fetchJob(jobId);
      return response.data ?? null;
    },
    enabled: !!jobId,
    refetchInterval: 5000, // Poll every 5 seconds as fallback for WebSocket
  });
}

// Fetch job events (audit trail)
export function useJobEvents(jobId: string | null, params?: { limit?: number; offset?: number; after?: string }) {
  return useQuery({
    queryKey: jobKeys.events(jobId ?? ""),
    queryFn: async () => {
      if (!jobId) return [];
      const response = await fetchJobEvents(jobId, params);
      return response.data ?? [];
    },
    enabled: !!jobId,
    refetchInterval: 5000, // Poll every 5 seconds for new events
  });
}

// Sort logs by timestamp, falling back to sequence for same-timestamp entries
function sortLogs(logs: JobLog[]): JobLog[] {
  return [...logs].sort((a, b) => {
    const timeA = new Date(a.createdAt).getTime();
    const timeB = new Date(b.createdAt).getTime();
    if (timeA !== timeB) return timeA - timeB;
    return a.sequence - b.sequence;
  });
}

// Fetch job logs (can also be driven by WebSocket)
export function useJobLogs(
  jobId: string | null,
  params?: {
    limit?: number;
    afterSequence?: number;
    stream?: "stdout" | "stderr" | "system";
  },
) {
  return useQuery({
    queryKey: jobKeys.logs(jobId ?? ""),
    queryFn: async () => {
      if (!jobId) return [];
      const response = await fetchJobLogs(jobId, params);
      // Sort logs by timestamp to ensure correct ordering across job restarts
      return sortLogs(response.data ?? []);
    },
    enabled: !!jobId,
    refetchInterval: 10000, // Poll every 10 seconds as fallback for WebSocket
  });
}

// Job action mutation (pause, resume, cancel, inject)
export function useJobAction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ jobId, action }: { jobId: string; action: JobAction }) => performJobAction(jobId, action),
    onSuccess: (response, variables) => {
      if (response.data) {
        // Update the specific job in cache
        queryClient.setQueryData(jobKeys.detail(variables.jobId), response.data);
        // Invalidate job lists to reflect status changes
        queryClient.invalidateQueries({ queryKey: jobKeys.lists() });
      }
    },
  });
}

// Create PR mutation
export function useCreatePr() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (jobId: string) => createPr(jobId),
    onSuccess: (_response, jobId) => {
      // Invalidate the job detail to get updated state
      queryClient.invalidateQueries({ queryKey: jobKeys.detail(jobId) });
      // Invalidate job lists to reflect status changes
      queryClient.invalidateQueries({ queryKey: jobKeys.lists() });
    },
  });
}

// Helper to update a job in the cache (used by WebSocket context)
export function updateJobInCache(queryClient: ReturnType<typeof useQueryClient>, job: Job) {
  // Update the detail cache
  queryClient.setQueryData(jobKeys.detail(job.id), job);

  // Update the job in list caches
  queryClient.setQueriesData<{
    data: Job[];
    pagination: { total: number; limit: number; offset: number };
  }>({ queryKey: jobKeys.lists() }, (old) => {
    if (!old) return old;
    return {
      ...old,
      data: old.data.map((j) => (j.id === job.id ? job : j)),
    };
  });

  // Invalidate events cache so new events are fetched
  // This ensures the Event History updates when job status changes
  queryClient.invalidateQueries({ queryKey: jobKeys.events(job.id) });
}

// Helper to add a log entry to the cache (used by WebSocket context)
export function appendLogToCache(queryClient: ReturnType<typeof useQueryClient>, jobId: string, log: JobLog) {
  queryClient.setQueryData<JobLog[]>(jobKeys.logs(jobId), (old) => {
    if (!old) return [log];
    // Avoid duplicates
    if (old.some((l) => l.id === log.id)) return old;
    // Merge and sort by timestamp to ensure correct ordering
    return sortLogs([...old, log]);
  });
}

// Helper to invalidate jobs list (used after job:created events)
export function invalidateJobsList(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: jobKeys.lists() });
}

// Health check query for polling status
export function useHealth() {
  return useQuery({
    queryKey: ["health"],
    queryFn: fetchHealth,
    refetchInterval: 10000, // Refresh every 10 seconds
    staleTime: 5000, // Consider stale after 5 seconds
  });
}

// Health events for activity timeline
export function useHealthEvents(limit = 50) {
  return useQuery({
    queryKey: ["health", "events", limit],
    queryFn: () => fetchHealthEvents(limit),
    refetchInterval: 15000,
    staleTime: 10000,
  });
}

// Check for GitHub response on a needs_info job
export function useCheckNeedsInfoResponse() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (jobId: string) => checkNeedsInfoResponse(jobId),
    onSuccess: (_response, jobId) => {
      // Invalidate the job detail to get updated state
      queryClient.invalidateQueries({ queryKey: jobKeys.detail(jobId) });
      // Invalidate events to show any new response events
      queryClient.invalidateQueries({ queryKey: jobKeys.events(jobId) });
      // Invalidate job lists in case status changed
      queryClient.invalidateQueries({ queryKey: jobKeys.lists() });
    },
  });
}

// Create a manual job (no GitHub issue)
export function useCreateManualJob() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: { repositoryId: string; title: string; description?: string }) => createManualJob(params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: jobKeys.lists() });
    },
  });
}

// Approve or reject a plan for a job in awaiting_plan_approval state
export function useApprovePlan() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ jobId, approved, message }: { jobId: string; approved: boolean; message?: string }) =>
      approvePlan(jobId, approved, message),
    onSuccess: (_response, variables) => {
      queryClient.invalidateQueries({
        queryKey: jobKeys.detail(variables.jobId),
      });
      queryClient.invalidateQueries({
        queryKey: jobKeys.events(variables.jobId),
      });
      queryClient.invalidateQueries({ queryKey: jobKeys.lists() });
    },
  });
}

// Resume agent with optional message (for PAUSED or NEEDS_INFO jobs)
// Performs atomic state transition to RUNNING and starts the agent
export function useResumeAgent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ jobId, message, agentType }: { jobId: string; message?: string; agentType?: string }) =>
      resumeAgentWithMessage(jobId, message, agentType),
    onSuccess: (_response, variables) => {
      // Invalidate the job detail to get updated state
      queryClient.invalidateQueries({
        queryKey: jobKeys.detail(variables.jobId),
      });
      // Invalidate events to show the resume event
      queryClient.invalidateQueries({
        queryKey: jobKeys.events(variables.jobId),
      });
      // Invalidate job lists to reflect status change
      queryClient.invalidateQueries({ queryKey: jobKeys.lists() });
    },
  });
}
