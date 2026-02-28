import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  getDb: vi.fn().mockResolvedValue({}),
  execute: vi.fn(),
  queryAll: vi.fn(),
  queryOne: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  createServiceLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock("node:fs/promises", () => ({
  default: {
    mkdir: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("node:os", () => ({
  default: {
    homedir: () => "/mock-home",
  },
}));

import fs from "node:fs/promises";
import { execute, getDb, queryAll, queryOne } from "@/lib/db";
import {
  createSkillGroup,
  deleteSkillGroup,
  exportSkillGroupAsFiles,
  getSkillGroupPreview,
  getSkillGroups,
  updateSkillGroup,
} from "./skill-groups";

const mockGetDb = vi.mocked(getDb);
const mockExecute = vi.mocked(execute);
const mockQueryAll = vi.mocked(queryAll);
const mockQueryOne = vi.mocked(queryOne);
const mockMkdir = vi.mocked(fs.mkdir);
const mockWriteFile = vi.mocked(fs.writeFile);

describe("skill-groups actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDb.mockResolvedValue({} as Awaited<ReturnType<typeof getDb>>);
  });

  describe("getSkillGroups", () => {
    it("returns mapped skill groups ordered by name", async () => {
      mockQueryAll.mockResolvedValue([
        {
          id: "g1",
          name: "Error Handling",
          category: "quality",
          description: "Skills about error handling",
          created_at: "2025-01-01T00:00:00Z",
          updated_at: "2025-01-02T00:00:00Z",
          skill_count: 3,
        },
        {
          id: "g2",
          name: "Testing",
          category: "testing",
          description: null,
          created_at: "2025-01-03T00:00:00Z",
          updated_at: "2025-01-04T00:00:00Z",
          skill_count: 0,
        },
      ]);

      const result = await getSkillGroups();

      expect(result).toEqual([
        {
          id: "g1",
          name: "Error Handling",
          category: "quality",
          description: "Skills about error handling",
          createdAt: "2025-01-01T00:00:00Z",
          updatedAt: "2025-01-02T00:00:00Z",
          skillCount: 3,
        },
        {
          id: "g2",
          name: "Testing",
          category: "testing",
          description: null,
          createdAt: "2025-01-03T00:00:00Z",
          updatedAt: "2025-01-04T00:00:00Z",
          skillCount: 0,
        },
      ]);
      expect(mockQueryAll).toHaveBeenCalledWith({}, expect.stringContaining("FROM skill_groups sg"));
    });

    it("returns empty array when no groups exist", async () => {
      mockQueryAll.mockResolvedValue([]);

      const result = await getSkillGroups();
      expect(result).toEqual([]);
    });
  });

  describe("getSkillGroupPreview", () => {
    it("returns skill markdown previews for a group", async () => {
      // getSkillGroup calls queryOne then queryAll
      mockQueryOne.mockResolvedValue({
        id: "g1",
        name: "Error Handling",
        category: "quality",
        description: "Skills about errors",
        created_at: "2025-01-01",
        updated_at: "2025-01-02",
      });
      mockQueryAll.mockResolvedValue([
        {
          id: "s1",
          name: "Try-Catch",
          severity: "blocking",
          description: "Always use try-catch",
          rule_content: "Wrap async calls in try-catch blocks.",
          frequency: 5,
          analysis_id: "a1",
        },
      ]);

      const result = await getSkillGroupPreview("g1");

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("Try-Catch");
      expect(result[0].content).toContain("name: quality-Try-Catch");
      expect(result[0].content).toContain("description: Always use try-catch");
      expect(result[0].content).toContain("Wrap async calls in try-catch blocks.");
    });

    it("returns empty array when group not found", async () => {
      mockQueryOne.mockResolvedValue(null);

      const result = await getSkillGroupPreview("nonexistent");
      expect(result).toEqual([]);
    });

    it("uses fallback text when description or rule_content is null", async () => {
      mockQueryOne.mockResolvedValue({
        id: "g1",
        name: "Test Group",
        category: "testing",
        description: null,
        created_at: "2025-01-01",
        updated_at: "2025-01-02",
      });
      mockQueryAll.mockResolvedValue([
        {
          id: "s1",
          name: "Skill-No-Content",
          severity: "nit",
          description: null,
          rule_content: null,
          frequency: 1,
          analysis_id: "a1",
        },
      ]);

      const result = await getSkillGroupPreview("g1");

      expect(result[0].content).toContain("description: No description");
      expect(result[0].content).toContain("No rule content generated.");
    });
  });

  describe("createSkillGroup", () => {
    it("inserts a new skill group and returns it", async () => {
      const result = await createSkillGroup("Error Handling", "quality", "Skills about errors");

      expect(mockExecute).toHaveBeenCalledWith(
        {},
        expect.stringContaining("INSERT INTO skill_groups"),
        expect.arrayContaining(["Error Handling", "quality", "Skills about errors"]),
      );
      expect(result.name).toBe("Error Handling");
      expect(result.category).toBe("quality");
      expect(result.description).toBe("Skills about errors");
      expect(result.skillCount).toBe(0);
      expect(result.id).toBeDefined();
      expect(result.createdAt).toBeDefined();
      expect(result.updatedAt).toBeDefined();
    });

    it("sets description to null when not provided", async () => {
      const result = await createSkillGroup("Testing", "testing");

      expect(mockExecute).toHaveBeenCalledWith(
        {},
        expect.stringContaining("INSERT INTO skill_groups"),
        expect.arrayContaining(["Testing", "testing", null]),
      );
      expect(result.description).toBeNull();
    });
  });

  describe("updateSkillGroup", () => {
    it("updates the skill group in the database", async () => {
      await updateSkillGroup("g1", "New Name", "new-category", "Updated description");

      expect(mockExecute).toHaveBeenCalledWith(
        {},
        expect.stringContaining("UPDATE skill_groups SET"),
        expect.arrayContaining(["New Name", "new-category", "Updated description", "g1"]),
      );
    });

    it("sets description to null when not provided", async () => {
      await updateSkillGroup("g1", "Name", "category");

      const params = mockExecute.mock.calls[0][2] as unknown[];
      expect(params).toContain(null);
    });
  });

  describe("deleteSkillGroup", () => {
    it("orphans skills then deletes the group", async () => {
      mockQueryOne.mockResolvedValue({ cnt: 3 });

      const result = await deleteSkillGroup("g1");

      expect(result).toEqual({ orphanedSkills: 3 });
      // First call: UPDATE skills SET group_id = NULL
      expect(mockExecute).toHaveBeenCalledWith({}, expect.stringContaining("UPDATE skills SET group_id = NULL"), [
        "g1",
      ]);
      // Second call: DELETE FROM skill_groups
      expect(mockExecute).toHaveBeenCalledWith({}, expect.stringContaining("DELETE FROM skill_groups"), ["g1"]);
    });

    it("returns 0 orphaned skills when group has no skills", async () => {
      mockQueryOne.mockResolvedValue({ cnt: 0 });

      const result = await deleteSkillGroup("g1");
      expect(result).toEqual({ orphanedSkills: 0 });
    });

    it("returns 0 orphaned skills when count query returns null", async () => {
      mockQueryOne.mockResolvedValue(null);

      const result = await deleteSkillGroup("g1");
      expect(result).toEqual({ orphanedSkills: 0 });
    });
  });

  describe("exportSkillGroupAsFiles", () => {
    it("exports skills to global directory", async () => {
      mockQueryOne.mockResolvedValue({
        id: "g1",
        name: "Quality",
        category: "quality",
        description: null,
        created_at: "2025-01-01",
        updated_at: "2025-01-02",
      });
      mockQueryAll.mockResolvedValue([
        {
          id: "s1",
          name: "Error-Handling",
          severity: "blocking",
          description: "Handle errors properly",
          rule_content: "Always use try-catch.",
          frequency: 5,
          analysis_id: "a1",
        },
      ]);

      const result = await exportSkillGroupAsFiles("g1", "global");

      expect(result.filesWritten).toBe(1);
      expect(result.directory).toBe("/mock-home/.claude/skills/quality");
      expect(mockMkdir).toHaveBeenCalledWith("/mock-home/.claude/skills/quality", { recursive: true });
      expect(mockWriteFile).toHaveBeenCalledWith(
        "/mock-home/.claude/skills/quality/Error-Handling.md",
        expect.stringContaining("Always use try-catch."),
        "utf-8",
      );
    });

    it("exports skills to local project directory", async () => {
      mockQueryOne.mockResolvedValue({
        id: "g1",
        name: "Testing",
        category: "testing",
        description: null,
        created_at: "2025-01-01",
        updated_at: "2025-01-02",
      });
      mockQueryAll.mockResolvedValue([
        {
          id: "s1",
          name: "Unit-Tests",
          severity: "suggestion",
          description: "Write unit tests",
          rule_content: "Every module should have tests.",
          frequency: 3,
          analysis_id: "a1",
        },
      ]);

      const result = await exportSkillGroupAsFiles("g1", "local", "/my/project");

      expect(result.filesWritten).toBe(1);
      expect(result.directory).toBe("/my/project/.claude/skills/testing");
      expect(mockMkdir).toHaveBeenCalledWith("/my/project/.claude/skills/testing", { recursive: true });
    });

    it("throws error when group is not found", async () => {
      mockQueryOne.mockResolvedValue(null);

      await expect(exportSkillGroupAsFiles("nonexistent", "global")).rejects.toThrow("Skill group not found");
    });

    it("throws error when local export is missing projectPath", async () => {
      mockQueryOne.mockResolvedValue({
        id: "g1",
        name: "Quality",
        category: "quality",
        description: null,
        created_at: "2025-01-01",
        updated_at: "2025-01-02",
      });
      mockQueryAll.mockResolvedValue([]);

      await expect(exportSkillGroupAsFiles("g1", "local")).rejects.toThrow("Project path required for local export");
    });

    it("skips skills without rule_content", async () => {
      mockQueryOne.mockResolvedValue({
        id: "g1",
        name: "Mixed",
        category: "mixed",
        description: null,
        created_at: "2025-01-01",
        updated_at: "2025-01-02",
      });
      mockQueryAll.mockResolvedValue([
        {
          id: "s1",
          name: "Has-Content",
          severity: "blocking",
          description: "Has rule",
          rule_content: "Some rule content",
          frequency: 2,
          analysis_id: "a1",
        },
        {
          id: "s2",
          name: "No-Content",
          severity: "nit",
          description: "No rule",
          rule_content: null,
          frequency: 1,
          analysis_id: "a1",
        },
      ]);

      const result = await exportSkillGroupAsFiles("g1", "global");

      expect(result.filesWritten).toBe(1);
      expect(mockWriteFile).toHaveBeenCalledTimes(1);
    });
  });
});
