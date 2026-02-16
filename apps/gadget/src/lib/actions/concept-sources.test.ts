import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  getDb: vi.fn(() => ({})),
  queryAll: vi.fn(),
  queryOne: vi.fn(),
  execute: vi.fn(),
  withTransaction: vi.fn((_db, fn) => fn()),
}));
vi.mock("@/lib/utils", () => ({
  generateId: vi.fn(() => "test-id"),
  parseGitHubUrl: vi.fn((url: string) => {
    const match = url.match(/github\.com\/([^/]+)\/([^/]+)/);
    if (!match) return null;
    return { owner: match[1], repo: match[2] };
  }),
}));
vi.mock("@/lib/constants", () => ({
  CURATED_SOURCE_ID: "__curated__",
  CLAUDE_CONFIG_SOURCE_ID: "__claude_config__",
  LIBRARY_REPO_ID: "__library__",
}));
vi.mock("@/lib/actions/settings", () => ({
  getEncryptionKey: vi.fn(),
}));
vi.mock("@/lib/services/encryption", () => ({
  decrypt: vi.fn(),
}));
vi.mock("@/lib/services/github-concept-scanner", () => ({
  scanGitHubRepoForConcepts: vi.fn(),
}));
vi.mock("@/lib/services/mcp-list-scanner", () => ({
  fetchMcpServerList: vi.fn(),
  getCuratedMcpServers: vi.fn(),
  mcpListEntriesToConcepts: vi.fn(),
}));

import { execute, queryAll, queryOne } from "@/lib/db";
import { createGitHubSource, createMcpListSource, deleteConceptSource, getConceptSources } from "./concept-sources";

const mockQueryAll = vi.mocked(queryAll);
const _mockQueryOne = vi.mocked(queryOne);
const mockExecute = vi.mocked(execute);

beforeEach(() => {
  vi.resetAllMocks();
});

describe("getConceptSources", () => {
  it("returns sources with parsed stats", async () => {
    mockQueryAll.mockResolvedValue([
      { id: "1", name: "Source 1", concept_count: "5", is_builtin: 1 },
      { id: "2", name: "Source 2", concept_count: "0", is_builtin: 0 },
    ]);

    const result = await getConceptSources();
    expect(result).toHaveLength(2);
    expect(result[0].concept_count).toBe(5);
    expect(result[0].is_builtin).toBe(true);
    expect(result[1].is_builtin).toBe(false);
  });
});

describe("createGitHubSource", () => {
  it("creates a GitHub source from URL", async () => {
    mockExecute.mockResolvedValue(undefined);

    const result = await createGitHubSource({
      github_url: "https://github.com/owner/repo",
    });

    expect(result.success).toBe(true);
    expect(result.sourceId).toBe("test-id");
    expect(result.message).toContain("owner/repo");
    expect(mockExecute).toHaveBeenCalledWith(
      {},
      expect.stringContaining("INSERT INTO concept_sources"),
      expect.arrayContaining(["test-id", "owner/repo", "owner", "repo"]),
    );
  });

  it("uses custom name when provided", async () => {
    mockExecute.mockResolvedValue(undefined);

    const result = await createGitHubSource({
      github_url: "https://github.com/owner/repo",
      name: "My Custom Source",
    });

    expect(result.success).toBe(true);
    expect(mockExecute).toHaveBeenCalledWith(
      {},
      expect.stringContaining("INSERT INTO concept_sources"),
      expect.arrayContaining(["My Custom Source"]),
    );
  });

  it("returns error for invalid URL", async () => {
    const result = await createGitHubSource({
      github_url: "not-a-github-url",
    });

    expect(result.success).toBe(false);
    expect(result.message).toBe("Invalid GitHub URL");
  });
});

describe("createMcpListSource", () => {
  it("creates an MCP list source", async () => {
    mockExecute.mockResolvedValue(undefined);

    const result = await createMcpListSource({
      name: "My MCP List",
      list_url: "https://example.com/list.json",
      description: "A list of MCP servers",
    });

    expect(result.success).toBe(true);
    expect(result.sourceId).toBe("test-id");
    expect(mockExecute).toHaveBeenCalledWith(
      {},
      expect.stringContaining("INSERT INTO concept_sources"),
      expect.arrayContaining(["test-id", "My MCP List", "A list of MCP servers"]),
    );
  });
});

describe("deleteConceptSource", () => {
  it("cannot delete built-in curated source", async () => {
    const result = await deleteConceptSource("__curated__");
    expect(result).toEqual({ success: false, message: "Cannot delete built-in source" });
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it("cannot delete built-in claude config source", async () => {
    const result = await deleteConceptSource("__claude_config__");
    expect(result).toEqual({ success: false, message: "Cannot delete built-in source" });
  });

  it("deletes a custom source and its concepts", async () => {
    mockExecute.mockResolvedValue(undefined);

    const result = await deleteConceptSource("custom-source");
    expect(result).toEqual({ success: true, message: "Source deleted" });
    // Should delete links, concepts, then source
    expect(mockExecute).toHaveBeenCalledTimes(3);
  });

  it("returns error on deletion failure", async () => {
    mockExecute.mockRejectedValue(new Error("DB constraint error"));

    const result = await deleteConceptSource("custom-source");
    expect(result).toEqual({ success: false, message: "DB constraint error" });
  });
});
