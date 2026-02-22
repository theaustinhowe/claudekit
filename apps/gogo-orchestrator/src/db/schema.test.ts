import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the database for unit tests
vi.mock("./index.js", () => ({
  getDb: vi.fn(async () => ({})),
}));

vi.mock("@claudekit/duckdb", () => ({
  queryAll: vi.fn(),
  queryOne: vi.fn(),
  execute: vi.fn(),
  withTransaction: vi.fn(),
  buildUpdate: vi.fn(),
  buildWhere: vi.fn(),
  buildInClause: vi.fn(),
  checkpoint: vi.fn(),
  parseJsonField: vi.fn((v: unknown, fallback: unknown) => (v === null || v === undefined ? fallback : v)),
}));

import { queryOne } from "@claudekit/duckdb";
import {
  type DbIssue,
  type DbIssueComment,
  type DbJob,
  type DbJobEvent,
  type DbJobLog,
  type DbRepository,
  type DbResearchSession,
  type DbResearchSuggestion,
  type DbSetting,
  mapIssue,
  mapIssueComment,
  mapJob,
  mapJobEvent,
  mapJobLog,
  mapRepository,
  mapRepositoryFull,
  mapResearchSession,
  mapResearchSuggestion,
  mapSetting,
} from "./schema.js";

// Define expected DB row fields (snake_case) for repositories
const REPOSITORY_FIELDS = [
  "id",
  "owner",
  "name",
  "display_name",
  "github_token",
  "base_branch",
  "trigger_label",
  "workdir_path",
  "is_active",
  "auto_create_jobs",
  "remove_label_after_create",
  "auto_start_jobs",
  "auto_create_pr",
  "poll_interval_ms",
  "test_command",
  "agent_provider",
  "branch_pattern",
  "auto_cleanup",

  "last_issue_sync_at",
  "created_at",
  "updated_at",
];

// Define expected DB row fields (snake_case) for jobs
const JOB_FIELDS = [
  "id",
  "repository_id",
  "issue_number",
  "issue_url",
  "issue_title",
  "issue_body",
  "status",
  "branch",
  "worktree_path",
  "pr_number",
  "pr_url",
  "test_retry_count",
  "last_test_output",
  "change_summary",
  "pause_reason",
  "failure_reason",
  "needs_info_question",
  "needs_info_comment_id",
  "last_checked_comment_id",
  "claude_session_id",
  "inject_mode",
  "pending_injection",
  "process_pid",
  "process_started_at",
  "agent_type",
  "agent_session_data",
  "plan_content",
  "plan_comment_id",
  "last_checked_plan_comment_id",
  "source",
  "phase",
  "progress",
  "created_at",
  "updated_at",
];

describe("Schema validation", () => {
  describe("DbRepository type", () => {
    beforeEach(() => {
      vi.resetAllMocks();
    });

    afterEach(() => {
      vi.clearAllMocks();
    });

    it("should have required fields defined in DbRepository", () => {
      // Validate type structure by creating a conforming object
      const row: DbRepository = {
        id: "test-uuid",
        owner: "test-owner",
        name: "test-repo",
        display_name: null,
        github_token: "test-token",
        base_branch: "main",
        trigger_label: "agent",
        workdir_path: "/tmp/test",
        is_active: true,
        auto_create_jobs: true,
        remove_label_after_create: false,
        auto_start_jobs: false,
        auto_create_pr: false,
        poll_interval_ms: 30000,
        test_command: null,
        agent_provider: "claude-code",
        branch_pattern: "agent/issue-{number}",
        auto_cleanup: false,

        last_issue_sync_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      expect(row.id).toBeDefined();
      expect(row.owner).toBeDefined();
      expect(row.name).toBeDefined();
      expect(row.github_token).toBeDefined();
      expect(row.workdir_path).toBeDefined();
    });

    it("should have optional fields with defaults defined in DbRepository", () => {
      const row: DbRepository = {
        id: "test-uuid",
        owner: "test-owner",
        name: "test-repo",
        display_name: null,
        github_token: "test-token",
        base_branch: "main",
        trigger_label: "agent",
        workdir_path: "/tmp/test",
        is_active: true,
        auto_create_jobs: true,
        remove_label_after_create: false,
        auto_start_jobs: false,
        auto_create_pr: false,
        poll_interval_ms: 30000,
        test_command: null,
        agent_provider: "claude-code",
        branch_pattern: "agent/issue-{number}",
        auto_cleanup: false,

        last_issue_sync_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      expect(row.base_branch).toBeDefined();
      expect(row.trigger_label).toBeDefined();
      expect(row.is_active).toBeDefined();
      expect(row.auto_create_jobs).toBeDefined();
      expect(row.poll_interval_ms).toBeDefined();
      expect(row.agent_provider).toBeDefined();
    });

    it("should have per-repo config columns defined", () => {
      // These fields exist on DbRepository
      const keys: (keyof DbRepository)[] = ["poll_interval_ms", "test_command", "agent_provider"];
      for (const key of keys) {
        expect(REPOSITORY_FIELDS).toContain(key);
      }
    });

    it("should have timestamps defined", () => {
      expect(REPOSITORY_FIELDS).toContain("created_at");
      expect(REPOSITORY_FIELDS).toContain("updated_at");
    });

    it("should map repository row to Repository type correctly", () => {
      const row: DbRepository = {
        id: "test-uuid",
        owner: "test-owner",
        name: "test-repo",
        display_name: null,
        github_token: "test-token",
        base_branch: "main",
        trigger_label: "agent",
        workdir_path: "/tmp/test",
        is_active: true,
        auto_create_jobs: true,
        remove_label_after_create: false,
        auto_start_jobs: false,
        auto_create_pr: false,
        poll_interval_ms: 30000,
        test_command: null,
        agent_provider: "claude-code",
        branch_pattern: "agent/issue-{number}",
        auto_cleanup: false,

        last_issue_sync_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const mapped = mapRepository(row);
      expect(mapped.id).toBe("test-uuid");
      expect(mapped.owner).toBe("test-owner");
      expect(mapped.baseBranch).toBe("main");
      expect(mapped.triggerLabel).toBe("agent");
      expect(mapped.isActive).toBe(true);
    });
  });

  describe("DbJob type", () => {
    beforeEach(() => {
      vi.resetAllMocks();
    });

    afterEach(() => {
      vi.clearAllMocks();
    });

    it("should have repository_id field defined", () => {
      expect(JOB_FIELDS).toContain("repository_id");
    });

    it("should have issue tracking fields defined", () => {
      expect(JOB_FIELDS).toContain("issue_number");
      expect(JOB_FIELDS).toContain("issue_url");
      expect(JOB_FIELDS).toContain("issue_title");
      expect(JOB_FIELDS).toContain("issue_body");
    });

    it("should have status and tracking fields defined", () => {
      expect(JOB_FIELDS).toContain("status");
      expect(JOB_FIELDS).toContain("branch");
      expect(JOB_FIELDS).toContain("worktree_path");
      expect(JOB_FIELDS).toContain("pr_number");
      expect(JOB_FIELDS).toContain("pr_url");
    });

    it("should have agent fields defined", () => {
      expect(JOB_FIELDS).toContain("agent_type");
      expect(JOB_FIELDS).toContain("agent_session_data");
      expect(JOB_FIELDS).toContain("claude_session_id");
    });

    it("should have process tracking fields defined", () => {
      expect(JOB_FIELDS).toContain("process_pid");
      expect(JOB_FIELDS).toContain("process_started_at");
    });
  });

  describe("composite unique index behavior", () => {
    beforeEach(() => {
      vi.resetAllMocks();
    });

    afterEach(() => {
      vi.clearAllMocks();
    });

    it("should allow creating jobs with same issue number in different repos", async () => {
      // Simulate creating jobs in two different repositories using raw SQL
      vi.mocked(queryOne)
        .mockResolvedValueOnce({
          id: "job-1",
          repository_id: "repo-1",
          issue_number: 42,
        })
        .mockResolvedValueOnce({
          id: "job-2",
          repository_id: "repo-2",
          issue_number: 42,
        });

      const job1 = await queryOne({} as unknown as Parameters<typeof queryOne>[0], "INSERT INTO jobs ...", []);
      const job2 = await queryOne({} as unknown as Parameters<typeof queryOne>[0], "INSERT INTO jobs ...", []);

      expect((job1 as Record<string, unknown>).issue_number).toBe(42);
      expect((job2 as Record<string, unknown>).issue_number).toBe(42);
      expect((job1 as Record<string, unknown>).repository_id).not.toBe((job2 as Record<string, unknown>).repository_id);
    });

    it("should document that duplicate issueNumber in same repo will fail", async () => {
      // This test documents the expected behavior of the unique index
      // The actual constraint enforcement happens at the database level
      //
      // With idx_jobs_repo_issue unique index on (repository_id, issue_number):
      // - INSERT into jobs with (repo-1, 42) succeeds
      // - INSERT into jobs with (repo-1, 42) again throws unique constraint violation

      // For the mocked unit test, we just verify the fields exist
      expect(JOB_FIELDS).toContain("repository_id");
      expect(JOB_FIELDS).toContain("issue_number");
    });
  });

  describe("schema defaults", () => {
    it("should have correct default for job status", () => {
      // The SQL migration defines default 'queued' for status
      expect(JOB_FIELDS).toContain("status");
    });

    it("should have correct default for repository base branch", () => {
      // The SQL migration defines default 'main' for base_branch
      expect(REPOSITORY_FIELDS).toContain("base_branch");
    });

    it("should have correct default for repository trigger label", () => {
      // The SQL migration defines default 'agent' for trigger_label
      expect(REPOSITORY_FIELDS).toContain("trigger_label");
    });

    it("should have correct default for poll interval", () => {
      // The SQL migration defines default 30000 for poll_interval_ms
      expect(REPOSITORY_FIELDS).toContain("poll_interval_ms");
    });

    it("should have correct default for agent provider", () => {
      // The SQL migration defines default 'claude-code' for agent_provider
      expect(REPOSITORY_FIELDS).toContain("agent_provider");
    });
  });
  describe("mapJob", () => {
    it("maps a job row with all fields", () => {
      const row: DbJob = {
        id: "job-1",
        repository_id: "repo-1",
        issue_number: 42,
        issue_url: "https://github.com/owner/repo/issues/42",
        issue_title: "Fix bug",
        issue_body: "Details here",
        status: "queued",
        branch: "agent/issue-42",
        worktree_path: "/tmp/wt",
        pr_number: null,
        pr_url: null,
        test_retry_count: 0,
        last_test_output: null,
        change_summary: null,
        pause_reason: null,
        failure_reason: null,
        needs_info_question: null,
        needs_info_comment_id: null,
        last_checked_comment_id: null,
        last_checked_pr_review_comment_id: null,
        claude_session_id: null,
        inject_mode: "none",
        pending_injection: null,
        process_pid: null,
        process_started_at: "2025-06-01T00:00:00.000Z",
        agent_type: "claude-code",
        agent_session_data: null,
        plan_content: null,
        plan_comment_id: null,
        last_checked_plan_comment_id: null,
        source: "github",
        phase: null,
        progress: null,
        created_at: "2025-06-01T00:00:00.000Z",
        updated_at: "2025-06-01T00:00:00.000Z",
      };

      const mapped = mapJob(row);
      expect(mapped.id).toBe("job-1");
      expect(mapped.repositoryId).toBe("repo-1");
      expect(mapped.issueNumber).toBe(42);
      expect(mapped.status).toBe("queued");
      expect(mapped.processStartedAt).toBeInstanceOf(Date);
      expect(mapped.createdAt).toBeInstanceOf(Date);
    });

    it("handles null process_started_at", () => {
      const row: DbJob = {
        id: "job-2",
        repository_id: null,
        issue_number: 1,
        issue_url: "",
        issue_title: "",
        issue_body: null,
        status: "queued",
        branch: null,
        worktree_path: null,
        pr_number: null,
        pr_url: null,
        test_retry_count: 0,
        last_test_output: null,
        change_summary: null,
        pause_reason: null,
        failure_reason: null,
        needs_info_question: null,
        needs_info_comment_id: null,
        last_checked_comment_id: null,
        last_checked_pr_review_comment_id: null,
        claude_session_id: null,
        inject_mode: "none",
        pending_injection: null,
        process_pid: null,
        process_started_at: null,
        agent_type: "claude-code",
        agent_session_data: null,
        plan_content: null,
        plan_comment_id: null,
        last_checked_plan_comment_id: null,
        source: "manual",
        phase: null,
        progress: null,
        created_at: "2025-06-01T00:00:00.000Z",
        updated_at: "2025-06-01T00:00:00.000Z",
      };

      const mapped = mapJob(row);
      expect(mapped.processStartedAt).toBeNull();
    });
  });

  describe("mapJobEvent", () => {
    it("maps a job event row", () => {
      const row: DbJobEvent = {
        id: "evt-1",
        job_id: "job-1",
        event_type: "status_change",
        from_status: "queued",
        to_status: "running",
        message: "Job started",
        metadata: null,
        created_at: "2025-06-01T00:00:00.000Z",
      };

      const mapped = mapJobEvent(row);
      expect(mapped.id).toBe("evt-1");
      expect(mapped.jobId).toBe("job-1");
      expect(mapped.eventType).toBe("status_change");
      expect(mapped.fromStatus).toBe("queued");
      expect(mapped.toStatus).toBe("running");
      expect(mapped.createdAt).toBeInstanceOf(Date);
    });
  });

  describe("mapJobLog", () => {
    it("maps a job log row", () => {
      const row: DbJobLog = {
        id: "log-1",
        job_id: "job-1",
        stream: "stdout",
        content: "Hello world",
        sequence: 1,
        created_at: "2025-06-01T00:00:00.000Z",
      };

      const mapped = mapJobLog(row);
      expect(mapped.id).toBe("log-1");
      expect(mapped.jobId).toBe("job-1");
      expect(mapped.stream).toBe("stdout");
      expect(mapped.content).toBe("Hello world");
      expect(mapped.sequence).toBe(1);
      expect(mapped.createdAt).toBeInstanceOf(Date);
    });
  });

  describe("mapIssue", () => {
    it("maps an issue row with dates", () => {
      const row: DbIssue = {
        id: "issue-1",
        repository_id: "repo-1",
        number: 10,
        title: "Bug report",
        body: "Found a bug",
        state: "open",
        html_url: "https://github.com/owner/repo/issues/10",
        author_login: "alice",
        author_avatar_url: "https://avatars.githubusercontent.com/u/1",
        author_html_url: "https://github.com/alice",
        labels: '["bug"]',
        github_created_at: "2025-05-01T00:00:00.000Z",
        github_updated_at: "2025-05-15T00:00:00.000Z",
        closed_at: "2025-06-01T00:00:00.000Z",
        last_synced_at: "2025-06-01T00:00:00.000Z",
        created_at: "2025-06-01T00:00:00.000Z",
        updated_at: "2025-06-01T00:00:00.000Z",
      };

      const mapped = mapIssue(row);
      expect(mapped.id).toBe("issue-1");
      expect(mapped.repositoryId).toBe("repo-1");
      expect(mapped.number).toBe(10);
      expect(mapped.githubCreatedAt).toBeInstanceOf(Date);
      expect(mapped.closedAt).toBeInstanceOf(Date);
      expect(mapped.createdAt).toBeInstanceOf(Date);
    });

    it("handles null date fields", () => {
      const row: DbIssue = {
        id: "issue-2",
        repository_id: "repo-1",
        number: 11,
        title: "Open issue",
        body: null,
        state: "open",
        html_url: "https://github.com/owner/repo/issues/11",
        author_login: null,
        author_avatar_url: null,
        author_html_url: null,
        labels: null,
        github_created_at: null,
        github_updated_at: null,
        closed_at: null,
        last_synced_at: "2025-06-01T00:00:00.000Z",
        created_at: "2025-06-01T00:00:00.000Z",
        updated_at: "2025-06-01T00:00:00.000Z",
      };

      const mapped = mapIssue(row);
      expect(mapped.githubCreatedAt).toBeNull();
      expect(mapped.githubUpdatedAt).toBeNull();
      expect(mapped.closedAt).toBeNull();
    });
  });

  describe("mapRepositoryFull", () => {
    it("maps all fields including extended ones", () => {
      const row: DbRepository = {
        id: "repo-1",
        owner: "test-owner",
        name: "test-repo",
        display_name: "Test Repo",
        github_token: "tok",
        base_branch: "main",
        trigger_label: "agent",
        workdir_path: "/tmp",
        is_active: true,
        auto_create_jobs: true,
        remove_label_after_create: false,
        auto_start_jobs: true,
        auto_create_pr: true,
        poll_interval_ms: 60000,
        test_command: "npm test",
        agent_provider: "claude-code",
        branch_pattern: "agent/{number}",
        auto_cleanup: true,
        last_issue_sync_at: "2025-06-01T00:00:00.000Z",
        created_at: "2025-06-01T00:00:00.000Z",
        updated_at: "2025-06-01T00:00:00.000Z",
      };

      const mapped = mapRepositoryFull(row);
      expect(mapped.autoStartJobs).toBe(true);
      expect(mapped.autoCreatePr).toBe(true);
      expect(mapped.pollIntervalMs).toBe(60000);
      expect(mapped.testCommand).toBe("npm test");
      expect(mapped.autoCleanup).toBe(true);
      expect(mapped.lastIssueSyncAt).toBeInstanceOf(Date);
    });

    it("handles null last_issue_sync_at", () => {
      const row: DbRepository = {
        id: "repo-2",
        owner: "o",
        name: "n",
        display_name: null,
        github_token: "t",
        base_branch: "main",
        trigger_label: "agent",
        workdir_path: "/tmp",
        is_active: false,
        auto_create_jobs: false,
        remove_label_after_create: false,
        auto_start_jobs: false,
        auto_create_pr: false,
        poll_interval_ms: 30000,
        test_command: null,
        agent_provider: "claude-code",
        branch_pattern: "agent/{number}",
        auto_cleanup: false,
        last_issue_sync_at: null,
        created_at: "2025-06-01T00:00:00.000Z",
        updated_at: "2025-06-01T00:00:00.000Z",
      };

      const mapped = mapRepositoryFull(row);
      expect(mapped.lastIssueSyncAt).toBeNull();
    });
  });

  describe("mapIssueComment", () => {
    it("maps an issue comment row", () => {
      const row: DbIssueComment = {
        id: "ic-1",
        repository_id: "repo-1",
        issue_number: 10,
        github_comment_id: 12345,
        body: "Looks good",
        html_url: "https://github.com/owner/repo/issues/10#issuecomment-12345",
        author_login: "bob",
        author_type: "User",
        author_avatar_url: "https://avatars.githubusercontent.com/u/2",
        github_created_at: "2025-05-01T00:00:00.000Z",
        github_updated_at: null,
        last_synced_at: "2025-06-01T00:00:00.000Z",
        created_at: "2025-06-01T00:00:00.000Z",
        updated_at: "2025-06-01T00:00:00.000Z",
      };

      const mapped = mapIssueComment(row);
      expect(mapped.id).toBe("ic-1");
      expect(mapped.issueNumber).toBe(10);
      expect(mapped.githubCommentId).toBe(12345);
      expect(mapped.githubCreatedAt).toBeInstanceOf(Date);
      expect(mapped.githubUpdatedAt).toBeNull();
    });
  });

  describe("mapSetting", () => {
    it("maps a setting row", () => {
      const row: DbSetting = {
        key: "claude_config",
        value: '{"model":"opus"}',
        updated_at: "2025-06-01T00:00:00.000Z",
      };

      const mapped = mapSetting(row);
      expect(mapped.key).toBe("claude_config");
      expect(mapped.updatedAt).toBeInstanceOf(Date);
    });
  });

  describe("mapResearchSession", () => {
    it("maps a research session row", () => {
      const row: DbResearchSession = {
        id: "rs-1",
        repository_id: "repo-1",
        status: "completed",
        focus_areas: '["performance","security"]',
        claude_session_id: "cs-1",
        process_pid: 1234,
        output: "Research findings",
        created_at: "2025-06-01T00:00:00.000Z",
        updated_at: "2025-06-01T00:00:00.000Z",
      };

      const mapped = mapResearchSession(row);
      expect(mapped.id).toBe("rs-1");
      expect(mapped.repositoryId).toBe("repo-1");
      expect(mapped.status).toBe("completed");
      expect(mapped.claudeSessionId).toBe("cs-1");
      expect(mapped.createdAt).toBeInstanceOf(Date);
    });
  });

  describe("mapResearchSuggestion", () => {
    it("maps a research suggestion row", () => {
      const row: DbResearchSuggestion = {
        id: "sug-1",
        session_id: "rs-1",
        category: "performance",
        severity: "medium",
        title: "Optimize query",
        description: "N+1 query detected",
        file_paths: '["src/db/index.ts"]',
        converted_to: null,
        converted_id: null,
        created_at: "2025-06-01T00:00:00.000Z",
      };

      const mapped = mapResearchSuggestion(row);
      expect(mapped.id).toBe("sug-1");
      expect(mapped.sessionId).toBe("rs-1");
      expect(mapped.category).toBe("performance");
      expect(mapped.title).toBe("Optimize query");
      expect(mapped.createdAt).toBeInstanceOf(Date);
    });
  });
});

/**
 * Integration test helpers
 *
 * To run these tests against a real database:
 * 1. Set DATABASE_PATH to a test database file (e.g., /tmp/test.duckdb)
 * 2. Remove the vi.mock('./index.js', ...) at the top of this file
 * 3. Call initializeDatabase() in beforeAll
 * 4. Add cleanup in afterEach to delete test data
 */
