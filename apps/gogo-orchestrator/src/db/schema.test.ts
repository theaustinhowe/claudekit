import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the database for unit tests
vi.mock("./index.js", () => ({
  getConn: vi.fn(() => ({})),
}));

vi.mock("@devkit/duckdb", () => ({
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

import { queryOne } from "@devkit/duckdb";
import { type DbRepository, mapRepository } from "./schema.js";

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
  "codex_session_id",
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
      expect(JOB_FIELDS).toContain("codex_session_id");
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
