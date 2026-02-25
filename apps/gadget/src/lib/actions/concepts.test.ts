import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  getDb: vi.fn(() => ({})),
  queryAll: vi.fn(),
  queryOne: vi.fn(),
  execute: vi.fn(),
  parseJsonField: vi.fn((val, fallback) => {
    if (val === null || val === undefined) return fallback;
    if (typeof val === "string") {
      try {
        return JSON.parse(val);
      } catch {
        return fallback;
      }
    }
    return val;
  }),
}));
vi.mock("@/lib/utils", () => ({
  generateId: vi.fn(() => "test-id"),
}));
vi.mock("@/lib/constants", () => ({
  LIBRARY_REPO_ID: "__library__",
}));
vi.mock("node:fs", () => ({
  default: {
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    readFileSync: vi.fn(),
    existsSync: vi.fn(),
  },
}));
vi.mock("node:path", async () => {
  const actual = await vi.importActual("node:path");
  return actual;
});

import fs from "node:fs";
import { execute, queryAll, queryOne } from "@/lib/db";
import {
  getAllConcepts,
  getConceptStats,
  getConceptsForRepo,
  getLinkedConceptsForRepo,
  installConcept,
  linkConcept,
  syncConceptToRepo,
  unlinkConcept,
} from "./concepts";

const mockQueryAll = vi.mocked(queryAll);
const mockQueryOne = vi.mocked(queryOne);
const mockExecute = vi.mocked(execute);

beforeEach(() => {
  vi.resetAllMocks();
});

describe("getConceptsForRepo", () => {
  it("returns concepts with parsed metadata", async () => {
    mockQueryAll.mockResolvedValue([{ id: "1", name: "Skill A", concept_type: "skill", metadata: '{"key":"val"}' }]);

    const result = await getConceptsForRepo("repo-1");
    expect(result).toHaveLength(1);
    expect(result[0].metadata).toEqual({ key: "val" });
  });
});

describe("getAllConcepts", () => {
  it("returns deduplicated concepts with repo info", async () => {
    mockQueryAll.mockResolvedValue([
      {
        id: "1",
        name: "Skill A",
        concept_type: "skill",
        metadata: "{}",
        link_count: "3",
        source_id: null,
      },
    ]);

    const result = await getAllConcepts();
    expect(result).toHaveLength(1);
    expect(result[0].link_count).toBe(3);
  });
});

describe("getConceptStats", () => {
  it("returns counts by concept type", async () => {
    mockQueryAll.mockResolvedValue([
      { concept_type: "skill", count: 5 },
      { concept_type: "hook", count: 3 },
    ]);

    const result = await getConceptStats();
    expect(result).toEqual({ skill: 5, hook: 3 });
  });

  it("returns empty object when no concepts", async () => {
    mockQueryAll.mockResolvedValue([]);

    const result = await getConceptStats();
    expect(result).toEqual({});
  });
});

describe("linkConcept", () => {
  it("links a concept to a target repo", async () => {
    mockQueryOne
      .mockResolvedValueOnce({ id: "concept-1", repo_id: "__library__", name: "My Skill" }) // concept lookup
      .mockResolvedValueOnce({ id: "repo-1" }); // target repo lookup
    mockExecute.mockResolvedValue(undefined);

    const result = await linkConcept("concept-1", "repo-1");
    expect(result).toEqual({ success: true, message: 'Linked "My Skill" to repo' });
  });

  it("returns error when concept not found", async () => {
    mockQueryOne.mockResolvedValue(undefined);

    const result = await linkConcept("nonexistent", "repo-1");
    expect(result).toEqual({ success: false, message: "Concept not found" });
  });

  it("returns error when linking to origin repo", async () => {
    mockQueryOne.mockResolvedValue({ id: "concept-1", repo_id: "repo-1", name: "My Skill" });

    const result = await linkConcept("concept-1", "repo-1");
    expect(result).toEqual({ success: false, message: "Cannot link a concept to its origin repo" });
  });

  it("returns error when target repo not found", async () => {
    mockQueryOne
      .mockResolvedValueOnce({ id: "concept-1", repo_id: "__library__", name: "My Skill" })
      .mockResolvedValueOnce(undefined);

    const result = await linkConcept("concept-1", "nonexistent");
    expect(result).toEqual({ success: false, message: "Target repo not found" });
  });
});

describe("unlinkConcept", () => {
  it("unlinks a concept from a repo", async () => {
    mockExecute.mockResolvedValue(undefined);

    const result = await unlinkConcept("concept-1", "repo-1");
    expect(result).toEqual({ success: true, message: "Unlinked concept" });
    expect(mockExecute).toHaveBeenCalledWith({}, "DELETE FROM concept_links WHERE concept_id = ? AND repo_id = ?", [
      "concept-1",
      "repo-1",
    ]);
  });
});

describe("getLinkedConceptsForRepo", () => {
  it("returns linked concepts with parsed metadata", async () => {
    mockQueryAll.mockResolvedValue([
      {
        concept_id: "c-1",
        repo_id: "repo-1",
        concept_name: "Skill",
        concept_type: "skill",
        concept_metadata: '{"key":"val"}',
      },
    ]);

    const result = await getLinkedConceptsForRepo("repo-1");
    expect(result).toHaveLength(1);
    expect(result[0].concept_metadata).toEqual({ key: "val" });
  });
});

describe("syncConceptToRepo", () => {
  it("returns error when concept not found", async () => {
    mockQueryOne.mockResolvedValue(undefined);

    const result = await syncConceptToRepo("nonexistent", "repo-1");
    expect(result).toEqual({ success: false, message: "Concept not found" });
  });

  it("returns error when target repo not found", async () => {
    // getConceptById returns a concept
    mockQueryOne
      .mockResolvedValueOnce({
        id: "c-1",
        name: "My Skill",
        concept_type: "skill",
        relative_path: ".claude/commands/test.md",
        content: "content",
        metadata: "{}",
        link_count: 0,
        source_id: null,
      })
      .mockResolvedValueOnce(undefined); // target repo lookup

    const result = await syncConceptToRepo("c-1", "nonexistent");
    expect(result).toEqual({ success: false, message: "Target repo not found" });
  });

  it("syncs a skill concept to disk", async () => {
    mockQueryOne
      .mockResolvedValueOnce({
        id: "c-1",
        name: "My Skill",
        concept_type: "skill",
        relative_path: ".claude/commands/test.md",
        content: "skill content",
        metadata: "{}",
        link_count: 0,
        source_id: null,
      })
      .mockResolvedValueOnce({ local_path: "/target/repo" }); // target repo
    mockExecute.mockResolvedValue(undefined);

    const result = await syncConceptToRepo("c-1", "repo-1");
    expect(result.success).toBe(true);
    expect(fs.mkdirSync).toHaveBeenCalled();
    expect(fs.writeFileSync).toHaveBeenCalledWith("/target/repo/.claude/commands/test.md", "skill content", "utf-8");
  });

  it("syncs a hook concept to disk", async () => {
    mockQueryOne
      .mockResolvedValueOnce({
        id: "c-2",
        name: "My Hook",
        concept_type: "hook",
        relative_path: "",
        content: "",
        metadata: '{"hook_name":"PreCommit","config":{"command":"lint"}}',
        link_count: 0,
        source_id: null,
      })
      .mockResolvedValueOnce({ local_path: "/target/repo" });
    mockExecute.mockResolvedValue(undefined);
    vi.mocked(fs.readFileSync).mockImplementation(() => {
      throw new Error("ENOENT");
    });

    const result = await syncConceptToRepo("c-2", "repo-1");
    expect(result.success).toBe(true);
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      "/target/repo/.claude/settings.json",
      expect.stringContaining("PreCommit"),
      "utf-8",
    );
  });

  it("syncs an mcp_server concept to disk", async () => {
    mockQueryOne
      .mockResolvedValueOnce({
        id: "c-3",
        name: "My MCP",
        concept_type: "mcp_server",
        relative_path: "",
        content: "",
        metadata: '{"server_name":"my-server","config":{"url":"http://localhost"}}',
        link_count: 0,
        source_id: null,
      })
      .mockResolvedValueOnce({ local_path: "/target/repo" });
    mockExecute.mockResolvedValue(undefined);
    vi.mocked(fs.readFileSync).mockImplementation(() => {
      throw new Error("ENOENT");
    });

    const result = await syncConceptToRepo("c-3", "repo-1");
    expect(result.success).toBe(true);
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      "/target/repo/.mcp.json",
      expect.stringContaining("my-server"),
      "utf-8",
    );
  });

  it("syncs a plugin concept to disk", async () => {
    mockQueryOne
      .mockResolvedValueOnce({
        id: "c-4",
        name: "My Plugin",
        concept_type: "plugin",
        relative_path: "",
        content: '{"name":"test"}',
        metadata: "{}",
        link_count: 0,
        source_id: null,
      })
      .mockResolvedValueOnce({ local_path: "/target/repo" });
    mockExecute.mockResolvedValue(undefined);

    const result = await syncConceptToRepo("c-4", "repo-1");
    expect(result.success).toBe(true);
    expect(fs.mkdirSync).toHaveBeenCalledWith("/target/repo/.claude-plugin", { recursive: true });
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      "/target/repo/.claude-plugin/plugin.json",
      '{"name":"test"}',
      "utf-8",
    );
  });

  it("returns error when write fails", async () => {
    mockQueryOne
      .mockResolvedValueOnce({
        id: "c-1",
        name: "My Skill",
        concept_type: "skill",
        relative_path: ".claude/commands/test.md",
        content: "content",
        metadata: "{}",
        link_count: 0,
        source_id: null,
      })
      .mockResolvedValueOnce({ local_path: "/target/repo" });
    vi.mocked(fs.mkdirSync).mockImplementation(() => {
      throw new Error("Permission denied");
    });

    const result = await syncConceptToRepo("c-1", "repo-1");
    expect(result).toEqual({ success: false, message: "Permission denied" });
  });
});

describe("installConcept", () => {
  it("returns link error when link fails", async () => {
    mockQueryOne.mockResolvedValue(undefined); // concept not found → link fails

    const result = await installConcept("nonexistent", "repo-1");
    expect(result).toEqual({ success: false, message: "Concept not found" });
  });

  it("links and syncs on success", async () => {
    // linkConcept: concept lookup, repo not origin, target repo lookup
    mockQueryOne
      .mockResolvedValueOnce({ id: "c-1", repo_id: "__library__", name: "Skill" }) // link: concept
      .mockResolvedValueOnce({ id: "repo-1" }) // link: target repo
      .mockResolvedValueOnce({
        id: "c-1",
        name: "Skill",
        concept_type: "skill",
        relative_path: ".claude/commands/s.md",
        content: "content",
        metadata: "{}",
        link_count: 0,
        source_id: null,
      }) // sync: getConceptById
      .mockResolvedValueOnce({ local_path: "/repo" }); // sync: target repo
    mockExecute.mockResolvedValue(undefined);

    const result = await installConcept("c-1", "repo-1");
    expect(result.success).toBe(true);
  });
});
