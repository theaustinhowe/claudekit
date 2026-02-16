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

import { execute, queryAll, queryOne } from "@/lib/db";
import {
  getAllConcepts,
  getConceptStats,
  getConceptsForRepo,
  getLinkedConceptsForRepo,
  linkConcept,
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
