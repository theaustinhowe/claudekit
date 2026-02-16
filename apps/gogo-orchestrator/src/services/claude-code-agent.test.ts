import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:child_process", () => ({
  spawn: vi.fn(),
  execSync: vi.fn(),
}));

vi.mock("node:crypto", () => ({
  randomUUID: vi.fn().mockReturnValue("test-uuid-1234"),
}));

vi.mock("@devkit/duckdb", () => ({
  execute: vi.fn(),
  queryOne: vi.fn(),
}));

vi.mock("../db/index.js", () => ({
  getDb: vi.fn().mockResolvedValue({}),
}));

vi.mock("../utils/job-logging.js", () => ({
  emitLog: vi.fn(),
  updateJobStatus: vi.fn(),
}));

vi.mock("../utils/logger.js", () => ({
  createServiceLogger: vi.fn().mockReturnValue({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock("../ws/handler.js", () => ({
  broadcast: vi.fn(),
}));

vi.mock("./github/index.js", () => ({
  AGENT_COMMENT_MARKER: "<!-- gogo-agent -->",
  createIssueCommentForRepo: vi.fn(),
  getRepoConfigById: vi.fn(),
}));

vi.mock("./process-manager.js", () => ({
  registerProcess: vi.fn(),
  unregisterProcess: vi.fn(),
}));

vi.mock("./settings-helper.js", () => ({
  getClaudeSettings: vi.fn(),
}));

import { execSync } from "node:child_process";
import { execute, queryOne } from "@devkit/duckdb";
import type { DbJob } from "../db/schema.js";
import {
  CLAUDE_ERRORS,
  getActiveRunCount,
  getClaudeAvailabilityError,
  isClaudeCliAvailable,
  isRunning,
  startClaudeRun,
  stopClaudeRun,
} from "./claude-code-agent";
import { getRepoConfigById } from "./github/index.js";
import { getClaudeSettings } from "./settings-helper.js";

describe("CLAUDE_ERRORS", () => {
  it("has CLI_NOT_FOUND message", () => {
    expect(CLAUDE_ERRORS.CLI_NOT_FOUND).toContain("Claude CLI not found");
  });

  it("has DISABLED message", () => {
    expect(CLAUDE_ERRORS.DISABLED).toContain("disabled");
  });
});

describe("isClaudeCliAvailable", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns true when which claude succeeds", async () => {
    vi.mocked(execSync).mockReturnValue(Buffer.from("/usr/local/bin/claude"));
    const result = await isClaudeCliAvailable();
    expect(result).toBe(true);
  });

  it("returns false when which claude throws", async () => {
    vi.mocked(execSync).mockImplementation(() => {
      throw new Error("not found");
    });
    const result = await isClaudeCliAvailable();
    expect(result).toBe(false);
  });
});

describe("getClaudeAvailabilityError", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns DISABLED when settings.enabled is false", async () => {
    vi.mocked(getClaudeSettings).mockResolvedValue({ enabled: false } as never);
    const result = await getClaudeAvailabilityError();
    expect(result).toBe(CLAUDE_ERRORS.DISABLED);
  });

  it("returns CLI_NOT_FOUND when CLI is not available", async () => {
    vi.mocked(getClaudeSettings).mockResolvedValue({ enabled: true } as never);
    vi.mocked(execSync).mockImplementation(() => {
      throw new Error("not found");
    });
    const result = await getClaudeAvailabilityError();
    expect(result).toBe(CLAUDE_ERRORS.CLI_NOT_FOUND);
  });

  it("returns null when everything is available", async () => {
    vi.mocked(getClaudeSettings).mockResolvedValue({ enabled: true } as never);
    vi.mocked(execSync).mockReturnValue(Buffer.from("/usr/local/bin/claude"));
    const result = await getClaudeAvailabilityError();
    expect(result).toBeNull();
  });
});

describe("isRunning / getActiveRunCount", () => {
  it("isRunning returns false for unknown job", () => {
    expect(isRunning("nonexistent-job")).toBe(false);
  });

  it("getActiveRunCount returns 0 initially", () => {
    expect(getActiveRunCount()).toBe(0);
  });
});

describe("startClaudeRun", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns error when job not found", async () => {
    vi.mocked(queryOne).mockResolvedValue(undefined);
    const result = await startClaudeRun("nonexistent-id");
    expect(result.success).toBe(false);
    expect(result.error).toContain("not found");
  });

  it("returns error when job status is not running or planning", async () => {
    vi.mocked(queryOne).mockResolvedValue({
      id: "job-1",
      status: "queued",
      worktree_path: "/tmp/work",
      repository_id: "repo-1",
    } as DbJob);
    const result = await startClaudeRun("job-1");
    expect(result.success).toBe(false);
    expect(result.error).toContain("running");
  });

  it("returns error when job has no worktree path", async () => {
    vi.mocked(queryOne).mockResolvedValue({
      id: "job-1",
      status: "running",
      worktree_path: null,
      repository_id: "repo-1",
    } as DbJob);
    const result = await startClaudeRun("job-1");
    expect(result.success).toBe(false);
    expect(result.error).toContain("worktree");
  });

  it("returns error when job has no repository ID", async () => {
    vi.mocked(queryOne).mockResolvedValue({
      id: "job-1",
      status: "running",
      worktree_path: "/tmp/work",
      repository_id: null,
    } as DbJob);
    const result = await startClaudeRun("job-1");
    expect(result.success).toBe(false);
    expect(result.error).toContain("repository ID");
  });

  it("returns error when repo config not found", async () => {
    vi.mocked(queryOne).mockResolvedValue({
      id: "job-1",
      status: "running",
      worktree_path: "/tmp/work",
      repository_id: "repo-1",
    } as DbJob);
    vi.mocked(getRepoConfigById).mockResolvedValue(null);
    const result = await startClaudeRun("job-1");
    expect(result.success).toBe(false);
    expect(result.error).toContain("configuration not found");
  });

  it("returns error when Claude is disabled", async () => {
    vi.mocked(queryOne).mockResolvedValue({
      id: "job-1",
      status: "running",
      worktree_path: "/tmp/work",
      repository_id: "repo-1",
    } as DbJob);
    vi.mocked(getRepoConfigById).mockResolvedValue({ owner: "test", name: "repo" } as never);
    vi.mocked(getClaudeSettings).mockResolvedValue({ enabled: false } as never);
    const result = await startClaudeRun("job-1");
    expect(result.success).toBe(false);
    expect(result.error).toContain("disabled");
  });

  it("returns error when max parallel jobs reached", async () => {
    vi.mocked(queryOne).mockResolvedValue({
      id: "job-1",
      status: "running",
      worktree_path: "/tmp/work",
      repository_id: "repo-1",
    } as DbJob);
    vi.mocked(getRepoConfigById).mockResolvedValue({ owner: "test", name: "repo" } as never);
    vi.mocked(getClaudeSettings).mockResolvedValue({
      enabled: true,
      max_parallel_jobs: 0,
      max_runtime_ms: 600000,
      test_command: "npm test",
    } as never);
    const result = await startClaudeRun("job-1");
    expect(result.success).toBe(false);
    expect(result.error).toContain("Max parallel jobs");
  });
});

describe("stopClaudeRun", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns false when no active process", async () => {
    const result = await stopClaudeRun("nonexistent-job");
    expect(result).toBe(false);
  });
});
